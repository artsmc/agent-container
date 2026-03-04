# Task List — Feature 23: UI Scaffolding
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Last Updated:** 2026-03-03

---

## Prerequisites

Before starting this feature, verify the following are complete:
- [ ] Feature 00 (nx-monorepo-scaffolding) is merged — `nx.json`, `tsconfig.base.json`, and `package.json` at the monorepo root exist
- [ ] Feature 01 (shared-types-package) is merged — `@iexcel/shared-types` resolves in the workspace
- [ ] Feature 22 (api-client-package) is merged — `@iexcel/api-client` resolves in the workspace

---

## Phase 1: Design Token Package (`packages/ui-tokens/`)

### Task 1.1 — Create the ui-tokens package directory structure [small]
Create the following directories and empty placeholder files:
```
packages/ui-tokens/
  tokens/          (directory)
  index.scss       (empty)
  package.json     (see TR.md §8)
  project.json     (see TR.md §3)
```
References: TR.md §2 (Repository Structure), TR.md §3 (Nx Configuration)

Verification: `ls packages/ui-tokens/` shows the correct structure.

---

### Task 1.2 — Implement `_colors.scss` [medium]
Populate `packages/ui-tokens/tokens/_colors.scss` with:
- Brand palette: `$color-primary`, `$color-primary-dark`, gray scale (`$color-gray-50` through `$color-gray-900`)
- Semantic colors: `$color-success`, `$color-success-light`, `$color-warning`, `$color-warning-light`, `$color-danger`, `$color-danger-light`, `$color-info`, `$color-info-light`
- Surface colors: `$color-surface-default` (white), `$color-surface-elevated`, `$color-surface-overlay`
- Text colors: `$color-text-primary`, `$color-text-secondary`, `$color-text-disabled`, `$color-text-inverse`
- Border colors: `$color-border-default`, `$color-border-focus`, `$color-border-error`
- CSS custom property declarations on `:root` for all variables

References: FRS.md REQ-23-TOK-01, TR.md §5 (CSS Custom Properties Strategy)

Verification: Import in a test SCSS file; no "Undefined variable" errors.

---

### Task 1.3 — Implement `_typography.scss` [small]
Populate `packages/ui-tokens/tokens/_typography.scss` with font family, type scale, font weight, and line height tokens plus CSS custom properties.

References: FRS.md REQ-23-TOK-02

Verification: `tokens.$text-base`, `tokens.$font-family-sans`, `tokens.$font-weight-semibold` resolve correctly.

---

### Task 1.4 — Implement `_spacing.scss` [small]
Populate `packages/ui-tokens/tokens/_spacing.scss` with the 4px-grid spacing scale (`$space-1` through `$space-24`) plus CSS custom properties.

References: FRS.md REQ-23-TOK-03

Verification: `tokens.$space-1` equals `4px`, `tokens.$space-4` equals `16px`.

---

### Task 1.5 — Implement `_shadows.scss` [small]
Populate `packages/ui-tokens/tokens/_shadows.scss` with five elevation levels (`$shadow-none` through `$shadow-xl`) plus CSS custom properties.

References: FRS.md REQ-23-TOK-04

Verification: `tokens.$shadow-none` equals `none`; each level has a progressively larger shadow.

---

### Task 1.6 — Implement `_radii.scss` [small]
Populate `packages/ui-tokens/tokens/_radii.scss` with six border radius tokens (`$radius-none` through `$radius-full`) plus CSS custom properties.

References: FRS.md REQ-23-TOK-05

Verification: `tokens.$radius-full` equals `9999px`.

---

### Task 1.7 — Implement `_transitions.scss` [small]
Populate `packages/ui-tokens/tokens/_transitions.scss` with duration tokens, easing tokens, and compound `$transition-default` shorthand plus CSS custom properties.

References: FRS.md REQ-23-TOK-06

Verification: `tokens.$transition-default` resolves to a valid CSS transition shorthand.

---

### Task 1.8 — Implement `_breakpoints.scss` [small]
Populate `packages/ui-tokens/tokens/_breakpoints.scss` with five breakpoint variables (`$bp-sm` through `$bp-2xl`).

Note: Breakpoints are SCSS-only; no CSS custom properties for breakpoints (they are used in `@media` queries, not runtime).

References: FRS.md REQ-23-TOK-07

Verification: `tokens.$bp-md` equals `768px`.

---

### Task 1.9 — Implement `index.scss` [small]
Populate `packages/ui-tokens/index.scss` with `@forward` directives for all seven token partial files.

References: FRS.md REQ-23-TOK-08, TR.md §5 (Token Resolution Path)

Verification: A test SCSS file that imports `@use 'packages/ui-tokens/index.scss' as tokens` can access all token variables without error.

