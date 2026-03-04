# Infrastructure — Product Requirements Document

## Overview

Infrastructure-as-Code (IaC) using **Terraform** to deploy and manage the iExcel automation system. The entire system lives in an **Nx monorepo** with container-per-concern isolation and selective CI/CD — only the components that changed get built and deployed. Target cloud providers are **Google Cloud** or **AWS** (decision pending), with Terraform abstracting the specifics.

## Problem Statement

Without structured infrastructure:

- Deploying one component redeploys everything — slow, risky, wasteful.
- Infrastructure changes are manual and unreproducible.
- No clear boundary between app code, shared libraries, and infra config.
- Environment drift between dev, staging, and production.
- Scaling individual components independently is impossible if they're bundled together.

---

## Design Principles

- **Deploy only what changed.** A UI fix should not trigger an API deployment. Nx's affected graph and CI/CD pipeline enforce this.
- **One container, one concern.** Each application is its own container with its own build, deploy, and scaling configuration.
- **Infrastructure is code.** Every cloud resource is defined in Terraform. No manual console clicks. All changes go through PR review.
- **Environment parity.** Dev, staging, and production use the same Terraform modules with different variable files. What works in staging works in production.
- **Secrets never live in code.** All credentials and tokens are managed by the cloud provider's secret manager, referenced by Terraform, injected at runtime.

---

## Nx Monorepo Structure

```
/
├── apps/
│   ├── auth/                 # OIDC provider / Auth service
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json      # Nx project config
│   ├── api/                  # REST API server
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json
│   ├── mastra/               # Mastra agent runtime
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json
│   └── ui/                   # Web UI (Next.js or similar)
│       ├── src/
│       ├── Dockerfile
│       └── project.json
│
├── packages/
│   ├── shared-types/         # TypeScript types shared across all apps
│   │   ├── src/
│   │   │   ├── task.ts       # Task, TaskVersion, short ID types
│   │   │   ├── agenda.ts     # Agenda, AgendaVersion types
│   │   │   ├── client.ts     # Client config types
│   │   │   ├── auth.ts       # OIDC token types, user identity types
│   │   │   ├── api.ts        # API request/response contracts
│   │   │   └── index.ts
│   │   └── project.json
│   ├── api-client/           # Generated or hand-written API client
│   │   ├── src/              # Used by UI, Mastra, and terminal MCP tools
│   │   └── project.json
│   ├── auth-client/          # OIDC client helpers (token validation, refresh, device flow)
│   │   ├── src/              # Used by API (validation), UI (auth code flow), terminal (device flow)
│   │   └── project.json
│   ├── database/             # Product database migrations and seed data
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── project.json
│   └── auth-database/        # Auth/identity database migrations
│       ├── migrations/
│       ├── seeds/
│       └── project.json
│
├── infra/
│   └── terraform/
│       ├── modules/
│       │   ├── networking/       # VPC, subnets, firewall/security groups
│       │   ├── database/         # Product Postgres instance (Cloud SQL / RDS)
│       │   ├── auth-database/    # Auth Postgres instance (separate from product)
│       │   ├── container-registry/ # GCR / ECR
│       │   ├── auth/             # Auth service container
│       │   ├── api/              # API container service
│       │   ├── mastra/           # Mastra container service
│       │   ├── ui/               # UI container service
│       │   ├── secrets/          # Secret manager config
│       │   ├── dns/              # DNS and load balancing
│       │   └── iam/              # Service accounts, roles, policies
│       ├── environments/
│       │   ├── dev.tfvars
│       │   ├── staging.tfvars
│       │   └── production.tfvars
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── project.json          # Nx project config for infra
│
├── nx.json                   # Nx workspace config
├── package.json
└── tsconfig.base.json
```

---

## Nx Dependency Graph

```
shared-types
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
 api-client      database       (direct)
     │              │              │
     ├──────┐       │              │
     ▼      ▼       │              ▼
    ui    mastra     │             api ◄── database
                     │
                     └──── api
```

**Key relationships:**
- `shared-types` is the root dependency — changes here affect everything downstream.
- `api-client` depends on `shared-types` and is consumed by `ui` and `mastra`.
- `api` depends on `shared-types` and `database` (migration types).
- `ui` depends on `shared-types` and `api-client`.
- `mastra` depends on `shared-types` and `api-client`.
- `infra/terraform` is independent — only triggered by changes to `.tf` files.

---

## Containers

### apps/auth

