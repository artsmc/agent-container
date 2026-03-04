# TR — Technical Requirements
# Feature 36: Terraform App Deployment

**Date:** 2026-03-03
**Phase:** Phase 8 — CI/CD & Deployment

---

## 1. Architecture Overview

Feature 36 extends the Terraform infrastructure layer established by Feature 02. Feature 02 provisioned the base infrastructure (networking, database, secrets, DNS stubs, IAM, container registry). Feature 36 adds the application container service modules and wires them into the root composition.

### 1.1 Infrastructure State After Feature 36

```
infra/terraform/
├── modules/
│   ├── networking/         (Feature 02)
│   ├── database/           (Feature 02)
│   ├── auth-database/      (Feature 02)
│   ├── container-registry/ (Feature 02)
│   ├── secrets/            (Feature 02)
│   ├── dns/                (Feature 02)
│   ├── iam/                (Feature 02)
│   ├── auth/               (Feature 36 — NEW)
│   ├── api/                (Feature 36 — NEW)
│   ├── mastra/             (Feature 36 — NEW)
│   └── ui/                 (Feature 36 — NEW)
├── environments/
│   ├── dev.tfvars          (Feature 02 + Feature 36 additions)
│   ├── staging.tfvars      (Feature 02 + Feature 36 additions)
│   └── production.tfvars   (Feature 02 + Feature 36 additions)
├── main.tf                 (updated by Feature 36)
├── variables.tf            (updated by Feature 36)
├── outputs.tf              (updated by Feature 36)
└── backend.tf              (Feature 02)
```

### 1.2 Module Dependency Graph

```
networking ──────────────────────────────────────────┐
                                                      │
database ──── (networking)                            │
auth-database ── (networking)                         │
                                                      │
container-registry                                    │
                                                      │
secrets                                               │
                                                      │
iam ──── (container-registry, secrets)                │
                                                      │
dns ──── (networking)                                 │
                                                      ▼
auth ─── (networking, iam, secrets, dns)        [Feature 36]
api  ─── (networking, iam, secrets, dns)        [Feature 36]
mastra ── (networking, iam, secrets, api.output)[Feature 36]
ui   ─── (networking, iam, secrets, dns)        [Feature 36]
```

---

## 2. Cloud Provider: GCP Cloud Run

GCP has been selected as the cloud provider. All app deployment modules use Cloud Run exclusively. There are no AWS/ECS Fargate conditional blocks or alternative implementations.

### 2.1 GCP Cloud Run Implementation

| Concern | Resource |
|---|---|
| Container service | `google_cloud_run_v2_service` |
| Auto-scaling | `scaling` block on Cloud Run service (min/max instance count) |
| Health check | `liveness_probe` on Cloud Run container |
| Env var from secret | `env.value_source.secret_key_ref` referencing GCP Secret Manager secrets |
| Log routing | Cloud Logging (logs are emitted by Cloud Run automatically) |
| Domain binding | `google_cloud_run_v2_service_iam_member` + Cloud Load Balancer backend binding |
| IAM | `service_account` on Cloud Run service template referencing IAM module output |

---

## 3. Auth Module Technical Specification

### 3.1 Cloud Run Implementation

```hcl
resource "google_cloud_run_v2_service" "auth" {
  name     = "${var.project_name}-${var.environment}-auth"
  location = var.region

  template {
    service_account = var.service_account

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image_url
      ports { container_port = 8090 }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8090
        }
        initial_delay_seconds = 15
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      dynamic "env" {
        for_each = var.secret_references
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }
}
```

---

## 4. Mastra Module Technical Specification

Mastra has specific technical considerations not shared by the other three modules.

### 4.1 Dual Port Exposure

Mastra exposes two ports:
- `8081` — agent API (primary, load-balanced internally)
- `{observability_port}` — OTLP/observability (internal only, not load-balanced)

```hcl
# GCP Cloud Run: only one port can be the primary traffic port
# Secondary ports are supported via additional port declarations
containers {
  ports { container_port = 8081 }
  ports { container_port = var.observability_port }
}
```

### 4.2 Longer Start Period

Mastra requires a longer container initialisation time than other services (confirmed in Feature 18 FRS section FR-21 and Feature 35 FRS section FR-03.4). The health check `initial_delay_seconds` must be 30 (vs 15 for other services).

