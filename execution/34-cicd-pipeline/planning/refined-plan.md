# Refined Plan
# Feature 34: CI/CD Pipeline

**Status:** Approved
**Complexity:** Medium (19 tasks, 7 phases)
**Sub-Agent Delegation:** No (single skill set -- GitHub Actions YAML authoring)

---

## Pre-Condition Gates

| Gate | Status | Notes |
|---|---|---|
| GitHub Actions confirmed | Resolved | Per context.md Key Decisions |
| Cloud provider (GCP/AWS) | Resolved | GCP selected (TR.md Section 11) |
| Feature 00 merged | Required | Nx monorepo scaffolding must exist |

---

## Wave Structure

### Wave 1 -- Foundation (4 tasks, partially parallel)

**Manual tasks (done first or in parallel with code):**
- TASK-002: Configure GitHub Environments (manual)
- TASK-003: Configure branch protection rules (manual)
- TASK-004: Configure GitHub Actions secrets (manual)

**Code task:**
- TASK-001: Create `.github/workflows/` directory

**Parallel note:** TASK-001 and the manual tasks (002-004) are fully independent.

---

### Wave 2 -- Nx Cloud Configuration (1 task, sequential)

- TASK-010: Add `tasksRunnerOptions` to `nx.json`

**Depends on:** Nx Cloud token from prerequisites

---

### Wave 3 -- CI Workflow (4 tasks, sequential within file)

- TASK-020: `detect-affected` job in `ci.yml`
- TASK-021: `ci` job (lint, type-check, test, build)
- TASK-022: `terraform-plan` job
- TASK-023: `deploy-dev` stub job

**Key insight:** TR.md Section 3.1 provides the complete YAML for ci.yml. This is largely a transcription task with minor adaptations.

**All 4 tasks build the same file sequentially.** No parallelism within this wave.

---

### Wave 4 -- Staging Workflow (5 tasks, sequential within file)

- TASK-030: `detect-affected` job in `deploy-staging.yml`
- TASK-031: `terraform-apply-staging` stub
- TASK-032: `run-product-migrations` stub
- TASK-033: `run-auth-migrations` stub
- TASK-034: `deploy-apps` stub

**Key insight:** TR.md Section 3.2 provides the complete YAML for deploy-staging.yml.

---

### Wave 5 -- Production Workflow (1 task)

- TASK-040: Create `deploy-production.yml` (complete file)

**Key insight:** TR.md Section 3.3 provides the complete YAML.

---

### Wave 6 -- Validation (7 tasks, partially parallel)

**Parallel group A (automated checks):**
- TASK-050: YAML lint
- TASK-051: actionlint schema validation
- TASK-052: nx.json validity check
- TASK-053: No hard-coded secrets check

**Sequential group B (end-to-end tests, must be in order):**
- TASK-054: E2E test -- PR CI run
- TASK-055: E2E test -- merge to staging
- TASK-056: E2E test -- production manual trigger

---

### Wave 7 -- Commit (1 task)

- TASK-060: Stage and commit 4 files

---

## Incremental Build Strategy

| After Wave | Working State |
|---|---|
| Wave 1 | GitHub repo configured, workflows directory exists |
| Wave 2 | Nx Cloud caching enabled for local dev |
| Wave 3 | PR CI runs lint/type-check/test/build for affected projects |
| Wave 4 | Staging auto-deploys on merge to main (stubs) |
| Wave 5 | Production promotion with manual trigger + approval gate |
| Wave 6 | All validations and E2E tests passing |
| Wave 7 | Clean commit ready for PR |

---

## Key Technical Notes

1. **TR.md provides complete YAML** for all 3 workflow files. Implementation is transcription with verification, not design.
2. **Manual GitHub config tasks** (TASK-002, 003, 004) cannot be automated -- they require GitHub UI interaction.
3. **Single skill set needed** -- all tasks are GitHub Actions YAML authoring. No sub-agent delegation benefit.
4. **Concurrency group names** (`ci-${{ github.ref }}`, `deploy-staging`, `deploy-production`) are consumed by Features 35 and 36 downstream.
5. **pnpm 9 + Node.js 22** match Feature 00 decisions.

---

## Path Management

- task_list_file: `execution/34-cicd-pipeline/task-list.md`
- input_folder: `execution/34-cicd-pipeline`
- planning_folder: `execution/34-cicd-pipeline/planning`
