# FRS — Functional Requirement Specification
## Feature 23: UI Scaffolding
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for each deliverable in feature 23. Requirements are grouped by deliverable area. Each requirement is labelled with a unique ID for traceability to GS.md scenarios and TR.md technical details.

---

## 2. Nx Project Registration

### REQ-23-NX-01: `packages/ui-tokens` Nx Project

The `packages/ui-tokens/` directory must contain a valid `project.json` that registers it as an Nx library named `ui-tokens` with the package name `@iexcel/ui-tokens`.

- The project must define a `build` target using `@nx/js:tsc` or equivalent.
- The project must define a `lint` target.
- The package name in `packages/ui-tokens/package.json` must be `@iexcel/ui-tokens`.
- The `tsconfig.base.json` in the monorepo root must include a path alias: `"@iexcel/ui-tokens": ["packages/ui-tokens/index.scss"]` or equivalent entry point.

### REQ-23-NX-02: `apps/ui` Nx Project

The `apps/ui/` directory must contain a valid `project.json` that registers it as an Nx application named `ui`.

- Targets must include: `dev`, `build`, `lint`, `type-check`.
- The `dev` target must invoke `next dev`.
- The `build` target must invoke `next build`.
- The project must declare `packages/ui-tokens` and `packages/shared-types` as implicit dependencies in the Nx dependency graph.

---

## 3. `packages/ui-tokens/` Design Token Package

### REQ-23-TOK-01: Color Tokens (`_colors.scss`)

The file must define SCSS variables and corresponding CSS custom properties for:

- **Brand palette**: at minimum a primary color, a primary-dark variant, and a neutral/gray scale (50–900 stops).
- **Semantic colors**: `$color-success`, `$color-warning`, `$color-danger`, `$color-info` — each with a light (background tint) and a dark (text/icon) variant.
- **Surface colors**: `$color-surface-default`, `$color-surface-elevated`, `$color-surface-overlay`.
- **Text colors**: `$color-text-primary`, `$color-text-secondary`, `$color-text-disabled`, `$color-text-inverse`.
- **Border colors**: `$color-border-default`, `$color-border-focus`, `$color-border-error`.
- All SCSS variables must be mirrored as CSS custom properties on `:root` (e.g. `--color-primary: #{$color-primary}`).

### REQ-23-TOK-02: Typography Tokens (`_typography.scss`)

The file must define:

- `$font-family-sans` — the primary sans-serif stack.
- `$font-family-mono` — monospace stack for code/IDs.
- A type scale with named sizes: `$text-xs`, `$text-sm`, `$text-base`, `$text-lg`, `$text-xl`, `$text-2xl`, `$text-3xl`.
- Font weight tokens: `$font-weight-regular` (400), `$font-weight-medium` (500), `$font-weight-semibold` (600), `$font-weight-bold` (700).
- Line height tokens: `$leading-tight`, `$leading-normal`, `$leading-relaxed`.
- All values must also be exported as CSS custom properties.

### REQ-23-TOK-03: Spacing Tokens (`_spacing.scss`)

The file must define a spacing scale based on a 4px base grid:

- Named tokens: `$space-1` (4px) through `$space-16` (64px), plus `$space-20` (80px) and `$space-24` (96px).
- All values must also be exported as CSS custom properties.

### REQ-23-TOK-04: Shadow Tokens (`_shadows.scss`)

The file must define elevation levels:

- `$shadow-none`, `$shadow-sm`, `$shadow-md`, `$shadow-lg`, `$shadow-xl`.
- Each level must define a `box-shadow` value representing increasing visual elevation.
- All values must also be exported as CSS custom properties.

### REQ-23-TOK-05: Border Radius Tokens (`_radii.scss`)

The file must define:

- `$radius-none` (0), `$radius-sm` (2px), `$radius-md` (4px), `$radius-lg` (8px), `$radius-xl` (12px), `$radius-full` (9999px).
- All values must also be exported as CSS custom properties.

### REQ-23-TOK-06: Transition Tokens (`_transitions.scss`)

The file must define:

- `$duration-fast` (100ms), `$duration-normal` (200ms), `$duration-slow` (300ms).
- `$ease-default` (ease), `$ease-in`, `$ease-out`, `$ease-in-out`.
- Compound shorthand tokens: `$transition-default: all $duration-normal $ease-default`.
- All values must also be exported as CSS custom properties.

### REQ-23-TOK-07: Breakpoint Tokens (`_breakpoints.scss`)

