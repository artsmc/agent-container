# FRS — Functional Requirement Specification
## Feature 11: Task Endpoints

**Feature Name:** task-endpoints
**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03

---

## 1. Short ID Generation

### FR-SID-01: Format
Short IDs must follow the format `TSK-####` where `####` is a zero-padded decimal integer (minimum 4 digits; grows naturally beyond 4 digits as volume increases, e.g., `TSK-10000`).

### FR-SID-02: Uniqueness
Short IDs are globally unique across all tasks, all clients. There are no per-client sequences. The sequence is a database-level construct (PostgreSQL `SEQUENCE`) to guarantee atomicity under concurrent creation.

### FR-SID-03: Immutability
Once assigned, a short ID is never changed, reassigned, or reused — regardless of the task's lifecycle outcome.

### FR-SID-04: Auto-Assignment
Short IDs are assigned by the API at task creation time. Consumers (including Mastra) do not supply short IDs; attempting to do so is silently ignored or rejected with a validation error.

---

## 2. Task Creation — `POST /clients/{client_id}/tasks`

### FR-CRT-01: Batch Input
The request body accepts an **array** of task objects, enabling the Mastra agent to create all tasks from a single intake call in one API call.

**Note:** This batch `POST /clients/{client_id}/tasks` endpoint is the primary endpoint Feature 19 (Workflow A — Intake Agent) uses to persist draft tasks after transcript processing.

```json
{
  "transcript_id": "uuid",
  "source": "agent",
  "tasks": [
    {
      "title": "string (required)",
      "description": "TaskDescription | string (required)",
      "assignee": "string (optional)",
      "estimated_time": "string (optional, HH:MM format)",
      "scrum_stage": "string (optional, default: Backlog)",
      "asana_workspace_id": "string (optional)",
      "asana_project_id": "string (optional)"
    }
  ]
}
```

### FR-CRT-02: Required Fields
- `title` — non-empty string, max 500 characters.
- `description` — required. Accepts a `TaskDescription` JSONB object (`{ taskContext, additionalContext, requirements }`) or a plain string (normalized to JSONB on storage). See FR-DESC-01.
- `transcript_id` — must reference an existing Transcript belonging to the same client.

### FR-CRT-03: Default Values
- `status` is always set to `draft` on creation; caller cannot override this.
- `scrum_stage` defaults to `Backlog` if not provided.
- `source` on the initial Task Version record is determined by the `source` field in the request body (`agent`, `ui`, or `terminal`). Defaults to `agent` for Mastra-initiated calls.

### FR-CRT-04: Short ID Assignment
For each task in the array, the API atomically increments the global sequence and assigns the resulting `TSK-####` value.

### FR-CRT-05: Initial Version Record
For each created task, the API writes a Task Version row with `version = 1`, capturing the initial title, description, and estimated_time. `edited_by` is set to the authenticated user/service.

### FR-CRT-06: Audit Log
A `task.created` audit entry is written for each task, including `source`, `transcript_id`, and `short_id` in `metadata`.

### FR-CRT-07: Authorization
Any authenticated user (including the Mastra service account) may create draft tasks for clients they have access to.

### FR-CRT-08: Response
Returns an array of created task objects, each including `id`, `short_id`, and `status`. HTTP 201.

### FR-CRT-09: Client Scoping
The `client_id` in the URL is validated against the authenticated user's accessible clients. Tasks are created belonging to that client. If the client is not accessible or does not exist: `CLIENT_NOT_FOUND` (404).

---

## 3. Task Listing — `GET /clients/{client_id}/tasks`

### FR-LST-01: Filters
| Query Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by task status (`draft`, `approved`, `rejected`, `pushed`) |
| `transcript_id` | UUID | Filter by source transcript |
| `page` | integer | Page number (1-based, default: 1) |
| `per_page` | integer | Items per page (default: 20, max: 100) |

### FR-LST-02: Default Sort
Results sorted by `created_at` descending (newest first).

### FR-LST-03: Response Shape
```json
{
  "data": [ /* array of task summary objects */ ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 142,
    "total_pages": 8
  }
}
```

