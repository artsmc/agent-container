# GS — Gherkin Specification
## Feature 23: UI Scaffolding
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## Feature: UI Scaffolding Foundation

```
Feature: UI Scaffolding Foundation
  As a developer implementing iExcel UI screens
  I want a consistent Next.js app scaffold with design tokens, layouts, and component stubs
  So that every screen has a shared foundation and no per-screen setup is required
```

---

## Background

```
Background:
  Given the Nx monorepo has been initialised (feature 00)
  And the shared-types package exists at packages/shared-types/ (feature 01)
  And the api-client package exists at packages/api-client/ (feature 22)
  And the working directory is the monorepo root
```

---

## Nx Project Registration

```gherkin
Scenario: packages/ui-tokens registers as a valid Nx library
  Given the monorepo workspace has been initialised
  When I run "nx show project ui-tokens"
  Then the output should include the project name "ui-tokens"
  And the output should include a "build" target
  And the output should include a "lint" target

Scenario: apps/ui registers as a valid Nx application
  Given the monorepo workspace has been initialised
  When I run "nx show project ui"
  Then the output should include the project name "ui"
  And the output should include a "dev" target
  And the output should include a "build" target
  And the output should include a "lint" target
  And the output should include a "type-check" target

Scenario: Nx detects ui as affected when ui-tokens changes
  Given the monorepo workspace has been initialised
  And a change has been made to packages/ui-tokens/_colors.scss
  When I run "nx affected:list"
  Then "ui" should appear in the affected projects list
```

---

## Design Token Package

```gherkin
Scenario: Color tokens are importable and resolve to valid CSS values
  Given packages/ui-tokens/_colors.scss exists
  When a SCSS file imports the token package with "@use '@iexcel/ui-tokens' as tokens"
  Then "tokens.$color-primary" should resolve to a valid hex or RGB color value
  And "tokens.$color-success" should resolve to a valid color value
  And "tokens.$color-danger" should resolve to a valid color value

Scenario: Typography tokens define a complete type scale
  Given packages/ui-tokens/_typography.scss exists
  When a SCSS file imports the token package
  Then "tokens.$text-base" should resolve to a pixel or rem value
  And "tokens.$font-family-sans" should resolve to a font stack string
  And "tokens.$font-weight-semibold" should equal 600

Scenario: Spacing tokens follow the 4px grid
  Given packages/ui-tokens/_spacing.scss exists
  When a SCSS file imports the token package
  Then "tokens.$space-1" should equal 4px
  And "tokens.$space-2" should equal 8px
  And "tokens.$space-4" should equal 16px

Scenario: Shadow tokens define distinct elevation levels
  Given packages/ui-tokens/_shadows.scss exists
  When a SCSS file imports the token package
  Then "tokens.$shadow-none" should equal "none"
  And "tokens.$shadow-sm" should be a non-empty box-shadow value
  And "tokens.$shadow-lg" should differ from "tokens.$shadow-sm"

Scenario: All tokens are accessible from the index entry point
  Given packages/ui-tokens/index.scss exists and forwards all token files
  When a SCSS file imports "@use '@iexcel/ui-tokens' as tokens"
  Then color, typography, spacing, shadow, radius, transition, and breakpoint tokens should all resolve without error

Scenario: CSS custom properties appear on the root element at runtime
  Given the Next.js app is running
  When I inspect the :root element in the browser
  Then "--color-primary" should be defined
  And "--space-4" should be defined
  And "--shadow-md" should be defined
```

---

## Next.js Application Setup

```gherkin
Scenario: Next.js app starts the development server
  Given apps/ui/ exists with a valid next.config.ts and app/layout.tsx
  When I run "nx run ui:dev"
  Then the development server should start on port 3000
  And there should be no compilation errors in the terminal output

Scenario: Next.js app builds for production
  Given apps/ui/ is correctly configured
  When I run "nx run ui:build"
  Then the build should complete without errors
  And .next/ should be created with a valid build manifest

Scenario: No Tailwind dependency in the UI app
  Given apps/ui/package.json exists
  When I inspect the dependencies and devDependencies
  Then "tailwindcss" should not be present
  And "tw-merge" should not be present
  And there should be no tailwind.config.js or tailwind.config.ts file

Scenario: No component library dependency in the UI app
  Given apps/ui/package.json exists
  When I inspect the dependencies and devDependencies
  Then "@shadcn/ui" should not be present
  And "@radix-ui/react-*" should not be present

Scenario: SCSS modules compile with design tokens in scope
  Given sassOptions is configured with additionalData importing ui-tokens
  When a component module file uses a token variable such as "$color-primary"
  Then the SCSS compiler should resolve it without a "Undefined variable" error
  And the compiled CSS should contain the token value

Scenario: Path alias "@/" resolves to src/
  Given tsconfig.json defines "@/*" mapping to "src/*"
  When a file imports "@/components/Button"
  Then TypeScript should resolve the import to "apps/ui/src/components/Button"
```

---

