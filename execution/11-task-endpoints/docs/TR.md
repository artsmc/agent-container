# TR — Technical Requirements
## Feature 11: Task Endpoints

**Feature Name:** task-endpoints
**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03

---

## 1. Implementation Strategy

Feature 11 is implemented entirely within the API layer (established by Feature 07). It adds route handlers, service-layer business logic, a short ID generation utility, and database query functions. It does not introduce new infrastructure or new external service connections — those belong to Feature 12 (Asana) and Feature 04 (schema).

The implementation is structured in four layers:
1. **Route Layer** — Fastify/Express route definitions, request validation, auth middleware hooks.
2. **Service Layer** — Business logic (status transitions, routing cascade, version creation, audit logging).
3. **Data Access Layer** — Database queries (Postgres via the ORM/query builder established in Feature 07).
4. **Short ID Utility** — Isolated module for generating and resolving `TSK-####` identifiers.

---

## 2. API Endpoint Contracts

### 2.1 Create Draft Tasks

```
POST /clients/{client_id}/tasks
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body Schema:**
```typescript
interface CreateTasksRequest {
  transcript_id: string;          // UUID, required
  source: 'agent' | 'ui' | 'terminal';  // optional, default: 'agent'
  tasks: Array<{
    title: string;                // required, max 500 chars
    description: string;          // required
    assignee?: string;            // optional, max 255 chars
    estimated_time?: string;      // optional, "HH:MM" format
    scrum_stage?: string;         // optional, default: "Backlog"
    asana_workspace_id?: string;  // optional
    asana_project_id?: string;    // optional
  }>;
}
```

**Response: 201 Created**
```typescript
interface CreateTasksResponse {
  data: TaskSummary[];
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 401 | UNAUTHORIZED | Invalid/expired token |
| 403 | FORBIDDEN | User cannot access this client |
| 404 | CLIENT_NOT_FOUND | Client does not exist |
| 422 | VALIDATION_ERROR | Required fields missing or invalid |
| 422 | TRANSCRIPT_NOT_FOUND | transcript_id not found for this client |

---

### 2.2 List Tasks

```
GET /clients/{client_id}/tasks?status=draft&transcript_id=uuid&page=1&per_page=20
Authorization: Bearer <token>
```

**Query Parameters:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string | — | One of `draft`, `approved`, `rejected`, `pushed` |
| `transcript_id` | UUID | — | Filter by source transcript |
| `page` | integer | 1 | 1-based |
| `per_page` | integer | 20 | Max 100 |

**Response: 200 OK**
```typescript
interface ListTasksResponse {
  data: TaskSummary[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}
```

---

### 2.3 Get Task Detail

```
GET /tasks/{id}
Authorization: Bearer <token>
```

`{id}` accepts UUID or short ID (e.g., `TSK-0042`).

**Response: 200 OK**
```typescript
interface TaskDetailResponse {
  id: string;              // UUID
  short_id: string;        // e.g., "TSK-0042"
  client_id: string;
  transcript_id: string;
  status: 'draft' | 'approved' | 'rejected' | 'pushed';
  title: string;
  description: string;
  assignee: string | null;
  estimated_time: string | null;  // "HH:MM"
  scrum_stage: string;
  asana_workspace_id: string | null;
  asana_project_id: string | null;
  external_ref: ExternalRef | null;
  approved_by: string | null;     // user UUID
  approved_at: string | null;     // ISO 8601
  pushed_at: string | null;
  created_at: string;
  updated_at: string;
  versions: TaskVersion[];
}

interface TaskVersion {
  id: string;
  version: number;
  title: string;
  description: string;
  estimated_time: string | null;
  edited_by: string;       // user UUID
  source: 'agent' | 'ui' | 'terminal';
  created_at: string;
}

interface ExternalRef {
  provider: 'asana';
  taskId: string;
  workspaceId: string;
  projectId: string;
}
```

---

### 2.4 Edit Task

```
PATCH /tasks/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (all fields optional, at least one required):**
```typescript
interface EditTaskRequest {
  title?: string;
  description?: string;
  assignee?: string;
  estimated_time?: string;       // "HH:MM"
  scrum_stage?: string;
  asana_workspace_id?: string;
  asana_project_id?: string;
}
```

**Response: 200 OK** — Full task detail (same as GET /tasks/{id}).

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 422 | TASK_NOT_EDITABLE | Task status is not `draft` or `rejected` |
| 422 | VALIDATION_ERROR | Field validation failure |

---

### 2.5 Approve Task

```
POST /tasks/{id}/approve
Authorization: Bearer <token>
```

No request body.

**Response: 200 OK** — Full task detail with `status: "approved"`.

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | FORBIDDEN | User role is not `account_manager` or `admin` |
| 422 | TASK_NOT_APPROVABLE | Task status is not `draft` |

---

### 2.6 Reject Task

```
POST /tasks/{id}/reject
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**
```typescript
interface RejectTaskRequest {
  reason?: string;  // optional, stored in audit log metadata
}
```

**Response: 200 OK** — Full task detail with `status: "rejected"`.

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 422 | TASK_NOT_REJECTABLE | Task status is `pushed` |

---

### 2.7 Push Task

```
POST /tasks/{id}/push
Authorization: Bearer <token>
```

No request body.

**Response: 200 OK** — Full task detail with `status: "pushed"` and `external_ref` populated.

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 422 | TASK_NOT_PUSHABLE | Task status is not `approved` |
| 422 | WORKSPACE_NOT_CONFIGURED | No workspace on task or client |
| 502 | PUSH_FAILED | Output normalizer returned an error |

---

### 2.8 Batch Approve

```
POST /clients/{client_id}/tasks/approve
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```typescript
interface BatchApproveRequest {
  task_ids: string[];  // UUIDs or short IDs, min 1, max 50
}
```

**Response: 200 OK**
```typescript
interface BatchOperationResponse {
  results: Array<{
    task_id: string;
    success: boolean;
    task?: TaskDetailResponse;
    error?: { code: string; message: string; [key: string]: unknown };
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
```

---

### 2.9 Batch Push

```
POST /clients/{client_id}/tasks/push
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```typescript
interface BatchPushRequest {
  task_ids: string[];  // UUIDs or short IDs, min 1, max 50
}
```

**Response: 200 OK** — Same `BatchOperationResponse` shape as batch approve.

---

## 3. Data Models

### 3.1 Tasks Table

Feature 04 is responsible for schema migrations. This feature's requirements for the Tasks table:

```sql
CREATE TABLE tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id             VARCHAR(20) NOT NULL UNIQUE,
  client_id            UUID NOT NULL REFERENCES clients(id),
  transcript_id        UUID NOT NULL REFERENCES transcripts(id),
  status               task_status NOT NULL DEFAULT 'draft',
  title                VARCHAR(500) NOT NULL,
  description          TEXT NOT NULL,
  assignee             VARCHAR(255),
  estimated_time       INTERVAL,
  scrum_stage          VARCHAR(100) NOT NULL DEFAULT 'Backlog',
  asana_workspace_id   VARCHAR(255),
  asana_project_id     VARCHAR(255),
  external_ref         JSONB,             -- replaces asana_task_id
  approved_by          UUID REFERENCES users(id),
  approved_at          TIMESTAMPTZ,
  pushed_at            TIMESTAMPTZ,
  is_imported          BOOLEAN NOT NULL DEFAULT false,
  imported_at          TIMESTAMPTZ,
  import_source        VARCHAR(255),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE task_status AS ENUM ('draft', 'approved', 'rejected', 'pushed');
-- Note: 'completed' is intentionally excluded; completion is owned by Asana (Feature 13)
```

**Divergence from database-prd.md:**
- `asana_task_id VARCHAR` is replaced by `external_ref JSONB` to support future PM tool adapters. See Key Decisions in context.md.
- `completed` is removed from the status enum. Task completion is tracked by Feature 13 via Asana status reconciliation.

### 3.2 Short ID Sequence

```sql
CREATE SEQUENCE task_short_id_seq START 1 INCREMENT 1 NO CYCLE;
```

The short ID generation function:
```sql
CREATE OR REPLACE FUNCTION next_task_short_id() RETURNS VARCHAR AS $$
  SELECT 'TSK-' || LPAD(nextval('task_short_id_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;
```

Usage at insert time:
```sql
-- short_id is computed at insert, not as a column default,
-- to allow the application layer to control transaction boundaries
INSERT INTO tasks (short_id, ...) VALUES (next_task_short_id(), ...);
```

### 3.3 Task Versions Table

```sql
CREATE TABLE task_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES tasks(id),
  version        INTEGER NOT NULL,
  title          VARCHAR(500) NOT NULL,
  description    TEXT NOT NULL,
  estimated_time INTERVAL,
  edited_by      UUID NOT NULL REFERENCES users(id),
  source         version_source NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, version)
);

CREATE TYPE version_source AS ENUM ('agent', 'ui', 'terminal');
```

### 3.4 Required Indexes

These indexes are specified here for Feature 04 to implement:

```sql
CREATE UNIQUE INDEX tasks_short_id_idx ON tasks(short_id);
CREATE INDEX tasks_client_status_idx ON tasks(client_id, status);
CREATE INDEX tasks_transcript_id_idx ON tasks(transcript_id);
CREATE INDEX task_versions_task_id_idx ON task_versions(task_id);
```

---

## 4. Short ID Resolution Logic

The shared utility that all task endpoints use to resolve `{id}` parameters:

```typescript
// Pseudo-code; actual implementation in Feature 07's framework
async function resolveTaskId(idParam: string, db: Database): Promise<string> {
  const SHORT_ID_PATTERN = /^TSK-\d+$/i;

  if (SHORT_ID_PATTERN.test(idParam)) {
    const task = await db.tasks.findOne({ where: { short_id: idParam.toUpperCase() } });
    if (!task) throw new NotFoundError('TASK_NOT_FOUND');
    return task.id;
  }

  // Validate UUID format
  if (!isValidUUID(idParam)) throw new ValidationError('INVALID_ID_FORMAT');

  // UUID lookup happens in the main route handler
  return idParam;
}
```

Implementation note: Short ID lookup hits the `tasks_short_id_idx` unique index — this is a single index scan, sub-millisecond at expected scale.

---

## 5. Task Routing Logic

```typescript
async function resolveWorkspace(task: Task, client: Client): Promise<WorkspaceConfig> {
  // Step 1: Task-level override
  if (task.asana_workspace_id) {
    return {
      workspaceId: task.asana_workspace_id,
      projectId: task.asana_project_id ?? null,
    };
  }

  // Step 2: Client default
  if (client.default_asana_workspace_id) {
    return {
      workspaceId: client.default_asana_workspace_id,
      projectId: client.default_asana_project_id ?? null,
    };
  }

  // Step 3: No workspace configured
  throw new BusinessError('WORKSPACE_NOT_CONFIGURED', 422, {
    task_id: task.id,
    client_id: client.id,
  });
}
```

---

## 6. Source Detection

The `source` field on Task Version records is determined at the API layer. The convention (established in Feature 07) uses a request-level attribute:

| Token Type | Detected Source | Version source value |
|---|---|---|
| Mastra service account (`client_credentials` grant) | Service identity | `agent` |
| User token + `X-Client-Type: terminal` header | Terminal/MCP client | `terminal` |
| User token (no special header, or `X-Client-Type: ui`) | Web UI | `ui` |

The `X-Client-Type` header is set by consumers and validated against allowed values. Invalid values default to `ui`.

---

## 7. Audit Log Entries

All audit entries use the Audit Log table established in Feature 04. Each entry written by this feature:

| Action | entity_type | metadata fields |
|---|---|---|
| `task.created` | `task` | `short_id`, `transcript_id`, `source`, `client_id` |
| `task.edited` | `task` | `version`, `changed_fields`, `previous_values`, `new_values` |
| `task.approved` | `task` | `approved_by`, `approved_at` |
| `task.rejected` | `task` | `reason` (if provided), `previous_status` |
| `task.pushed` | `task` | `external_ref`, `pushed_at`, `workspace_id` |

The `user_id` on each audit entry is the authenticated user's ID. For Mastra-created tasks, `user_id` is the product user record linked to the Mastra service account (Feature 07 establishes this mapping).

---

## 8. Batch Operation Implementation

Batch operations process each task through the same service-layer functions used by single-task endpoints. The outer handler:

1. Validates the request body (array bounds, format).
2. Resolves all provided IDs to UUIDs via the short ID resolution utility.
3. For each task ID, calls the appropriate service function inside a try/catch.
4. Collects results (success or error) per task.
5. Returns the aggregated result regardless of partial failure.

**Concurrency:** Batch tasks may be processed concurrently using `Promise.allSettled` (Node.js) or equivalent, since each task is an independent database transaction. The ordering of results in the response matches the ordering of `task_ids` in the request.

**Transaction scope:** Each individual task operation is its own database transaction. There is no single wrapping transaction for the entire batch — partial success is by design.

---

## 9. Performance Requirements

| Operation | Target P95 Latency | Conditions |
|---|---|---|
| `POST /clients/{id}/tasks` (10 tasks) | < 500ms | Includes 10 sequence fetches, 10 inserts, 10 version inserts, 10 audit entries |
| `GET /tasks/{id}` by short ID | < 100ms | Single index scan + join to task_versions |
| `GET /clients/{id}/tasks` | < 200ms | Paginated, index-covered query |
| `PATCH /tasks/{id}` | < 300ms | Update + version insert + audit entry |
| `POST /tasks/{id}/approve` | < 200ms | Status check + update + audit entry |
| `POST /tasks/{id}/push` | Depends on Feature 12 | Network call to output normalizer excluded from this feature's budget |
| Batch approve (50 tasks) | < 2000ms | Sequential or parallel processing |

---

## 10. Security Requirements

### 10.1 Authentication
All endpoints require a valid Bearer token validated against the auth service JWKS (Feature 07 middleware). No unauthenticated access.

### 10.2 Authorization
| Endpoint | Required Access |
|---|---|
| `POST /clients/{id}/tasks` | Access to client (any role, including service account) |
| `GET /clients/{id}/tasks` | Access to client (any role) |
| `GET /tasks/{id}` | Access to task's client (any role) |
| `PATCH /tasks/{id}` | Access to task's client (any role) |
| `POST /tasks/{id}/approve` | `account_manager` or `admin` role |
| `POST /tasks/{id}/reject` | Access to task's client (any role) |
| `POST /tasks/{id}/push` | Access to task's client (any role, approval already enforced by status) |
| `POST /clients/{id}/tasks/approve` | `account_manager` or `admin` role |
| `POST /clients/{id}/tasks/push` | Access to client (any role) |

### 10.3 Data Scoping
Task routes that don't include `client_id` in the URL (e.g., `GET /tasks/{id}`) must still verify the task's `client_id` against the authenticated user's accessible clients. This check prevents cross-client data leakage via direct task ID access.

### 10.4 Input Validation
All request bodies are validated with a schema validation library (e.g., Zod, Joi, or the framework's native validator). Unknown fields are stripped (not rejected) for forward compatibility, except for status-changing fields which are explicitly rejected to prevent confusion.

### 10.5 No SQL Injection Risk
All database access uses parameterized queries via the ORM/query builder. Short ID pattern matching uses a regex check before the database lookup.

---

## 11. Error Codes Reference

| Code | HTTP Status | Trigger |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `FORBIDDEN` | 403 | Authenticated but lacks required role or client access |
| `CLIENT_NOT_FOUND` | 404 | Client doesn't exist or not accessible to the user |
| `TASK_NOT_FOUND` | 404 | No task matches the UUID or short ID |
| `TRANSCRIPT_NOT_FOUND` | 422 | transcript_id not found for the specified client |
| `VALIDATION_ERROR` | 422 | Request body fails schema validation |
| `TASK_NOT_EDITABLE` | 422 | PATCH attempted on task with status `approved` or `pushed` |
| `TASK_NOT_APPROVABLE` | 422 | Approve attempted on task not in `draft` status |
| `TASK_NOT_REJECTABLE` | 422 | Reject attempted on task in `pushed` status |
| `TASK_NOT_PUSHABLE` | 422 | Push attempted on task not in `approved` status |
| `WORKSPACE_NOT_CONFIGURED` | 422 | No workspace on task or client for routing |
| `INVALID_ID_FORMAT` | 422 | Path parameter is neither a UUID nor a valid short ID pattern |
| `PUSH_FAILED` | 502 | Output normalizer returned an error |

All errors use the standard envelope:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": {}
  }
}
```

---

## 12. Feature 12 Interface Contract

This feature calls Feature 12 (output normalizer) via an internal service interface. The contract from Feature 11's perspective:

```typescript
// Internal service interface — not an HTTP call within the same process,
// or an HTTP call to a sidecar, depending on deployment decisions made in Feature 07.
interface OutputNormalizerService {
  pushTask(params: {
    task: NormalizedTask;
    workspace: WorkspaceConfig;
  }): Promise<ExternalRef>;
}

interface NormalizedTask {
  title: string;
  description: string;         // Full 3-section text
  assignee: string | null;
  estimated_time: string | null; // "HH:MM"
  scrum_stage: string;
  client_name: string;          // Used for Asana "Client" custom field
}

interface WorkspaceConfig {
  workspaceId: string;
  projectId: string | null;
}

interface ExternalRef {
  provider: 'asana';
  taskId: string;
  workspaceId: string;
  projectId: string;
}
```

If Feature 12 throws any error, Feature 11 wraps it as `PUSH_FAILED` (502) and does not change the task's status. The raw upstream error detail is included in the error response `details` for debugging.

---

## 13. Dependencies and Tech Stack

### 13.1 Internal Dependencies
| Feature | What This Feature Uses |
|---|---|
| Feature 04 | Tasks table, Task Versions table, task_short_id_seq, Audit Log table, task_status enum, version_source enum |
| Feature 07 | Express/Fastify app, token validation middleware, error handling, database connection pool, route registration pattern |
| Feature 09 | Client record (for `default_asana_workspace_id`, client access validation) |

### 13.2 Runtime Dependencies
No new npm packages beyond what Feature 07 establishes. This feature uses:
- The ORM/query builder already configured.
- The schema validation library already configured.
- The authentication middleware already configured.

### 13.3 No New External Service Connections
Feature 11 does not directly call Asana or any external service. All external calls are delegated to Feature 12.

---

## 14. Implementation Notes and Alternatives

### 14.1 Short ID Generation: Sequence vs. Application-Level Counter
**Chosen approach:** PostgreSQL `SEQUENCE` via `nextval()` called at insert time.
**Rationale:** Sequences are atomic and concurrent-safe without application-level locking. They guarantee uniqueness even under high parallel insert load.
**Alternative considered:** Application-level counter with database row lock. Rejected — introduces lock contention under batch creation.

### 14.2 Batch Operation Concurrency
**Chosen approach:** `Promise.allSettled` for concurrent per-task processing.
**Alternative:** Sequential processing (simpler, lower DB connection pressure). Either approach is acceptable; document the choice in Feature 07's established patterns.

### 14.3 PATCH Semantics
**Chosen approach:** Partial update (only provided fields are changed). Unknown fields are stripped.
**Alternative:** Full replacement (caller must send all editable fields). Rejected — too fragile for multi-consumer environments (Mastra, UI, terminal all editing the same task).

### 14.4 Reject Clears Approval Fields
When a task transitions from `approved` to `rejected`, `approved_by` and `approved_at` are cleared. This is intentional — the task is no longer approved. If re-approved, new values will be set.

### 14.5 Version Record on Approve/Reject
Status transitions (approve, reject) do **not** create a new Task Version record. Version records only capture content edits (title, description, estimated_time). Status history is in the Audit Log.