Task summary objects include: `id`, `short_id`, `title`, `status`, `assignee`, `estimated_time`, `scrum_stage`, `transcript_id`, `created_at`, `updated_at`. Version history is NOT included in the list response.

### FR-LST-04: Authorization
Results are scoped to the authenticated user's accessible clients. Client-level access is enforced by the same middleware used across all client-scoped routes.

---

## 4. Task Detail — `GET /tasks/{id}`

### FR-DET-01: ID Resolution
The `{id}` path parameter accepts either:
- A UUID (e.g., `3f2a1b4c-...`)
- A short ID (e.g., `TSK-0042`)

The API resolves short IDs via the unique index on `tasks.short_id`. The resolution is transparent — callers receive the same response format regardless of which ID type they used.

### FR-DET-02: Response Shape
```json
{
  "id": "uuid",
  "short_id": "TSK-0042",
  "client_id": "uuid",
  "transcript_id": "uuid",
  "status": "draft",
  "title": "string",
  "description": "string",
  "assignee": "string",
  "estimated_time": "01:30",
  "scrum_stage": "Backlog",
  "asana_workspace_id": "string | null",
  "asana_project_id": "string | null",
  "external_ref": null,
  "approved_by": null,
  "approved_at": null,
  "pushed_at": null,
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "versions": [
    {
      "id": "uuid",
      "version": 1,
      "title": "string",
      "description": "string",
      "estimated_time": "01:30",
      "edited_by": "uuid",
      "source": "agent",
      "created_at": "ISO8601"
    }
  ]
}
```

### FR-DET-03: Version History
The `versions` array is always included in the detail response, ordered by `version` ascending. This allows the UI to display the full edit history.

### FR-DET-04: Authorization
The task's `client_id` is cross-referenced against the authenticated user's accessible clients. If the user cannot access that client: `FORBIDDEN` (403).

### FR-DET-05: Not Found
If no task matches the UUID or short ID: `TASK_NOT_FOUND` (404).

---

## 5. Task Edit — `PATCH /tasks/{id}`

### FR-EDT-01: Editable Fields
Only these fields may be included in a PATCH request:
| Field | Type | Validation |
|---|---|---|
| `title` | string | Non-empty, max 500 chars |
| `description` | string | Non-empty |
| `assignee` | string | Max 255 chars |
| `estimated_time` | string | `HH:MM` format |
| `scrum_stage` | string | Max 100 chars |
| `asana_workspace_id` | string | Max 255 chars |
| `asana_project_id` | string | Max 255 chars |

Non-editable fields (`status`, `short_id`, `client_id`, `transcript_id`, `approved_by`, `approved_at`, `pushed_at`) are silently ignored or explicitly rejected with a 422 if included.

### FR-EDT-02: Status Restriction
PATCH is only allowed when `status` is `draft` or `rejected`. Any other status returns `TASK_NOT_EDITABLE` (422).

### FR-EDT-03: Version Record Creation
Every successful PATCH creates a new Task Version row. The version number increments from the highest existing version for that task. The `edited_by` is set to the authenticated user. The `source` is derived from the caller's token type (`ui`, `terminal`, or `agent`).

### FR-EDT-04: Audit Log
A `task.edited` audit entry is written, capturing the previous and new values of changed fields in `metadata`.

### FR-EDT-05: Response
Returns the full updated task object (same shape as GET detail, including updated `versions` array). HTTP 200.

### FR-EDT-06: Authorization
Any authenticated user with access to the task's client may edit the task. (Approval remains role-restricted; editing is not.)

---

## 6. Task Approval — `POST /tasks/{id}/approve`

### FR-APR-01: Role Requirement
Only users with `role = account_manager` or `role = admin` may call this endpoint. Any other role returns `FORBIDDEN` (403).

### FR-APR-02: Status Precondition
The task must be in `draft` status. Attempting to approve a `rejected`, `approved`, or `pushed` task returns `TASK_NOT_APPROVABLE` (422) with `current_status` in the error details.

### FR-APR-03: State Transition
On success:
- `status` → `approved`
- `approved_by` → authenticated user's `id`
- `approved_at` → current UTC timestamp
- `updated_at` → current UTC timestamp

