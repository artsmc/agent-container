# Task List — Feature 35: Container Builds

**Phase**: 8 — CI/CD and Deployment
**Blocked by**: Feature 00 (Nx Monorepo Scaffolding), Feature 34 (CI/CD Pipeline)
**Blocks**: Feature 36 (Terraform App Deployment)

References: FRD.md, FRS.md, GS.md, TR.md

---

## Pre-Conditions (resolve before starting any task)

- [ ] **GATE: Confirm cloud provider** — GCP (Artifact Registry) or AWS (ECR)? This determines registry auth syntax in CI jobs. (References: TR.md - Section 13)
- [ ] **GATE: Confirm auth runtime** — Node.js app, Ory Hydra (Go), or Keycloak (Java)? This determines apps/auth/Dockerfile base image and compile step. (References: TR.md - Section 3.1, FRS.md - FR-01.2)
- [ ] **GATE: Confirm migration tool** — Prisma Migrate, Drizzle Kit, or golang-migrate? This determines ENTRYPOINT for migration job Dockerfiles. (References: TR.md - Section 3.5, FRS.md - FR-05.3)
- [ ] **GATE: Complete Mastra containerisation spike** — Confirm alpine vs slim base, correct start command, observability port, and volume requirements. Document spike result in apps/mastra/Dockerfile as a comment. (References: TR.md - Section 3.3, FRS.md - FR-03.7)
- [ ] **GATE: Confirm Next.js standalone output** — Verify apps/ui/next.config.js has `output: 'standalone'` configured. If not, add it as part of this feature. (References: TR.md - Section 3.4, FRS.md - FR-04.6)

---

## Phase A: Repository Infrastructure

### A1 — .dockerignore
- [ ] **A1.1** Create `.dockerignore` at the monorepo root with all exclusions defined in TR.md Section 4.
  Verify: Run `docker build --dry-run .` and confirm `node_modules/`, `.git/`, `.env*`, `infra/`, `coverage/`, and `job-queue/` are excluded from the build context.
  Size: Small
  References: TR.md - Section 4, FRS.md - FR-01.8

- [ ] **A1.2** Validate that the `.dockerignore` does not accidentally exclude files needed by any Dockerfile (e.g., `package.json`, `nx.json`, `tsconfig.base.json`).
  Verify: Each Dockerfile COPY command resolves the file without a build warning.
  Size: Small

---

## Phase B: Application Dockerfiles

Tasks in Phase B can be worked in parallel once Phase A is complete and all Phase A gates are resolved.

### B1 — apps/auth Dockerfile
- [ ] **B1.1** Author `apps/auth/Dockerfile` with two-stage build (builder + runtime) per TR.md Section 3.1 and FRS.md FR-01.
  - Builder stage: installs deps, compiles TypeScript (or Go/Java per gate result)
  - Runtime stage: node:20-alpine (or appropriate base per gate), non-root user, EXPOSE 8090, HEALTHCHECK
  Verify: `docker build -f apps/auth/Dockerfile -t auth:test .` completes without error.
  Size: Medium
  References: TR.md - Section 3.1, FRS.md - FR-01

- [ ] **B1.2** Verify auth image runs correctly locally.
  Verify: `docker run --rm -e AUTH_DATABASE_URL=... auth:test` starts without crashing (even if DB is unreachable, the container should start and report a connection error — not a startup error).
  Size: Small

- [ ] **B1.3** Verify auth image runs as non-root user.
  Verify: `docker run --rm auth:test whoami` returns a non-root username (e.g., `node`).
  Size: Small

- [ ] **B1.4** Verify no secrets are baked into the auth image.
  Verify: `docker history --no-trunc auth:test` shows no secret values in any layer.
  Size: Small
  References: FRS.md - FR-01.6, GS.md - Scenario "No secrets baked into any image"

- [ ] **B1.5** Verify auth image size is under 150 MB compressed.
  Verify: `docker image inspect auth:test --format='{{.Size}}'` and compare to 150 MB threshold.
  Size: Small
  References: TR.md - Section 9

### B2 — apps/api Dockerfile
- [ ] **B2.1** Author `apps/api/Dockerfile` with two-stage build per TR.md Section 3.2 and FRS.md FR-02.
  - Builder stage: copies shared-types, database, auth-client packages; installs deps; compiles TypeScript
  - Runtime stage: node:20-alpine, non-root user, EXPOSE 8080, HEALTHCHECK
  Verify: `docker build -f apps/api/Dockerfile -t api:test .` completes without error.
  Size: Medium
  References: TR.md - Section 3.2, FRS.md - FR-02

- [ ] **B2.2** Verify api image runs correctly locally (same approach as B1.2).
  Size: Small

- [ ] **B2.3** Verify api image non-root user, no secrets in layers, size under 150 MB.
  Verify: Same checks as B1.3/B1.4/B1.5 applied to api:test.
  Size: Small

