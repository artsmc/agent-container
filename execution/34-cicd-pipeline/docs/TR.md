# Technical Requirements
## Feature 34: CI/CD Pipeline

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Technology Stack

| Concern | Tool | Version / Notes |
|---|---|---|
| CI/CD runner | GitHub Actions | Built-in to GitHub; no external runner setup required |
| Runner OS | `ubuntu-latest` | GitHub-hosted runner (Ubuntu 22.04 or later) |
| Build system | Nx | 20.x (installed via monorepo devDependencies from feature 00) |
| Remote cache | Nx Cloud | Free or paid tier; configured via `nx.json` |
| Package manager | pnpm | 9.x (matches feature 00 decision) |
| Node.js | 22 LTS | Matches feature 00 engine constraint |
| IaC tool | Terraform | 1.9.x (via `hashicorp/setup-terraform` GitHub Action) |
| PR commenting | `actions/github-script` | v7 — used to post Terraform plan output as PR comment |

---

## 2. File Inventory

All files created or modified by this feature:

```
.github/
└── workflows/
    ├── ci.yml                  # New — PR CI workflow
    ├── deploy-staging.yml      # New — Staging deployment on merge to main
    └── deploy-production.yml   # New — Production promotion with approval gate

nx.json                         # Modified — add tasksRunnerOptions for Nx Cloud
```

No other files are modified by this feature.

---

## 3. Workflow File Specifications

### 3.1 ci.yml — Full Structure