### FR-APR-04: Audit Log
A `task.approved` audit entry is written, including `approved_by` and `approved_at` in metadata.

### FR-APR-05: Request Body
No request body required. The endpoint is an action, not a data update.

### FR-APR-06: Response
Returns the updated task object. HTTP 200.

---

## 7. Task Rejection — `POST /tasks/{id}/reject`

### FR-REJ-01: Status Precondition
Only `draft` or `approved` tasks may be rejected. Rejecting a `pushed` task returns `TASK_NOT_REJECTABLE` (422).

### FR-REJ-02: Optional Reason
The request body may include an optional `reason` string:
```json
{ "reason": "Description needs more detail" }
```
If provided, the reason is stored in the audit log metadata.

### FR-REJ-03: State Transition
On success:
- `status` → `rejected`
- `approved_by` → cleared to `null` (if previously approved)
- `approved_at` → cleared to `null`
- `updated_at` → current UTC timestamp

### FR-REJ-04: Audit Log
A `task.rejected` audit entry is written, including the optional reason in metadata.

### FR-REJ-05: Editability After Rejection
A `rejected` task remains editable via PATCH (see FR-EDT-02). This allows account managers to correct and re-approve without creating a new task.

### FR-REJ-06: Authorization
Any authenticated user with access to the task's client may reject a task.

### FR-REJ-07: Response
Returns the updated task object. HTTP 200.

---

## 8. Task Push — `POST /tasks/{id}/push`

### FR-PSH-01: Status Precondition
Only `approved` tasks may be pushed. Any other status returns `TASK_NOT_PUSHABLE` (422).

### FR-PSH-02: Workspace Routing
The API executes the routing cascade before calling the output normalizer:
1. If `task.asana_workspace_id` is set → use it.
2. Else if `client.default_asana_workspace_id` is set → use it.
3. Else → return `WORKSPACE_NOT_CONFIGURED` (422).

### FR-PSH-03: Output Normalizer Invocation
The API calls Feature 12's internal service interface, passing the resolved task data and workspace/project identifiers. This is an internal service call, not a direct Asana API call.

### FR-PSH-04: External Reference Storage
On success from the output normalizer, the API stores the returned reference as an `external_ref` JSONB value on the task:
```json
{
  "system": "asana",
  "externalId": "1234567890",
  "externalUrl": "https://app.asana.com/0/...",
  "workspaceId": "98765",
  "projectId": "11111"
}
```

The `external_ref` follows the shared `ExternalRef` naming convention from Feature 01: `system` (not `provider`), `externalId` (not `taskId`), and `externalUrl` (not `permalinkUrl`).

### FR-PSH-05: State Transition
On success:
- `status` → `pushed`
- `pushed_at` → current UTC timestamp
- `external_ref` → populated (replaces any prior value)
- `updated_at` → current UTC timestamp

### FR-PSH-06: Audit Log
A `task.pushed` audit entry is written, including `external_ref` and `pushed_at` in metadata.

### FR-PSH-07: External Service Error Handling
If the output normalizer (Feature 12) returns an error, the task status remains `approved` (unchanged). The endpoint returns `PUSH_FAILED` (502) with the upstream error detail.

### FR-PSH-08: Idempotency
Pushing an already-`pushed` task returns `TASK_NOT_PUSHABLE` (422). Re-pushing requires manual intervention (status reset by admin).

### FR-PSH-09: Authorization
Any authenticated user with access to the task's client may trigger a push. (The approval gate enforces the role requirement upstream.)

### FR-PSH-10: Response
Returns the updated task object including populated `external_ref`. HTTP 200.

---

## 9. Batch Approve — `POST /clients/{client_id}/tasks/approve`

### FR-BAP-01: Request Body
```json
{
  "task_ids": ["TSK-0001", "TSK-0002", "3f2a1b4c-..."]
}
```
Array of short IDs or UUIDs. Mixed types allowed. Minimum 1, maximum 50.