### 4.3 Mixed Env Var Types

Mastra requires both secret-managed env vars and plain config env vars (LLM_PROVIDER, LLM_MODEL, API_BASE_URL). The module must handle both types:

```hcl
# Secret-sourced vars (via var.secret_references)
dynamic "env" {
  for_each = var.secret_references
  content {
    name = env.key
    value_source { ... }
  }
}

# Plain config vars (via var.config_env_vars)
dynamic "env" {
  for_each = var.config_env_vars
  content {
    name  = env.key
    value = env.value
  }
}
```

The `config_env_vars` variable is a `map(string)` of plain-text configuration values (not secrets).

### 4.4 No Public Domain

Mastra does not have a public-facing domain. It is accessed:
- From the API layer via internal Cloud Run service URL (service-to-service, authenticated via IAM)
- From the terminal (MCP) — this requires network-level access; the exact mechanism (VPN, private endpoint, bastion) must be confirmed as part of deployment planning

The Mastra module does NOT create any `google_cloud_run_v2_service_iam_member` resources for unauthenticated public access. Cloud Run invocations to Mastra are authenticated via IAM.

### 4.5 Queue-Depth Scaling (GCP)

If the Mastra MCP server uses Cloud Tasks or Pub/Sub for workflow queuing, Cloud Run's queue-depth scaling can be configured. If not, fall back to CPU-based scaling:

```hcl
scaling {
  min_instance_count = var.min_instances
  max_instance_count = var.max_instances
  # If queue-based: add custom metrics scaling config
}
```

---

## 5. UI Module Technical Specification

### 5.1 CDN Configuration (Cloud CDN)

```hcl
resource "google_compute_backend_service" "ui" {
  name        = "${var.project_name}-${var.environment}-ui-backend"
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    max_ttl           = 86400
    client_ttl        = 3600
    negative_caching  = false
  }

  cache_key_policy {
    include_host           = true
    include_protocol       = true
    include_query_string   = false
  }
}
```

### 5.2 CDN Cache Invalidation

On each `terraform apply` that changes the UI image (which implies a new content hash in `/_next/static/` paths), a cache invalidation must be triggered:

```hcl
resource "null_resource" "cdn_invalidation" {
  triggers = {
    image_url = var.image_url
  }

  provisioner "local-exec" {
    command = "gcloud compute url-maps invalidate-cdn-cache ${var.url_map_name} --path='/*'"
  }

  depends_on = [google_cloud_run_v2_service.ui]
}
```

---

## 6. Variables.tf Updates

### 6.1 New App Deployment Variables in Root `variables.tf`

```hcl
# Container image URLs (set by CI/CD per deployment)
variable "auth_image_url" {
  type        = string
  description = "Full container image URL for the auth service (including tag)"
}

variable "api_image_url" {
  type        = string
  description = "Full container image URL for the API service (including tag)"
}

variable "mastra_image_url" {
  type        = string
  description = "Full container image URL for the Mastra service (including tag)"
}

variable "ui_image_url" {
  type        = string
  description = "Full container image URL for the UI service (including tag)"
}

# Scaling configuration
variable "auth_min_instances" {
  type    = number
  default = 1
}

variable "auth_max_instances" {
  type    = number
  default = 10
}

# ... (same pattern for api, mastra, ui)

# Mastra plain config vars
variable "llm_provider" {
  type        = string
  description = "LLM provider: 'anthropic' or 'openai'"
  validation {
    condition     = contains(["anthropic", "openai"], var.llm_provider)
    error_message = "llm_provider must be 'anthropic' or 'openai'."
  }
}

variable "llm_model" {
  type        = string
  description = "LLM model identifier (e.g., 'anthropic/claude-opus-4-6')"
}
```

---

## 7. Root `main.tf` Module Instantiation

