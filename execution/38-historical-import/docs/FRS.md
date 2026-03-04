# Functional Requirement Specification
# Feature 38: Historical Import

## 1. POST /clients/{id}/import — Trigger Historical Import

### 1.1 Purpose

Trigger an on-demand import of historical data for a returning client. Accepts source references (Grain playlist ID and/or Asana project ID), validates access to those sources, creates an import job record, and returns the job ID for status polling. The actual import runs asynchronously.

### 1.2 Request

**Method:** POST
**Path:** `/clients/{id}/import`
**Content-Type:** `application/json`

**Path Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | The client UUID. Must resolve to a client the authenticated user can access. |

**JSON Body Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `grain_playlist_id` | string | No | Grain playlist ID to import transcripts from. If omitted, transcript import is skipped. |
| `asana_project_id` | string | No | Asana project ID to import tasks from. If omitted, task import is skipped. |
| `asana_workspace_id` | string | No | Asana workspace ID. Required if `asana_project_id` is provided and not already on the client record. |
| `reprocess_transcripts` | boolean | No | Default `false`. If `true`, invoke Mastra Workflow A on each imported transcript to generate structured task data. |
| `call_type_override` | string (enum) | No | Override `call_type` for all imported transcripts. If omitted, defaults to `client_call`. |

**Minimum requirement:** At least one of `grain_playlist_id` or `asana_project_id` must be provided. If neither is provided, return `400 INVALID_BODY` with message "At least one source (grain_playlist_id or asana_project_id) must be provided".

### 1.3 Processing Steps

1. Validate Bearer token and resolve calling user (middleware).
2. Validate `id` path parameter is a valid UUID. Return `400 INVALID_ID` if not.
3. Resolve client access via `getClientById(id, userId, role)`. Return `404 CLIENT_NOT_FOUND` if not accessible.
4. Validate request body. Return `400 INVALID_BODY` if neither source is provided.
5. If `grain_playlist_id` provided: validate it is non-empty and does not exceed 500 characters.
6. If `asana_project_id` provided: validate it is non-empty. Resolve `asana_workspace_id` from request body or fall back to `client.default_asana_workspace_id`. If neither is set, return `422 WORKSPACE_NOT_CONFIGURED`.
7. Check if a prior import job for this client is currently `in_progress`. If so, return `409 IMPORT_IN_PROGRESS` with the existing job ID.
8. Create an `import_jobs` record with status `pending`. Set `client_id`, `grain_playlist_id` (if provided), `asana_project_id` (if provided), `reprocess_transcripts`, `call_type_override`, `created_at = NOW()`, `created_by = userId`.
9. Enqueue the import job for async processing (see §6 for the async job runner).
10. Write audit log entry: `action = 'import.started'`, `entity_type = 'client'`, `entity_id = client_id`.
11. Return `202 Accepted` with the `ImportJobResponse`.

### 1.4 Response (202 Accepted)

```typescript
interface ImportJobResponse {
  job_id: string;          // UUID of the import job
  client_id: string;       // UUID
  status: 'pending';       // Always 'pending' on creation
  created_at: string;      // ISO 8601
}
```

### 1.5 Permission Rules

| Role | Access |
|---|---|
| Admin | Can trigger import for any client |
| Account Manager | Can trigger import for assigned clients only |
| Team Member | Cannot trigger import — returns `403 FORBIDDEN` |

### 1.6 Validation Rules

| Rule | Error Code | HTTP Status |
|---|---|---|
| `id` path param is not a valid UUID | `INVALID_ID` | 400 |
| Client not found or not accessible | `CLIENT_NOT_FOUND` | 404 |
| Neither `grain_playlist_id` nor `asana_project_id` provided | `INVALID_BODY` | 400 |
| `asana_project_id` provided but no workspace resolvable | `WORKSPACE_NOT_CONFIGURED` | 422 |
| An import job for this client is already `in_progress` | `IMPORT_IN_PROGRESS` | 409 |
| Team Member role | `FORBIDDEN` | 403 |

---

## 2. GET /clients/{id}/import/status — Check Import Status

### 2.1 Purpose

Return the current status and progress of the most recent import job for the client. Used by the caller to poll completion after triggering an import via `POST /clients/{id}/import`.

### 2.2 Request

**Method:** GET
**Path:** `/clients/{id}/import/status`

**Path Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Client UUID. Must be accessible to the authenticated user. |

**Optional Query Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `job_id` | UUID | No | If provided, return status for the specified job. If omitted, return the most recent job for this client. |

### 2.3 Processing Steps

