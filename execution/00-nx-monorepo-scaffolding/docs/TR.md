# Technical Requirements
## Feature 00: Nx Monorepo Scaffolding

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Technology Stack

| Concern | Tool | Version |
|---|---|---|
| Build system | Nx | 20.x (latest stable) |
| Language | TypeScript | 5.x |
| Runtime target | Node.js | 22 LTS |
| Package manager | pnpm | 9.x (recommended) |
| Linter | ESLint | 9.x (flat config) |
| Formatter | Prettier | 3.x |

**Rationale for pnpm:** pnpm's strict node_modules isolation prevents phantom dependency bugs (where an app accidentally uses a package it didn't declare). This is important in a monorepo where multiple apps share the same node_modules hoist strategy. pnpm workspaces are natively supported by Nx 20.

**Rationale for Nx 20.x:** Nx 20 introduced first-class TypeScript project references support and the `nx sync` command for keeping them in sync automatically. This enables fine-grained, parallelizable type-checking that scales across CI agents.

---

## 2. Repository Structure (Complete)

```
/
├── apps/
│   ├── auth/
│   │   ├── src/
│   │   │   └── .gitkeep
│   │   ├── Dockerfile
│   │   └── project.json
│   ├── api/
│   │   ├── src/
│   │   │   └── .gitkeep
│   │   ├── Dockerfile
│   │   └── project.json
│   ├── mastra/
│   │   ├── src/
│   │   │   └── .gitkeep
│   │   ├── Dockerfile
│   │   └── project.json
│   └── ui/
│       ├── src/
│       │   └── .gitkeep
│       ├── Dockerfile
│       └── project.json
│
├── packages/
│   ├── shared-types/
│   │   ├── src/
│   │   │   ├── task.ts       # placeholder comment
│   │   │   ├── agenda.ts     # placeholder comment
│   │   │   ├── client.ts     # placeholder comment
│   │   │   ├── auth.ts       # placeholder comment
│   │   │   ├── api.ts        # placeholder comment
│   │   │   └── index.ts      # placeholder comment
│   │   └── project.json
│   ├── api-client/
│   │   ├── src/
│   │   │   └── index.ts      # placeholder comment
│   │   └── project.json
│   ├── auth-client/
│   │   ├── src/
│   │   │   └── index.ts      # placeholder comment
│   │   └── project.json
│   ├── database/
│   │   ├── migrations/
│   │   │   └── .gitkeep
│   │   ├── seeds/
│   │   │   └── .gitkeep
│   │   └── project.json
│   └── auth-database/
│       ├── migrations/
│       │   └── .gitkeep
│       ├── seeds/
│       │   └── .gitkeep
│       └── project.json
│
├── infra/
│   └── terraform/
│       ├── modules/
│       │   ├── networking/      .gitkeep
│       │   ├── database/        .gitkeep
│       │   ├── auth-database/   .gitkeep
│       │   ├── container-registry/ .gitkeep
│       │   ├── auth/            .gitkeep
│       │   ├── api/             .gitkeep
│       │   ├── mastra/          .gitkeep
│       │   ├── ui/              .gitkeep
│       │   ├── secrets/         .gitkeep
│       │   ├── dns/             .gitkeep
│       │   └── iam/             .gitkeep
│       ├── environments/
│       │   ├── dev.tfvars       # placeholder comment
│       │   ├── staging.tfvars   # placeholder comment
│       │   └── production.tfvars # placeholder comment
│       ├── main.tf              # placeholder comment
│       ├── variables.tf         # placeholder comment
│       ├── outputs.tf           # placeholder comment
│       └── project.json
│
├── .gitignore
├── nx.json
├── package.json
└── tsconfig.base.json
```

---

## 3. File Specifications

### 3.1 nx.json

```json
{
  "$schema": "https://raw.githubusercontent.com/nrwl/nx/master/packages/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "namedInputs": {
    "sharedGlobals": [
      "{workspaceRoot}/nx.json",
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/package.json"
    ],
    "default": [
      "{projectRoot}/**/*",
      "sharedGlobals"
    ],
    "production": [
      "default",
      "!{projectRoot}/**/*.spec.ts",
      "!{projectRoot}/**/*.test.ts",
      "!{projectRoot}/jest.config.*",
      "!{projectRoot}/.eslintrc.*"
    ]
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "lint": {
      "inputs": ["default", "{workspaceRoot}/.eslintrc*", "{workspaceRoot}/eslint.config.*"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production"],
      "cache": true
    },
    "type-check": {
      "inputs": ["default", "^production"],
      "cache": true
    }
  },
  "plugins": [],
  "generators": {}
}
```

**Implementation notes:**
- Do NOT add `tasksRunnerOptions` with Nx Cloud at this stage — that is configured in feature 34 (CI/CD pipeline)
- Do NOT add `implicitDependencies` at the workspace level — those are expressed in individual project.json files
- The `plugins` array is intentionally empty — plugins are added as features introduce new project types

