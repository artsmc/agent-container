# FRS — Functional Requirement Specification
## Feature 17: Workflow Orchestration

**Feature Name:** workflow-orchestration
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

Feature 17 implements three API endpoints and the supporting service layer, database interactions, and status lifecycle for orchestrating asynchronous Mastra agent workflows.

---

## 2. Endpoint: POST /workflows/intake

### 2.1 Purpose
Trigger Workflow A (Post-Intake: transcript to draft tasks). The endpoint validates the request, creates a workflow run record, and asynchronously invokes the Mastra Workflow A agent.

### 2.2 Request
**Method:** POST
**Path:** `/workflows/intake`
**Auth:** Bearer token required. Caller must have `account_manager` or `admin` role, and must have access to the specified `client_id`.

**Request Body:**
```json
{
  "client_id": "uuid",
  "transcript_id": "uuid"
}
```

Both fields are required. UUIDs.

### 2.3 Precondition Checks (in order)

1. **Token valid:** Bearer token present and valid. Return `401` if not.
2. **Role check:** Caller must have `account_manager` or `admin` role. Return `403` if not.
3. **Client access:** `client_id` must exist and be accessible to the caller. Return `403` with `FORBIDDEN` if not.
4. **Transcript exists:** `transcript_id` must exist and belong to the specified `client_id`. Return `422` with `TRANSCRIPT_NOT_FOUND` if not.
5. **No active run:** If an active run (status `pending` or `running`) already exists for this `client_id` + `workflow_type = 'intake'`, return `409` with `WORKFLOW_ALREADY_RUNNING`.

### 2.4 Success Flow

1. Create a workflow run record in the `workflow_runs` table:
   - `workflow_type = 'intake'`
   - `client_id` = from request
   - `status = 'pending'`
   - `input_refs = { transcript_id }`
   - `started_at = now()`
2. Write an audit log entry: `workflow.triggered`, entity_type `workflow_run`.
3. Fire-and-forget: invoke the Mastra Workflow A agent asynchronously, passing the `workflow_run_id`, `client_id`, and `transcript_id`.
4. Immediately return `202 Accepted` with the workflow run ID and a polling URL.

**Response body:**
```json
{
  "data": {
    "workflow_run_id": "uuid",
    "workflow_type": "intake",
    "status": "pending",
    "poll_url": "/workflows/{workflow_run_id}/status",
    "started_at": "ISO 8601"
  }
}
```

### 2.5 Mastra Invocation Contract
The async invocation passes the following context to Mastra:
```json
{
  "workflow_run_id": "uuid",
  "workflow_type": "intake",
  "client_id": "uuid",
  "transcript_id": "uuid",
  "callback_base_url": "https://api.iexcel.com"
}
```

Mastra is expected to:
1. Update the workflow run status to `running` (via PATCH to an internal status update mechanism — see Section 5).
2. Process the transcript.
3. Call `POST /clients/{client_id}/tasks` to save draft tasks.
4. Update the workflow run status to `completed` with result metadata (list of created task short IDs).
5. If processing fails, update the workflow run status to `failed` with error detail.

---

## 3. Endpoint: POST /workflows/agenda

### 3.1 Purpose
Trigger Workflow B (Pre-Call: reconciled tasks to draft agenda). The endpoint validates the request, checks that completed tasks exist, triggers status reconciliation, creates a workflow run record, and asynchronously invokes the Mastra Workflow B agent.

### 3.2 Request
**Method:** POST
**Path:** `/workflows/agenda`
**Auth:** Bearer token required. Caller must have `account_manager` or `admin` role, and must have access to the specified `client_id`.

**Request Body:**
```json
{
  "client_id": "uuid",
  "cycle_start": "ISO 8601 date (optional)",
  "cycle_end": "ISO 8601 date (optional)"
}
```

- `client_id` is required.
- `cycle_start` and `cycle_end` are optional date range filters for completed tasks. If omitted, the system uses the date of the last completed workflow run for this client as `cycle_start`, and now as `cycle_end`. If no prior run exists, no date filter is applied.

### 3.3 Precondition Checks (in order)

1. **Token valid:** Return `401` if not.
2. **Role check:** `account_manager` or `admin` required. Return `403` if not.
3. **Client access:** `client_id` accessible to caller. Return `403` if not.
4. **No active run:** If an active run exists for `client_id` + `workflow_type = 'agenda'`, return `409` with `WORKFLOW_ALREADY_RUNNING`.
5. **Status reconciliation:** Invoke Feature 13 (status reconciliation) for the client to merge Postgres task metadata with live Asana statuses. After reconciliation completes, the reconciled task statuses are written to the Postgres `tasks` table (cache write per Feature 13 FR-09). The agenda agent reads this cached data via the standard API.
6. **Completed tasks exist:** After reconciliation, check that at least one task for this client has `reconciled_status->>'asanaStatus' = 'completed'` within the cycle window. If none found, return `422` with `NO_COMPLETED_TASKS` and a human-readable warning message. Do NOT create a workflow run record.

