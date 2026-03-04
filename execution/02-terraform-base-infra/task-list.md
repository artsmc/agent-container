# Task List — Feature 02: Terraform Base Infrastructure

**Date:** 2026-03-03
**Phase:** 1 — Foundation
**Blocked by:** Feature 00 (nx-monorepo-scaffolding)
**Blocks:** Feature 36 (terraform-app-deployment)

---

## Pre-conditions Before Starting

- [ ] Feature 00 (nx-monorepo-scaffolding) is complete — `infra/terraform/` directory structure and `project.json` exist.
- [ ] Cloud provider has been decided: GCP or AWS. (See TR.md §2 for options — this decision gates all module implementation.)
- [ ] A Terraform state backend bucket has been created manually (GCS bucket or S3 bucket). (See TR.md §10.)
- [ ] Cloud credentials are configured locally and in CI/CD via environment variables or OIDC.

---

## Phase 0: Repository Hygiene

- [ ] **Add `/job-queue` to `.gitignore` in the repository root.**
  - The `/job-queue/` directory holds temporary spec and planning artefacts that must never be committed.
  - Complexity: small.

---

## Phase 1: Foundation Files

- [ ] **Create `infra/terraform/versions.tf`** with `required_version` and `required_providers` blocks for both `hashicorp/google` (~> 5.0) and `hashicorp/aws` (~> 5.0) and `hashicorp/random` (~> 3.0).
  - References: TR.md §11.
  - Complexity: small.

- [ ] **Create `infra/terraform/backend.tf`** with conditional backend configuration for GCS (GCP) or S3 (AWS). Include comments for CI/CD `-backend-config` override pattern.
  - References: TR.md §10.
  - Complexity: small.

- [ ] **Create `infra/terraform/variables.tf` (root)** declaring all top-level input variables with types, descriptions, and validation blocks. Include: `environment`, `project_name`, `region`, `domain`, `cloud_provider`, `vpc_cidr`, `private_subnet_cidr`, `public_subnet_cidr`, `db_instance_tier`, `auth_db_instance_tier`, `backup_retention_days`, `image_retention_count`, `terraform_state_bucket`, `deletion_protection`.
  - References: FRS.md §4.2.
  - Complexity: small.

- [ ] **Create `infra/terraform/outputs.tf` (root)** declaring all output values that consuming modules and CI/CD pipelines will need. See FRS.md §4.3 for the full list.
  - References: FRS.md §4.3.
  - Complexity: small.

- [ ] **Create `infra/terraform/environments/dev.tfvars`** with development-environment values (minimal DB tier, 3-day backup retention, deletion_protection = false, domain = dev.iexcel.app).
  - References: FRS.md §4.5, TR.md §4 (cost guidance).
  - Complexity: small.

- [ ] **Create `infra/terraform/environments/staging.tfvars`** with staging-environment values (mid-tier DB, 7-day backup retention, deletion_protection = true, domain = staging.iexcel.app).
  - References: FRS.md §4.5.
  - Complexity: small.

- [ ] **Create `infra/terraform/environments/production.tfvars`** with production-environment values (production-grade DB tier, 30-day backup retention, deletion_protection = true, domain = iexcel.app).
  - References: FRS.md §4.5.
  - Complexity: small.

- [ ] **Run `terraform fmt -recursive` and commit** to establish baseline formatting.
  - Complexity: small.

---

## Phase 2: Networking Module

- [ ] **Create `infra/terraform/modules/networking/variables.tf`** with input variable declarations for all networking inputs (environment, project_name, region, vpc_cidr, private_subnet_cidr, public_subnet_cidr). Include validation blocks for environment values.
  - References: FRS.md §3.1, TR.md §4.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/networking/main.tf`** — VPC, private subnet, public subnet.
  - GCP: `google_compute_network`, two `google_compute_subnetwork` resources.
  - AWS: `aws_vpc`, two `aws_subnet` resources, `aws_internet_gateway`, route tables.
  - Use conditional `count` based on `var.cloud_provider` (see TR.md §2, Option A).
  - Complexity: medium.

- [ ] **Implement NAT gateway / Cloud NAT** in the networking module to allow outbound internet access from private subnets.
  - GCP: `google_compute_router` + `google_compute_router_nat`.
  - AWS: `aws_nat_gateway` (Elastic IP required) + route table entry. Use single NAT in dev (cost control); multi-AZ NAT in production.
  - References: FRS.md §3.1 NET-06, TR.md §4.
  - Complexity: medium.

- [ ] **Implement firewall / security group rules** in the networking module.
  - Container security group: ingress from load balancer SG only; egress to internet (for external APIs) via NAT.
  - Database security group: ingress from container SG on port 5432 only; all other ingress denied.
  - Load balancer security group: ingress on ports 80 and 443 from 0.0.0.0/0; egress to container SG.
  - References: FRS.md §3.1 NET-04, NET-05, NET-07, TR.md §4.
  - Complexity: medium.

- [ ] **Create `infra/terraform/modules/networking/outputs.tf`** exposing vpc_id, private_subnet_id, public_subnet_id, container_security_group_id, database_security_group_id, lb_security_group_id.
  - References: FRS.md §3.1.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/networking/README.md`** with inputs table, outputs table, and usage example.
  - Complexity: small.