1. Validate Bearer token and resolve calling user.
2. Validate `id` is a valid UUID. Return `400 INVALID_ID` if not.
3. Resolve client access. Return `404 CLIENT_NOT_FOUND` if not accessible.
4. If `job_id` provided: fetch that specific `import_jobs` record for this client. Return `404 IMPORT_JOB_NOT_FOUND` if not found.
5. If `job_id` not provided: fetch the most recent `import_jobs` record for this client ordered by `created_at DESC`. Return `404 IMPORT_JOB_NOT_FOUND` if no import jobs exist for this client.
6. Return `ImportStatusResponse`.

### 2.4 Response (200 OK)

```typescript
interface ImportStatusResponse {
  job_id: string;
  client_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  grain_playlist_id: string | null;
  asana_project_id: string | null;
  reprocess_transcripts: boolean;
  progress: {
    transcripts_imported: number;
    transcripts_total: number | null;  // null if total is not yet known
    tasks_imported: number;
    tasks_total: number | null;
    agendas_imported: number;
    agendas_total: number | null;
  };
  error_summary: string | null;        // null unless status is 'failed'
  error_details: ImportErrorRecord[];  // Per-record errors (may be non-empty even if status is 'completed' for partial failures)
  started_at: string | null;           // ISO 8601; null if still pending
  completed_at: string | null;         // ISO 8601; null if not yet complete
  created_at: string;
}

interface ImportErrorRecord {
  entity_type: 'transcript' | 'task' | 'agenda';
  source_id: string;           // The Grain recording ID or Asana task ID that failed
  error_code: string;
  error_message: string;
  occurred_at: string;         // ISO 8601
}
```

### 2.5 Validation Rules

| Rule | Error Code | HTTP Status |
|---|---|---|
| `id` path param is not a valid UUID | `INVALID_ID` | 400 |
| Client not found or not accessible | `CLIENT_NOT_FOUND` | 404 |
| `job_id` provided but not found for this client | `IMPORT_JOB_NOT_FOUND` | 404 |
| No import jobs exist for this client | `IMPORT_JOB_NOT_FOUND` | 404 |

---

## 3. Import Job Execution

### FR-30: Job Runner Execution Model

The import job runs asynchronously after the `POST /clients/{id}/import` endpoint returns. The job runner:

1. Updates the job status from `pending` to `in_progress`. Sets `started_at = NOW()`.
2. Executes transcript import phase (if `grain_playlist_id` was provided).
3. Executes task import phase (if `asana_project_id` was provided).
4. Executes agenda import phase (if applicable data is found).
5. Optionally invokes Mastra reprocessing (if `reprocess_transcripts = true`).
6. Updates the job status to `completed` or `failed`. Sets `completed_at = NOW()`.

### FR-31: Idempotency — Skip Already-Imported Records

Before importing any record, the job runner must check whether it was already imported in a prior run:

- **Transcripts:** If a row exists in `transcripts` with `client_id = ?` and `grain_call_id = ?` and `is_imported = true`, skip it.
- **Tasks:** If a row exists in `tasks` with `client_id = ?` and `external_ref->>'externalId' = ?` (where the externalId is the Asana task GID, per Feature 01 naming convention) and `is_imported = true`, skip it.

Skipped records do not count as errors. They are not re-imported. This enables resume-from-failure for partial jobs.

### FR-32: Per-Record Error Handling

If importing an individual record fails (e.g., the Grain API returns an error for one recording, or the Asana task record is malformed):

1. Log the error to the `import_job_errors` table with `entity_type`, `source_id`, `error_code`, `error_message`, `occurred_at`.
2. Continue processing remaining records. A per-record failure does not abort the entire job.
3. After all records are processed, if any per-record errors occurred, the job status is still `completed` (not `failed`). The `error_details` array in the status response reflects per-record errors.
4. The job status is `failed` only if a catastrophic error prevents any further processing (e.g., the Grain API returns 401 for all requests — the entire transcript phase fails).

### FR-33: Concurrency Limit

Only one import job per client may be `in_progress` at a time. The `POST /clients/{id}/import` endpoint enforces this (step 7 in §1.3). The job runner must also check on job start and abort if another job is already in progress for the same client.

---

## 4. Transcript Import Phase

### FR-40: Transcript Import Source

Transcripts are imported from Grain using the Grain adapter (Feature 37). The import accepts a `grain_playlist_id` and fetches all recordings associated with that playlist.

**Note:** As of March 2026, the Grain API does not have a documented "List Recordings by Playlist" endpoint. If this endpoint becomes available, the import should use it. If not, the import must accept a list of individual Grain recording IDs as an alternative input to `grain_playlist_id` (see FRD.md open questions). The implementation must handle both cases gracefully.

