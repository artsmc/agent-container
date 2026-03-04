# Feature 38: Historical Import

## Summary
V2 enhancement — Implement client reactivation and historical data import. `POST /clients/{id}/import` triggers an on-demand import from a Grain playlist and Asana project. Ingests historical transcripts, tasks, and agendas. Optionally invokes Mastra to reprocess old transcripts for structured data. All imported records are flagged with `is_imported=true`, `imported_at`, and `import_source`, and are read-only by default.

## Phase
Phase 9 — V2 Enhancements

## Dependencies
- **Blocked by**: 09 (Client Management — clients must exist to import into), 10 (Transcript Endpoints — import creates transcript records), 12 (Output Normalizer Asana — import pulls historical tasks from Asana, needs the Asana adapter)
- **Blocks**: None (leaf node)

## Source PRDs
- `api-prd.md` — Client Reactivation & Historical Import endpoints, External Service Adapters (Grain Adapter, Asana Adapter)
- `database-prd.md` — Historical Data & Client Reactivation section, import fields (`is_imported`, `imported_at`, `import_source`)

## Relevant PRD Extracts

### Client Reactivation & Historical Import (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/import` | POST | Trigger on-demand import of historical data for a returning client |
| `/clients/{id}/import/status` | GET | Check status of a running import |

**Import flow:**
1. Account manager provides references to historical sources (Grain playlist ID, Asana project ID).
2. API validates access to those sources, creates an import job.
3. API pulls historical transcripts, tasks, and documents via the Grain and Asana adapters.
4. Optionally invokes Mastra to reprocess old transcripts for structured data.
5. All imported records are flagged with `is_imported = true` and marked read-only.

### Historical Data & Client Reactivation (database-prd.md)

When a returning client is reactivated, the system supports **on-demand import** of their historical data. No bulk migration is required upfront.

**Trigger:** Account manager reactivates a client (or creates a new client record for a returning engagement).

**Process:**
1. Account manager points the system at the client's existing Grain playlist and Asana workspace/project.
2. The system ingests historical transcripts, tasks, and Running Notes into Postgres as historical records.
3. Optionally, the Mastra agent can reprocess old transcripts to generate structured data retroactively (backfilling task descriptions, context, etc.).
4. Once imported, the agent has full context for the new engagement — what was done before, what was left unfinished, what the client cared about.

**Schema support:** The `Transcripts`, `Tasks`, and `Agendas` tables already support historical records via timestamps (`call_date`, `created_at`, `cycle_start`/`cycle_end`). Imported records should be flagged:

| Field | Table | Description |
|---|---|---|
| `is_imported` | Transcripts, Tasks, Agendas | `BOOLEAN DEFAULT false` — distinguishes imported historical records from system-generated ones |
| `imported_at` | Transcripts, Tasks, Agendas | `TIMESTAMP` — when the import occurred |
| `import_source` | Transcripts, Tasks, Agendas | `VARCHAR` — origin reference (e.g., Grain playlist ID, Asana project ID) |

Imported records are read-only by default — they represent the historical state, not active work.

### Historical Reprocessing (mastra-prd.md)

> When a returning client is reactivated, the API may invoke Mastra to **reprocess old transcripts** from a previous engagement. This is the same Workflow A logic (transcript -> tasks) applied retroactively to historical Grain recordings. The output is saved as imported historical records in the database, giving the agent full context before the first new intake call.

### External Service Adapters (api-prd.md)

> - **Grain Adapter** — Pulls transcripts by playlist/call ID. Handles pagination and rate limits.
> - **Asana Adapter** — Translates internal task format to Asana's API. Handles workspace routing, custom field mapping, and error recovery.

### Client Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `grain_playlist_id` | VARCHAR | Reference to the client's Grain playlist |
| `default_asana_workspace_id` | VARCHAR | Default Asana workspace for task routing |
| `default_asana_project_id` | VARCHAR | Default Asana project within the workspace |