---

### 3.2 tsconfig.base.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022", "dom"],
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "paths": {
      "@iexcel/shared-types": ["packages/shared-types/src/index.ts"],
      "@iexcel/shared-types/*": ["packages/shared-types/src/*"],
      "@iexcel/api-client": ["packages/api-client/src/index.ts"],
      "@iexcel/api-client/*": ["packages/api-client/src/*"],
      "@iexcel/auth-client": ["packages/auth-client/src/index.ts"],
      "@iexcel/auth-client/*": ["packages/auth-client/src/*"],
      "@iexcel/database": ["packages/database/src/index.ts"],
      "@iexcel/database/*": ["packages/database/src/*"],
      "@iexcel/auth-database": ["packages/auth-database/src/index.ts"],
      "@iexcel/auth-database/*": ["packages/auth-database/src/*"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

**Implementation notes:**
- `isolatedModules: true` is required for esbuild and SWC compatibility (Nx's default transpilers)
- `declarationMap: true` enables "Go to Definition" in editors to jump to source, not compiled output
- The wildcard path aliases (`@iexcel/shared-types/*`) allow importing subpaths (e.g., `@iexcel/shared-types/task`)
- `moduleResolution: "bundler"` is the correct setting for Nx 20 with bundler-based builds

---

### 3.3 Root package.json

```json
{
  "name": "iexcel-monorepo",
  "version": "0.0.0",
  "license": "UNLICENSED",
  "private": true,
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.x",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "nx run-many --target=build",
    "build:affected": "nx affected --target=build",
    "test": "nx run-many --target=test",
    "test:affected": "nx affected --target=test",
    "lint": "nx run-many --target=lint",
    "lint:affected": "nx affected --target=lint",
    "type-check": "nx run-many --target=type-check",
    "graph": "nx graph",
    "format": "nx format:write",
    "format:check": "nx format:check"
  },
  "devDependencies": {
    "nx": "~20.0.0",
    "@nx/js": "~20.0.0",
    "@nx/node": "~20.0.0",
    "@nx/next": "~20.0.0",
    "@nx/eslint": "~20.0.0",
    "@nx/eslint-plugin": "~20.0.0",
    "typescript": "~5.7.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

**Implementation notes:**
- Use `~` (tilde) for Nx packages to allow patch updates within the same minor version
- Use `^` (caret) for non-Nx tools to allow minor updates
- The `engines` field enforces Node.js 22 and pnpm 9 — CI and local dev must match
- `packageManager` field (part of corepack spec) allows `corepack enable` to auto-install the correct pnpm version
- Additional dependencies (express, mastra, next, etc.) are added by downstream features in their own package.json files, not here

---

### 3.4 project.json Schema (per project)

**Minimum valid project.json for an app (example: auth):**

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "auth",
  "projectType": "application",
  "root": "apps/auth",
  "sourceRoot": "apps/auth/src",
  "tags": ["scope:auth", "type:app"],
  "targets": {}
}
```

**Minimum valid project.json for a library (example: shared-types):**

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "shared-types",
  "projectType": "library",
  "root": "packages/shared-types",
  "sourceRoot": "packages/shared-types/src",
  "tags": ["scope:shared", "type:types"],
  "targets": {}
}
```

**$schema path note:** The relative path `../../node_modules/nx/schemas/project-schema.json` is correct for apps and packages two levels deep. For `infra/terraform/project.json`, the relative path is `../../node_modules/nx/schemas/project-schema.json` (same depth, two directories up from `infra/terraform/`).

---

### 3.5 Project Tag Taxonomy

Tags are used by `nx affected` lint rules to enforce architectural boundaries (enforced by @nx/eslint-plugin in future features). Establish the taxonomy now:

**Scope tags:**

| Tag | Projects |
|---|---|
| `scope:auth` | auth (app), auth-client, auth-database |
| `scope:api` | api (app) |
| `scope:mastra` | mastra (app) |
| `scope:ui` | ui (app) |
| `scope:shared` | shared-types, api-client |
| `scope:database` | database |
| `scope:infra` | infra |

**Type tags:**

| Tag | Projects |
|---|---|
| `type:app` | auth, api, mastra, ui |
| `type:types` | shared-types |
| `type:client` | api-client, auth-client |
| `type:migrations` | database, auth-database |
| `type:terraform` | infra |

---

## 4. Nx Dependency Graph

The dependency relationships expressed via `implicitDependencies` in project.json files (where explicit imports do not yet exist at this scaffold stage):

```
shared-types        (no implicit deps — root of the graph)
api-client          implicitDependencies: ["shared-types"]
auth-client         (no implicit deps at scaffold stage)
database            (no implicit deps at scaffold stage)
auth-database       (no implicit deps at scaffold stage)
auth                (no implicit deps at scaffold stage)
api                 (no implicit deps at scaffold stage)
mastra              (no implicit deps at scaffold stage)
ui                  (no implicit deps at scaffold stage)
infra               (no implicit deps at scaffold stage)
```

**Note:** Full dependency relationships (e.g., api depending on database, ui depending on api-client) will be established when downstream features add actual imports. The `implicitDependencies` fields in this feature are minimal — only relationships that are architecturally certain and cannot be inferred from imports yet.

---

## 5. Performance Requirements

| Operation | Target |
|---|---|
| `nx show projects` | < 3 seconds |
| `nx graph` (open browser) | < 5 seconds |
| `npm install` / `pnpm install` | < 60 seconds on clean cache |
| `tsc --noEmit -p tsconfig.base.json` | < 2 seconds (no source files at this stage) |

---

## 6. Security Requirements

| Requirement | Implementation |
|---|---|
| No secrets in repository | `.gitignore` excludes `.env` and `.env.*` files |
| No accidental secret commits | `.env.example` is allowed (no real values) |
| Dependency integrity | pnpm's lockfile (`pnpm-lock.yaml`) must be committed |
| No publicly published packages | All package.json files (root and per-project) must have `"private": true` |

---

## 7. Implementation Strategy

### Order of File Creation

Create files in this order to avoid validation errors during intermediate states:

1. `.gitignore` — prevents accidental staging of generated files
2. `package.json` — defines workspace structure
3. `nx.json` — Nx workspace config (requires package.json to exist)
4. `tsconfig.base.json` — TypeScript base config
5. All `apps/*/project.json` files — app project configs
6. All `packages/*/project.json` files — package project configs
7. `infra/terraform/project.json` — infra project config
8. All placeholder source files (`src/.gitkeep`, `src/index.ts`, etc.)
9. All placeholder Terraform files (`main.tf`, `variables.tf`, etc.)
10. Run `pnpm install` to generate lockfile
11. Run `nx show projects` to validate

### Placeholder File Strategy

- **Directories that must exist but have no files yet:** Use `.gitkeep` (a git convention for tracking empty directories)
- **TypeScript entry points that path aliases point to:** Use a comment-only `index.ts` (cannot be empty because TypeScript will complain about missing modules when the alias is resolved)
- **Terraform files:** Use a comment-only single line — Terraform will not parse comments as resources

### Avoiding Common Pitfalls

| Pitfall | Mitigation |
|---|---|
| `$schema` path in project.json is wrong for nested directories | Always count directory levels from project root and use the correct relative path |
| pnpm hoisting conflicts | Add `.npmrc` with `node-linker=hoisted` only if a downstream package explicitly requires it |
| Nx cannot detect projects outside workspaces | Ensure `infra/terraform` is either in the `workspaces` array or detected via project.json — since it is not under `apps/` or `packages/`, Nx detects it via the presence of `project.json` at that path |
| tsconfig.base.json paths pointing to non-existent files | Placeholder `index.ts` files must exist for all path aliases defined in tsconfig.base.json |
| TypeScript errors from empty placeholder files | Placeholder files must contain at least one comment line, not be truly empty |

---

## 8. Migration Strategy

This is a greenfield project — there is no existing codebase to migrate from. No migration is required.

---

## 9. Open Technical Questions

| Question | Default Assumption | Who Decides |
|---|---|---|
| npm vs pnpm vs yarn? | pnpm 9.x (recommended in this spec) | Tech lead |
| Nx Cloud remote caching? | Deferred to feature 34 (CI/CD) | Tech lead |
| Node.js 20 LTS vs 22 LTS? | Node.js 22 LTS (current active LTS as of 2026-03) | Tech lead |
| TypeScript 5.7 vs 5.8? | 5.7 (stable); update to 5.8 when Nx officially supports it | Tech lead |
| GCP vs AWS? | Not determined; Terraform scaffold is cloud-agnostic | Business |
| Nx eslint flat config vs legacy .eslintrc? | Flat config (eslint.config.js) — Nx 20 defaults to flat config | Tech lead |

---

## 10. Downstream Feature Impact

This feature's decisions are inherited by all 14 directly blocked features. The most impactful decisions are:

| Decision Made Here | Features Impacted |
|---|---|
| TypeScript path aliases (`@iexcel/*`) | 01, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22 |
| Nx project naming convention | 01–38 (all features reference project names in nx run commands) |
| pnpm as package manager | 34 (CI/CD must use pnpm install) |
| Tag taxonomy (`scope:*`, `type:*`) | 34 (CI/CD uses tags for selective deployment) |
| `apps/` and `packages/` as workspace roots | 01–38 (all features add code under these directories) |
| `tsconfig.base.json` compilerOptions | All TypeScript features — changing target or strict settings later is a large refactor |