---

## Phase 2: Next.js Application Setup (`apps/ui/`)

### Task 2.1 — Create the apps/ui directory structure [small]
Create the following directory skeleton (empty files where indicated):
```
apps/ui/
  src/
    app/
    components/
    layouts/
    styles/
  package.json
  project.json
  next.config.ts
  tsconfig.json
```
References: TR.md §2 (Repository Structure)

Verification: `ls apps/ui/` and `ls apps/ui/src/` show the correct structure.

---

### Task 2.2 — Write `apps/ui/package.json` [small]
Create `apps/ui/package.json` with:
- `next`, `react`, `react-dom` as dependencies (latest stable versions)
- `typescript`, `sass-embedded`, `@types/*` as devDependencies
- No Tailwind, no shadcn, no Radix UI

References: TR.md §8 (Package Dependencies)

Verification: `cat apps/ui/package.json` shows no Tailwind or shadcn entries.

---

### Task 2.3 — Write `apps/ui/project.json` [small]
Create the Nx project config with `dev`, `build`, `lint`, `type-check` targets and `implicitDependencies` pointing to `ui-tokens`, `shared-types`, `api-client`.

References: TR.md §3 (`apps/ui/project.json`)

Verification: `nx show project ui` outputs the expected targets.

---

### Task 2.4 — Write `apps/ui/next.config.ts` [small]
Configure:
- `sassOptions` with `implementation: 'sass-embedded'`
- `additionalData` that auto-imports ui-tokens with `@use '...' as tokens`
- No Tailwind plugin

References: TR.md §4 (Next.js Configuration)

Verification: Starting `nx run ui:dev` compiles SCSS without "Undefined variable" errors when a token is referenced in a module.

---

### Task 2.5 — Write `apps/ui/tsconfig.json` [small]
Configure TypeScript with:
- `extends: "../../tsconfig.base.json"`
- `paths: { "@/*": ["./src/*"] }`
- Next.js plugin enabled

References: TR.md §4 (`tsconfig.json`)

Verification: `nx run ui:type-check` passes without errors.

---

### Task 2.6 — Add `@iexcel/ui-tokens` path alias to monorepo `tsconfig.base.json` [small]
In the monorepo root `tsconfig.base.json`, add a path alias for `@iexcel/ui-tokens` pointing to `packages/ui-tokens/index.scss`.

Note: This is a modification to an existing file from feature 00. Confirm with feature 00 implementer before editing.

References: TR.md §3 (Nx Configuration notes on SCSS resolution)

Verification: TypeScript does not report "Cannot find module '@iexcel/ui-tokens'" in an IDE.

---

## Phase 3: Global Styles and Mixins

### Task 3.1 — Implement `src/styles/globals.scss` [medium]
Write the global stylesheet with:
- CSS box-model reset (box-sizing: border-box, universal selector)
- Margin/padding zero reset
- Base `body` typography from token variables
- `:root` CSS custom property declarations from ui-tokens
- Base element resets: `a`, `button`, `input`, `textarea`, `select`
- Base heading styles `h1`–`h6`

References: FRS.md REQ-23-APP-03, TR.md §5

Verification: Running `nx run ui:dev` and inspecting the browser shows `box-sizing: border-box` on all elements and CSS custom properties on `:root`.

---

### Task 3.2 — Implement `src/styles/mixins.scss` [small]
Write SCSS mixins:
- `respond-to($breakpoint)` — maps `sm/md/lg/xl/2xl` to `@media (min-width: $bp-*)` using breakpoint tokens
- `truncate` — overflow hidden + ellipsis
- `visually-hidden` — accessible hiding
- `focus-ring` — focus outline using `$color-border-focus` token
- `elevation($level)` — applies shadow token for given level

References: FRS.md REQ-23-APP-04, TR.md §5

Verification: A test SCSS module that imports `@use '@/styles/mixins' as mx` and calls `@include mx.respond-to(md)` compiles without error.

---

## Phase 4: Root Layout and App Router Setup

### Task 4.1 — Create `app/layout.tsx` (root layout) [small]
Write the root layout that:
- Imports `globals.scss`
- Renders `<html lang="en"><body>{children}</body></html>`
- Exports `metadata` with `title: 'iExcel'`
- Does NOT contain any layout chrome (no sidebar, no nav)

References: FRS.md REQ-23-APP-02, TR.md §6 (Route Group Strategy)

Verification: `nx run ui:dev` shows the root layout renders at `localhost:3000` without errors.

---

### Task 4.2 — Create route group `app/(dashboard)/layout.tsx` [small]
Create the route group directory `app/(dashboard)/` and add a `layout.tsx` that wraps `{children}` with `DashboardLayout`.

