# Refined Plan
# Feature 35: Container Builds

**Status:** Approved
**Complexity:** Medium-High (31 tasks, 5 phases + 5 pre-condition gates)
**Sub-Agent Delegation:** Yes (4 parallel Dockerfile groups in Wave 3)

---

## Pre-Condition Gates

| Gate | Status | Impact |
|---|---|---|
| Cloud provider (GCP/AWS) | Resolved (GCP) | Artifact Registry for images, `gcloud auth configure-docker` |
| Auth runtime (Node.js/Ory Hydra/Keycloak) | Unresolved | Blocks apps/auth/Dockerfile base image selection |
| Migration tool (Prisma/Drizzle/golang-migrate) | Unresolved | Blocks migration job Dockerfile ENTRYPOINT |
| Mastra alpine compatibility | Unresolved | Blocks apps/mastra/Dockerfile base image choice |
| Feature 00 merged + Feature 34 CI ready | Required | Monorepo structure and CI pipeline must exist |

**~40% of tasks blocked by unresolved gates** (auth Dockerfile, mastra Dockerfile, both migration Dockerfiles).

---

## Wave Structure

### Wave 1 -- Foundation (2 tasks)

- Create `.dockerignore` at monorepo root (TR.md Section 4 has complete content)
- Verify monorepo root build context works

**No gate dependencies.** Can start immediately.

---

### Wave 2 -- Gate-Free Dockerfiles (2 tasks, parallel)

- apps/api/Dockerfile (Node.js confirmed, no gates)
- apps/ui/Dockerfile (Next.js standalone, no gates)

**Parallel opportunity:** These two Dockerfiles are completely independent.
**Key insight:** TR.md Sections 3.2 and 3.4 provide complete Dockerfile content.

---

### Wave 3 -- Gate-Dependent Dockerfiles (4 tasks, parallel after gates resolve)

- apps/auth/Dockerfile (depends on auth runtime gate)
- apps/mastra/Dockerfile (depends on Mastra alpine gate)
- packages/database/Dockerfile (depends on migration tool gate)
- packages/auth-database/Dockerfile (depends on migration tool gate)

**Sub-agent delegation recommended:** 4 independent Dockerfile authoring tasks.

| Sub-Agent | Scope |
|---|---|
| Agent A | apps/auth/Dockerfile |
| Agent B | apps/mastra/Dockerfile |
| Agent C | packages/database/Dockerfile + packages/auth-database/Dockerfile (identical pattern) |

---

### Wave 4 -- CI/CD Integration (3 tasks, sequential)

- Add `build-and-push` job to `.github/workflows/ci.yml` (extends Feature 34)
- Add migration job definitions to `deploy-staging.yml`
- Configure vulnerability scan gate step

**Depends on:** All Dockerfiles from Waves 2-3 must exist.
**Key insight:** TR.md Section 5.1 provides complete YAML for the build-and-push job.

---

### Wave 5 -- Validation and Testing (5+ tasks)

- Build each image locally and verify size targets (TR.md Section 9)
- Verify non-root user in all runtime stages
- Verify no secrets in layer history
- Verify .dockerignore excludes correctly
- End-to-end: push to Artifact Registry and verify vulnerability scan

---

## Incremental Build Strategy

| After Wave | Working State |
|---|---|
| Wave 1 | .dockerignore ready, build context clean |
| Wave 2 | api + ui images build and run locally |
| Wave 3 | All 6 images build (after gates resolve) |
| Wave 4 | CI/CD builds and pushes images on merge |
| Wave 5 | All size, security, and scan validations pass |

---

## Image Tagging Strategy (from TR.md Section 6)

| Tag | Format | Mutability |
|---|---|---|
| SHA | `{registry}/{project}/{app}:{40-char-sha}` | Immutable |
| Environment | `{registry}/{project}/{app}:{dev\|staging\|production}` | Mutable |
| Latest | `{registry}/{project}/{app}:latest` | Mutable |

---

## Key Technical Notes

1. **All Docker builds use monorepo root as context.** Each Dockerfile uses selective COPY to include only its dependencies.
2. **Multi-stage builds are mandatory.** Builder stage has dev dependencies; runtime stage has only production artifacts.
3. **Non-root runtime** via `USER node` on all images.
4. **HEALTHCHECK declarations** use `wget` (available in alpine) not `curl`.
5. **Layer caching** via `docker/build-push-action` with `cache-from: type=gha`.
6. **Size targets:** auth/api < 150MB, mastra < 200MB, ui < 100MB, db-migrate < 100MB.

---

## Path Management

- task_list_file: `execution/35-container-builds/task-list.md`
- input_folder: `execution/35-container-builds`
- planning_folder: `execution/35-container-builds/planning`