### B3 — apps/mastra Dockerfile
- [ ] **B3.1** (Requires Mastra spike gate) Author `apps/mastra/Dockerfile` with two-stage build per TR.md Section 3.3 and FRS.md FR-03.
  - Builder stage: copies shared-types, api-client packages; installs deps; compiles
  - Runtime stage: base image per spike result; EXPOSE 8081 (+ observability port if needed); HEALTHCHECK with start-period=30s; non-root user
  - Include a comment referencing the spike result
  Verify: `docker build -f apps/mastra/Dockerfile -t mastra:test .` completes without error.
  Size: Medium
  References: TR.md - Section 3.3, FRS.md - FR-03

- [ ] **B3.2** Verify mastra image starts and serves its health endpoint.
  Verify: `docker run --rm -p 8081:8081 -e API_BASE_URL=... mastra:test` followed by `curl localhost:8081/health` returns a successful response.
  Size: Small

- [ ] **B3.3** Verify mastra image non-root user, no secrets in layers, size under 200 MB.
  Size: Small

### B4 — apps/ui Dockerfile
- [ ] **B4.1** Confirm `apps/ui/next.config.js` has `output: 'standalone'`. If missing, add it in this task.
  Size: Small
  References: TR.md - Section 3.4, FRS.md - FR-04.6

- [ ] **B4.2** Author `apps/ui/Dockerfile` with three-stage build (deps, builder, runtime) per TR.md Section 3.4 and FRS.md FR-04.
  - deps stage: installs all node_modules
  - builder stage: runs `npx nx build ui --configuration=production`
  - runtime stage: node:20-alpine, copies .next/standalone and .next/static, non-root user `node`, EXPOSE 3000, HEALTHCHECK
  Verify: `docker build -f apps/ui/Dockerfile -t ui:test .` completes without error.
  Size: Medium
  References: TR.md - Section 3.4, FRS.md - FR-04

- [ ] **B4.3** Verify ui image starts and serves the app on port 3000.
  Verify: `docker run --rm -p 3000:3000 -e API_BASE_URL=http://localhost:8080 ui:test` then `curl localhost:3000` returns HTTP 200.
  Size: Small

- [ ] **B4.4** Verify no NEXT_PUBLIC_* or API_BASE_URL values are hardcoded in the image.
  Verify: `docker history --no-trunc ui:test` and `docker run --rm ui:test env` show no hardcoded config values.
  Size: Small
  References: FRS.md - FR-04.7, FR-04.8

- [ ] **B4.5** Verify ui image non-root user and size under 100 MB compressed.
  Size: Small

---

## Phase C: Migration Job Dockerfiles

### C1 — packages/database migration Dockerfile
- [ ] **C1.1** (Requires migration tool gate) Author `packages/database/Dockerfile` per TR.md Section 3.5 and FRS.md FR-05.
  - Single stage based on appropriate base image for migration tool
  - ENTRYPOINT set to migration command
  - DATABASE_URL not hardcoded
  - Include both up and down migration scripts in the image
  Verify: `docker build -f packages/database/Dockerfile -t db-migrate:test .` completes without error.
  Size: Small
  References: TR.md - Section 3.5, FRS.md - FR-05

- [ ] **C1.2** Verify migration container runs successfully against a test database.
  Verify: `docker run --rm -e DATABASE_URL=postgresql://... db-migrate:test` applies all pending migrations and exits with code 0.
  Size: Medium
  References: GS.md - "Running the migration job successfully"

- [ ] **C1.3** Verify migration container exits non-zero when DATABASE_URL is invalid.
  Verify: `docker run --rm -e DATABASE_URL=postgresql://invalid:5432/db db-migrate:test` exits with non-zero code and writes error to stderr.
  Size: Small
  References: GS.md - "Migration job fails due to database connectivity"

- [ ] **C1.4** Verify migration container exits 0 when no pending migrations exist.
  Verify: Run migration container twice against the same database; second run exits 0 with idempotent output.
  Size: Small
  References: GS.md - "Running the migration job when no migrations are pending"

### C2 — packages/auth-database migration Dockerfile
- [ ] **C2.1** Author `packages/auth-database/Dockerfile` using the same pattern as C1.1, with AUTH_DATABASE_URL as the env var and paths pointing to packages/auth-database/.
  Verify: `docker build -f packages/auth-database/Dockerfile -t auth-db-migrate:test .` completes without error.
  Size: Small
  References: FRS.md - FR-06, TR.md - Section 3.6

- [ ] **C2.2** Verify auth migration container runs successfully against a test auth database. Same verification approach as C1.2.
  Size: Small

---

## Phase D: CI/CD Pipeline Integration

Requires feature 34's workflow file to exist before these tasks can be started.

