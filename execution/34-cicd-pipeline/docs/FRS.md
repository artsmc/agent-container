# Functional Requirement Specification
## Feature 34: CI/CD Pipeline

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Overview

This document defines the precise functional requirements for the GitHub Actions CI/CD pipeline. The pipeline consists of three workflow files: a CI workflow (runs on every PR), a staging deployment workflow (runs on merge to `main`), and a production promotion workflow (runs manually or via staging approval gate). All workflow files live under `.github/workflows/` and integrate with the Nx workspace established in feature 00.

---

## 2. Repository Structure

The following files must be created by this feature:

```
.github/
└── workflows/
    ├── ci.yml                  # PR CI: Nx affected detection + per-project checks
    ├── deploy-staging.yml      # Staging deployment on merge to main
    └── deploy-production.yml   # Production promotion with manual approval gate
```

No application code, Dockerfiles, or Terraform resources are modified by this feature.

---

## 3. CI Workflow (ci.yml)

### FR-001: Trigger Conditions

**Requirement:** The CI workflow must trigger on the following GitHub events:

| Event | Condition |
|---|---|
| `pull_request` | Opened, reopened, or synchronize (new commits pushed to PR) |
| `push` | Not triggered by push — staging handles push to `main` |

**Branches in scope:** Any branch with an open PR. No branch filtering on `pull_request` event (all PRs trigger CI).

**Acceptance:** Opening a PR against any branch triggers the CI workflow. Pushing commits to an open PR re-triggers it.

---

### FR-002: Nx Affected Detection Step

**Requirement:** The CI workflow must include a dedicated step that determines which Nx projects are affected by the PR's changes.

**Command:**
```bash
npx nx affected:list --base=origin/main --head=HEAD --plain
```

**Output format:** A space-separated or newline-separated list of affected project names (e.g., `api shared-types`).

**Implementation requirements:**
- The base ref must be `origin/main` (not `HEAD~1`) when running against a PR, so that the diff is computed from the PR target branch.
- The affected list must be captured as a GitHub Actions output variable for use by downstream jobs.
- If no projects are affected (e.g., documentation-only change), the workflow must exit successfully without running any per-project jobs.

**Acceptance:** A PR that modifies only `apps/ui/src/` produces an affected list containing `ui` and no other app projects.

---

### FR-003: Nx Dependency Graph — What Triggers What

**Requirement:** The pipeline must rely entirely on the Nx dependency graph (via `nx affected`) to determine which projects to build and check. No manual project-to-path mappings are maintained in the workflow files.

**Expected behavior based on the dependency graph:**

| File Changed | Affected Projects (Nx computes this) |
|---|---|
| `apps/auth/` | `auth` |
| `apps/api/` | `api` |
| `apps/mastra/` | `mastra` |
| `apps/ui/` | `ui` |
| `packages/shared-types/` | `shared-types`, `auth`, `api`, `mastra`, `ui` |
| `packages/auth-client/` | `auth-client`, `api`, `ui`, `mastra` |
| `packages/api-client/` | `api-client`, `ui`, `mastra` |
| `packages/database/` | `database`, `api` |
| `packages/auth-database/` | `auth-database`, `auth` |
| `infra/terraform/` | `infra` |

**Acceptance:** Nx affected detection — not hard-coded path matching — drives this behavior. The workflow must not contain `if: contains(files, 'apps/auth')` style conditionals.

---

### FR-004: Per-Project CI Steps

**Requirement:** For each affected project (excluding `infra`), the following steps must run in order:

1. **Lint** — `nx run <project>:lint`
2. **Type-check** — `nx run <project>:type-check`
3. **Unit tests** — `nx run <project>:test`
4. **Build** — `nx run <project>:build`

**Parallelism:** Multiple affected projects must run their CI steps in parallel using GitHub Actions matrix strategy or by using `nx affected` run-many commands.

**Preferred command for parallel execution:**
```bash
npx nx affected --target=lint --base=origin/main --head=HEAD --parallel=3
npx nx affected --target=type-check --base=origin/main --head=HEAD --parallel=3
npx nx affected --target=test --base=origin/main --head=HEAD --parallel=3
npx nx affected --target=build --base=origin/main --head=HEAD --parallel=3
```

**Ordering:** Lint and type-check may run in parallel with each other. Tests must run after type-check passes. Build must run after tests pass.

**Failure behavior:** If any step fails for any project, the CI workflow must fail and block PR merge.

