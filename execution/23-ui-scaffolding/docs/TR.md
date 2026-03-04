# TR — Technical Requirements
## Feature 23: UI Scaffolding
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Technology Stack

| Concern | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.x (16.1.6 at time of writing) |
| Language | TypeScript | 5.1+ |
| Styling | SCSS (Sass) | sass-embedded (Dart Sass) |
| Build system | Nx | latest workspace version |
| Bundler | Turbopack (Next.js default) | bundled with Next.js 16 |
| Node.js | Node.js | 20.9+ |

**Explicit exclusions:** No Tailwind CSS. No shadcn/ui. No Radix UI. No Headless UI. No CSS-in-JS (no styled-components, no Emotion). No CSS utility libraries.

---

## 2. Repository Structure

```
packages/
└── ui-tokens/
    ├── tokens/
    │   ├── _colors.scss
    │   ├── _typography.scss
    │   ├── _spacing.scss
    │   ├── _shadows.scss
    │   ├── _radii.scss
    │   ├── _transitions.scss
    │   └── _breakpoints.scss
    ├── index.scss
    ├── package.json             # name: "@iexcel/ui-tokens"
    └── project.json             # Nx project config

apps/ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout — imports globals.scss
│   │   ├── page.tsx             # Placeholder home page
│   │   ├── (dashboard)/         # Route group — applies DashboardLayout
│   │   │   └── layout.tsx       # Applies DashboardLayout
│   │   └── shared/
│   │       └── [token]/         # Route group — applies PublicLayout
│   │           └── layout.tsx   # Applies PublicLayout (SSR)
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.module.scss
│   │   │   └── index.ts
│   │   ├── Table/
│   │   │   ├── Table.tsx
│   │   │   ├── TableRow.tsx
│   │   │   ├── Table.module.scss
│   │   │   └── index.ts
│   │   ├── SlideOver/
│   │   │   ├── SlideOver.tsx
│   │   │   ├── SlideOver.module.scss
│   │   │   └── index.ts
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Sidebar.module.scss
│   │   │   └── index.ts
│   │   ├── Badge/
│   │   │   ├── Badge.tsx
│   │   │   ├── Badge.module.scss
│   │   │   └── index.ts
│   │   ├── Avatar/
│   │   │   ├── Avatar.tsx
│   │   │   ├── Avatar.module.scss
│   │   │   └── index.ts
│   │   ├── Card/
│   │   │   ├── Card.tsx
│   │   │   ├── Card.module.scss
│   │   │   └── index.ts
│   │   ├── Modal/
│   │   │   ├── Modal.tsx
│   │   │   ├── Modal.module.scss
│   │   │   └── index.ts
│   │   ├── InlineEdit/
│   │   │   ├── InlineEdit.tsx
│   │   │   ├── InlineEdit.module.scss
│   │   │   └── index.ts
│   │   └── RichTextEditor/
│   │       ├── RichTextEditor.tsx
│   │       ├── RichTextEditor.module.scss
│   │       └── index.ts
│   ├── layouts/
│   │   ├── DashboardLayout.tsx
│   │   ├── DashboardLayout.module.scss
│   │   ├── PublicLayout.tsx
│   │   └── PublicLayout.module.scss
│   └── styles/
│       ├── globals.scss
│       └── mixins.scss
├── next.config.ts
├── tsconfig.json
├── package.json
└── project.json
```

---

## 3. Nx Configuration

### `packages/ui-tokens/project.json`

```json
{
  "name": "ui-tokens",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/ui-tokens",
  "projectType": "library",
  "targets": {
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["packages/ui-tokens/**/*.scss"]
      }
    }
  },
  "tags": ["scope:shared", "type:ui-tokens"]
}
```

Note: ui-tokens is a pure SCSS package with no TypeScript build step. It does not need a `@nx/js:tsc` build target. Consumption is via SCSS `@use` path resolution, not npm package resolution. The Nx path alias in `tsconfig.base.json` is used for TypeScript-aware IDEs but does not affect the SCSS resolution path.

### `packages/ui-tokens/package.json`

```json
{
  "name": "@iexcel/ui-tokens",
  "version": "0.0.1",
  "private": true,
  "main": "index.scss",
  "exports": {
    ".": "./index.scss"
  }
}
```

### `apps/ui/project.json`

```json
{
  "name": "ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/ui/src",
  "projectType": "application",
  "targets": {
    "dev": {
      "executor": "nx:run-commands",
      "options": {
        "command": "next dev",
        "cwd": "apps/ui"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "next build",
        "cwd": "apps/ui"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["apps/ui/**/*.ts", "apps/ui/**/*.tsx"]
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit",
        "cwd": "apps/ui"
      }
    }
  },
  "implicitDependencies": ["ui-tokens", "shared-types", "api-client"],
  "tags": ["scope:ui", "type:app"]
}
```