```hcl
# Feature 36 additions to existing main.tf

module "auth" {
  source = "./modules/auth"

  environment      = var.environment
  project_name     = var.project_name
  region           = var.region
  image_url        = var.auth_image_url
  min_instances    = var.auth_min_instances
  max_instances    = var.auth_max_instances
  service_account  = module.iam.auth_service_account
  secret_references = {
    AUTH_DATABASE_URL = module.secrets.secret_names["AUTH_DATABASE_URL"]
    IDP_CLIENT_ID     = module.secrets.secret_names["IDP_CLIENT_ID"]
    IDP_CLIENT_SECRET = module.secrets.secret_names["IDP_CLIENT_SECRET"]
    IDP_ISSUER_URL    = module.secrets.secret_names["IDP_ISSUER_URL"]
    SIGNING_KEY_PRIVATE = module.secrets.secret_names["SIGNING_KEY_PRIVATE"]
    SIGNING_KEY_PUBLIC  = module.secrets.secret_names["SIGNING_KEY_PUBLIC"]
  }
  auth_target_group_id = module.dns.auth_backend_service_id
  log_destination      = module.logging.destination_id
  network_config       = {
    vpc_id             = module.networking.vpc_id
    subnet_id          = module.networking.private_subnet_id
    security_group_id  = module.networking.container_security_group_id
  }
}

module "api" {
  source = "./modules/api"

  # ... (analogous to auth)
  secret_references = {
    DATABASE_URL              = module.secrets.secret_names["DATABASE_URL"]
    AUTH_ISSUER_URL           = module.secrets.secret_names["AUTH_ISSUER_URL"]
    AUTH_JWKS_URL             = module.secrets.secret_names["AUTH_JWKS_URL"]
    ASANA_CLIENT_ID           = module.secrets.secret_names["ASANA_CLIENT_ID"]
    ASANA_CLIENT_SECRET       = module.secrets.secret_names["ASANA_CLIENT_SECRET"]
    ASANA_ACCESS_TOKEN        = module.secrets.secret_names["ASANA_ACCESS_TOKEN"]
    GRAIN_API_KEY             = module.secrets.secret_names["GRAIN_API_KEY"]
    GOOGLE_SERVICE_ACCOUNT_JSON = module.secrets.secret_names["GOOGLE_SERVICE_ACCOUNT_JSON"]
    EMAIL_PROVIDER_API_KEY    = module.secrets.secret_names["EMAIL_PROVIDER_API_KEY"]
  }
  api_target_group_id = module.dns.api_backend_service_id
}

module "mastra" {
  source = "./modules/mastra"

  # ... (base vars)
  secret_references = {
    LLM_API_KEY           = module.secrets.secret_names["LLM_API_KEY"]
    MASTRA_CLIENT_ID      = module.secrets.secret_names["MASTRA_CLIENT_ID"]
    MASTRA_CLIENT_SECRET  = module.secrets.secret_names["MASTRA_CLIENT_SECRET"]
    API_SERVICE_TOKEN     = module.secrets.secret_names["API_SERVICE_TOKEN"]
    AUTH_ISSUER_URL       = module.secrets.secret_names["AUTH_ISSUER_URL"]
  }
  config_env_vars = {
    LLM_PROVIDER   = var.llm_provider
    LLM_MODEL      = var.llm_model
    API_BASE_URL   = module.api.service_url
  }
  api_internal_url     = module.api.service_url
  observability_port   = 4318

  depends_on = [module.api]
}

module "ui" {
  source = "./modules/ui"

  # ... (base vars)
  config_env_vars = {
    API_BASE_URL           = "https://api.${var.domain}"
    NEXT_PUBLIC_API_URL    = "https://api.${var.domain}"
    NEXT_PUBLIC_AUTH_URL   = "https://auth.${var.domain}"
  }
  ui_target_group_id = module.dns.ui_backend_service_id
  api_public_url     = "https://api.${var.domain}"
  auth_public_url    = "https://auth.${var.domain}"
}
```

---

## 8. CI/CD Pipeline Integration

### 8.1 Pipeline Step: Terraform Plan

Triggered when: Nx affected graph includes `infra/terraform`.

```yaml
# Example GitHub Actions step
- name: Terraform Plan
  run: |
    cd infra/terraform
    terraform init -backend-config="bucket=${TF_STATE_BUCKET}"
    terraform plan \
      -var-file="environments/dev.tfvars" \
      -var="auth_image_url=${AUTH_IMAGE_URL}" \
      -var="api_image_url=${API_IMAGE_URL}" \
      -var="mastra_image_url=${MASTRA_IMAGE_URL}" \
      -var="ui_image_url=${UI_IMAGE_URL}" \
      -out=plan.tfplan \
      2>&1 | tee terraform-plan.txt

- name: Post Plan to PR
  uses: actions/github-script@v7
  with:
    script: |
      const plan = require('fs').readFileSync('terraform-plan.txt', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '```terraform\n' + plan + '\n```'
      });
```

