# Task List — Feature 11: Task Endpoints

**Feature Name:** task-endpoints
**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03
**Output Directory:** `/execution/11-task-endpoints/`

---

## Prerequisites (Blocked By)

Before beginning any task in this list, confirm the following features are complete:
- Feature 04 (product-database-schema) — Tasks table, Task Versions table, task_short_id_seq, audit_log table, enums
- Feature 07 (api-scaffolding) — App instance, route registration, token validation middleware, error handler, DB pool
- Feature 09 (client-management) — Client read queries, client access validation middleware

---

## Phase A: Foundation

### A1. Verify Database Prerequisites
- [ ] Confirm `tasks` table exists with all columns specified in TR.md Section 3.1 (including `external_ref JSONB`, NOT `asana_task_id VARCHAR`)
- [ ] Confirm `task_versions` table exists with columns from TR.md Section 3.3
- [ ] Confirm `task_short_id_seq` PostgreSQL sequence exists (TR.md Section 3.2)
- [ ] Confirm `next_task_short_id()` SQL function exists and returns `TSK-####` format
- [ ] Confirm all four indexes exist (TR.md Section 3.4): `tasks_short_id_idx`, `tasks_client_status_idx`, `tasks_transcript_id_idx`, `task_versions_task_id_idx`
- [ ] Confirm `task_status` enum values are exactly: `draft`, `approved`, `rejected`, `pushed` (no `completed`)
- [ ] Confirm `version_source` enum values are: `agent`, `ui`, `terminal`
- **Complexity:** Small
- **References:** TR.md Section 3, FRS.md FR-SID-01 through FR-SID-04

### A2. Create Short ID Resolution Utility
- [ ] Implement `resolveTaskId(idParam, db)` utility function (TR.md Section 4)
- [ ] Pattern match against `TSK-\d+` (case-insensitive)
- [ ] If short ID: query `tasks` by `short_id` using `tasks_short_id_idx`; throw `TASK_NOT_FOUND` if not found
- [ ] If not a short ID: validate UUID format; throw `INVALID_ID_FORMAT` if invalid
- [ ] Return the resolved UUID in both cases
- [ ] Write unit tests covering: valid short ID, valid UUID, unknown short ID, invalid format
- **Complexity:** Small
- **References:** TR.md Section 4, FRS.md FR-CCR-01, GS.md Feature: Get Task Detail

### A3. Create Source Detection Utility
- [ ] Implement `detectSource(request)` utility that inspects the request to return `'agent' | 'ui' | 'terminal'`
- [ ] Logic: service account token → `agent`; `X-Client-Type: terminal` header → `terminal`; otherwise → `ui`
- [ ] Confirm `X-Client-Type` header convention with Feature 07 implementation; align if needed
- [ ] Write unit tests for each of the three source values
- **Complexity:** Small
- **References:** TR.md Section 6, FRS.md FR-CCR-03

### A4. Create Task Data Access Layer
- [ ] Create `tasks.repository.ts` (or equivalent) with typed query functions:
  - `insertTasks(tasks[], clientId, transcriptId, source)` — batch insert returning created rows
  - `findTaskByShortId(shortId)` — single lookup via index
  - `findTaskById(uuid)` — single lookup by primary key
  - `findTasksByClient(clientId, filters, pagination)` — list with filter/pagination
  - `updateTask(id, fields)` — partial update, sets `updated_at`
  - `insertTaskVersion(taskId, data)` — append version record
  - `getLatestVersionNumber(taskId)` — returns highest version number for a task
  - `findTaskWithVersions(id)` — task + all versions (ordered by version ASC)
- [ ] All queries use parameterized inputs (no string interpolation)
- **Complexity:** Medium
- **References:** TR.md Sections 3.1, 3.3, FRS.md all sections

### A5. Create Audit Log Utility
- [ ] Implement `writeAuditEntry(action, entityType, entityId, userId, metadata, source)` using the audit_log table from Feature 04
- [ ] Confirm this utility does not already exist in Feature 07 or Feature 09; reuse if it does
- [ ] Ensure non-blocking (audit write failure should not roll back the primary operation — log and swallow)
- **Complexity:** Small
- **References:** TR.md Section 7, FRS.md FR-CRT-06, FR-EDT-04, FR-APR-04, FR-REJ-04, FR-PSH-06

---

## Phase B: Core Endpoints