---

## 4. Next.js Configuration

### `apps/ui/next.config.ts`

```typescript
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    // Auto-import ui-tokens into every SCSS module file.
    // This makes all token variables available without explicit @use per file.
    // Important: use @forward in index.scss, not @use, to avoid namespace conflicts.
    additionalData: `@use '${path.resolve(__dirname, '../../packages/ui-tokens/index.scss')}' as tokens;`,
  },
}

export default nextConfig
```

**Note on `additionalData` and Turbopack:** As of Next.js 16 + Turbopack, `additionalData` is supported for global SCSS injection. However, custom Sass `functions` (not used here) are not supported in Turbopack. This is not a constraint for feature 23. If webpack is needed later, add `next dev --webpack` to the dev script.

**Note on SCSS namespace:** By using `as tokens`, all token variables are accessed as `tokens.$color-primary`. In SCSS module files, this should be explicit. To avoid repetition, developers may alias `tokens` as `t` locally: `@use '...' as t;` within a specific module if they prefer brevity. The `additionalData` injection uses the full `tokens` namespace.

### `apps/ui/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "dom", "dom.iterable"],
    "jsx": "preserve",
    "incremental": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 5. SCSS Architecture

### Token Resolution Path

SCSS resolution for `@iexcel/ui-tokens` works via the `additionalData` in `next.config.ts` using an absolute path. This avoids the need for a `moduleNameMapper` or special webpack `resolve.alias` configuration.

For any SCSS file that needs tokens outside of the `additionalData` injection (e.g., standalone scripts, Storybook if added later), import directly:

```scss
@use '../../packages/ui-tokens/index.scss' as tokens;
```

### SCSS Module Naming Convention

All class names in `.module.scss` files must use `camelCase`. Examples:
- `.root` — the outermost wrapper
- `.rootCollapsed` — modifier state on root
- `.navItem` — a nav list item
- `.navItemActive` — active state modifier

No BEM, no hyphen-case. Reasons: TypeScript CSS Modules type inference produces camelCase properties; consistency with React component prop naming.

### CSS Custom Properties Strategy

Tokens are defined in two forms:

1. **SCSS variables** (`$color-primary`) — used at build time in SCSS module files for static values.
2. **CSS custom properties** (`--color-primary`) — defined on `:root` in `globals.scss` — used for runtime theming, JS access via `getComputedStyle`, and any inline style overrides.

Both must be kept in sync. When a token value changes in `_colors.scss`, both the SCSS variable and the CSS custom property are updated.

### Theming Architecture

The CSS custom property layer on `:root` enables theming by overriding properties in a scoped selector:

```scss
// Dark theme (future feature)
[data-theme='dark'] {
  --color-surface-default: #{$color-gray-900};
  --color-text-primary: #{$color-gray-50};
  // ...
}

// Client-branded public view (future feature)
[data-brand='client-a'] {
  --color-primary: #1a73e8;
}
```

Feature 23 does not implement theming — it sets up the infrastructure for it.

---

## 6. Layout Implementation Details

### Route Group Strategy

The App Router route group pattern separates authenticated and public routes without affecting URLs:

```
app/
├── layout.tsx                     # Root layout — html/body, globals.scss
├── (dashboard)/                   # Route group (authenticated area)
│   ├── layout.tsx                 # Applies DashboardLayout
│   ├── page.tsx                   # / → Dashboard
│   ├── clients/[client_id]/       # /clients/:id → Client Detail
│   ├── tasks/                     # /tasks → Task Review
│   └── ...
└── shared/[token]/                # /shared/:token → Public Agenda (PublicLayout)
    ├── layout.tsx                 # Applies PublicLayout
    └── page.tsx                   # Placeholder
```

Route groups use parentheses in the folder name (`(dashboard)`). These do not appear in the URL. This pattern allows different root layouts for authenticated vs. public routes without duplicating the `<html>/<body>` wrapper.

**Important:** A route group layout that does not contain `<html>/<body>` is NOT a root layout — it is a nested layout. The `app/layout.tsx` remains the single root layout containing `<html>/<body>`. The route group layouts (`app/(dashboard)/layout.tsx`) simply wrap `{children}` with `DashboardLayout` or `PublicLayout`.

### DashboardLayout Active Navigation

The sidebar navigation requires `usePathname` which is a client hook. The pattern is to extract the nav links into a `NavLinks` client component:

