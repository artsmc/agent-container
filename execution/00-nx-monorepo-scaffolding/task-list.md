# Task List
## Feature 00: Nx Monorepo Scaffolding

**Version:** 1.0
**Date:** 2026-03-03
**Estimated total complexity:** Medium (1–2 days)

---

## Prerequisites

Before starting, confirm with the tech lead:
- [ ] Package manager decision: pnpm (recommended) vs npm vs yarn
- [ ] Node.js version: 22 LTS (recommended) vs 20 LTS
- [ ] Nx version to pin: 20.x (latest stable, verify at nx.dev)
- [ ] TypeScript version to pin: 5.7.x (verify Nx 20 compatibility)

---

## Phase 1: Establish Repository Root (no dependencies)

- [ ] **TASK-001** — Add `/job-queue` to `.gitignore`
  - Create `.gitignore` at the repository root
  - Include `/job-queue` entry so spec documents are never committed
  - Include all other entries from FRS.md FR-040 (node_modules, .nx/cache, dist/, .env, *.tsbuildinfo, .DS_Store)
  - References: FRS.md §6 (FR-040), TR.md §3.5
  - Complexity: Small
  - Verify: `git check-ignore -v /job-queue` returns a match

- [ ] **TASK-002** — Create root `package.json`
  - Set `"name": "iexcel-monorepo"`, `"private": true`, `"version": "0.0.0"`
  - Add `"workspaces": ["apps/*", "packages/*"]`
  - Add `"engines"` enforcing Node.js >=22 and pnpm >=9
  - Add `"packageManager": "pnpm@9.x"` (or exact version)
  - Add all `scripts` from TR.md §3.3
  - Add all `devDependencies` from TR.md §3.3 with pinned versions
  - References: FRS.md §2 (FR-003), TR.md §3.3
  - Complexity: Small
  - Verify: File is valid JSON, `private` is true, `workspaces` includes both `apps/*` and `packages/*`

- [ ] **TASK-003** — Create `nx.json`
  - Add `$schema`, `defaultBase: "main"`, `namedInputs`, and `targetDefaults` per TR.md §3.1
  - Do NOT add Nx Cloud configuration (deferred to feature 34)
  - Do NOT add any plugins (added by downstream features)
  - References: FRS.md §2 (FR-001), TR.md §3.1
  - Complexity: Small
  - Verify: File is valid JSON. `nx show projects` will validate this later.

- [ ] **TASK-004** — Create `tsconfig.base.json`
  - Add all `compilerOptions` from TR.md §3.2
  - Add all 10 `paths` entries (5 base aliases + 5 wildcard aliases) from TR.md §3.2
  - References: FRS.md §2 (FR-002), TR.md §3.2
  - Complexity: Small
  - Verify: `cat tsconfig.base.json | python3 -m json.tool` exits 0 (valid JSON)

---

## Phase 2: Application Project Scaffolding (depends on Phase 1)

- [ ] **TASK-010** — Scaffold `apps/auth/`
  - Create `apps/auth/src/.gitkeep`
  - Create `apps/auth/Dockerfile` with placeholder comment referencing feature 35
  - Create `apps/auth/project.json` per FRS.md FR-010 and TR.md §3.4
    - name: "auth", projectType: "application", tags: ["scope:auth", "type:app"]
  - References: FRS.md §3 (FR-010), TR.md §3.4, §3.5
  - Complexity: Small

- [ ] **TASK-011** — Scaffold `apps/api/`
  - Create `apps/api/src/.gitkeep`
  - Create `apps/api/Dockerfile` with placeholder comment referencing feature 35
  - Create `apps/api/project.json` per FRS.md FR-011 and TR.md §3.4
    - name: "api", projectType: "application", tags: ["scope:api", "type:app"]
  - References: FRS.md §3 (FR-011), TR.md §3.4, §3.5
  - Complexity: Small

- [ ] **TASK-012** — Scaffold `apps/mastra/`
  - Create `apps/mastra/src/.gitkeep`
  - Create `apps/mastra/Dockerfile` with placeholder comment referencing feature 35
  - Create `apps/mastra/project.json` per FRS.md FR-012 and TR.md §3.4
    - name: "mastra", projectType: "application", tags: ["scope:mastra", "type:app"]
  - References: FRS.md §3 (FR-012), TR.md §3.4, §3.5
  - Complexity: Small

- [ ] **TASK-013** — Scaffold `apps/ui/`
  - Create `apps/ui/src/.gitkeep`
  - Create `apps/ui/Dockerfile` with placeholder comment referencing feature 35
  - Create `apps/ui/project.json` per FRS.md FR-013 and TR.md §3.4
    - name: "ui", projectType: "application", tags: ["scope:ui", "type:app"]
  - References: FRS.md §3 (FR-013), TR.md §3.4, §3.5
  - Complexity: Small

