# Task Update: Feature 23 -- UI Scaffolding

## Status: Complete

## Gherkin Specification

```gherkin
Feature: UI Scaffolding -- Next.js App with Design Tokens and Layouts

  Scenario: Design tokens compile without errors
    Given the ui-tokens package exists at packages/ui-tokens/ with all 7 SCSS token files
    And the index.scss forwards all token partials via @forward
    When a SCSS module file uses token variables via the tokens namespace
    Then all token variables resolve without SCSS compilation errors

  Scenario: Next.js app builds successfully
    Given apps/ui has package.json with next, react, react-dom, sass-embedded
    And next.config.ts has sassOptions with additionalData auto-importing tokens
    And tsconfig.json extends the monorepo root with @/* path alias
    When nx run ui:build is executed
    Then the build completes with zero errors
    And no TypeScript errors are reported
    And no SCSS compilation errors occur

  Scenario: Dashboard layout renders with sidebar and nav
    Given the (dashboard) route group has a layout wrapping children in DashboardLayout
    And DashboardLayout includes a Sidebar with NavLinks
    When the root page at / is loaded
    Then a sidebar with 6 navigation links is visible
    And the main content area renders the dashboard page
    And NavLinks highlights the active route

  Scenario: Public layout renders without internal navigation
    Given the shared/[token] route has a layout wrapping children in PublicLayout
    When a public page at /shared/test-token is loaded
    Then a centered layout with branded "iExcel" header is visible
    And no internal navigation links are present

  Scenario: All 10 component stubs are correctly typed
    Given all 10 component stub directories exist with .tsx, .module.scss, and index.ts
    When the TypeScript compiler runs
    Then zero type errors are reported
    And all exports resolve correctly

  Scenario: No forbidden dependencies are present
    Given apps/ui/package.json is the UI dependency manifest
    When the package.json is inspected
    Then tailwindcss is absent
    And @shadcn/ui is absent
    And @radix-ui/* is absent
    And no tailwind.config.* file exists
```

## Verification Results

- `nx run ui:build` -- PASSED (compiled successfully, all static pages generated)
- Dependency audit -- PASSED (no Tailwind, no shadcn, no Radix UI)
- Nx project config -- PASSED (dev, build, lint, type-check targets registered)
- Nx dependency graph -- PASSED (ui depends on ui-tokens, shared-types, api-client)
- File structure -- PASSED (all 7 token files, 10 component stubs, 2 layouts, root layout, global styles, mixins)

## Architecture Note

CSS custom properties (:root declarations) are consolidated in globals.scss rather than in individual token partial files. This avoids the CSS Module "not pure" selector error that occurs when additionalData injects :root blocks into .module.scss files. The token partials contain only SCSS variables, while globals.scss mirrors them as CSS custom properties on :root for runtime access.
