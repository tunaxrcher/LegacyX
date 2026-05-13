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

---

## Revision v2 — Theme Refresh & Dialog Conventions (2026-05-13)

**Status:** Accepted · supersedes color / sidebar / dialog decisions in the
original ADR.

### What changed

The original "neutral base color + dark sidebar" palette was replaced with a
branded teal identity and a lighter, more SaaS-like surface treatment. Dialog
and button conventions were tightened for faster task completion.

### Brand color

- **Primary**: `#1bb59b` (teal) → `hsl(170, 74%, 41%)`
- Primary CSS variable drives `--ring`, `--accent-foreground`, and the new
  `--gradient-from/via/to` triple used by the animated button background.
- `--brand-50..900` regenerated as a teal scale (replaces blue).

### Surfaces

- `--background` lightened to `hsl(210 20% 98%)` — very soft tinted gray.
- `--border` softened to `hsl(214 20% 92%)` — minimal visual noise.
- `--radius` bumped **0.625rem → 0.875rem**. Cards use `rounded-2xl`, inputs
  `rounded-lg`, buttons `rounded-lg`.
- New utilities: `shadow-soft`, `shadow-soft-lg`, `.panel`,
  `.bg-primary-gradient` (animated 200%-width gradient, 4s ease-in-out infinite).

### Sidebar (major change)

Sidebar moved from **dark anchor** → **light surface with teal accent**:

- `--sidebar-background: 0 0% 100%` (white) with `--sidebar-foreground` dark.
- Active item: `bg-sidebar-accent` (teal-tinted `#e8f7f3`) + a 1px vertical
  gradient bar on the left rail + icon tinted `--primary`.
- Brand badge uses `.bg-primary-gradient` (the same animated gradient as buttons).

### Buttons

`Button` component variants rewritten:

| Variant | Visual |
|---|---|
| `default` (primary) | **animated teal gradient** (`.bg-primary-gradient`) with `shadow-soft` + hover `brightness-105` + hover `shadow-soft-lg` |
| `solid` (new) | flat `bg-primary` (use when gradient motion is distracting) |
| `outline` / `secondary` / `ghost` / `destructive` / `success` | unchanged semantics, refreshed shadows/radii |

Default height bumped `h-9 → h-10`; `lg` → `h-11`; `xl` → `h-12`.

### Dialog conventions

Enforced across every dialog in `apps/backoffice-web`:

1. **Backdrop blur**: overlay uses `backdrop-blur-md` + `bg-foreground/30`
   (replaces `backdrop-blur-sm` + `bg-black/50`).
2. **Content radius**: `sm:rounded-2xl`, larger padding (`p-6 gap-5`).
3. **Centered logo header**: `DialogHeader` renders a gradient circular badge
   (`Stethoscope` icon) above the title, content auto-centered. Pass
   `hideLogo` only for dense picker-style dialogs.
4. **Confirm-only footer**: `DialogFooter` defaults to `variant="full"` which
   stretches the single child button to `w-full h-11`. Cancel is handled by
   the top-right **X** close icon — no secondary Cancel button. Use
   `variant="row"` only when genuinely needing a multi-button row.

The 18 existing dialogs were swept to drop their Cancel buttons automatically.

### Form primitives

- `Input` / `Select` trigger: `h-10 rounded-lg` with `shadow-soft`, softer
  hover border (`border-ring/30`), focus `ring-ring/20`.
- `Card`: `rounded-2xl` + `shadow-soft`.
- `Tabs`: taller list (`h-11 rounded-xl bg-muted/60`), trigger `rounded-lg
  px-4` with `shadow-soft` on active.

### PageHeader + Dashboard

- `PageHeader` title size **2xl → 3xl**, description `text-[15px]`.
- Dashboard KPI tiles: number `text-4xl`, icon badge `h-10 w-10 rounded-xl`,
  hover `-translate-y-0.5` + subtle gradient wash. API health banner removed
  from the top of the page — reduced to a destructive chip in the page header
  (only when unhealthy) and a `text-xs` success footnote at the bottom.
- Today's appointments list converted from `divide-y` rows to card-style rows
  with teal time badge (`h-11 w-11`) and hover lift.
- Appointments timeline switched to a 1px `::before` rail with outlined dots
  and larger time badges (`h-14 w-14`).

### Typography

No change — **Inter** (latin) + **Noto Sans Thai** via `next/font` remain the
default stack, auto-switched by `<html lang>`.

### Rationale

- The neutral gray shell did not communicate identity; a clinic system
  benefits from a warm, trustworthy brand color that readily works on badges,
  charts, empty states, and loading skeletons without re-palette.
- A light sidebar reduces perceived UI weight and matches the direction taken
  by Linear/Notion/Attio, which our operational users (reception, nurses) are
  familiar with.
- Removing Cancel buttons consistently cuts visual noise in the footer and
  encourages a single, clear primary action — the X icon remains universally
  available for dismissal.

### Migration notes

- Any feature code using **`variant="default"`** on `<Button>` will
  automatically pick up the animated gradient. Where motion is undesirable
  (e.g. a dense toolbar with many buttons), switch to `variant="solid"`.
- Code that composed its own `<DialogFooter>` with two buttons now stacks
  them vertically as full-width by default. Either drop the Cancel button
  (preferred) or pass `variant="row"` to restore the old right-aligned row.
- Custom components that hard-coded `rounded-md` or `shadow-sm` should be
  audited; prefer `rounded-lg`/`rounded-2xl` and `shadow-soft`.