### Transcripts Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `client_id` | UUID | FK -> Clients |
| `grain_call_id` | VARCHAR | Reference to the Grain recording |
| `call_type` | ENUM | `client_call`, `intake`, `follow_up` |
| `call_date` | TIMESTAMP | When the call occurred |
| `raw_transcript` | TEXT | Full transcript text |

### Tasks Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `TSK-0001`) |
| `client_id` | UUID | FK -> Clients |
| `transcript_id` | UUID | FK -> Transcripts (source transcript) |
| `status` | ENUM | `draft`, `approved`, `rejected`, `pushed`, `completed` |
| `asana_task_id` | VARCHAR | Asana task ID after push (nullable until pushed) |

### Agendas Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `AGD-0001`) |
| `client_id` | UUID | FK -> Clients |
| `status` | ENUM | `draft`, `in_review`, `finalized`, `shared` |
| `content` | TEXT | The agenda/Running Notes content |
| `cycle_start` | DATE | Start of the task cycle this agenda covers |
| `cycle_end` | DATE | End of the task cycle |

## Scope

### In Scope
- `POST /clients/{id}/import` endpoint:
  - Request body accepts Grain playlist ID and/or Asana project ID as historical source references
  - Validates access to the specified sources before starting
  - Creates an import job record for tracking
  - Returns import job ID for status polling
- `GET /clients/{id}/import/status` endpoint:
  - Returns progress of a running import (pending, in_progress, completed, failed)
  - Includes counts (transcripts imported, tasks imported, agendas imported)
- Historical transcript import from Grain:
  - Pull recordings from the specified Grain playlist
  - Convert each to `NormalizedTranscript` format via the Grain adapter
  - Store as transcript records with `is_imported=true`, `imported_at`, `import_source`
- Historical task import from Asana:
  - Pull tasks from the specified Asana project
  - Store as task records with `is_imported=true`, `imported_at`, `import_source`
  - Preserve Asana status (completed, in-progress) mapped to internal status
  - Store `asana_task_id` for reference
- Historical agenda/Running Notes import (if available in source systems)
- Import flag fields on Transcripts, Tasks, and Agendas tables:
  - `is_imported` — `BOOLEAN DEFAULT false`
  - `imported_at` — `TIMESTAMP`
  - `import_source` — `VARCHAR` (e.g., Grain playlist ID, Asana project ID)
- Read-only enforcement: imported records cannot be edited or re-pushed through normal workflows
- Optional Mastra reprocessing: invoke Workflow A logic on imported transcripts to generate structured task data retroactively
- Error handling: partial import recovery (resume from failure point), per-record error logging

### Out of Scope
- Automatic/scheduled import — this is on-demand only, triggered by account manager
- Bulk migration tooling for initial system setup
- Import from sources other than Grain and Asana (e.g., direct Google Docs import)
- Database schema migrations for the import fields — those should be added in feature 04 (product database schema) or as a separate migration
- Grain playlist listing (depends on Grain API capabilities — see feature 37 open questions)

## Key Decisions
- **On-demand, not automatic.** Import is triggered explicitly by an account manager when reactivating a client. There is no scheduled or webhook-triggered import.
- **Import records are flagged and read-only.** All imported records get `is_imported=true`, `imported_at`, and `import_source`. They represent historical state and cannot be edited, approved, or pushed through normal workflows.
- **Mastra reprocessing is optional.** The account manager can choose whether to invoke Mastra to reprocess old transcripts. This is useful for backfilling structured task data from raw transcripts, but may not be needed if tasks are being imported directly from Asana.
- **Import uses existing adapters.** The Grain adapter (feature 37) and Asana adapter (feature 12) are reused for pulling historical data. No new external service integrations are needed.
- **Import is an async job.** The `POST /clients/{id}/import` endpoint creates a job and returns immediately. The client polls `/clients/{id}/import/status` for progress. This prevents timeout issues for large historical datasets.
- **Short IDs are auto-assigned to imported records.** Imported tasks and agendas get standard `TSK-XXXX` and `AGD-XXXX` short IDs, maintaining consistency with system-generated records.
- **Partial import recovery.** If an import fails partway through, it should be resumable from the point of failure. Already-imported records are not re-imported.