---

## Phase 3: Package Project Scaffolding (depends on Phase 1)

- [ ] **TASK-020** — Scaffold `packages/shared-types/`
  - Create `packages/shared-types/src/task.ts` — comment: `// Placeholder — implemented in feature 01`
  - Create `packages/shared-types/src/agenda.ts` — same comment
  - Create `packages/shared-types/src/client.ts` — same comment
  - Create `packages/shared-types/src/auth.ts` — same comment
  - Create `packages/shared-types/src/api.ts` — same comment
  - Create `packages/shared-types/src/index.ts` — same comment
  - Create `packages/shared-types/project.json` per FRS.md FR-020 and TR.md §3.4
    - name: "shared-types", projectType: "library", tags: ["scope:shared", "type:types"]
  - References: FRS.md §4 (FR-020), TR.md §3.4
  - Complexity: Small
  - Critical note: The 6 placeholder `.ts` files MUST exist because tsconfig.base.json path aliases point to them

- [ ] **TASK-021** — Scaffold `packages/api-client/`
  - Create `packages/api-client/src/index.ts` — comment: `// Placeholder — implemented in feature 22`
  - Create `packages/api-client/project.json` per FRS.md FR-021 and TR.md §3.4
    - name: "api-client", projectType: "library", tags: ["scope:shared", "type:client"]
    - implicitDependencies: ["shared-types"]
  - References: FRS.md §4 (FR-021), TR.md §3.4
  - Complexity: Small

- [ ] **TASK-022** — Scaffold `packages/auth-client/`
  - Create `packages/auth-client/src/index.ts` — comment: `// Placeholder — implemented in feature 06`
  - Create `packages/auth-client/project.json` per FRS.md FR-022 and TR.md §3.4
    - name: "auth-client", projectType: "library", tags: ["scope:auth", "type:client"]
  - References: FRS.md §4 (FR-022), TR.md §3.4
  - Complexity: Small

- [ ] **TASK-023** — Scaffold `packages/database/`
  - Create `packages/database/migrations/.gitkeep`
  - Create `packages/database/seeds/.gitkeep`
  - Create `packages/database/project.json` per FRS.md FR-023 and TR.md §3.4
    - name: "database", projectType: "library", tags: ["scope:database", "type:migrations"]
    - sourceRoot: "packages/database" (no src/ directory)
  - References: FRS.md §4 (FR-023), TR.md §3.4
  - Complexity: Small

- [ ] **TASK-024** — Scaffold `packages/auth-database/`
  - Create `packages/auth-database/migrations/.gitkeep`
  - Create `packages/auth-database/seeds/.gitkeep`
  - Create `packages/auth-database/project.json` per FRS.md FR-024 and TR.md §3.4
    - name: "auth-database", projectType: "library", tags: ["scope:auth", "type:migrations"]
    - sourceRoot: "packages/auth-database" (no src/ directory)
  - References: FRS.md §4 (FR-024), TR.md §3.4
  - Complexity: Small

---

## Phase 4: Terraform Infrastructure Scaffolding (depends on Phase 1)

- [ ] **TASK-030** — Create Terraform module directories
  - Create `.gitkeep` in each of these directories:
    - `infra/terraform/modules/networking/`
    - `infra/terraform/modules/database/`
    - `infra/terraform/modules/auth-database/`
    - `infra/terraform/modules/container-registry/`
    - `infra/terraform/modules/auth/`
    - `infra/terraform/modules/api/`
    - `infra/terraform/modules/mastra/`
    - `infra/terraform/modules/ui/`
    - `infra/terraform/modules/secrets/`
    - `infra/terraform/modules/dns/`
    - `infra/terraform/modules/iam/`
  - References: FRS.md §5 (FR-030), context.md Scope section
  - Complexity: Small

- [ ] **TASK-031** — Create Terraform root module placeholder files
  - Create `infra/terraform/main.tf` with comment: `# Terraform root module — implemented in feature 02`
  - Create `infra/terraform/variables.tf` with comment: `# Terraform variables — implemented in feature 02`
  - Create `infra/terraform/outputs.tf` with comment: `# Terraform outputs — implemented in feature 02`
  - References: FRS.md §5 (FR-030)
  - Complexity: Small

- [ ] **TASK-032** — Create Terraform environment variable files
  - Create `infra/terraform/environments/dev.tfvars` with comment: `# dev environment variables — implemented in feature 02`
  - Create `infra/terraform/environments/staging.tfvars` with comment: `# staging environment variables — implemented in feature 02`
  - Create `infra/terraform/environments/production.tfvars` with comment: `# production environment variables — implemented in feature 02`
  - References: FRS.md §5 (FR-030)
  - Complexity: Small

