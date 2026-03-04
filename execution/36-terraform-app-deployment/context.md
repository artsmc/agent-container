# Feature 36: Terraform App Deployment

## Summary
Create Terraform modules for deploying application containers (auth, api, mastra, ui). Each module defines a container service (Cloud Run/ECS), auto-scaling rules, health checks, environment variable injection from secret manager, log routing, custom domains, and TLS. Also integrates terraform plan/apply into the CI/CD pipeline for infrastructure-as-code deployment.

## Phase
Phase 8 — CI/CD & Deployment

## Dependencies
- **Blocked by**: 02 (Terraform Base Infra — provides networking, database, container-registry, secrets, dns, and iam modules that these app modules depend on), 35 (Container Builds — provides built Docker images in the registry to deploy)
- **Blocks**: None (leaf node)

## Source PRDs
- `infra-prd.md` — Terraform Modules section (api, mastra, ui, auth module definitions), dns module (routing rules, TLS), iam module (service accounts per container), Containers section (ports, health checks, env vars, scaling), CI/CD Pipeline section (terraform plan/apply integration)

## Relevant PRD Extracts

### Terraform App Modules (infra-prd.md)

Each app module defines:
- Container service (Cloud Run / ECS Fargate / GKE / EKS).
- Auto-scaling rules (min/max instances, scaling metric).
- Health check configuration.
- Environment variable injection from secret manager.
- Log routing to centralized logging.
- Custom domain and TLS.

### Container: apps/auth (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (or depends on OIDC provider choice) |
| **Port** | 8090 |
| **Health check** | `GET /health` |
| **Environment variables** | `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU. Critical path — all login flows go through here. |
| **Public endpoints** | `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/authorize`, `/token`, `/device`, `/device/authorize`, `/device/token` |

### Container: apps/api (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (or Python) |
| **Port** | 8080 |
| **Health check** | `GET /health` |
| **Environment variables** | `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_JWKS_URL`, `ASANA_*`, `GRAIN_*`, `GOOGLE_*`, `EMAIL_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU |

### Container: apps/mastra (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Mastra's runtime) |
| **Port** | 8081 (agent API) + Mastra's observability port |
| **Health check** | Mastra's built-in health endpoint |
| **Environment variables** | `API_BASE_URL`, `API_SERVICE_TOKEN`, `LLM_API_KEY`, Mastra-specific config |
| **Scaling** | Horizontal — based on workflow queue depth |

### Container: apps/ui (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Next.js or similar) |
| **Port** | 3000 |
| **Health check** | `GET /` or `GET /health` |
| **Environment variables** | `API_BASE_URL`, `NEXT_PUBLIC_*` for client-side config |
| **Scaling** | Horizontal — based on request count |
| **CDN** | Static assets served via CDN (Cloud CDN / CloudFront) |

### DNS Module (infra-prd.md)

- DNS records for all public endpoints.
- Load balancer with TLS termination.
- Routing rules:
  - `app.domain.com` -> UI container
  - `api.domain.com` -> API container
  - `api.domain.com/shared/*` -> API container (public, no auth)
  - `auth.domain.com` -> Auth service container

### IAM Module (infra-prd.md)

- Service accounts per container (least privilege).
- API container: access to Postgres, secret manager, external service credentials.
- Mastra container: access to API (via service token), LLM API key, secret manager.
- UI container: access to API only (via public URL, no direct cloud resource access).
- CI/CD service account: access to container registry, container services, Terraform state.

### CI/CD Terraform Integration (infra-prd.md)

```
4. If infra/terraform is affected:
   ├── terraform plan (displayed in PR for review)
   └── terraform apply (on merge to main, with approval gate for production)
```

### Environment Promotion (infra-prd.md)

```
PR branch → dev (auto-deploy on PR open)
main       → staging (auto-deploy on merge)
staging    → production (manual promotion with approval gate)
```

### Cloud Provider Decision (infra-prd.md)

