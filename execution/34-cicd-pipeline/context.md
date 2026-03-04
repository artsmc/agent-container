# Feature 34: CI/CD Pipeline

## Summary
Set up the CI/CD pipeline using GitHub Actions (or Cloud Build/CodePipeline). Nx affected detection determines which projects changed, then runs per-project lint/type-check/test/build steps. Environment promotion flow: PR branches auto-deploy to dev, main auto-deploys to staging, staging promotes to production with a manual approval gate.

## Phase
Phase 8 — CI/CD & Deployment

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding — provides the Nx workspace, project.json files, and `nx affected` capability)
- **Blocks**: 35 (Container Builds — depends on CI/CD pipeline to trigger Docker image builds for affected apps)

## Source PRDs
- `infra-prd.md` — CI/CD Pipeline section (trigger logic, what-triggers-what table, environment promotion, pipeline tooling)

## Relevant PRD Extracts

### Trigger Logic (infra-prd.md)

Every push to `main` (or PR merge) runs through this flow:

```
1. Nx determines affected projects
   └── nx affected:list --base=origin/main~1 --head=HEAD

2. For each affected project:
   ├── Lint
   ├── Type check
   ├── Unit tests
   └── Build

3. If build passes and target is a deployable app:
   ├── Build Docker image
   ├── Push to container registry
   ├── Run database migrations (if packages/database is affected)
   └── Deploy container to target environment

4. If infra/terraform is affected:
   ├── terraform plan (displayed in PR for review)
   └── terraform apply (on merge to main, with approval gate for production)
```

### What Triggers What (infra-prd.md)

| Changed | Builds | Deploys |
|---|---|---|
| `apps/auth/` | auth | auth container |
| `apps/api/` | api | api container |
| `apps/mastra/` | mastra | mastra container |
| `apps/ui/` | ui | ui container |
| `packages/shared-types/` | auth, api, mastra, ui | all four containers |
| `packages/auth-client/` | api, ui, mastra | api + ui + mastra containers |
| `packages/api-client/` | ui, mastra | ui + mastra containers |
| `packages/database/` | api, database migrations | run migrations -> api container |
| `packages/auth-database/` | auth, auth-db migrations | run auth migrations -> auth container |
| `infra/terraform/` | terraform plan | terraform apply (with approval) |

### Environment Promotion (infra-prd.md)

```
PR branch → dev (auto-deploy on PR open)
main       → staging (auto-deploy on merge)
staging    → production (manual promotion with approval gate)
```

### Pipeline Tooling (infra-prd.md)

| Concern | Tool |
|---|---|
| **CI/CD runner** | GitHub Actions (or Cloud Build / CodePipeline depending on cloud choice) |
| **Container registry** | GCR / ECR |
| **Nx caching** | Nx Cloud (remote cache for CI) — avoids rebuilding unchanged projects |
| **Terraform state** | Remote backend (GCS bucket / S3 bucket with state locking via DynamoDB or native) |
| **Secret injection** | Cloud Secret Manager (GCP) / AWS Secrets Manager — referenced in Terraform, injected as env vars at runtime |

### Design Principles (infra-prd.md)

- **Deploy only what changed.** A UI fix should not trigger an API deployment. Nx's affected graph and CI/CD pipeline enforce this.
- **Infrastructure is code.** Every cloud resource is defined in Terraform. No manual console clicks. All changes go through PR review.

### Nx Dependency Graph (infra-prd.md)

**Key relationships:**
- `shared-types` is the root dependency — changes here affect everything downstream.
- `api-client` depends on `shared-types` and is consumed by `ui` and `mastra`.
- `api` depends on `shared-types` and `database` (migration types).
- `ui` depends on `shared-types` and `api-client`.
- `mastra` depends on `shared-types` and `api-client`.
- `infra/terraform` is independent — only triggered by changes to `.tf` files.

## Scope

### In Scope
- GitHub Actions workflow configuration (or Cloud Build/CodePipeline equivalent)
- Nx affected detection step: `nx affected:list --base=origin/main~1 --head=HEAD`
- Per-project pipeline steps: lint, type-check, unit test, build
- Environment promotion logic:
  - PR open/update -> auto-deploy to dev
  - Merge to main -> auto-deploy to staging
  - Staging -> production with manual approval gate
- Terraform plan step on PRs (displayed as PR comment)
- Terraform apply step on merge to main (with approval gate for production)
- Nx Cloud remote cache integration for CI speed
- Pipeline triggers for the what-triggers-what matrix (shared-types changes rebuild all downstream, etc.)
- Database migration trigger when `packages/database/` or `packages/auth-database/` is affected

### Out of Scope
- Docker image building and registry push — that is feature 35 (Container Builds)
- Terraform application deployment modules — that is feature 36 (Terraform App Deployment)
- Terraform base infrastructure modules — that is feature 02 (Terraform Base Infra)
- Actual application code or test content — the pipeline runs whatever lint/test/build targets exist
- Cloud provider final decision — pipeline should be structured to work with either GCP or AWS

## Key Decisions
- **GitHub Actions is the default CI/CD runner.** Cloud Build or CodePipeline are alternatives depending on the cloud provider decision, but GitHub Actions is cloud-agnostic and integrates natively with the GitHub monorepo.
- **Nx affected graph drives selective builds.** Only projects that changed (or whose dependencies changed) are built and deployed. This is enforced by `nx affected` commands, not manual configuration.
- **Three-environment promotion model.** Dev is ephemeral/PR-scoped, staging is the main branch target, production requires a manual approval gate. No direct deploys to production.
- **Terraform plan is a PR review step.** Infrastructure changes are visible in the PR before merge. `terraform apply` only runs after merge, with production requiring explicit approval.
- **Nx Cloud for remote caching.** Avoids rebuilding unchanged projects in CI. Worth evaluating free vs. paid tier for CI speed.