### FR-41: Per-Transcript Normalization

Each Grain recording is normalized using `normalizeGrainTranscript()` from Feature 37. The `callType` used for each transcript is `call_type_override` from the job record, or `client_call` if not set.

### FR-42: Transcript Record Creation

For each successfully normalized transcript, create a row in the `transcripts` table with:

| Field | Value |
|---|---|
| `client_id` | The target client UUID |
| `grain_call_id` | The Grain recording ID |
| `call_type` | `call_type_override` or `client_call` |
| `call_date` | `NormalizedTranscript.meetingDate` |
| `raw_transcript` | Raw text extracted from Grain response (if available) |
| `normalized_segments` | The full `NormalizedTranscript` JSONB |
| `processed_at` | `NULL` (set by Mastra later if reprocessing is requested) |
| `is_imported` | `true` |
| `imported_at` | `NOW()` at time of import run |
| `import_source` | The `grain_playlist_id` from the job record |
| `created_at` | `NOW()` |

### FR-43: Transcript Import Progress Update

After each successfully imported transcript, increment `import_jobs.transcripts_imported` by 1. The progress counter must be updated atomically (not at the end of the batch).

---

## 5. Task Import Phase

### FR-50: Task Import Source

Tasks are imported from Asana using the Asana adapter (Feature 12). The import fetches all tasks from the specified `asana_project_id` within the resolved `asana_workspace_id`.

### FR-51: Asana Task Fetch

