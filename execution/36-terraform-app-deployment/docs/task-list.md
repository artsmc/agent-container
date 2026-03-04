# Task List — Feature 36: Terraform App Deployment

**Date:** 2026-03-03
**Phase:** Phase 8 — CI/CD & Deployment
**Blocked by:** Feature 02 (terraform-base-infra), Feature 35 (container-builds)

---

## Pre-Work: Mastra Containerisation Spike

- [ ] **Spike: Confirm Mastra containerisation compatibility** — Run the Mastra container image (Feature 35) locally and in a dev Cloud Run revision or ECS task. Confirm: (1) it starts successfully, (2) the health endpoint path and port, (3) whether a persistent volume is needed, (4) the observability port. Document all findings. This spike is a hard prerequisite for the Mastra module. *(Medium — 4-8 hours)* (References: FRS.md Section 5, TR.md Section 10, context.md Key Decisions)

- [ ] **Spike: Confirm internal service-to-service routing** — Verify that the API container can call the Mastra container via its internal service URL (Cloud Run internal URL or ECS service discovery DNS). Test from a running API dev container. Document the URL format. *(Small — 2-4 hours)* (References: FRS.md Section 5.3 APP-MASTRA-05, TR.md Section 10)

---

## Phase 1: Module Scaffolding (All Four Apps)

- [ ] **Create directory structure for all four app modules** — Create `infra/terraform/modules/auth/`, `infra/terraform/modules/api/`, `infra/terraform/modules/mastra/`, `infra/terraform/modules/ui/`. Inside each, create empty `main.tf`, `variables.tf`, `outputs.tf`, `README.md`. *(Small)* (References: FRS.md Section 2.1)

- [ ] **Define shared `variables.tf` for auth module** — Declare all shared input variables (environment, project_name, region, image_url, min_instances, max_instances, service_account, secret_references, log_destination, network_config) plus auth-specific variables (scaling_target_rps, auth_target_group_id). Add `validation` blocks for `environment`. *(Small)* (References: FRS.md Section 2.2, Section 3.8)

- [ ] **Define shared `variables.tf` for api module** — Same shared variables plus api-specific variables (scaling_target_cpu_percent, api_target_group_id). *(Small)* (References: FRS.md Section 2.2, Section 4.8)

- [ ] **Define shared `variables.tf` for mastra module** — Same shared variables plus mastra-specific variables (observability_port, llm_provider, llm_model, api_internal_url, config_env_vars map). *(Small)* (References: FRS.md Section 2.2, Section 5.8)

- [ ] **Define shared `variables.tf` for ui module** — Same shared variables plus ui-specific variables (ui_target_group_id, api_public_url, auth_public_url, cdn_price_class). *(Small)* (References: FRS.md Section 2.2, Section 6.8)

- [ ] **Define shared `outputs.tf` for all four modules** — Each module's outputs.tf must declare: service_url, service_name, latest_revision. *(Small)* (References: FRS.md Section 2.3)

---

## Phase 2: Auth Module Implementation

- [ ] **Implement `modules/auth/main.tf` — GCP Cloud Run resource** — Create the `google_cloud_run_v2_service` resource for the auth container on port 8090. Include: scaling config, liveness probe at GET /health (15s initial delay), secret manager env var injection via dynamic blocks, log routing, service account assignment, resource tags. *(Medium)* (References: FRS.md Section 3, TR.md Section 3.1)

- [ ] **Implement `modules/auth/main.tf` — AWS ECS Fargate resource** — Create `aws_ecs_task_definition` and `aws_ecs_service` for auth on port 8090. Include: task role and execution role from IAM module, secret manager ARN references for env vars, CloudWatch log driver, health check config (15s start period). Use `count = var.cloud_provider == "aws" ? 1 : 0`. *(Medium)* (References: FRS.md Section 3, TR.md Section 3.2, TR.md Section 2.4)

- [ ] **Implement auth module auto-scaling** — GCP: configure `autoscaling` in Cloud Run template. AWS: create `aws_appautoscaling_target` and `aws_appautoscaling_policy` targeting request count. *(Small)* (References: FRS.md Section 3.4 APP-AUTH-04)

- [ ] **Wire auth module into dns module target group** — Add the `auth_target_group_id` variable to the module and register the Cloud Run service / ECS service as the backend for that target group (backend service binding for GCP, target group attachment for AWS). *(Small)* (References: FRS.md Section 3.5 APP-AUTH-05)

- [ ] **Write `modules/auth/README.md`** — Document inputs, outputs, and a usage example showing how to instantiate the module from root main.tf. *(Small)* (References: FRS.md Section 2.1)

---

## Phase 3: API Module Implementation

- [ ] **Implement `modules/api/main.tf` — GCP Cloud Run resource** — Same pattern as auth module. Port 8080, health check GET /health (15s initial delay), all API secret env vars via dynamic block. *(Medium)* (References: FRS.md Section 4)

- [ ] **Implement `modules/api/main.tf` — AWS ECS Fargate resource** — Same pattern as auth module with AWS resources. Port 8080, CloudWatch logs. *(Medium)* (References: FRS.md Section 4, TR.md Section 2.4)

