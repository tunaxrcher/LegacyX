# ADR-0008 — Patient self-link via LINE Login OAuth (not LIFF userId capture)

- **Status:** Accepted (Phase J, 2026-05)
- **Related:** ADR-0001 (event-driven monolith), ADR-0005 (ABAC & encryption),
  ADR-0007 (Identity v2 — Phone+OTP), `docs/NOTIFICATIONS.md`

## Context

Phase 8 shipped a working LINE Messaging API push pipeline (worker-engine
dispatcher, retry, DLQ). It assumed every `Patient` row already had a
`lineUserId` column populated. In reality, **`lineUserId` was empty for
~95% of patient rows** because:

1. The patient-app's original LIFF-forced flow was removed in Phase G in
   favour of a guest browse experience. New patients register via phone +
   KYC, never enter LIFF, so we never get their LINE userId.
2. The existing LIFF flow (still available) capped `lineUserId` only for
   patients who *chose* to log in via LINE on `/profile`. That's a
   minority of LIFF visitors and zero of the guest-flow registrants.
3. Even for LIFF-captured rows we had no record of whether the patient
   actually *wanted* clinic notifications — silently pushing felt
   PDPA-aggressive.

Pain point: clinic owner set `LINE_CHANNEL_ACCESS_TOKEN`, expected the
"appointment confirmed" message to land on the patient's phone, and got
`Could not resolve LINE recipient` errors in the dispatcher log.

We need an **explicit, patient-initiated bind step** that:

- Works from any device (LIFF in-browser **or** desktop browser **or**
  patient-app PWA on a non-LINE OS).
- Captures a stable `lineUserId` we can push to.
- Captures an explicit *opt-in* flag so the patient controls whether they
  want clinic notifications.
