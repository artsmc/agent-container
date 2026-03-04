# Task List
## Feature 34: CI/CD Pipeline

**Version:** 1.0
**Date:** 2026-03-03
**Estimated total complexity:** Medium (2–3 days)

---

## Prerequisites

Before starting, confirm with the tech lead:

- [ ] GitHub Actions is confirmed as the CI/CD runner (default assumption per context.md Key Decisions)
- [ ] Cloud provider decision: GCP or AWS? (affects which credential secrets to configure)
- [ ] Nx Cloud account created at cloud.nx.app and workspace connected to the GitHub repository
- [ ] Nx Cloud tokens retrieved: read-only (for nx.json) and read-write (for CI secret)
- [ ] GitHub Environment protection rule approvers identified for `production`
- [ ] Feature 00 (Nx Monorepo Scaffolding) is merged to `main`

---

## Phase 1: Repository Configuration (no code dependencies)

- [ ] **TASK-001** — Create `.github/workflows/` directory
  - Create the `.github/` directory at the repository root if it does not exist
  - Create `.github/workflows/` inside it
  - References: FRS.md §2
  - Complexity: Small
  - Verify: `ls .github/workflows/` exits with code 0

- [ ] **TASK-002** — Configure GitHub Environments in repository settings (manual step)
  - Navigate to GitHub repository Settings > Environments
  - Create environment `dev` — no required reviewers, allow any branch
  - Create environment `staging` — no required reviewers, deployment branch: `main` only
  - Create environment `production` — required reviewers: [list from tech lead], deployment branch: `main` only
  - References: FRS.md §5 (FR-021), TR.md §4.2–4.4
  - Complexity: Small
  - Verify: All three environments appear in the GitHub Environments settings page

- [ ] **TASK-003** — Configure branch protection rules for `main` (manual step)
  - Navigate to GitHub repository Settings > Branches > Add protection rule for `main`
  - Enable: Require status checks to pass before merging
  - Add required status checks: `ci / Lint, Type-Check, Test, Build`
  - Enable: Require branches to be up to date before merging
  - Enable: Require at least 1 pull request review before merging
  - References: FRS.md §6 (FR-033), TR.md §4.1
  - Complexity: Small
  - Verify: Attempting to push directly to `main` is rejected. A PR without passing CI cannot be merged.

- [ ] **TASK-004** — Configure GitHub Actions secrets (manual step)
  - Navigate to GitHub repository Settings > Secrets and Variables > Actions
  - Add secret: `NX_CLOUD_ACCESS_TOKEN` — value: read-write token from cloud.nx.app
  - Add secret: `TERRAFORM_CREDENTIALS` — value: placeholder (actual value added in feature 02/36)
  - Add secret: `CLOUD_REGISTRY_CREDENTIALS` — value: placeholder (actual value added in feature 35)
  - Add secret: `CLOUD_DEPLOY_CREDENTIALS` — value: placeholder (actual value added in feature 36)
  - Note: `GITHUB_TOKEN` is automatically provided by GitHub — no action required
  - References: FRS.md §6 (FR-031), TR.md §5
  - Complexity: Small
  - Verify: All four secrets appear in the GitHub Actions Secrets list

---

## Phase 2: nx.json Modification (depends on Phase 1 prerequisite: Nx Cloud token)

- [ ] **TASK-010** — Add Nx Cloud tasks runner configuration to nx.json
  - Open `nx.json` at the repository root (created in feature 00)
  - Add the `tasksRunnerOptions` block per TR.md §3.4
  - Replace `PLACEHOLDER_REPLACE_WITH_NX_CLOUD_TOKEN` with the actual read-only Nx Cloud token
  - Preserve all existing fields: `defaultBase`, `namedInputs`, `targetDefaults`
  - References: FRS.md §7 (FR-040), TR.md §3.4, §6
  - Complexity: Small
  - Verify: `nx show projects` still exits with code 0. `cat nx.json | python3 -m json.tool` parses without error.

---

## Phase 3: CI Workflow (depends on Phase 1 and 2)