```yaml
name: CI

on:
  pull_request:
    types: [opened, reopened, synchronize]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}

jobs:
  # ──────────────────────────────────────────────────────────────
  # JOB: detect-affected
  # Determines which Nx projects are affected by this PR.
  # ──────────────────────────────────────────────────────────────
  detect-affected:
    name: Detect Affected Projects
    runs-on: ubuntu-latest
    outputs:
      affected: ${{ steps.affected.outputs.projects }}
      has-affected: ${{ steps.affected.outputs.has-affected }}
      affected-apps: ${{ steps.affected.outputs.apps }}
      has-infra: ${{ steps.affected.outputs.has-infra }}
      has-database: ${{ steps.affected.outputs.has-database }}
      has-auth-database: ${{ steps.affected.outputs.has-auth-database }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for nx affected base/head comparison

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Fetch main branch
        run: git fetch origin main || true

      - name: Determine affected projects
        id: affected
        run: |
          # Get affected project list, fall back to all projects if main doesn't exist
          AFFECTED=$(npx nx affected:list --base=origin/main --head=HEAD --plain 2>/dev/null || npx nx show projects --plain)

          if [ -z "$AFFECTED" ]; then
            echo "No Nx projects affected by this change. Skipping per-project CI steps."
            echo "has-affected=false" >> $GITHUB_OUTPUT
            echo "projects=" >> $GITHUB_OUTPUT
            echo "apps=" >> $GITHUB_OUTPUT
            echo "has-infra=false" >> $GITHUB_OUTPUT
            echo "has-database=false" >> $GITHUB_OUTPUT
            echo "has-auth-database=false" >> $GITHUB_OUTPUT
            exit 0
          fi

          echo "Affected projects: $AFFECTED"
          echo "has-affected=true" >> $GITHUB_OUTPUT
          echo "projects=$AFFECTED" >> $GITHUB_OUTPUT

          # Identify deployable apps in affected list
          APPS=""
          for APP in auth api mastra ui; do
            if echo "$AFFECTED" | grep -qw "$APP"; then
              APPS="$APPS $APP"
            fi
          done
          echo "apps=$(echo $APPS | xargs)" >> $GITHUB_OUTPUT

          # Flag infra changes
          if echo "$AFFECTED" | grep -qw "infra"; then
            echo "has-infra=true" >> $GITHUB_OUTPUT
          else
            echo "has-infra=false" >> $GITHUB_OUTPUT
          fi

          # Flag migration package changes
          if echo "$AFFECTED" | grep -qw "database"; then
            echo "has-database=true" >> $GITHUB_OUTPUT
          else
            echo "has-database=false" >> $GITHUB_OUTPUT
          fi

          if echo "$AFFECTED" | grep -qw "auth-database"; then
            echo "has-auth-database=true" >> $GITHUB_OUTPUT
          else
            echo "has-auth-database=false" >> $GITHUB_OUTPUT
          fi

  # ──────────────────────────────────────────────────────────────
  # JOB: ci
  # Runs per-project lint, type-check, test, build for affected projects.
  # ──────────────────────────────────────────────────────────────
  ci:
    name: Lint, Type-Check, Test, Build
    runs-on: ubuntu-latest
    needs: detect-affected
    if: needs.detect-affected.outputs.has-affected == 'true'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Fetch main branch
        run: git fetch origin main || true

      - name: Lint (affected)
        run: npx nx affected --target=lint --base=origin/main --head=HEAD --parallel=3

      - name: Type-check (affected)
        run: npx nx affected --target=type-check --base=origin/main --head=HEAD --parallel=3

      - name: Test (affected)
        run: npx nx affected --target=test --base=origin/main --head=HEAD --parallel=3

      - name: Build (affected)
        run: npx nx affected --target=build --base=origin/main --head=HEAD --parallel=3

  # ──────────────────────────────────────────────────────────────
  # JOB: terraform-plan
  # Runs terraform plan and posts output as a PR comment.
  # Only runs when infra/ files are in the affected list.
  # ──────────────────────────────────────────────────────────────
  terraform-plan:
    name: Terraform Plan (staging)
    runs-on: ubuntu-latest
    needs: detect-affected
    if: needs.detect-affected.outputs.has-infra == 'true'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9"

      - name: Terraform Init (no backend — plan validation only)
        working-directory: infra/terraform
        env:
          TERRAFORM_CREDENTIALS: ${{ secrets.TERRAFORM_CREDENTIALS }}
        run: terraform init -backend=false

      - name: Terraform Plan
        id: plan
        working-directory: infra/terraform
        run: |
          terraform plan -var-file=environments/staging.tfvars -no-color 2>&1 | tee plan-output.txt
          echo "plan-exit-code=${PIPESTATUS[0]}" >> $GITHUB_OUTPUT

      - name: Post Plan as PR Comment
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infra/terraform/plan-output.txt', 'utf8');
            const runId = context.runId;
            const body = `## Terraform Plan (staging)\n\n<details><summary>Show Plan</summary>\n\n\`\`\`\n${plan}\n\`\`\`\n\n</details>\n\nPlan generated by GitHub Actions run [#${runId}](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId})`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body
            });

  # ──────────────────────────────────────────────────────────────
  # JOB: deploy-dev
  # Stub deployment to dev environment after CI passes.
  # Actual implementation in feature 35.
  # ──────────────────────────────────────────────────────────────
  deploy-dev:
    name: Deploy to Dev (stub)
    runs-on: ubuntu-latest
    needs: [ci]
    if: needs.detect-affected.outputs.affected-apps != ''
    steps:
      - name: Deploy affected apps to dev (stub)
        run: |
          echo "Affected deployable apps: ${{ needs.detect-affected.outputs.affected-apps }}"
          for APP in ${{ needs.detect-affected.outputs.affected-apps }}; do
            echo "# Deployment of $APP to dev — implemented in feature 35"
          done
