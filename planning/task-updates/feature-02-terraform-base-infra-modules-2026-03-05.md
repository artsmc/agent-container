# Task Update: Feature 02 — Terraform Base Infrastructure Modules

**Date**: 2026-03-05
**Feature**: 02-terraform-base-infra
**Status**: Implementation Complete (pending terraform validate in CI/CD)

## Summary

Implemented all 6 remaining Terraform modules for the iExcel GCP base infrastructure. All modules follow the variable naming conventions dictated by the pre-existing root `main.tf` and produce the outputs expected by `outputs.tf`.

## Files Created

### Module: database (`infra/terraform/modules/database/`)
- `variables.tf` — 11 variables matching root main.tf parameter names exactly
- `main.tf` — Cloud SQL PostgreSQL, random password, dedicated app user, Secret Manager DATABASE_URL
- `outputs.tf` — instance_id, connection_string_secret_name, private_ip, port, database_name, app_user_name
- `README.md` — inputs/outputs table, usage example, security notes

### Module: auth-database (`infra/terraform/modules/auth-database/`)
- `variables.tf` — identical variable signature to database module
- `main.tf` — separate Cloud SQL instance with auth naming, offset backup window (02:00 vs 03:00 UTC), AUTH_DATABASE_URL secret
- `outputs.tf` — same output pattern as database module
- `README.md` — design rationale for isolation, usage example

### Module: container-registry (`infra/terraform/modules/container-registry/`)
- `variables.tf` — environment, project_name, gcp_project_id, region, app_names, image_retention_count
- `main.tf` — `for_each` over app_names, cleanup policies (keep N tagged + delete untagged >1d), Docker format
- `outputs.tf` — registry_url, repository_urls (map), repository_ids (map)
- `README.md` — image tagging convention, cleanup policy explanation

### Module: secrets (`infra/terraform/modules/secrets/`)
- `variables.tf` — environment, project_name, gcp_project_id, region, deletion_protection
- `main.tf` — 13 secret slots via `for_each`, auto replication, env-namespaced IDs
- `outputs.tf` — secret_names (map), secret_resource_ids (map), 4 individual named outputs
- `README.md` — full secret inventory table, DATABASE_URL dual-secret explanation

### Module: iam (`infra/terraform/modules/iam/`)
- `variables.tf` — environment, project_name, gcp_project_id, region, app_names, secret_names, terraform_state_bucket
- `main.tf` — SAs for auth/api/mastra/ui/cicd, secret access matrix via `for_each`, Artifact Registry reader/writer, Cloud Run invoker/developer, Cloud SQL client, GCS state bucket admin
- `outputs.tf` — api/auth/mastra/ui/cicd service account emails + all_app_service_accounts map
- `README.md` — secret access matrix table, SA naming, WIF CI/CD notes

### Module: dns (`infra/terraform/modules/dns/`)
- `variables.tf` — environment, project_name, gcp_project_id, domain, region, vpc_id
- `main.tf` — global IP, wildcard SSL cert, health checks, backend service stubs, HTTPS URL map, HTTP redirect URL map, HTTPS/HTTP proxies, SSL policy (MODERN/TLS1.2+), global forwarding rules, Cloud DNS managed zone with DNSSEC, A records for app/api/auth subdomains + root
- `outputs.tf` — load_balancer_dns, load_balancer_id, ui/api/auth backend service IDs, dns_zone_name, dns_name_servers, ssl_certificate_id
- `README.md` — routing table, post-provisioning steps, SSL activation

