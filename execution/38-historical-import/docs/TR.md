# Technical Requirements
# Feature 38: Historical Import

## 1. Architecture Position

Feature 38 adds two new API endpoints and an asynchronous job runner to the API layer. It reuses the Grain adapter (Feature 37) and Asana adapter (Feature 12) — no new external service integrations are required.

```
Account Manager
       │
       ▼
POST /clients/{id}/import ──► Create import_jobs record ──► Enqueue async job
                                                                      │
                                              ┌───────────────────────┼──────────────────────┐
                                              ▼                       ▼                      ▼
                                      Grain Adapter            Asana Adapter          (Optional)
                                   (Feature 37)              (Feature 12)          Mastra Workflow A
                                     Fetch recordings         Fetch tasks            Reprocess transcripts
                                              │                       │
                                              ▼                       ▼
                                       transcripts table          tasks table
                                       (is_imported=true)         (is_imported=true)
```

---

## 2. File Structure

```
apps/api/src/
├── routes/
│   └── import.ts                    # Route handlers: POST /import, GET /import/status
├── services/
│   └── import-job-service.ts        # Business logic: create job, validate sources, check concurrency
├── workers/
│   └── import-job-runner.ts         # Async job execution: transcript phase, task phase, reprocessing
├── repositories/
│   └── import-jobs-repository.ts    # DB access: import_jobs, import_job_errors
└── __tests__/
    └── import/
        ├── import-trigger.test.ts
        ├── import-status.test.ts
        └── import-job-runner.test.ts
```

The `import-job-runner.ts` handles all phased execution. It is invoked asynchronously after the HTTP response is returned. The exact mechanism for async execution (queue, in-process setTimeout, or a dedicated job queue library) is determined by the API's existing infrastructure — see §5 below.

---

## 3. Database Schema Changes

### 3.1 New Tables

Two new tables are required (defined in FRS.md §8):

- `import_jobs` — tracks the lifecycle and progress of each import job
- `import_job_errors` — stores per-record failures during an import run

**This feature owns its own Drizzle migration** for the `import_jobs` and `import_job_errors` tables (not delegated to Feature 04). The migration file is created at `packages/database/src/migrations/` following the Drizzle migration pattern established by Feature 04.

### 3.2 Import Flag Fields on Existing Tables

Three columns must be added to `transcripts`, `tasks`, and `agendas`:

```sql
-- Apply to transcripts, tasks, and agendas tables
ALTER TABLE transcripts ADD COLUMN is_imported   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transcripts ADD COLUMN imported_at   TIMESTAMPTZ;
ALTER TABLE transcripts ADD COLUMN import_source VARCHAR;

ALTER TABLE tasks ADD COLUMN is_imported   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN imported_at   TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN import_source VARCHAR;

ALTER TABLE agendas ADD COLUMN is_imported   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agendas ADD COLUMN imported_at   TIMESTAMPTZ;
ALTER TABLE agendas ADD COLUMN import_source VARCHAR;
```

**Pre-migration check:** Confirm whether Feature 04 (product database schema) already added these columns. If so, skip the ALTER TABLE statements and only create the `import_jobs` and `import_job_errors` tables.

### 3.3 Index Additions

```sql
-- Fast lookup for idempotency checks
CREATE INDEX transcripts_client_grain_imported
  ON transcripts (client_id, grain_call_id)
  WHERE is_imported = true;

-- Fast lookup for task idempotency (via JSONB expression index, Feature 01 naming)
CREATE INDEX tasks_client_asana_imported
  ON tasks ((external_ref->>'externalId'), client_id)
  WHERE is_imported = true;

-- Import job status queries
CREATE INDEX import_jobs_client_id
  ON import_jobs (client_id, created_at DESC);

CREATE INDEX import_jobs_status
  ON import_jobs (status)
  WHERE status IN ('pending', 'in_progress');
```

---

## 4. API Endpoints Implementation

### 4.1 POST /clients/{id}/import

Route file: `apps/api/src/routes/import.ts`

Key implementation notes:

- Apply the same authentication middleware as all other client-scoped routes (Feature 07).
- The concurrency check (one active job per client) uses a `SELECT FOR UPDATE` or equivalent advisory lock to prevent race conditions when two requests arrive simultaneously for the same client.
- The import job is created in a database transaction. If the enqueue step fails, the transaction is rolled back and the job record is not persisted.
- Return `202 Accepted` (not `201 Created`) — the resource is not fully created yet, the job is pending.

### 4.2 GET /clients/{id}/import/status

Route file: `apps/api/src/routes/import.ts`

Key implementation notes:

