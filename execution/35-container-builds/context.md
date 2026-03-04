# Feature 35: Container Builds

## Summary
Create Dockerfiles for each app (auth, api, mastra, ui) and configure the container build pipeline. When the CI/CD pipeline detects affected deployable apps, build Docker images, push them to the container registry, and run database migrations if needed. Includes image retention policy and vulnerability scanning on push.

## Phase
Phase 8 — CI/CD & Deployment

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding — provides the apps/ directory structure and project.json files), 34 (CI/CD Pipeline — provides the pipeline that triggers container builds for affected apps)
- **Blocks**: 36 (Terraform App Deployment — needs built container images in the registry to deploy)

## Source PRDs
- `infra-prd.md` — Containers section (per-app runtime, ports, health checks, env vars, scaling), CI/CD Pipeline section (what-triggers-what table, trigger logic step 3), Terraform Modules section (container-registry)

## Relevant PRD Extracts

### Nx Monorepo Structure — Dockerfiles (infra-prd.md)

```
apps/
├── auth/
│   ├── src/
│   ├── Dockerfile
│   └── project.json
├── api/
│   ├── src/
│   ├── Dockerfile
│   └── project.json
├── mastra/
│   ├── src/
│   ├── Dockerfile
│   └── project.json
└── ui/
    ├── src/
    ├── Dockerfile
    └── project.json
```

### Container: apps/auth (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (or depends on OIDC provider choice — Ory Hydra is Go, Keycloak is Java) |
| **Port** | 8090 |
| **Health check** | `GET /health` |
| **Environment variables** | `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU. Critical path — all login flows go through here. |
| **Persistent storage** | None — stateless. Sessions and tokens in auth Postgres. |

### Container: apps/api (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (or Python, pending tech stack decision) |
| **Port** | 8080 |
| **Health check** | `GET /health` |
| **Environment variables** | `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_JWKS_URL`, `ASANA_*`, `GRAIN_*`, `GOOGLE_*`, `EMAIL_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU |
| **Persistent storage** | None — stateless. All state in Postgres. |

### Container: apps/mastra (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Mastra's runtime) |
| **Port** | 8081 (agent API) + Mastra's observability port |
| **Health check** | Mastra's built-in health endpoint |
| **Environment variables** | `API_BASE_URL`, `API_SERVICE_TOKEN`, `LLM_API_KEY`, Mastra-specific config |
| **Scaling** | Horizontal — based on workflow queue depth |
| **Persistent storage** | None — Mastra's own telemetry/observability may need a volume or external store |
| **Notes** | Mastra has its own backend for agent orchestration and observability. Container must respect Mastra's runtime expectations. Spike early to confirm containerization compatibility. |

### Container: apps/ui (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Next.js or similar) |
| **Port** | 3000 |
| **Health check** | `GET /` or `GET /health` |
| **Environment variables** | `API_BASE_URL`, `NEXT_PUBLIC_*` for client-side config |
| **Scaling** | Horizontal — based on request count |
| **Persistent storage** | None — stateless. All state in API/Postgres. |
| **CDN** | Static assets served via CDN (Cloud CDN / CloudFront) |

### Database Migration Container (infra-prd.md)

packages/database is not a long-running container. Migrations run as a **job** during deployment.

| Property | Value |
|---|---|
| **Runtime** | Migration tool (e.g., Prisma Migrate, Drizzle Kit, golang-migrate) |
| **Trigger** | Runs as a pre-deploy step when `packages/database/migrations/` changes |
| **Rollback** | Each migration has a corresponding down migration |

### CI/CD Trigger Logic Step 3 (infra-prd.md)

```
3. If build passes and target is a deployable app:
   ├── Build Docker image
   ├── Push to container registry
   ├── Run database migrations (if packages/database is affected)
   └── Deploy container to target environment
```

### What Triggers What (infra-prd.md)

| Changed | Builds | Deploys |
|---|---|---|
| `apps/auth/` | auth | auth container |
| `apps/api/` | api | api container |
| `apps/mastra/` | mastra | mastra container |
| `apps/ui/` | ui | ui container |
| `packages/shared-types/` | auth, api, mastra, ui | all four containers |
| `packages/auth-client/` | api, ui, mastra | api + ui + mastra containers |
| `packages/api-client/` | ui, mastra | ui + mastra containers |
| `packages/database/` | api, database migrations | run migrations -> api container |
| `packages/auth-database/` | auth, auth-db migrations | run auth migrations -> auth container |

### Container Registry Module (infra-prd.md)

- Private container registry.
- Image retention policy (keep last N images per app).
- Vulnerability scanning on push.

## Scope

### In Scope
- Dockerfile for `apps/auth/` — Node.js (or Go/Java depending on OIDC provider), port 8090, health check endpoint
- Dockerfile for `apps/api/` — Node.js (or Python), port 8080, health check endpoint
- Dockerfile for `apps/mastra/` — Node.js (Mastra runtime), port 8081, compatible with Mastra's runtime expectations
- Dockerfile for `apps/ui/` — Node.js (Next.js), port 3000, optimized for static asset serving
- CI/CD pipeline integration: build Docker images only for affected apps (determined by feature 34's Nx affected detection)
- Push built images to container registry (GCR / ECR)
- Database migration job: run `packages/database/` migrations as a pre-deploy step when database package is affected
- Auth database migration job: run `packages/auth-database/` migrations when auth-database package is affected
- Image tagging strategy (commit SHA, environment, latest)
- Image retention policy configuration (keep last N images per app)
- Vulnerability scanning on push to registry
- Multi-stage Docker builds for smaller images (build stage vs. runtime stage)

### Out of Scope
- CI/CD pipeline setup (lint, type-check, test, build steps) — that is feature 34
- Terraform container service modules (Cloud Run/ECS config, scaling, env var injection) — that is feature 36
- Terraform base infrastructure (container registry provisioning) — that is feature 02
- Application source code — Dockerfiles package whatever code exists
- Mastra containerization spike — should be done before this feature to confirm compatibility

## Key Decisions
- **One Dockerfile per app.** Each app in `apps/` has its own Dockerfile tailored to its runtime and port. No shared Dockerfile template.
- **Multi-stage builds preferred.** Build stage installs dependencies and compiles; runtime stage copies only production artifacts. Keeps images small and secure.
- **Database migrations run as a job, not a long-running container.** Triggered as a pre-deploy step only when `packages/database/migrations/` is affected.
- **Image retention and vulnerability scanning are registry-level concerns.** Configured in the container registry (provisioned by feature 02), but the build pipeline must tag images correctly to support retention policies.
- **Mastra containerization needs an early spike.** Mastra has its own backend for agent orchestration and observability. The Dockerfile must respect Mastra's runtime expectations — confirm compatibility before finalizing the Dockerfile.
- **Environment variables are NOT baked into images.** All env vars are injected at runtime by the container service (feature 36). Dockerfiles should not contain secrets or environment-specific configuration.