- [ ] **TASK-020** — Create `.github/workflows/ci.yml` — `detect-affected` job
  - Create the file with the `name`, `on`, `concurrency`, and `env` blocks per TR.md §3.1
  - Implement the `detect-affected` job with all steps:
    - `actions/checkout@v4` with `fetch-depth: 0`
    - `pnpm/action-setup@v3` with version 9
    - `actions/setup-node@v4` with Node.js 22 and pnpm cache
    - `pnpm install --frozen-lockfile`
    - `git fetch origin main || true`
    - Nx affected detection shell script per TR.md §3.1
  - Define all job outputs: `affected`, `has-affected`, `affected-apps`, `has-infra`, `has-database`, `has-auth-database`
  - References: FRS.md §3 (FR-001, FR-002), TR.md §3.1, §7
  - Complexity: Medium
  - Verify: The workflow file is valid YAML. The `detect-affected` job completes without error when run against a test PR.

- [ ] **TASK-021** — Add `ci` job to `ci.yml`
  - Add the `ci` job after `detect-affected` with `needs: detect-affected`
  - Add `if: needs.detect-affected.outputs.has-affected == 'true'`
  - Include the same five setup steps as `detect-affected` (checkout, pnpm, node, cache, install)
  - Add `git fetch origin main || true` step
  - Add four `nx affected` run steps in order: lint, type-check, test, build
  - Use `--parallel=3` flag on all four steps per TR.md §7
  - References: FRS.md §3 (FR-004), TR.md §3.1, §7
  - Complexity: Small
  - Verify: A PR with a TypeScript lint error causes the `ci` job to fail on the lint step. A clean PR passes all four steps.

- [ ] **TASK-022** — Add `terraform-plan` job to `ci.yml`
  - Add the `terraform-plan` job with `needs: detect-affected`
  - Add `if: needs.detect-affected.outputs.has-infra == 'true'`
  - Include checkout step (no `fetch-depth: 0` required — just needs the current state of the repo)
  - Add `hashicorp/setup-terraform@v3` with `terraform_version: "1.9"`
  - Add `terraform init -backend=false` step with `working-directory: infra/terraform`
  - Add `terraform plan -var-file=environments/staging.tfvars -no-color 2>&1 | tee plan-output.txt` step
  - Add `actions/github-script@v7` step to post plan output as PR comment per TR.md §3.1
  - References: FRS.md §3 (FR-005), TR.md §3.1
  - Complexity: Medium
  - Verify: A PR that modifies a `.tf` file results in a PR comment containing the Terraform plan output. A PR without `.tf` changes shows no Terraform job in the workflow run.

- [ ] **TASK-023** — Add `deploy-dev` job to `ci.yml`
  - Add the `deploy-dev` job with `needs: [detect-affected, ci]`
  - Add `if: needs.detect-affected.outputs.affected-apps != '' && needs.ci.result == 'success'`
  - Add single step that loops over `needs.detect-affected.outputs.affected-apps` and logs the stub message per FRS.md FR-007
  - References: FRS.md §3 (FR-007), TR.md §3.1
  - Complexity: Small
  - Verify: A PR with passing CI shows the `deploy-dev` job completing with stub messages in the log. A PR with failing CI shows `deploy-dev` as skipped.

---

## Phase 4: Staging Deployment Workflow (depends on Phase 3)

- [ ] **TASK-030** — Create `.github/workflows/deploy-staging.yml` — `detect-affected` job
  - Create the file with `name`, `on` (push to main + workflow_call), `concurrency`, and `env` blocks
  - Implement the `detect-affected` job with the same five setup steps as ci.yml
  - Use `--base=HEAD~1 --head=HEAD` for the affected detection command (staging-specific)
  - Define the same job outputs as ci.yml's `detect-affected`
  - References: FRS.md §4 (FR-010, FR-011), TR.md §3.2, §7
  - Complexity: Medium
  - Verify: Valid YAML. The `detect-affected` job completes after merging a test PR to `main`.

- [ ] **TASK-031** — Add `terraform-apply-staging` stub job to `deploy-staging.yml`
  - Add job with `needs: detect-affected`
  - Add `if: needs.detect-affected.outputs.has-infra == 'true'`
  - Add single step logging stub message per FRS.md FR-014
  - References: FRS.md §4 (FR-014), TR.md §3.2
  - Complexity: Small
  - Verify: A merge to `main` that includes `.tf` file changes shows `terraform-apply-staging` in the workflow run.