- Is dedupable per-tenant (one LINE id can't belong to two patient rows).
- Is unbindable (patient revokes → we stop sending).

## Decision

**Patient self-link via LINE Login OAuth 2.0 + PKCE, with explicit
opt-in stored as a separate column.**

### Why OAuth (not LIFF-only)

| Aspect | LIFF only (rejected) | LINE Login OAuth (chosen) |
|---|---|---|
| Works on non-LINE browsers | ❌ (LIFF requires LINE app) | ✅ |
| Works in our PWA outside LINE | ❌ | ✅ |
| Standard OAuth flow well-understood by devs | ❌ (LIFF SDK quirks) | ✅ |
| Independent of the Messaging API channel | n/a | ✅ (separate "LINE Login" channel in console) |
| Returns stable `userId` | ✅ | ✅ |
| Captures display name + picture | ✅ | ✅ (extra `openid` claim) |
| Cancel/retry UX | clunky inside LIFF | Standard browser redirect |

LIFF is **kept** as the auth source for the existing LIFF-launched booking
flow — but the patient profile's "Bind LINE" button always goes through
the OAuth path so the same code works for everyone.

### Why explicit opt-in column

`Patient.lineUserId` existing ≠ "patient wants notifications". A patient
who logged in via LIFF to *view* their wallet didn't necessarily consent
to push messages.

Schema:

```prisma
model Patient {
  // ...existing fields...

  lineUserId               String?           // OAuth-captured stable id
  lineDisplayName          String?           // for UI only
  linePictureUrl           String?           // for UI only
  lineLinkedAt             DateTime?         // audit
  lineNotificationsOptIn   Boolean?          // null = not-set, true = opted, false = explicitly muted
  lineFriendStatus         LineFriendStatus? // UNKNOWN / FRIENDED / BLOCKED — set by dispatcher's 403 feedback

  @@unique([tenantId, lineUserId])           // dedupe per tenant
}

enum LineFriendStatus { UNKNOWN FRIENDED BLOCKED }
```

The notification dispatcher's `resolveRecipient`:

```ts
if (channel === "LINE") {
  if (!patient.lineUserId) return null;
  if (patient.lineNotificationsOptIn === false) return null;
  // ...
}
```

The `!== false` check (not `=== true`) means: patients linked before this
column existed default to opted-in. Explicit unlink sets it to `null` AND
clears `lineUserId`, so the first check fails too.

### Schema additions for OAuth state

```prisma
model PatientLineLinkState {
  id            String   @id
  tenantId      String
  patientId     String
  state         String   @unique  // CSRF token, returned to LINE
  codeVerifier  String              // PKCE verifier
  redirectTo    String?             // post-callback landing route
  createdAt     DateTime @default(now())
  expiresAt     DateTime            // start + 10 min

  @@index([tenantId, patientId])
}
```

Single-use: deleted on first callback success.

### OAuth flow shape

```
patient-app /profile (authed)
  ├─► [Bind LINE] click
  │     POST /api/line/start  (patient-app proxy)
  │       → api-server POST /api/v1/patient/me/line/link/start
  │         • generate { state, code_verifier, code_challenge }
  │         • upsert PatientLineLinkState (TTL 10m)
  │         • return authorize URL
  │
  ├─► browser redirect to access.line.me/oauth2/v2.1/authorize
  │     response_type=code&client_id=...&redirect_uri=.../profile/line-callback
  │     &state=<csrf>&scope=profile+openid&code_challenge=<sha256>
  │
  ├─► patient consents on LINE
  │
  └─► patient-app /profile/line-callback?code=…&state=…
        POST /api/line/callback  (patient-app proxy)
          → api-server POST /api/v1/patient/me/line/link/callback
            • find PatientLineLinkState by state (404 if expired/missing)
            • POST api.line.me/oauth2/v2.1/token (with code_verifier)
            • GET api.line.me/v2/profile → { userId, displayName, pictureUrl }
            • assert no other Patient in same tenant has this userId
                → 409 LINE_ALREADY_BOUND otherwise
            • prisma.patient.update — set all 5 line* columns
            • AuditLog(action="line.linked")
            • delete PatientLineLinkState row
          → 200 { linked: true }
        → /profile (refresh)
```

### Why PKCE on a confidential-client OAuth

LINE Login channels are confidential (server has the client secret), so
PKCE is **technically optional**. We add it anyway because:

1. The first leg of the redirect happens in the patient's browser — if
   their browser is compromised by a malicious extension, the `code` can be
   intercepted. PKCE makes the code unredeemable without the verifier
   that never left our server.
2. Cost is one extra DB row + a SHA-256 hash. Cheap.

## Trade-offs considered & rejected

| Alternative | Why rejected |
|---|---|
| Capture `lineUserId` silently inside the LIFF SDK | Inconsistent — wouldn't reach desktop/non-LINE users. Also captures without explicit consent (PDPA risk). |
| Reuse the patient phone-OTP login as the bind signal | Phone OTP doesn't yield a LINE userId; the two systems are orthogonal. |
| Bot QR + add-friend flow | UX painful (manual QR scan), no easy way to tie back to the right Patient row, gives us add-friend status but not a permanent userId until the patient sends a message. |
| Use a single LINE channel for both Login + Messaging | LINE doesn't allow it — Login channels can't send pushes, Messaging channels can't do OAuth. Two channels with two sets of env vars is the only path. |

## Consequences

### Positive

- **One bind path that works everywhere.** Same code for LIFF / PWA /
  desktop browser.
- **PDPA-clean opt-in:** explicit consent, explicit revoke.
- **Dispatcher cleaner:** `resolveRecipient` is a 3-line ladder.
- **Cron jobs cheaper:** CRM + appointment-reminder pre-check
  `lineNotificationsOptIn` so they don't spam `notification_log` with
  rows that will only ever fail-permanent.
- **`lineFriendStatus` feedback loop:** when LINE returns 403 (patient
  blocked the OA), the provider feeds that back to the dispatcher which
  updates the column. UI surfaces "Re-add our OA as a friend".

### Negative

- **Two LINE channels to configure** (Login + Messaging). Operators must
  set 4 env vars instead of 2.
- **Callback URL needs whitelisting** in LINE Developers Console — a
  per-deploy step. Documented in `docs/NOTIFICATIONS.md` § 3.
- **PatientLineLinkState rows can leak** if the patient abandons the OAuth
  redirect. Mitigated by 10-min TTL + a cleanup cron is open tech-debt.

### Neutral

- Existing LIFF-captured `lineUserId` rows continue to work — they just
  pre-date the `lineNotificationsOptIn` column, so they're treated as
  opted-in (via the `!== false` check).
- Adds 5 columns to `Patient` (4 nullable strings + 1 boolean + 1 enum).

## Bug guards (built-in)

1. `@@unique([tenantId, lineUserId])` — same LINE id can't be bound to
   two patients in the same tenant.
2. `PatientLineLinkState.state` is `@unique` and single-use — replay
   attacks die at the DB.
3. `linkCallback` returns 409 `LINE_ALREADY_BOUND` if the userId is
   already on another patient in the tenant; UI tells the user to log in
   to that account or unbind it first.
4. PKCE `S256` — authorization code interception protection.
5. `linkUnlink` clears **both** `lineUserId` AND `lineNotificationsOptIn`.
   Toggling opt-in keeps the bind; unbinding kills both.
6. The opt-in toggle and unlink are separate endpoints with separate
   audit log actions (`line.opt_in_toggled` vs `line.unlinked`).

## Operational notes for AI agents / future devs

- **Two LINE channels, two purposes:**
  - Messaging API channel → `LINE_CHANNEL_ACCESS_TOKEN`,
    `LINE_CHANNEL_SECRET`. Used by worker-engine push.
  - Login channel → `LINE_LOGIN_CHANNEL_ID`,
    `LINE_LOGIN_CHANNEL_SECRET`. Used by api-server's OAuth flow.
  - Don't reuse credentials across them — LINE will reject silently.
- **Callback URL** must be `{PATIENT_APP_BASE_URL}/profile/line-callback`
  in BOTH the LINE Developer Console (whitelisted) and the patient-app
  routing (page exists). Mismatch = `Invalid redirect_uri` from LINE.
- **`PatientLineLinkState` is ephemeral** — don't query it from
  reporting; it represents a half-done OAuth handshake, nothing more.
- **Provider env var naming:** `NOTIFICATION_LINE_PROVIDER` selects the
  push provider, not the Login provider. Don't confuse with channel
  credentials.
- **Patient cancel via LINE = soft signal.** If LINE returns 403, the
  patient may still appear "linked" in our DB. Dispatcher updates
  `lineFriendStatus = "BLOCKED"`. The UI banner asks them to re-add the
  OA. We don't auto-unbind because the userId is still useful if they
  re-friend.

## Open questions for v3

- **Cleanup cron** for orphan `PatientLineLinkState` rows older than
  TTL? Currently relies on the unique constraint preventing new
  collisions, but the rows accumulate forever.
- **Per-template opt-in granularity?** Right now `lineNotificationsOptIn`
  is global — patient can't say "yes to reminders, no to marketing".
  Probably a 2027 problem; v1 is global on/off.
- **Webhook for unfriend events.** LINE Messaging API can webhook us on
  unfriend; we could update `lineFriendStatus` proactively instead of
  waiting for the next push to 403. Requires standing up a webhook
  endpoint, not yet justified.