**Acceptance:** A failing lint in `apps/api` blocks PR merge. A passing lint in `apps/api` does not prevent an independent lint failure in `apps/ui` from also being reported.

---

### FR-005: Terraform Plan Step

**Requirement:** If `infra` is in the affected list (i.e., any `.tf` file changed), the CI workflow must run `terraform plan` and post the output as a PR comment.

**Steps:**
1. Detect if `infra` is in the affected list.
2. Set up Terraform CLI (via `hashicorp/setup-terraform` GitHub Action).
3. Run `terraform init -backend=false` (backend-less init for plan-only validation in CI).
4. Run `terraform plan -var-file=environments/staging.tfvars -out=tfplan`.
5. Capture the plan output.
6. Post the plan output as a PR comment using the `actions/github-script` action or equivalent.

**PR comment format:**
```
## Terraform Plan (staging)

<details><summary>Show Plan</summary>

```
<terraform plan output here>
```

</details>

Plan generated by GitHub Actions run #<run_id>
```

**Acceptance:** A PR that modifies `infra/terraform/main.tf` results in a PR comment containing the Terraform plan output. A PR that does not modify `.tf` files does not trigger the Terraform step.

---

### FR-006: Nx Cloud Remote Cache Integration

**Requirement:** The CI workflow must connect to Nx Cloud for remote task result caching.

**Implementation:**
- Set the `NX_CLOUD_ACCESS_TOKEN` environment variable from a GitHub Actions secret (`secrets.NX_CLOUD_ACCESS_TOKEN`).
- Nx Cloud connection is configured in `nx.json` via `tasksRunnerOptions` (added by this feature — see TR.md §3.2).
- Do not enable distributed task execution (DTE) in the initial implementation — remote caching only.

**Acceptance:** A second CI run on the same commit (e.g., after a re-run) shows cache hits for all previously-computed tasks. `nx affected` output shows `[existing outputs match the cache, left as is]` for cached tasks.

---

### FR-007: PR Dev Deployment Trigger

**Requirement:** Upon successful CI completion (all lint/type-check/test/build steps pass), the CI workflow must trigger a deployment to the dev environment for the affected deployable applications.

**Deployable applications** (as opposed to library packages): `auth`, `api`, `mastra`, `ui`.

**Implementation:**
- After the CI jobs complete, add a job `deploy-dev` that runs only if the CI jobs succeeded.
- This job calls the `deploy-staging.yml` workflow (reusable workflow) with `environment: dev` and the list of affected deployable apps.
- The actual deployment steps (Docker build, push, service update) are **stubs** in this feature — they call into feature 35's container build workflow, which is not yet implemented. The stub must output a clear log message: `# Deployment to dev — implemented in feature 35`.

**Acceptance:** A PR with passing CI results in a `deploy-dev` job that runs and logs the stub message. No error or failure is produced by the stub.

---

## 4. Staging Deployment Workflow (deploy-staging.yml)

### FR-010: Trigger Conditions

**Requirement:** The staging deployment workflow must trigger on:

| Event | Condition |
|---|---|
| `push` | Branch `main` only |
| `workflow_call` | Called by `ci.yml` deploy-dev job (with environment override) |

**Acceptance:** Merging a PR to `main` triggers the staging deployment workflow automatically.

---

### FR-011: Staging Affected Detection

**Requirement:** The staging workflow must re-run Nx affected detection using the merge commit as the head and the previous `main` commit as the base.

**Command:**
```bash
npx nx affected:list --base=HEAD~1 --head=HEAD --plain
```

**Rationale:** On `push` to `main`, `HEAD~1` is the previous commit on main (before the merge). This correctly identifies what changed in the merged PR.

**Acceptance:** Merging a PR that changed only `apps/ui` results in an affected list of `ui` only, not all projects.

---

### FR-012: Database Migration Step

**Requirement:** If `packages/database` is in the affected list, the staging workflow must run database migrations before deploying `apps/api`.

**Steps (stub — actual implementation in feature 35/36):**
1. Detect if `database` is in the affected list.
2. Log: `# Run product database migrations — implemented in feature 36`.
3. Block `apps/api` deployment until migration step completes.

**Requirement:** If `packages/auth-database` is in the affected list, the staging workflow must run auth database migrations before deploying `apps/auth`.

**Steps (stub):**
1. Detect if `auth-database` is in the affected list.
2. Log: `# Run auth database migrations — implemented in feature 36`.
3. Block `apps/auth` deployment until migration step completes.

