# FRS — Functional Requirement Specification
# Feature 35: Container Builds

---

## FR-01: Dockerfile — apps/auth

### FR-01.1 Multi-Stage Build Structure
The `apps/auth/Dockerfile` must use a multi-stage build with at minimum two stages:
- **Stage 1 (builder)**: Install all dependencies (including devDependencies), run the TypeScript/Go/Java compilation step, and produce the production-ready output artifact.
- **Stage 2 (runtime)**: Copy only production artifacts and runtime dependencies from the builder stage. Must not contain compilers, source code, test files, or dev tooling.

### FR-01.2 Base Image Selection
- If runtime is Node.js: use `node:20-alpine` (or latest LTS alpine) as the runtime base. Builder stage may use `node:20` for full tooling.
- If runtime is Go (Ory Hydra): use `golang:1.22-alpine` builder and `gcr.io/distroless/static` or `alpine:3.19` as runtime.
- If runtime is Java (Keycloak): use the official Keycloak container image directly.
- Base image choice must be documented with rationale in a comment at the top of the Dockerfile.

### FR-01.3 Port Exposure
Must expose port `8090` via `EXPOSE 8090`.

### FR-01.4 Health Check Declaration
Must declare a Docker-native health check:
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8090/health || exit 1
```

### FR-01.5 Non-Root User
The runtime stage must switch to a non-root user (e.g., `node` for Node.js images, or a custom `appuser`). The application must not run as `root`.

### FR-01.6 No Secrets or Environment-Specific Config
No environment variables with secret values may appear in the Dockerfile. All env vars (`AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*`) are injected at runtime by the container service (feature 36).

### FR-01.7 Nx Monorepo Build Context
The Docker build context is the monorepo root. The Dockerfile must correctly reference the monorepo's `package.json`, `nx.json`, `tsconfig.base.json`, and the `apps/auth/` source tree. Only files needed for the auth build are copied into the builder stage (use `.dockerignore` to exclude irrelevant apps and packages).

### FR-01.8 .dockerignore
A `.dockerignore` file at the monorepo root must exclude:
- `node_modules/` at root and in any app/package directory
- `.git/`
- `*.log`
- `infra/`
- `coverage/`
- `dist/` directories for other apps
- `job-queue/`
- `.env*` files

---

## FR-02: Dockerfile — apps/api

### FR-02.1 Multi-Stage Build Structure
Same two-stage pattern as FR-01.1. Builder installs deps and compiles TypeScript. Runtime copies only compiled output and production node_modules.

### FR-02.2 Base Image
Node.js (`node:20-alpine` runtime stage). Tech stack decision (Node.js vs Python) must be resolved before finalising; if Python, use `python:3.12-slim` as base.

### FR-02.3 Port Exposure
Must expose port `8080` via `EXPOSE 8080`.

### FR-02.4 Health Check Declaration
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
```

### FR-02.5 Non-Root User
Must run as non-root user in the runtime stage.

### FR-02.6 No Secrets
No values for `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_JWKS_URL`, `ASANA_*`, `GRAIN_*`, `GOOGLE_*`, or `EMAIL_*` may appear in the Dockerfile.

### FR-02.7 Monorepo Build Context and Scope
The build must only install and compile `apps/api/` and its declared Nx dependencies (`packages/shared-types`, `packages/database`, `packages/auth-client`). Unrelated packages are excluded from the build context.

---

## FR-03: Dockerfile — apps/mastra

### FR-03.1 Multi-Stage Build Structure
Same two-stage pattern. Mastra's runtime has its own backend — the builder must install Mastra's dependencies in full; the runtime stage must include everything Mastra needs to run its agent orchestration backend.

### FR-03.2 Base Image
Node.js (`node:20-alpine`). A spike (out-of-scope but pre-requisite) must confirm Mastra can run in alpine. If alpine is incompatible, fall back to `node:20-slim`.

### FR-03.3 Port Exposure
Must expose port `8081` for the agent API via `EXPOSE 8081`. If Mastra's observability layer runs on a separate port (e.g., 4318 for OTLP), that port must also be exposed.