The file must define responsive breakpoints as SCSS variables (not CSS custom properties — breakpoints are used in SCSS `@media` queries, not runtime CSS):

- `$bp-sm: 640px`, `$bp-md: 768px`, `$bp-lg: 1024px`, `$bp-xl: 1280px`, `$bp-2xl: 1536px`.
- A `respond-to($bp)` mixin must be defined in `apps/ui/src/styles/mixins.scss` (not in ui-tokens) that wraps `@media (min-width: $bp)`.

### REQ-23-TOK-08: Token Index (`index.scss`)

The `packages/ui-tokens/index.scss` file must forward all seven token files using SCSS `@forward`:

```scss
@forward 'tokens/colors';
@forward 'tokens/typography';
@forward 'tokens/spacing';
@forward 'tokens/shadows';
@forward 'tokens/radii';
@forward 'tokens/transitions';
@forward 'tokens/breakpoints';
```

Any file in `apps/ui` that imports `@use '@iexcel/ui-tokens' as tokens` must have access to all token variables via the `tokens` namespace.

---

## 4. `apps/ui/` Next.js Application

### REQ-23-APP-01: Next.js Version and Configuration

- Next.js version: latest stable (16.x per docs, currently 16.1.6).
- App Router must be enabled (`app/` directory, not `pages/`).
- TypeScript must be enabled.
- Tailwind CSS must NOT be present in `next.config.ts` or `package.json`.
- `sassOptions` must be configured in `next.config.ts` with `additionalData` that auto-imports the ui-tokens index, making token variables available in all SCSS module files without explicit `@use` per file.
- `implementation: 'sass-embedded'` must be set in `sassOptions` for performance.
- A path alias `@/` must resolve to `apps/ui/src/`.

### REQ-23-APP-02: Root Layout (`app/layout.tsx`)

A root layout at `apps/ui/src/app/layout.tsx` must:

- Import `globals.scss` to apply the CSS reset and CSS custom properties.
- Render `<html lang="en">` and `<body>` tags.
- Not impose any layout-specific chrome (no sidebar, no nav) — that is the responsibility of `DashboardLayout` and `PublicLayout`.
- Export `metadata` with `title: 'iExcel'`.

### REQ-23-APP-03: Global Styles (`src/styles/globals.scss`)

`globals.scss` must:

- Apply a CSS reset (box-sizing border-box, margin/padding zero, sensible base defaults).
- Set base typography: `font-family` from `$font-family-sans`, `font-size` from `$text-base`, `color` from `$color-text-primary`, `background-color` from `$color-surface-default`.
- Import and apply all CSS custom properties from `@iexcel/ui-tokens` to `:root`.
- Define base `<a>`, `<button>`, `<input>`, `<textarea>`, `<select>` resets.
- Define base heading styles (`h1`–`h6`) using the type scale tokens.

### REQ-23-APP-04: SCSS Mixins (`src/styles/mixins.scss`)

`mixins.scss` must define the following mixins:

| Mixin | Description |
|---|---|
| `respond-to($breakpoint)` | Wraps content in `@media (min-width: $bp-{breakpoint})`. Accepts: `sm`, `md`, `lg`, `xl`, `2xl`. |
| `truncate` | Applies `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. |
| `visually-hidden` | Hides element visually but keeps it accessible to screen readers. |
| `focus-ring` | Applies a consistent focus ring using `$color-border-focus`. |
| `elevation($level)` | Applies the appropriate shadow token for the given elevation level (none/sm/md/lg/xl). |

---

## 5. Layouts

### REQ-23-LAY-01: DashboardLayout

`DashboardLayout` is the wrapper for all authenticated screens (features 24–28, 30–31).

Functional requirements:

- Accepts `children: React.ReactNode`.
- Renders a two-column structure: a persistent left sidebar and a main content area.
- The sidebar placeholder must contain:
  - An iExcel wordmark/logo placeholder (SVG or text).
  - A nav list with placeholder links for: Dashboard (`/`), Clients, Tasks, Agendas, Workflows, Settings.
  - Active link highlighting using `usePathname` from `next/navigation` (must be a `'use client'` sub-component).
  - A bottom section reserved for user avatar/name (placeholder only — no auth data in this feature).
- The main content area must render `{children}` inside a `<main>` element.
- The layout must be styled with `DashboardLayout.module.scss`.
- The sidebar must be collapsible in later features — the HTML structure must anticipate a `data-collapsed` attribute on the sidebar element to enable CSS-only collapse toggling.

### REQ-23-LAY-02: PublicLayout

`PublicLayout` is the wrapper for the shared client-facing agenda view (feature 29).

Functional requirements:

- Accepts `children: React.ReactNode`.
- Renders a clean, centered, single-column layout.
- Must include an iExcel branding header (logo placeholder + product name).
- Must NOT include internal navigation links, editing controls, or any references to authenticated state.
- Must be styled with `PublicLayout.module.scss`.
- Must support SSR (no `'use client'` directive unless a sub-component requires it).

---

## 6. Component Stubs

Each component listed below must have the following file structure:

```
components/ComponentName/
  ComponentName.tsx         — default export, renders a placeholder <div> with a data-testid
  ComponentName.module.scss — empty SCSS module (imports ui-tokens, defines .root placeholder class)
  index.ts                  — re-exports the default component as named export
