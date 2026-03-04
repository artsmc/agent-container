# FRS — Functional Requirement Specification
# Feature 36: Terraform App Deployment

**Date:** 2026-03-03
**Phase:** Phase 8 — CI/CD & Deployment

---

## 1. Overview

This document specifies the functional requirements for the four application Terraform modules (`auth`, `api`, `mastra`, `ui`) and their integration into the root composition, environment variable files, and CI/CD pipeline. Feature 02 has already provisioned the base infrastructure (networking, database, secrets, dns stubs, iam, container-registry). Feature 36 builds on top of that foundation to deploy the running application containers.

---

## 2. Shared Module Pattern

All four app modules follow the same structural pattern. Differences are in specific values (ports, env vars, scaling metrics, CDN). The shared pattern ensures consistency across modules and reduces cognitive overhead when maintaining them.

### 2.1 Required Files per Module

Each module directory under `infra/terraform/modules/{app}/` must contain:

```
modules/{app}/
├── main.tf        # Container service resource, scaling, health check, log routing
├── variables.tf   # All input variables with descriptions and types
├── outputs.tf     # Service URL, service name, revision/task definition ID
└── README.md      # Module documentation: inputs, outputs, usage example
```

### 2.2 Shared Input Variables (all four modules)

Every app module must accept these input variables:

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name: `dev`, `staging`, or `production` |
| `project_name` | string | Resource naming prefix (e.g., `iexcel`) |
| `region` | string | Cloud region for the container service |
| `image_url` | string | Full container image URL including tag (from Feature 35) |
| `min_instances` | number | Minimum number of running container instances |
| `max_instances` | number | Maximum number of instances for auto-scaling |
| `service_account` | string | GCP IAM service account email for the container (from Feature 02 IAM module) |
| `secret_references` | map(string) | Map of env var name to GCP Secret Manager secret name (from Feature 02 secrets module) |
| `log_destination` | string | Cloud logging destination identifier |
| `network_config` | object | VPC, subnet, and security group IDs from networking module outputs |

### 2.3 Shared Outputs (all four modules)

| Output | Description |
|---|---|
| `service_url` | The URL at which the container service is reachable internally |
| `service_name` | Cloud provider's resource name/ID for the container service |
| `latest_revision` | Cloud Run latest revision name |

### 2.4 Resource Naming Convention

All resources created by the app modules must follow: `{project_name}-{environment}-{app}` (e.g., `iexcel-dev-api`, `iexcel-prod-ui`).

### 2.5 Tagging / Labelling

All resources must be tagged with:
- `environment`: value of `var.environment`
- `project`: value of `var.project_name`
- `app`: the application name (`auth`, `api`, `mastra`, `ui`)
- `managed-by`: `terraform`
- `feature`: `36-terraform-app-deployment`

---

## 3. `modules/auth/`

### APP-AUTH-01: Container Service

The auth module creates a Cloud Run service with:
- Port `8090` exposed
- Non-root user enforced (inherited from Dockerfile)
- Container image from `var.image_url`

### APP-AUTH-02: Health Check

Health check must poll `GET /health` on port `8090`:

| Parameter | Value |
|---|---|
| Path | `/health` |
| Port | `8090` |
| Protocol | HTTP |
| Interval | 30 seconds |
| Timeout | 5 seconds |
| Healthy threshold | 2 consecutive successes |
| Unhealthy threshold | 3 consecutive failures |
| Initial delay | 15 seconds (start-period for container initialisation) |

### APP-AUTH-03: Environment Variables from Secret Manager

The following environment variables must be injected at runtime from secret manager references:

| Environment Variable | Source Secret (from Feature 02 secrets module) |
|---|---|
| `AUTH_DATABASE_URL` | `secret_references["AUTH_DATABASE_URL"]` |
| `IDP_CLIENT_ID` | `secret_references["IDP_CLIENT_ID"]` |
| `IDP_CLIENT_SECRET` | `secret_references["IDP_CLIENT_SECRET"]` |
| `IDP_ISSUER_URL` | `secret_references["IDP_ISSUER_URL"]` |
| `SIGNING_KEY_PRIVATE` | `secret_references["SIGNING_KEY_PRIVATE"]` |
| `SIGNING_KEY_PUBLIC` | `secret_references["SIGNING_KEY_PUBLIC"]` |

No environment variable values are set in Terraform directly. All are references to cloud secret manager resources.

### APP-AUTH-04: Auto-Scaling

