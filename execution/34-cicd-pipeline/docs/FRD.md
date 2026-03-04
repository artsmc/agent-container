# Feature Requirement Document
## Feature 34: CI/CD Pipeline

**Version:** 1.0
**Date:** 2026-03-03
**Phase:** 8 — CI/CD & Deployment
**Status:** Pending

---

## 1. Business Objective

The iExcel automation system comprises four containerized applications and five shared packages in an Nx monorepo. Without a structured CI/CD pipeline, every code change requires manual build, test, and deployment steps that are error-prone, slow, and inconsistent across environments. Developers working on `apps/ui` should not inadvertently skip tests in `apps/api`, and a change to `packages/shared-types` should not silently reach production without validating all four dependent applications.

This feature establishes the automated CI/CD pipeline as GitHub Actions workflows. It is the first deliverable in Phase 8 and a prerequisite for feature 35 (Container Builds), which depends on this pipeline to trigger Docker image builds for affected applications.

---

## 2. Value Proposition

| Without This Feature | With This Feature |
|---|---|
| Every deployment is a manual, error-prone process | All deployments are automated, reproducible, and auditable via GitHub Actions run history |
| Changing `packages/shared-types` may silently break downstream apps | Nx affected detection ensures all downstream dependents are linted, type-checked, tested, and built |
| No gate prevents broken code from reaching staging or production | Per-project lint, type-check, test, and build gates block promotion of failing changes |
| Developers must manually decide what to build and deploy | The Nx dependency graph drives selective builds automatically — only changed projects rebuild |
| Production deployments happen without human review | A manual approval gate on the production environment ensures no accidental production promotion |
| Infrastructure changes are applied without PR visibility | Terraform plan output is posted as a PR comment before any `terraform apply` runs |
| Every PR rebuilds the entire monorepo | Nx Cloud remote cache ensures unchanged projects are never rebuilt in CI |

---

## 3. Target Users

| User | How They Interact With This Feature |
|---|---|
| **Application developer** | Opens a PR and gets per-project lint/type-check/test/build results within minutes. PRs auto-deploy to dev for manual testing. |
| **Reviewer** | Sees Terraform plan output as a PR comment before approving infrastructure changes. |
| **Tech lead / release manager** | Merges to `main` to trigger auto-deployment to staging. Approves the manual promotion gate to advance staging to production. |
| **Infrastructure engineer** | Changes `.tf` files in a PR and sees `terraform plan` output before the PR is merged. After merge, `terraform apply` runs with approval for production. |
| **CI/CD pipeline itself** | Runs `nx affected` to determine what changed, then fans out per-project jobs in parallel. Orchestrates environment promotion across dev → staging → production. |

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| PR CI run completes (lint + type-check + test + build for affected projects) | Pass — no manual intervention required |
| A change to `packages/shared-types` triggers CI for all four downstream apps | Confirmed by Nx affected output listing auth, api, mastra, and ui |
| A change to `apps/ui` only does NOT trigger CI for `apps/api` | Confirmed by Nx affected output listing ui only |
| PR branch auto-deploys to dev after PR open | Deploy to dev completes without error |
| Merge to `main` auto-deploys to staging | Deploy to staging completes without error |
| Production deploy requires explicit manual approval | Promotion from staging to production blocked without approver action |
| `terraform plan` output appears as a PR comment on `.tf` file changes | PR comment posted by GitHub Actions bot |
| Nx Cloud cache hit rate in CI | >80% cache hit rate for unchanged projects on repeat runs |
| Total CI wall-clock time for a single-app change (cache warm) | < 5 minutes end-to-end |

---

## 5. Business Constraints

- **Scope boundary is hard.** Docker image building and registry push are feature 35. This feature wires the pipeline trigger logic and hands off to feature 35's workflows — it does not implement the Docker build steps themselves.
- **Terraform apply is out of scope for production in this feature.** Terraform base infrastructure (feature 02) and Terraform app deployment (feature 36) implement the actual apply steps. This feature wires the plan/apply trigger logic and approval gates.
- **Cloud provider is undecided.** The pipeline must not embed GCP-specific or AWS-specific steps beyond placeholders. Cloud-specific deployment steps are deferred to features 35 and 36.
- **GitHub Actions is the default runner.** The pipeline is written for GitHub Actions. Cloud Build / CodePipeline are alternatives but not implemented in this feature.
- **Feature 00 must be merged first.** The Nx workspace, project.json files, and `nx affected` capability established in feature 00 are prerequisites for everything in this pipeline.

---

## 6. Integration with Product Roadmap

This feature is **Wave 3** of the spec generation roadmap alongside features 07, 08, 09, 22, and 23. It is **Phase 8** of the implementation roadmap.

The CI/CD pipeline created here:

- **Depends on:** Feature 00 (Nx monorepo scaffolding — provides the workspace and `nx affected`)
- **Enables:** Feature 35 (Container Builds — triggered by this pipeline for affected apps) and transitively feature 36 (Terraform App Deployment)
- **Runs against:** All other features (01–33, 37–38) — once merged, all subsequent features benefit from automated CI on every PR

The pipeline is a cross-cutting concern. Every feature merged after this one is automatically covered by the lint/type-check/test/build gates without any per-feature configuration.

---

## 7. Dependencies

| Direction | Features |
|---|---|
| **Blocked by** | 00 (Nx Monorepo Scaffolding) |
| **Blocks** | 35 (Container Builds) |
| **Cross-cutting dependency** | All features 01–33, 37–38 benefit from CI after this merges |

---

## 8. Open Questions

| Question | Impact | Owner |
|---|---|---|
| GCP or AWS as the target cloud provider? | Determines which container registry, secret store, and deployment target to reference in the pipeline | Business / Tech lead |
| Nx Cloud free tier or paid? | Free tier has limited saved runs; paid enables distributed task execution across multiple CI agents | Tech lead |
| Dev environment: ephemeral per-PR or shared persistent? | Ephemeral is cleaner but requires full teardown logic; shared is simpler but risks environment drift | Tech lead |
| Who are the production approvers? | Required to configure the GitHub Environment protection rule | Business / Tech lead |
| Should database migrations run automatically in staging, or require approval? | Failing migrations in staging can block all subsequent staging deploys | Tech lead |
| PR-scoped dev environments — do they need unique subdomains (e.g., `pr-123.dev.domain.com`)? | Affects DNS and load balancer configuration referenced in feature 36 | Tech lead |
