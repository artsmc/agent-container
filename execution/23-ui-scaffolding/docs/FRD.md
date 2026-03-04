# FRD — Feature Requirement Document
## Feature 23: UI Scaffolding
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Business Objectives

The iExcel automation system requires a web-based human interaction layer. Before any screen can be built, a consistent, maintainable foundation must exist. Feature 23 establishes that foundation:

- A functioning Next.js application at `apps/ui/` wired into the Nx monorepo
- A shareable design token package at `packages/ui-tokens/` that any future app can consume
- Two layout shells (authenticated dashboard, public client-facing) ready to wrap screen implementations
- A set of base component stubs that establish the directory contract and export pattern each future screen will flesh out
- Global styles and SCSS infrastructure that eliminate per-screen style setup

Without this scaffolding, features 24–31 (all UI screens) have no place to land. Every screen implementation presupposes the token system, layout structure, SCSS module configuration, and component directory conventions defined here.

---

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Development team** | Zero re-setup per screen — layouts, tokens, and SCSS config exist from day one |
| **Product** | Guarantees a visually distinct, custom look: no Tailwind, no shadcn, no generic SaaS aesthetic |
| **Clients (end users)** | The shared agenda view (Screen 7) will be clean and branded, not an obviously developer-built template |
| **Future apps** | `packages/ui-tokens/` is an Nx library — any future app in the monorepo can import the same design tokens |

---

## 3. Target Users

This feature has no direct end-user interaction. It is an infrastructure and developer-experience deliverable. The users are:

- **Engineers implementing features 24–31** — they consume the layouts, components, and tokens
- **Designers** — the token system is the single place to tune the visual identity of the entire product

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| `apps/ui` builds with `nx build ui` without errors | Pass |
| `packages/ui-tokens` is importable from `apps/ui` with `@iexcel/ui-tokens` | Pass |
| SCSS modules compile (no CSS-in-JS, no Tailwind classes) | Pass |
| `DashboardLayout` and `PublicLayout` render with `next dev` | Pass |
| All 10 component stub directories exist with correct file structure | Pass |
| `nx affected` correctly detects `apps/ui` as affected when `packages/ui-tokens` changes | Pass |
| No Tailwind dependency in `apps/ui/package.json` | Pass |
| No shadcn or radix-ui dependency in `apps/ui/package.json` | Pass |

---

## 5. Business Constraints

- **No Tailwind.** The decision is final and documented in `ui-prd.md`. Any future contributor must use SCSS modules.
- **No shadcn or any external component library.** All components are hand-crafted.
- **No authentication logic** in this feature — that is feature 24. The DashboardLayout may include a sidebar placeholder but must not implement auth guards.
- **No screen implementations** — stubs only. Full component implementations are deferred to the screen features (25–31).
- **No Dockerfile** — that is feature 35.
- **No API data fetching** — no api-client calls in this feature. Layouts and components are presentational stubs.

---

## 6. Dependencies

### Blocked By

| Feature | Reason |
|---|---|
| 00 — nx-monorepo-scaffolding | `apps/ui/` and `packages/ui-tokens/` are Nx projects; the workspace must exist first |
| 01 — shared-types-package | `apps/ui` will import from `@iexcel/shared-types`; the package must exist in the workspace |
| 22 — api-client-package | `apps/ui` lists `@iexcel/api-client` as a dependency; package must be resolvable at install time even if not yet called |

### Blocks

| Feature | Reason |
|---|---|
| 24 — ui-auth-flow | Auth flow wraps DashboardLayout; layout must exist |
| 25 — ui-dashboard | Dashboard screen uses DashboardLayout, Button, Card, Badge, Avatar, Table |
| 29 — ui-shared-agenda | Shared agenda uses PublicLayout |

---

## 7. Integration with Product Roadmap

Feature 23 sits at the entry point of Phase 3 (Consumers). It is the sole prerequisite for all 8 downstream UI features (24–31). In the spec generation wave order, it lands in Wave 3 alongside `api-client-package` and `cicd-pipeline`.

The design token package (`packages/ui-tokens/`) is explicitly designed to be shareable. If a second web app is added to the monorepo in the future (e.g., a white-label client portal), it can import `@iexcel/ui-tokens` directly.

---

## 8. Open Questions (Inherited from ui-prd.md)

| Question | Impact on Feature 23 |
|---|---|
| Mobile support? Desktop-only for now? | Breakpoints in `_breakpoints.scss` should be defined but usage in layouts/components can be desktop-first for V1 |
| Should `ui-tokens` target future white-label theming per client? | Token naming should use semantic CSS custom properties (e.g. `--color-primary`) from day one to enable theming without token redesign |