```

---

### 3.2 deploy-staging.yml — Full Structure

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]
  workflow_call:
    inputs:
      environment:
        type: string
        default: staging

concurrency:
  group: deploy-staging
  cancel-in-progress: false

env:
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}

jobs:
  detect-affected:
    name: Detect Affected Projects (main push)
    runs-on: ubuntu-latest
    outputs:
      affected: ${{ steps.affected.outputs.projects }}
      affected-apps: ${{ steps.affected.outputs.apps }}
      has-infra: ${{ steps.affected.outputs.has-infra }}
      has-database: ${{ steps.affected.outputs.has-database }}
      has-auth-database: ${{ steps.affected.outputs.has-auth-database }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Determine affected projects since last main commit
        id: affected
        run: |
          AFFECTED=$(npx nx affected:list --base=HEAD~1 --head=HEAD --plain)
          echo "Affected projects: $AFFECTED"
          echo "projects=$AFFECTED" >> $GITHUB_OUTPUT

          APPS=""
          for APP in auth api mastra ui; do
            if echo "$AFFECTED" | grep -qw "$APP"; then
              APPS="$APPS $APP"
            fi
          done
          echo "apps=$(echo $APPS | xargs)" >> $GITHUB_OUTPUT

          echo "has-infra=$(echo "$AFFECTED" | grep -qw infra && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "has-database=$(echo "$AFFECTED" | grep -qw database && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "has-auth-database=$(echo "$AFFECTED" | grep -qw auth-database && echo true || echo false)" >> $GITHUB_OUTPUT

  terraform-apply-staging:
    name: Terraform Apply (staging, stub)
    runs-on: ubuntu-latest
    needs: detect-affected
    if: needs.detect-affected.outputs.has-infra == 'true'
    steps:
      - name: Apply terraform to staging (stub)
        run: |
          echo "# terraform apply for staging — implemented in feature 02/36"

  run-product-migrations:
    name: Run Product Database Migrations (stub)
    runs-on: ubuntu-latest
    needs: [detect-affected, terraform-apply-staging]
    if: |
      always() &&
      needs.detect-affected.outputs.has-database == 'true' &&
      (needs.terraform-apply-staging.result == 'success' || needs.terraform-apply-staging.result == 'skipped')
    steps:
      - name: Run product migrations (stub)
        run: |
          echo "# Run product database migrations — implemented in feature 36"

  run-auth-migrations:
    name: Run Auth Database Migrations (stub)
    runs-on: ubuntu-latest
    needs: [detect-affected, terraform-apply-staging]
    if: |
      always() &&
      needs.detect-affected.outputs.has-auth-database == 'true' &&
      (needs.terraform-apply-staging.result == 'success' || needs.terraform-apply-staging.result == 'skipped')
    steps:
      - name: Run auth migrations (stub)
        run: |
          echo "# Run auth database migrations — implemented in feature 36"

  deploy-apps:
    name: Deploy Affected Apps to Staging (stub)
    runs-on: ubuntu-latest
    needs: [detect-affected, run-product-migrations, run-auth-migrations]
    if: |
      always() &&
      needs.detect-affected.outputs.affected-apps != '' &&
      (needs.run-product-migrations.result == 'success' || needs.run-product-migrations.result == 'skipped') &&
      (needs.run-auth-migrations.result == 'success' || needs.run-auth-migrations.result == 'skipped')
    steps:
      - name: Deploy affected apps to staging (stub)
        run: |
          echo "Affected deployable apps: ${{ needs.detect-affected.outputs.affected-apps }}"
          for APP in ${{ needs.detect-affected.outputs.affected-apps }}; do
            echo "# Build Docker image for $APP — implemented in feature 35"
            echo "# Push image to GCP Artifact Registry — implemented in feature 35"
            echo "# Deploy $APP to Cloud Run (staging) — implemented in feature 36"
          done
```

---

### 3.3 deploy-production.yml — Full Structure

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      apps:
        description: "Comma-separated list of apps to deploy (leave empty for all)"
        required: false
        default: ""
      confirm:
        description: "Type DEPLOY to confirm production deployment"
        required: true

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  validate-input:
    name: Validate Deployment Input
    runs-on: ubuntu-latest
    steps:
      - name: Validate confirmation
        run: |
          if [ "${{ github.event.inputs.confirm }}" != "DEPLOY" ]; then
            echo "Production deployment not confirmed. Input must be 'DEPLOY'."
            exit 1
          fi

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: validate-input
    environment: production  # GitHub Environment with required reviewers configured
    steps:
      - name: Deploy to production (stub)
        run: |
          APPS="${{ github.event.inputs.apps }}"
          if [ -z "$APPS" ]; then
            APPS="auth api mastra ui"
          fi
          for APP in $(echo $APPS | tr ',' ' '); do
            echo "# Promote staging image for $APP to production tag in Artifact Registry — implemented in feature 35"
            echo "# Run database migrations for $APP (if applicable) — implemented in feature 36"
            echo "# Deploy $APP to Cloud Run (production) — implemented in feature 36"
          done
          echo "# terraform apply for production (if infra changed) — requires separate approval — implemented in feature 02/36"