- This endpoint must respond in < 200ms. It only reads from `import_jobs` and `import_job_errors` — no Grain or Asana API calls.
- The `progress` fields (`transcripts_imported`, `tasks_imported`, etc.) are read directly from the `import_jobs` row — they are updated by the job runner as records are imported, not computed on demand.
- The `error_details` array is populated from `import_job_errors WHERE job_id = ?`. Limit to the most recent 100 errors to prevent unbounded response sizes. Add a `total_errors` count field if needed.

---

## 5. Async Job Execution Model

### 5.1 Mechanism

The import job runner must be invoked asynchronously after the HTTP response is returned. Preferred approach (in order of preference):

1. **BullMQ or pg-boss (recommended):** If the API already uses a job queue library (established in Feature 17 workflow orchestration), reuse it for import jobs. This provides retry, monitoring, and persistence for the queue.
2. **pg-boss (if no existing queue):** A PostgreSQL-backed job queue. Fits the existing Postgres dependency without additional infrastructure. Jobs survive process restarts.
3. **In-process async with `setImmediate`:** Acceptable for small deployments if no queue is available. Not recommended for production — process crash loses queued jobs.

The choice must align with what Feature 17 (workflow orchestration) established. Use the same pattern.

### 5.2 Job Runner Phases

The job runner in `import-job-runner.ts` executes the following phases in order:

```
1. Update job status: pending → in_progress
2. Transcript import phase (if grain_playlist_id is set)
   a. Fetch recording IDs from Grain (list or accept IDs)
   b. For each recording: idempotency check → fetch → normalize → insert → update counter
3. Task import phase (if asana_project_id is set)
   a. Fetch tasks from Asana (paginated)
   b. For each task: idempotency check → insert → update counter
4. Agenda import phase (if applicable data found)
5. Optional reprocessing phase (if reprocess_transcripts = true)
   a. For each imported transcript: invoke Workflow A → flag resulting tasks as imported
6. Update job status: in_progress → completed (or failed on catastrophic error)
7. Write audit log: import.completed or import.failed
```

### 5.3 Catastrophic Failure vs. Per-Record Failure

- **Catastrophic failure** (marks job `failed`): The Grain API returns 401 for all requests (API key invalid), the Asana API returns 403 for all requests, or the database becomes unavailable.
- **Per-record failure** (logged, import continues): Grain returns 404 for one recording, Asana returns an error for one task, Workflow A fails for one transcript.

---

## 6. Idempotency Implementation

### 6.1 Transcript Idempotency Query

```sql
SELECT id FROM transcripts
WHERE client_id = $1
  AND grain_call_id = $2
  AND is_imported = true
LIMIT 1;
```

If a row is found, skip this recording.

### 6.2 Task Idempotency Query

```sql
SELECT id FROM tasks
WHERE client_id = $1
  AND (external_ref->>'externalId') = $2
  AND is_imported = true
LIMIT 1;
```

If a row is found, skip this task.

---

## 7. Read-Only Enforcement Implementation

### 7.1 Where to Enforce

The `is_imported` check must be added to the following existing endpoint handlers:

| File | Handler | Where to add check |
|---|---|---|
| `apps/api/src/routes/tasks.ts` | `PATCH /tasks/:id` | After fetching the task, before applying changes |
| `apps/api/src/routes/tasks.ts` | `POST /tasks/:id/approve` | After fetching the task |
| `apps/api/src/routes/tasks.ts` | `POST /tasks/:id/reject` | After fetching the task |
| `apps/api/src/routes/tasks.ts` | `POST /tasks/:id/push` | After fetching the task |
| `apps/api/src/routes/agendas.ts` | `PATCH /agendas/:id` | After fetching the agenda |
| `apps/api/src/routes/agendas.ts` | `POST /agendas/:id/finalize` | After fetching the agenda |
| `apps/api/src/routes/agendas.ts` | `POST /agendas/:id/share` | After fetching the agenda |

### 7.2 Error Response Shape

```json
{
  "error": {
    "code": "IMPORT_RECORD_READ_ONLY",
    "message": "This record is a historical import and cannot be modified.",
    "details": {
      "entity_type": "task",
      "entity_id": "TSK-0001"
    }
  }
}
```

### 7.3 New ApiErrorCode

Add `IMPORT_RECORD_READ_ONLY` to the `ApiErrorCode` enum in `@iexcel/shared-types`.

---

## 8. Grain Transcript Import — Playlist Handling

### 8.1 Known Limitation

As of March 2026, the Grain API does not have a documented "List Recordings by Playlist" endpoint. The import endpoint must handle two scenarios:

**Scenario A — Grain provides a list endpoint:** The job runner fetches all recording IDs for the playlist using `GET /playlists/{playlist_id}/recordings` (or equivalent). Process each in order.

**Scenario B — No list endpoint available:** The `POST /clients/{id}/import` endpoint must accept an optional `grain_recording_ids` array in the request body as an override. If provided, these IDs are used directly. If not provided and there is no Grain list endpoint, log an error and skip the transcript import phase.

The implementation must be structured so that the playlist fetching logic is isolated in a single function (`fetchGrainRecordingIds`) — when the Grain API adds a list endpoint, only this function needs updating.

### 8.2 Playlist Fetch Pagination

If a list endpoint exists, it may paginate results. The import must follow all pages (up to a maximum of 500 recordings per import job to prevent runaway jobs). Log a warning and stop if the limit is reached.

---

## 9. Asana Task Import — Pagination and Field Mapping

### 9.1 Fetching Tasks

Use the Asana API `GET /projects/{project_gid}/tasks?opt_fields=gid,name,notes,assignee.name,custom_fields,completed,completed_at,created_at,permalink_url`. Follow Asana's cursor-based pagination (`limit` + `offset` or `page_token` depending on Asana API version).

### 9.2 Asana Status Mapping

| Asana `completed` value | Internal `status` |
|---|---|
| `true` | `completed` |
| `false` | `pushed` |

**Note:** `completed` is now a valid `TaskStatus` enum value (added in Feature 01/04). This enables imported Asana tasks that are already done to be stored with their final status.

### 9.3 external_ref Construction

Follow the `AsanaExternalRef` JSONB schema from Feature 12 (FR-60):

```typescript
{
  system: "asana",
  externalId: task.gid,
  externalUrl: task.permalink_url,
  workspaceId: resolvedWorkspaceGid,
  projectId: asanaProjectId
}
```

This follows the Feature 01 `ExternalRef` naming convention (`system`, `externalId`, `externalUrl`) and ensures Feature 13 (status reconciliation) can locate imported tasks via `external_ref->>'externalId'`.

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Module | Key scenarios |
|---|---|
| `import-job-service.ts` | Concurrency check, validation, job creation |
| `import-job-runner.ts` | Transcript phase, task phase, idempotency skip, per-record error handling, catastrophic failure detection |
| `import-jobs-repository.ts` | Progress counter updates, error record insertion, status transitions |
| Read-only enforcement | `is_imported = true` blocks write operations; `is_imported = false` allows them |

### 10.2 Integration Tests

| Scenario | Test |
|---|---|
| Full import flow (transcript + task) | POST → job created → job runs → status shows completed → imported records exist in DB |
| Idempotency | Run import twice — second run skips all records |
| Concurrency | Two simultaneous POST requests — second returns 409 |
| Partial failure recovery | Job fails at recording 5 of 10 — restart — only recordings 6-10 are processed |
| Read-only enforcement | Attempt PATCH on imported task → 422 |
| Reprocessing | Import with reprocess=true → Workflow A invoked → tasks created with is_imported=true |

### 10.3 Mocking

- Grain API: reuse the mock server from Feature 37
- Asana API: reuse the mock from Feature 12
- Mastra Workflow A: mock the `/workflows/intake` endpoint response

---

## 11. Performance Requirements

| Requirement | Target |
|---|---|
| Import status endpoint response time | < 200ms |
| Import throughput (transcript fetch + normalize + insert) | >= 10 transcripts/minute |
| Import throughput (task insert) | >= 50 tasks/minute |
| Maximum import job size | 500 recordings, 2000 tasks per job |
| Progress counter update frequency | After each record (not batched) |

---

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Import only into accessible clients | Client scoping enforced before job creation (same as Feature 09 pattern) |
| Import flag prevents workflow abuse | Read-only enforcement at API layer blocks approval/push of historical records |
| Grain API key not in job record | The `import_jobs` table stores the `grain_playlist_id` reference only — not API credentials |
| Asana credentials not in job record | Same: only the project/workspace GID is stored |
| Audit trail | Every import start/completion/failure is logged to the audit log |

---

## 13. Deployment Considerations

- Database migration must run before deployment of the import endpoints.
- If the job queue infrastructure (BullMQ, pg-boss) requires additional deployment setup, coordinate with the Feature 17 deployment plan.
- Feature flag `HISTORICAL_IMPORT_ENABLED=true` recommended for staged rollout.
- The Grain API must be accessible from the API service's network for the job runner to function. Confirm network access during staging deployment.
- The import job runner should be monitored for stuck jobs — add a timeout that marks jobs older than 30 minutes with no progress update as `failed`.
