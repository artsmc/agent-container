# Functional Requirement Specification
# Feature 13: Status Reconciliation

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

The status reconciliation function accepts a `clientId` and returns a `ReconciledTask[]` array. Each item in the array combines internal Postgres metadata with the live Asana completion status for that task. The function is invoked internally within the API layer — it is not called from an HTTP endpoint directly.

---

## 2. Functional Requirements

### FR-01: Query Postgres for Pushed Tasks

**Requirement:** The function MUST query the `tasks` table for all records where `client_id = $clientId` AND `status = 'pushed'`.

**Input:** `clientId` (UUID)
**Output subset:** All tasks with `status = 'pushed'` for the given client, including: `id`, `short_id`, `title`, `description`, `assignee`, `estimated_time`, `scrum_stage`, `transcript_id`, `external_ref->>'projectId'` (Asana project GID), `external_ref->>'externalId'` (Asana task GID), `pushed_at`.

**Note:** The `external_ref` JSONB column follows the Feature 01 `ExternalRef` naming convention. There are no standalone `asana_task_id` or `asana_project_id` columns — all external references are accessed via JSONB queries on the `external_ref` column.

**Edge cases:**
- If no pushed tasks exist for the client, return an empty array immediately without calling the Asana API.

---

### FR-02: Deduplicate Asana Projects

**Requirement:** From the pushed tasks set, extract the unique set of `external_ref->>'projectId'` values. The Asana fetch strategy is per-project, not per-task.

**Rationale (from context.md key decision):** Asana does not support batch-fetch by individual task GIDs. The correct approach is `GET /tasks?project={projectGid}` with pagination.

**Edge cases:**
- A task with a null `external_ref->>'projectId'` MUST be included in the returned dataset as unmatched (see FR-06). It is not skipped.
- Duplicate project GIDs (multiple tasks in the same project) must result in a single Asana API call sequence for that project.

---

### FR-03: Fetch Tasks Per Asana Project

**Requirement:** For each unique `external_ref->>'projectId'`, call the Asana API:

```
GET https://app.asana.com/api/1.0/tasks
  ?project={projectGid}
  &opt_fields=gid,name,completed,completed_at,assignee.name,custom_fields
  &limit=100
```

Authentication: Bearer token from the workspace credential associated with the project (resolved via the `AsanaWorkspaces` table, same as Feature 12).

**Pagination:** If the response includes a `next_page.uri` or `next_page.offset`, the function MUST fetch subsequent pages until all tasks are retrieved. Each page uses `limit=100`.

**Result accumulation:** All pages for a given project are combined into a single in-memory map keyed by Asana task GID before matching begins.

---

### FR-04: Match by Asana Task GID