```tsx
// src/components/Sidebar/NavLinks.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/agendas', label: 'Agendas' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/settings', label: 'Settings' },
]

export function NavLinks() {
  const pathname = usePathname()
  return (
    <nav>
      {NAV_ITEMS.map(item => (
        <Link
          key={item.href}
          href={item.href}
          data-active={pathname === item.href || pathname.startsWith(item.href + '/')}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
```

The `DashboardLayout` itself remains a Server Component; only `NavLinks` is a Client Component.

---

## 7. Component Stub Implementation Pattern

Each stub must follow this exact pattern. Example for Button:

```tsx
// src/components/Button/Button.tsx

/**
 * Button — Primary interactive element.
 *
 * Variants: primary, secondary, ghost, danger
 * Sizes: sm, md, lg
 *
 * Full implementation: Feature 25 (ui-dashboard) and subsequent screen features.
 */

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children,
  className,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      data-testid="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  )
}
```

```scss
// src/components/Button/Button.module.scss
// Stub — full styles implemented in feature 25.
// Token variables available via next.config.ts additionalData injection.

.root {
  // placeholder
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
```

```ts
// src/components/Button/index.ts
export { default as Button } from './Button'
export type { ButtonProps } from './Button'
```

This pattern is replicated across all 10 component stubs with appropriate props interfaces.

---

## 8. Package Dependencies

### `apps/ui/package.json` (relevant dependencies only)

```json
{
  "dependencies": {
    "next": "^16.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "sass-embedded": "^1.70.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`sass` (the JS implementation) must NOT be present — only `sass-embedded` (the Dart Sass embedded host) is used, as specified in `sassOptions`.

### `packages/ui-tokens/package.json`

```json
{
  "name": "@iexcel/ui-tokens",
  "version": "0.0.1",
  "private": true,
  "main": "index.scss"
}
```

No runtime dependencies. No devDependencies. Pure SCSS.

---

## 9. Performance Considerations

- **Turbopack** is the default bundler in Next.js 16. No webpack configuration is needed unless custom Sass functions are required (they are not in this feature).
- **`sass-embedded`** uses the native Dart Sass binary via a child process. It is faster than the pure JS `sass` package for large SCSS compilations. This matters as the token system grows.
- **SCSS module scoping** means each component's styles are compiled into a unique class hash. There is no global CSS cascade except from `globals.scss`. This eliminates specificity conflicts.
- **CSS custom properties** computed at `:root` are applied once per page render. Theming changes via `data-theme` attribute are instant (no re-render, CSS-only update).
- **Server Components by default**: `DashboardLayout` and `PublicLayout` must be Server Components unless they contain client hooks. Only the `NavLinks` sub-component uses `usePathname` and is marked `'use client'`. This minimises the client bundle size.

---

## 10. Security Considerations

- This feature contains no API calls, no data fetching, and no authentication logic. The attack surface is minimal.
- The `PublicLayout` must not expose any internal route names, user data, or environment variables.
- No `NEXT_PUBLIC_*` environment variables are introduced in this feature. Those are introduced by features 24+ when API calls are added.
- The `data-testid` attributes on stub components are acceptable in production builds for this feature — they will be removed or gated by `NODE_ENV` checks in later features when components are fully implemented.

---

## 11. Testing Strategy

Feature 23 is infrastructure scaffolding. Formal test suites (unit tests, integration tests) for components belong to the screen features (25–31) that implement them. However:

- **TypeScript compilation** serves as the primary correctness check — all stub props interfaces must be correctly typed.
- **Build smoke test** (`nx run ui:build`) verifies the entire dependency chain compiles.
- **SCSS compilation** is validated during the build — any undefined token variable causes a build failure.
- Manual verification: `nx run ui:dev` and inspecting each layout route in the browser is sufficient for feature 23.

---

## 12. Migration / Adoption Notes

When a screen feature (e.g., feature 25 — ui-dashboard) begins implementation:

1. Import the relevant component stubs: `import { Button } from '@/components/Button'`.
2. Replace the stub implementation with the full implementation in the same file — do not create new files.
3. Add styles to the existing `.module.scss` file.
4. The `index.ts` re-export does not change.

This ensures the import contract established in feature 23 remains stable for all downstream features.

---

## 13. Infrastructure Requirements

| Requirement | Detail |
|---|---|
| **Container** | `apps/ui` container is defined in feature 35 (container-builds). No Dockerfile in this feature. |
| **Port** | 3000 (Next.js default, used in development and production) |
| **Environment variables** | None required for feature 23. `API_BASE_URL` and `NEXT_PUBLIC_*` are introduced by feature 24. |
| **CDN** | Static asset CDN is provisioned in feature 36 (terraform-app-deployment). Not in scope here. |
| **Health check** | `GET /` is sufficient for feature 23. A dedicated `/health` route may be added in feature 24. |