**Acceptance:** A PR that modifies `packages/database/migrations/` results in the migration step appearing in the staging workflow before the api deployment step.

---

### FR-013: Staging App Deployment

**Requirement:** After migrations (if any), deploy each affected deployable application to staging.

**Deployable applications:** `auth`, `api`, `mastra`, `ui`.

**Steps (stub):**
```
# Build Docker image for <app> — implemented in feature 35
# Push image to GCP Artifact Registry — implemented in feature 35
# Deploy <app> to Cloud Run (staging) — implemented in feature 36
```

**Parallelism:** Multiple affected apps must deploy in parallel where there are no migration dependencies. `api` and `auth` must wait for their respective migration steps. `ui` and `mastra` have no migration dependencies and may deploy in parallel with each other and with `auth`/`api` (after their migrations).

**Acceptance:** A PR modifying `packages/shared-types` (which affects all four apps) results in four parallel stub deployment steps in the staging workflow.

---

### FR-014: Terraform Apply on Main (staging)

**Requirement:** If `infra` is in the affected list on merge to `main`, run `terraform apply` against the staging environment.

**Steps (stub):**
1. Detect if `infra` is in the affected list.
2. Log: `# terraform apply for staging — implemented in feature 02/36`.
3. This step must run BEFORE app deployments that depend on infrastructure changes.

**Acceptance:** A PR modifying `.tf` files results in a `terraform-apply-staging` step appearing in the staging workflow before app deployment steps.

---

## 5. Production Promotion Workflow (deploy-production.yml)

### FR-020: Trigger Conditions

**Requirement:** The production deployment workflow must trigger only via:

| Trigger | Mechanism |
|---|---|
| Manual approval gate | GitHub Environment protection rule on the `production` environment requiring approver sign-off |
| `workflow_dispatch` | Manual trigger from the GitHub Actions UI, with input for which apps to promote |

**Requirement:** The production workflow must NOT trigger automatically on any git event. There must be no `push` or `pull_request` trigger.

**Acceptance:** No code push to any branch triggers the production workflow automatically.

---

### FR-021: GitHub Environment Protection Rule

**Requirement:** A GitHub Environment named `production` must be configured with:
- **Required reviewers:** At least one approver must approve before the job runs.
- **Wait timer:** Optional (configurable per project preference).
- **Deployment branch restriction:** Only `main` branch can deploy to `production`.

**Implementation note:** GitHub Environment protection rules are configured in the GitHub repository settings (not in workflow YAML). The workflow YAML references the environment by name: `environment: production`. This feature's task list includes the manual step to configure the environment in GitHub settings.

**Acceptance:** A workflow job with `environment: production` is blocked in "waiting" state until an approver clicks "Approve" in the GitHub Actions UI.

---

### FR-022: Production Deployment Steps

**Requirement:** The production workflow must deploy the same artifacts (Docker images) that were deployed to staging — not rebuild from source.

**Steps (stub):**
```
# Promote staging image to production tag in Artifact Registry — implemented in feature 35
# Run database migrations (if applicable) — implemented in feature 36
# Deploy <app> to Cloud Run (production) — implemented in feature 36
# terraform apply for production (if infra changed) — implemented in feature 02/36
```

**Acceptance:** The production workflow logs stub messages for each step. No actual deployment occurs in this feature's implementation.

---

### FR-023: Production Terraform Apply Gate

**Requirement:** If infrastructure changes are included in the production deployment, a separate `terraform apply -var-file=environments/production.tfvars` step must run with its own approval gate, distinct from the application approval gate.

**Stub:** Log `# terraform apply for production — requires separate approval — implemented in feature 02/36`.

---

## 6. Shared Workflow Requirements

### FR-030: GitHub Actions Runner Configuration

**Requirement:** All workflow jobs must run on `ubuntu-latest` GitHub-hosted runners.

**Requirement:** All workflows must use the following shared setup steps in order:

1. `actions/checkout@v4` with `fetch-depth: 0` (required for `nx affected` base/head comparison)
2. `actions/setup-node@v4` with the Node.js version matching `.nvmrc` or `package.json` engines field (Node.js 22)
3. `pnpm/action-setup@v3` to install pnpm (version from `packageManager` field in `package.json`)
4. `actions/cache@v4` for the pnpm store directory
5. `pnpm install --frozen-lockfile` to install dependencies

**Acceptance:** All three workflow files contain these five setup steps in order.

