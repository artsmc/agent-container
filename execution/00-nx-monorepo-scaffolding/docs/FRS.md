# Functional Requirement Specification
## Feature 00: Nx Monorepo Scaffolding

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Overview

This document defines the precise functional requirements for establishing the Nx monorepo workspace. Every item in this document produces a concrete file or directory on disk. There is no runtime behavior — the output is a repository skeleton.

---

## 2. Root-Level Configuration Files

### FR-001: nx.json

**Requirement:** A `nx.json` file must exist at the repository root with the following configuration.

**Required fields:**

| Field | Value | Rationale |
|---|---|---|
| `$schema` | `"https://raw.githubusercontent.com/nrwl/nx/master/packages/nx/schemas/nx-schema.json"` | Enables editor validation |
| `defaultBase` | `"main"` | Ensures `nx affected` diffs against the `main` branch |
| `namedInputs.default` | `["{projectRoot}/**/*", "sharedGlobals"]` | Standard input set for task caching |
| `namedInputs.sharedGlobals` | `["{workspaceRoot}/nx.json", "{workspaceRoot}/tsconfig.base.json", "{workspaceRoot}/package.json"]` | Changes to root config invalidate all project caches |
| `namedInputs.production` | `["default", "!{projectRoot}/**/*.spec.ts", "!{projectRoot}/jest.config.*"]` | Production builds exclude test files |
| `targetDefaults.build.cache` | `true` | All build tasks are cached by default |
| `targetDefaults.lint.cache` | `true` | All lint tasks are cached by default |
| `targetDefaults.test.cache` | `true` | All test tasks are cached by default |
| `targetDefaults.build.dependsOn` | `["^build"]` | Building a project first builds its dependencies |

**Acceptance:** `nx show projects` must list all 10 registered projects without error.

---

### FR-002: tsconfig.base.json

**Requirement:** A `tsconfig.base.json` file must exist at the repository root and serve as the base TypeScript configuration inherited by all projects.

**Required compilerOptions:**

| Option | Value | Rationale |
|---|---|---|
| `rootDir` | `"."` | Workspace root is the TypeScript root |
| `sourceMap` | `true` | Enables debugging across all projects |
| `declaration` | `true` | Packages emit type declarations for consumers |
| `moduleResolution` | `"bundler"` | Modern resolution for ESM and bundler-based projects |
| `module` | `"ESNext"` | ESNext modules for all projects |
| `target` | `"ES2022"` | Node.js 18+ compatible output |
| `lib` | `["ES2022", "dom"]` | Standard library for Node and browser targets |
| `strict` | `true` | Strict mode enforced across all projects |
| `noImplicitOverride` | `true` | Prevents accidental method overrides |
| `noPropertyAccessFromIndexSignature` | `true` | Prevents unsafe index access |
| `noUncheckedIndexedAccess` | `false` | Left false for ergonomic array access |
| `esModuleInterop` | `true` | CommonJS interop |
| `skipLibCheck` | `true` | Avoids type errors in node_modules |
| `forceConsistentCasingInFileNames` | `true` | Cross-platform safety |

**Required `paths` mappings** (TypeScript path aliases for workspace packages):

| Alias | Maps to |
|---|---|
| `@iexcel/shared-types` | `["packages/shared-types/src/index.ts"]` |
| `@iexcel/api-client` | `["packages/api-client/src/index.ts"]` |
| `@iexcel/auth-client` | `["packages/auth-client/src/index.ts"]` |
| `@iexcel/database` | `["packages/database/src/index.ts"]` |
| `@iexcel/auth-database` | `["packages/auth-database/src/index.ts"]` |

**Acceptance:** `tsc --noEmit -p tsconfig.base.json` exits with code 0 (no source files to check at this stage, but the config must be valid JSON and parseable by TypeScript).

---

### FR-003: Root package.json

**Requirement:** A `package.json` must exist at the repository root defining the Nx workspace.

**Required fields:**

| Field | Value | Rationale |
|---|---|---|
| `name` | `"iexcel-monorepo"` | Workspace root identifier |
| `version` | `"0.0.0"` | Root is not published |
| `private` | `true` | Prevents accidental npm publish of root |
| `workspaces` | `["apps/*", "packages/*"]` | Registers all apps and packages as workspace members |
| `scripts.build` | `"nx run-many --target=build"` | Build all projects |
| `scripts.test` | `"nx run-many --target=test"` | Test all projects |
| `scripts.lint` | `"nx run-many --target=lint"` | Lint all projects |
| `scripts.affected:build` | `"nx affected --target=build"` | Build only affected projects |
| `scripts.affected:test` | `"nx affected --target=test"` | Test only affected projects |
| `scripts.graph` | `"nx graph"` | Open dependency graph viewer |