| Parameter | Value |
|---|---|
| Scaling trigger | Request count per instance (HTTP requests per second) |
| Min instances | `var.min_instances` (default: 1 for dev, 2 for staging/production) |
| Max instances | `var.max_instances` (default: 5 for dev, 20 for production) |
| Scale-up threshold | Configurable via module variable `scaling_target_rps` |
| Rationale | Auth is on the critical login path; must scale quickly on traffic bursts |

### APP-AUTH-05: Custom Domain and TLS

The auth module must register the container service as the backend for `auth.{domain}` via the dns module's target group / backend service output from Feature 02:

| Parameter | Value |
|---|---|
| Backend service input | `var.auth_target_group_id` (from Feature 02 dns module output `auth_backend_service_id`) |
| Domain | `auth.{var.domain}` |
| TLS | Terminated at the load balancer (managed certificate from Feature 02 dns module) |

### APP-AUTH-06: Public Endpoints

The auth service exposes these public endpoints. The load balancer must not require auth headers for these paths (auth enforcement is in the auth container itself):
- `/.well-known/openid-configuration`
- `/.well-known/jwks.json`
- `/authorize`
- `/token`
- `/device`
- `/device/authorize`
- `/device/token`

### APP-AUTH-07: Log Routing

All container logs must be routed to the centralised logging destination (`var.log_destination`). Log format: structured JSON.

### APP-AUTH-08: Module-Specific Input Variables

| Variable | Type | Description | Default |
|---|---|---|---|
| `scaling_target_rps` | number | Target requests per second per instance before scale-up | 100 |
| `auth_target_group_id` | string | DNS module backend service ID for `auth.domain` | — |

---

## 4. `modules/api/`

### APP-API-01: Container Service

Container service on port `8080`.

### APP-API-02: Health Check

| Parameter | Value |
|---|---|
| Path | `/health` |
| Port | `8080` |
| Protocol | HTTP |
| Interval | 30 seconds |
| Timeout | 5 seconds |
| Healthy threshold | 2 |
| Unhealthy threshold | 3 |
| Initial delay | 15 seconds |

### APP-API-03: Environment Variables from Secret Manager

| Environment Variable | Source Secret |
|---|---|
| `DATABASE_URL` | `secret_references["DATABASE_URL"]` |
| `AUTH_ISSUER_URL` | `secret_references["AUTH_ISSUER_URL"]` |
| `AUTH_JWKS_URL` | `secret_references["AUTH_JWKS_URL"]` |
| `ASANA_CLIENT_ID` | `secret_references["ASANA_CLIENT_ID"]` |
| `ASANA_CLIENT_SECRET` | `secret_references["ASANA_CLIENT_SECRET"]` |
| `ASANA_ACCESS_TOKEN` | `secret_references["ASANA_ACCESS_TOKEN"]` |
| `GRAIN_API_KEY` | `secret_references["GRAIN_API_KEY"]` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `secret_references["GOOGLE_SERVICE_ACCOUNT_JSON"]` |
| `EMAIL_PROVIDER_API_KEY` | `secret_references["EMAIL_PROVIDER_API_KEY"]` |

### APP-API-04: Auto-Scaling

| Parameter | Value |
|---|---|
| Scaling trigger | Request count / CPU utilisation (whichever fires first) |
| Min instances | `var.min_instances` |
| Max instances | `var.max_instances` |

### APP-API-05: Custom Domain and TLS

| Parameter | Value |
|---|---|
| Backend service input | `var.api_target_group_id` (from Feature 02 dns module output `api_backend_service_id`) |
| Domain | `api.{var.domain}` |
| TLS | Terminated at load balancer |

### APP-API-06: Public Path Routing

The path `api.{domain}/shared/*` is a public route (no additional auth header required at the load balancer level). The API container enforces this distinction internally. The load balancer routing rule for this path must be declared in the dns module (Feature 02) and referenced here — Feature 36 does not modify the load balancer rules, only attaches the container service as the backend target.

### APP-API-07: Log Routing

Same as APP-AUTH-07.

### APP-API-08: Module-Specific Input Variables

| Variable | Type | Description | Default |
|---|---|---|---|
| `scaling_target_cpu_percent` | number | CPU utilisation percent before scale-up | 70 |
| `api_target_group_id` | string | DNS module backend service ID for `api.domain` | — |

---

## 5. `modules/mastra/`

### APP-MASTRA-01: Container Service

Container service on port `8081`. If Mastra's observability layer uses a separate port, that port must also be exposed. The exact observability port must be confirmed by the Mastra containerisation spike (see TR.md).

