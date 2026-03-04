# Task List
## Feature 13: Status Reconciliation

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 07 (api-scaffolding) is complete — Fastify app, Drizzle ORM `DbClient` type, Pino logger, error handling patterns, Vitest setup are all available
- [ ] Feature 12 (output-normalizer-asana) is complete — `asana-client.ts` with `fetchWithTimeout`, `workspace-router.ts` for access token resolution, `p-retry` dependency, and `msw` devDependency are present in `apps/api`
- [ ] Feature 11 (task-endpoints) is complete — `tasks` table exists in schema with `status`, `client_id`, `asana_task_id`, `asana_project_id` columns
- [ ] Feature 04 (product-database-schema) is complete — `tasks` table DDL is applied
- [ ] Coordinate with Feature 12 team: confirm whether the Asana task ID is stored as `asana_task_id` (VARCHAR) or `external_ref` (JSONB with `taskId` key) — this determines the Drizzle query accessor

---

## Phase 1: Types and Error Classes

### Task 1.1 — Define `ReconciledTask` and `AsanaTaskStatus` types
**Complexity:** Small
**References:** TR.md Section 2.1, FRS.md FR-05

Create or add to `apps/api/src/adapters/asana/reconcile.ts`:
- `AsanaTaskStatus` type: `'completed' | 'incomplete' | 'not_found'`
- `AsanaCustomField` interface: `{ gid, name, display_value }`
- `ReconciledTask` interface with all 11 Postgres fields and 5 Asana fields as defined in TR.md Section 2.1

**Verification:** Types compile without errors. No runtime code yet.

---

### Task 1.2 — Implement `ReconciliationError` class
**Complexity:** Small
**References:** TR.md Section 2.2, FRS.md FR-07

Create `apps/api/src/adapters/asana/reconciliation-error.ts`:
- `ReconciliationErrorCode` type: `'ASANA_AUTH_FAILED' | 'ASANA_UNAVAILABLE' | 'ASANA_TIMEOUT'`
- `ReconciliationError` class extending `Error` with `code`, `details`, and `name = 'ReconciliationError'`

**Verification:** Error class instantiates correctly with each code. `instanceof ReconciliationError` works.

---

## Phase 2: Asana HTTP Client Extension

### Task 2.1 — Implement `fetchProjectTasks` in `asana-client.ts`
**Complexity:** Medium
**References:** TR.md Section 4, FRS.md FR-03

Extend `apps/api/src/adapters/asana/asana-client.ts` with:
- `fetchProjectTasks(projectGid, accessToken): Promise<AsanaTaskItem[]>`
- URL builder: `GET https://app.asana.com/api/1.0/tasks?project={gid}&opt_fields=gid,name,completed,completed_at,assignee.name,custom_fields&limit=100`
- Pagination loop: follow `next_page.offset` until all pages are fetched
- Per-page timeout: 15 seconds (using existing `fetchWithTimeout`)
- Retry logic via `p-retry`: max 2 retries (3 total attempts)
  - `401/403`: non-retryable, throw `ReconciliationError('ASANA_AUTH_FAILED')` via `AbortError`
  - `404`: non-retryable, throw `ProjectNotFoundError` via `AbortError`
  - `429`: retryable, respect `Retry-After` header (default 60s)
  - `5xx`: retryable with exponential back-off (1s, 2s, 4s)

Also define the internal `AsanaTaskListResponse` and `AsanaTaskItem` types (TR.md Section 2.3).

**Verification:**
- Correct URL construction with and without offset parameter
- Pagination accumulates all tasks from multiple pages
- 401/403 throws `ReconciliationError('ASANA_AUTH_FAILED')` immediately (no retry)
- 404 throws `ProjectNotFoundError` immediately
- 429 retries after delay and succeeds on next attempt
- 5xx retries with back-off

---

## Phase 3: Database Query

### Task 3.1 — Implement `queryPushedTasks` function
**Complexity:** Small
**References:** TR.md Section 3, FRS.md FR-01

Inside `apps/api/src/adapters/asana/reconcile.ts`, implement:
- `queryPushedTasks(clientId, db)`: Drizzle `select().from(tasks).where(and(eq(tasks.clientId, clientId), eq(tasks.status, 'pushed')))`
- Select all 11 fields needed by `ReconciledTask`: `id`, `shortId`, `title`, `description`, `assignee`, `estimatedTime`, `scrumStage`, `transcriptId`, `asanaProjectId`, `asanaTaskId`, `pushedAt`
- If Feature 12 used `external_ref JSONB`, adjust to read `external_ref->>'taskId'`

**Verification:** Query returns only `pushed` tasks for the specified client. Returns empty array for a client with no pushed tasks. No UPDATE/INSERT/DELETE queries are issued.

---

## Phase 4: Reconciliation Orchestrator

### Task 4.1 — Implement `reconcileTasksForClient` main function
**Complexity:** Large
**References:** TR.md Section 5, FRS.md FR-01 through FR-09

Implement the main orchestration function in `apps/api/src/adapters/asana/reconcile.ts`:

1. Query Postgres for pushed tasks (Task 3.1)
2. Return empty array immediately if no pushed tasks exist (FR-01 edge case)
3. Deduplicate `asana_project_id` values from the pushed task set (FR-02)
4. For each unique project GID:
   - Resolve access token via Feature 12's workspace router (FR-08)
   - If token resolution fails, log warning and skip project (tasks marked `not_found`)
   - Call `fetchProjectTasks(projectGid, accessToken)` (Task 2.1)
   - On `ReconciliationError('ASANA_AUTH_FAILED')`: re-throw (abort entire reconciliation)
   - On `ProjectNotFoundError` (404): log warning, continue to next project
   - On other errors: re-throw (abort)
   - Accumulate fetched tasks into an in-memory `Map<string, AsanaTaskItem>` keyed by GID
