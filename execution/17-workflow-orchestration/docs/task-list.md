# Task List
## Feature 17: Workflow Orchestration

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 07 (api-scaffolding) is complete — Fastify app, middleware chain (authenticate, loadUser, requireRole), Drizzle ORM, Zod, Pino, error classes, Vitest, response helpers
- [ ] Feature 04 (product-database-schema) is complete — `workflow_runs` table migration applied (schema defined in TR.md Section 4.1)
- [ ] Feature 10 (transcript-endpoints) is complete — `TranscriptRepository` with `findByIdAndClientOrThrow()` is available
- [ ] Feature 11 (task-endpoints) is complete — Mastra can call `POST /clients/{id}/tasks` to save draft tasks
- [ ] Feature 14 (agenda-endpoints) is complete — Mastra can call `POST /clients/{id}/agendas` to save draft agendas
- [ ] Feature 13 (status-reconciliation) is complete — `reconcileTasksForClient` function is exported from the Asana adapter
- [ ] Feature 09 (client-management) is complete — client access validation utility is available
- [ ] Coordinate with Feature 18 (Mastra runtime) team: confirm the Mastra invocation endpoint (`POST ${MASTRA_BASE_URL}/invoke`) and expected payload shape
- [ ] Mastra OIDC client credentials are registered in the auth service with `client_id = 'mastra-agent'` (or the agreed-upon identifier)
- [ ] Environment variables `MASTRA_BASE_URL`, `MASTRA_CLIENT_ID`, `API_BASE_URL` are configured in the development environment

---

## Phase 1: Database Schema and Repository

### Task 1.1 — Add Drizzle ORM schema for `workflow_runs` table
**Complexity:** Small
**References:** TR.md Section 4.3

Add to `packages/database/src/schema.ts` (or the appropriate schema file):
- `workflowTypeEnum` pgEnum: `['intake', 'agenda']`
- `workflowStatusEnum` pgEnum: `['pending', 'running', 'completed', 'failed']`
- `workflowRuns` table definition with all columns: `id`, `workflowType`, `clientId`, `status`, `inputRefs`, `result`, `error`, `triggeredBy`, `startedAt`, `updatedAt`, `completedAt`
- Indexes: `activeRunIdx` (partial index on `client_id, workflow_type, status` where status in pending/running), `clientIdIdx`, `staleIdx`

**Verification:** `nx run database:type-check` passes. Schema matches the SQL DDL in TR.md Section 4.1.

---

### Task 1.2 — Implement `WorkflowRepository`
**Complexity:** Medium
**References:** TR.md Section 5, FRS.md Sections 2-4

Create `apps/api/src/repositories/workflow.repository.ts`:
- `create(data)`: insert new workflow run record, return the created record
- `findByIdOrThrow(workflowRunId)`: select by UUID primary key, throw `NotFoundError('WORKFLOW_RUN_NOT_FOUND')` if not found
- `findActiveRun(clientId, workflowType)`: select where `client_id = $1 AND workflow_type = $2 AND status IN ('pending', 'running')`, return first match or null
- `updateStatus(workflowRunId, updates)`: update `status`, `result`, `error`, `completedAt`, `updatedAt = now()`, return updated record
- `findLastCompletedRun(clientId, workflowType)`: select most recent run where `client_id = $1 AND workflow_type = $2 AND status = 'completed'`, ordered by `completed_at DESC`, limit 1
- `countCompletedTasks(clientId, cycleStart, cycleEnd)`: count tasks where `client_id = $1 AND asanaStatus = 'completed'` within date range (may delegate to a task query helper)

**Verification:** All repository methods execute correct SQL. `findActiveRun` returns null when no active run exists.

---

## Phase 2: Zod Schemas

### Task 2.1 — Implement request/response Zod schemas
**Complexity:** Small
**References:** TR.md Section 9

Create `apps/api/src/schemas/workflow.schemas.ts`:
- `TriggerIntakeSchema`: `client_id` (uuid, required), `transcript_id` (uuid, required)
- `TriggerAgendaSchema`: `client_id` (uuid, required), `cycle_start` (ISO date string, optional), `cycle_end` (ISO date string, optional)
- `WorkflowResultSchema`: `task_short_ids` (string array, optional), `agenda_short_id` (string, optional)
- `WorkflowErrorSchema`: `code` (string), `message` (string)
- `UpdateStatusSchema`: `status` (enum: running/completed/failed), `result` (optional), `error` (optional) with refinement: `error` required when `status === 'failed'`

