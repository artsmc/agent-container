# Feature 02: Terraform Base Infrastructure

## Summary
Set up Terraform base infrastructure modules (networking, database instances, container-registry, secrets, dns, iam). This is the cloud foundation — no application containers yet (those come in feature 36).

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding — provides the infra/terraform directory structure)
- **Blocks**: 36 (Terraform App Deployment — which adds container service modules for auth, api, mastra, ui)

## Source PRDs
- infra-prd.md (Terraform Modules section, Cloud Provider Decision section)

## Relevant PRD Extracts

### Terraform Directory Structure (infra-prd.md)

```
infra/
  └── terraform/
      ├── modules/
      │   ├── networking/       # VPC, subnets, firewall/security groups
      │   ├── database/         # Product Postgres instance (Cloud SQL / RDS)
      │   ├── auth-database/    # Auth Postgres instance (separate from product)
      │   ├── container-registry/ # GCR / ECR
      │   ├── auth/             # Auth service container          (Feature 36)
      │   ├── api/              # API container service            (Feature 36)
      │   ├── mastra/           # Mastra container service         (Feature 36)
      │   ├── ui/               # UI container service             (Feature 36)
      │   ├── secrets/          # Secret manager config
      │   ├── dns/              # DNS and load balancing
      │   └── iam/              # Service accounts, roles, policies
      ├── environments/
      │   ├── dev.tfvars
      │   ├── staging.tfvars
      │   └── production.tfvars
      ├── main.tf
      ├── variables.tf
      ├── outputs.tf
      └── project.json          # Nx project config for infra
```

### Terraform Modules (infra-prd.md)

#### networking
- VPC with private subnets for containers and database.
- Public subnet for load balancer only.
- Firewall / security groups: containers only accept traffic from the load balancer. Database only accepts traffic from containers.

#### database
- Managed Postgres instance (Cloud SQL / RDS).
- Private networking — no public IP.
- Automated backups with point-in-time recovery.
- Connection pooling (PgBouncer or built-in).
- Separate credentials per environment.

#### auth-database
- Same requirements as the product database module, but for the auth/identity database.
- Auth Postgres instance is separate from the product Postgres instance.

#### container-registry
- Private container registry.
- Image retention policy (keep last N images per app).
- Vulnerability scanning on push.

#### secrets
- All credentials stored in cloud secret manager.
- Terraform creates the secret references — actual values are set manually or via a separate secure process.
- Secrets include: `DATABASE_URL`, `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `SIGNING_KEY_PRIVATE`, `SIGNING_KEY_PUBLIC`, Asana OAuth tokens, Grain API key, Google Docs service account, LLM API key, email provider API key.

#### dns
- DNS records for all public endpoints.
- Load balancer with TLS termination.
- Routing rules:
  - `app.domain.com` -> UI container
  - `api.domain.com` -> API container
  - `api.domain.com/shared/*` -> API container (public, no auth)
  - `auth.domain.com` -> Auth service container

#### iam
- Service accounts per container (least privilege).
- API container: access to Postgres, secret manager, external service credentials.
- Mastra container: access to API (via service token), LLM API key, secret manager.
- UI container: access to API only (via public URL, no direct cloud resource access).
- CI/CD service account: access to container registry, container services, Terraform state.

### Cloud Provider Decision (infra-prd.md)

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

### Design Principles (infra-prd.md)
- **Infrastructure is code.** Every cloud resource is defined in Terraform. No manual console clicks. All changes go through PR review.
- **Environment parity.** Dev, staging, and production use the same Terraform modules with different variable files. What works in staging works in production.
- **Secrets never live in code.** All credentials and tokens are managed by the cloud provider's secret manager, referenced by Terraform, injected at runtime.

### Pipeline Tooling (infra-prd.md)
| Concern | Tool |
|---|---|
| **Terraform state** | Remote backend (GCS bucket / S3 bucket with state locking via DynamoDB or native) |
| **Secret injection** | Cloud Secret Manager (GCP) / AWS Secrets Manager — referenced in Terraform, injected as env vars at runtime |

## Scope

### In Scope
- `modules/networking/` — VPC, subnets, firewall/security group rules
- `modules/database/` — Product Postgres instance with private networking, backups, connection pooling
- `modules/auth-database/` — Auth Postgres instance (separate from product)
- `modules/container-registry/` — Private registry with retention and scanning policies
- `modules/secrets/` — Secret manager references for all credentials
- `modules/dns/` — DNS records, load balancer, TLS, routing rules
- `modules/iam/` — Service accounts and role policies per container
- `main.tf` — Root composition wiring modules together
- `variables.tf` — Input variables for environment-specific configuration
- `outputs.tf` — Output values (database URLs, registry URLs, etc.)
- `environments/dev.tfvars`, `staging.tfvars`, `production.tfvars` — Per-environment variable values
- Terraform backend configuration for remote state

### Out of Scope
- Application container service modules (`modules/auth/`, `modules/api/`, `modules/mastra/`, `modules/ui/`) — those are feature 36 (Terraform App Deployment)
- CI/CD pipeline configuration — that is feature 34
- Docker image builds — that is feature 35
- Actual secret values — Terraform creates references, values are set manually
- Cloud provider final decision — modules should be structured to support either GCP or AWS

## Key Decisions
- The auth database is a **separate Postgres instance** from the product database, not just a separate schema. This provides full isolation between identity and product data.
- Terraform modules should be cloud-provider-agnostic where possible, with provider-specific implementations abstracted behind consistent interfaces.
- The `modules/auth/`, `modules/api/`, `modules/mastra/`, and `modules/ui/` directories are created as placeholders in feature 00 but implemented in feature 36. Feature 02 only implements the base infrastructure modules.