- [ ] **TASK-033** — Create `infra/terraform/project.json`
  - Create project.json per FRS.md FR-030 and TR.md §3.4
    - name: "infra", projectType: "library", tags: ["scope:infra", "type:terraform"]
    - root: "infra/terraform", sourceRoot: "infra/terraform"
  - References: FRS.md §5 (FR-030), TR.md §3.4
  - Complexity: Small
  - Note: The `$schema` relative path for this file is `../../node_modules/nx/schemas/project-schema.json`

---

## Phase 5: Dependency Installation and Validation (depends on Phases 1–4)

- [ ] **TASK-040** — Run package manager install
  - Run `pnpm install` from the repository root
  - Commit the generated `pnpm-lock.yaml` to the repository
  - References: FRS.md §2 (FR-003), TR.md §6
  - Complexity: Small
  - Verify: Command exits with code 0, `node_modules/` is created, `pnpm-lock.yaml` is generated

- [ ] **TASK-041** — Validate Nx project registration
  - Run `nx show projects` from the repository root
  - Confirm the output lists exactly these 10 projects: auth, api, mastra, ui, shared-types, api-client, auth-client, database, auth-database, infra
  - References: FRS.md §7 (FR-050), GS.md "nx show projects lists exactly 10 projects"
  - Complexity: Small
  - Verify: All 10 project names appear, no error output

- [ ] **TASK-042** — Validate Nx dependency graph
  - Run `nx graph --file=graph-output.json` from the repository root
  - Confirm the command exits with code 0
  - Open `graph-output.json` and verify no cycles are present
  - Delete `graph-output.json` before committing (add to .gitignore if needed)
  - References: FRS.md §7 (FR-050), GS.md "Nx dependency graph has no circular dependencies"
  - Complexity: Small

- [ ] **TASK-043** — Validate TypeScript configuration
  - Run `tsc --noEmit -p tsconfig.base.json` from the repository root
  - Confirm the command exits with code 0
  - References: FRS.md §7 (FR-051)
  - Complexity: Small
  - Note: Expected to succeed quickly — no source files are compiled at this stage

- [ ] **TASK-044** — Audit no application code was committed
  - Review all staged files before committing
  - Confirm no `.ts` file contains any class, interface, type, function, or const declarations
  - Confirm no Dockerfile contains any FROM, RUN, COPY, or CMD instructions
  - Confirm no `.tf` file contains any resource, module, provider, or variable blocks
  - References: GS.md "No application source code is committed in this feature"
  - Complexity: Small

---

## Phase 6: Commit (depends on Phase 5 — all validations passing)

- [ ] **TASK-050** — Create the feature commit
  - Stage all new files created in Phases 1–4
  - Write commit message: `feat(monorepo): scaffold Nx workspace with apps, packages, and infra structure`
  - Do not include `pnpm-lock.yaml` if it is very large and team prefers a separate lock-file commit
  - Complexity: Small
  - Verify: `git log --oneline -1` shows the commit, `git show --stat HEAD` lists expected files

---

## Completion Checklist

Before marking this feature as done, verify:

- [ ] `nx show projects` lists all 10 projects
- [ ] `nx graph` renders without errors
- [ ] `tsc --noEmit -p tsconfig.base.json` exits 0
- [ ] `pnpm install` exits 0
- [ ] `.gitignore` contains `/job-queue`
- [ ] No TypeScript declarations, Terraform resources, or Dockerfile instructions in any placeholder file
- [ ] `pnpm-lock.yaml` is committed
- [ ] All 14 downstream feature teams have been notified the branch is ready to merge

---

## Unblocking Downstream Features After Merge

Once this feature merges to `main`, the following features can begin immediately (in parallel):

| Feature | Can Start |
|---|---|
| 01 — shared-types-package | Immediately |
| 02 — terraform-base-infra | Immediately |
| 03 — auth-database-schema | Immediately |
| 04 — product-database-schema | Waits for 01 also |
| 05 — auth-service | Waits for 03 also |
| 06 — auth-client-package | Waits for 05 also |
| 07 — api-scaffolding | Waits for 04, 06 also |
| 08 — input-normalizer-text | Waits for 01, 07 also |
| 09 — client-management | Waits for 07 also |
| 18 — mastra-runtime-setup | Immediately |
| 22 — api-client-package | Waits for 01, 07 also |
| 23 — ui-scaffolding | Immediately |
| 34 — cicd-pipeline | Immediately |
| 35 — container-builds | Waits for 34 also |

Features 01, 02, 03, 18, 23, and 34 can start the moment this feature merges.
