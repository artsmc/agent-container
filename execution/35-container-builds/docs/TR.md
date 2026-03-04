# TR — Technical Requirements
# Feature 35: Container Builds

---

## 1. Overview

Feature 35 produces Dockerfiles, a `.dockerignore`, and CI/CD pipeline job definitions that build and push container images for the four application services (`auth`, `api`, `mastra`, `ui`) and two database migration jobs (`database`, `auth-database`). All builds use multi-stage patterns. Images are tagged with git SHA, environment label, and `latest`. Vulnerability scanning is enforced at push. Image retention is handled at the registry level.

---

## 2. Repository File Locations

| File | Location in Monorepo |
|---|---|
| auth Dockerfile | `apps/auth/Dockerfile` |
| api Dockerfile | `apps/api/Dockerfile` |
| mastra Dockerfile | `apps/mastra/Dockerfile` |
| ui Dockerfile | `apps/ui/Dockerfile` |
| database migration Dockerfile | `packages/database/Dockerfile` |
| auth-database migration Dockerfile | `packages/auth-database/Dockerfile` |
| Monorepo .dockerignore | `.dockerignore` (repo root) |
| CI build jobs | `.github/workflows/ci.yml` (or cloud build config) — owned primarily by feature 34, extended here |

---

## 3. Dockerfile Specifications

### 3.1 apps/auth — Node.js (assumed; Go/Java if Ory Hydra or Keycloak)

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first (layer cache optimisation)
COPY package.json package-lock.json nx.json tsconfig.base.json ./

# Copy only the packages needed by auth
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/auth-client/ ./packages/auth-client/
COPY apps/auth/ ./apps/auth/

RUN npm ci --include=dev
RUN npx nx build auth --configuration=production

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist/apps/auth ./dist
COPY --from=builder /app/node_modules ./node_modules

# Switch to non-root user
USER node

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8090/health || exit 1

CMD ["node", "dist/main.js"]
```

**Notes:**
- If OIDC provider is Ory Hydra (Go), replace both stages with `golang:1.22-alpine` builder and `alpine:3.19` runtime; the binary is copied directly.
- If OIDC provider is Keycloak, use the official `quay.io/keycloak/keycloak` image with custom configuration; no multi-stage needed.
- Confirm runtime choice before finalising.

### 3.2 apps/api — Node.js

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/database/ ./packages/database/
COPY packages/auth-client/ ./packages/auth-client/
COPY apps/api/ ./apps/api/

RUN npm ci --include=dev
RUN npx nx build api --configuration=production

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist/apps/api ./dist
COPY --from=builder /app/node_modules ./node_modules

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/main.js"]
```

### 3.3 apps/mastra — Node.js (Mastra runtime)

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/api-client/ ./packages/api-client/
COPY apps/mastra/ ./apps/mastra/

RUN npm ci --include=dev
RUN npx nx build mastra --configuration=production

# ---- Stage 2: Runtime ----
# NOTE: If Mastra spike shows alpine incompatibility, change to node:20-slim
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist/apps/mastra ./dist
COPY --from=builder /app/node_modules ./node_modules

USER node

EXPOSE 8081
# EXPOSE 4318  # Uncomment if Mastra observability uses OTLP port (confirm in spike)

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "dist/main.js"]
```

**SPIKE GATE**: This Dockerfile must not be finalised until the Mastra containerisation spike confirms:
1. Alpine Linux compatibility (or selects alternative base)
2. The correct start command for Mastra's backend
3. Whether Mastra's observability requires a second exposed port
4. Whether a `VOLUME` declaration is needed for telemetry persistence

### 3.4 apps/ui — Next.js with Standalone Output

```dockerfile
# ---- Stage 1: Install dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/api-client/ ./packages/api-client/
COPY packages/auth-client/ ./packages/auth-client/
COPY apps/ui/ ./apps/ui/
COPY nx.json tsconfig.base.json ./

# next.config.js must have output: 'standalone'
RUN npx nx build ui --configuration=production

# ---- Stage 3: Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/ui/.next/standalone ./
COPY --from=builder /app/apps/ui/.next/static ./apps/ui/.next/static
COPY --from=builder /app/apps/ui/public ./apps/ui/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "apps/ui/server.js"]
```

**Requirement**: `apps/ui/next.config.js` must contain:
```js
const nextConfig = {
  output: 'standalone',
};
```

### 3.5 packages/database — Migration Job

```dockerfile
FROM node:20-alpine AS migration
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY packages/database/ ./packages/database/