```

The stub `.tsx` file must:

- Accept and spread a `className?: string` prop onto the root element.
- Accept `children?: React.ReactNode` where it makes semantic sense.
- Include a JSDoc comment block describing the component's eventual purpose.
- NOT implement any visual logic beyond the placeholder structure.

### REQ-23-STUB-01: Button

Stub props interface: `{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; onClick?: () => void; children: React.ReactNode; className?: string; type?: 'button' | 'submit' | 'reset' }`.

### REQ-23-STUB-02: Table

The Table stub must export both `Table` and `TableRow` as named exports from `index.ts`. `Table` renders a `<table>` wrapper; `TableRow` renders a `<tr>` wrapper.

Stub props: `Table: { children: React.ReactNode; className?: string }`, `TableRow: { children: React.ReactNode; className?: string; onClick?: () => void }`.

### REQ-23-STUB-03: SlideOver

A slide-over panel that appears from the right. Used for task detail panels, edit panels.

Stub props interface: `{ open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }`.

### REQ-23-STUB-04: Sidebar

The sidebar navigation component. Used inside `DashboardLayout`.

Stub props interface: `{ children: React.ReactNode; className?: string; collapsed?: boolean }`.

### REQ-23-STUB-05: Badge

A small status indicator chip.

Stub props interface: `{ variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode; className?: string }`.

### REQ-23-STUB-06: Avatar

A circular user avatar with initials fallback.

Stub props interface: `{ src?: string; alt?: string; name?: string; size?: 'sm' | 'md' | 'lg'; className?: string }`.

### REQ-23-STUB-07: Card

A content container with a surface background and shadow.

Stub props interface: `{ children: React.ReactNode; className?: string; elevation?: 'flat' | 'raised' | 'floating' }`.

### REQ-23-STUB-08: Modal

A dialog overlay.

Stub props interface: `{ open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }`.

### REQ-23-STUB-09: InlineEdit

An element that shows read-only text and switches to an input on click.

Stub props interface: `{ value: string; onChange: (value: string) => void; placeholder?: string; className?: string }`.

### REQ-23-STUB-10: RichTextEditor

A rich text editing area. The stub renders a `<div contentEditable>` placeholder.

Stub props interface: `{ value?: string; onChange?: (value: string) => void; placeholder?: string; className?: string; readOnly?: boolean }`.

---

## 7. Error Handling and Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| `packages/ui-tokens` import fails to resolve | Build must fail with a clear module-not-found error. No silent degradation. |
| SCSS module import references undefined token variable | Sass compiler must throw with variable name in error output. |
| `DashboardLayout` rendered without children | Must render the shell without error; main content area is empty. |
| Component stub rendered without required props | TypeScript compiler error at build time, not runtime crash. |
| `sassOptions.additionalData` auto-import conflicts with explicit `@use` in a module | Developer must use namespace to avoid duplication; documented in TR.md. |

---

## 8. UI/UX Requirements

These requirements apply to the stub implementations (not full designs, but the structural HTML must be correct):

- All interactive elements (`Button`, `SlideOver` close trigger, `Modal` close trigger) must be keyboard accessible (`tabIndex`, `role`, `aria-*` as appropriate).
- `DashboardLayout` sidebar links must use Next.js `<Link>` components, not `<a>` tags.
- `PublicLayout` must pass Core Web Vitals for LCP — the root element must not contain unnecessary render-blocking elements.
- All SCSS module class names must be in `camelCase` (e.g. `.rootWrapper`, not `.root-wrapper`).
