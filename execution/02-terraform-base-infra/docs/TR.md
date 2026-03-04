# TR — Technical Requirements
## Feature 02: Terraform Base Infrastructure

**Date:** 2026-03-03

---

## 1. Technology Stack

| Concern | Tool / Version |
|---|---|
| **Infrastructure as Code** | Terraform >= 1.10 |
| **Cloud Provider** | GCP — `hashicorp/google` provider ~> 5.x |
| **Terraform state backend** | GCS bucket (Cloud Storage) |
| **Monorepo integration** | Nx `project.json` in `infra/terraform/` (scaffolded in feature 00) |
| **CI/CD trigger** | Changes to `infra/terraform/**` trigger Terraform plan/apply (feature 34) |

---

## 2. Cloud Provider: GCP

GCP has been selected as the cloud provider. All Terraform modules use the `google` provider exclusively. There are no AWS conditional blocks or alternative implementations.

All modules use GCP-native services:
- **Compute:** Cloud Run for container workloads
- **Database:** Cloud SQL for PostgreSQL
- **Container Registry:** Artifact Registry
- **Secrets:** GCP Secret Manager
- **DNS & Load Balancing:** Cloud DNS + Cloud Load Balancing (with Cloud CDN for UI)
- **IAM:** GCP IAM with Workload Identity (no service account keys)
- **State Backend:** GCS bucket

---

## 3. Module File Structure Convention

Every module follows this structure:

```
modules/{name}/
├── main.tf        # Resource declarations
├── variables.tf   # Input variable declarations with types, descriptions, and validation blocks
├── outputs.tf     # Output value declarations
└── README.md      # Usage documentation (inputs table, outputs table, example)
```

All `.tf` files must pass `terraform fmt -check` and `terraform validate` before merge.

---

## 4. Networking Module — Technical Details

| Resource | Terraform Type |
|---|---|
| VPC | `google_compute_network` |
| Private subnet | `google_compute_subnetwork` |
| Public subnet | `google_compute_subnetwork` |
| Cloud NAT | `google_compute_router` + `google_compute_router_nat` |
| Firewall rules | `google_compute_firewall` |
| VPC Connector | `google_vpc_access_connector` |

Key considerations:
- Cloud Run containers require a Serverless VPC Access connector to connect to private VPC resources (Cloud SQL, internal services). The VPC connector must be provisioned as part of this module.
- GCP firewall rules are network-level; no concept of security groups attached to instances — rules target instances by tag or service account.
- Cloud NAT provides outbound internet access for private resources.

---

## 5. Database Modules — Technical Details (Cloud SQL for PostgreSQL)

| Resource | Terraform Type |
|---|---|
| Instance | `google_sql_database_instance` |
| Database | `google_sql_database` |
| User | `google_sql_user` |

Configuration notes:
- `tier`: `db-f1-micro` for dev, `db-custom-2-7680` or equivalent for production.
- `availability_type`: `ZONAL` for dev, `REGIONAL` for staging/production.
- `backup_configuration.enabled = true`, `point_in_time_recovery_enabled = true`.
- `ip_configuration.ipv4_enabled = false` (no public IP).
- `ip_configuration.private_network` references the VPC ID from the networking module.
- Password stored via `google_secret_manager_secret_version` (created by the secrets module with the actual connection string populated separately from Terraform).

### Connection Pooling

Cloud SQL Auth Proxy is the recommended approach. Alternatively, PgBouncer as a sidecar (configured in container module, feature 36). The base infrastructure module provisions the Cloud SQL instance; the pooling sidecar is wired in during feature 36.

---

## 6. Container Registry — Technical Details (GCP Artifact Registry)

| Resource | Terraform Type |
|---|---|
| Registry repository | `google_artifact_registry_repository` |
| IAM binding (push) | `google_artifact_registry_repository_iam_binding` |
| IAM binding (pull) | `google_artifact_registry_repository_iam_binding` |

Configuration notes:
- `format = "DOCKER"`.
- `location`: same region as the workload.
- Cleanup policy: keep `image_retention_count` most recent tagged images per repository, delete untagged images after 7 days.
- Vulnerability scanning: enabled via GCP Container Analysis API (`google_artifact_registry_repository` `vulnerability_scanning` field or via `gcloud artifacts repositories set-cleanup-policies`).

---

## 7. Secrets Module — Technical Details (GCP Secret Manager)

