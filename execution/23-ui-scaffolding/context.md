# Feature 23: UI Scaffolding

## Summary
Set up the Next.js application at `apps/ui/` with app router, layouts (DashboardLayout for authenticated pages, PublicLayout for shared views), SCSS module setup, design tokens package (`packages/ui-tokens/` with colors, typography, spacing, shadows, radii, transitions, breakpoints), global styles, and base component stubs. No Tailwind, no shadcn — custom SCSS with design tokens.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 00 (Nx monorepo scaffolding), 01 (shared-types package), 22 (api-client package — UI imports it)
- **Blocks**: 24 (UI auth flow), 25 (dashboard), 26 (client detail), 27 (task review), 28 (agenda editor), 29 (shared agenda), 30 (workflow trigger), 31 (admin settings)

## Source PRDs
- `ui-prd.md` — Tech Stack section, component structure, token structure, design direction, layouts
- `infra-prd.md` — apps/ui container spec, Nx dependency graph

## Relevant PRD Extracts

### Tech Stack (ui-prd.md)

**Framework: Next.js**
Next.js as the React framework — server-side rendering for the shared client views (Screen 7), app router for the authenticated dashboard, and API routes if needed for BFF (backend-for-frontend) patterns.

**Styling: Custom SCSS with Design Tokens**

**No Tailwind. No shadcn. No component library.**

The goal is a distinct visual identity that doesn't look like every other LLM-generated SaaS dashboard.

**Approach:**
- **SCSS modules** — Co-located with components. Each component owns its styles. No global utility class soup.
- **Design tokens** — A centralized token system (colors, spacing, typography, shadows, radii, transitions) defined as SCSS variables and CSS custom properties. One place to tune the entire look.
- **Custom component library** — Built in-house. Every button, input, table, card, modal, sidebar, and badge is hand-crafted.
- **Theming** — CSS custom properties enable theming (light/dark, or client-branded shared views) without rebuilding.

### Token Structure (ui-prd.md)

```
packages/
└── ui-tokens/
    ├── _colors.scss          # Brand palette, semantic colors (success, warning, danger)
    ├── _typography.scss       # Font families, sizes, weights, line heights
    ├── _spacing.scss          # Spacing scale (4px base grid)
    ├── _shadows.scss          # Elevation levels
    ├── _radii.scss            # Border radius scale
    ├── _transitions.scss      # Animation timing and easing
    ├── _breakpoints.scss      # Responsive breakpoints
    └── index.scss             # Exports all tokens
```

### Component Structure (ui-prd.md)

```
apps/ui/
└── src/
    ├── components/
    │   ├── Button/
    │   │   ├── Button.tsx
    │   │   ├── Button.module.scss
    │   │   └── index.ts
    │   ├── Table/
    │   │   ├── Table.tsx
    │   │   ├── TableRow.tsx
    │   │   ├── Table.module.scss
    │   │   └── index.ts
    │   ├── SlideOver/
    │   ├── Sidebar/
    │   ├── Badge/
    │   ├── Avatar/
    │   ├── Card/
    │   ├── Modal/
    │   ├── InlineEdit/
    │   └── RichTextEditor/
    ├── layouts/
    │   ├── DashboardLayout.tsx
    │   ├── DashboardLayout.module.scss
    │   ├── PublicLayout.tsx       # For shared/client views
    │   └── PublicLayout.module.scss
    └── styles/
        ├── globals.scss           # Reset, base typography, CSS custom properties
        └── mixins.scss            # Reusable SCSS mixins (responsive, truncate, etc.)
```

### Layout Roles (ui-prd.md)
- **DashboardLayout** — Used by authenticated screens (Screens 1-6, 8-9). Includes left sidebar navigation for switching between views/clients.
- **PublicLayout** — Used by shared/client views (Screen 7). Clean, branded view with no editing controls and no internal navigation.

### Design Direction Summary (ui-prd.md)
- **Clean, minimal aesthetic** — White/light backgrounds, generous whitespace, subtle borders.
- **Left sidebar navigation** — Persistent nav for switching between views/clients.
- **Slide-over detail panels** — Click an item in a list to open a rich detail view on the right.
- **Inline-editable tables** — Data presented in structured rows with editable fields.
- **Collapsible grouped sections** — Items grouped by status, priority, or category.
- **Action bars** — Primary actions (Approve, Finalize, Send) as prominent CTAs.
- **Avatar chips** — Team members shown as small circular avatars.
- **Tab-based workflows** — Multi-step flows presented as tabs rather than separate pages.

### Container Spec (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Next.js) |
| **Port** | 3000 |
| **Health check** | `GET /` or `GET /health` |
| **Environment variables** | `API_BASE_URL`, `NEXT_PUBLIC_*` for client-side config |
| **Scaling** | Horizontal — based on request count |
| **CDN** | Static assets served via CDN (Cloud CDN / CloudFront) |

## Scope

### In Scope
- Next.js application setup at `apps/ui/` with app router
- `packages/ui-tokens/` package with SCSS token files:
  - `_colors.scss` — brand palette, semantic colors (success, warning, danger, info)
  - `_typography.scss` — font families, sizes, weights, line heights
  - `_spacing.scss` — spacing scale (4px base grid)
  - `_shadows.scss` — elevation levels
  - `_radii.scss` — border radius scale
  - `_transitions.scss` — animation timing and easing
  - `_breakpoints.scss` — responsive breakpoints
  - `index.scss` — exports all tokens
- Global styles (`apps/ui/src/styles/globals.scss`) — CSS reset, base typography, CSS custom properties from tokens
- SCSS mixins (`apps/ui/src/styles/mixins.scss`) — responsive, truncate, and other reusable mixins
- `DashboardLayout` — authenticated layout with left sidebar navigation placeholder
- `PublicLayout` — minimal branded layout for public/shared views
- Base component stubs (directory + empty/minimal files) for: Button, Table, SlideOver, Sidebar, Badge, Avatar, Card, Modal, InlineEdit, RichTextEditor
- SCSS module configuration for Next.js
- Nx project.json for both `apps/ui` and `packages/ui-tokens`

### Out of Scope
- No authentication logic (that is feature 24)
- No screen implementations (those are features 25-31)
- No fully implemented components — stubs only, fleshed out as screens require them
- No Tailwind, no shadcn, no external component library
- No API data fetching logic (that is handled per-screen using api-client)
- No Dockerfile (that is feature 35)

## Key Decisions
- **No Tailwind, no shadcn, no component library.** Custom SCSS with design tokens for a distinct visual identity.
- SCSS modules are co-located with components. Each component owns its styles.
- Design tokens live in their own Nx package (`packages/ui-tokens/`) so they are shareable across future apps. This resolves the open question in ui-prd.md.
- CSS custom properties generated from SCSS tokens enable theming (light/dark, client-branded shared views) without rebuilding.
- The app router is used for all routing. Server-side rendering is used for the shared client view (Screen 7 / PublicLayout).
- Base component stubs establish the directory pattern and export structure but do not contain full implementations — those are built incrementally as screens are developed.