### B1. Implement POST /clients/{client_id}/tasks
- [ ] Register route in the API router following the pattern established in Feature 07
- [ ] Apply client access middleware (validates `client_id` against user's accessible clients)
- [ ] Validate request body against schema (TR.md Section 2.1): `transcript_id` required, `tasks` array with at least 1 item, required fields per task item
- [ ] Validate `transcript_id` belongs to the specified client; return `TRANSCRIPT_NOT_FOUND` if not
- [ ] For each task in the array, inside a transaction:
  - [ ] Call `next_task_short_id()` to obtain the next short ID
  - [ ] Insert task row with `status = 'draft'` and `scrum_stage = 'Backlog'` defaults
  - [ ] Insert Task Version row with `version = 1` and detected source
- [ ] Write one `task.created` audit entry per created task (TR.md Section 7)
- [ ] Return 201 with array of created task summaries
- **Complexity:** Medium
- **References:** FRS.md FR-CRT-01 through FR-CRT-09, GS.md Feature: Create Draft Tasks, TR.md Section 2.1

### B2. Implement GET /clients/{client_id}/tasks
- [ ] Register route
- [ ] Apply client access middleware
- [ ] Parse and validate query parameters: `status` (enum check), `transcript_id` (UUID format), `page` (positive integer), `per_page` (1–100, cap at 100)
- [ ] Build query with applicable filters; sort by `created_at DESC`
- [ ] Return paginated response with `data` array and `pagination` object (TR.md Section 2.2)
- [ ] Task summary objects must NOT include `versions` array (full versions only on detail endpoint)
- **Complexity:** Small
- **References:** FRS.md FR-LST-01 through FR-LST-04, GS.md Feature: List Tasks, TR.md Section 2.2

### B3. Implement GET /tasks/{id}
- [ ] Register route (no `client_id` in path)
- [ ] Resolve `{id}` via the short ID resolution utility (Task A2)
- [ ] Fetch task + all versions via `findTaskWithVersions`
- [ ] Cross-check task's `client_id` against user's accessible clients; return `FORBIDDEN` if not accessible
- [ ] Return full task detail response including `versions` array ordered by version ASC (TR.md Section 2.3)
- **Complexity:** Small
- **References:** FRS.md FR-DET-01 through FR-DET-05, GS.md Feature: Get Task Detail, TR.md Section 2.3

### B4. Implement PATCH /tasks/{id}
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify task `client_id` is accessible to the caller
- [ ] Validate task status is `draft` or `rejected`; return `TASK_NOT_EDITABLE` (422) otherwise
- [ ] Validate and strip request body: only allow editable fields (TR.md Section 2.4); silently ignore `status`, `short_id`, `client_id`, `transcript_id`, `approved_by`, `approved_at`, `pushed_at`
- [ ] Validate `estimated_time` format (`HH:MM`) if provided; return `VALIDATION_ERROR` if malformed
- [ ] Update task record, set `updated_at`
- [ ] Compute next version number via `getLatestVersionNumber` + 1
- [ ] Insert Task Version row capturing changed content, `edited_by`, and detected source
- [ ] Write `task.edited` audit entry with `changed_fields`, `previous_values`, `new_values` in metadata
- [ ] Return updated full task detail (including updated `versions` array)
- **Complexity:** Medium
- **References:** FRS.md FR-EDT-01 through FR-EDT-06, GS.md Feature: Edit Draft Task, TR.md Section 2.4

---

## Phase C: Status Transition Endpoints

### C1. Implement POST /tasks/{id}/approve
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify task `client_id` is accessible to the caller
- [ ] Enforce role check: caller must have `account_manager` or `admin` role; return `FORBIDDEN` (403) otherwise
- [ ] Verify task status is `draft`; return `TASK_NOT_APPROVABLE` (422) with `current_status` in details otherwise
- [ ] Update task: `status = 'approved'`, `approved_by = caller.id`, `approved_at = now()`, `updated_at = now()`
- [ ] Write `task.approved` audit entry
- [ ] Return updated full task detail
- **Complexity:** Small
- **References:** FRS.md FR-APR-01 through FR-APR-06, GS.md Feature: Approve Task, TR.md Section 2.5

### C2. Implement POST /tasks/{id}/reject
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify task `client_id` is accessible to the caller
- [ ] Verify task status is `draft` or `approved`; return `TASK_NOT_REJECTABLE` (422) for `pushed` tasks
- [ ] Parse optional `reason` from request body
- [ ] Update task: `status = 'rejected'`, clear `approved_by = null`, clear `approved_at = null`, `updated_at = now()`
- [ ] Write `task.rejected` audit entry, include `reason` and `previous_status` in metadata
- [ ] Return updated full task detail
- **Complexity:** Small
- **References:** FRS.md FR-REJ-01 through FR-REJ-07, GS.md Feature: Reject Task, TR.md Section 2.6

### C3. Implement Workspace Routing Service
- [ ] Implement `resolveWorkspace(task, client)` function (TR.md Section 5)
- [ ] Step 1: return task-level `asana_workspace_id` if set
- [ ] Step 2: return client `default_asana_workspace_id` if set
- [ ] Step 3: throw `WORKSPACE_NOT_CONFIGURED` business error
- [ ] Write unit tests for all three branches
- **Complexity:** Small
- **References:** TR.md Section 5, FRS.md FR-PSH-02, GS.md Feature: Push Task — workspace routing scenarios

### C4. Define Feature 12 Internal Interface
- [ ] Define the `OutputNormalizerService` interface / abstract class (TR.md Section 12)
- [ ] Create a stub implementation that throws `NotImplementedError` (to be replaced when Feature 12 is built)
- [ ] Wire the stub into the dependency injection / module system established in Feature 07
- [ ] Add integration-test-friendly override point so push tests can inject a mock normalizer
- **Complexity:** Small
- **References:** TR.md Section 12

### C5. Implement POST /tasks/{id}/push
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify task `client_id` is accessible to the caller
- [ ] Verify task status is `approved`; return `TASK_NOT_PUSHABLE` (422) otherwise
- [ ] Load client record to obtain `default_asana_workspace_id`
- [ ] Call `resolveWorkspace(task, client)` to determine routing; catch and return `WORKSPACE_NOT_CONFIGURED`
- [ ] Build `NormalizedTask` payload from task record (including `client_name` from the client record)
- [ ] Call `outputNormalizerService.pushTask(normalizedTask, workspace)` via the interface from C4
- [ ] On success: update task with `status = 'pushed'`, `external_ref = result`, `pushed_at = now()`, `updated_at = now()`; write `task.pushed` audit entry; return updated task
- [ ] On normalizer error: do NOT change task status; wrap error as `PUSH_FAILED` (502) and return
- **Complexity:** Medium
- **References:** FRS.md FR-PSH-01 through FR-PSH-10, GS.md Feature: Push Task, TR.md Sections 2.7, 5, 12

---

## Phase D: Batch Operations

### D1. Implement Batch Approve Helper
- [ ] Create internal `batchApprove(taskIds[], clientId, callerUser)` function
- [ ] Resolve each ID (UUID or short ID) using the resolution utility
- [ ] For each resolved task, call the same approve service logic as C1
- [ ] Collect results: `{ task_id, success, task?, error? }` per item
- [ ] Return results array + summary counts
- [ ] Error in one task does not abort others (`Promise.allSettled` or sequential try/catch)
- **Complexity:** Medium
- **References:** FRS.md FR-BAP-01 through FR-BAP-05, GS.md Feature: Batch Approve Tasks, TR.md Section 8

### D2. Implement POST /clients/{client_id}/tasks/approve (batch route)
- [ ] Register route — IMPORTANT: register this before `POST /clients/{id}/tasks/:taskId` to avoid routing conflicts; specifically, the literal path segment `approve` must take precedence over the parameterized `:taskId`
- [ ] Apply client access middleware
- [ ] Apply role check (account_manager or admin) at the route level; if unauthorized, return `FORBIDDEN` immediately (do not process individual tasks)
- [ ] Validate request body: `task_ids` must be an array of 1–50 elements
- [ ] Call batch approve helper (D1)
- [ ] Return `BatchOperationResponse` (TR.md Section 2.8) with HTTP 200 always
- **Complexity:** Small
- **References:** FRS.md FR-BAP-01 through FR-BAP-05, GS.md Feature: Batch Approve Tasks, TR.md Section 2.8

### D3. Implement Batch Push Helper
- [ ] Create internal `batchPush(taskIds[], clientId, callerUser)` function
- [ ] Resolve each ID using the resolution utility
- [ ] For each resolved task, call the same push service logic as C5
- [ ] Collect results with partial success model
- [ ] Return results array + summary counts
- **Complexity:** Medium
- **References:** FRS.md FR-BPS-01 through FR-BPS-04, GS.md Feature: Batch Push Tasks, TR.md Section 8

### D4. Implement POST /clients/{client_id}/tasks/push (batch route)
- [ ] Register route — same routing precedence consideration as D2
- [ ] Apply client access middleware
- [ ] Validate request body: `task_ids` must be an array of 1–50 elements
- [ ] Call batch push helper (D3)
- [ ] Return `BatchOperationResponse` with HTTP 200 always
- **Complexity:** Small
- **References:** FRS.md FR-BPS-01 through FR-BPS-04, GS.md Feature: Batch Push Tasks, TR.md Section 2.9

---

## Phase E: Testing

### E1. Unit Tests — Short ID Utility
- [ ] Covers: first ID is `TSK-0001`, sequences increment, IDs > 9999 produce `TSK-10000`+, resolution of valid short ID, resolution of UUID, unknown short ID → error, invalid format → error
- **Complexity:** Small
- **References:** GS.md Feature: Short ID Generation, TR.md Section 4

### E2. Unit Tests — Workspace Routing Service
- [ ] Covers: task-level override wins, falls back to client default, both null → WORKSPACE_NOT_CONFIGURED
- **Complexity:** Small
- **References:** GS.md Feature: Push Task — workspace routing scenarios, TR.md Section 5

### E3. Unit Tests — Source Detection
- [ ] Covers: service account token → `agent`, `X-Client-Type: terminal` → `terminal`, browser user → `ui`
- **Complexity:** Small
- **References:** TR.md Section 6

### E4. Integration Tests — Create Draft Tasks
- [ ] Happy path: batch creation returns 201, short IDs assigned, version 1 created, audit entries written
- [ ] Missing title → 422 VALIDATION_ERROR
- [ ] Unknown transcript_id → 422 TRANSCRIPT_NOT_FOUND
- [ ] Inaccessible client → 404 CLIENT_NOT_FOUND
- [ ] Custom short_id in body is ignored
- **Complexity:** Medium
- **References:** GS.md Feature: Create Draft Tasks

### E5. Integration Tests — List Tasks
- [ ] No filter returns all tasks for client, sorted by created_at DESC
- [ ] Status filter returns correct subset
- [ ] Transcript filter returns correct subset
- [ ] Pagination returns correct page, total, total_pages
- [ ] per_page > 100 is capped at 100
- **Complexity:** Small
- **References:** GS.md Feature: List Tasks

### E6. Integration Tests — Get Task Detail
- [ ] Fetch by short ID returns full detail including versions
- [ ] Fetch by UUID returns identical result
- [ ] Unknown short ID → 404
- [ ] Task from inaccessible client → 403
- **Complexity:** Small
- **References:** GS.md Feature: Get Task Detail

### E7. Integration Tests — Edit Task
- [ ] Successful PATCH on draft creates version 2 with correct source and edited_by
- [ ] PATCH on rejected task succeeds
- [ ] PATCH on approved task → 422 TASK_NOT_EDITABLE
- [ ] PATCH on pushed task → 422 TASK_NOT_EDITABLE
- [ ] Non-editable fields (status, short_id) are silently ignored
- [ ] Invalid estimated_time format → 422 VALIDATION_ERROR
- [ ] Audit entry written with changed fields
- **Complexity:** Medium
- **References:** GS.md Feature: Edit Draft Task

### E8. Integration Tests — Approve Task
- [ ] account_manager approves draft → 200, status=approved, approved_by and approved_at set
- [ ] admin approves draft → 200
- [ ] team_member attempt → 403 FORBIDDEN
- [ ] Already-approved task → 422 TASK_NOT_APPROVABLE with current_status
- [ ] Pushed task → 422 TASK_NOT_APPROVABLE
- [ ] Rejected task → 422 TASK_NOT_APPROVABLE
- **Complexity:** Medium
- **References:** GS.md Feature: Approve Task

### E9. Integration Tests — Reject Task
- [ ] Reject draft with reason → 200, status=rejected, approval fields cleared, reason in audit
- [ ] Reject without reason → 200
- [ ] Reject approved task → 200, approval fields cleared
- [ ] Reject pushed task → 422 TASK_NOT_REJECTABLE
- [ ] Rejected task can be edited and re-approved
- **Complexity:** Medium
- **References:** GS.md Feature: Reject Task

### E10. Integration Tests — Push Task
- [ ] Approved task with task-level workspace → mock normalizer called with correct workspace → 200, status=pushed, external_ref populated
- [ ] Approved task falls back to client workspace → 200
- [ ] No workspace configured → 422 WORKSPACE_NOT_CONFIGURED, status unchanged
- [ ] Draft task → 422 TASK_NOT_PUSHABLE
- [ ] Pushed task → 422 TASK_NOT_PUSHABLE
- [ ] Normalizer throws error → 502 PUSH_FAILED, task status unchanged, no pushed audit entry
- **Complexity:** Large
- **References:** GS.md Feature: Push Task

### E11. Integration Tests — Batch Approve
- [ ] All succeed → 200, all results success=true, summary correct
- [ ] Partial failure (some not approvable) → 200, per-task results, summary correct
- [ ] Unknown task ID in batch → TASK_NOT_FOUND in that result, others proceed
- [ ] 51 task_ids → 422 VALIDATION_ERROR
- [ ] team_member caller → all results FORBIDDEN
- [ ] Audit entries written only for succeeded tasks
- **Complexity:** Medium
- **References:** GS.md Feature: Batch Approve Tasks

### E12. Integration Tests — Batch Push
- [ ] All approved with workspace → all succeed
- [ ] Partial failure (draft task, no workspace) → partial success per-task results
- [ ] Normalizer fails for one task → that task PUSH_FAILED, others succeed
- **Complexity:** Medium
- **References:** GS.md Feature: Batch Push Tasks

---

## Phase F: Documentation and Handoff

### F1. Update Memory Bank
- [ ] Document task-endpoints patterns in `memory-bank/systemPatterns.md` (or create it):
  - Short ID resolution pattern
  - Batch operation partial-success pattern
  - Source detection convention
  - `external_ref` JSONB shape for Asana
- [ ] Note the `OutputNormalizerService` interface contract for Feature 12 implementors
- [ ] Record the routing precedence issue (literal `approve`/`push` path segments before parameterized `:taskId`)
- **Complexity:** Small

### F2. Notify Downstream Feature Owners
- [ ] Communicate to Feature 12 team: the `OutputNormalizerService` stub interface (TR.md Section 12) is in place; they need to replace the stub with the real implementation
- [ ] Communicate to Feature 19 team: `POST /clients/{id}/tasks` request schema (TR.md Section 2.1) is final; agent output must conform
- [ ] Communicate to Feature 27 team: all endpoint contracts (TR.md Section 2) are available for UI implementation
- **Complexity:** Small

---

## Routing Precedence Note

When registering routes, the following pairs have potential conflicts in Express/Fastify routers. Register literal-path routes BEFORE parameterized routes:

```
POST /clients/:client_id/tasks/approve   ← register FIRST
POST /clients/:client_id/tasks/push      ← register FIRST
POST /clients/:client_id/tasks           ← register after
```

Similarly:
```
GET /tasks/:id        ← id can be UUID or TSK-####
```
No conflict here, but the resolution logic must handle both formats (Task A2).

---

## Summary Checklist

- [ ] A1 — Database prerequisites verified
- [ ] A2 — Short ID resolution utility
- [ ] A3 — Source detection utility
- [ ] A4 — Task data access layer
- [ ] A5 — Audit log utility
- [ ] B1 — POST /clients/{id}/tasks
- [ ] B2 — GET /clients/{id}/tasks
- [ ] B3 — GET /tasks/{id}
- [ ] B4 — PATCH /tasks/{id}
- [ ] C1 — POST /tasks/{id}/approve
- [ ] C2 — POST /tasks/{id}/reject
- [ ] C3 — Workspace routing service
- [ ] C4 — Feature 12 interface stub
- [ ] C5 — POST /tasks/{id}/push
- [ ] D1 — Batch approve helper
- [ ] D2 — POST /clients/{id}/tasks/approve
- [ ] D3 — Batch push helper
- [ ] D4 — POST /clients/{id}/tasks/push
- [ ] E1–E12 — All test suites passing
- [ ] F1 — Memory bank updated
- [ ] F2 — Downstream teams notified
