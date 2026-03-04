# Feature Requirements Document
# Feature 38: Historical Import

## 1. Overview

### 1.1 Feature Summary

Feature 38 implements client reactivation support and historical data import for the iExcel automation system. When a returning client is reactivated — one that iExcel has worked with before but was not in the system when it was first set up — an account manager can trigger an on-demand import that pulls historical transcripts from Grain and historical tasks from Asana into the iExcel database. Optionally, the Mastra agent can reprocess those old transcripts through Workflow A to backfill structured task data retroactively. All imported records are flagged as historical and made read-only.

### 1.2 Business Objective

iExcel's account managers have pre-existing relationships with returning clients. Without historical import, those clients start with an empty database — no context about what work was done previously, what was left unfinished, or what the client values. This forces account managers to either operate without context or manually re-enter historical data.

Historical import solves this problem: by pulling data from Grain (where all calls were recorded) and Asana (where all tasks lived), the system can reconstruct the client's engagement history and make it available to the Mastra agent before the first new intake call.

### 1.3 Target Users

| User | Interaction |
|---|---|
| Account Manager | Triggers the import when reactivating a client; monitors status; decides whether to invoke Mastra reprocessing |
| Mastra Agent (optional) | May be invoked to reprocess historical transcripts through Workflow A logic |
| iExcel Admin | May trigger imports for any client |

### 1.4 Value Proposition

- **Full context from day one.** The Mastra agent has access to the full engagement history before the first new intake call, enabling better task generation and continuity.
- **No manual re-entry.** Account managers don't need to reconstruct historical data by hand.
- **Preserves historical integrity.** Imported records are flagged and read-only — they cannot be accidentally edited, approved, or re-pushed through normal workflows.
- **Partial failure recovery.** If an import job fails partway through, it resumes from the point of failure rather than restarting from scratch.

### 1.5 Success Metrics

| Metric | Target |
|---|---|
| Import job completion rate (no catastrophic failures) | > 95% for any client with valid Grain playlist and Asana project access |
| Time to complete a 12-month historical import | < 5 minutes for a typical client engagement |
| Zero accidental edits or pushes of imported records | Enforced at the API layer |
| Status polling latency | Import status endpoint responds in < 200ms while a job is running |

---

## 2. Phase and Dependencies

### 2.1 Phase

Phase 9 — V2 Enhancements

### 2.2 Upstream Dependencies

| Feature | Why Required |
|---|---|
| **Feature 09** (Client Management) | Clients must exist before historical data can be imported into them. The client record provides `grain_playlist_id` and `default_asana_project_id` as source references. |
| **Feature 10** (Transcript Endpoints) | The import creates transcript records in the `transcripts` table. The transcript insertion logic established by Feature 10 is reused. |
| **Feature 12** (Output Normalizer Asana) | The Asana adapter is reused to pull tasks from Asana. The `external_ref` JSONB pattern from Feature 12 is also used to store Asana task IDs on imported task records. |

### 2.3 Downstream Dependents

Feature 38 is a leaf node. No features are blocked by it.

---

## 3. Context: Returning Client Scenario

A returning client is one where:
1. iExcel has worked with them before.
2. That prior work is captured in Grain (call recordings) and Asana (tasks).
3. The client is being reactivated in the iExcel system — either as a new client record or as an existing record being updated.

Before Feature 38, the system has no mechanism to ingest that prior work. The account manager would have to trigger Workflow A and B against empty data, or operate without the context of what was done before.

After Feature 38:
1. Account manager provides Grain playlist ID and/or Asana project ID.
2. System imports all historical transcripts and tasks into the database as flagged historical records.
3. Optionally, Mastra processes old transcripts to backfill structured task descriptions.
4. From the first new intake call, the agent has full historical context.

---

## 4. Import Data Model Overview

### 4.1 Import Flag Fields

All three data tables (Transcripts, Tasks, Agendas) gain three new fields:

| Field | Type | Description |
|---|---|---|
| `is_imported` | `BOOLEAN DEFAULT false` | Marks the record as imported historical data |
| `imported_at` | `TIMESTAMP` | When the import job ran |
| `import_source` | `VARCHAR` | The source reference (e.g., the Grain playlist ID or Asana project ID that produced this record) |

### 4.2 Read-Only Enforcement

