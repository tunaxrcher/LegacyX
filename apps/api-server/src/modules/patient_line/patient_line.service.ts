/**
 * Patient LINE Binding Service.
 *
 * Implements the self-link flow from the patient app → LINE Login OAuth 2.0
 * (with PKCE). Once bound, the worker-engine's notification dispatcher can
 * push LINE Messaging API messages to the patient.
 *
 * Flow:
 *   1. Patient (logged-in via Phone+OTP) hits `linkStart` → we issue a 32-byte
 *      `state`, generate a PKCE verifier+challenge, persist to
 *      `PatientLineLinkState`, and return the `authorize_url` that the client
 *      browser must redirect to.
 *   2. LINE redirects the user back to `linkCallback?code=...&state=...`. We
 *      load the state row, validate ownership + TTL + not-consumed, exchange
 *      the code for an access_token (PKCE verifier), fetch the LINE profile
 *      (`userId`, `displayName`, `pictureUrl`), and bind the row.
 *   3. We mark the state row consumed (one-shot).
 *
 * Hard rules:
 *   - `lineUserId` is unique scoped per tenant (DB constraint) — caller
 *     must be ready to catch `Conflict` on race.
 *   - We surface a deliberately vague "already linked" error so a leaked
 *     userId cannot be probed for clinic membership.
 *   - Every state row carries the patient that initiated the flow; callback
 *     must originate from the SAME patient session (anti-CSRF).
 */

import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, prisma } from "@legacyx/db";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import type { PatientRequestContext } from "../../shared/patientContext";

const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";

/** TTL for an OAuth state row. After this, callback fails. */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/**
 * Path on the **patient-app** (NOT api-server) that LINE redirects to. The
 * page lives on the patient-app because that's where the session cookie is
 * scoped; the page then server-side calls api-server to complete the bind.
 */
const CALLBACK_PATH = "/profile/line-callback";

// =============================================================================
// Helpers — PKCE
// =============================================================================

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(48));
  const challenge = base64UrlEncode(
    createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

function getCallbackUrl(): string {
  const base = process.env.PATIENT_APP_BASE_URL ?? "http://localhost:3004";
  return `${base.replace(/\/$/, "")}${CALLBACK_PATH}`;
}

function getOAuthConfig(): { channelId: string; channelSecret: string } {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET ?? "";
  if (!channelId || !channelSecret) {
    throw BadRequest(
      "LINE Login is not configured on this server. Please contact the clinic.",
    );
  }
  return { channelId, channelSecret };
}

// =============================================================================
// linkStart — patient kicks off the OAuth dance
// =============================================================================

/**
 * Start the LINE binding flow. Returns an `authorize_url` the client must
 * redirect to (window.location). State + PKCE verifier are persisted server-
 * side; the client never sees the verifier.
 */
export async function linkStart(ctx: PatientRequestContext): Promise<{
  authorize_url: string;
  state: string;
  expires_at: string;
}> {
  const { channelId } = getOAuthConfig();

  // Optional: short-circuit if the patient already has a binding. We DON'T
  // hard-reject — re-link is allowed (covers "switched LINE account"). The
  // actual binding happens on callback so a stale start can't damage state.

  const state = generateState();
  const { verifier, challenge } = generatePkce();
  const redirectUri = getCallbackUrl();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await prisma.patientLineLinkState.create({
    data: {
      state,
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      codeVerifier: verifier,
      redirectUri,
      expiresAt,
    },
  });

  const url = new URL(LINE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // bot_prompt=aggressive: LINE shows the "Add ${bot} as a friend" checkbox
  // pre-ticked on the consent screen, dramatically improving push delivery.
  url.searchParams.set("bot_prompt", "aggressive");

  return {
    authorize_url: url.toString(),
    state,
    expires_at: expiresAt.toISOString(),
  };
}

// =============================================================================
// linkCallback — LINE redirects back with ?code=&state=
// =============================================================================

export const LinkCallbackDto = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

type LineTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type LineProfileResponse = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

export async function linkCallback(
  ctx: PatientRequestContext,
  input: z.infer<typeof LinkCallbackDto>,
): Promise<{
  line_user_id: string;
  line_display_name: string;
  line_picture_url: string | null;
  line_linked_at: string;
}> {
  const { channelId, channelSecret } = getOAuthConfig();

  // 1. Look up state row + validate ownership / TTL / one-shot.
  const stateRow = await prisma.patientLineLinkState.findUnique({
    where: { state: input.state },
  });
  if (!stateRow) throw NotFound("OAuth state not found or expired.");
  if (stateRow.consumedAt) throw BadRequest("This link request was already used.");
  if (stateRow.expiresAt.getTime() < Date.now()) {
    throw BadRequest("This link request expired. Please try again.");
  }
  if (
    stateRow.patientId !== ctx.patientId ||
    stateRow.tenantId !== ctx.tenantId
  ) {
    // Anti-CSRF: the callback must originate from the SAME patient who
    // started the flow.
    throw BadRequest("This link request does not belong to your account.");
  }

  // 2. Exchange code for access token (with PKCE verifier).
  const tokenForm = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: stateRow.redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
    code_verifier: stateRow.codeVerifier,
  });
  const tokenRes = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenForm.toString(),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw BadRequest(
      `LINE token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`,
    );
  }
  const tokenJson = (await tokenRes.json()) as LineTokenResponse;

  // 3. Fetch profile.
  const profRes = await fetch(LINE_PROFILE_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profRes.ok) {
    const body = await profRes.text().catch(() => "");
    throw BadRequest(
      `LINE profile fetch failed (${profRes.status}): ${body.slice(0, 200)}`,
    );
  }
  const profile = (await profRes.json()) as LineProfileResponse;
  if (!profile.userId) {
    throw BadRequest("LINE profile did not include a userId");
  }

  // 4. Pre-flight: same userId already bound to another Patient in this
  //    tenant? Reject HARD — the user must contact reception to merge or
  //    unbind the other account. (This is also enforced by the UNIQUE
  //    constraint below, but we want a friendlier error message.)
  const existing = await prisma.patient.findFirst({
    where: {
      tenantId: ctx.tenantId,
      lineUserId: profile.userId,
      id: { not: ctx.patientId },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    throw Conflict(
      "This LINE account is already linked to another patient profile. Please contact reception.",
    );
  }

  const now = new Date();

  // 5. Bind + mark state consumed + audit, in one transaction.
  try {
    await prisma.$transaction(async (tx) => {
      // If this patient was previously bound to a DIFFERENT LINE account,
      // record the unlink audit before overwriting (rebind support).
      const current = await tx.patient.findUnique({
        where: { id: ctx.patientId },
        select: { lineUserId: true },
      });
      if (current?.lineUserId && current.lineUserId !== profile.userId) {
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            action: "patient.line.unlink",
            resourceType: "Patient",
            resourceId: ctx.patientId,
            correlationId: ctx.correlationId,
            after: {
              previous_line_user_id: current.lineUserId,
              reason: "rebind",
            } as object,
          },
        });
      }

      await tx.patient.update({
        where: { id: ctx.patientId },
        data: {
          lineUserId: profile.userId,
          lineDisplayName: profile.displayName ?? null,
          linePictureUrl: profile.pictureUrl ?? null,
          lineLinkedAt: now,
          // Re-binding resets the friend-state cache; we don't yet know if
          // they added the OA as a friend.
          lineFriendStatus: "UNKNOWN",
          // Don't change opt-in on rebind: if the user had it off they
          // probably want it to stay off.
        },
      });

      await tx.patientLineLinkState.update({
        where: { state: input.state },
        data: { consumedAt: now },
      });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          action: "patient.line.link",
          resourceType: "Patient",
          resourceId: ctx.patientId,
          correlationId: ctx.correlationId,
          after: {
            line_user_id: profile.userId,
            display_name: profile.displayName,
            channel: "LINE_LOGIN_OAUTH",
          } as object,
        },
      });
    });
  } catch (err) {
    // P2002 = unique constraint race (someone else bound the same userId
    // in the gap between our pre-check and write).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw Conflict(
        "This LINE account is already linked to another patient profile. Please contact reception.",
      );
    }
    throw err;
  }

  return {
    line_user_id: profile.userId,
    line_display_name: profile.displayName,
    line_picture_url: profile.pictureUrl ?? null,
    line_linked_at: now.toISOString(),
  };
}