- [ ] **Verify networking module: `terraform validate` and `terraform plan`** in isolation using a test variable file.
  - References: GS.md (Networking Module scenarios).
  - Complexity: small.

---

## Phase 3: Database Module (Product Database)

- [ ] **Create `infra/terraform/modules/database/variables.tf`** with all inputs declared. Include `deletion_protection` variable with validation.
  - References: FRS.md §3.2.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/database/main.tf`** — managed Postgres instance with private networking, automated backups, deletion protection.
  - GCP: `google_sql_database_instance`, `google_sql_database`, `google_sql_user`. Set `ipv4_enabled = false`, backup config, point-in-time recovery.
  - AWS: `aws_db_subnet_group`, `aws_db_instance`. Set `publicly_accessible = false`, `backup_retention_period`, `deletion_protection`.
  - Generate password via `random_password` resource. Store connection string in secrets module (pass the password through to secrets module, not as an output).
  - References: FRS.md §3.2, TR.md §5.
  - Complexity: medium.

- [ ] **Create `infra/terraform/modules/database/outputs.tf`** exposing instance_id, connection_string_secret_name, private_ip, port.
  - References: FRS.md §3.2.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/database/README.md`**.
  - Complexity: small.

- [ ] **Verify database module: `terraform validate` and `terraform plan`** in isolation.
  - References: GS.md (Product Database Module scenarios).
  - Complexity: small.

---

## Phase 4: Auth Database Module

- [ ] **Create `infra/terraform/modules/auth-database/` files** (variables.tf, main.tf, outputs.tf, README.md) mirroring the database module with different resource names and a distinct secret name (`AUTH_DATABASE_URL`).
  - Note: Do not DRY the database and auth-database into a shared module prematurely — keep them separate instances even if the code is similar. Future divergence in auth vs product DB requirements is expected.
  - References: FRS.md §3.3, GS.md (Auth Database scenarios).
  - Complexity: medium.

- [ ] **Verify auth-database module: `terraform validate` and `terraform plan`** in isolation.
  - Complexity: small.

---

## Phase 5: Container Registry Module

- [ ] **Create `infra/terraform/modules/container-registry/variables.tf`** with inputs: environment, project_name, region, image_retention_count, app_names.
  - References: FRS.md §3.4.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/container-registry/main.tf`** — private registry, four repositories (auth, api, mastra, ui), image retention policy, vulnerability scanning.
  - GCP: `google_artifact_registry_repository` with cleanup policy.
  - AWS: `aws_ecr_repository` x4 with `image_tag_mutability`, `image_scanning_configuration`, `aws_ecr_lifecycle_policy`.
  - References: FRS.md §3.4 REG-01 through REG-06, TR.md §6.
  - Complexity: medium.

- [ ] **Create `infra/terraform/modules/container-registry/outputs.tf`** exposing registry_url and repository_urls map.
  - References: FRS.md §3.4.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/container-registry/README.md`**.
  - Complexity: small.

- [ ] **Verify container-registry module: `terraform validate` and `terraform plan`**.
  - References: GS.md (Container Registry scenarios).
  - Complexity: small.

---

## Phase 6: Secrets Module