### FR-BAP-02: Processing Model
Each task is processed **individually** using the same logic as the single-task approve endpoint (FR-APR-01 through FR-APR-04). Processing is sequential or parallel; either way, each task's success or failure is independent.

### FR-BAP-03: Partial Success
The endpoint always returns HTTP 200, even if some tasks fail. Per-task results are returned:
```json
{
  "results": [
    { "task_id": "TSK-0001", "success": true, "task": { /* updated task object */ } },
    { "task_id": "TSK-0002", "success": false, "error": { "code": "TASK_NOT_APPROVABLE", "current_status": "pushed" } }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

### FR-BAP-04: Role Requirement
Same as single approve: only `account_manager` or `admin`. Applied per-task; a user lacking the role receives `FORBIDDEN` in every per-task result.

### FR-BAP-05: Audit Log
One `task.approved` entry per successfully approved task. Not one bulk entry.

---

## 10. Batch Push — `POST /clients/{client_id}/tasks/push`

### FR-BPS-01: Request Body
```json
{
  "task_ids": ["TSK-0001", "TSK-0002"]
}
```
Array of short IDs or UUIDs. Minimum 1, maximum 50.

### FR-BPS-02: Processing Model
Each task is processed individually using the same logic as the single push endpoint (FR-PSH-01 through FR-PSH-08).

### FR-BPS-03: Partial Success
Same partial success model as batch approve:
```json
{
  "results": [
    { "task_id": "TSK-0001", "success": true, "task": { /* ... */ } },
    { "task_id": "TSK-0002", "success": false, "error": { "code": "WORKSPACE_NOT_CONFIGURED" } }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

### FR-BPS-04: Audit Log
One `task.pushed` entry per successfully pushed task.

---

## 11. Task Description Format

### FR-DESC-01: TaskDescription JSONB Structure
Task descriptions are stored as a `TaskDescription` JSONB structure with three fields:

```typescript
interface TaskDescription {
  taskContext: string;        // Conversational explanation of why this task exists
  additionalContext: string;  // Related, external, or historical factors
  requirements: string;       // Specific requirements, tools, or steps needed
}
```

The API accepts `description` as either:
- A `TaskDescription` object (preferred, used by Mastra agents) — stored directly as JSONB.
- A plain string (legacy/UI fallback) — stored as `{ taskContext: <string>, additionalContext: "", requirements: "" }`.

### FR-DESC-02: Format Responsibility
The Mastra agent (Feature 19) is responsible for generating descriptions as `TaskDescription` JSONB objects. The API stores whatever is provided, normalizing plain strings into the JSONB structure for consistency. The UI may submit either format.

---

## 12. Cross-Cutting Functional Requirements

### FR-CCR-01: ID Resolution Middleware
A shared middleware/utility function resolves a path parameter to a task UUID before the route handler executes. This function:
1. Checks if the parameter matches `TSK-\d+` (short ID pattern).
2. If yes, queries `tasks` by `short_id` to retrieve the UUID.
3. If no, treats the parameter as a UUID directly.
4. If no record found: returns `TASK_NOT_FOUND` (404).

### FR-CCR-02: Client Access Middleware
All task endpoints verify that the resolved task's `client_id` is in the authenticated user's accessible clients before proceeding.

### FR-CCR-03: Source Detection
The `source` field on Task Version records is determined by inspecting the caller's token:
- Mastra service account token → `agent`
- User token from a browser session → `ui`
- User token from a terminal/MCP client → `terminal`

The mechanism for distinguishing `ui` from `terminal` is a convention established in Feature 07 (e.g., a custom `X-Client-Type` header or a token claim).

### FR-CCR-04: Estimated Time Format
The API accepts `estimated_time` as a string in `HH:MM` format and stores it as a PostgreSQL `INTERVAL`. Retrieval converts the interval back to `HH:MM` string format for API responses. Invalid formats return a 422 validation error.

### FR-CCR-05: Validation Errors
Field validation errors return HTTP 422 with the standard error envelope, including a `validation_errors` array:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation.",
    "details": {
      "validation_errors": [
        { "field": "tasks[0].title", "message": "Required field is missing." }
      ]
    }
  }
}
```