## Global Styles

```gherkin
Scenario: CSS reset is applied globally
  Given globals.scss is imported in app/layout.tsx
  When I inspect a rendered page in the browser
  Then all elements should have box-sizing: border-box
  And the body should have margin: 0 and padding: 0

Scenario: Base typography is applied from tokens
  Given globals.scss imports token variables
  When the app renders in a browser
  Then the body element should use the font-family from $font-family-sans
  And the base font size should match $text-base

Scenario: SCSS mixins are importable from the styles directory
  Given src/styles/mixins.scss defines the respond-to mixin
  When a component module file imports "@use '@/styles/mixins' as mx"
  Then calling "@include mx.respond-to(md)" should compile to a valid @media query
```

---

## DashboardLayout

```gherkin
Scenario: DashboardLayout renders a sidebar and main content area
  Given DashboardLayout.tsx exists in src/layouts/
  When I mount DashboardLayout with a child element
  Then the rendered output should contain a sidebar element
  And the rendered output should contain a main element
  And the child element should be nested inside the main element

Scenario: DashboardLayout sidebar contains navigation links
  Given DashboardLayout.tsx is rendered
  When I inspect the sidebar
  Then I should see links for "Dashboard", "Clients", "Tasks", "Agendas", "Workflows", and "Settings"
  And each link should be a Next.js Link component pointing to the correct route

Scenario: Active sidebar link is highlighted for the current route
  Given DashboardLayout is rendered and the current route is "/"
  When I inspect the sidebar navigation links
  Then the "Dashboard" link should have the active style class
  And the "Clients" link should not have the active style class

Scenario: DashboardLayout renders without auth data in feature 23
  Given DashboardLayout.tsx is the stub implementation
  When I mount DashboardLayout
  Then the user avatar placeholder should render without making any API calls
  And no authentication error should be thrown

Scenario: DashboardLayout sidebar anticipates collapse toggle
  Given the DashboardLayout sidebar is rendered
  When I inspect the sidebar root element
  Then it should have a "data-collapsed" attribute set to "false" by default
```

---

## PublicLayout

```gherkin
Scenario: PublicLayout renders a branded header and content area
  Given PublicLayout.tsx exists in src/layouts/
  When I mount PublicLayout with a child element
  Then the rendered output should contain a header with the iExcel branding
  And the rendered output should contain the child element in the main content area

Scenario: PublicLayout does not render internal navigation
  Given PublicLayout.tsx is rendered
  When I inspect the entire rendered output
  Then there should be no links to "/clients", "/tasks", "/agendas", "/workflows", or "/settings"

Scenario: PublicLayout is a Server Component
  Given PublicLayout.tsx does not contain a "use client" directive
  When the Next.js build analyses the component
  Then it should be classified as a Server Component
  And it should be eligible for SSR rendering
```

---

## Component Stubs

```gherkin
Scenario: Button stub renders with correct HTML structure
  Given src/components/Button/Button.tsx exists
  When I render <Button>Click me</Button>
  Then a DOM element with data-testid="button" should be present
  And it should render the text "Click me"
  And it should not throw a TypeScript error

Scenario: Button stub accepts className prop
  Given the Button stub component
  When I render <Button className="custom">Label</Button>
  Then the root element should include the "custom" class

Scenario: Table stub exports both Table and TableRow
  Given src/components/Table/index.ts exists
  When I import "{ Table, TableRow } from '@/components/Table'"
  Then both Table and TableRow should be valid React components

Scenario: SlideOver stub accepts open and onClose props
  Given src/components/SlideOver/SlideOver.tsx exists
  When I render <SlideOver open={false} onClose={() => {}}>content</SlideOver>
  Then no error should be thrown
  And the component should render without crashing

Scenario: Badge stub renders with a variant prop
  Given src/components/Badge/Badge.tsx exists
  When I render <Badge variant="success">Active</Badge>
  Then the component should render without error
  And data-testid="badge" should be present

Scenario: All ten component directories exist with the required files
  Given the scaffolding is complete
  When I inspect src/components/
  Then directories for Button, Table, SlideOver, Sidebar, Badge, Avatar, Card, Modal, InlineEdit, and RichTextEditor should each exist
  And each directory should contain a .tsx file, a .module.scss file, and an index.ts file

Scenario: Component index files export the component as a named export
  Given src/components/Avatar/index.ts exists
  When I import "{ Avatar } from '@/components/Avatar'"
  Then Avatar should be a valid React component
```

---

## Integration: Layout Uses Component Stubs

```gherkin
Scenario: DashboardLayout imports and renders the Sidebar stub
  Given the Sidebar stub exists at src/components/Sidebar/
  When DashboardLayout is rendered
  Then it should import Sidebar from "@/components/Sidebar"
  And the Sidebar component should be rendered inside the layout

Scenario: No circular imports exist between layouts and components
  Given the full src/ directory is built
  When the TypeScript compiler resolves all imports
  Then no circular dependency warnings should appear in the build output
```
