# Execution Plan
# Feature 13: Status Reconciliation

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/13-status-reconciliation
- **planning_folder:** execution/13-status-reconciliation/planning
- **task_list_file:** execution/13-status-reconciliation/task-list.md

---

## Summary

~28 tasks across 10 original phases, refined to ~32 tasks across 5 waves. Implements on-demand Postgres-to-Asana status reconciliation: fetches live Asana task statuses per project, matches against pushed tasks by external_ref->>'externalId', and returns merged ReconciledTask objects. No periodic sync — reconciliation is triggered by callers (Feature 14 agenda endpoints).

**KEY FINDING — Missing tasks identified:** The original task list omits two items required by TR.md Section 3.2 and FRS FR-09:
1. DB migration to add `reconciled_status` and `reconciled_at` columns to the tasks table
2. `writeReconciledCache` function that persists reconciled status back to Postgres

These are added as new tasks in Wave 3.

---

## Wave 1 — Types + Error Infrastructure (all parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P1-T1 | Define ReconciledTask interface: 11 Postgres fields + 5 Asana fields | Small | FRS FR-05, TR.md Section 2.1 |
| P1-T2 | Define AsanaTaskStatus union type ('completed' | 'incomplete' | 'not_found') | Small | TR.md Section 2.1 |
| P1-T3 | Define AsanaCustomField interface ({ gid, name, display_value }) | Small | TR.md Section 2.1 |
| P1-T4 | Implement ReconciliationError class: typed codes (ASANA_AUTH_FAILED, ASANA_UNAVAILABLE, ASANA_TIMEOUT) | Small | FRS FR-07, TR.md Section 2.2 |
| P1-T5 | Define internal Asana API response types (AsanaTaskListResponse, AsanaTaskItem) | Small | TR.md Section 2.3 |

**Result:** All types and error classes defined.

---

## Wave 2 — HTTP Client Extension + Database Query (parallel)

### Stream A — Asana HTTP Client Extension

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P2-T1 | Add buildTaskListUrl helper to asana-client.ts | Small | FRS FR-03, TR.md Section 4.1 |
| P2-T2 | Add fetchPageWithRetry helper with error handling matrix: 401/403 abort, 404 continue, 429/5xx retry, timeout | Medium | FRS FR-07, TR.md Section 4.1 |
| P2-T3 | Add fetchProjectTasks: paginated loop accumulating all AsanaTaskItem[] | Medium | FRS FR-03, TR.md Section 4.1 |

### Stream B — Database Query

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P3-T1 | Implement queryPushedTasks(clientId): SELECT where status='pushed', zero writes | Small | FRS FR-01, FR-09, TR.md Section 3.1 |
| P3-T2 | Handle external_ref JSONB accessor: sql`external_ref->>'taskId'` in Drizzle | Small | TR.md Section 3.1 |

### Stream C — Access Token Resolution

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P4-T1 | Implement resolveAccessTokenForProject helper using Feature 12's workspace-router | Small | FRS FR-08, TR.md Section 6 |

**Depends on:** Wave 1 (types exist).
**Result:** All data retrieval components ready.

---

## Wave 3 — Reconciliation Orchestrator + Cache Write (sequential)

### Core Orchestrator

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P5-T1 | Implement reconcileTasksForClient main function: query → deduplicate projects → fetch per project → match → build results | Large | FRS FR-01 to FR-10, TR.md Section 5.1 |
| P5-T2 | Implement buildMatchedReconciledTask helper: merge Postgres row with AsanaTaskItem | Small | FRS FR-05, TR.md Section 5.1 |
| P5-T3 | Implement buildUnmatchedReconciledTask helper: Asana fields null, status 'not_found' | Small | FRS FR-05, FR-06, TR.md Section 5.1 |

### Missing Tasks (NEW — not in original task list)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| NEW-1 | DB migration: add `reconciled_status VARCHAR` and `reconciled_at TIMESTAMPTZ` columns to tasks table | Small | TR.md Section 3.2 |
| NEW-2 | Implement writeReconciledCache(reconciledTasks): UPDATE tasks SET reconciled_status, reconciled_at for each matched task | Medium | TR.md Section 3.2, FRS FR-09 |

