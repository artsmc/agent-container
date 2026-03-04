# FRS — Functional Requirement Specification
## Feature 02: Terraform Base Infrastructure

**Phase:** 1 — Foundation
**Date:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for all Terraform modules, files, and configuration that make up the base infrastructure layer of the iExcel automation system. Application container modules (auth, api, mastra, ui) are explicitly out of scope and are covered in feature 36.

---

## 2. Directory Layout

After feature 02 is complete, the following files must exist and be correctly populated within the structure scaffolded by feature 00:

```
infra/terraform/
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── database/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── auth-database/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── container-registry/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── secrets/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── dns/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── iam/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── production.tfvars
├── backend.tf          (or backend config in main.tf)
├── main.tf
├── variables.tf
├── outputs.tf
└── project.json        (Nx project config — scaffolded in feature 00)
```

---

## 3. Module Specifications

### 3.1 `modules/networking/`

**Purpose:** Provision the VPC, subnets, and firewall/security group rules that define the network topology for all cloud resources.

#### Functional Requirements

| ID | Requirement |
|---|---|
| NET-01 | The module creates a single VPC per environment. |
| NET-02 | The VPC has a private subnet for containers and databases. |
| NET-03 | The VPC has a public subnet for the load balancer only. |
| NET-04 | Firewall/security group rules ensure containers only accept inbound traffic from the load balancer. All other ingress to container subnets is denied. |
| NET-05 | Firewall/security group rules ensure the database instances only accept inbound traffic from the container subnet IP range. All other ingress to the database is denied. |
| NET-06 | Outbound traffic from containers to the internet (for calling external APIs: Asana, Grain, LLM providers) is permitted via Cloud NAT. |
| NET-07 | The load balancer subnet is publicly accessible on ports 80 and 443. |
| NET-08 | All subnet CIDR ranges are configurable via input variables to allow different values per environment. |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name (dev, staging, production) |
| `region` | string | Cloud region to deploy into |
| `vpc_cidr` | string | CIDR block for the VPC |
| `private_subnet_cidr` | string | CIDR for the private (container/database) subnet |
| `public_subnet_cidr` | string | CIDR for the public (load balancer) subnet |
| `project_name` | string | Used for resource naming and tagging |

#### Outputs

| Output | Description |
|---|---|
| `vpc_id` | ID of the created VPC |
| `private_subnet_id` | ID of the private subnet |
| `public_subnet_id` | ID of the public subnet |
| `container_security_group_id` | Security group ID for container resources |
| `database_security_group_id` | Security group ID for database instances |
| `lb_security_group_id` | Security group ID for the load balancer |

---

### 3.2 `modules/database/`

**Purpose:** Provision the product Postgres instance for the main application database.

#### Functional Requirements

| ID | Requirement |
|---|---|
| DB-01 | The module creates a managed Postgres instance (Cloud SQL for PostgreSQL on GCP). |
| DB-02 | The instance has no public IP address. It is accessible only within the private subnet. |
| DB-03 | Automated backups are enabled with point-in-time recovery (PITR) capability. |
| DB-04 | Backup retention period is configurable per environment (shorter in dev, longer in production). |
| DB-05 | Connection pooling is enabled (PgBouncer sidecar or provider-native pooling). |
| DB-06 | The database engine version is configurable but defaults to a recent stable Postgres release (Postgres 15 or newer). |
| DB-07 | The instance size (tier) is configurable per environment — minimal in dev, production-grade in production. |
| DB-08 | A database name, master username, and master password are created. The master password is stored in the secrets module, not in Terraform output or state in plaintext. |
| DB-09 | The instance is tagged/labelled with environment and project name for cost tracking. |
| DB-10 | Deletion protection is enabled for staging and production environments; disabled for dev to allow `terraform destroy`. |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name |
| `project_name` | string | Resource naming prefix |
| `region` | string | Cloud region |
| `instance_tier` | string | Machine type / DB tier (e.g., `db-f1-micro` for GCP) |
| `postgres_version` | string | Postgres major version (default: "15") |
| `private_subnet_id` | string | Subnet to place the DB in (from networking module output) |
| `database_security_group_id` | string | Security group to attach (from networking module output) |
| `backup_retention_days` | number | Number of days to retain automated backups |
| `deletion_protection` | bool | Whether to enable deletion protection |
| `db_name` | string | Name of the default database to create |

#### Outputs

| Output | Description |
|---|---|
| `instance_id` | Cloud-provider instance identifier |
| `connection_string_secret_name` | Name of the secret in GCP Secret Manager that holds DATABASE_URL |
| `private_ip` | Private IP address of the database instance |
| `port` | Database port (5432) |

---

### 3.3 `modules/auth-database/`

**Purpose:** Provision a separate Postgres instance for the auth/identity service. This is a distinct instance from the product database — not just a separate schema.