**Required devDependencies** (versions are current as of 2026-03; pin exact versions):

| Package | Purpose |
|---|---|
| `nx` | Nx build system core |
| `@nx/js` | Nx JavaScript/TypeScript plugin |
| `@nx/node` | Nx Node.js app plugin |
| `@nx/next` | Nx Next.js plugin (for apps/ui) |
| `@nx/eslint` | Nx ESLint integration |
| `typescript` | TypeScript compiler |
| `@types/node` | Node.js type definitions |
| `eslint` | Linter |
| `prettier` | Code formatter |

**Acceptance:** `npm install` (or `pnpm install`) completes without error. `nx --version` returns the pinned Nx version.

---

## 3. Application Projects

Each application under `apps/` must have the following structure. Source code content is out of scope — placeholder files only.

### FR-010: apps/auth/

**Directory structure:**

```
apps/auth/
├── src/
│   └── .gitkeep
├── Dockerfile
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"auth"` |
| `projectType` | `"application"` |
| `root` | `"apps/auth"` |
| `sourceRoot` | `"apps/auth/src"` |
| `tags` | `["scope:auth", "type:app"]` |
| `targets` | `{}` (empty — targets added by feature 05) |

**Dockerfile:** Single-line placeholder comment: `# Dockerfile for auth service — implemented in feature 35`

---

### FR-011: apps/api/

**Directory structure:**

```
apps/api/
├── src/
│   └── .gitkeep
├── Dockerfile
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"api"` |
| `projectType` | `"application"` |
| `root` | `"apps/api"` |
| `sourceRoot` | `"apps/api/src"` |
| `tags` | `["scope:api", "type:app"]` |
| `targets` | `{}` (empty — targets added by feature 07) |

**Dockerfile:** Single-line placeholder comment: `# Dockerfile for api service — implemented in feature 35`

---

### FR-012: apps/mastra/

**Directory structure:**

```
apps/mastra/
├── src/
│   └── .gitkeep
├── Dockerfile
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"mastra"` |
| `projectType` | `"application"` |
| `root` | `"apps/mastra"` |
| `sourceRoot` | `"apps/mastra/src"` |
| `tags` | `["scope:mastra", "type:app"]` |
| `targets` | `{}` (empty — targets added by feature 18) |

**Dockerfile:** Single-line placeholder comment: `# Dockerfile for mastra agent runtime — implemented in feature 35`

---

### FR-013: apps/ui/

**Directory structure:**

```
apps/ui/
├── src/
│   └── .gitkeep
├── Dockerfile
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"ui"` |
| `projectType` | `"application"` |
| `root` | `"apps/ui"` |
| `sourceRoot` | `"apps/ui/src"` |
| `tags` | `["scope:ui", "type:app"]` |
| `targets` | `{}` (empty — targets added by feature 23) |

**Dockerfile:** Single-line placeholder comment: `# Dockerfile for ui — implemented in feature 35`

---

## 4. Package Projects

Each package under `packages/` must have the following structure.

### FR-020: packages/shared-types/

**Directory structure:**

```
packages/shared-types/
├── src/
│   ├── task.ts       # placeholder
│   ├── agenda.ts     # placeholder
│   ├── client.ts     # placeholder
│   ├── auth.ts       # placeholder
│   ├── api.ts        # placeholder
│   └── index.ts      # placeholder re-exports
└── project.json
```