### 3.4 Success Flow

1. Create a workflow run record:
   - `workflow_type = 'agenda'`
   - `client_id` = from request
   - `status = 'pending'`
   - `input_refs = { cycle_start, cycle_end }` (populated or derived values)
   - `started_at = now()`
2. Write audit log entry: `workflow.triggered`, entity_type `workflow_run`.
3. Fire-and-forget: invoke Mastra Workflow B agent asynchronously, passing `workflow_run_id`, `client_id`, `cycle_start`, `cycle_end`, and the pre-reconciled task summary.
4. Return `202 Accepted`:

**Response body:**
```json
{
  "data": {
    "workflow_run_id": "uuid",
    "workflow_type": "agenda",
    "status": "pending",
    "poll_url": "/workflows/{workflow_run_id}/status",
    "started_at": "ISO 8601",
    "input_refs": {
      "cycle_start": "ISO 8601 date",
      "cycle_end": "ISO 8601 date"
    }
  }
}
```

### 3.5 Mastra Invocation Contract
```json
{
  "workflow_run_id": "uuid",
  "workflow_type": "agenda",
  "client_id": "uuid",
  "cycle_start": "ISO 8601 date",
  "cycle_end": "ISO 8601 date",
  "callback_base_url": "https://api.iexcel.com"
}
```

Mastra is expected to:
1. Update workflow run status to `running`.
2. Retrieve the reconciled tasks via `GET /clients/{client_id}/tasks` (filtered by completed status in the cycle window).
3. Build the Running Notes agenda.
4. Call `POST /clients/{client_id}/agendas` to save the draft agenda.
5. Update workflow run status to `completed` with result metadata (agenda short ID).
6. On failure, update status to `failed` with error detail.

---

## 4. Endpoint: GET /workflows/{id}/status

### 4.1 Purpose
Return the current status of a workflow run. Used by consumers polling for completion.

### 4.2 Request
**Method:** GET
**Path:** `/workflows/{id}/status`
**Auth:** Bearer token required. Caller must have access to the client associated with the workflow run.

`{id}` is the workflow run UUID returned from the trigger endpoint.

### 4.3 Response: 200 OK

```json
{
  "data": {
    "workflow_run_id": "uuid",
    "workflow_type": "intake" | "agenda",
    "client_id": "uuid",
    "status": "pending" | "running" | "completed" | "failed",
    "started_at": "ISO 8601",
    "updated_at": "ISO 8601",
    "completed_at": "ISO 8601 | null",
    "input_refs": {},
    "result": {
      "task_short_ids": ["TSK-0001", "TSK-0002"] | null,
      "agenda_short_id": "AGD-0001" | null
    },
    "error": {
      "code": "string | null",
      "message": "string | null"
    }
  }
}
```

- `result.task_short_ids` is populated when `workflow_type = 'intake'` and `status = 'completed'`.
- `result.agenda_short_id` is populated when `workflow_type = 'agenda'` and `status = 'completed'`.
- `error` is populated when `status = 'failed'`.
- Both `result` and `error` are `null` when status is `pending` or `running`.

### 4.4 Error Responses
| Status | Code | Condition |
|---|---|---|
| 401 | UNAUTHORIZED | Invalid/expired token |
| 403 | FORBIDDEN | Caller lacks access to this workflow run's client |
| 404 | WORKFLOW_RUN_NOT_FOUND | No run with that UUID exists |

---

## 5. Status Update Mechanism (Mastra Callback)

Mastra needs a way to update the workflow run status as it progresses. Two options are defined; the implementation team selects one during Feature 18 coordination:

### Option A: Internal HTTP callback endpoint (recommended for V1)
The API exposes an internal status update endpoint, scoped to the Mastra service account:

```
PATCH /workflows/{id}/status
Authorization: Bearer <mastra-service-token>
Content-Type: application/json

{
  "status": "running" | "completed" | "failed",
  "result": { ... } | null,
  "error": { "code": "...", "message": "..." } | null
}
```

This endpoint:
- Requires the Mastra OIDC client credentials token (grant type `client_credentials`, `client_id: mastra-agent`).
- Validates that the `workflow_run_id` exists and belongs to a run that Mastra was asked to process.
- Sets `completed_at = now()` when transitioning to `completed` or `failed`.
- Writes an audit log entry: `workflow.completed` or `workflow.failed`.
- Returns `200 OK` with the updated run record.

### Option B: Direct database write (not recommended for V1)
Mastra writes directly to the `workflow_runs` table using a write-scoped database credential. This bypasses the API layer and should not be used in V1 — it violates the "API-only access" architectural principle.