### Error Handling and Logging

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P6-T1 | Verify 401/403 aborts entire reconciliation | Small | FRS FR-07, GS "Asana returns 401" |
| P6-T2 | Verify 404 continues with other projects, marks tasks 'not_found' | Small | FRS FR-07, GS "Asana returns 404 for one project" |
| P6-T3 | Structured log: reconciliation started (info) | Small | FRS FR-10 |
| P6-T4 | Structured log: per-project fetch debug | Small | FRS FR-10 |
| P6-T5 | Structured log: per-project fetch complete | Small | FRS FR-10 |
| P6-T6 | Structured log: unmatched task warning with reason | Small | FRS FR-10 |
| P6-T7 | Structured log: reconciliation completed (info, counts, duration) | Small | FRS FR-10 |
| P6-T8 | Verify no access tokens or task content in log events | Small | FRS FR-10, TR.md Section 10 |

**Depends on:** Wave 2 (all data retrieval components).
**Result:** MILESTONE — Reconciliation fully functional with cache write.

---

## Wave 4 — Export + Testing (parallel)

### Stream A — Export and Wiring

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P7-T1 | Export reconcileTasksForClient, ReconciledTask, AsanaTaskStatus, AsanaCustomField, ReconciliationError from adapters/asana/index.ts | Small | TR.md Section 7.2 |
| P7-T2 | Verify Feature 14 call site compiles (pseudocode check) | Small | TR.md Section 7.1 |

### Stream B — Unit Tests

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P8-T1 | Unit tests for reconcile.ts matching logic: all matched, multi-project, completed, incomplete, no tasks, null projectId, null taskId, GID not found, metadata preserved, zero writes | Large | TR.md Section 8.1, GS all scenarios |
| P8-T2 | Verify unit tests pass | Small | — |

### Stream C — Integration Tests

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P9-T1 | Integration tests with msw: single-page, pagination, 401 abort, 404 partial, 429 retry, 503 retry, timeout, multi-project | Large | TR.md Section 8.2, GS error scenarios |
| P9-T2 | Verify no real network calls in test suite | Small | — |
| P9-T3 | Verify test coverage meets 85% threshold | Small | — |

**Depends on:** Wave 3 (orchestrator exists).
**Result:** Full test coverage.

---

## Wave 5 — Final Verification (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| P10-T1 | Run full adapter test suite: `nx run api:test --testPathPattern=adapters/asana` | Small | — |
| P10-T2 | Run type check: `nx run api:type-check` | Small | — |
| P10-T3 | Run lint: `nx run api:lint` | Small | — |
| P10-T4 | Manually verify no tasks.status writes in new files | Small | — |
| P10-T5 | Document reconcileTasksForClient availability for Feature 14 | Small | — |

**Depends on:** Wave 4.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Types + Error Infrastructure)
  |
  +------+------+
  |      |      |
  v      v      v
Wave 2A  2B    2C    (HTTP client, DB query, token resolution — parallel)
  |      |      |
  +------+------+
         |
         v
   Wave 3 (Orchestrator + Cache Write + Logging)  --- MILESTONE: Functional
         |
    +----+----+
    |    |    |
    v    v    v
   4A   4B   4C    (Export, Unit Tests, Integration Tests — parallel)
    |    |    |
    +----+----+
         |
         v
   Wave 5 (Final Verification)
```

---

## Key Decisions

- **Missing tasks added:** DB migration for `reconciled_status`/`reconciled_at` columns and `writeReconciledCache` function were not in the original task list but are required by TR.md Section 3.2 and FRS FR-09. Added as NEW-1 and NEW-2 in Wave 3.
- **On-demand reconciliation only:** No periodic sync, no cron job. Triggered by Feature 14 (agenda endpoints) when client status data is needed.
- **Per-project fetch strategy:** Tasks are grouped by asanaProjectId, then fetched per project. A 404 on one project does not abort others.
- **Match by external_ref->>'externalId':** Uses the JSONB accessor to match Postgres tasks against Asana task GIDs.
- **Error handling matrix:** 401/403 = abort entire reconciliation, 404 = mark tasks as not_found and continue, 429/5xx = retry with p-retry.
- **No status writes to tasks table:** The reconciliation only reads task status from Postgres and reads live status from Asana. The `writeReconciledCache` function updates only the `reconciled_status` and `reconciled_at` cache columns, NOT the `status` column.
- **Single agent execution:** All work is backend TypeScript with Asana API integration.
- **Reuses Feature 12 infrastructure:** Shares asana-client.ts (fetchWithTimeout, p-retry), workspace-router.ts (token resolution), and the adapters/asana/ directory.
