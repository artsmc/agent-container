# Feature 13: Status Reconciliation

## Summary
Implement on-demand status reconciliation between Postgres and Asana. When agenda generation is triggered, query Postgres for pushed tasks (by client), then fetch live status from Asana per-project. Match by external_ref.externalId. Returns a merged dataset with internal metadata from Postgres and Asana's live status (completed, in-progress, etc.).

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 11 (Task Endpoints — tasks must exist in Postgres with pushed status and Asana references), 12 (Output Normalizer Asana — tasks must have been pushed to Asana with stored asana_task_id)
- **Blocks**: 20 (Workflow B Agenda Agent — needs reconciled task data to classify completed vs. incomplete)

## Source PRDs
- api-prd.md (Agenda endpoints, External Service Adapters — Asana Adapter)
- database-prd.md (Tasks entity — asana_task_id, asana_project_id, status, client_id fields)

## Relevant PRD Extracts

### External Service Adapters (api-prd.md)

> - **Asana Adapter** — Translates internal task format to Asana's API. Handles workspace routing, custom field mapping, and error recovery.
>
> Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter — nothing else changes.

### Tasks Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `TSK-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK to Clients |
| `status` | ENUM | `draft`, `approved`, `rejected`, `pushed`, `completed` |
| `title` | VARCHAR | Task title |
| `description` | TEXT | Full structured description |
| `asana_workspace_id` | VARCHAR | Target Asana workspace (nullable, uses client default if null) |
| `asana_project_id` | VARCHAR | Target Asana project |
| `asana_task_id` | VARCHAR | Asana task ID after push (nullable until pushed) |
| `pushed_at` | TIMESTAMP | When pushed to Asana |

### Workflow B: Pre-Call — Build Agenda (mastra-prd.md)

> **Input:** Completed Asana tasks for the respective client.
>
> **Process:**
> 1. Pull completed tasks from Asana, filtered by client.
> 2. Group and summarize tasks by theme/project (not a raw data dump).

### Architecture Position (api-prd.md)

The API layer owns the connection to external systems (Asana, Google Docs, Grain, Email). No consumer talks to the database or external services directly — everything routes through this API.

## Scope

### In Scope
- Query Postgres for all tasks with `status = pushed` for a given client
- For each unique `asana_project_id` among those tasks, fetch live task data from Asana via `GET /tasks?project={projectGid}&opt_fields=name,completed,completed_at,assignee,custom_fields` (paginated, 100 per page)
- Match Asana tasks back to Postgres tasks using `asana_task_id` (stored as the external reference)
- Return a merged dataset containing: internal metadata (short_id, description, estimated_time, scrum_stage, transcript_id) combined with Asana's live status (completed, completed_at, assignee, custom_fields)
- Handle pagination for Asana responses (100 tasks per page)
- Handle Asana API errors gracefully (rate limits, timeouts, auth failures)
- This is a function within the API layer, not a standalone service

### Out of Scope
- Periodic/scheduled sync — reconciliation is on-demand only, triggered during agenda generation
- Writing status back to Postgres (this is a read-only reconciliation for agenda building)
- Updating Asana tasks from Postgres
- Cross-client reconciliation — always scoped to a single client
- Handling tasks that were deleted from Asana after being pushed

## Key Decisions
- **On-demand, not periodic sync.** Reconciliation happens during agenda generation (Workflow B trigger), not on a cron schedule. This avoids unnecessary Asana API calls and keeps the system simple.
- **Postgres owns task identity/metadata; Asana owns live status.** Postgres is the source of truth for what tasks exist and their internal metadata. Asana is the source of truth for whether a task is completed, in-progress, or has been updated.
- **Fetch strategy: per-project, not per-task.** Asana does NOT support batch-fetch by individual task GIDs. The correct approach is `GET /tasks?project={projectGid}&opt_fields=name,completed,completed_at,assignee,custom_fields` with pagination at 100 tasks per page. This means one API call sequence per Asana project, not one per task.
- **No separate reconciliation service.** This is a function within the API layer's Asana adapter, called internally when agenda generation needs fresh status data. It does not have its own endpoint — it is consumed by the workflow orchestration logic.
- **Match by asana_task_id.** The `asana_task_id` field stored in Postgres (populated when a task is pushed via feature 12) is used to match against Asana's task GID in the fetched results.
