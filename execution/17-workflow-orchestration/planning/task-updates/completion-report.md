# Feature 17: Workflow Orchestration -- Completion Report

**Date:** 2026-03-05

---

## Tasks Verified Complete

### Phase 1: Schema and Foundation
- **Task 1.1** -- `workflow_type` enum, `workflow_status` enum, `workflowRuns` table, all three indexes (active_run partial, client_id, stale partial) are defined in `packages/database/src/schema.ts` (lines 555-604). Relations defined (lines 606-615). Migration file `packages/database/migrations/0000_equal_rage.sql` includes CREATE TYPE, CREATE TABLE, and CREATE INDEX statements.
- **Task 1.2** -- All five env vars added to `apps/api/src/config/env.ts`: `MASTRA_BASE_URL` (optional URL), `MASTRA_CLIENT_ID` (default 'mastra-agent'), `API_BASE_URL` (optional URL), `WORKFLOW_TIMEOUT_MS` (default 300000), `ADMIN_OWNER` (optional UUID). `.env.example` updated with all placeholders.

### Phase 2: Data Access Layer
- **Task 2.1** -- `WorkflowRepository` implemented in `apps/api/src/repositories/workflow.repository.ts` (224 lines) with all six functions: `createWorkflowRun`, `findWorkflowRunByIdOrThrow`, `findActiveRun`, `updateWorkflowRunStatus`, `findLastCompletedRun`, `countCompletedTasks`.

### Phase 3: Adapters and Middleware
- **Task 3.1** -- `MastraAdapter` implemented in `apps/api/src/adapters/mastra.adapter.ts` (80 lines) with `invokeWorkflowA`, `invokeWorkflowB`, private `invoke` with 10s AbortSignal timeout, `callbackBaseUrl` from constructor param (sourced from API_BASE_URL at composition root).
- **Task 3.2** -- `requireMastraServiceAccount` middleware in `apps/api/src/middleware/require-mastra.ts` (30 lines). Checks `sub`, `azp`, `client_id` claims against `MASTRA_CLIENT_ID` env var.

### Phase 4: Service Layer
- **Task 4.1** -- `WorkflowService.triggerIntake` implemented. Verifies transcript belongs to client, checks for active run (409 conflict), creates pending run record, writes audit log `workflow.triggered`, fire-and-forget Mastra invocation with catch -> `handleInvocationFailure`.
- **Task 4.2** -- `WorkflowService.triggerAgenda` implemented. Checks active run, resolves cycle dates (provided or derived), calls reconciliation service, checks completed tasks count (422 if zero), creates run, audit log, fire-and-forget Mastra invocation. `resolveCycleStart` falls back to last completed run date or 30-day window.
- **Task 4.3** -- `WorkflowService.getStatus` implemented with lazy timeout detection. Checks age against `WORKFLOW_TIMEOUT_MS`, calls `markTimedOut` if exceeded. `markTimedOut` sets status to failed with `WORKFLOW_TIMEOUT` error code and writes `workflow.timed_out` audit entry.
- **Task 4.4** -- `WorkflowService.updateStatus` implemented. Validates transition against `ALLOWED_TRANSITIONS` map, sets `completedAt` on terminal states, writes appropriate audit action (`workflow.started`, `workflow.completed`, `workflow.failed`).
- **ALLOWED_TRANSITIONS** verified correct: `pending->running`, `pending->failed`, `running->completed`, `running->failed`, `completed->[]`, `failed->[]`.

### Phase 5: Routes
- **Task 5.1** -- Zod schemas in `apps/api/src/schemas/workflow.schemas.ts` (37 lines): `TriggerIntakeSchema`, `TriggerAgendaSchema` (with YYYY-MM-DD regex), `WorkflowResultSchema`, `WorkflowErrorSchema`, `UpdateStatusSchema` (with refinement: error required when status=failed). Type exports included.
- **Task 5.2** -- Routes in `apps/api/src/routes/workflows.ts` (218 lines): POST /workflows/intake (202), POST /workflows/agenda (202), GET /workflows/:id/status (200 via sendSuccess), PATCH /workflows/:id/status (200, requireMastraServiceAccount). `formatRunResponse` helper shapes the response. Route registered in `apps/api/src/app.ts` inside protected scope (line 139).

### Phase 6: Tests
- **Task 6.3** -- `workflow.service.test.ts` (384 lines, 23 tests) covers triggerIntake (5 tests), triggerAgenda (5 tests), getStatus (5 tests), updateStatus (5 tests including invalid transition tests).
- **Task 6.5** -- `workflow.schemas.test.ts` (130 lines, 14 tests) covers TriggerIntakeSchema (4 tests), TriggerAgendaSchema (4 tests), UpdateStatusSchema (6 tests).

---

## Tasks That Needed Fixes

### Test Assertion Fix (3 tests)
The three `updateStatus` rejection tests in `workflow.service.test.ts` were asserting `.rejects.toThrow('INVALID_STATUS_TRANSITION')` but the `ApiError` class stores `INVALID_STATUS_TRANSITION` as the `code` property, not the `message`. The `toThrow` matcher checks the `message` field, which contains the human-readable string (e.g., `"Cannot transition workflow run from 'pending' to 'completed'."`).

**Fix:** Updated the three test assertions to match the actual error message strings:
- `"Cannot transition workflow run from 'pending' to 'completed'."`
- `"Cannot transition workflow run from 'completed' to 'running'."`
- `"Cannot transition workflow run from 'failed' to 'running'."`

---

## Remaining Gaps

1. **Task 6.1 (WorkflowRepository unit tests)** -- Not yet created. Repository functions are tested indirectly via service tests with mocked repo layer.
2. **Task 6.2 (MastraAdapter unit tests)** -- Not yet created. Adapter is mocked in service tests.
3. **Task 6.4 (Route integration tests)** -- Not yet created. Routes are tested only at the service layer.
4. **Tasks 7.1-7.4 (Integration verification)** -- Manual coordination and smoke testing tasks. Cannot be automated.
5. **MASTRA_BASE_URL and API_BASE_URL are marked optional** in env.ts (`.optional()`), while the task list says startup should fail if they are missing. This is a deliberate design choice for local development -- the MastraAdapter is conditionally created only when `MASTRA_BASE_URL` is set (app.ts line 127).

---

## Type-Check Result

```
npx nx run api:type-check
```

**No workflow/mastra-related type errors.** There are 4 pre-existing type errors in unrelated files (`google-docs-client.ts` and `post-transcript.ts`) that are not part of Feature 17.

---

## Test Result

```
npx nx run api:test -- workflows
```

**All 37 tests pass** (14 schema + 23 service) after the assertion fix.

```
Test Files  2 passed (2)
     Tests  37 passed (37)
  Duration  433ms
```
