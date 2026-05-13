# ADR 0006 — UI Design System & Internationalization

**Status:** Accepted (Phase 5.5)
**Date:** 2026-05-13
**Scope:** `apps/backoffice-web` (and future `apps/clinical-pad`, `apps/patient-app`)

## Context

ARCHITECTURE.md mandates three frontends (Backoffice, Clinical-Pad, Patient-App)
all built on Next.js. The first implementation of `apps/backoffice-web` (pre-Phase 5.5)
used ad-hoc styles and minimal components. We needed:

- A consistent visual language across all three apps without committing to a heavyweight
  proprietary design system.
- First-class **Thai language** support (primary clinic users), with English as a
  fallback for technical staff.
- **Dark mode** (clinics often run long shifts, low ambient light).
- Accessibility primitives (focus rings, keyboard nav, ARIA).
- Components owned by us in-repo, not pulled from a CDN, so we can audit and patch.

## Decision

1. **Component library**: [shadcn/ui](https://ui.shadcn.com/) (style: `new-york`,
   base color: neutral) — components are copied into `src/components/ui/*`, built
   on top of Radix UI primitives. We **own the source**, no npm dependency lock-in.
2. **Styling**: Tailwind CSS with **CSS variables** for tokens
   (`--background`, `--primary`, `--success`, `--warning`, `--info`,
   `--destructive`, plus `--sidebar.*` and `--brand.50..900`). Both light/dark themes
   re-define the same tokens.
3. **Dark mode**: `next-themes` with `system | light | dark`, class-based.
4. **Internationalization**: [`next-intl`](https://next-intl-docs.vercel.app/)
   with cookie-based locale (`lx_locale`), Thai (`th`) as default, English (`en`)
   as fallback. Messages live under `src/i18n/messages/{th,en}.json`.
5. **Typography**: `next/font` loading
   - Latin: **Inter**
   - Thai: **Noto Sans Thai**
   Switched automatically by `<html lang>` to keep rendering crisp on both scripts.
6. **Icons**: [`lucide-react`](https://lucide.dev/) only (single icon system, tree-shaken).
7. **Animations**: `tailwindcss-animate` + custom `fade-in` / `slide-up` keyframes.
8. **Layout**: Sticky header (breadcrumb + Cmd-K + theme/locale/user) + collapsible
   sidebar (256↔72px). All routes inside `(authed)` group share this shell.
9. **Notifications**: `sonner` for toasts on every mutation (success/error with
   description).

## Consequences

### Positive
- Visual consistency from day one, ready to extend to `clinical-pad` and `patient-app`.
- Accessibility comes free with Radix primitives.
- Theme tokens enable per-tenant white-labeling later (just override CSS variables).
- `next-intl` server-component aware → keeps initial HTML in correct language.
- Cmd-K command palette + breadcrumbs match enterprise-grade UX expectations.

### Negative / Trade-offs
- shadcn components are copy-paste → upgrades are manual (justified by audit ability).
- Two font families increase initial CSS payload (~30 KB total). Acceptable for desktop staff app.
- Some shadcn components (e.g. `data-table`) require additional wiring; we accept
  building thin wrappers as needed.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Material UI / MUI** | Heavyweight runtime, harder to theme per-tenant, less Tailwind-friendly. |
| **Chakra UI** | Less momentum on RSC support; theming language differs from Tailwind. |
| **Ant Design** | Strong opinions on layout, not customizable enough for clinical workflows. |
| **Mantine** | Solid choice; rejected only because shadcn aligns better with our
  Tailwind-first repo and we want to own components. |
| **i18next instead of next-intl** | next-intl integrates more cleanly with Next.js
  14 App Router server components. |

## Implementation Notes

- All `(authed)` pages add `export const dynamic = "force-dynamic"` and
  `if (!session) redirect("/login")` to avoid Next.js static prerender errors when
  layout-level redirects race with page render.
- `apiJson()` (server) and `clientApi.get/post()` (client) forward tenant/branch/user
  context headers automatically from cookies.

## Follow-ups

- ADR-0007 (future): Patient-App LIFF specifics (LINE login, mobile-first).
- ADR-0008 (future): Multi-tenant white-labeling tokens (per-tenant `--brand.*`).
