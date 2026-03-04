# Gherkin Specification
## Feature 34: CI/CD Pipeline

**Version:** 1.0
**Date:** 2026-03-03

---

```gherkin
Feature: CI/CD Pipeline with Nx Affected Detection
  As an engineer working in the iExcel Nx monorepo
  I want GitHub Actions workflows to automatically detect which projects changed
  and run per-project lint, type-check, test, and build in CI
  So that broken code is caught before reaching staging or production
  and only the components that changed are built and deployed

  Background:
    Given the Nx monorepo is fully scaffolded (feature 00 is merged)
    And ".github/workflows/ci.yml" exists
    And ".github/workflows/deploy-staging.yml" exists
    And ".github/workflows/deploy-production.yml" exists
    And the GitHub repository has branch protection rules requiring CI to pass on "main"
    And the GitHub repository has a "production" environment with required reviewers configured

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 1: CI Workflow Trigger and Setup
  # ─────────────────────────────────────────────────────────────

  Scenario: Opening a PR triggers the CI workflow
    Given a developer has created a feature branch with changes to "apps/ui/src/"
    When they open a pull request against "main"
    Then the GitHub Actions CI workflow "ci.yml" must start within 60 seconds
    And the workflow must run on "ubuntu-latest"
    And the workflow must check out the repository with "fetch-depth: 0"

  Scenario: Pushing new commits to a PR re-triggers CI and cancels the previous run
    Given a PR is open and its CI workflow is in progress
    When the developer pushes a new commit to the PR branch
    Then the in-progress CI run must be cancelled
    And a new CI run must start for the new commit
    And the new run must use the latest commit as HEAD

  Scenario: CI workflow installs dependencies with the lockfile
    Given the CI workflow has started for a PR
    When the setup phase runs
    Then "pnpm install --frozen-lockfile" must execute
    And the command must exit with code 0
    And "node_modules/" must be populated in the runner workspace

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 2: Nx Affected Detection
  # ─────────────────────────────────────────────────────────────

  Scenario: Nx affected detection identifies the correct projects for a single-app change
    Given a PR contains changes only to "apps/ui/src/components/Dashboard.tsx"
    When the CI workflow runs "nx affected:list --base=origin/main --head=HEAD --plain"
    Then the output must contain "ui"
    And the output must NOT contain "api"
    And the output must NOT contain "auth"
    And the output must NOT contain "mastra"

  Scenario: Nx affected detection cascades through shared-types to all downstream apps
    Given a PR contains changes to "packages/shared-types/src/task.ts"
    When the CI workflow runs "nx affected:list --base=origin/main --head=HEAD --plain"
    Then the output must contain "shared-types"
    And the output must contain "auth"
    And the output must contain "api"
    And the output must contain "mastra"
    And the output must contain "ui"

  Scenario Outline: Nx affected detection respects the dependency graph for package changes
    Given a PR contains changes to "<changed_path>"
    When the CI workflow runs Nx affected detection
    Then the affected list must contain "<expected_projects>"
    And the affected list must NOT contain "<excluded_projects>"

    Examples:
      | changed_path                    | expected_projects              | excluded_projects |
      | packages/api-client/src/        | api-client, ui, mastra         | auth, api         |
      | packages/auth-client/src/       | auth-client, api, ui, mastra   | shared-types      |
      | packages/database/migrations/   | database, api                  | auth, ui, mastra  |
      | packages/auth-database/migrations/ | auth-database, auth         | api, ui, mastra   |
      | apps/api/src/                   | api                            | auth, ui, mastra  |
      | apps/mastra/src/                | mastra                         | auth, api, ui     |

  Scenario: A documentation-only change results in an empty affected list
    Given a PR contains changes only to "README.md"
    When the CI workflow runs Nx affected detection
    Then the affected list must be empty
    And the CI workflow must log "No Nx projects affected by this change"
    And the CI workflow must exit with code 0 (success)
    And no per-project lint, type-check, test, or build steps must run

  Scenario: Terraform changes are detected via the infra project
    Given a PR contains changes to "infra/terraform/modules/networking/main.tf"
    When the CI workflow runs Nx affected detection
    Then the affected list must contain "infra"

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 3: Per-Project CI Steps
  # ─────────────────────────────────────────────────────────────

  Scenario: Each affected app project runs lint, type-check, test, and build in order
    Given the affected list contains "api"
    When the CI workflow executes the per-project steps
    Then "nx run api:lint" must run first
    And "nx run api:type-check" must run second
    And "nx run api:test" must run third
    And "nx run api:build" must run fourth
    And each step must exit with code 0 for the workflow to succeed

  Scenario: A lint failure blocks subsequent steps for that project
    Given the affected list contains "ui"
    And "nx run ui:lint" exits with a non-zero code
    When the CI workflow processes the "ui" project
    Then "nx run ui:type-check" must NOT run for "ui"
    And "nx run ui:test" must NOT run for "ui"
    And "nx run ui:build" must NOT run for "ui"
    And the CI workflow must mark the run as failed

  Scenario: Multiple affected projects run their CI steps in parallel
    Given the affected list contains "ui" and "mastra"
    When the CI workflow executes
    Then "nx run ui:lint" and "nx run mastra:lint" must run concurrently
    And the total wall-clock time must be less than running them sequentially

  Scenario: A failing project does not hide another project's result
    Given the affected list contains "ui" and "api"
    And "nx run ui:lint" exits with a non-zero code
    And "nx run api:lint" exits with code 0
    When the CI workflow completes
    Then the workflow must report "ui" lint as failed
    And the workflow must report "api" lint as passed
    And both results must be visible in the GitHub Actions run summary

  Scenario: Nx Cloud cache produces a cache hit on a repeat run
    Given the CI workflow ran successfully for commit "abc123"
    And no files have changed since that run
    When the CI workflow runs again for the same commit
    Then the Nx task output must contain "[existing outputs match the cache, left as is]"
    And no Nx tasks must re-execute from scratch

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 4: Terraform Plan in CI
  # ─────────────────────────────────────────────────────────────

  Scenario: A PR with .tf file changes triggers a terraform plan step
    Given the affected list contains "infra"
    When the CI workflow executes
    Then a "terraform-plan" job must run
    And "terraform init" must run before "terraform plan"
    And "terraform plan -var-file=environments/staging.tfvars" must execute
    And the plan output must be posted as a comment on the PR

  Scenario: The Terraform plan PR comment contains the plan output
    Given "terraform plan" ran and produced output
    When the PR comment is posted
    Then the comment must contain "## Terraform Plan (staging)"
    And the comment must contain the full plan output inside a collapsible "<details>" block
    And the comment must reference the GitHub Actions run ID

  Scenario: A PR without .tf file changes does not trigger the terraform plan step
    Given the affected list does NOT contain "infra"
    When the CI workflow executes
    Then no "terraform-plan" job must run
    And no Terraform PR comment must be posted

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 5: Dev Deployment on PR
  # ─────────────────────────────────────────────────────────────

  Scenario: A passing CI run triggers a dev deployment step
    Given the affected list contains "api" and "ui"
    And all per-project CI steps passed
    When the CI workflow's deploy-dev job runs
    Then the job must log the stub message for each affected deployable app:
      """
      # Deployment to dev — implemented in feature 35
      """
    And the job must exit with code 0

  Scenario: A failing CI run does not trigger a dev deployment
    Given the affected list contains "api"
    And "nx run api:test" exits with a non-zero code
    When the CI workflow processes the failure
    Then the "deploy-dev" job must NOT run
    And no deployment stub messages must appear in the workflow log

  Scenario: Library packages do not trigger dev deployments
    Given the affected list contains only "shared-types" (not "api", "auth", "ui", or "mastra")
    When the CI workflow runs successfully
    Then the "deploy-dev" job must NOT run for any application
    And the workflow must still succeed overall

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 6: Staging Deployment on Merge to main
  # ─────────────────────────────────────────────────────────────

  Scenario: Merging a PR to main triggers the staging deployment workflow
    Given a PR with changes to "apps/api/src/" has been merged to "main"
    When the push to "main" event fires
    Then the "deploy-staging.yml" workflow must start
    And Nx affected detection must run with "--base=HEAD~1 --head=HEAD"
    And the affected list must contain "api"

  Scenario: Staging deployment includes a migration step when database package is affected
    Given the merge to "main" affected "database" and "api"
    When the staging deployment workflow runs
    Then the "run-product-migrations" step must appear before the "deploy-api" step
    And the "run-product-migrations" step must log:
      """
      # Run product database migrations — implemented in feature 36
      """
    And "deploy-api" must only run after "run-product-migrations" succeeds

  Scenario: Staging deployment includes auth migration step when auth-database is affected
    Given the merge to "main" affected "auth-database" and "auth"
    When the staging deployment workflow runs
    Then the "run-auth-migrations" step must appear before the "deploy-auth" step
    And "deploy-auth" must only run after "run-auth-migrations" succeeds

  Scenario: Multiple affected apps deploy in parallel on staging
    Given the merge to "main" affected "ui" and "mastra"
    And neither "database" nor "auth-database" is affected
    When the staging deployment workflow runs
    Then "deploy-ui" and "deploy-mastra" must run concurrently
    And neither step must block the other

  Scenario: Terraform apply runs on staging when infra is affected on merge to main
    Given the merge to "main" affected "infra"
    When the staging deployment workflow runs
    Then a "terraform-apply-staging" step must run
    And it must log: "# terraform apply for staging — implemented in feature 02/36"
    And this step must run before any application deployment steps

  Scenario: Two simultaneous staging deployments do not run concurrently
    Given one staging deployment is already in progress
    When a second merge to "main" occurs
    Then the second staging deployment must be queued
    And must not start until the first one completes

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 7: Production Promotion
  # ─────────────────────────────────────────────────────────────

  Scenario: No code push triggers the production workflow automatically
    Given the "deploy-production.yml" workflow exists
    When any commit is pushed to any branch including "main"
    Then the production deployment workflow must NOT start automatically
    And the workflow must only start via manual dispatch or manual approval

  Scenario: Production deployment is blocked until an approver approves
    Given a production deployment has been initiated via workflow_dispatch
    When the workflow reaches the job with "environment: production"
    Then the job must pause in "waiting" state
    And a notification must be sent to the configured approvers
    And the job must not proceed until at least one approver clicks "Approve" in the GitHub UI

  Scenario: An approver can reject a production deployment
    Given a production deployment is waiting for approval
    When an approver clicks "Reject" in the GitHub Actions UI
    Then the production deployment workflow must fail
    And the production environment must not be modified

  Scenario: Approved production deployment logs stub messages for each step
    Given a production deployment has been approved
    When the production deployment workflow runs
    Then the workflow must log stub messages for each step:
      """
      # Promote staging image to production registry tag — implemented in feature 35
      # Run database migrations (if applicable) — implemented in feature 36
      # Deploy <app> to production environment — implemented in feature 36
      """
    And the workflow must exit with code 0

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 8: Workflow File Structure and Correctness
  # ─────────────────────────────────────────────────────────────

  Scenario: All three workflow files exist
    Given the repository is scaffolded
    When the developer lists ".github/workflows/"
    Then "ci.yml" must be present
    And "deploy-staging.yml" must be present
    And "deploy-production.yml" must be present

  Scenario: All workflow files are valid YAML
    Given the three workflow files exist
    When a YAML validator runs against each file
    Then all three files must parse without errors
    And GitHub Actions workflow schema validation must pass for each file

  Scenario: No secrets are hard-coded in workflow files
    Given the three workflow files exist
    When the developer searches for credential strings in the files
    Then no API keys, tokens, passwords, or account IDs may appear as literal strings
    And all secret references must use the "${{ secrets.SECRET_NAME }}" syntax

  Scenario: nx.json contains the Nx Cloud tasks runner configuration
    Given the monorepo is scaffolded
    When the developer reads "nx.json"
    Then "tasksRunnerOptions.default.runner" must equal "nx-cloud"
    And "tasksRunnerOptions.default.options.cacheableOperations" must contain "build", "lint", "test", and "type-check"

  Scenario: ci.yml uses fetch-depth 0 for checkout
    Given "ci.yml" exists
    When the developer reads the checkout step
    Then "actions/checkout" must be configured with "fetch-depth: 0"
    And the rationale comment "# Required for nx affected base/head comparison" must be present

  Scenario: deploy-production.yml has no push or pull_request trigger
    Given "deploy-production.yml" exists
    When the developer reads the "on:" trigger block
    Then "push" must NOT appear as a trigger
    And "pull_request" must NOT appear as a trigger
    And only "workflow_dispatch" or manual environment gates must be present as triggers
```