### D1 — Registry Authentication
- [ ] **D1.1** Add registry authentication step to CI workflow (GCP or AWS path per cloud provider gate).
  - Store registry credentials in GitHub Actions secrets (GCP_SA_KEY or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
  - Document which secret names to use in the workflow comments
  Verify: CI workflow step authenticates and `docker pull {registry}/test` succeeds from a CI run.
  Size: Small
  References: TR.md - Section 5.1, FRS.md - FR-08.4

### D2 — Affected Apps Matrix Build Job
- [ ] **D2.1** Add the `build-and-push` matrix job to the CI workflow per TR.md Section 5.1.
  - Job depends on feature 34's test/lint/build steps passing
  - Matrix iterates over the Nx affected apps list
  - Uses `docker/setup-buildx-action` and `docker/build-push-action` with GHA cache
  Verify: A PR that changes only `apps/api/src/` triggers a CI run where only the `api` matrix entry runs; auth, mastra, and ui entries are skipped.
  Size: Large
  References: TR.md - Section 5.1, FRS.md - FR-08.1, FR-08.2, FR-08.5, GS.md - "Single app change triggers only that app's build"

- [ ] **D2.2** Validate image tagging in the pipeline.
  Verify: After a successful CI run, the registry contains three tags for the built app:
  - `{registry}/{app}:{40-char-sha}`
  - `{registry}/{app}:{environment}`
  - `{registry}/{app}:latest`
  Size: Small
  References: FRS.md - FR-07, GS.md - "Tagging on a push to main"

- [ ] **D2.3** Validate that the full 40-character SHA is used (not short SHA).
  Verify: Inspect tag in registry; SHA is 40 characters.
  Size: Small
  References: FRS.md - FR-07.2, GS.md - "Full 40-character SHA is used"

### D3 — Migration Job in Pipeline
- [ ] **D3.1** Add the `run-migrations` job to the CI workflow per TR.md Section 5.2.
  - Job is conditional on `packages/database` being in the affected set
  - DATABASE_URL is injected from GitHub Actions secrets
  - Job runs after build-and-push, before deployment step (feature 36)
  Verify: A commit that modifies `packages/database/migrations/` triggers the migration job in CI; a commit that modifies only `apps/api/src/` does not.
  Size: Medium
  References: TR.md - Section 5.2, FRS.md - FR-05.5, GS.md - "Database package change triggers migration job and api build"

- [ ] **D3.2** Add equivalent `run-auth-migrations` job for `packages/auth-database`.
  Verify: Same logic as D3.1, conditioned on auth-database being affected, using AUTH_DATABASE_URL.
  Size: Small
  References: FRS.md - FR-06, FRS.md - FR-08.2

### D4 — Vulnerability Scan Gate
- [ ] **D4.1** Add post-push vulnerability scan polling step to the `build-and-push` job.
  - Poll scan API after push with max 5 minute timeout
  - Exit non-zero if CRITICAL findings present
  - Log all findings (CRITICAL, HIGH, MEDIUM, LOW) to job output
  Verify: Create a test image with a known CRITICAL vulnerability (e.g., an old base image); confirm the pipeline step fails and deployment is blocked.
  Size: Medium
  References: TR.md - Section 8, FRS.md - FR-08.6, GS.md - "Image scanned after push — critical vulnerability found"

### D5 — Production Image Promotion (Tag-Only)
- [ ] **D5.1** Add a production promotion workflow job (or separate workflow) that re-tags the staging SHA image as `production` without rebuilding.
  - Triggered manually or by approval gate
  - Pulls `{registry}/{app}:{sha}` from staging promotion
  - Pushes as `{registry}/{app}:production`
  Verify: After production promotion, `{registry}/{app}:production` points to the same digest as `{registry}/{app}:{sha}`.
  Size: Medium
  References: FRS.md - FR-07.3, TR.md - Section 6, GS.md - "Production deployment uses existing staging image without rebuild"

---

## Phase E: Validation and Documentation

- [ ] **E1** Run a full end-to-end CI run with a change that affects all four apps (e.g., change to `packages/shared-types/`).
  Verify: All four app images build, are tagged correctly, are pushed to the registry, and vulnerability scans complete without CRITICAL findings.
  Size: Medium
  References: GS.md - "shared-types change triggers all four app builds"

- [ ] **E2** Run a full end-to-end CI run with a database migration change.
  Verify: Migration job runs before API deployment; migration exits 0; API image is deployed.
  Size: Medium
  References: GS.md - "Database package change triggers migration job and api build"

- [ ] **E3** Verify retention policy is enforced by the registry (coordinated with feature 02).
  Verify: After pushing more than N images for one app, the oldest untagged images are deleted by the registry's cleanup job.
  Size: Small
  References: FRS.md - FR-09, GS.md - "More than N SHA-tagged images exist for one app"

- [ ] **E4** Verify unaffected apps are never rebuilt.
  Verify: Make a change to `apps/ui/src/` and confirm the CI run shows only `ui` in the build matrix; registry timestamps for auth, api, and mastra images do not change.
  Size: Small
  References: GS.md - "Single app change triggers only that app's build"

- [ ] **E5** Document all Dockerfile decisions and any deviations from TR.md in a `DECISIONS.md` file in `apps/` or as comments in each Dockerfile.
  - Record base image choices and rationale
  - Record Mastra spike result
  - Record migration tool choice
  Size: Small

- [ ] **E6** Update Memory Bank (`memory-bank/systemPatterns.md`) with:
  - Docker multi-stage build pattern used across this project
  - Migration job pattern (single-run container, pre-deploy gate)
  - Image tagging strategy (SHA + environment + latest)
  - Vulnerability gate behaviour
  Size: Small