- [ ] **TASK-032** — Add `run-product-migrations` stub job to `deploy-staging.yml`
  - Add job with `needs: [detect-affected, terraform-apply-staging]`
  - Add `if: always() && has-database == 'true' && terraform-apply-staging result is success or skipped`
  - Add single step logging stub message per FRS.md FR-012
  - References: FRS.md §4 (FR-012), TR.md §3.2
  - Complexity: Small
  - Verify: A merge that changes `packages/database/migrations/` shows `run-product-migrations` before `deploy-apps`.

- [ ] **TASK-033** — Add `run-auth-migrations` stub job to `deploy-staging.yml`
  - Add job with `needs: [detect-affected, terraform-apply-staging]`
  - Add `if: always() && has-auth-database == 'true' && terraform-apply-staging result is success or skipped`
  - Add single step logging stub message per FRS.md FR-012
  - References: FRS.md §4 (FR-012), TR.md §3.2
  - Complexity: Small
  - Verify: A merge that changes `packages/auth-database/migrations/` shows `run-auth-migrations` in the workflow.

- [ ] **TASK-034** — Add `deploy-apps` stub job to `deploy-staging.yml`
  - Add job with `needs: [detect-affected, run-product-migrations, run-auth-migrations]`
  - Add `if: always() && affected-apps is non-empty && both migration jobs succeeded or were skipped`
  - Add step that loops over affected apps and logs stub messages for Docker build, push, and deploy per FRS.md FR-013
  - References: FRS.md §4 (FR-013), TR.md §3.2
  - Complexity: Small
  - Verify: A merge that changes `packages/shared-types` shows all four apps listed in the `deploy-apps` step's log output.

---

## Phase 5: Production Promotion Workflow (depends on Phase 4 + TASK-002)

- [ ] **TASK-040** — Create `.github/workflows/deploy-production.yml`
  - Create the file with `name` and `on: workflow_dispatch` trigger only (no push/pull_request triggers)
  - Add `workflow_dispatch` inputs: `apps` (optional) and `confirm` (required, must equal "DEPLOY")
  - Add `concurrency: group: deploy-production, cancel-in-progress: false`
  - Add `validate-input` job that checks `confirm == 'DEPLOY'` and fails if not
  - Add `deploy-production` job with `needs: validate-input` and `environment: production`
  - Add step that loops over apps (from input or defaults to all four) and logs stub messages per FRS.md FR-022
  - References: FRS.md §5 (FR-020, FR-021, FR-022, FR-023), TR.md §3.3
  - Complexity: Medium
  - Verify: Manually triggering the workflow without typing "DEPLOY" in the confirm input causes the `validate-input` job to fail. Triggering with "DEPLOY" causes the workflow to pause at the `deploy-production` job awaiting approval.

---

## Phase 6: Validation (depends on Phases 1–5)

- [ ] **TASK-050** — Validate all three workflow files with YAML linter
  - Run a YAML validator (e.g., `yamllint .github/workflows/`) against all three files
  - All three files must parse without errors
  - References: GS.md "All workflow files are valid YAML"
  - Complexity: Small
  - Verify: Zero YAML errors reported

