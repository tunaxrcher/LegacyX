# Conventions

> Deeper-than-AGENTS.md reference for code-style decisions. AGENTS.md is the
> one-pager; this is the "why" behind it.

## TypeScript

- **Target**: `ES2022`, `strict: true`. No `any` unless it's at an external
  boundary and you cast immediately on the next line.
- **No barrel re-exports** of unrelated symbols. `index.ts` re-exports only
  the package's public surface (see `packages/db/src/index.ts`).
- **`import type`** for type-only imports (helps TS treeshake + clarifies intent).
- **`as const`** liberally for literal-typed maps (event names, role codes).

## API routes

Every route handler in `apps/api-server/src/app/api/v1/**/route.ts` follows
this skeleton:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { FooDto, foo } from "../../../../modules/foo/foo.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const input = FooDto.parse(await req.json());
    const data = await foo(ctx, input);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
```

Deviations require comment + reason. Don't reach for `res.status(...).json(...)`
shapes — `NextResponse.json({ data, ... })` is the wire shape and clients depend on it.

### Probe / metrics endpoints

`/api/healthz`, `/api/readyz`, `/api/metrics`, `/api/dev/identities`, and the
`/api/v1/public/*` namespace are **intentionally** exempt from `getRequestContext`
+ `authorize`. Don't try to "standardize" them.

## Services (`modules/<domain>/<domain>.service.ts`)

- Export `*Dto` Zod schemas at the top, then service functions.
- All functions take `ctx: RequestContext` as the first parameter.
- Authorise at the top of the function (`await authorize(ctx, {...})`).
- Use `prisma.$transaction()` for multi-write changes that must atomically
  succeed or fail together.
- Domain events go out via `writeWithOutbox()` inside the transaction.

## IDs

| Use case | What to use | Why |
|---|---|---|
| Domain entity primary keys (Visit, Order, …) | Prisma `@id @default(cuid())` | DB-managed |
| New audit-log / outbox / session row created in app code | `ulid()` from `ulid` | Sortable + URL-safe |
| One-shot HTTP correlation id (when no `ctx` available yet) | `crypto.randomUUID()` | Native, no import |
| Cryptographic tokens | `crypto.randomBytes(32).toString("base64url")` | True random |

The mix is intentional. Don't refactor to a single helper.

## Numbers

- `Number.parseInt(s, 10)` over bare `parseInt(s)` (lint-friendly + base
  explicit).
- For Zod-parsed query strings prefer `z.coerce.number().int()` over manual
  `Number(...)`.

## Logging

- Server: `console.error(...)` is acceptable but include a stable prefix:
  `console.error("[s3] putObject failed", { key, ...detail })`.
- No `console.log` in the happy path of production code. Use it for
  development/debugging then remove.
- Don't log PII (phone, NID, full name) at INFO level. Tag with `[pii]` if you
  must include it (so log routers can scrub).

## i18n (backoffice)

- Both `messages/en.json` and `messages/th.json` must stay in lockstep —
  every key in one must exist in the other. Use the parity script:
  ```sh
  node -e "const a=require('./apps/backoffice-web/src/i18n/messages/en.json'); const b=require('./apps/backoffice-web/src/i18n/messages/th.json'); const flat=o=>Object.keys(o).flatMap(k=>typeof o[k]==='object'?flat(o[k]).map(c=>k+'.'+c):[k]); const A=flat(a),B=flat(b); console.log({onlyEN:A.filter(x=>!B.includes(x)),onlyTH:B.filter(x=>!A.includes(x))})"
  ```

## Files

- One React component per file. Page-level files end in `page.tsx` (Next.js
  App Router). Server actions in `actions.ts`. Route handlers in `route.ts`.
- Snake_case for DB columns (Prisma `@map`), camelCase in TS, camelCase JSON
  for API responses (`correlation_id` is the documented exception — used for
  cross-system tracing).

## Naming

- Booleans: `isFoo`, `hasFoo`, `canFoo`. Avoid `flag`, `valid`, `result`.
- Service functions: verbs (`createVisit`, `settlePayment`, not `visit()`).
- Zod DTOs: `<Verb><Noun>Dto` (e.g. `CreateUserDto`, `PhoneLoginDto`).
- Event payloads: `<Domain><Past>V1` (`AppointmentCreatedV1`).

## Commits

- Imperative mood ("add ...", "fix ...", "refactor ...").
- Reference the phase or ADR in the body when relevant.
- Don't squash unrelated changes; each commit should be revertable.