**Requirement:** For each Postgres task with a non-null `external_ref->>'externalId'`, look it up in the in-memory map from FR-03 using `external_ref->>'externalId'` as the key (Asana's `gid` field).

**Match result:** If found, the Asana task data (`completed`, `completed_at`, `assignee.name`, `custom_fields`) is merged with the Postgres task data.

**No match:** If the `external_ref->>'externalId'` is not found in the fetched project data (task may have been deleted or moved in Asana), the task is included in the returned dataset with `asanaStatus: 'not_found'` and all Asana fields set to null.

---

### FR-05: Construct ReconciledTask Objects

**Requirement:** The return type of the function is `ReconciledTask[]`. Each object MUST include:

**From Postgres (internal metadata):**
- `id` — UUID (internal primary key)
- `shortId` — e.g., `TSK-0042`
- `title` — task title
- `description` — full structured description (Task Context / Additional Context / Requirements)
- `assignee` — internal iExcel team member name
- `estimatedTime` — interval string (e.g., `"02:30"`)
- `scrumStage` — e.g., `"Backlog"`
- `transcriptId` — UUID reference to source transcript
- `asanaProjectId` — the Asana project GID (from `external_ref->>'projectId'`)
- `asanaTaskId` — the Asana task GID (from `external_ref->>'externalId'`)
- `pushedAt` — timestamp

**From Asana (live status):**
- `asanaStatus` — one of: `'completed'`, `'incomplete'`, `'not_found'`
- `asanaCompleted` — boolean or null (null if not_found)
- `asanaCompletedAt` — ISO timestamp string or null
- `asanaAssigneeName` — string or null (Asana-side assignee, may differ from internal `assignee`)
- `asanaCustomFields` — array of `{ gid, name, display_value }` or empty array

---

### FR-06: Handle Tasks With Null external_ref Fields

**Requirement:** Postgres tasks that were pushed but have null `external_ref->>'projectId'` or `external_ref->>'externalId'` MUST still appear in the returned dataset.

These tasks are set with:
- `asanaStatus: 'not_found'`
- All Asana fields null

This ensures the caller (agenda generation) accounts for every pushed task, even those with data integrity issues.

---

### FR-07: Asana API Error Handling

**Requirement:** Asana API errors during project fetching MUST be handled as follows:

| Error | Behavior |
|---|---|
| `401 Unauthorized` | Throw `ReconciliationError` with code `ASANA_AUTH_FAILED`. Abort entire reconciliation — do not partially return. |
| `403 Forbidden` | Throw `ReconciliationError` with code `ASANA_AUTH_FAILED`. Abort. |
| `404 Not Found` (project GID not found) | Mark all tasks for that project as `asanaStatus: 'not_found'`. Continue with other projects. Do not abort. |
| `429 Too Many Requests` | Retry after `Retry-After` header delay (or 60s default). Up to 3 total attempts. |
| `5xx Server Error` | Retry with exponential back-off (1s, 2s, 4s). Up to 3 total attempts. |
| Network timeout (>15s per request) | Treat as retryable. After retries exhausted, throw `ReconciliationError` with code `ASANA_TIMEOUT`. |
| All retries exhausted | Throw `ReconciliationError` with code `ASANA_UNAVAILABLE`. |

---

### FR-08: Access Token Resolution (Encrypted Credential Storage)

**Requirement:** The access token used for Asana API calls MUST be resolved from the `AsanaWorkspaces` table using the same resolution logic and encrypted credential storage established in Feature 12 (workspace-router). Credentials are stored encrypted in the database (AES-256-GCM) and decrypted at read time using the swappable credential resolver. The reconciliation function must NOT accept or store Asana credentials directly — it must use the workspace service to resolve them.

If a project's workspace cannot be resolved, tasks for that project are marked as `asanaStatus: 'not_found'` (same as FR-06 null case). A warning is logged.

---

### FR-09: Postgres Cache Write

**Requirement:** After reconciliation, the function MUST write the reconciled status data back to the `tasks` table as a cache. For each reconciled task:

- Update `tasks.reconciled_status` (JSONB) with the live Asana status data (`asanaStatus`, `asanaCompleted`, `asanaCompletedAt`, `asanaAssigneeName`).
- Update `tasks.reconciled_at` (TIMESTAMPTZ) with the current timestamp.

The task's primary `status` field MUST remain `'pushed'` — the reconciled data is stored separately as a cache. This allows the agenda generation agent (Feature 20) to read reconciled task statuses via the standard API (`GET /clients/{client_id}/tasks`) without requiring direct Asana API access.

**Approach:** Reconciled data is written to Postgres; the agent reads via API. This eliminates the need for agents to make external API calls during agenda generation.

---

### FR-10: Logging

**Requirement:** The function MUST emit structured log events (via Pino, following Feature 07's logger) at the following points:

| Event | Level | Fields |
|---|---|---|
| Reconciliation started | `info` | `clientId`, `pushedTaskCount`, `uniqueProjectCount` |
| Per-project fetch started | `debug` | `clientId`, `projectGid`, `page` |
| Per-project fetch completed | `debug` | `clientId`, `projectGid`, `totalTasksFetched`, `pageCount` |
| Unmatched task | `warn` | `clientId`, `taskId`, `shortId`, `asanaTaskId`, `reason` |
| Asana API error (retryable) | `warn` | `clientId`, `projectGid`, `statusCode`, `attempt` |
| Reconciliation completed | `info` | `clientId`, `reconciledCount`, `unmatchedCount`, `durationMs` |

Task content (title, description) MUST NOT be logged. Asana access tokens MUST NOT be logged.

---

## 3. Caller Interface

The function is called internally by the agenda generation logic (Feature 14). The call signature:

```typescript
async function reconcileTasksForClient(
  clientId: string,
  db: DbClient,
  logger: Logger
): Promise<ReconciledTask[]>
```

The caller does not need to provide an access token. The function resolves workspace credentials internally from the database.

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Idempotency | Safe to call multiple times for the same client — always produces a fresh result from live Asana data |
| Concurrency | Must not use any in-process mutable state that would cause incorrect results if two reconciliations run simultaneously for different clients |
| Timeout budget | The full reconciliation for a single client must complete within 30 seconds. Individual Asana HTTP requests timeout at 15 seconds. |
| Memory footprint | Asana task data is held in memory only for the duration of the reconciliation call and must not be retained after the function returns |