```

---

### 3.4 nx.json Modification

The following `tasksRunnerOptions` block must be added to the existing `nx.json` from feature 00:

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

**Important implementation notes:**
- The `accessToken` placeholder is a read-only public token used for local development cache reads. Replace with a real Nx Cloud token obtained from cloud.nx.app during project setup.
- In CI, the `NX_CLOUD_ACCESS_TOKEN` environment variable overrides the value in `nx.json` and is used for authenticated cache writes.
- Do NOT commit the actual CI token to `nx.json`. Only the public read-only token (or the placeholder) belongs in the file.
- Existing `nx.json` fields from feature 00 (`defaultBase`, `namedInputs`, `targetDefaults`) are preserved unchanged.

---

## 4. GitHub Repository Configuration (Manual Steps)

These items cannot be automated via workflow YAML — they require manual configuration in the GitHub repository settings.

### 4.1 Branch Protection Rules for `main`

| Setting | Value |
|---|---|
| Require status checks to pass before merging | Enabled |
| Required status checks | `ci / Lint, Type-Check, Test, Build` |
| Require branches to be up to date before merging | Enabled |
| Restrict who can push to `main` | Enabled (tech lead and CI bot only) |
| Require pull request reviews | 1 approval required |

### 4.2 GitHub Environment: `production`

| Setting | Value |
|---|---|
| Environment name | `production` |
| Required reviewers | At least 1 (list specific GitHub usernames) |
| Deployment branch restriction | `main` only |
| Wait timer | Optional — configure per team preference |

### 4.3 GitHub Environment: `staging`

| Setting | Value |
|---|---|
| Environment name | `staging` |
| Required reviewers | None (auto-deploy) |
| Deployment branch restriction | `main` only |

### 4.4 GitHub Environment: `dev`

| Setting | Value |
|---|---|
| Environment name | `dev` |
| Required reviewers | None (auto-deploy) |
| Deployment branch restriction | Any branch (PR branches deploy here) |

---

## 5. Secrets Configuration

All secrets must be configured in the GitHub repository settings under Settings > Secrets and Variables > Actions.

| Secret Name | Scope | Value Source | Notes |
|---|---|---|---|
| `NX_CLOUD_ACCESS_TOKEN` | Repository | Nx Cloud dashboard (cloud.nx.app) | Read-write token for CI cache writes |
| `TERRAFORM_CREDENTIALS` | Repository | GCP service account key | GCP service account JSON for Terraform backend authentication |
| `GCP_SA_KEY` | Repository | GCP service account key | Service account JSON for Artifact Registry push and Cloud Run deployment; populated in feature 35 |
| `GITHUB_TOKEN` | Automatically provided | GitHub | Used for PR comment posting; no configuration required |

**Security requirement:** No secret value may appear in workflow YAML, commit history, or PR comments. All secrets are referenced exclusively via `${{ secrets.SECRET_NAME }}`.

---

## 6. Nx Cloud Configuration

### 6.1 Account Setup

1. Create an Nx Cloud account at cloud.nx.app.
2. Connect the GitHub repository to the Nx Cloud workspace.
3. Retrieve the workspace access token (two tokens are provided: read-only for nx.json, read-write for CI).
4. Store the read-write token as the `NX_CLOUD_ACCESS_TOKEN` GitHub Actions secret.
5. Set the read-only token (or placeholder) in `nx.json`.

### 6.2 Cacheable Operations

The following Nx targets are configured as cacheable operations in `nx.json`:

| Target | Cache Key Inputs | Notes |
|---|---|---|
| `build` | Source files + dependencies | Longest-running target; cache has highest value |
| `lint` | Source files + ESLint config | Fast but benefits from cache on large affected sets |
| `test` | Source files + dependencies | Test runs are idempotent and safe to cache |
| `type-check` | Source files + tsconfig | Safe to cache; TypeScript compilation is deterministic |

### 6.3 Cache Invalidation

Cache is invalidated when any of the following change:
- The project's own source files (via `namedInputs.default` in nx.json)
- The shared globals: `nx.json`, `tsconfig.base.json`, `package.json` (via `namedInputs.sharedGlobals`)
- Any upstream project's build output (via `^production` in targetDefaults.build.inputs)

---

## 7. Nx Affected Command Reference

All `nx affected` invocations in the workflows use the following flag conventions:

| Context | Base Ref | Head Ref | Rationale |
|---|---|---|---|
| PR CI | `origin/main` | `HEAD` | Compares PR branch against the target branch |
| Staging deploy | `HEAD~1` | `HEAD` | Compares merged commit against its parent on main |
| Initial PR (no main) | fallback: `nx show projects` | N/A | Treats all projects as affected when no base exists |

**`--plain` flag:** Used to output a simple newline-separated list rather than the default formatted output. Required for shell parsing.

**`--parallel=3` flag:** Limits concurrent Nx task runners to 3. Increase if the runner has more cores. GitHub-hosted `ubuntu-latest` runners have 2 vCPUs; 3 provides slight over-subscription for I/O-bound tasks.

---

## 8. Performance Requirements

| Operation | Target | Notes |
|---|---|---|
| PR CI (single-app change, warm cache) | < 5 minutes end-to-end | Includes Nx Cloud cache retrieval |
| PR CI (shared-types change, all 4 apps, warm cache) | < 8 minutes | All 4 apps run in parallel |
| PR CI (cold cache, single app) | < 10 minutes | First run after cache miss |
| Nx affected detection step | < 60 seconds | Includes git fetch and pnpm install |
| Nx Cloud cache hit rate (repeat runs) | > 80% | Measured over 30 days of CI runs |
| Staging deployment workflow (stub, no actual deploy) | < 3 minutes | Will increase when feature 35/36 implement actual deploy |

---

## 9. Security Requirements

| Requirement | Implementation |
|---|---|
| No secrets in workflow YAML | All secrets via `${{ secrets.* }}` — enforced by code review |
| Production requires human approval | GitHub Environment protection rules with required reviewers |
| Production deploys only from `main` | GitHub Environment deployment branch restriction |
| CI cannot self-modify workflows | `GITHUB_TOKEN` has write access to comments only; workflow files require PR review |
| Terraform credentials are scoped | Separate GCP service account for CI with minimal permissions: Artifact Registry push, Cloud Run deploy, GCS Terraform state read/write |
| No internet egress from Terraform plan step | `terraform init -backend=false` avoids reaching external state backends in CI plan-only mode |

---

## 10. Downstream Feature Impact

| Decision Made Here | Features Impacted |
|---|---|
| GitHub Actions as the CI runner | 35 (Container Builds) — must add its Docker build steps to `ci.yml` and `deploy-staging.yml` |
| Nx Cloud `tasksRunnerOptions` in `nx.json` | All features — cache configuration affects every Nx target across the workspace |
| Concurrency group names (`deploy-staging`, `deploy-production`) | 35, 36 — must use the same concurrency groups to avoid conflicts |
| `deploy-staging.yml` job dependency ordering | 36 (Terraform App Deployment) — must insert its deploy steps into the existing job DAG |
| GitHub Environment names (`dev`, `staging`, `production`) | 35, 36 — environment names referenced in their workflow steps must match exactly |
| `affected-apps` output variable format | 35 — the Docker build workflow consumes this variable to know which images to build |

---

## 11. Open Technical Questions

| Question | Default Assumption | Who Decides |
|---|---|---|
| ~~GCP or AWS?~~ | **Resolved: GCP selected.** Deployments use Artifact Registry for images and Cloud Run for container services. | Resolved |
| Nx Cloud free tier or paid? | Free tier initially; upgrade if CI minutes or cache storage limits are hit | Tech lead |
| Ephemeral per-PR dev environments or shared dev? | Shared dev in this stub implementation; ephemeral dev is a future enhancement | Tech lead |
| Who are the production approvers? | TBD — must be configured in GitHub Environment settings before first production deploy | Business |
| Should `--parallel` be increased beyond 3? | 3 is conservative for 2-vCPU runners; increase to 4-6 if using larger runners | Tech lead |
| Nx distributed task execution (DTE)? | Not enabled in this feature — remote caching only | Tech lead |