- [ ] **Create `infra/terraform/modules/secrets/variables.tf`** with inputs: environment, project_name, region, deletion_protection, and a variable listing all logical secret names.
  - References: FRS.md §3.5.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/secrets/main.tf`** — create named secret slots (no values) for all 13 required secrets. Apply environment-based naming convention (`/{project_name}/{environment}/{SECRET_LOGICAL_NAME}`).
  - GCP: `google_secret_manager_secret` for each secret.
  - AWS: `aws_secretsmanager_secret` for each secret with `recovery_window_in_days` set from variable.
  - References: FRS.md §3.5 SEC-01 through SEC-06, TR.md §7.
  - Complexity: medium.

- [ ] **Create `infra/terraform/modules/secrets/outputs.tf`** exposing secret_names map, plus individual named outputs for database_url_secret, auth_database_url_secret, signing_key_private_secret, signing_key_public_secret.
  - References: FRS.md §3.5.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/secrets/README.md`** — include a note explaining that Terraform creates the secret slot only; values must be populated out-of-band.
  - Complexity: small.

- [ ] **Verify secrets module: `terraform validate` and `terraform plan`**.
  - References: GS.md (Secrets scenarios).
  - Complexity: small.

---

## Phase 7: IAM Module

- [ ] **Create `infra/terraform/modules/iam/variables.tf`** with inputs: environment, project_name, registry_id, secret_names map, terraform_state_bucket.
  - References: FRS.md §3.7.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/iam/main.tf` — service accounts for api, auth, mastra, ui, cicd**.
  - GCP: `google_service_account` x5. `google_secret_manager_secret_iam_binding` per service account for specific secrets only. `google_artifact_registry_repository_iam_binding` for cicd (push) and container SAs (pull). No `google_service_account_key` resources.
  - AWS: `aws_iam_role` x5 with ECS trust policy. `aws_iam_policy` per role with explicit `secretsmanager:GetSecretValue` on specific secret ARNs. `aws_iam_role_policy_attachment` for ECR and S3 state bucket permissions on the cicd role.
  - References: FRS.md §3.7 IAM-01 through IAM-08, TR.md §9.
  - Complexity: large.

- [ ] **Create `infra/terraform/modules/iam/outputs.tf`** exposing api_service_account, auth_service_account, mastra_service_account, ui_service_account, cicd_service_account.
  - References: FRS.md §3.7.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/iam/README.md`**.
  - Complexity: small.

- [ ] **Verify IAM module: `terraform validate` and `terraform plan`**.
  - References: GS.md (IAM scenarios).
  - Complexity: small.

---

## Phase 8: DNS Module

- [ ] **Create `infra/terraform/modules/dns/variables.tf`** with inputs: environment, domain, region, public_subnet_id, lb_security_group_id, vpc_id.
  - References: FRS.md §3.6.
  - Complexity: small.

- [ ] **Implement `infra/terraform/modules/dns/main.tf`** — load balancer, TLS certificate, HTTP-to-HTTPS redirect, DNS A records, stub target groups / backend services for ui, api, auth.
  - GCP: Global HTTPS load balancer, `google_compute_managed_ssl_certificate`, URL map with host-path rules, backend services (no backend instances yet), Cloud DNS zone and A records.
  - AWS: `aws_lb` (ALB), `aws_acm_certificate` with DNS validation, `aws_lb_listener` x2 (80 redirect, 443 HTTPS), three `aws_lb_target_group` (ui, api, auth) with no registered targets, `aws_lb_listener_rule` x3, Route 53 A alias records.
  - References: FRS.md §3.6 DNS-01 through DNS-08, TR.md §8.
  - Complexity: large.

- [ ] **Create `infra/terraform/modules/dns/outputs.tf`** exposing load_balancer_dns, load_balancer_arn_or_id, ui_target_group_arn_or_id, api_target_group_arn_or_id, auth_target_group_arn_or_id.
  - References: FRS.md §3.6.
  - Complexity: small.

- [ ] **Write `infra/terraform/modules/dns/README.md`** — include a note that target groups are stubs until feature 36 attaches container services, and that certificate validation may take 5–15 minutes on first apply.
  - Complexity: small.

- [ ] **Verify DNS module: `terraform validate` and `terraform plan`**.
  - References: GS.md (DNS and Load Balancer scenarios).
  - Complexity: small.

---

## Phase 9: Root Composition

- [ ] **Implement `infra/terraform/main.tf`** — wire all seven modules together in dependency order: networking → database → auth-database → container-registry → secrets → iam → dns. Pass module outputs as inputs to dependent modules.
  - References: FRS.md §4.1.
  - Complexity: medium.

- [ ] **Run `terraform fmt -recursive`** across the entire `infra/terraform/` tree.
  - Complexity: small.

- [ ] **Run `terraform validate`** from the `infra/terraform/` root.
  - Complexity: small.