### Documentation (`infra/terraform/docs/`)
- `bootstrap.md` — complete first-time provisioning guide: API enablement, state bucket creation, WIF setup, init/plan/apply commands, DNS delegation, SSL monitoring, CI/CD integration, rollback, cost estimates
- `secret-population.md` — step-by-step guide to populate all 13 secrets post-apply, including database URL extraction, RSA key generation, rotation procedures, and verification script

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `for_each` over `count` in secrets/container-registry/iam | Named resources survive list reordering; no index-based destroy/recreate |
| Database module creates its own secret separate from secrets module | Auto-managed credential lifecycle vs. operator-managed application secret lifecycle |
| `lifecycle.ignore_changes = [secret_data]` on secret versions | Prevents Terraform from re-writing secrets on subsequent plans; allows out-of-band rotation |
| Backend services use `EXTERNAL_MANAGED` load balancing scheme | Required for Serverless NEG backends (Cloud Run) in the google provider 5.x |
| Separate health checks per backend service stub | Independent health monitoring and alerting granularity |
| DNSSEC enabled on DNS zone | Security best practice; prevents DNS spoofing attacks |
| SSL policy `MODERN` + `TLS_1_2` | Satisfies SOC2/PCI-DSS in-transit encryption requirements |
| Cloud SQL `ZONAL` availability type | db-f1-micro (dev) does not support REGIONAL; upgrade per environment as needed |
| No SA key generation | Cloud Run uses SA identity natively; CI/CD uses WIF; eliminates key rotation burden |

## Resources Created (per environment)

| Resource Type | Count | Notes |
|---|---|---|
| `google_sql_database_instance` | 2 | product + auth |
| `google_sql_database` | 2 | one per instance |
| `google_sql_user` | 2 | one per instance |
| `random_password` | 2 | one per instance |
| `google_secret_manager_secret` | 15 | 2 from db modules + 13 from secrets module |
| `google_secret_manager_secret_version` | 2 | db connection strings (auto-generated) |
| `google_artifact_registry_repository` | 4 | auth, api, mastra, ui |
| `google_service_account` | 5 | auth, api, mastra, ui, cicd |
| `google_secret_manager_secret_iam_member` | ~30+ | per-secret bindings |
| `google_project_iam_member` | ~10 | registry reader/writer, cloud run, cloud sql |
| `google_storage_bucket_iam_member` | 1 | cicd state bucket |
| `google_compute_global_address` | 1 | LB IP |
| `google_compute_managed_ssl_certificate` | 1 | wildcard cert |
| `google_compute_health_check` | 3 | ui, api, auth |
| `google_compute_backend_service` | 3 | stubs |
| `google_compute_url_map` | 2 | HTTPS routing + HTTP redirect |
| `google_compute_target_https_proxy` | 1 | |
| `google_compute_target_http_proxy` | 1 | redirect |
| `google_compute_ssl_policy` | 1 | MODERN/TLS1.2 |
| `google_compute_global_forwarding_rule` | 2 | port 80 + 443 |
| `google_dns_managed_zone` | 1 | public zone |
| `google_dns_record_set` | 4 | app, api, auth + root |

## Manual Steps Required Post-Deployment

1. Enable required GCP APIs (`docs/bootstrap.md` Step 1)
2. Create Terraform state GCS bucket (`docs/bootstrap.md` Step 2)
3. Run `terraform init` with environment-specific backend prefix
4. Run `terraform apply`
5. Populate all 13 secrets following `docs/secret-population.md`
6. Update domain registrar NS records with Cloud DNS name servers
7. Wait for SSL certificate to reach ACTIVE state (10–60 min after DNS delegation)
8. Configure GitLab Workload Identity Federation for the cicd service account

## Rollback Instructions

For dev (deletion_protection = false):
```bash
terraform destroy -var-file="environments/dev.tfvars"
```

For staging/production:
1. First set `deletion_protection = false` in the relevant `.tfvars` file
2. Run `terraform apply -var-file="environments/{env}.tfvars"` to update protection settings
3. Then run `terraform destroy -var-file="environments/{env}.tfvars"`

Cloud SQL instances have a 7-day recovery window after deletion; contact GCP support if accidental deletion occurs in production.

## Pipeline

No pipeline run yet — this is an initial implementation. The GitLab CI/CD pipeline (feature 34) will validate and apply these modules on the next merge request.