- [ ] **Implement API module auto-scaling** — CPU-based scaling (and request-count as alternative). *(Small)* (References: FRS.md Section 4.4 APP-API-04)

- [ ] **Wire API module into dns module target group** — Register API service as backend for `api_target_group_id`. *(Small)* (References: FRS.md Section 4.5 APP-API-05)

- [ ] **Write `modules/api/README.md`** *(Small)*

---

## Phase 4: Mastra Module Implementation

- [ ] **Implement `modules/mastra/main.tf` — GCP Cloud Run resource** — Port 8081 primary + observability port secondary. Health check with 30s initial delay. Secret env vars and plain config env vars (two separate dynamic blocks). No public domain registration. *(Medium)* (References: FRS.md Section 5, TR.md Section 4)

- [ ] **Implement `modules/mastra/main.tf` — AWS ECS Fargate resource** — Port 8081 + observability port mapping in task definition. Mixed env var handling (secrets vs plain config). *(Medium)* (References: FRS.md Section 5, TR.md Section 4.3)

- [ ] **Implement Mastra auto-scaling** — Use CPU-based scaling as the baseline. If queue-depth-based scaling is feasible (confirmed during spike), implement custom metrics scaling. Document the choice. *(Small)* (References: FRS.md Section 5.4 APP-MASTRA-04, TR.md Section 4.5)

- [ ] **Ensure Mastra observability port is internal-only** — Verify the observability port is not exposed via the load balancer. GCP: only the primary port (8081) receives load balancer traffic. AWS: only map port 8081 in the target group. *(Small)* (References: FRS.md Section 5.6 APP-MASTRA-06)

- [ ] **Write `modules/mastra/README.md`** — Include spike findings in the README for future reference. *(Small)*

---

## Phase 5: UI Module Implementation

- [ ] **Implement `modules/ui/main.tf` — GCP Cloud Run resource** — Port 3000, health check GET / (20s initial delay), plain config env vars only (no secret refs for UI), resource tags. *(Medium)* (References: FRS.md Section 6)

- [ ] **Implement `modules/ui/main.tf` — AWS ECS Fargate resource** — Port 3000, task definition with environment vars (not secrets), CloudWatch logs. *(Medium)* (References: FRS.md Section 6, TR.md Section 2.4)

- [ ] **Implement CDN configuration — GCP Cloud CDN** — Configure `google_compute_backend_service` with CDN enabled, cache policy for static assets (long TTL for `/_next/static/`, short TTL for HTML). *(Medium)* (References: FRS.md Section 6.6 APP-UI-06, TR.md Section 5.1)

- [ ] **Implement CDN configuration — AWS CloudFront** — Create `aws_cloudfront_distribution` with UI service as origin, two cache behaviors: long TTL for static paths, short TTL for HTML. *(Medium)* (References: FRS.md Section 6.6 APP-UI-06, TR.md Section 5.1)

- [ ] **Implement CDN cache invalidation on deploy** — Add `null_resource` with `local-exec` provisioner that triggers CDN invalidation when `image_url` changes. Ensure this resource `depends_on` the container service resource. *(Small)* (References: FRS.md Section 6.6, TR.md Section 5.2)

- [ ] **Wire UI module into dns module target group** — Register UI service as backend for `ui_target_group_id`. *(Small)* (References: FRS.md Section 6.5 APP-UI-05)

- [ ] **Implement UI module auto-scaling** — Request-count-based scaling. *(Small)* (References: FRS.md Section 6.4 APP-UI-04)

- [ ] **Write `modules/ui/README.md`** *(Small)*

---

## Phase 6: Root Composition Wiring

- [ ] **Update `infra/terraform/variables.tf` with new app deployment variables** — Add `auth_image_url`, `api_image_url`, `mastra_image_url`, `ui_image_url` and all scaling count variables. Add `llm_provider` and `llm_model` with validation blocks. *(Small)* (References: FRS.md Section 7.2, TR.md Section 6.1)

- [ ] **Update `infra/terraform/main.tf` with app module instantiations** — Add `module "auth"`, `module "api"`, `module "mastra"`, `module "ui"` blocks. Wire all outputs from Feature 02 base modules (iam, secrets, dns, networking) into the app module inputs. Set `depends_on = [module.api]` for the mastra module. *(Medium)* (References: FRS.md Section 7, TR.md Section 7)

- [ ] **Update `infra/terraform/outputs.tf` with app deployment outputs** — Add: `auth_service_url`, `api_service_url`, `mastra_service_url`, `ui_service_url`, `cdn_distribution_url`. *(Small)* (References: FRS.md Section 7.3)

---

## Phase 7: Environment Variable Files

- [ ] **Update `environments/dev.tfvars`** — Add image URL placeholders, dev-appropriate scaling counts (min=0 for scale-to-zero, low max), llm_provider, llm_model. *(Small)* (References: FRS.md Section 8.1)

- [ ] **Update `environments/staging.tfvars`** — Add image URL placeholders, staging-appropriate scaling counts (min=1 for all services). *(Small)* (References: FRS.md Section 8.2)