- [ ] **Run `terraform plan -var-file=environments/dev.tfvars`** and review the plan output for correctness. Confirm resource count matches expectations.
  - References: GS.md (Root Composition scenarios).
  - Complexity: medium.

---

## Phase 10: Dev Environment Apply and Verification

- [ ] **Run `terraform apply -var-file=environments/dev.tfvars`** against the dev cloud account.
  - Complexity: medium.

- [ ] **Verify VPC and subnets** exist in the cloud console with correct CIDRs and tags.
  - References: GS.md NET-01 through NET-08.
  - Complexity: small.

- [ ] **Verify database instances**: confirm both product and auth Postgres instances have no public IP, backups enabled, correct tier.
  - References: GS.md DB-01 through DB-10, ADB-01 through ADB-03.
  - Complexity: small.

- [ ] **Verify container registry**: confirm four repositories exist, vulnerability scanning is enabled, retention policy is set.
  - References: GS.md REG-01 through REG-06.
  - Complexity: small.

- [ ] **Verify secrets**: confirm all 13 secret slots exist in the secret manager with no values set.
  - References: GS.md SEC-01 through SEC-06.
  - Complexity: small.

- [ ] **Verify IAM**: confirm service accounts / roles exist, inspect policies to verify no wildcard permissions.
  - References: GS.md IAM-01 through IAM-08.
  - Complexity: medium.

- [ ] **Verify load balancer and DNS**: confirm load balancer exists, HTTPS listener is active, DNS records resolve (may take propagation time), HTTP redirects to HTTPS.
  - References: GS.md DNS-01 through DNS-08.
  - Complexity: medium.

- [ ] **Verify idempotency**: run `terraform plan` again immediately after apply and confirm 0 changes.
  - References: GS.md (idempotency scenarios in Networking and DNS).
  - Complexity: small.

- [ ] **Verify destroy**: run `terraform destroy -var-file=environments/dev.tfvars` and confirm clean teardown. Confirm deletion_protection = false allowed this to succeed.
  - References: GS.md (Root Composition — terraform destroy scenario).
  - Complexity: medium.

- [ ] **Re-apply dev environment** after destroy verification to restore the dev baseline.
  - Complexity: small.

---

## Phase 11: Nx Integration Verification

- [ ] **Verify `project.json`** in `infra/terraform/` includes correct Nx targets for `fmt`, `validate`, `plan`, `apply` as defined in TR.md §12.
  - Note: This file is scaffolded by feature 00. If it is missing targets, add them in this feature.
  - References: TR.md §12.
  - Complexity: small.

- [ ] **Run `nx run infra:validate`** from the monorepo root and confirm it succeeds.
  - Complexity: small.

- [ ] **Run `nx run infra:fmt`** from the monorepo root and confirm it succeeds.
  - Complexity: small.

---

## Phase 12: Documentation and Handoff

- [ ] **Confirm all seven module README.md files exist** and contain: inputs table, outputs table, usage example.
  - References: FRS.md §6 (Non-Functional Requirements — Documentation).
  - Complexity: small.

- [ ] **Document the secret population procedure** — create a `infra/terraform/docs/secret-population.md` file explaining how to set actual secret values in the cloud secret manager after Terraform creates the secret slots. Include example CLI commands for GCP and AWS.
  - Complexity: small.

- [ ] **Document the bootstrap procedure** — create a `infra/terraform/docs/bootstrap.md` file explaining the manual pre-steps: creating the state backend bucket, configuring credentials, running `terraform init` with the correct `-backend-config` flags.
  - Complexity: small.

- [ ] **Update the feature roadmap index** (`execution/job-queue/index.md`) to mark feature 02 spec status as "complete".
  - Complexity: small.

---

## Completion Criteria

Feature 02 is complete when:

1. `terraform apply -var-file=environments/dev.tfvars` applies cleanly with 0 errors.
2. `terraform plan` immediately after reports 0 changes.
3. All seven base modules (networking, database, auth-database, container-registry, secrets, dns, iam) have populated `main.tf`, `variables.tf`, `outputs.tf`, and `README.md`.
4. `environments/dev.tfvars`, `staging.tfvars`, and `production.tfvars` all exist with correct values.
5. `terraform validate` passes from the root directory.
6. All secrets exist as named slots in the cloud secret manager with no plaintext values in Terraform output or state.
7. Both database instances are accessible from within the private subnet and inaccessible from the public internet.
8. Feature 36 (terraform-app-deployment) has the target group IDs / backend service IDs it needs from feature 02 outputs to attach container services.