References: TR.md §6 (Route Group Strategy)

Verification: A placeholder page at `app/(dashboard)/page.tsx` renders inside the DashboardLayout shell.

---

### Task 4.3 — Create route group `app/shared/[token]/layout.tsx` [small]
Create the directory `app/shared/[token]/` and add a `layout.tsx` that wraps `{children}` with `PublicLayout`.

References: TR.md §6 (Route Group Strategy)

Verification: A placeholder page at `app/shared/[token]/page.tsx` renders inside the PublicLayout shell.

---

## Phase 5: Layouts

### Task 5.1 — Implement `DashboardLayout.tsx` [medium]
Build the dashboard layout shell with:
- Two-column structure: sidebar + main content
- `Sidebar` component imported from `@/components/Sidebar`
- `NavLinks` client sub-component (extracted into `Sidebar/NavLinks.tsx`) using `usePathname` for active link detection
- Nav items: Dashboard (`/`), Clients (`/clients`), Tasks (`/tasks`), Agendas (`/agendas`), Workflows (`/workflows`), Settings (`/settings`)
- User avatar placeholder at sidebar bottom (no auth data)
- `data-collapsed="false"` attribute on sidebar root element
- iExcel wordmark placeholder

References: FRS.md REQ-23-LAY-01, TR.md §6 (DashboardLayout Active Navigation)

Verification:
- `nx run ui:dev` — layout renders with sidebar and main content area
- Navigate to `/` and `/clients` — active link styling changes
- No API calls in Network tab

---

### Task 5.2 — Implement `DashboardLayout.module.scss` [medium]
Write layout styles for:
- Two-column CSS grid or flexbox layout (sidebar fixed-width, main content flex-grow)
- Sidebar styling: background from `$color-surface-elevated`, border-right from `$color-border-default`, full viewport height
- Nav item styles: padding from spacing tokens, hover state, active state
- Logo/wordmark area at sidebar top
- User avatar placeholder area at sidebar bottom
- Main content area: padding from spacing tokens, overflow auto

References: FRS.md REQ-23-LAY-01, TR.md §5 (SCSS Architecture)

Verification: Layout is visually correct in the browser — sidebar is fixed, content area fills remaining width.

---

### Task 5.3 — Implement `PublicLayout.tsx` [small]
Build the public layout shell with:
- Single-column centered layout
- Header with iExcel branding (logo placeholder + product name text)
- `<main>` that renders `{children}`
- No internal navigation links
- Server Component (no `'use client'`)

References: FRS.md REQ-23-LAY-02

Verification: A placeholder public page renders with the branded header and no internal nav links.

---

### Task 5.4 — Implement `PublicLayout.module.scss` [small]
Write layout styles for:
- Centered single-column container with max-width
- Header: border-bottom, padding, flexbox for logo + text alignment
- Main content area: padding from spacing tokens

References: FRS.md REQ-23-LAY-02

Verification: Public layout renders cleanly in the browser with correct centered content.

---

## Phase 6: Component Stubs

Each task below follows the same pattern: create the three files (`.tsx`, `.module.scss`, `index.ts`) using the stub pattern defined in TR.md §7.

### Task 6.1 — Button stub [small]
Create `src/components/Button/` with stub implementing:
- Props interface: `variant`, `size`, `disabled`, `onClick`, `children`, `className`, `type`
- Renders `<button>` with `data-testid="button"`, `data-variant`, `data-size`
- Named export via `index.ts`

References: FRS.md REQ-23-STUB-01, TR.md §7

Verification: `import { Button } from '@/components/Button'` resolves in TypeScript. `<Button>Click</Button>` renders without error.

---

### Task 6.2 — Table stub [small]
Create `src/components/Table/` with:
- `Table.tsx` — renders `<table>` wrapper
- `TableRow.tsx` — renders `<tr>` wrapper
- `index.ts` — exports both `Table` and `TableRow` as named exports

References: FRS.md REQ-23-STUB-02, TR.md §7

Verification: `import { Table, TableRow } from '@/components/Table'` resolves. Both components render without error.

---

### Task 6.3 — SlideOver stub [small]
Create `src/components/SlideOver/` with stub props: `open`, `onClose`, `title`, `children`, `className`.

References: FRS.md REQ-23-STUB-03, TR.md §7

Verification: `<SlideOver open={false} onClose={() => {}}>content</SlideOver>` renders without error.

---

### Task 6.4 — Sidebar stub [small]
Create `src/components/Sidebar/` with stub props: `children`, `className`, `collapsed`.

Note: Also create `Sidebar/NavLinks.tsx` as a `'use client'` component with `usePathname` for use by DashboardLayout (see Task 5.1).