# DATABASE_URL injected at runtime — never hardcoded
ENTRYPOINT ["npx", "prisma", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"]
```

**Alternatives by tool:**
- Drizzle Kit: `ENTRYPOINT ["npx", "drizzle-kit", "migrate", "--config", "packages/database/drizzle.config.ts"]`
- golang-migrate: Use `migrate/migrate:v4` base image, copy migration files, set entrypoint to the migrate binary

### 3.6 packages/auth-database — Auth Migration Job

Identical structure to 3.5. Replace `packages/database` references with `packages/auth-database`. Runtime env var is `AUTH_DATABASE_URL`.

---

## 4. .dockerignore

```
# Version control
.git/
.gitignore

# Node modules (all levels — copied selectively in Dockerfiles)
**/node_modules/

# Build output
**/dist/
**/.next/
**/build/

# Test coverage
**/coverage/

# Environment files — never copy
.env
.env.*
*.env

# Logs
**/*.log
**/logs/

# Infrastructure code — not needed in app images
infra/

# Temporary job queue
job-queue/

# IDE and OS
.vscode/
.idea/
**/.DS_Store

# CI config (not needed in image)
.github/
```

---

## 5. CI/CD Pipeline Integration (GitHub Actions)

The following extends feature 34's pipeline workflow. Feature 34 owns the overall workflow file; these jobs are added to it.

### 5.1 Docker Build and Push Job

```yaml
build-and-push:
  name: Build and Push ${{ matrix.app }}
  needs: [test]   # depends on feature 34's test jobs passing
  runs-on: ubuntu-latest
  strategy:
    matrix:
      app: ${{ fromJson(needs.affected-apps.outputs.apps) }}
      # affected-apps output is produced by feature 34's Nx affected detection step
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Authenticate to GCP
      uses: google-github-actions/auth@v2
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}

    - name: Log in to Artifact Registry
      run: gcloud auth configure-docker ${{ vars.REGISTRY_HOST }}

    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        file: apps/${{ matrix.app }}/Dockerfile
        push: true
        tags: |
          ${{ vars.REGISTRY_HOST }}/${{ vars.PROJECT_ID }}/${{ matrix.app }}:${{ github.sha }}
          ${{ vars.REGISTRY_HOST }}/${{ vars.PROJECT_ID }}/${{ matrix.app }}:${{ vars.ENVIRONMENT }}
          ${{ vars.REGISTRY_HOST }}/${{ vars.PROJECT_ID }}/${{ matrix.app }}:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Poll vulnerability scan result
      run: |
        # Poll GCP Container Analysis API for scan results
        gcloud artifacts docker images describe \
          ${{ vars.REGISTRY_HOST }}/${{ vars.PROJECT_ID }}/${{ matrix.app }}:${{ github.sha }} \
          --format=json | jq '.deploymentMetadata.vulnerability'
        # Exit non-zero if CRITICAL findings present
```

### 5.2 Migration Job

```yaml
run-migrations:
  name: Run database migrations
  needs: [build-and-push]
  if: contains(needs.affected-apps.outputs.packages, 'database')
  runs-on: ubuntu-latest
  steps:
    - name: Run migration container
      run: |
        docker run --rm \
          -e DATABASE_URL=${{ secrets.DATABASE_URL }} \
          ${{ vars.REGISTRY_HOST }}/${{ vars.PROJECT_ID }}/db-migrate:${{ github.sha }}