### APP-MASTRA-02: Health Check

| Parameter | Value |
|---|---|
| Path | `/health` (Mastra's built-in health endpoint — confirm exact path with spike) |
| Port | `8081` |
| Protocol | HTTP |
| Interval | 30 seconds |
| Timeout | 5 seconds |
| Healthy threshold | 2 |
| Unhealthy threshold | 3 |
| Initial delay | 30 seconds (Mastra has longer initialisation time than other containers) |

### APP-MASTRA-03: Environment Variables from Secret Manager

| Environment Variable | Source Secret |
|---|---|
| `API_BASE_URL` | `secret_references["API_BASE_URL"]` or direct variable (not a secret — the API's internal URL) |
| `API_SERVICE_TOKEN` | `secret_references["API_SERVICE_TOKEN"]` |
| `LLM_API_KEY` | `secret_references["LLM_API_KEY"]` |
| `MASTRA_CLIENT_ID` | `secret_references["MASTRA_CLIENT_ID"]` |
| `MASTRA_CLIENT_SECRET` | `secret_references["MASTRA_CLIENT_SECRET"]` |
| `AUTH_ISSUER_URL` | `secret_references["AUTH_ISSUER_URL"]` |
| `LLM_PROVIDER` | Direct variable (not secret — e.g., `"anthropic"` or `"openai"`) |
| `LLM_MODEL` | Direct variable (not secret — e.g., `"anthropic/claude-opus-4-6"`) |

**Note on `API_BASE_URL` and direct variables:** Some values are configuration (not secrets) and may be passed as direct environment variables rather than secret manager references. Feature 36 must distinguish between secret-manager-sourced env vars and plain config env vars. Both are injected at runtime; only secrets require secret manager references.

### APP-MASTRA-04: Auto-Scaling

| Parameter | Value |
|---|---|
| Scaling trigger | Workflow queue depth (custom metric) — or CPU utilisation as fallback if custom metric is not available |
| Min instances | `var.min_instances` (default: 1) |
| Max instances | `var.max_instances` (default: 5) |
| Note | Queue-depth-based scaling requires a custom metric source. If this is not feasible for the chosen cloud provider's container service, fall back to CPU-based scaling. Document the choice. |

### APP-MASTRA-05: No Public Domain

The Mastra container service does not have a public-facing custom domain. It is accessible:
- Internally by the API container (service-to-service via internal URL)
- By the MCP proxy (terminal users) — this access path must be confirmed during implementation (may require VPN or bastion)

The Mastra module does not wire into the dns module's target groups.

### APP-MASTRA-06: Observability Port

If Mastra's runtime exposes an observability port (e.g., 4318 for OTLP), that port must be opened within the container networking configuration but must NOT be exposed externally via the load balancer.

### APP-MASTRA-07: Log Routing

Same as APP-AUTH-07.

### APP-MASTRA-08: Module-Specific Input Variables

| Variable | Type | Description | Default |
|---|---|---|---|
| `observability_port` | number | Mastra's observability port (set to 0 to disable) | 4318 |
| `llm_provider` | string | LLM provider name (plain config var) | — |
| `llm_model` | string | LLM model identifier (plain config var) | — |
| `api_internal_url` | string | Internal URL of the API container service (service-to-service) | — |

---

## 6. `modules/ui/`

### APP-UI-01: Container Service

Container service on port `3000`.

### APP-UI-02: Health Check

| Parameter | Value |
|---|---|
| Path | `/` (or `/health` if the Next.js app exposes a dedicated health route) |
| Port | `3000` |
| Protocol | HTTP |
| Interval | 30 seconds |
| Timeout | 5 seconds |
| Healthy threshold | 2 |
| Unhealthy threshold | 3 |
| Initial delay | 20 seconds |

### APP-UI-03: Environment Variables

The UI container's runtime environment variables are fewer than other containers. The Next.js standalone runtime only needs:

| Environment Variable | Source | Type |
|---|---|---|
| `API_BASE_URL` | Direct variable (the API's public URL, e.g., `https://api.{domain}`) | Config (not secret) |
| `NEXT_PUBLIC_AUTH_URL` | Direct variable (the auth service's public URL) | Config (not secret) |
| `NEXT_PUBLIC_API_URL` | Direct variable (the API's public URL — for client-side fetches) | Config (not secret) |

`NEXT_PUBLIC_*` variables are baked into the Next.js build at build time (Feature 35) via build args. At runtime, the container needs only non-public env vars. See Feature 35's FR-04.7 for the build-time/runtime distinction.

### APP-UI-04: Auto-Scaling

| Parameter | Value |
|---|---|
| Scaling trigger | Request count per instance |
| Min instances | `var.min_instances` |
| Max instances | `var.max_instances` |

### APP-UI-05: Custom Domain and TLS

| Parameter | Value |
|---|---|
| Backend service input | `var.ui_target_group_id` (from Feature 02 dns module output `ui_backend_service_id`) |
| Domain | `app.{var.domain}` |
| TLS | Terminated at load balancer |

### APP-UI-06: CDN for Static Assets

The UI module must configure a CDN distribution to serve static assets:

| Aspect | Specification |
|---|---|
| CDN type | Cloud CDN (GCP) |
| Origin | The UI container service's URL (or the load balancer's URL for the UI backend) |
| Cached paths | `/_next/static/*`, `/static/*`, `/favicon.ico`, `/robots.txt` |
| Cache policy | Long TTL for versioned static assets (immutable assets from `/_next/static/`), short TTL for HTML |
| Cache invalidation | Triggered by Terraform apply on new deployment (invalidate `/*` on CDN distribution) |

### APP-UI-07: Log Routing

Same as APP-AUTH-07.

### APP-UI-08: Module-Specific Input Variables

| Variable | Type | Description | Default |
|---|---|---|---|
| `ui_target_group_id` | string | DNS module backend service ID for `app.domain` | — |
| `api_public_url` | string | Public URL of the API (injected as API_BASE_URL) | — |
| `auth_public_url` | string | Public URL of the auth service | — |
| `cdn_price_class` | string | Cloud CDN cache tier (PREMIUM / STANDARD) | Standard |

---

## 7. Root `main.tf` Integration

### ROOT-01: Module Instantiation Order

The root `main.tf` must instantiate the four app modules after the base infrastructure modules. The dependency order for feature 36's additions:

```
(Feature 02 base modules) → auth module
                           → api module
                           → mastra module (depends on api module output for api_internal_url)
                           → ui module
```

All four app modules depend on:
- `module.networking` (for `network_config`)
- `module.iam` (for `service_account`)
- `module.secrets` (for `secret_references`)
- `module.dns` (for `backend_service_id` values where applicable)
- `module.container_registry` (indirectly, via `image_url` variables)

### ROOT-02: New Root Variables

The following variables must be added to `infra/terraform/variables.tf`:

| Variable | Type | Description |
|---|---|---|
| `auth_image_url` | string | Full image URL for the auth container |
| `api_image_url` | string | Full image URL for the API container |
| `mastra_image_url` | string | Full image URL for the Mastra container |
| `ui_image_url` | string | Full image URL for the UI container |
| `auth_min_instances` | number | Min instances for auth service |
| `auth_max_instances` | number | Max instances for auth service |
| `api_min_instances` | number | Min instances for API service |
| `api_max_instances` | number | Max instances for API service |
| `mastra_min_instances` | number | Min instances for Mastra service |
| `mastra_max_instances` | number | Max instances for Mastra service |
| `ui_min_instances` | number | Min instances for UI service |
| `ui_max_instances` | number | Max instances for UI service |
| `llm_provider` | string | LLM provider for Mastra (plain config) |
| `llm_model` | string | LLM model for Mastra (plain config) |

### ROOT-03: New Root Outputs

The following outputs must be added to `infra/terraform/outputs.tf`:

| Output | Description |
|---|---|
| `auth_service_url` | Internal URL for the auth container service |
| `api_service_url` | Internal URL for the API container service |
| `mastra_service_url` | Internal URL for the Mastra container service |
| `ui_service_url` | Internal URL for the UI container service |
| `cdn_distribution_url` | Public CDN URL for UI static assets |

---

## 8. Environment Variable Files

### ENV-01: Updated `dev.tfvars`

Add the following to `infra/terraform/environments/dev.tfvars`:

```hcl
# App container images — set by CI/CD pipeline (image_url = registry/{app}:dev)
auth_image_url    = "IMAGE_PLACEHOLDER"   # Replaced by CI/CD before apply
api_image_url     = "IMAGE_PLACEHOLDER"
mastra_image_url  = "IMAGE_PLACEHOLDER"
ui_image_url      = "IMAGE_PLACEHOLDER"

# Instance counts — minimal for dev
auth_min_instances    = 0   # Scale to zero when idle
auth_max_instances    = 3
api_min_instances     = 0
api_max_instances     = 3
mastra_min_instances  = 0
mastra_max_instances  = 2
ui_min_instances      = 0
ui_max_instances      = 3

# LLM config
llm_provider = "anthropic"
llm_model    = "anthropic/claude-opus-4-6"
```

### ENV-02: Updated `staging.tfvars`

Same structure as dev.tfvars with:
- `min_instances = 1` for all services (always at least one instance running)
- `max_instances` matching staging throughput expectations

### ENV-03: Updated `production.tfvars`

Same structure with:
- `min_instances = 2` for auth and api (high availability, no cold start on critical paths)
- `min_instances = 1` for mastra and ui
- `max_instances` sized for production traffic

---

## 9. CI/CD Pipeline Integration

### CICD-01: Terraform Plan on PR

When a PR changes any file matching `infra/terraform/**`:
1. CI/CD runs `terraform init` with the remote backend
2. CI/CD runs `terraform plan -var-file=environments/dev.tfvars -out=plan.tfplan`
3. The plan output is posted as a comment on the PR for reviewer inspection
4. The plan must exit with code 0 (no errors) for the CI check to pass
5. The plan may show changes — reviewers must inspect what will change before merging

### CICD-02: Terraform Apply on Merge to Main

When a merge to `main` includes changes to `infra/terraform/**`:
1. CI/CD runs `terraform apply` with the dev/staging variable file automatically
2. Production apply requires an explicit manual approval gate before running

### CICD-03: Image URL Injection

Before `terraform apply`, the CI/CD pipeline must substitute the `IMAGE_PLACEHOLDER` values in the `.tfvars` file with the actual image URLs built by Feature 35. The image URL format (from Feature 35 FR-07.1):
```
{registry_url}/{project}/{app}:{git_sha}
```

The CI/CD pipeline injects these via `-var` flags or by generating a CI-specific `.tfvars` file that overrides `IMAGE_PLACEHOLDER`:
```
terraform apply \
  -var-file=environments/staging.tfvars \
  -var="api_image_url=${REGISTRY}/iexcel/api:${GIT_SHA}" \
  -var="auth_image_url=${REGISTRY}/iexcel/auth:${GIT_SHA}" \
  ...
```

### CICD-04: Affected-Only Apply

The CI/CD pipeline (Feature 34) uses Nx's affected graph to determine which apps changed. When only `apps/api/` changed, only `api_image_url` needs to be updated. The Terraform apply will detect that only the API module's image changed and only redeploy that container.

---

## 10. Error Handling and Edge Cases

| Scenario | Handling |
|---|---|
| Container fails health check after deployment | Cloud provider marks new revision/task as unhealthy; previous revision/task continues serving. Terraform reports the apply as failed. Engineer must inspect container logs. |
| Secret value not populated in secret manager | Container fails to start with an environment variable error. Health check fails. Previous deployment continues. Operator must populate the secret value. |
| `terraform apply` fails mid-way | Terraform state is partially updated. The partially-applied state is safe to re-apply. CI/CD must not block subsequent applies. |
| Image URL not found in registry | Container service fails to pull image. Health check fails. Operator must verify the image was pushed by Feature 35 pipeline. |
| CDN cache contains stale assets after deployment | Cache invalidation step in Terraform apply clears the CDN. If invalidation fails, assets will be stale until TTL expires. A manual invalidation can be triggered from the cloud console. |
| Mastra observability port conflicts | If Mastra's runtime uses a port that conflicts with another service, update `observability_port` variable and re-apply. |
| Scale-to-zero for dev causes cold starts | Acceptable for dev. Cold start latency (typically 5-15 seconds for Node.js containers) is a known trade-off for dev cost savings. |

---

## 11. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Idempotency** | `terraform apply` may be run multiple times without creating duplicate resources or causing errors. |
| **Naming consistency** | All resources follow `{project_name}-{environment}-{app}` convention. |
| **Tagging** | All resources tagged per section 2.5. |
| **Code formatting** | All `.tf` files formatted with `terraform fmt` before committing. |
| **Validation** | Input variables with constrained values (e.g., `environment`) use Terraform `validation` blocks. |
| **Documentation** | Each module has a `README.md` with inputs, outputs, and a usage example. |
| **Minimum Terraform version** | `>= 1.9.0`. Specify in each module's `terraform {}` block. |
| **Provider version pinning** | Provider versions are pinned in the root `terraform {}` block. Module-level providers are not declared (modules inherit from the root). |