| Concern | GCP | AWS |
|---|---|---|
| **Containers** | Cloud Run | ECS Fargate |
| **DNS / LB** | Cloud DNS + Cloud Load Balancing | Route 53 + ALB |
| **CDN** | Cloud CDN | CloudFront |
| **IAM** | Service Accounts | IAM Roles |

### Design Principles (infra-prd.md)

- **One container, one concern.** Each application is its own container with its own build, deploy, and scaling configuration.
- **Environment parity.** Dev, staging, and production use the same Terraform modules with different variable files. What works in staging works in production.
- **Secrets never live in code.** All credentials and tokens are managed by the cloud provider's secret manager, referenced by Terraform, injected at runtime.

## Scope

### In Scope
- `modules/auth/` — Terraform module for auth service container deployment:
  - Container service (Cloud Run / ECS Fargate) on port 8090
  - Health check: `GET /health`
  - Auto-scaling: horizontal based on request count / CPU
  - Env var injection: `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*` from secret manager
  - Log routing to centralized logging
  - Custom domain: `auth.domain.com` with TLS
- `modules/api/` — Terraform module for API container deployment:
  - Container service on port 8080
  - Health check: `GET /health`
  - Auto-scaling: horizontal based on request count / CPU
  - Env var injection: `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_JWKS_URL`, `ASANA_*`, `GRAIN_*`, `GOOGLE_*`, `EMAIL_*` from secret manager
  - Log routing to centralized logging
  - Custom domain: `api.domain.com` with TLS
  - Route `api.domain.com/shared/*` as public (no auth)
- `modules/mastra/` — Terraform module for Mastra container deployment:
  - Container service on port 8081 + observability port
  - Health check: Mastra's built-in health endpoint
  - Auto-scaling: horizontal based on workflow queue depth
  - Env var injection: `API_BASE_URL`, `API_SERVICE_TOKEN`, `LLM_API_KEY`, Mastra-specific config from secret manager
  - Log routing to centralized logging
- `modules/ui/` — Terraform module for UI container deployment:
  - Container service on port 3000
  - Health check: `GET /` or `GET /health`
  - Auto-scaling: horizontal based on request count
  - Env var injection: `API_BASE_URL`, `NEXT_PUBLIC_*`
  - CDN configuration for static assets (Cloud CDN / CloudFront)
  - Custom domain: `app.domain.com` with TLS
- Integration with `modules/dns/` for routing rules and TLS termination
- Integration with `modules/iam/` for per-container service accounts (least privilege)
- Integration with `modules/secrets/` for env var references
- Environment-specific variable files (`dev.tfvars`, `staging.tfvars`, `production.tfvars`) updated with app deployment variables
- Terraform plan/apply integration in CI/CD pipeline (plan on PR, apply on merge)

### Out of Scope
- Base infrastructure modules (networking, database, container-registry, secrets, dns, iam) — that is feature 02
- Dockerfile creation and container image building — that is feature 35
- CI/CD pipeline setup — that is feature 34
- Cloud provider final decision — modules should be structured to support either GCP or AWS
- Mastra runtime compatibility — should be confirmed by spike before this feature

## Key Decisions
- **Same module structure for all four apps.** Each app module (auth, api, mastra, ui) follows the same pattern: container service + auto-scaling + health check + env vars + logging + domain/TLS. Differences are in the specific values (ports, env vars, scaling metrics).
- **Environment parity via tfvars.** All environments use the same Terraform modules. Only the variable files differ (instance sizes, replica counts, domain names).
- **Secrets are referenced, not stored.** Terraform creates references to secrets in the cloud secret manager. Actual secret values are set manually or via a separate secure process. The container service pulls secrets at runtime.
- **Terraform plan is a PR gate.** Changes to `infra/terraform/` trigger `terraform plan` in the PR for review. `terraform apply` runs on merge to main, with production requiring explicit approval.
- **CDN is UI-only.** Static assets from the UI container are served via CDN. API and Mastra do not use CDN.
- **Mastra may need special treatment.** Mastra has its own observability port and runtime expectations. The Terraform module must accommodate these — confirm requirements via early spike.
