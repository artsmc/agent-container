# Refined Plan
# Feature 36: Terraform App Deployment

**Status:** Approved
**Complexity:** High (~28 tasks reduced from 33, 6 waves + pre-work spikes)
**Sub-Agent Delegation:** Yes (3 parallel Cloud Run modules in Wave 2)

---

## Scope Reduction

**TR.md Section 2 confirms GCP Cloud Run only.** All AWS ECS/CloudFront tasks removed:
- Removed ~5 AWS-specific tasks (ECS task definitions, ALB config, CloudFront distribution, ECR lifecycle)
- Final count: ~28 tasks across 6 waves

---

## Pre-Condition Gates

| Gate | Status | Impact |
|---|---|---|
| Cloud provider | Resolved (GCP) | Cloud Run + Artifact Registry |
| Feature 02 (base infra) merged | Required | VPC, subnets, Artifact Registry must exist |
| Feature 35 (container builds) merged | Required | Docker images must be pushable before deployment |
| Mastra resource requirements | Unknown | Determines Cloud Run CPU/memory for mastra service |

---

## Wave Structure

### Pre-Work -- Spikes (2 tasks, parallel)

- Spike: Confirm Mastra resource requirements (CPU, memory, concurrency)
- Spike: Confirm CDN/static asset serving strategy for UI

---

### Wave 1 -- Shared Module (4 tasks, sequential)

- Define shared Cloud Run Terraform module (`modules/cloud-run-service/`)
- Variables: `image`, `port`, `env_vars`, `secrets`, `cpu`, `memory`, `min_instances`, `max_instances`
- Outputs: `service_url`, `service_id`
- Health check configuration
- IAM bindings (invoker role)

**Key insight:** TR.md provides complete HCL for the shared module. All 4 app modules instantiate this.

---

### Wave 2 -- App-Specific Modules (3 streams, parallel)

**Sub-agent delegation recommended:**

| Sub-Agent | Scope | Key Config |
|---|---|---|
| Agent A | Auth Cloud Run module | Port 8090, AUTH_DATABASE_URL secret, IDP env vars |
| Agent B | API Cloud Run module | Port 8080, DATABASE_URL secret, service-to-service auth |
| Agent C | Mastra Cloud Run module | Port 8081, API_BASE_URL, LLM_API_KEY secret |

**Note:** UI module depends on CDN spike resolution (Wave Pre-Work), so it may lag.

---

### Wave 3 -- UI Module + CDN (2 tasks)

- UI Cloud Run module (Port 3000, standalone Next.js)
- CDN configuration for static assets (if applicable from spike)

**Depends on:** CDN spike from Pre-Work.

---

### Wave 4 -- Root Composition (3 tasks, sequential)

- Root `main.tf` instantiating all 4 app modules
- Environment-specific `.tfvars` files (dev, staging, production)
- Backend configuration (GCS state bucket)

**Key insight:** TR.md provides complete HCL for root module instantiation.

---

### Wave 5 -- CI/CD Integration (3 tasks, sequential)

- Add `terraform apply` steps to `deploy-staging.yml` (replacing Feature 34 stubs)
- Add `terraform apply` steps to `deploy-production.yml`
- Add migration job execution before app deployment

---

### Wave 6 -- Validation (4 tasks)

- `terraform validate` passes for all environments
- `terraform plan` produces expected resource count
- Security review: no secrets in .tf files, IAM least privilege
- Environment parity check: dev/staging/production structure matches

---

## Incremental Build Strategy

| After Wave | Working State |
|---|---|
| Pre-Work | Spikes resolved, resource requirements known |
| Wave 1 | Shared module ready for instantiation |
| Wave 2 | Auth, API, Mastra deployable to Cloud Run |
| Wave 3 | UI deployable, CDN configured |
| Wave 4 | All 4 apps deployed via single `terraform apply` |
| Wave 5 | CI/CD pipeline deploys automatically |
| Wave 6 | All validations pass |

---

## Key Technical Notes

1. **GCP Cloud Run selected** -- no ECS, no Fargate, no ALB.
2. **Shared module pattern** -- all 4 apps use `modules/cloud-run-service/` with app-specific variables.
3. **Secrets via GCP Secret Manager** -- referenced in Cloud Run env config, not in .tf files.
4. **Environment parity** -- same module structure for dev/staging/production, different `.tfvars`.
5. **Mastra module depends on API module output** -- needs `api_service_url` as env var.
6. **State management** -- GCS backend with per-environment state files.

---

## Path Management

- task_list_file: `execution/36-terraform-app-deployment/docs/task-list.md`
- input_folder: `execution/36-terraform-app-deployment`
- planning_folder: `execution/36-terraform-app-deployment/planning`
