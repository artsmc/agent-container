# Feature Requirement Document
## Feature 00: Nx Monorepo Scaffolding

**Version:** 1.0
**Date:** 2026-03-03
**Phase:** 0 — Monorepo & Tooling
**Status:** Pending

---

## 1. Business Objective

The iExcel automation system comprises four containerized applications (auth, api, mastra, ui), five shared packages (shared-types, api-client, auth-client, database, auth-database), and a Terraform infrastructure layer. Without a unified monorepo, these components would be managed as separate repositories, leading to dependency drift, redundant tooling configuration, inconsistent TypeScript compiler settings, and the inability to selectively build and deploy only what changed.

This feature establishes the Nx monorepo workspace that all 38 subsequent features build on. It is the single most critical deliverable in the project: nothing else can begin until it exists.

---

## 2. Value Proposition

| Without This Feature | With This Feature |
|---|---|
| 14 downstream features blocked with no place to put code | 14 features can begin development in parallel immediately after merge |
| No shared TypeScript compiler settings — each project configures independently | Single tsconfig.base.json ensures consistent type safety across all projects |
| No defined dependency graph — changes in shared-types silently break consumers | Nx dependency graph enforces and visualizes cross-project relationships |
| No selective build/deploy — any change triggers full rebuild | Nx affected graph ensures only changed projects rebuild and redeploy |
| No standard project naming convention — teams invent their own | Consistent project.json naming and tagging across all apps and packages |

---

## 3. Target Users

| User | How They Interact With This Feature |
|---|---|
| **Backend engineer** | Adds source code to `apps/api/src/` and `apps/auth/src/` knowing the project structure is already defined |
| **Frontend engineer** | Works inside `apps/ui/src/` with TypeScript path aliases pre-wired via tsconfig.base.json |
| **Infrastructure engineer** | Populates `infra/terraform/` modules knowing the directory skeleton and project.json already exist |
| **AI agent (spec writer / code writer)** | Reads project.json files to understand project names, types, and tags before generating code |
| **CI/CD pipeline** | Runs `nx affected` against the workspace root to determine what needs building and deploying |

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| `nx show projects` lists all 10 projects without error | Pass |
| `nx graph` renders the full dependency graph without cycles | Pass, no cycles detected |
| `tsc --noEmit -p tsconfig.base.json` exits with code 0 | Pass |
| All 14 downstream features can begin work immediately after merge | Confirmed by dependency table in job-queue/index.md |
| No application source code committed in this feature | Zero `.ts` implementation files (only placeholder `index.ts` stubs if structurally required) |

---

## 5. Business Constraints

- **Scope boundary is hard.** Application code, Dockerfile contents, CI/CD pipelines, Terraform module implementations, and database migrations are explicitly out of scope. Adding them here creates merge conflicts with 14 downstream features working in parallel.
- **Cloud provider is undecided.** The Terraform directory structure must be cloud-agnostic — no provider-specific files beyond placeholder `.tf` files.
- **Package manager must be chosen.** The root package.json will define the package manager (npm, yarn, or pnpm) and workspace configuration. This decision must be made before this feature is implemented and must remain consistent across all downstream features. Recommendation: pnpm for its disk efficiency and strict dependency resolution.
- **Nx version must be pinned.** All downstream features inherit the Nx major version chosen here. Breaking changes between major versions are significant. Recommendation: Nx 20.x (latest stable as of 2026-03).

---

## 6. Integration with Product Roadmap

This feature is **Wave 1** of the spec generation roadmap and **Phase 0** of implementation. It is the prerequisite for every other wave:

- Wave 1 (features 00-04): Foundation and infrastructure schema
- Wave 2 (features 05-06, 18): Auth and Mastra runtime
- Waves 3-8: All application and package code

The monorepo structure defined here dictates the import paths, project names, and build targets used by every feature through Wave 8.

---

## 7. Dependencies

| Direction | Features |
|---|---|
| **Blocked by** | None — this is the root of the dependency graph |
| **Blocks** | 01, 02, 03, 04, 05, 06, 07, 08, 09, 18, 22, 23, 34, 35 |

---

## 8. Open Questions

| Question | Impact | Owner |
|---|---|---|
| pnpm, npm, or yarn for package manager? | Affects root package.json and CI setup | Tech lead |
| Nx Cloud remote cache — enabled from the start or deferred? | Affects nx.json tasksRunnerOptions config | Tech lead |
| Node.js version to enforce across all projects? | Affects .nvmrc / .node-version and engine constraints in package.json | Tech lead |
| TypeScript version to pin? | Affects tsconfig.base.json compilerOptions target | Tech lead |