// =============================================================================
// unlink — patient revokes the binding
// =============================================================================

export async function linkUnlink(ctx: PatientRequestContext): Promise<{
  unlinked: boolean;
}> {
  const patient = await prisma.patient.findFirst({
    where: { id: ctx.patientId, tenantId: ctx.tenantId },
    select: { lineUserId: true },
  });
  if (!patient) throw NotFound("Patient profile not found");
  if (!patient.lineUserId) return { unlinked: false };

  await prisma.$transaction(async (tx) => {
    await tx.patient.update({
      where: { id: ctx.patientId },
      data: {
        lineUserId: null,
        lineDisplayName: null,
        linePictureUrl: null,
        lineLinkedAt: null,
        lineFriendStatus: "UNKNOWN",
        // Reset opt-in to default (true) so a future re-link works without
        // an extra toggle click.
        lineNotificationsOptIn: true,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        action: "patient.line.unlink",
        resourceType: "Patient",
        resourceId: ctx.patientId,
        correlationId: ctx.correlationId,
        after: {
          previous_line_user_id: patient.lineUserId,
          reason: "patient_self_unlink",
        } as object,
      },
    });
  });

  return { unlinked: true };
}

// =============================================================================
// preferences — toggle LINE opt-in
// =============================================================================

export const UpdateNotificationPrefsDto = z.object({
  line_opt_in: z.boolean(),
});

export async function updateNotificationPrefs(
  ctx: PatientRequestContext,
  input: z.infer<typeof UpdateNotificationPrefsDto>,
): Promise<{ line_notifications_opt_in: boolean }> {
  await prisma.patient.update({
    where: { id: ctx.patientId },
    data: { lineNotificationsOptIn: input.line_opt_in },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      action: "patient.line.prefs",
      resourceType: "Patient",
      resourceId: ctx.patientId,
      correlationId: ctx.correlationId,
      after: { line_opt_in: input.line_opt_in } as object,
    },
  });
  return { line_notifications_opt_in: input.line_opt_in };
}