---

### FR-031: Secret Requirements

**Requirement:** The following GitHub Actions secrets must be documented and referenced in the workflows:

| Secret Name | Used By | Purpose |
|---|---|---|
| `NX_CLOUD_ACCESS_TOKEN` | All workflows | Nx Cloud remote cache authentication |
| `TERRAFORM_CREDENTIALS` | ci.yml, deploy-staging.yml, deploy-production.yml | Terraform backend authentication (GCS via GCP service account) |
| `GITHUB_TOKEN` | ci.yml | PR comment posting (automatically provided by GitHub) |
| `GCP_SA_KEY` | deploy-staging.yml, deploy-production.yml | GCP service account key for Artifact Registry authentication and Cloud Run deployment (stub reference) |

**Acceptance:** All secrets are referenced via `${{ secrets.SECRET_NAME }}` and are documented in `TR.md §5`. No secret values are hard-coded in workflow YAML.

---

### FR-032: Workflow Concurrency Control

**Requirement:** Each workflow must define a `concurrency` group to prevent multiple simultaneous runs from interfering.

**ci.yml concurrency:**
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**deploy-staging.yml concurrency:**
```yaml
concurrency:
  group: deploy-staging
  cancel-in-progress: false
```

**deploy-production.yml concurrency:**
```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

**Rationale:** CI runs for a PR cancel previous runs when new commits are pushed (saves CI minutes). Deployment workflows must NOT cancel in-progress runs — a partial deployment is worse than a queued one.

**Acceptance:** Pushing two commits to a PR in rapid succession results in only one CI run completing (the second one cancels the first). Two simultaneous staging deploys do not run concurrently.

---

### FR-033: Workflow Status Reporting

**Requirement:** All workflows must report job status via GitHub's native commit status checks. No additional status reporting tools are required in this feature.

**Required status checks (to be configured as branch protection rules):**
- `ci / lint-type-check-test-build` — must pass before PR merge is allowed
- `ci / terraform-plan` — required if `.tf` files changed

**Acceptance:** The GitHub repository's branch protection rules for `main` require the CI workflow checks to pass before allowing merge.

---

## 7. nx.json Modification

### FR-040: Nx Cloud Tasks Runner Configuration

**Requirement:** This feature must add the Nx Cloud tasks runner configuration to `nx.json` (established as empty in feature 00).

**Addition to nx.json:**
```json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx-cloud",
      "options": {
        "cacheableOperations": ["build", "lint", "test", "type-check"],
        "accessToken": "PLACEHOLDER_REPLACE_WITH_NX_CLOUD_TOKEN"
      }
    }
  }
}
```

**Note:** The access token placeholder must be replaced with the actual Nx Cloud token during project setup. The token referenced in `nx.json` is a read-only public token (Nx Cloud allows this pattern). The `NX_CLOUD_ACCESS_TOKEN` environment variable in CI overrides this for authenticated cache writes.

**Acceptance:** `nx show projects` still exits with code 0 after nx.json is modified. CI runs show cache hits after the first run populates the cache.

---

## 8. Error Handling and Edge Cases

### FR-050: Empty Affected List

**Requirement:** If `nx affected:list` returns an empty list (e.g., a documentation-only change to a non-Nx-tracked file), the CI workflow must:
1. Log a message: `No Nx projects affected by this change. Skipping per-project CI steps.`
2. Exit with code 0 (success).
3. NOT trigger the dev deployment step.

**Acceptance:** A PR that modifies only `README.md` results in a passing CI run with no per-project steps executed.

---

### FR-051: Partial Failure Isolation

**Requirement:** If `apps/ui` lint fails and `apps/api` lint passes in the same CI run, both results must be visible in the PR. The failure of `ui` lint must not prevent `api` lint from reporting its result.

**Acceptance:** The CI run shows two separate job statuses: one failed (ui lint) and one passed (api lint), visible independently in the GitHub Actions UI.

---

### FR-052: Nx Affected Base Ref for Initial PRs

**Requirement:** For PRs where `origin/main` does not yet exist (first PR to an empty repository), the workflow must gracefully fall back to treating all projects as affected.

**Fallback command:**
```bash
git fetch origin main || true
npx nx affected:list --base=origin/main --head=HEAD --plain 2>/dev/null || \
  npx nx show projects --plain
```

**Acceptance:** The first PR to the repository successfully runs CI against all projects even when `origin/main` does not exist.