**Verification:** Valid inputs parse correctly. Invalid inputs produce correct Zod errors. The refinement on `UpdateStatusSchema` rejects `status: 'failed'` without an `error` field.

---

## Phase 3: Mastra Adapter

### Task 3.1 — Implement `MastraAdapter` class
**Complexity:** Medium
**References:** TR.md Section 7

Create `apps/api/src/adapters/mastra.adapter.ts`:
- Constructor: `mastraBaseUrl` (from `MASTRA_BASE_URL`), `tokenProvider` (function that returns a client credentials access token)
- `invokeWorkflowA(params)`: builds `MastraInvocationPayload` with `workflowType: 'intake'`, calls `POST ${mastraBaseUrl}/invoke`
- `invokeWorkflowB(params)`: builds payload with `workflowType: 'agenda'`
- Private `invoke(payload)`: HTTP POST with Bearer token, 10s timeout via `AbortSignal.timeout(10_000)`, throws on non-2xx
- `getCallbackBaseUrl()`: reads from `API_BASE_URL` env var (never from request input — prevents SSRF)

**Verification:**
- Successful invocation (mocked 200): no error
- Mastra returns 500: throws error with status code and body
- Mastra unreachable: throws network error
- 10s timeout: request is aborted after timeout

---

## Phase 4: Mastra Service Account Middleware

### Task 4.1 — Implement `requireMastraServiceAccount` middleware
**Complexity:** Small
**References:** TR.md Section 10

Create `apps/api/src/middleware/require-mastra.ts`:
- Reads `MASTRA_CLIENT_ID` from env (default: `'mastra-agent'`)
- Inspects `req.tokenClaims` for `sub`, `azp`, or `client_id` matching the Mastra client ID
- If not a match: throw `ForbiddenError('This endpoint is restricted to the Mastra service account.')`

**Verification:**
- Token with `sub = 'mastra-agent'`: passes
- Token with `azp = 'mastra-agent'`: passes
- Regular user token: throws 403

---

## Phase 5: Service Layer

### Task 5.1 — Implement `WorkflowService.triggerIntake`
**Complexity:** Medium
**References:** TR.md Section 5.1, FRS.md Section 2

Create `apps/api/src/services/workflow.service.ts`:

`triggerIntake(callerId, clientId, transcriptId)`:
1. Verify transcript exists and belongs to client (`TranscriptRepository.findByIdAndClientOrThrow`)
2. Check for active run (`WorkflowRepository.findActiveRun`) → throw `409 WORKFLOW_ALREADY_RUNNING` if found
3. Create run record: `workflowType: 'intake'`, `status: 'pending'`, `inputRefs: { transcript_id }`, `triggeredBy: callerId`
4. Write audit log: `workflow.triggered`, entity_type `workflow_run`
5. Fire-and-forget: `this.mastraAdapter.invokeWorkflowA(...)`.catch(err => this.handleInvocationFailure(runId, err))`
6. Return the created run record

**Verification:**
- Success: run record created with `pending` status, audit log written, 202 response
- Transcript not found: 422 `TRANSCRIPT_NOT_FOUND`
- Active run exists: 409 `WORKFLOW_ALREADY_RUNNING`
- Mastra invocation failure: run marked `failed` with `MASTRA_INVOCATION_FAILED`

---

### Task 5.2 — Implement `WorkflowService.triggerAgenda`
**Complexity:** Large
**References:** TR.md Section 5.1, FRS.md Section 3

`triggerAgenda(callerId, clientId, cycleStart?, cycleEnd?)`:
1. Check for active run → throw 409 if found
2. Resolve cycle dates: use provided values, or derive `cycleStart` from last completed run, `cycleEnd` from today. 30-day fallback if no prior run exists.
3. Trigger status reconciliation (`ReconciliationService.reconcileClient(clientId)`)
4. Count completed tasks for the cycle window → throw `422 NO_COMPLETED_TASKS` if zero
5. Create run record: `workflowType: 'agenda'`, `status: 'pending'`, `inputRefs: { cycle_start, cycle_end }`
6. Write audit log
7. Fire-and-forget: `this.mastraAdapter.invokeWorkflowB(...)`
8. Return run record

**Verification:**
- Success: run created, reconciliation called, Mastra invoked
- No completed tasks: 422 `NO_COMPLETED_TASKS`, no run record created, Mastra NOT invoked
- Active run exists: 409
- Reconciliation failure: propagates error (e.g., `ReconciliationError`)
- Explicit cycle dates used when provided; derived dates used otherwise

---

### Task 5.3 — Implement `WorkflowService.getStatus`
**Complexity:** Small
**References:** TR.md Section 5.1, FRS.md Section 4

`getStatus(callerId, workflowRunId)`:
1. Find run by ID or throw 404
2. Lazy timeout check: if status is `pending` or `running` and `updatedAt` is older than `WORKFLOW_TIMEOUT_MS`, mark as `failed` with `WORKFLOW_TIMEOUT`
3. Return the (possibly updated) run record

**Verification:**
- Active run within timeout: returns current status
- Active run past timeout: transitions to `failed` with `WORKFLOW_TIMEOUT`, audit log entry `workflow.timed_out`
- Non-existent run: 404 `WORKFLOW_RUN_NOT_FOUND`

---

### Task 5.4 — Implement `WorkflowService.updateStatus` (Mastra callback)
**Complexity:** Medium
**References:** TR.md Section 5.1, FRS.md Section 5

`updateStatus(workflowRunId, newStatus, result?, error?)`:
1. Find run by ID or throw 404
2. Validate status transition against the allowed transitions matrix:
   - `pending → running | failed`
   - `running → completed | failed`
   - `completed → (none)`
   - `failed → (none)`
   - Invalid transition: throw `422 INVALID_STATUS_TRANSITION`
3. Update run record: `status`, `result`, `error`, `completedAt` (set on terminal states), `updatedAt = now()`
4. Write audit log: `workflow.started` / `workflow.completed` / `workflow.failed`
5. Return updated run record

**Verification:**
- `pending → running`: succeeds, audit log `workflow.started`
- `running → completed`: succeeds with result metadata, `completedAt` set, audit log `workflow.completed`
- `running → failed`: succeeds with error detail, audit log `workflow.failed`
- `pending → completed`: throws 422 `INVALID_STATUS_TRANSITION`
- `completed → running`: throws 422

---

### Task 5.5 — Implement helper methods
**Complexity:** Small
**References:** TR.md Section 5.1

- `handleInvocationFailure(runId, err)`: marks run as `failed` with `MASTRA_INVOCATION_FAILED`, logs error
- `resolveCycleStart(clientId)`: finds last completed agenda run for client, returns its `completedAt` date, or 30-day fallback
- `markTimedOut(run)`: updates run to `failed` with `WORKFLOW_TIMEOUT`, writes audit log `workflow.timed_out`

**Verification:** Each helper performs the correct database update and logging.

---

## Phase 6: Route Handlers

### Task 6.1 — Implement `POST /workflows/intake` route
**Complexity:** Small
**References:** TR.md Section 8, FRS.md Section 2

In `apps/api/src/routes/workflows.ts`:
- Register `POST /workflows/intake` with `preHandler: [requireRole('account_manager', 'admin')]`
- Parse body with `TriggerIntakeSchema`
- Check client access with `requireClientAccess(req, body.client_id)`
- Call `workflowService.triggerIntake(req.user.id, body.client_id, body.transcript_id)`
- Return `202 Accepted` with `{ data: { workflow_run_id, workflow_type, status, poll_url, started_at } }`

**Verification:** Full HTTP round-trip: valid request → 202 with run ID and poll URL.

---

### Task 6.2 — Implement `POST /workflows/agenda` route
**Complexity:** Small
**References:** TR.md Section 8, FRS.md Section 3

Same pattern as Task 6.1:
- Parse with `TriggerAgendaSchema`
- Check client access
- Call `workflowService.triggerAgenda(...)`
- Return `202 Accepted` with `{ data: { ..., input_refs: { cycle_start, cycle_end } } }`

**Verification:** Full HTTP round-trip: valid request with completed tasks → 202.

---

### Task 6.3 — Implement `GET /workflows/:id/status` route
**Complexity:** Small
**References:** TR.md Section 8, FRS.md Section 4

- No role restriction (any authenticated user)
- Call `workflowService.getStatus(req.user.id, id)`
- Check client access after fetching run (to get 404 before 403)
- Return `200 OK` with full `WorkflowStatusResponse` shape

**Verification:** Returns correct status for pending, running, completed, and failed runs. Timed-out run returns `failed`.

---

### Task 6.4 — Implement `PATCH /workflows/:id/status` route (Mastra callback)
**Complexity:** Small
**References:** TR.md Section 8, FRS.md Section 5

- `preHandler: [requireMastraServiceAccount]`
- Parse with `UpdateStatusSchema`
- Call `workflowService.updateStatus(id, body.status, body.result, body.error)`
- Return `200 OK` with updated run record

**Verification:** Mastra service token accepted. Invalid transitions rejected with 422. Regular user token rejected with 403.

---

### Task 6.5 — Register workflow routes in the Fastify app
**Complexity:** Small
**References:** TR.md Section 8

Register the `workflowRoutes` plugin in the Fastify app's route registration, passing the `WorkflowService` instance and its dependencies.

**Verification:** All four endpoints respond to requests. Unknown routes return 404.

---

## Phase 7: Environment Configuration

### Task 7.1 — Add environment variables to config
**Complexity:** Small
**References:** TR.md Section 11

Update `apps/api/src/config/env.ts` (or equivalent):
- `MASTRA_BASE_URL`: `z.string().url()` — required
- `MASTRA_CLIENT_ID`: `z.string().default('mastra-agent')`
- `API_BASE_URL`: `z.string().url()` — required
- `WORKFLOW_TIMEOUT_MS`: `z.coerce.number().int().positive().default(300_000)` (5 minutes)

**Verification:** App starts with valid env. App fails fast with clear error message if required vars are missing.

---

## Phase 8: Testing

### Task 8.1 — Unit tests for `WorkflowService`
**Complexity:** Medium
**References:** TR.md Section 15.1

Create `apps/api/src/services/__tests__/workflow.service.test.ts`:

All dependencies (repository, transcript repo, reconciliation service, Mastra adapter, audit service) are mocked via `vi.mock`.

Test cases for `triggerIntake`:
- Success: run created, audit logged, Mastra invoked, 202 shape
- Transcript not found: throws 422
- Active run exists: throws 409
- Completed run exists for same client (allowed): new run created
- Mastra invocation failure: run marked failed asynchronously

Test cases for `triggerAgenda`:
- Success with completed tasks: run created, reconciliation called, Mastra invoked
- No completed tasks: throws 422, no run created
- Active run: throws 409
- Explicit cycle dates used when provided
- Derived cycle dates: last run's `completedAt` used as start; today as end
- No prior run: 30-day fallback for cycle start

Test cases for `getStatus`:
- Returns current status for active run
- Lazy timeout: run past threshold → marked failed with `WORKFLOW_TIMEOUT`
- Non-existent run: throws 404

Test cases for `updateStatus`:
- Valid transitions: `pending→running`, `running→completed`, `running→failed`
- Invalid transitions: `pending→completed`, `completed→running`
- Audit log entries created for each valid transition
- `completedAt` set on terminal states

**Verification:** All test cases pass with >85% coverage.

---

### Task 8.2 — Unit tests for `MastraAdapter`
**Complexity:** Small
**References:** TR.md Section 15.1

Create `apps/api/src/adapters/__tests__/mastra.adapter.test.ts`:

Test cases:
- Successful invocation: no error, correct payload shape sent
- HTTP error (500): throws with status and body
- Network failure: throws
- Timeout (AbortSignal): request aborted after 10s
- Callback base URL sourced from env, not from user input

**Verification:** All tests pass.

---

### Task 8.3 — Unit tests for `requireMastraServiceAccount`
**Complexity:** Small
**References:** TR.md Section 15.1

Create `apps/api/src/middleware/__tests__/require-mastra.test.ts`:

Test cases:
- `sub = 'mastra-agent'`: passes (no error thrown)
- `azp = 'mastra-agent'`: passes
- `client_id = 'mastra-agent'`: passes
- Regular user with `sub = 'user-uuid'`: throws 403
- Missing token claims: throws 403

**Verification:** All tests pass.

---

### Task 8.4 — Unit tests for Zod schemas
**Complexity:** Small
**References:** TR.md Section 15.1

Create `apps/api/src/schemas/__tests__/workflow.schemas.test.ts`:

Test cases:
- `TriggerIntakeSchema`: valid → passes; missing `transcript_id` → error; non-UUID → error
- `TriggerAgendaSchema`: valid with optional dates → passes; invalid date format → error
- `UpdateStatusSchema`: `failed` without `error` → refinement error; `completed` with `result` → passes; `running` → passes
- Unknown fields are stripped

**Verification:** All edge cases handled correctly.

---

### Task 8.5 — Integration tests for workflow routes
**Complexity:** Medium
**References:** TR.md Section 15.2

Create `apps/api/src/routes/__tests__/workflows.route.test.ts`:

Full HTTP round-trip tests using test database and `msw` for Mastra invocation.

Test scenarios:
- `POST /workflows/intake` → 202 with run ID and poll URL
- `POST /workflows/intake` without auth → 401
- `POST /workflows/intake` with team_member role → 403
- `POST /workflows/intake` with non-existent transcript → 422
- `POST /workflows/intake` with active run → 409
- `POST /workflows/intake` with completed prior run → 202 (allowed)
- `POST /workflows/agenda` with completed tasks → 202
- `POST /workflows/agenda` with no completed tasks → 422
- `GET /workflows/{id}/status` for pending run → 200 with status `pending`
- `GET /workflows/{id}/status` for completed run → 200 with result
- `GET /workflows/{id}/status` for timed-out run → 200 with status `failed`, error `WORKFLOW_TIMEOUT`
- `GET /workflows/{id}/status` for non-existent → 404
- `GET /workflows/{id}/status` for different client → 403
- `PATCH /workflows/{id}/status` with Mastra token → 200
- `PATCH /workflows/{id}/status` with user token → 403
- `PATCH /workflows/{id}/status` invalid transition → 422

**Verification:** All integration tests pass.

---

### Task 8.6 — Verify audit log coverage
**Complexity:** Small
**References:** FRS.md Section 10, TR.md Section 12

Add test assertions (in existing integration tests or a dedicated test) confirming:
- `workflow.triggered` audit entry created on trigger
- `workflow.started` audit entry on `pending → running`
- `workflow.completed` audit entry on `running → completed`
- `workflow.failed` audit entry on `running → failed`
- `workflow.timed_out` audit entry on lazy timeout

**Verification:** All audit entries created with correct `action`, `entity_type`, `user_id` (null for Mastra callbacks), and `metadata`.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Database Schema and Repository | 1.1, 1.2 | Small, Medium |
| 2: Zod Schemas | 2.1 | Small |
| 3: Mastra Adapter | 3.1 | Medium |
| 4: Mastra Middleware | 4.1 | Small |
| 5: Service Layer | 5.1, 5.2, 5.3, 5.4, 5.5 | Medium, Large, Small, Medium, Small |
| 6: Route Handlers | 6.1, 6.2, 6.3, 6.4, 6.5 | Small, Small, Small, Small, Small |
| 7: Environment Config | 7.1 | Small |
| 8: Testing | 8.1, 8.2, 8.3, 8.4, 8.5, 8.6 | Medium, Small, Small, Small, Medium, Small |

**Total estimated complexity:** 1 Large task (triggerAgenda — reconciliation + pre-flight checks + async invocation), 5 Medium tasks, remainder Small.

**Critical path:** Task 1.1 → 1.2 → 2.1 → 3.1 → 4.1 → 5.5 → 5.1 → 5.2 → 5.3 → 5.4 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 7.1 → 8.1 → 8.5.

**Parallelization opportunity:** Tasks 3.1 (Mastra adapter), 4.1 (Mastra middleware), and 2.1 (Zod schemas) have no interdependencies and can be built in parallel. Similarly, route handlers (Phase 6) can be developed in parallel once the service layer is complete.

**Highest risk area:** Task 5.2 (`triggerAgenda`) is the most complex. It orchestrates status reconciliation (Feature 13 dependency), completed task counting, cycle date resolution, and async Mastra invocation — all with specific error handling. Schedule this task with adequate time for thorough testing of the reconciliation-to-invocation flow.