Imported records cannot be:
- Edited via `PATCH /tasks/{id}` or `PATCH /agendas/{id}`
- Approved via `POST /tasks/{id}/approve`
- Pushed via `POST /tasks/{id}/push`
- Finalized via `POST /agendas/{id}/finalize`
- Shared via `POST /agendas/{id}/share`

Any attempt to perform these actions on an imported record returns `422 IMPORT_RECORD_READ_ONLY`.

### 4.3 Short IDs

Imported tasks and agendas receive standard `TSK-XXXX` and `AGD-XXXX` short IDs via the same auto-assignment mechanism as system-generated records. Historical records are indistinguishable by ID format — only the `is_imported` flag differentiates them.

---

## 5. Import Job Model

### 5.1 Async Job Design

The import is an asynchronous job. The `POST /clients/{id}/import` endpoint creates a job record and returns immediately with the job ID. The account manager polls `GET /clients/{id}/import/status` for progress. This prevents timeouts on large historical datasets.

### 5.2 Import Job States

```
pending → in_progress → completed
                      ↘ failed (partially resumable)
```

### 5.3 Partial Recovery

If a job fails partway through, already-imported records are preserved. Re-triggering the import for the same client picks up from where it failed (based on which recording IDs and task IDs were already imported). A record is considered "already imported" if a row with `is_imported = true` and a matching `grain_call_id` (for transcripts) or `asana_task_id` (for tasks) already exists for this client.

---

## 6. Optional Mastra Reprocessing

The account manager can request that historical transcripts be reprocessed by the Mastra agent using the same Workflow A logic (transcript → structured tasks). This is useful when:
- Importing from Grain only (no Asana tasks to import).
- The Asana tasks are too sparse or unstructured to provide useful context.

When reprocessing is requested:
- After each transcript is imported, the API invokes Workflow A on it.
- The resulting draft tasks are created as imported records (`is_imported = true`) in the database.
- The account manager is not expected to review or approve these tasks — they are contextual history.

When reprocessing is not requested:
- Transcripts are stored as-is (raw transcript preserved, `processed_at = NULL`).
- Tasks are imported directly from Asana as structural records.

---

## 7. Scope

### 7.1 In Scope

- `POST /clients/{id}/import` — create import job
- `GET /clients/{id}/import/status` — poll import progress
- Import job record in the database (`import_jobs` table)
- Database migration for import flag fields (`is_imported`, `imported_at`, `import_source`) on Transcripts, Tasks, and Agendas tables
- Grain transcript import using the Grain adapter (Feature 37)
- Asana task import using the Asana adapter (Feature 12)
- Historical agenda/Running Notes import (if available in source systems)
- Read-only enforcement on imported records
- Short ID auto-assignment on imported tasks and agendas
- Optional Mastra reprocessing (Workflow A invocation on imported transcripts)
- Per-record error logging during import
- Partial import recovery (resume from failure point)

### 7.2 Out of Scope

- Automatic or scheduled import — on-demand only
- Bulk migration tooling for initial system setup
- Import from sources other than Grain and Asana
- Database schema migrations for the import fields if those migrations were already included in Feature 04 (product database schema) — confirm scope with the database feature owner
- Grain playlist listing (depends on Grain API capabilities established in Feature 37)
- Real-time progress streaming (polling model is sufficient)

---

## 8. Business Constraints

| Constraint | Impact |
|---|---|
| On-demand only | No scheduler or automation triggers this import. The account manager must initiate it explicitly. |
| Grain API Business plan required | Same constraint as Feature 37 — Grain access must be confirmed before import can run. |
| Import records are read-only | The system enforces this at the API layer. Imported records represent historical state, not active work. |
| Grain playlist listing may not be available | If Grain has no list-by-playlist endpoint (confirmed open question in Feature 37), the import must accept individual recording IDs or accept a playlist ID and use whatever Grain API support exists. |

---

## 9. Open Questions

| Question | Impact if Unresolved |
|---|---|
| Does Grain support listing recordings by playlist ID? | If not, the import must accept a list of individual recording IDs rather than a single playlist ID |
| Are the import flag fields (`is_imported`, `imported_at`, `import_source`) already in the Feature 04 migration? | If yes, no new migration is needed. If no, Feature 38 must add the migration. |
| Should partially-imported transcripts (imported but not reprocessed) be visible in the UI? | Affects whether `is_imported` transcripts appear in transcript lists by default |
| What Asana task statuses map to which internal task statuses? | Must be defined before implementing Asana task import |