### 8.2 Pipeline Step: Terraform Apply

Triggered on merge to main. Production requires a manual approval step before the apply.

```yaml
- name: Terraform Apply (dev/staging)
  if: github.ref == 'refs/heads/main'
  run: |
    cd infra/terraform
    terraform apply \
      -var-file="environments/${ENVIRONMENT}.tfvars" \
      -var="api_image_url=${REGISTRY}/iexcel/api:${GITHUB_SHA}" \
      -var="auth_image_url=${REGISTRY}/iexcel/auth:${GITHUB_SHA}" \
      -var="mastra_image_url=${REGISTRY}/iexcel/mastra:${GITHUB_SHA}" \
      -var="ui_image_url=${REGISTRY}/iexcel/ui:${GITHUB_SHA}" \
      -auto-approve \
      plan.tfplan

# Production: same step but gated by manual approval job
- name: Terraform Apply (production)
  needs: [approve-production]
  environment: production
  run: |
    # ... same as above with production.tfvars
```

### 8.3 Nx Integration

The Terraform project must be added to Nx's affected detection. A `project.json` at `infra/terraform/` (scaffolded in Feature 00) must declare the `plan` and `apply` targets so Nx can detect when `infra/terraform/**` is affected and route it to the correct pipeline step.

---

## 9. Terraform Version Requirements

```hcl
# infra/terraform/modules/{app}/main.tf (in each module)
terraform {
  required_version = ">= 1.9.0"
}
```

Provider version pinning (in root `main.tf`):
```hcl
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}
```

---

## 10. Pre-Implementation Spike Requirements

Before implementing the Mastra module, a spike must confirm:

| Question | Spike Action | Impact |
|---|---|---|
| Can Mastra run in Cloud Run? | Run Mastra in a container locally, then in a Cloud Run dev revision | Determines any special Cloud Run config needed |
| What is Mastra's exact observability port? | Check Mastra docs / inspect running container | Determines `observability_port` value in module |
| What is Mastra's health endpoint path? | Run container, hit default ports | Determines health check path in module |
| Does Mastra require a persistent volume? | Run and check if any files must survive restart | Determines if a GCS FUSE mount is needed (significant complexity) |
| What is the internal routing for Mastra in Cloud Run? | Test service-to-service invocation from API container | Determines `api_internal_url` format and IAM auth requirements for Cloud Run-to-Cloud Run calls |

---

## 11. Security Considerations

### 11.1 Terraform State Security

The Terraform state file may contain resource metadata that, while not literal secret values, could reveal infrastructure topology. The remote state backend (GCS bucket) must:
- Have access restricted to the CI/CD service account and authorised engineers
- Have versioning enabled (for state history and rollback)
- Have bucket-level encryption enabled

### 11.2 Least-Privilege Secret Access

Each container service's IAM role must have access only to the secrets it requires (from Feature 02's IAM module, which enforces this). Feature 36 must not grant broad secret manager read access to any service account.

### 11.3 No Cross-Environment Secret Access

The secret references passed to each module must be environment-scoped. Dev's `DATABASE_URL` secret is a different resource from staging's. The secrets module (Feature 02) namespaces secrets by environment. Feature 36 must pass the correct environment's secret references to each module.

---

## 12. Rollback Strategy

| Scenario | Rollback Procedure |
|---|---|
| New container image fails health check | Cloud provider keeps previous revision running. Re-deploy the previous image tag via `terraform apply -var="api_image_url={previous_tag}"`. |
| Terraform apply fails mid-way | Terraform state is consistent. Re-apply with the same configuration. Investigate and fix the failing resource. |
| Production incident caused by new infra | Revert the `.tf` change via a new PR, get it reviewed, merge, and apply. Do not use `terraform state` manipulation unless an engineer with Terraform expertise approves. |
| Need to destroy dev environment | Ensure `deletion_protection = false` in `dev.tfvars`. Run `terraform destroy -var-file=environments/dev.tfvars`. |