The import fetches tasks from Asana via `GET /projects/{asana_project_id}/tasks`. The adapter must fetch all tasks (following Asana's pagination) with the relevant fields: `gid`, `name`, `notes`, `assignee`, `custom_fields`, `completed`, `completed_at`, `created_at`, `permalink_url`.

### FR-52: Asana Status Mapping

Asana task completion status maps to internal task status as follows:

| Asana State | Internal `status` |
|---|---|
| `completed = true` | `completed` |
| `completed = false` | `pushed` (was in Asana but not completed) |

**Note:** `completed` is a valid `TaskStatus` value (added to the `TaskStatus` enum in Feature 01/04). All imported tasks use this mapping. The `is_imported = true` flag distinguishes them from system-generated records regardless of status.

### FR-53: Task Record Creation

For each successfully fetched Asana task, create a row in the `tasks` table with:

| Field | Value |
|---|---|
| `client_id` | The target client UUID |
| `short_id` | Auto-assigned `TSK-XXXX` (same mechanism as Feature 11) |
| `title` | Asana task `name` |
| `description` | Asana task `notes` (raw, not re-formatted) |
| `assignee` | Asana task `assignee.name` (if present) |
| `status` | Mapped per FR-52 |
| `external_ref` | `{ system: "asana", externalId: gid, externalUrl: permalink_url, workspaceId: ..., projectId: ... }` — same `ExternalRef` JSONB shape from Feature 01/12 (uses `system`, `externalId`, `externalUrl` naming convention) |
| `is_imported` | `true` |
| `imported_at` | `NOW()` |
| `import_source` | The `asana_project_id` from the job record |
| `created_at` | Asana task `created_at` (preserve original creation date where possible) |

### FR-54: Task Import Progress Update

After each successfully imported task, increment `import_jobs.tasks_imported` by 1.

---

## 6. Read-Only Enforcement for Imported Records

### FR-60: Enforcement Scope

The following write actions are blocked for imported records (`is_imported = true`):

| Endpoint | Operation | Error |
|---|---|---|
| `PATCH /tasks/{id}` | Edit task | `422 IMPORT_RECORD_READ_ONLY` |
| `POST /tasks/{id}/approve` | Approve task | `422 IMPORT_RECORD_READ_ONLY` |
| `POST /tasks/{id}/reject` | Reject task | `422 IMPORT_RECORD_READ_ONLY` |
| `POST /tasks/{id}/push` | Push task to Asana | `422 IMPORT_RECORD_READ_ONLY` |
| `PATCH /agendas/{id}` | Edit agenda | `422 IMPORT_RECORD_READ_ONLY` |
| `POST /agendas/{id}/finalize` | Finalize agenda | `422 IMPORT_RECORD_READ_ONLY` |
| `POST /agendas/{id}/share` | Share agenda | `422 IMPORT_RECORD_READ_ONLY` |

### FR-61: Enforcement Implementation

Each of the affected endpoint handlers must check `is_imported` on the fetched record before processing the write operation. The check must occur after the record is fetched and before any business logic is applied.

```typescript
if (record.is_imported) {
  throw new ApiError('IMPORT_RECORD_READ_ONLY', 'This record is a historical import and cannot be modified.', 422);
}
```

### FR-62: Read Access Unchanged

Imported records are readable through all existing read endpoints (`GET /tasks/{id}`, `GET /clients/{id}/tasks`, `GET /transcripts/{id}`, etc.) without any restriction. The `is_imported` flag is included in the response body so the UI can display a "historical" indicator.

---

## 7. Optional Mastra Reprocessing

### FR-70: Reprocessing Trigger

If the import job was created with `reprocess_transcripts = true`, the job runner invokes Workflow A (via `POST /workflows/intake`) for each imported transcript after it is stored.

### FR-71: Reprocessing Execution

For each imported transcript:
1. Call `POST /workflows/intake` with `{ client_id, transcript_id }`.
2. Wait for the workflow to complete (or poll status per Feature 17's async workflow model).
3. The resulting draft tasks are created by the Mastra agent as normal draft tasks in the `tasks` table.
4. The job runner then updates those draft tasks to set `is_imported = true`, `imported_at`, and `import_source` matching the transcript's import metadata.
5. The tasks' `status` remains `draft` — they are not auto-approved. They are historical context tasks and should not flow through the approval pipeline.

### FR-72: Reprocessing Failure Handling

If reprocessing fails for a transcript (Workflow A returns an error or times out):
1. Log the failure as a per-record error in `import_job_errors`.
2. Continue reprocessing remaining transcripts.
3. The import job is not marked `failed` due to reprocessing failures alone.

### FR-73: Reprocessing Progress

Track reprocessing progress separately from transcript import progress. The status response does not currently include a reprocessing counter (the `transcripts_imported` counter covers the raw import). Consider adding a `transcripts_reprocessed` counter in the `progress` object if reprocessing is in scope — this is a future enhancement.

---

## 8. Import Jobs Table Schema

### FR-80: import_jobs Table

New table required to support the import job lifecycle:

```sql
CREATE TABLE import_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id),
  status                VARCHAR NOT NULL DEFAULT 'pending',   -- pending, in_progress, completed, failed
  grain_playlist_id     VARCHAR,
  asana_project_id      VARCHAR,
  asana_workspace_id    VARCHAR,
  reprocess_transcripts BOOLEAN NOT NULL DEFAULT false,
  call_type_override    VARCHAR,                               -- client_call, intake, follow_up
  transcripts_total     INTEGER,                              -- null until known
  transcripts_imported  INTEGER NOT NULL DEFAULT 0,
  tasks_total           INTEGER,
  tasks_imported        INTEGER NOT NULL DEFAULT 0,
  agendas_total         INTEGER,
  agendas_imported      INTEGER NOT NULL DEFAULT 0,
  error_summary         TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX import_jobs_client_id ON import_jobs (client_id, created_at DESC);
CREATE INDEX import_jobs_status ON import_jobs (status) WHERE status IN ('pending', 'in_progress');
```

### FR-81: import_job_errors Table

```sql
CREATE TABLE import_job_errors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES import_jobs(id),
  entity_type     VARCHAR NOT NULL,   -- transcript, task, agenda
  source_id       VARCHAR NOT NULL,   -- Grain recording ID or Asana task GID
  error_code      VARCHAR NOT NULL,
  error_message   TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX import_job_errors_job_id ON import_job_errors (job_id);
```

---

## 9. Audit Logging

| Action | `action` value | `entity_type` | Notes |
|---|---|---|---|
| Import triggered | `import.started` | `client` | `metadata` includes `grain_playlist_id`, `asana_project_id`, `reprocess_transcripts` |
| Import completed | `import.completed` | `client` | `metadata` includes counts of imported records |
| Import failed | `import.failed` | `client` | `metadata` includes `error_summary` |

All audit entries use `source` derived from the request context (per Feature 07 middleware).

---

## 10. Roles and Permissions Matrix

| Action | Admin | Account Manager | Team Member |
|---|---|---|---|
| `POST /clients/{id}/import` | Allowed | Allowed (assigned clients only) | Forbidden (403) |
| `GET /clients/{id}/import/status` | Allowed | Allowed (assigned clients only) | Allowed (assigned clients only) |
| Read imported records via existing GET endpoints | Allowed | Allowed (assigned clients only) | Allowed (assigned clients only) |
| Write to imported records | Blocked (422) | Blocked (422) | Blocked (403 before reaching read-only check) |