### FR-03.4 Health Check Declaration
Use Mastra's built-in health endpoint. The exact path must be confirmed during the Mastra spike; placeholder:
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1
```
`--start-period=30s` is longer than other apps to account for Mastra's initialisation time.

### FR-03.5 Non-Root User
Must run as non-root user.

### FR-03.6 No Secrets
No values for `API_BASE_URL`, `API_SERVICE_TOKEN`, or `LLM_API_KEY` may appear in the Dockerfile.

### FR-03.7 Mastra Runtime Compatibility Note
The Dockerfile must include a comment referencing the spike ticket/result confirming Mastra's containerisation compatibility. If Mastra requires a persistent volume for telemetry, this must be documented in the Dockerfile as a `VOLUME` declaration even if the volume is not provisioned in feature 35.

---

## FR-04: Dockerfile — apps/ui

### FR-04.1 Multi-Stage Build Structure
Three-stage build recommended for Next.js:
- **Stage 1 (deps)**: Install all node_modules.
- **Stage 2 (builder)**: Run `next build` with `output: 'standalone'` configured in `next.config.js`.
- **Stage 3 (runtime)**: Copy only the `.next/standalone` output and `.next/static` assets. This produces the smallest possible image.

### FR-04.2 Base Image
`node:20-alpine` for all stages.

### FR-04.3 Port Exposure
Must expose port `3000` via `EXPOSE 3000`.

### FR-04.4 Health Check Declaration
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1
```
Or `GET /health` if a dedicated health route is implemented in the Next.js app.

### FR-04.5 Non-Root User
Must run as non-root user (`node`).

### FR-04.6 Next.js Standalone Output
`next.config.js` must have `output: 'standalone'` to enable the minimal runtime image. The Dockerfile must reference this output correctly. Static assets in `.next/static/` must be copied to the runtime stage for CDN upload or direct serving.

### FR-04.7 No Secrets or Build-Time Baked Config
`NEXT_PUBLIC_*` variables that differ per environment must NOT be baked into the image at build time. If Next.js requires them at build time, the pipeline must supply them as build args — but they must not contain secrets. `API_BASE_URL` and similar runtime variables are injected by the container service at runtime.

### FR-04.8 No Secrets
No values for `API_BASE_URL` or `NEXT_PUBLIC_*` may be hardcoded in the Dockerfile.

---

## FR-05: Migration Job Container — packages/database

### FR-05.1 Migration Job, Not Long-Running Container
`packages/database` does not produce a long-running container. The migration Dockerfile produces an image that runs the migration tool once and exits with code 0 on success or non-zero on failure.

### FR-05.2 Base Image
Depends on migration tool:
- Prisma Migrate: `node:20-alpine`
- Drizzle Kit: `node:20-alpine`
- golang-migrate: `migrate/migrate:latest` or a custom alpine image with the binary
The migration tool must be confirmed before finalising this Dockerfile.

### FR-05.3 Entry Point
`ENTRYPOINT` and `CMD` must be set to run the migration command directly:
```
# Example for Prisma:
ENTRYPOINT ["npx", "prisma", "migrate", "deploy"]

# Example for Drizzle:
ENTRYPOINT ["npx", "drizzle-kit", "migrate"]
```

### FR-05.4 Environment Variable
The migration job requires only `DATABASE_URL` injected at runtime. No other env vars are needed.

### FR-05.5 Trigger Condition
The migration job image is built and run only when `packages/database/migrations/` is in the Nx affected set for the current pipeline run.

### FR-05.6 Down Migration Support
The container image must include both up and down migration scripts. The CI/CD pipeline only runs up migrations automatically; down migrations are run manually during incident response.

---

## FR-06: Migration Job Container — packages/auth-database

### FR-06.1 Identical structure to FR-05, except:
- The database package is `packages/auth-database/`
- The environment variable is `AUTH_DATABASE_URL`
- The trigger condition is when `packages/auth-database/migrations/` is in the affected set

---

## FR-07: Image Tagging Strategy