---

## 6. Workflow Run Lifecycle

```
trigger received
      |
      v
  [pending]    -- run record created, async invocation fired
      |
      v         (Mastra picks up the job)
  [running]    -- Mastra has started processing
      |
     / \
    /   \
[completed] [failed]   -- Mastra calls back with result or error
```

Allowed transitions:
- `pending` → `running` (Mastra confirms start)
- `pending` → `failed` (Mastra invocation itself fails before start, or timeout reached)
- `running` → `completed`
- `running` → `failed`

No other transitions are valid. Any invalid status transition attempt returns `422 INVALID_STATUS_TRANSITION`.

---

## 7. Timeout Handling

If a workflow run remains in `pending` or `running` state beyond a configurable threshold (default: 5 minutes), a background process (scheduled task or triggered on status poll) marks it `failed` with `error.code = 'WORKFLOW_TIMEOUT'`. This prevents stale runs from being permanently stuck in an active state.

The timeout checker is implemented as:
1. **On poll:** When `GET /workflows/{id}/status` is called, the handler checks if the run has exceeded the timeout and transitions it to `failed` before returning. This is a "lazy timeout" pattern — no background daemon required.
2. **Optional:** A periodic cleanup job (out of scope for V1) can sweep timed-out runs proactively.

---

## 8. Idempotency and Concurrency

- **One active run per client per workflow type.** Attempting to trigger a second Workflow A for the same client while one is still `pending` or `running` returns `409 WORKFLOW_ALREADY_RUNNING`. This prevents duplicate LLM processing from race conditions in the UI.
- **Workflow run IDs are UUIDs.** Callers can safely retry a trigger request after a network failure by checking if an active run already exists.

---

## 9. Authorization Matrix

| Endpoint | Required Role | Client Access Required |
|---|---|---|
| `POST /workflows/intake` | `account_manager` or `admin` | Yes — client_id must be in user's accessible clients |
| `POST /workflows/agenda` | `account_manager` or `admin` | Yes |
| `GET /workflows/{id}/status` | Any authenticated user | Yes — workflow run's client_id must be accessible |
| `PATCH /workflows/{id}/status` | Mastra service account only | No role required — service account identity check |

---

## 10. Audit Log Coverage

| Trigger | Action | entity_type | metadata |
|---|---|---|---|
| Workflow A triggered | `workflow.triggered` | `workflow_run` | `workflow_type`, `client_id`, `transcript_id`, `triggered_by` |
| Workflow B triggered | `workflow.triggered` | `workflow_run` | `workflow_type`, `client_id`, `cycle_start`, `cycle_end`, `triggered_by` |
| Workflow moved to running | `workflow.started` | `workflow_run` | `workflow_type`, `client_id` |
| Workflow completed | `workflow.completed` | `workflow_run` | `workflow_type`, `client_id`, `result` (short IDs) |
| Workflow failed | `workflow.failed` | `workflow_run` | `workflow_type`, `client_id`, `error.code`, `error.message` |
| Workflow timed out | `workflow.timed_out` | `workflow_run` | `workflow_type`, `client_id`, `pending_duration_seconds` |

---

## 11. Error Handling

All error responses use the standard envelope established in Feature 07:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": {}
  }
}
```

| Code | HTTP Status | Trigger |
|---|---|---|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Caller lacks role or client access |
| `CLIENT_NOT_FOUND` | 404 | client_id does not exist or not accessible |
| `TRANSCRIPT_NOT_FOUND` | 422 | transcript_id does not exist for client |
| `NO_COMPLETED_TASKS` | 422 | Workflow B: no completed tasks found for cycle window |
| `WORKFLOW_ALREADY_RUNNING` | 409 | Active run exists for client + workflow type |
| `WORKFLOW_RUN_NOT_FOUND` | 404 | GET/PATCH by workflow run ID — no such record |
| `INVALID_STATUS_TRANSITION` | 422 | Status callback with an invalid transition |
| `MASTRA_INVOCATION_FAILED` | 502 | Mastra could not be reached or rejected the invocation |
| `WORKFLOW_TIMEOUT` | — | Not an HTTP error code; appears in run record error field |

---

## 12. UI/UX Considerations

The trigger endpoints return `202 Accepted` immediately with a `poll_url`. The consuming UI (Feature 30) is expected to:
1. Display a "workflow running" indicator.
2. Poll `GET /workflows/{id}/status` at a reasonable interval (e.g., every 5 seconds).
3. When status reaches `completed`, navigate to the results (task review queue or agenda editor).
4. When status reaches `failed`, display the error code and message with a retry option.

The API does not serve WebSocket events in V1. This is noted as a future enhancement in `api-prd.md`.
