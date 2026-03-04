# FRD — Feature Requirements Document
# Feature 36: Terraform App Deployment

**Date:** 2026-03-03
**Phase:** Phase 8 — CI/CD & Deployment

---

## 1. Business Objective

The iExcel automation system consists of four independently-built application containers (auth, api, mastra, ui). Each container needs to be deployed to the cloud in a repeatable, environment-consistent, infrastructure-as-code manner. Without structured Terraform modules for each application, deployment would be manual, error-prone, and impossible to reproduce across dev/staging/production.

Feature 36 delivers the Terraform modules that deploy these four containers as production-grade cloud services — with auto-scaling, secret injection, health checks, TLS, custom domains, and logging — integrated into the CI/CD pipeline so that every merge to main triggers an automated infrastructure apply.

---

## 2. Value Proposition

| Benefit | Description |
|---|---|
| Reproducibility | The same Terraform modules deploy identical infrastructure in dev, staging, and production — only variable values differ |
| Isolation | Each application has its own container service, scaling policy, IAM role, and secret scope |
| Zero-secret code | All credentials are sourced from the cloud secret manager at runtime; the Terraform code itself contains no secret values |
| Safe deployments | `terraform plan` is a PR gate; `terraform apply` runs automatically on merge; production requires explicit approval |
| Auditability | Every infrastructure change is a reviewed, merged pull request — no manual console changes |
| Independent scaling | Mastra scales on workflow queue depth; Auth scales on request count; UI scales independently from the API |

---

## 3. Target Users

| User | Role |
|---|---|
| Platform / DevOps engineer | Authors and maintains the Terraform modules; reviews infrastructure PRs |
| Senior developer | Reviews `terraform plan` output in PRs that touch `infra/terraform/` |
| CI/CD pipeline (automated) | Runs `terraform plan` on PR open; runs `terraform apply` on merge to main |

---

## 4. Feature Scope

### 4.1 In Scope

- `infra/terraform/modules/auth/` — Terraform module for the Auth service container
- `infra/terraform/modules/api/` — Terraform module for the API container
- `infra/terraform/modules/mastra/` — Terraform module for the Mastra agent container
- `infra/terraform/modules/ui/` — Terraform module for the UI container
- Integration with existing base infrastructure modules (Feature 02): dns, iam, secrets
- Environment-specific variable files (`dev.tfvars`, `staging.tfvars`, `production.tfvars`) updated with app deployment variables
- Wiring of each app module into the root `main.tf`
- `terraform plan` step in CI/CD pipeline (triggered on PR changes to `infra/terraform/`)
- `terraform apply` step in CI/CD pipeline (triggered on merge to main; production requires approval gate)
- CDN configuration for the UI container's static assets

### 4.2 Out of Scope

- Base infrastructure modules (networking, database, auth-database, container-registry, secrets, dns, iam) — Feature 02
- Dockerfile creation and container image building — Feature 35
- CI/CD pipeline scaffolding — Feature 34
- Cloud provider selection — modules must work for GCP (Cloud Run) or AWS (ECS Fargate); final selection deferred
- Mastra runtime containerisation compatibility — spike is pre-requisite (noted in context.md)
- Database migration job container — Feature 35
- Monitoring and alerting configuration (Datadog, Grafana, CloudWatch) — future work

---

## 5. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | All four app modules (`auth`, `api`, `mastra`, `ui`) can be applied with `terraform apply` in a dev environment without errors |
| AC-02 | Each container service starts, passes its health check, and is reachable at its configured domain |
| AC-03 | Environment variables are injected from secret manager references — no secrets appear in Terraform state in plaintext |
| AC-04 | Each container scales independently based on its configured scaling metric |
| AC-05 | `terraform plan` runs as a PR check when `infra/terraform/` is affected |
| AC-06 | `terraform apply` runs automatically on merge to main for dev/staging; production requires explicit approval |
| AC-07 | `terraform destroy` can tear down dev environments without errors (deletion protection is off for dev) |
| AC-08 | Custom domain routing is correct: `app.domain.com` reaches UI, `api.domain.com` reaches API, `auth.domain.com` reaches Auth |
| AC-09 | The same Terraform modules with different `.tfvars` files deploy identical topology to dev, staging, and production |
| AC-10 | CDN serves static assets from the UI container |

---

## 6. Success Metrics

- Zero manual console changes needed to deploy any application container to any environment
- `terraform apply` for a single-container change completes in under 10 minutes
- Health checks pass within 2 minutes of a new container deployment
- No environment drift between staging and production (same module, different variables)

---

## 7. Dependencies

| Feature | Relationship |
|---|---|
| Feature 02 (terraform-base-infra) | Provides networking, database, secrets, dns, iam, and container-registry modules that Feature 36 app modules depend on. Feature 36 consumes the outputs of these modules. |
| Feature 35 (container-builds) | Provides built Docker images in the container registry. Feature 36 deploys these images. The image URL (from the registry) must be an input variable to each app module. |
| Feature 34 (cicd-pipeline) | Feature 34 sets up the CI/CD pipeline machinery. Feature 36 adds Terraform plan/apply steps to that pipeline. |

---

## 8. Design Principles

All four app modules follow these shared principles inherited from the infrastructure PRD:

1. **One container, one concern.** Each application is its own container with its own build, deploy, and scaling configuration. Modules are not shared between apps.

2. **Environment parity.** Dev, staging, and production use the same Terraform modules. Only `.tfvars` files differ. A working staging deployment implies a working production deployment.

3. **Secrets never live in code.** All credentials are stored in the cloud secret manager (provisioned by Feature 02's secrets module). Feature 36 modules reference these secrets by name. Actual values are populated out-of-band by a human operator.

4. **Plan is a review gate.** Changes to `infra/terraform/` must trigger a `terraform plan` visible in the PR. No infrastructure change goes directly to apply without review.

---

## 9. Integration with Larger System

Feature 36 is the final deployment step in the infrastructure pipeline:

```
Feature 02 (base infra) — networking, DB, secrets, IAM, DNS stubs
        |
Feature 35 (container builds) — Docker images in registry
        |
Feature 36 (app deployment) — container services deployed, traffic routed
        |
Feature 34 (CI/CD pipeline) — orchestrates plan/apply on every merge
```

After Feature 36 is complete, the entire system is deployable from code. Account managers can use the Web UI and terminal to interact with a cloud-hosted production system.