### FR-07.1 Tags Applied on Every Build
Every image pushed to the registry must be tagged with:
1. **Commit SHA tag**: `{registry}/{app}:{git-sha}` — immutable, unique, used for deployment and rollback
2. **Environment tag**: `{registry}/{app}:{environment}` where environment is one of `dev`, `staging`, `production` — mutable, points to the currently deployed image in that environment
3. **Latest tag**: `{registry}/{app}:latest` — mutable, always points to the most recent build from `main`

### FR-07.2 Tag Format
- Registry: `{REGION}-docker.pkg.dev/{GCP_PROJECT_ID}/{REPOSITORY}/{APP_NAME}` (GCP Artifact Registry format)
- Git SHA: full 40-character SHA (not short SHA) to avoid collisions
- Environment: lowercase string matching the pipeline environment name

### FR-07.3 Tag Promotion
When promoting from staging to production, the image is not rebuilt. The commit SHA tag from staging is re-tagged with the `production` tag. This guarantees the exact same image that passed staging enters production.

---

## FR-08: CI/CD Pipeline Integration

### FR-08.1 Build Trigger
Docker image builds are triggered only for apps in the Nx affected set. Unaffected apps are not rebuilt. This is determined by feature 34's affected-detection step.

### FR-08.2 Build Order
For each affected deployable app:
1. Run `docker build` with the app's Dockerfile
2. Tag the image per FR-07.1
3. Push all tags to the registry
4. If `packages/database` is affected: run the migration job container as a pre-deploy step before deploying the api container
5. If `packages/auth-database` is affected: run the auth migration job container before deploying the auth container

### FR-08.3 Build Context
All Docker builds use the monorepo root as the build context and specify the Dockerfile path explicitly:
```
docker build -f apps/auth/Dockerfile -t {tag} .
```

### FR-08.4 Registry Authentication
The CI/CD pipeline authenticates to GCP Artifact Registry using a GCP service account with write access. Authentication uses `google-github-actions/auth@v2` with Workload Identity Federation or a service account key stored as a GitHub Actions secret (`GCP_SA_KEY`). Docker is configured via `gcloud auth configure-docker {REGISTRY_HOST}`. No credentials appear in Dockerfiles or committed config files.

### FR-08.5 Build Cache
Docker layer caching must be enabled in CI to avoid rebuilding unchanged layers. For GitHub Actions, use `docker/build-push-action` with `cache-from: type=gha` and `cache-to: type=gha,mode=max`.

### FR-08.6 Vulnerability Scan Gate
After push, the registry's vulnerability scanning result is polled. If CRITICAL vulnerabilities are found, the pipeline step fails and the deployment step is blocked. WARNING-level findings are logged but do not block deployment.

---

## FR-09: Image Retention Policy

### FR-09.1 Retention Configuration
GCP Artifact Registry (provisioned by feature 02) must be configured with a cleanup policy that:
- Keeps the last N images per app (default N=10)
- Keeps all images tagged with an environment tag (`dev`, `staging`, `production`) regardless of age
- Deletes untagged images after 7 days

### FR-09.2 Tag-Based Retention
Because commit SHA tags are immutable and environment tags are mutable, the retention policy can safely delete old SHA-tagged images while preserving currently deployed images via their environment tags.

---

## FR-10: Error Handling and Edge Cases

| Scenario | Required Behaviour |
|---|---|
| Docker build fails (compilation error) | Pipeline step exits non-zero. Image is not pushed. Deployment does not proceed. PR shows build failure. |
| Registry push fails (auth/network) | Pipeline step retries up to 3 times with exponential backoff. If all retries fail, pipeline fails. |
| Vulnerability scan finds CRITICAL | Pipeline blocks deployment step. Engineer must acknowledge or patch before deployment proceeds. |
| Migration job fails | Pipeline fails immediately. API container deployment does not proceed. The failed migration must be fixed and re-run manually or via a new commit. |
| Migration job succeeds but API deploy fails | Migration has already run. Rollback requires a down migration run manually. This scenario must be documented in runbook. |
| Mastra port conflict | If Mastra's observability port conflicts with another exposed port, the Dockerfile must be updated to use a non-conflicting port and the change documented. |
| Unaffected app has security patch in base image | Out-of-scope for this feature. A separate scheduled pipeline step (future work) should rebuild all images weekly to pick up base image security patches. |
