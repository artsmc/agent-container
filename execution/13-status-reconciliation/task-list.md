# Task List
# Feature 13: Status Reconciliation

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Blocked by:** Feature 12 (output-normalizer-asana) must be complete
**Blocks:** Feature 14 (agenda-endpoints), Feature 20 (workflow-b-agenda-agent)

---

## Prerequisites Checklist

Before starting this feature, confirm:
- [ ] Feature 12 is merged and `apps/api/src/adapters/asana/` exists with `asana-client.ts`, `workspace-router.ts`, `p-retry`
- [ ] Clarify with Feature 12 team: is the Asana task reference stored as `tasks.asana_task_id VARCHAR` or `tasks.external_ref JSONB`? (References: TR.md Section 3.1)
- [ ] Confirm access token resolution API from `workspace-router.ts` — specifically whether a project GID can be used to look up a workspace record (References: TR.md Section 6)

---

## Phase 1: Type Definitions

- [ ] **Define `ReconciledTask` interface** in `apps/api/src/adapters/asana/reconcile.ts`
  - Include all Postgres metadata fields (11 fields: id, shortId, title, description, assignee, estimatedTime, scrumStage, transcriptId, asanaProjectId, asanaTaskId, pushedAt)
  - Include all Asana live status fields (5 fields: asanaStatus, asanaCompleted, asanaCompletedAt, asanaAssigneeName, asanaCustomFields)
  - References: FRS.md Section FR-05, TR.md Section 2.1

- [ ] **Define `AsanaTaskStatus` union type** (`'completed' | 'incomplete' | 'not_found'`)
  - References: TR.md Section 2.1

- [ ] **Define `AsanaCustomField` interface** (`{ gid, name, display_value }`)
  - References: TR.md Section 2.1

- [ ] **Implement `ReconciliationError` class** in `apps/api/src/adapters/asana/reconciliation-error.ts`
  - Typed error codes: `ASANA_AUTH_FAILED`, `ASANA_UNAVAILABLE`, `ASANA_TIMEOUT`
  - Extends Error with `code` and optional `details` fields
  - References: FRS.md Section FR-07, TR.md Section 2.2

- [ ] **Define internal Asana API response types** (`AsanaTaskListResponse`, `AsanaTaskItem`) in `reconcile.ts` or a co-located `asana-types.ts`
  - References: TR.md Section 2.3

---

## Phase 2: Asana HTTP Client Extension

- [ ] **Add `buildTaskListUrl` helper** to `asana-client.ts`
  - Builds the `GET /tasks?project={gid}&opt_fields=...&limit=100&offset=?` URL
  - References: FRS.md Section FR-03, TR.md Section 4.1

- [ ] **Add `fetchPageWithRetry` helper** to `asana-client.ts`
  - Uses `p-retry` with 3 total attempts, exponential back-off
  - Handles `401`/`403` → `AbortError(ReconciliationError('ASANA_AUTH_FAILED'))`
  - Handles `404` → `AbortError(ProjectNotFoundError)`
  - Handles `429` → respect `Retry-After` header, then retry
  - Handles `5xx` → standard retry
  - Handles timeout → `ReconciliationError('ASANA_TIMEOUT')`
  - Reuses `fetchWithTimeout` from Feature 12 with 15s timeout
  - References: FRS.md Section FR-07, TR.md Section 4.1

- [ ] **Add `fetchProjectTasks` exported function** to `asana-client.ts`
  - Calls `fetchPageWithRetry` in a loop until `next_page` is null
  - Accumulates all `AsanaTaskItem[]` across pages
  - Returns flat array of all tasks in the project
  - References: FRS.md Section FR-03, TR.md Section 4.1

---

## Phase 3: Database Query

- [ ] **Implement `queryPushedTasks` function** in `reconcile.ts`
  - Drizzle `select()` with `where(and(eq(tasks.clientId, clientId), eq(tasks.status, 'pushed')))`
  - Selects only the fields needed (avoid selecting full description unnecessarily — or include description since agenda needs it)
  - Zero write statements
  - References: FRS.md Section FR-01, FR-09, TR.md Section 3.1

- [ ] **Verify `asana_task_id` vs `external_ref` column** — adjust query accordingly
  - If `external_ref JSONB`: use `sql\`external_ref->>'taskId'\`` accessor in Drizzle
  - References: TR.md Section 3.1 (Open Question), FRS.md Section FR-04

---

## Phase 4: Access Token Resolution

- [ ] **Implement `resolveAccessTokenForProject` helper** in `reconcile.ts`
  - Calls `workspace-router.ts` logic from Feature 12 to look up workspace by project GID
  - Returns `string | null` (null if workspace not found — tasks for that project become `not_found`)
  - References: FRS.md Section FR-08, TR.md Section 6

---

## Phase 5: Main Reconciliation Orchestrator