5. Iterate pushed tasks and build `ReconciledTask[]`:
   - Null `asanaProjectId` or `asanaTaskId` → `asanaStatus: 'not_found'`, log warning
   - GID not found in map → `asanaStatus: 'not_found'`, log warning
   - GID found → merge Asana data (`completed` → `'completed'`/`'incomplete'`)
6. Emit structured logs at all specified points (FR-10)

**Verification:**
- All tasks matched when all GIDs present in Asana response
- Unmatched tasks have `asanaStatus: 'not_found'` and all Asana fields null
- No Postgres writes (no UPDATE/INSERT/DELETE)
- Auth failures abort entirely; 404s result in partial match (no abort)
- Logging at info/debug/warn levels as specified

---

### Task 4.2 — Implement helper functions
**Complexity:** Small
**References:** TR.md Section 5.1

Implement in `apps/api/src/adapters/asana/reconcile.ts`:
- `buildUnmatchedReconciledTask(task)`: returns `ReconciledTask` with `asanaStatus: 'not_found'` and all Asana fields null/empty
- `buildMatchedReconciledTask(task, asanaTask)`: returns `ReconciledTask` merging Postgres metadata with Asana live status
- `resolveAccessTokenForProject(projectGid, db, logger)`: delegates to Feature 12's workspace router

**Verification:** Helper functions produce correct `ReconciledTask` shapes for matched and unmatched cases.

---

## Phase 5: Export and Integration

### Task 5.1 — Export from adapter index
**Complexity:** Small
**References:** TR.md Section 7.2

Update `apps/api/src/adapters/asana/index.ts` to export:
- `reconcileTasksForClient` function
- `ReconciledTask`, `AsanaTaskStatus`, `AsanaCustomField` types
- `ReconciliationError` class

**Verification:** Downstream consumers (Feature 14) can import all exported symbols without errors.

---

## Phase 6: Testing

### Task 6.1 — Unit tests for matching logic
**Complexity:** Medium
**References:** TR.md Section 8.1, GS.md

Create `apps/api/src/adapters/asana/__tests__/reconcile.test.ts`:

Test cases:
- All tasks matched (3 tasks in 1 project, all GIDs present)
- Tasks across 2 projects (correct project grouping, each fetched once)
- Completed task → `asanaCompleted: true`, `asanaStatus: 'completed'`
- Incomplete task → `asanaCompleted: false`, `asanaStatus: 'incomplete'`
- No pushed tasks → empty array, `fetchProjectTasks` never called
- Null `asanaProjectId` → `asanaStatus: 'not_found'`, no API call
- Null `asanaTaskId` → `asanaStatus: 'not_found'`
- GID not found in project response → `asanaStatus: 'not_found'`, warning logged
- All 11 internal metadata fields preserved in output
- No Drizzle `.update()` or `.insert()` calls on the mock

Mock `fetchProjectTasks` at the function level using `vi.mock`.

**Verification:** All test cases pass. `nx run api:test --testPathPattern=adapters/asana/reconcile.test` exits cleanly.

---

### Task 6.2 — Integration tests with mocked HTTP
**Complexity:** Medium
**References:** TR.md Section 8.2, GS.md

Create `apps/api/src/adapters/asana/__tests__/reconcile.integration.test.ts`:

Uses `msw` to intercept Asana HTTP calls at the fetch level.

Test suites:
- Happy path: single project, single page, all matched
- Pagination: 150 tasks, 2 pages; pushed task on page 2 matched correctly
- 401 auth failure: throws `ReconciliationError('ASANA_AUTH_FAILED')`
- 404 project not found: tasks marked `not_found`, no throw
- 429 → 200 retry: succeeds after 1 retry
- 429 exhausted: throws `ReconciliationError('ASANA_UNAVAILABLE')`
- 503 → 503 → 200: succeeds after 2 retries
- Timeout on first request: retried; eventually throws `ReconciliationError('ASANA_TIMEOUT')`
- Multi-project, one 404: correct partial match; no throw

**Verification:** All integration test suites pass. `nx run api:test --testPathPattern=adapters/asana/reconcile.integration` exits cleanly.

---

### Task 6.3 — Verify no Postgres side effects
**Complexity:** Small
**References:** FRS.md FR-09, GS.md data integrity scenarios

Add a dedicated test in `reconcile.test.ts` or `reconcile.integration.test.ts` that:
- Runs a full reconciliation against a mocked DB and Asana
- Asserts that the Drizzle mock received zero `.update()`, `.insert()`, or `.delete()` calls
- Verifies that all tasks in Postgres still have `status = 'pushed'` after reconciliation

**Verification:** Test passes, confirming read-only behavior.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Types and Error Classes | 1.1, 1.2 | Small, Small |
| 2: Asana HTTP Client Extension | 2.1 | Medium |
| 3: Database Query | 3.1 | Small |
| 4: Reconciliation Orchestrator | 4.1, 4.2 | Large, Small |
| 5: Export and Integration | 5.1 | Small |
| 6: Testing | 6.1, 6.2, 6.3 | Medium, Medium, Small |

**Total estimated complexity:** 1 Large task (main orchestrator), 2 Medium tasks (HTTP client extension, unit tests), remainder Small.

**Critical path:** Task 1.1 → 1.2 → 2.1 → 3.1 → 4.2 → 4.1 → 5.1 → 6.1 → 6.2 → 6.3. The main orchestrator (Task 4.1) is the highest-risk task as it coordinates all sub-components and must handle all error paths correctly.