```

### 5.3 Environment Variables Required in CI

| Variable | Type | Description |
|---|---|---|
| `GCP_SA_KEY` | Secret | GCP service account key for Artifact Registry authentication |
| `DATABASE_URL` | Secret | Product database connection string (for migration job) |
| `AUTH_DATABASE_URL` | Secret | Auth database connection string (for auth migration job) |
| `REGISTRY_HOST` | Variable | e.g., `us-central1-docker.pkg.dev` (GCP Artifact Registry) |
| `PROJECT_ID` | Variable | GCP project ID |
| `ENVIRONMENT` | Variable | `dev`, `staging`, or `production` |

---

## 6. Image Tagging Reference

| Tag | Format | Mutability | Purpose |
|---|---|---|---|
| SHA | `{registry}/{project}/{app}:{40-char-sha}` | Immutable | Deployment, rollback, audit trail |
| Environment | `{registry}/{project}/{app}:{dev|staging|production}` | Mutable | Points to currently deployed version per env |
| Latest | `{registry}/{project}/{app}:latest` | Mutable | Most recent build from main |

---

## 7. Retention Policy Configuration

Configured in Terraform (feature 02). Feature 35 only defines the tagging strategy that makes it enforceable.

**GCP Artifact Registry cleanup policy:**
```json
{
  "rules": [
    {
      "name": "delete-untagged",
      "action": {"type": "Delete"},
      "condition": {
        "tagState": "UNTAGGED",
        "olderThan": "604800s"
      }
    },
    {
      "name": "keep-last-10-per-app",
      "action": {"type": "Keep"},
      "condition": {
        "keepCount": 10,
        "tagState": "TAGGED"
      }
    }
  ]
}
```

**Note**: Environment-tagged images (`:dev`, `:staging`, `:production`) are mutable tags and are excluded from the count-based deletion rule since they are always present and overwritten.

---

## 8. Vulnerability Scanning

### 8.1 Registry-Level Scanning
Enable the GCP Container Analysis API. Scanning runs automatically on image push to Artifact Registry. Results are available via `gcloud artifacts docker images describe` or the Container Analysis API.

### 8.2 Pipeline Gate
After image push, the pipeline polls the scan API with a timeout (max 5 minutes). If a CRITICAL finding is present, the pipeline exits non-zero. The deployment step (`needs: [build-and-push]`) is therefore not reached.

### 8.3 Severity Levels
| Severity | Pipeline Behaviour |
|---|---|
| CRITICAL | Block deployment. Fail pipeline. Notify team. |
| HIGH | Log warning. Deployment proceeds. Create follow-up issue. |
| MEDIUM / LOW | Log info. No action required immediately. |

---

## 9. Performance Requirements

| Requirement | Target |
|---|---|
| auth image size (compressed) | < 150 MB |
| api image size (compressed) | < 150 MB |
| mastra image size (compressed) | < 200 MB |
| ui image size (compressed) | < 100 MB (standalone output is small) |
| db-migrate image size (compressed) | < 100 MB |
| Cache-warm build time per image | < 90 seconds |
| Cache-cold build time per image | < 5 minutes |

Layer caching (GitHub Actions GHA cache) must be configured for all builds to meet the cache-warm target.

---

## 10. Security Requirements

1. **No secrets in images**: Verified by inspecting layer history. Enforced by code review and documented `.dockerignore`.
2. **Non-root runtime**: All four app containers and both migration containers run as non-root users.
3. **Minimal attack surface**: Multi-stage builds remove compilers, test runners, and source files from the final image.
4. **Vulnerability gate**: CRITICAL CVEs block deployment (see section 8).
5. **Registry access control**: Only the CI/CD service account has push access. Container services have pull-only access. Registry is private.
6. **Base image pinning**: Consider pinning base images to specific digest hashes (not just tags) in production Dockerfiles to prevent supply-chain attacks via tag mutation.

---

## 11. Third-Party Dependencies

| Dependency | Purpose | Source |
|---|---|---|
| `docker/build-push-action@v5` | GitHub Actions Docker build and push | github.com/docker/build-push-action |
| `docker/setup-buildx-action@v3` | Enable BuildKit with layer caching | github.com/docker/setup-buildx-action |
| `google-github-actions/auth@v2` | GCP service account authentication in CI | github.com/google-github-actions |
| GCP Container Analysis API | Vulnerability scanning on Artifact Registry push | cloud.google.com/container-analysis |

---

## 12. Migration Strategy

This feature introduces new Dockerfiles to existing app directories. No migration of existing data or infrastructure is required. The following are one-time setup tasks:

1. Confirm the migration tool (`prisma`, `drizzle-kit`, or `golang-migrate`) — required before authoring migration Dockerfiles.
2. Confirm the OIDC provider (`Node.js app`, `Ory Hydra`, or `Keycloak`) — required before finalising `apps/auth/Dockerfile`.
3. Complete the Mastra containerisation spike — required before finalising `apps/mastra/Dockerfile`.
4. Add `output: 'standalone'` to `apps/ui/next.config.js` if not already present — required before `apps/ui/Dockerfile` is authored.
5. Feature 02 must have provisioned the container registry before the first image can be pushed.

---

## 13. Open Technical Questions

| Question | Impact | Owner |
|---|---|---|
| ~~GCP Artifact Registry or AWS ECR?~~ | **Resolved: GCP Artifact Registry selected.** Registry auth uses `gcloud auth configure-docker`. | Resolved |
| Node.js, Ory Hydra, or Keycloak for auth? | Determines builder/runtime base image and compile step for apps/auth/Dockerfile | Auth service decision (Feature 05) |
| Prisma Migrate, Drizzle Kit, or golang-migrate? | Determines ENTRYPOINT for migration job Dockerfiles | Database decision (Feature 03/04) |
| Mastra runtime compatibility on alpine? | May require base image change from alpine to slim | Mastra spike (pre-Feature 35) |
| Are NEXT_PUBLIC_* vars needed at Next.js build time? | If yes, they must be passed as --build-arg values; values cannot be secret | UI decision (Feature 23/24) |
| Should base images be pinned to digest? | Security hardening vs maintenance overhead | Security policy decision |