- [ ] **Update `environments/production.tfvars`** — Add image URL placeholders, production scaling counts (min=2 for auth and api). *(Small)* (References: FRS.md Section 8.3)

---

## Phase 8: CI/CD Pipeline Integration

- [ ] **Add `terraform plan` step to the CI/CD pipeline** — In the pipeline configuration (Feature 34), add a step that runs `terraform plan` when `infra/terraform/**` is in the Nx affected set. Post the plan output as a PR comment. *(Medium)* (References: FRS.md Section 9.1 CICD-01, TR.md Section 8.1)

- [ ] **Add `terraform apply` step to the CI/CD pipeline (dev/staging)** — In the merge-to-main pipeline, add a step that runs `terraform apply` with the correct `.tfvars` file and image URL `-var` overrides. *(Medium)* (References: FRS.md Section 9.2 CICD-02, TR.md Section 8.2)

- [ ] **Add production approval gate** — In the pipeline, add a manual approval step that must be passed before the production `terraform apply` runs. Use GitHub Actions `environment: production` with required reviewers. *(Small)* (References: FRS.md Section 9.2 CICD-02, TR.md Section 8.2)

- [ ] **Implement image URL injection in pipeline** — Add pipeline steps that extract the built image URLs from Feature 35's pipeline outputs and pass them as `-var` flags to `terraform apply`. *(Small)* (References: FRS.md Section 9.3 CICD-03, TR.md Section 8.1)

---

## Phase 9: Validation and Smoke Testing

- [ ] **Run `terraform validate` on all four new modules** — Ensure there are no syntax errors or invalid references before applying. *(Small)*

- [ ] **Run `terraform plan` against dev environment** — Confirm the plan shows only resource creation (no unexpected modifications to Feature 02 resources). Inspect the plan for correctness — health checks, secret references, scaling config. *(Small)* (References: GS.md Feature: CI/CD Terraform integration, AC-05)

- [ ] **Run `terraform apply` in dev environment** — Apply the full configuration. Verify all four container services are created. *(Medium)* (References: AC-01)

- [ ] **Verify all four containers pass health checks** — After apply, check each container's health status in the cloud console. Confirm each service reports healthy within 2 minutes. *(Small)* (References: AC-02, GS.md scenarios for each app)

- [ ] **Verify custom domain routing** — Test HTTPS requests to `app.dev.iexcel.app`, `api.dev.iexcel.app`, `auth.dev.iexcel.app`. Confirm each reaches the correct container service. *(Small)* (References: AC-08, GS.md Feature: Root composition wiring)

- [ ] **Verify secret injection** — Confirm containers receive environment variables from secret manager (check via container logs or API health response). Confirm no literal secret values appear in Terraform state. *(Small)* (References: AC-03, GS.md Feature: Security)

- [ ] **Verify auto-scaling configuration** — For each service, confirm the scaling rules are configured (min/max instances visible in cloud console). A load test is not required at this stage — confirming the scaling configuration is sufficient for AC-04. *(Small)* (References: AC-04)

- [ ] **Verify CDN serves UI static assets** — After UI deployment, request a static asset URL via the CDN endpoint. Confirm it returns with CDN cache headers. *(Small)* (References: AC-10, GS.md Feature: UI module deployment)

- [ ] **Verify `terraform apply` is idempotent** — Re-run `terraform apply` with no changes. Confirm the plan shows "No changes." *(Small)* (References: GS.md Scenario: terraform apply is idempotent)

- [ ] **Verify dev environment can be destroyed** — Run `terraform destroy -var-file=environments/dev.tfvars` in dev. Confirm all Feature 36 resources are removed cleanly. Recreate the dev environment after to leave it in a clean state. *(Small)* (References: AC-07)

- [ ] **Run `terraform plan` with staging `.tfvars`** — Confirm the plan shows the staging-appropriate configuration (min_instances=1). Do not apply to staging until dev is fully validated. *(Small)* (References: AC-09)

---

## Completion Checklist

- [ ] All four modules (`auth`, `api`, `mastra`, `ui`) are implemented in `infra/terraform/modules/`
- [ ] All four modules pass `terraform validate`
- [ ] `terraform apply` in dev succeeds (AC-01)
- [ ] All containers pass health checks within 2 minutes of deployment (AC-02)
- [ ] No secret values in Terraform state (AC-03)
- [ ] Scaling configuration is in place for all services (AC-04)
- [ ] `terraform plan` runs as PR check (AC-05)
- [ ] `terraform apply` is automated for dev/staging with production approval gate (AC-06)
- [ ] `terraform destroy` works in dev (AC-07)
- [ ] Domain routing is correct for all three public domains (AC-08)
- [ ] Same modules work across dev, staging, production with different `.tfvars` files (AC-09)
- [ ] CDN serves UI static assets (AC-10)
- [ ] Each module has a `README.md`
- [ ] All `.tf` files are formatted with `terraform fmt`
- [ ] Mastra spike findings are documented in `modules/mastra/README.md`