#### Functional Requirements

The auth-database module has identical functional requirements to the `database` module (DB-01 through DB-10) with the following differences:

| ID | Requirement |
|---|---|
| ADB-01 | This is a completely separate Postgres instance. It must not share the same instance, cluster, or connection pool as the product database. |
| ADB-02 | The secret stored in the secret manager for this database is named to distinguish it from the product database (e.g., `AUTH_DATABASE_URL` vs `DATABASE_URL`). |
| ADB-03 | The module accepts the same input variables as the `database` module so that environments can be sized independently. |

#### Rationale for Separate Instance

The auth database holds identity data (users, sessions, tokens, signing keys). Isolating it from the product database ensures:
- A compromise of the product database does not expose identity data.
- Auth service can be scaled and its database managed independently of product scaling.
- Different backup and recovery SLAs can be applied per instance if needed.

---

### 3.4 `modules/container-registry/`

**Purpose:** Provision a private container registry where Docker images for all application containers are pushed and pulled.

#### Functional Requirements

| ID | Requirement |
|---|---|
| REG-01 | The module creates a private container registry (GCP Artifact Registry). |
| REG-02 | The registry is not publicly accessible. Only authorised service accounts/roles can push or pull. |
| REG-03 | An image retention policy is configured to keep the last N images per repository, where N is configurable. |
| REG-04 | Vulnerability scanning is enabled on image push (GCP Container Analysis API). |
| REG-05 | Repositories are created for each application: `auth`, `api`, `mastra`, `ui`. |
| REG-06 | The CI/CD service account (from the IAM module) is granted push access. Container runtime service accounts are granted pull access. |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name |
| `project_name` | string | Resource naming prefix |
| `region` | string | Registry region |
| `image_retention_count` | number | Number of images to retain per repository (default: 10) |
| `app_names` | list(string) | Application repository names (default: ["auth", "api", "mastra", "ui"]) |

#### Outputs

| Output | Description |
|---|---|
| `registry_url` | Base URL for the container registry |
| `repository_urls` | Map of app name to full repository URL |

---

### 3.5 `modules/secrets/`

**Purpose:** Create named secret slots in the cloud secret manager. Terraform creates the secret resource (the named container); actual credential values are populated out-of-band by a human operator or separate secure process.

#### Functional Requirements

| ID | Requirement |
|---|---|
| SEC-01 | The module creates secret resources for all required credentials. It does not set the secret values. |
| SEC-02 | Secret names are namespaced by environment to avoid collisions (e.g., `prod/DATABASE_URL`, `dev/DATABASE_URL`). |
| SEC-03 | Access to each secret is restricted to the relevant service account (from the IAM module). No service account has access to secrets it does not require. |
| SEC-04 | The following secrets are created: `DATABASE_URL`, `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `SIGNING_KEY_PRIVATE`, `SIGNING_KEY_PUBLIC`, `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`, `ASANA_ACCESS_TOKEN`, `GRAIN_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `LLM_API_KEY`, `EMAIL_PROVIDER_API_KEY`. |
| SEC-05 | Terraform outputs the name of each secret so that container service modules (feature 36) can reference them for injection into container environment variables. |
| SEC-06 | Secret deletion protection is enabled for staging and production to prevent accidental removal. |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name (used as namespace prefix) |
| `project_name` | string | Resource naming prefix |
| `region` | string | Region for secret storage |
| `deletion_protection` | bool | Whether to protect secrets from accidental deletion |

#### Outputs

| Output | Description |
|---|---|
| `secret_names` | Map of logical secret name to GCP Secret Manager secret name |
| `database_url_secret` | Name of the DATABASE_URL secret |
| `auth_database_url_secret` | Name of the AUTH_DATABASE_URL secret |
| `signing_key_private_secret` | Name of the SIGNING_KEY_PRIVATE secret |
| `signing_key_public_secret` | Name of the SIGNING_KEY_PUBLIC secret |

---

### 3.6 `modules/dns/`

**Purpose:** Provision DNS records, a load balancer with TLS termination, and routing rules for all public endpoints.

**Note:** At the time of feature 02, no application containers exist yet. The DNS and load balancer infrastructure is provisioned in skeleton form — the routing targets (container services) will be wired in by feature 36. This prevents downstream configuration errors and ensures certificates and DNS records are validated before containers are deployed.

#### Functional Requirements