| Resource | Terraform Type |
|---|---|
| Secret slot | `google_secret_manager_secret` |
| IAM binding | `google_secret_manager_secret_iam_binding` |

Configuration notes:
- `replication.auto = {}` (automatic multi-region replication).
- No `google_secret_manager_secret_version` resource is created by Terraform for credential secrets — values are set manually or via a separate secure process.
- Exception: A placeholder `google_secret_manager_secret_version` with `secret_data = "PLACEHOLDER"` may be created to satisfy references during initial plan, but must be clearly marked and replaced before any application deployment.

### Secret Naming Convention

```
/{project_name}/{environment}/{SECRET_LOGICAL_NAME}

Examples:
  /iexcel/dev/DATABASE_URL
  /iexcel/prod/SIGNING_KEY_PRIVATE
  /iexcel/staging/LLM_API_KEY
```

---

## 8. DNS and Load Balancer — Technical Details (Cloud Load Balancing + Cloud DNS)

| Resource | Terraform Type |
|---|---|
| Global HTTP(S) load balancer | `google_compute_global_forwarding_rule` |
| Target HTTPS proxy | `google_compute_target_https_proxy` |
| SSL certificate | `google_compute_managed_ssl_certificate` |
| URL map | `google_compute_url_map` |
| Backend services (stub) | `google_compute_backend_service` |
| Health check (stub) | `google_compute_health_check` |
| DNS zone | `google_dns_managed_zone` |
| DNS A records | `google_dns_record_set` |
| HTTP redirect | `google_compute_url_map` (redirect-only map) + `google_compute_global_forwarding_rule` |

**Note on certificate validation:** Google-managed SSL certificates require DNS propagation. Terraform may report the resource as pending. CI/CD should not treat this as a failure — the certificate validates asynchronously.

---

## 9. IAM Module — Technical Details (GCP Service Accounts)

| Resource | Terraform Type |
|---|---|
| Service account | `google_service_account` |
| IAM role binding | `google_project_iam_member` or `google_secret_manager_secret_iam_binding` |
| Workload identity binding | `google_service_account_iam_binding` |

Key permission sets:
- `api` SA: `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` (bound to specific secrets only)
- `auth` SA: `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` (auth-specific secrets)
- `mastra` SA: `roles/secretmanager.secretAccessor` (LLM_API_KEY only)
- `ui` SA: minimal, e.g., `roles/run.invoker` if needed for Cloud Run to Cloud Run calls
- `cicd` SA: `roles/artifactregistry.writer`, `roles/run.admin` (feature 36), `roles/storage.objectAdmin` (Terraform state bucket)

Workload Identity is used instead of service account keys. Cloud Run services are configured with `service_account_email` referencing the appropriate SA. No key files are exported. CI/CD uses Workload Identity Federation with OIDC for GitHub Actions.

---

## 10. Remote State Backend — Technical Details (GCS)

### Pre-Requisites (manual, before feature 02 runs)

The state backend bucket must be created before `terraform init` can run. This is a bootstrapping requirement:

A GCS bucket is created manually (or via a separate bootstrap Terraform config) with versioning enabled and IAM restricted to the CI/CD service account.

The backend configuration (`backend.tf`) is committed to the repository. Credentials are NOT embedded in the file — they are supplied via environment variables (`GOOGLE_APPLICATION_CREDENTIALS`) or Workload Identity Federation with OIDC token exchange in CI.

### `backend.tf`

```hcl
terraform {
  backend "gcs" {
    bucket = "iexcel-terraform-state"
    prefix = "terraform/state/${var.environment}"   # Note: variables not supported in backend config
  }
}
```

Because backend configuration does not support variable interpolation, the bucket name is hardcoded or supplied via `-backend-config` flag at init time. Use a per-environment init wrapper script or CI step:

```bash
terraform init -backend-config="prefix=terraform/state/dev"
```

---

## 11. Terraform Version and Provider Locking

```hcl
# versions.tf (root)
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
```

The `.terraform.lock.hcl` file is committed to the repository to pin provider checksums. It is updated only via a deliberate `terraform providers lock` command during a provider upgrade.

---

## 12. Nx Integration (`project.json`)

The `infra/terraform/project.json` file (scaffolded in feature 00) defines Nx targets for Terraform operations:

```json
{
  "name": "infra",
  "targets": {
    "fmt": {
      "executor": "nx:run-commands",
      "options": {
        "command": "terraform fmt -recursive",
        "cwd": "infra/terraform"
      }
    },
    "validate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "terraform validate",
        "cwd": "infra/terraform"
      }
    },
    "plan": {
      "executor": "nx:run-commands",
      "options": {
        "command": "terraform plan -var-file=environments/{args.env}.tfvars",
        "cwd": "infra/terraform"
      }
    },
    "apply": {
      "executor": "nx:run-commands",
      "options": {
        "command": "terraform apply -var-file=environments/{args.env}.tfvars -auto-approve",
        "cwd": "infra/terraform"
      }
    }
  }
}
```

This allows CI/CD (feature 34) to invoke Terraform via standard Nx affected commands. The `infra` project is affected when any file under `infra/terraform/` changes.

---

## 13. Performance and Scalability

| Concern | Approach |
|---|---|
| **Terraform apply time** | Parallelism: Terraform's default `-parallelism=10` applies resources concurrently where there are no dependencies. No change needed. |
| **Database scaling** | Instance tier is a variable. Scaling the database requires a `terraform apply` with an updated tier value. Cloud SQL supports in-place resizing for most tier changes. |
| **Load balancer scaling** | Cloud Load Balancing auto-scales to handle traffic — no manual scaling. |
| **Container registry storage** | Image retention policies cap storage growth. Monitor registry storage costs as image sizes grow. |
| **State file size** | Monorepo with multiple environments: use separate state files per environment (different backend key/prefix), not a single state file for all environments. |

---

## 14. Security Requirements

| Requirement | Implementation |
|---|---|
| No public database endpoint | `ipv4_enabled = false` on Cloud SQL instances |
| Encryption at rest | Enabled by default for Cloud SQL. Explicitly verified in Terraform resource config. |
| Encryption in transit | TLS enforced for all database connections. `require_ssl = true` on Cloud SQL. |
| State file encryption | GCS bucket-level encryption (Google-managed by default). |
| No credentials in code or state | Passwords generated by `random_password`, stored in GCP Secret Manager. Secret values never appear in Terraform outputs. |
| Least-privilege IAM | Every service account permission is explicitly listed. No wildcard actions or resource names. |
| No service account key files | Workload Identity for Cloud Run services. CI/CD uses Workload Identity Federation with OIDC token exchange from GitHub Actions. |
| Audit logging | Cloud Audit Logs log all API calls against provisioned resources. This is a GCP default — no Terraform configuration required unless a custom log sink is needed. |

---

## 15. Local Development Setup

### 15.1 Docker Compose

A `docker-compose.yml` at the monorepo root provides local equivalents of cloud-managed database services:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: iexcel
    volumes:
      - pgdata:/var/lib/postgresql/data

  postgres-auth:
    image: postgres:15-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: iexcel_auth
    volumes:
      - pgdata-auth:/var/lib/postgresql/data

volumes:
  pgdata:
  pgdata-auth:
```

### 15.2 Direct Node.js Execution

All application services run directly via `pnpm nx serve <app>` connecting to the local Docker Compose Postgres instances. No Docker image builds are required for local development.

### 15.3 Local Environment Variables

Local `.env.local` values:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/iexcel`
- `AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/iexcel_auth`
- Other secrets use placeholder/test values documented in `.env.example`

---

## 16. Migration Strategy

Feature 02 is a greenfield deployment — there are no existing resources to migrate. The only bootstrapping concern is the Terraform state backend GCS bucket, which must be created manually before `terraform init` runs for the first time.

---

## 17. Open Technical Questions

| Question | Impact | Decision Point |
|---|---|---|
| PgBouncer sidecar vs Cloud SQL Auth Proxy? | Affects whether pooling config is in the database module (feature 02) or container module (feature 36). | Before database module implementation. |
| Mastra containerisation requirements? | May require specific VPC egress rules for LLM inference. | Spike in feature 18 before feature 36, but networking module may need to accommodate. |
| Ephemeral dev environments? | If dev environments are ephemeral (spin up per PR), state backend and variable file strategy changes significantly. | Before CI/CD pipeline design (feature 34). |
| Monitoring/alerting stack? | May require additional Terraform modules (Datadog provider, Cloud Monitoring dashboards). Out of scope for feature 02 but affects tagging strategy. | Before production deployment. |

**Resolved decisions:**
- **Cloud provider:** GCP selected.
- **Container runtime:** Cloud Run selected.
- **Container registry:** GCP Artifact Registry.
- **DNS:** Cloud DNS + Cloud Load Balancing.
- **Secrets:** GCP Secret Manager.