| Property | Value |
|---|---|
| **Runtime** | Node.js (or depends on OIDC provider choice — Ory Hydra is Go, Keycloak is Java) |
| **Port** | 8090 |
| **Health check** | `GET /health` |
| **Environment variables** | `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU. Critical path — all login flows go through here. |
| **Persistent storage** | None — stateless. Sessions and tokens in auth Postgres. |
| **Public endpoints** | `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/authorize`, `/token`, `/device`, `/device/authorize`, `/device/token` |

### apps/api

| Property | Value |
|---|---|
| **Runtime** | Node.js (or Python, pending tech stack decision) |
| **Port** | 8080 |
| **Health check** | `GET /health` |
| **Environment variables** | `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_JWKS_URL`, `ASANA_*`, `GRAIN_*`, `GOOGLE_*`, `EMAIL_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU |
| **Persistent storage** | None — stateless. All state in Postgres. |

### apps/mastra

| Property | Value |
|---|---|
| **Runtime** | Node.js (Mastra's runtime) |
| **Port** | 8081 (agent API) + Mastra's observability port |
| **Health check** | Mastra's built-in health endpoint |
| **Environment variables** | `API_BASE_URL`, `API_SERVICE_TOKEN`, `LLM_API_KEY`, Mastra-specific config |
| **Scaling** | Horizontal — based on workflow queue depth |
| **Persistent storage** | None — Mastra's own telemetry/observability may need a volume or external store |
| **Notes** | Mastra has its own backend for agent orchestration and observability. Container must respect Mastra's runtime expectations. Spike early to confirm containerization compatibility. |

### apps/ui

| Property | Value |
|---|---|
| **Runtime** | Node.js (Next.js or similar) |
| **Port** | 3000 |
| **Health check** | `GET /` or `GET /health` |
| **Environment variables** | `API_BASE_URL`, `NEXT_PUBLIC_*` for client-side config |
| **Scaling** | Horizontal — based on request count |
| **Persistent storage** | None — stateless. All state in API/Postgres. |
| **CDN** | Static assets served via CDN (Cloud CDN / CloudFront) |

### packages/database

Not a long-running container. Migrations run as a **job** during deployment.

| Property | Value |
|---|---|
| **Runtime** | Migration tool (e.g., Prisma Migrate, Drizzle Kit, golang-migrate) |
| **Trigger** | Runs as a pre-deploy step when `packages/database/migrations/` changes |
| **Rollback** | Each migration has a corresponding down migration |

---

## CI/CD Pipeline

### Trigger Logic

Every push to `main` (or PR merge) runs through this flow:

```
1. Nx determines affected projects
   └── nx affected:list --base=origin/main~1 --head=HEAD

2. For each affected project:
   ├── Lint
   ├── Type check
   ├── Unit tests
   └── Build

3. If build passes and target is a deployable app:
   ├── Build Docker image
   ├── Push to container registry
   ├── Run database migrations (if packages/database is affected)
   └── Deploy container to target environment

4. If infra/terraform is affected:
   ├── terraform plan (displayed in PR for review)
   └── terraform apply (on merge to main, with approval gate for production)
```

### What Triggers What

| Changed | Builds | Deploys |
|---|---|---|
| `apps/auth/` | auth | auth container |
| `apps/api/` | api | api container |
| `apps/mastra/` | mastra | mastra container |
| `apps/ui/` | ui | ui container |
| `packages/shared-types/` | auth, api, mastra, ui | all four containers |
| `packages/auth-client/` | api, ui, mastra | api + ui + mastra containers |
| `packages/api-client/` | ui, mastra | ui + mastra containers |
| `packages/database/` | api, database migrations | run migrations → api container |
| `packages/auth-database/` | auth, auth-db migrations | run auth migrations → auth container |
| `infra/terraform/` | terraform plan | terraform apply (with approval) |

### Environment Promotion

```
PR branch → dev (auto-deploy on PR open)
main       → staging (auto-deploy on merge)
staging    → production (manual promotion with approval gate)
```

### Pipeline Tooling

| Concern | Tool |
|---|---|
| **CI/CD runner** | GitHub Actions (or Cloud Build / CodePipeline depending on cloud choice) |
| **Container registry** | GCR / ECR |
| **Nx caching** | Nx Cloud (remote cache for CI) — avoids rebuilding unchanged projects |
| **Terraform state** | Remote backend (GCS bucket / S3 bucket with state locking via DynamoDB or native) |
| **Secret injection** | Cloud Secret Manager (GCP) / AWS Secrets Manager — referenced in Terraform, injected as env vars at runtime |

---

## Terraform Modules

### networking

- VPC with private subnets for containers and database.
- Public subnet for load balancer only.
- Firewall / security groups: containers only accept traffic from the load balancer. Database only accepts traffic from containers.

### database

- Managed Postgres instance (Cloud SQL / RDS).
- Private networking — no public IP.
- Automated backups with point-in-time recovery.
- Connection pooling (PgBouncer or built-in).
- Separate credentials per environment.

### container-registry

- Private container registry.
- Image retention policy (keep last N images per app).
- Vulnerability scanning on push.

### api / mastra / ui

Each app module defines:
- Container service (Cloud Run / ECS Fargate / GKE / EKS).
- Auto-scaling rules (min/max instances, scaling metric).
- Health check configuration.
- Environment variable injection from secret manager.
- Log routing to centralized logging.
- Custom domain and TLS.

### secrets

- All credentials stored in cloud secret manager.
- Terraform creates the secret references — actual values are set manually or via a separate secure process.
- Secrets include: `DATABASE_URL`, `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `SIGNING_KEY_PRIVATE`, `SIGNING_KEY_PUBLIC`, Asana OAuth tokens, Grain API key, Google Docs service account, LLM API key, email provider API key.

### dns

- DNS records for all public endpoints.
- Load balancer with TLS termination.
- Routing rules:
  - `app.domain.com` → UI container
  - `api.domain.com` → API container
  - `api.domain.com/shared/*` → API container (public, no auth)
  - `auth.domain.com` → Auth service container

### iam

- Service accounts per container (least privilege).
- API container: access to Postgres, secret manager, external service credentials.
- Mastra container: access to API (via service token), LLM API key, secret manager.
- UI container: access to API only (via public URL, no direct cloud resource access).
- CI/CD service account: access to container registry, container services, Terraform state.

---

## Cloud Provider Decision

Terraform modules are structured to support either GCP or AWS. The decision affects:

| Concern | GCP | AWS |
|---|---|---|
| **Containers** | Cloud Run | ECS Fargate |
| **Database** | Cloud SQL (Postgres) | RDS (Postgres) |
| **Registry** | Artifact Registry | ECR |
| **Secrets** | Secret Manager | Secrets Manager |
| **DNS / LB** | Cloud DNS + Cloud Load Balancing | Route 53 + ALB |
| **CDN** | Cloud CDN | CloudFront |
| **IAM** | Service Accounts | IAM Roles |
| **Terraform state** | GCS bucket | S3 + DynamoDB |
| **CI/CD** | Cloud Build (or GitHub Actions) | CodePipeline (or GitHub Actions) |

**Recommendation:** Defer decision until team evaluates existing cloud account access, cost, and familiarity. Terraform modules should be written to make switching straightforward.

---

## Related PRDs

| Layer | PRD | Relationship |
|---|---|---|
| **Auth** | [`auth-prd.md`](./auth-prd.md) | Deployed as `apps/auth` container. Terraform provisions auth database and signing key secrets. |
| **Database** | [`database-prd.md`](./database-prd.md) | Schema and migrations live in `packages/database/`. Terraform provisions the Postgres instance. |
| **API** | [`api-prd.md`](./api-prd.md) | Deployed as `apps/api` container. Terraform manages its service, scaling, and secrets. |
| **Mastra** | [`mastra-prd.md`](./mastra-prd.md) | Deployed as `apps/mastra` container. Has its own runtime requirements — needs early spike. |
| **UI** | [`ui-prd.md`](./ui-prd.md) | Deployed as `apps/ui` container with CDN for static assets. |
| **Terminal** | [`terminal-prd.md`](./terminal-prd.md) | Not deployed — runs on user machines. Connects to API and Mastra MCP server. |

---

## Open Questions

- [ ] GCP or AWS? Or multi-cloud from the start?
- [ ] Container orchestration: Cloud Run / ECS Fargate (serverless) vs. GKE / EKS (Kubernetes)? Serverless is simpler but Kubernetes gives more control.
- [ ] Does Mastra's runtime have specific containerization requirements or constraints? Spike needed.
- [ ] Nx Cloud for remote caching — free tier or paid? Worth it for CI speed.
- [ ] Should dev environments be ephemeral (spin up per PR, tear down on merge) or shared?
- [ ] Database migration strategy — who approves schema changes before they run in production?
- [ ] Do we need a staging environment that mirrors production data (anonymized)?
- [ ] Monitoring and alerting — Datadog, Grafana Cloud, or cloud-native (Cloud Monitoring / CloudWatch)?