**Placeholder file content for all `.ts` files:** A single comment line: `// Placeholder — implemented in feature 01`

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"shared-types"` |
| `projectType` | `"library"` |
| `root` | `"packages/shared-types"` |
| `sourceRoot` | `"packages/shared-types/src"` |
| `tags` | `["scope:shared", "type:types"]` |
| `targets` | `{}` (empty — targets added by feature 01) |

**Note:** The `src/` placeholder files are required here (unlike apps) because feature 01 will populate them with types and downstream packages need the path aliases to resolve during TypeScript compilation.

---

### FR-021: packages/api-client/

**Directory structure:**

```
packages/api-client/
├── src/
│   └── index.ts      # placeholder
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"api-client"` |
| `projectType` | `"library"` |
| `root` | `"packages/api-client"` |
| `sourceRoot` | `"packages/api-client/src"` |
| `tags` | `["scope:shared", "type:client"]` |
| `implicitDependencies` | `["shared-types"]` |
| `targets` | `{}` (empty — targets added by feature 22) |

---

### FR-022: packages/auth-client/

**Directory structure:**

```
packages/auth-client/
├── src/
│   └── index.ts      # placeholder
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"auth-client"` |
| `projectType` | `"library"` |
| `root` | `"packages/auth-client"` |
| `sourceRoot` | `"packages/auth-client/src"` |
| `tags` | `["scope:auth", "type:client"]` |
| `targets` | `{}` (empty — targets added by feature 06) |

---

### FR-023: packages/database/

**Directory structure:**

```
packages/database/
├── migrations/
│   └── .gitkeep
├── seeds/
│   └── .gitkeep
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"database"` |
| `projectType` | `"library"` |
| `root` | `"packages/database"` |
| `sourceRoot` | `"packages/database"` |
| `tags` | `["scope:database", "type:migrations"]` |
| `targets` | `{}` (empty — targets added by feature 04) |

**Note:** No `src/` directory — this package holds migrations and seeds, not TypeScript source. The path alias for `@iexcel/database` in tsconfig.base.json points to a future `src/index.ts` that feature 04 will create.

---

### FR-024: packages/auth-database/

**Directory structure:**

```
packages/auth-database/
├── migrations/
│   └── .gitkeep
├── seeds/
│   └── .gitkeep
└── project.json
```

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"auth-database"` |
| `projectType` | `"library"` |
| `root` | `"packages/auth-database"` |
| `sourceRoot` | `"packages/auth-database"` |
| `tags` | `["scope:auth", "type:migrations"]` |
| `targets` | `{}` (empty — targets added by feature 03) |

---

## 5. Infrastructure Scaffolding

### FR-030: infra/terraform/

**Directory structure:**

```
infra/
└── terraform/
    ├── modules/
    │   ├── networking/
    │   │   └── .gitkeep
    │   ├── database/
    │   │   └── .gitkeep
    │   ├── auth-database/
    │   │   └── .gitkeep
    │   ├── container-registry/
    │   │   └── .gitkeep
    │   ├── auth/
    │   │   └── .gitkeep
    │   ├── api/
    │   │   └── .gitkeep
    │   ├── mastra/
    │   │   └── .gitkeep
    │   ├── ui/
    │   │   └── .gitkeep
    │   ├── secrets/
    │   │   └── .gitkeep
    │   ├── dns/
    │   │   └── .gitkeep
    │   └── iam/
    │       └── .gitkeep
    ├── environments/
    │   ├── dev.tfvars
    │   ├── staging.tfvars
    │   └── production.tfvars
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── project.json
```

**Placeholder file content:**
- `main.tf`: Single comment: `# Terraform root module — implemented in feature 02`
- `variables.tf`: Single comment: `# Terraform variables — implemented in feature 02`
- `outputs.tf`: Single comment: `# Terraform outputs — implemented in feature 02`
- `*.tfvars` files: Single comment per file, e.g., `# dev environment variables — implemented in feature 02`

**project.json requirements:**

| Field | Value |
|---|---|
| `name` | `"infra"` |
| `projectType` | `"library"` |
| `root` | `"infra/terraform"` |
| `sourceRoot` | `"infra/terraform"` |
| `tags` | `["scope:infra", "type:terraform"]` |
| `targets` | `{}` (empty — targets added by feature 02) |

---

## 6. .gitignore Requirements

### FR-040: Root .gitignore

**Requirement:** A `.gitignore` must exist at the repository root including the following entries:

```
# Nx
.nx/cache
.nx/workspace-data
dist/
tmp/

# Node
node_modules/
.npm/

# Environment
.env
.env.*
!.env.example

# TypeScript
*.tsbuildinfo

# Job queue (temporary spec work)
/job-queue

# OS
.DS_Store
Thumbs.db
```

**Acceptance:** `git status` does not show `.nx/cache` or `node_modules/` as tracked files after running `npm install`.

---

## 7. Validation Requirements

### FR-050: Nx Project Graph Integrity

After all files are created:

1. `nx show projects` must list exactly these 10 projects:
   - `auth`, `api`, `mastra`, `ui`
   - `shared-types`, `api-client`, `auth-client`, `database`, `auth-database`
   - `infra`
2. `nx graph` must render without errors
3. No circular dependencies must be detected

### FR-051: TypeScript Configuration Validity

1. `tsconfig.base.json` must be valid JSON
2. All path aliases must point to files or directories that exist on disk
3. No TypeScript errors from the base configuration itself

### FR-052: Package Manager Installation

1. `npm install` (or `pnpm install`) must complete with zero errors
2. All devDependencies declared in package.json must be resolvable and installable