- [ ] **Implement `reconcileTasksForClient` main function** in `reconcile.ts`
  - Step 1: Call `queryPushedTasks` — return empty array immediately if none
  - Step 2: Deduplicate `asanaProjectId` values using `Set`
  - Step 3: For each unique project GID: resolve token, call `fetchProjectTasks`, build `Map<gid, AsanaTaskItem>`
  - Step 4: For each pushed task: match against map, call `buildMatchedReconciledTask` or `buildUnmatchedReconciledTask`
  - Emit structured Pino log events at start, per-project debug, and completion
  - References: FRS.md Section FR-01 through FR-10, TR.md Section 5.1

- [ ] **Implement `buildMatchedReconciledTask` helper** in `reconcile.ts`
  - Merges Postgres row with `AsanaTaskItem`
  - Sets `asanaStatus` based on `asanaTask.completed`
  - References: FRS.md Section FR-05, TR.md Section 5.1

- [ ] **Implement `buildUnmatchedReconciledTask` helper** in `reconcile.ts`
  - Sets all Asana fields to null, `asanaStatus: 'not_found'`
  - References: FRS.md Section FR-05, FR-06, TR.md Section 5.1

---

## Phase 6: Error Handling and Logging

- [ ] **Verify 401/403 aborts entire reconciliation** — ReconciliationError propagates up through `reconcileTasksForClient`
  - References: FRS.md Section FR-07, GS.md Scenario "Asana returns 401 Unauthorized"

- [ ] **Verify 404 continues with other projects** — tasks for 404 project marked `not_found`, no throw
  - References: FRS.md Section FR-07, GS.md Scenario "Asana returns 404 for one project but not another"

- [ ] **Add structured log event: Reconciliation started** (info, clientId, pushedTaskCount, uniqueProjectCount)
  - References: FRS.md Section FR-10

- [ ] **Add structured log event: Per-project fetch debug** (debug, clientId, projectGid, page number)
  - References: FRS.md Section FR-10

- [ ] **Add structured log event: Per-project fetch complete** (debug, clientId, projectGid, totalTasksFetched)
  - References: FRS.md Section FR-10

- [ ] **Add structured log event: Unmatched task** (warn, clientId, taskId, shortId, asanaTaskId, reason)
  - Reason values: `'missing_asana_project_id'`, `'missing_asana_task_id'`, `'task_not_in_project'`
  - References: FRS.md Section FR-10, GS.md unmatched scenarios

- [ ] **Add structured log event: Reconciliation completed** (info, clientId, reconciledCount, unmatchedCount, durationMs)
  - References: FRS.md Section FR-10

- [ ] **Confirm no access tokens or task content appear in any log event**
  - References: FRS.md Section FR-10, TR.md Section 10

---

## Phase 7: Export and Integration Wiring

- [ ] **Export `reconcileTasksForClient` from `adapters/asana/index.ts`**
  - Export the function and the `ReconciledTask`, `AsanaTaskStatus`, `AsanaCustomField` types
  - Export `ReconciliationError` for use by callers
  - References: TR.md Section 7.2

- [ ] **Verify Feature 14's call site compiles** (pseudocode check — Feature 14 imports and calls `reconcileTasksForClient`)
  - References: TR.md Section 7.1

---

## Phase 8: Unit Tests

- [ ] **Write unit tests for reconcile.ts matching logic** (`__tests__/reconcile.test.ts`)
  - Mock `fetchProjectTasks` and `queryPushedTasks` using `vi.mock`
  - Test cases: all matched, multi-project grouping, completed, incomplete, no tasks, null projectId, null taskId, GID not found, Postgres metadata preserved, zero write queries
  - References: TR.md Section 8.1, GS.md all scenarios

- [ ] **Verify test command passes**: `nx run api:test --testPathPattern=adapters/asana/reconcile`

---

## Phase 9: Integration Tests

- [ ] **Write integration tests** (`__tests__/reconcile.integration.test.ts`)
  - Use `msw` to intercept Asana HTTP at the fetch level
  - Test cases: single-page success, pagination (2 pages), 401 abort, 404 partial continue, 429 retry success, 429 exhausted, 503→200 retry, timeout, multi-project one 404
  - References: TR.md Section 8.2, GS.md error handling scenarios

- [ ] **Verify no real network calls in test suite** — `msw` must intercept all outbound HTTP

- [ ] **Verify test coverage meets 85% threshold** (per Feature 07's coverage standard)

---

## Phase 10: Final Verification

- [ ] **Run full adapter test suite**: `nx run api:test --testPathPattern=adapters/asana`
- [ ] **Run type check**: `nx run api:type-check`
- [ ] **Run lint**: `nx run api:lint`
- [ ] **Manually verify no tasks.status writes occur** by reviewing all Drizzle calls in the new files
- [ ] **Document in Feature 14's integration notes** that `reconcileTasksForClient` is available from `@iexcel/adapters/asana`