- [ ] **TASK-051** — Validate GitHub Actions workflow schema
  - Use `actionlint` (https://github.com/rhysd/actionlint) to validate all three workflow files
  - Install: `go install github.com/rhysd/actionlint/cmd/actionlint@latest`
  - Run: `actionlint .github/workflows/*.yml`
  - All three files must pass schema validation
  - References: GS.md "GitHub Actions workflow schema validation must pass"
  - Complexity: Small
  - Verify: Zero `actionlint` errors reported

- [ ] **TASK-052** — Verify nx.json is valid after modification
  - Run `nx show projects` — must exit with code 0
  - Run `cat nx.json | python3 -m json.tool` — must parse without error
  - Run `npx nx affected:list --base=HEAD --head=HEAD --plain` — must exit without error (empty list is fine)
  - References: FRS.md §7 (FR-040), GS.md "nx.json contains the Nx Cloud tasks runner configuration"
  - Complexity: Small
  - Verify: All three commands exit with code 0

- [ ] **TASK-053** — Verify no secrets are hard-coded in workflow files
  - Run a search for common credential patterns in all three workflow files
  - Command: `grep -rn --include="*.yml" -E "(token|key|secret|password|credential)" .github/workflows/ | grep -v "secrets\." | grep -v "#"`
  - No matches should appear (all credentials must use `${{ secrets.* }}`)
  - References: FRS.md §6 (FR-031), GS.md "No secrets are hard-coded in workflow files"
  - Complexity: Small
  - Verify: Zero matches from the grep command (excluding legitimate `secrets.*` references and comments)

- [ ] **TASK-054** — End-to-end test: open a PR against main and verify CI runs
  - Create a test branch with a trivial change to `apps/ui/src/` (e.g., add a comment line)
  - Open a PR against `main`
  - Verify: The `ci.yml` workflow triggers within 60 seconds
  - Verify: The `detect-affected` job outputs `ui` in the affected list
  - Verify: The `ci` job runs lint, type-check, test, and build for `ui` only
  - Verify: The `deploy-dev` job runs and logs the stub message for `ui`
  - Verify: The `terraform-plan` job is skipped (no `.tf` files changed)
  - References: GS.md Scenario Group 1, Group 2, Group 5
  - Complexity: Medium
  - Verify: All checks pass and match expected behavior above

- [ ] **TASK-055** — End-to-end test: merge the test PR and verify staging deployment workflow
  - Merge the test PR from TASK-054 to `main`
  - Verify: The `deploy-staging.yml` workflow triggers
  - Verify: Nx affected detection uses `--base=HEAD~1 --head=HEAD` and produces `ui`
  - Verify: No migration jobs run (database packages not affected)
  - Verify: The `deploy-apps` job logs the stub messages for `ui`
  - References: GS.md Scenario Group 6
  - Complexity: Medium
  - Verify: All staging workflow jobs complete with code 0

- [ ] **TASK-056** — End-to-end test: verify production workflow requires manual trigger and approval
  - Navigate to the GitHub Actions tab and manually trigger `deploy-production.yml` via workflow_dispatch
  - Test 1: Enter "CONFIRM" (wrong value) in the confirm input — verify `validate-input` fails
  - Test 2: Enter "DEPLOY" in the confirm input — verify workflow pauses at `deploy-production` awaiting approval
  - Approve the deployment — verify stub messages appear in the log
  - References: GS.md Scenario Group 7, FRS.md §5 (FR-020, FR-021)
  - Complexity: Medium
  - Verify: Behavior matches GS.md scenarios exactly

---

## Phase 7: Commit (depends on Phase 6 — all validations passing)

- [ ] **TASK-060** — Create the feature commit
  - Stage the following files:
    - `.github/workflows/ci.yml`
    - `.github/workflows/deploy-staging.yml`
    - `.github/workflows/deploy-production.yml`
    - `nx.json` (modified to add tasksRunnerOptions)
  - Write commit message: `feat(cicd): add GitHub Actions CI/CD pipeline with Nx affected detection and environment promotion`
  - Complexity: Small
  - Verify: `git show --stat HEAD` lists exactly the four files above

---

## Completion Checklist

Before marking this feature as done, verify:

- [ ] `.github/workflows/ci.yml` exists and passes `actionlint` validation
- [ ] `.github/workflows/deploy-staging.yml` exists and passes `actionlint` validation
- [ ] `.github/workflows/deploy-production.yml` exists and passes `actionlint` validation
- [ ] `nx.json` contains `tasksRunnerOptions` with Nx Cloud runner
- [ ] GitHub `production` environment has required reviewers configured
- [ ] GitHub `staging` and `dev` environments exist with correct branch restrictions
- [ ] GitHub branch protection rules require CI to pass on `main`
- [ ] All four GitHub Actions secrets are set (even if placeholder values for feature 35/36)
- [ ] End-to-end CI test (TASK-054) passed
- [ ] End-to-end staging test (TASK-055) passed
- [ ] End-to-end production approval test (TASK-056) passed
- [ ] No secrets are hard-coded in any workflow file

---

## Unblocking Downstream Features After Merge

Once this feature merges to `main`, the following features can begin immediately:

| Feature | What This Enables |
|---|---|
| 35 — container-builds | Can add Docker build steps to `ci.yml` and `deploy-staging.yml` (the stub placeholders are ready to be replaced) |
| 36 — terraform-app-deployment | Can replace the stub deploy steps in `deploy-staging.yml` and `deploy-production.yml` with actual Terraform apply commands |
| All other features (01–33, 37–38) | Every PR now automatically runs lint, type-check, test, and build for affected projects |