| ID | Requirement |
|---|---|
| DNS-01 | The module creates a load balancer in the public subnet. |
| DNS-02 | TLS is terminated at the load balancer using a Google-managed SSL certificate. |
| DNS-03 | HTTP (port 80) traffic is redirected to HTTPS (port 443). |
| DNS-04 | DNS A records are created for: `app.{domain}`, `api.{domain}`, `auth.{domain}`. |
| DNS-05 | Routing rules are defined: `app.{domain}` routes to the UI target group/backend service; `api.{domain}` routes to the API target group; `auth.{domain}` routes to the Auth target group. |
| DNS-06 | The path `api.{domain}/shared/*` is a public route on the API target group — the load balancer does not add additional auth headers for this path prefix. Actual auth enforcement remains in the API container. |
| DNS-07 | Target groups / backend services are created as empty stubs in feature 02. Container services are attached in feature 36. |
| DNS-08 | The domain name is a configurable input variable — different environments may use subdomains (e.g., `dev.iexcel.app`, `staging.iexcel.app`). |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name |
| `domain` | string | Base domain for DNS records |
| `region` | string | Region for load balancer |
| `public_subnet_id` | string | Subnet for the load balancer (from networking module) |
| `lb_security_group_id` | string | Security group for the load balancer (from networking module) |
| `vpc_id` | string | VPC to associate load balancer with (from networking module) |

#### Outputs

| Output | Description |
|---|---|
| `load_balancer_dns` | DNS name of the load balancer (for CNAME records if using external DNS) |
| `load_balancer_id` | Cloud identifier of the load balancer |
| `ui_backend_service_id` | Backend service ID for UI container (consumed by feature 36) |
| `api_backend_service_id` | Backend service ID for API container (consumed by feature 36) |
| `auth_backend_service_id` | Backend service ID for Auth container (consumed by feature 36) |

---

### 3.7 `modules/iam/`

**Purpose:** Create service accounts and IAM role bindings for each application concern and for the CI/CD pipeline.

#### Functional Requirements

| ID | Requirement |
|---|---|
| IAM-01 | A dedicated service account / IAM role is created for each of the four container services: `auth`, `api`, `mastra`, `ui`. |
| IAM-02 | The `api` service account is granted: read access to the product Postgres instance (via VPC — no IAM proxy needed if private VPC), read/write access to the secret manager secrets it requires (DATABASE_URL, ASANA_*, GRAIN_*, GOOGLE_*, EMAIL_*), and access to call external APIs (outbound internet access via NAT is sufficient — no IAM grant needed for external SaaS). |
| IAM-03 | The `mastra` service account is granted: read access to the LLM_API_KEY secret and any Mastra-specific secrets. It has no direct database access (communicates with the API via HTTP). |
| IAM-04 | The `auth` service account is granted: read access to the auth Postgres instance (via VPC), read access to AUTH_DATABASE_URL, IDP_CLIENT_ID, IDP_CLIENT_SECRET, SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC secrets. |
| IAM-05 | The `ui` service account is granted: no direct cloud resource access. The UI container talks only to the API via public URL. If the cloud runtime requires a service account for the container to run, a minimal one is created with no additional permissions. |
| IAM-06 | A CI/CD service account is created and granted: push access to Artifact Registry, deploy access to Cloud Run services (for use in feature 36), read/write access to the Terraform state backend GCS bucket, and permission to run `terraform plan` and `terraform apply` on the GCP project. |
| IAM-07 | No service account is granted a wildcard (`*`) permission. All permissions are listed explicitly. |
| IAM-08 | Service account keys are not generated or stored. Authentication is performed via GCP Workload Identity — no long-lived key files. |

#### Input Variables

| Variable | Type | Description |
|---|---|---|
| `environment` | string | Environment name |
| `project_name` | string | Resource naming prefix |
| `registry_id` | string | Container registry identifier (from container-registry module) |
| `secret_names` | map(string) | Map of logical secret names to cloud secret names/ARNs (from secrets module) |
| `terraform_state_bucket` | string | Name of the GCS bucket holding Terraform state |

#### Outputs

| Output | Description |
|---|---|
| `api_service_account` | Service account email for the API container |
| `auth_service_account` | Service account email for the Auth container |
| `mastra_service_account` | Service account email for the Mastra container |
| `ui_service_account` | Service account email for the UI container |
| `cicd_service_account` | Service account email for the CI/CD pipeline |

---

## 4. Root Composition Files

### 4.1 `main.tf` (Root)

The root `main.tf` instantiates all base modules and wires their outputs together as inputs to dependent modules. Modules are instantiated in dependency order:

1. `networking` — no dependencies
2. `database` — depends on `networking` outputs
3. `auth-database` — depends on `networking` outputs
4. `container-registry` — no dependencies on other base modules
5. `secrets` — no infrastructure dependencies
6. `iam` — depends on `container-registry` and `secrets` outputs
7. `dns` — depends on `networking` outputs

### 4.2 `variables.tf` (Root)

Declares all top-level input variables that are supplied via environment tfvars files. Includes:

- `environment` — dev | staging | production
- `project_name` — e.g., "iexcel"
- `region` — cloud region
- `domain` — base domain for DNS
- `vpc_cidr`, `private_subnet_cidr`, `public_subnet_cidr`
- `db_instance_tier` — per-environment database sizing
- `auth_db_instance_tier`
- `backup_retention_days`
- `image_retention_count`
- `terraform_state_bucket`
- `cloud_provider` — "gcp" (GCP is the selected cloud provider)

### 4.3 `outputs.tf` (Root)

Exposes values needed by consuming systems (feature 36, CI/CD configuration, developer scripts):

- `database_private_ip`, `database_connection_secret`
- `auth_database_private_ip`, `auth_database_connection_secret`
- `container_registry_url`, `repository_urls`
- `load_balancer_dns`
- `ui_backend_service_id`, `api_backend_service_id`, `auth_backend_service_id`
- `api_service_account`, `auth_service_account`, `mastra_service_account`, `ui_service_account`, `cicd_service_account`
- `all_secret_names`

### 4.4 `backend.tf`

Configures the Terraform remote state backend:

- `backend "gcs"` with bucket name, prefix path, and state locking (Cloud Storage native object versioning + optional Firestore for locking).
- The backend configuration references no secrets inline. Credentials for the backend are provided via environment variables (`GOOGLE_APPLICATION_CREDENTIALS`) at runtime.

### 4.5 `environments/*.tfvars`

Three files provide environment-specific values for all root variables:

| Variable | dev | staging | production |
|---|---|---|---|
| `db_instance_tier` | Minimal (micro/smallest) | Mid-tier | Production-grade |
| `backup_retention_days` | 3 | 7 | 30 |
| `deletion_protection` | false | true | true |
| `image_retention_count` | 5 | 10 | 20 |
| `domain` | `dev.iexcel.app` | `staging.iexcel.app` | `iexcel.app` |

---

## 5. Error Handling and Edge Cases

| Scenario | Handling |
|---|---|
| `terraform apply` run without remote backend configured | Terraform fails with a clear error at the backend configuration step. Add a pre-apply check in CI/CD (feature 34) to validate backend is configured. |
| Secret already exists (re-apply) | Terraform state tracks existing secrets. Re-applying is idempotent — existing secrets are not recreated or overwritten. |
| Cloud provider is GCP | Modules use GCP resource blocks exclusively. The `var.cloud_provider` is set to `"gcp"`. All resources use the `google` Terraform provider. |
| Database deletion protection blocks `terraform destroy` in staging/production | Expected behaviour. Operator must set `deletion_protection = false` and re-apply before destroying. This is a safety feature, not a bug. |
| DNS certificate validation takes time | Managed SSL certificates require DNS propagation. Terraform may report the resource as pending. CI/CD should not treat this as a failure — the certificate validates asynchronously. |
| Module output consumed before resource is ready | Terraform's dependency graph ensures outputs are not consumed until the producing resource is applied. No workaround needed. |

---

## 6. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Idempotency** | All modules must be safe to apply multiple times without creating duplicate resources or causing errors. |
| **Naming consistency** | All resources follow the naming convention `{project_name}-{environment}-{resource_type}` (e.g., `iexcel-dev-vpc`, `iexcel-prod-database`). |
| **Tagging / labelling** | All resources are tagged with at minimum: `environment`, `project`, `managed-by: terraform`, `feature: 02-terraform-base-infra`. |
| **Code formatting** | All `.tf` files are formatted with `terraform fmt` before committing. |
| **Validation** | All modules include `validation` blocks on string input variables where enumerated values are expected (e.g., `environment` must be one of "dev", "staging", "production"). |
| **Documentation** | Each module directory contains a `README.md` describing inputs, outputs, and usage example. |

---

## 7. Local Development

The application must be runnable locally without cloud infrastructure for day-to-day development.

### 7.1 Docker Compose for Local Postgres

A `docker-compose.yml` at the monorepo root provides local equivalents of the cloud-managed services:

| Service | Image | Purpose |
|---|---|---|
| `postgres` | `postgres:15-alpine` | Product database (replaces Cloud SQL) |
| `postgres-auth` | `postgres:15-alpine` | Auth database (replaces Cloud SQL auth instance) |

Both databases expose their standard port (`5432` for product, `5433` for auth) on `localhost`. Default credentials are set via environment variables in the compose file (not secrets — local dev only).

### 7.2 Direct Node.js Execution

All application services (`auth`, `api`, `mastra`, `ui`) must also run directly via Node.js on the developer's machine (i.e., `pnpm nx serve <app>`) connecting to the local Docker Compose Postgres instances. This ensures fast iteration without requiring Docker builds for every code change.

### 7.3 Local Environment Variables

A `.env.example` file at the monorepo root documents all required environment variables with placeholder values. Developers copy this to `.env.local` and populate it with local-compatible values (e.g., `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/iexcel`).
