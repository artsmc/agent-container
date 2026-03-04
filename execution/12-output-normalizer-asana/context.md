# Feature 12: Output Normalizer — Asana

## Summary
Build the Asana output normalizer/adapter in the API layer that converts a `NormalizedTask` to Asana API format, creates the task in Asana via its REST API, and stores the `external_ref` back on the product database task record. Handles field mapping (title, description, custom fields, assignee), workspace routing, and error recovery.

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 07 (API scaffolding), 11 (task endpoints invoke the output normalizer on push)
- **Blocks**: 13 (status reconciliation reads Asana tasks created by this adapter)

## Source PRDs
- `api-prd.md` — External Service Adapters, Task Routing
- `database-prd.md` — Tasks entity (external reference storage)
- `asana-task-build.md` — Field mappings, description template, custom fields

## Relevant PRD Extracts

### External Service Adapters (api-prd.md)
- **Asana Adapter** — Translates internal task format to Asana's API. Handles workspace routing, custom field mapping, and error recovery.

Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter -- nothing else changes.

### Task Routing (api-prd.md)
When a task is pushed, the API determines the target Asana workspace:
1. Check task-level override (`asana_workspace_id` on the task).
2. Fall back to client default (`default_asana_workspace_id` on the client).
3. If neither is set, reject the push with error `WORKSPACE_NOT_CONFIGURED`.

### Task Description Format (asana-task-build.md)
The description text should be in this format:

> **TASK CONTEXT**
> - Here is where you would write conversational text explaining the reason for the ticket itself. Where applicable, you should include any history or exact quotes based on the transcripts, referencing the exact call date when you use quotes.
>
> **ADDITIONAL CONTEXT**
> - Here is where you would outline any additional context that represents related, external, or historical factors that could affect this specific task.
>
> **REQUIREMENTS**
> - Here is where you would outline any specific requirements to correctly execute the task, including tools required or exact steps required to accomplish the task.

### Custom Fields (asana-task-build.md)
| Field | Value |
|---|---|
| Client | e.g., `Total Life` |
| Scrum Stage | `Backlog` |
| Estimated Time | `hh mm` format (hours and minutes) — estimated based on industry best practices |

### Tasks Entity (database-prd.md)
Relevant fields for the output normalizer:
- `title` — maps to Asana task name
- `description` — maps to Asana task notes (3-section template)
- `assignee` — iExcel team member name, needs lookup to Asana user
- `estimated_time` — maps to Asana custom field
- `scrum_stage` — maps to Asana custom field enum
- `client_id` — used to resolve client name for Asana custom field
- `asana_workspace_id` / `asana_project_id` — routing targets
- `asana_task_id` — populated after successful push

### Error Handling (api-prd.md)
| Code | HTTP Status | Description |
|---|---|---|
| PUSH_FAILED | 502 | External service (Asana) returned an error |
| WORKSPACE_NOT_CONFIGURED | 422 | No Asana workspace set for this task or client |

## Scope

### In Scope
- Asana output normalizer module in the API layer
- **Field mapping from NormalizedTask to Asana API format:**
  - `title` -> Asana `name`
  - `description` -> Asana `notes` (formatted as the 3-section template: Task Context, Additional Context, Requirements)
  - `client` -> Asana custom field (mapped by GID, not name)
  - `scrumStage` -> Asana custom field enum (mapped by GID)
  - `estimatedTime` -> Asana custom field (mapped by GID)
  - `assignee` -> Asana assignee (lookup by name or email to resolve Asana user GID)
  - `priority` -> Asana custom field (if applicable)
  - `tags` -> Asana labels/tags
- **Workspace routing**: Resolve target workspace and project using the cascade logic (task override -> client default -> error)
- **Asana API integration**:
  - Create task via Asana REST API (`POST /tasks`)
  - Set project membership
  - Set custom field values (by GID)
  - Set assignee (by GID)
- **External reference storage**: On successful creation, store `external_ref` JSONB back on the task record with Asana task GID, workspace GID, project GID, and permalink URL
- **Error handling**:
  - Asana API errors -> `PUSH_FAILED` (502) with details
  - Missing workspace config -> `WORKSPACE_NOT_CONFIGURED` (422)
  - Retry logic for transient Asana API failures (rate limits, 5xx)
  - Partial failure handling for batch pushes (per-task success/failure reporting)
- **Custom field GID configuration**: Mechanism to store and retrieve the mapping between logical field names and Asana custom field GIDs (per workspace)
- **Assignee resolution**: Lookup Asana user GID from team member name or email

### Out of Scope
- Asana task reading/fetching (status reconciliation) -- that is feature 13
- Asana workspace management endpoints -- those are separate endpoints in the API PRD
- Other output adapters (Jira, Linear, Monday.com) -- this is the V1 Asana adapter only; future adapters follow the same pattern
- Asana OAuth flow / credential management -- credentials are stored via workspace configuration
- Batch task creation in a single Asana API call -- Asana API does not support this; tasks are created individually

## Key Decisions
- **Output normalizer lives in the API layer**, not a separate service. It is a module invoked by the task push endpoint (feature 11).
- **NormalizedTask -> Asana mapping is the V1 adapter.** Jira, Linear, and other adapters can follow the same interface pattern: accept a NormalizedTask, return an external reference. The adapter interface should be designed for pluggability.
- **Asana does NOT support batch-fetch by arbitrary task GIDs.** Each task must be created individually via `POST /tasks`. Batch push from feature 11 iterates and calls this adapter per task.
- **Workspace search requires Asana Premium; use per-project fetch instead.** When looking up existing tasks or validating workspace access, query by project rather than workspace-wide search.
- **Custom field mapping requires GIDs, not names.** Asana custom fields are identified by GID (globally unique ID), not display name. The system must store a mapping of logical field names (Client, Scrum Stage, Estimated Time) to Asana custom field GIDs. This mapping is per-workspace and configured during workspace setup.
- **Description formatting**: The adapter converts the structured description (which may be markdown or structured text) into Asana-compatible rich text or plain text for the `notes` field, preserving the 3-section template format.
- **Assignee lookup**: The adapter resolves assignee names/emails to Asana user GIDs. This may require caching Asana workspace members to avoid per-task API calls.