References: FRS.md REQ-23-STUB-04, TR.md §6

Verification: `<Sidebar>nav items</Sidebar>` renders without error. NavLinks highlights the correct active route.

---

### Task 6.5 — Badge stub [small]
Create `src/components/Badge/` with stub props: `variant`, `children`, `className`.

References: FRS.md REQ-23-STUB-05, TR.md §7

Verification: `<Badge variant="success">Active</Badge>` renders with `data-testid="badge"`.

---

### Task 6.6 — Avatar stub [small]
Create `src/components/Avatar/` with stub props: `src`, `alt`, `name`, `size`, `className`.

References: FRS.md REQ-23-STUB-06, TR.md §7

Verification: `<Avatar name="Mark" size="md" />` renders without error.

---

### Task 6.7 — Card stub [small]
Create `src/components/Card/` with stub props: `children`, `className`, `elevation`.

References: FRS.md REQ-23-STUB-07, TR.md §7

Verification: `<Card elevation="raised">content</Card>` renders without error.

---

### Task 6.8 — Modal stub [small]
Create `src/components/Modal/` with stub props: `open`, `onClose`, `title`, `children`, `className`.

References: FRS.md REQ-23-STUB-08, TR.md §7

Verification: `<Modal open={false} onClose={() => {}}>content</Modal>` renders without error.

---

### Task 6.9 — InlineEdit stub [small]
Create `src/components/InlineEdit/` with stub props: `value`, `onChange`, `placeholder`, `className`.

References: FRS.md REQ-23-STUB-09, TR.md §7

Verification: `<InlineEdit value="test" onChange={() => {}} />` renders without error.

---

### Task 6.10 — RichTextEditor stub [small]
Create `src/components/RichTextEditor/` with stub props: `value`, `onChange`, `placeholder`, `className`, `readOnly`.

Renders a `<div contentEditable={!readOnly}>` placeholder.

References: FRS.md REQ-23-STUB-10, TR.md §7

Verification: `<RichTextEditor readOnly />` renders without error.

---

## Phase 7: Verification and Integration

### Task 7.1 — Full build smoke test [small]
Run `nx run ui:build` from the monorepo root. Confirm:
- Build completes without errors
- No TypeScript errors
- No SCSS compilation errors
- No missing module errors

References: FRS.md §4 (Success Metrics)

---

### Task 7.2 — Nx dependency graph verification [small]
Run `nx graph` and confirm:
- `ui` depends on `ui-tokens`, `shared-types`, `api-client`
- `ui` appears as affected when `ui-tokens` is modified

References: FRS.md REQ-23-NX-02, TR.md §3

---

### Task 7.3 — Manual layout verification in browser [small]
Run `nx run ui:dev`. Open `localhost:3000` and verify:
- DashboardLayout renders at `localhost:3000/`
- PublicLayout renders at `localhost:3000/shared/test-token`
- Sidebar navigation active states work correctly
- CSS custom properties appear on `:root` in browser DevTools
- No console errors

---

### Task 7.4 — Dependency audit: confirm no Tailwind or shadcn [small]
Run `cat apps/ui/package.json` and confirm:
- `tailwindcss` is absent
- `@shadcn/ui` is absent
- `@radix-ui/*` is absent
- No `tailwind.config.*` file exists in `apps/ui/`

References: FRS.md §4 (Success Metrics)

---

### Task 7.5 — TypeScript type-check [small]
Run `nx run ui:type-check`. Confirm zero TypeScript errors across all stub components, layouts, and the root layout.

---

## Completion Checklist

Before marking feature 23 as complete, verify all of the following:

- [ ] `packages/ui-tokens/` contains all 7 token files plus `index.scss` with all tokens defined
- [ ] CSS custom properties for all tokens are defined on `:root` via `globals.scss`
- [ ] `apps/ui/next.config.ts` has `sassOptions` with `additionalData` and `sass-embedded`
- [ ] Root layout at `app/layout.tsx` imports `globals.scss` and renders `<html>/<body>`
- [ ] Route groups `(dashboard)` and `shared/[token]` are set up with their respective layout wrappers
- [ ] `DashboardLayout` renders sidebar + main with working active nav links
- [ ] `PublicLayout` renders branded header, no internal nav, is a Server Component
- [ ] All 10 component stub directories exist with `.tsx`, `.module.scss`, and `index.ts`
- [ ] `nx run ui:build` passes
- [ ] `nx run ui:type-check` passes
- [ ] No Tailwind, no shadcn, no radix-ui in `apps/ui/package.json`
- [ ] `nx graph` shows correct dependency edges for `ui`
- [ ] Feature documented: update `execution/job-queue/index.md` spec status for feature 23 to `complete`
