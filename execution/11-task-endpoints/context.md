# Feature 11: Task Endpoints

## Summary
Implement task CRUD endpoints including creation of draft tasks (with auto-assigned short IDs), listing with filters, detail with version history (accepting UUID or short ID), editing drafts, approval, rejection, push to external systems via the output normalizer, and batch approve/push operations. Includes task routing logic (workspace selection) and approval enforcement.

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 07 (API scaffolding), 09 (client management for client-scoped routes), 04 (product database schema for Tasks and Task Versions tables)
- **Blocks**: 12 (output normalizer is invoked by the push endpoint), 19 (Workflow A creates draft tasks via these endpoints)

## Source PRDs
- `api-prd.md` — Task endpoints, Task Routing, Approval Enforcement
- `database-prd.md` — Tasks entity, Task Versions entity, Task Lifecycle
- `asana-task-build.md` — Task description format (3-section template), custom fields

## Relevant PRD Extracts

### Task Endpoints (api-prd.md)
All task endpoints accept either the internal UUID or the human-readable short ID (e.g., `TSK-0042`) as the `{id}` parameter. The API resolves short IDs transparently.

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/tasks` | GET | List tasks for a client (filterable by `status`, `transcript_id`) |
| `/clients/{id}/tasks` | POST | Create draft tasks (called by Mastra after transcript processing). Short IDs are auto-assigned. |
| `/tasks/{id}` | GET | Get a specific task with version history. Accepts UUID or short ID. |
| `/tasks/{id}` | PATCH | Edit a draft task (description, assignee, estimated time, routing) |
| `/tasks/{id}/approve` | POST | Approve a single task |
| `/tasks/{id}/reject` | POST | Reject a task |
| `/tasks/{id}/push` | POST | Push an approved task to Asana |
| `/clients/{id}/tasks/approve` | POST | Batch approve tasks (body: list of task short IDs or UUIDs) |
| `/clients/{id}/tasks/push` | POST | Batch push approved tasks to Asana |

### Task Routing (api-prd.md)
When a task is pushed, the API determines the target Asana workspace:
1. Check task-level override (`asana_workspace_id` on the task).
2. Fall back to client default (`default_asana_workspace_id` on the client).
3. If neither is set, reject the push with error `WORKSPACE_NOT_CONFIGURED`.

### Approval Enforcement (api-prd.md)
- Tasks can only be pushed if `status = approved`.
- Only users with `account_manager` or `admin` role can approve.
- Approval sets `approved_by`, `approved_at`, and logs to audit.

### Tasks Entity (database-prd.md)
| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| short_id | VARCHAR | Human-readable ID (e.g., `TSK-0001`). Auto-generated, globally unique, immutable. |
| client_id | UUID | FK -> Clients |
| transcript_id | UUID | FK -> Transcripts (source transcript) |
| status | ENUM | `draft`, `approved`, `rejected`, `pushed`, `completed` |
| title | VARCHAR | Task title |
| description | TEXT | Full structured description (Task Context, Additional Context, Requirements) |
| assignee | VARCHAR | iExcel team member |
| estimated_time | INTERVAL | Estimated time in hh:mm |
| scrum_stage | VARCHAR | Default: `Backlog` |
| asana_workspace_id | VARCHAR | Target Asana workspace (nullable, uses client default if null) |
| asana_project_id | VARCHAR | Target Asana project |
| asana_task_id | VARCHAR | Asana task ID after push (nullable until pushed) |
| approved_by | UUID | FK -> Users (who approved) |
| approved_at | TIMESTAMP | |
| pushed_at | TIMESTAMP | When pushed to Asana |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Task Versions Entity (database-prd.md)
| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| task_id | UUID | FK -> Tasks |
| version | INTEGER | Incrementing version number |
| title | VARCHAR | Title at this version |
| description | TEXT | Description at this version |
| estimated_time | INTERVAL | |
| edited_by | UUID | FK -> Users |
| source | ENUM | `agent`, `ui`, `terminal` |
| created_at | TIMESTAMP | |

### Task Lifecycle (database-prd.md)
```
agent generates -> draft -> (human edits) -> approved -> pushed (to Asana) -> completed
                                 |
                             rejected
```
Each status transition is recorded in the audit log.

### Task Description Format (asana-task-build.md)
The description text should be in this format:

> **TASK CONTEXT**
> - Conversational text explaining the reason for the ticket. Include history or exact quotes based on transcripts, referencing the exact call date.
>
> **ADDITIONAL CONTEXT**
> - Additional context representing related, external, or historical factors affecting this task.
>
> **REQUIREMENTS**
> - Specific requirements to execute the task, including tools required or exact steps.

### Custom Fields (asana-task-build.md)
| Field | Value |
|---|---|
| Client | e.g., `Total Life` |
| Scrum Stage | `Backlog` |
| Estimated Time | `hh mm` format |

### Indexes (database-prd.md)
- `tasks(short_id)` — UNIQUE — lookup by human-readable ID
- `tasks(client_id, status)` — "Show me all draft tasks for Total Life"
- `tasks(transcript_id)` — "Show me all tasks from this intake call"

## Scope

### In Scope
- `POST /clients/{id}/tasks` — Create draft tasks:
  - Auto-assign short IDs (TSK-#### format, globally unique, immutable)
  - Accept array of tasks (batch creation from Mastra agent output)
  - Create initial Task Version record (version 1, source=`agent` or `ui`/`terminal`)
  - Set status to `draft`, scrum_stage to `Backlog`
- `GET /clients/{id}/tasks` — List tasks for a client:
  - Filterable by `status`, `transcript_id`
  - Pagination support
  - Sorted by creation date descending
- `GET /tasks/{id}` — Get task detail:
  - Accepts UUID or short ID (TSK-####); API resolves transparently
  - Returns task with full version history from Task Versions table
- `PATCH /tasks/{id}` — Edit a draft task:
  - Only editable fields: title, description, assignee, estimated_time, scrum_stage, asana_workspace_id, asana_project_id
  - Creates a new Task Version record on each edit
  - Only allowed when status is `draft` or `rejected`
- `POST /tasks/{id}/approve` — Approve a single task:
  - Role check: only `account_manager` or `admin`
  - Sets status=`approved`, `approved_by`, `approved_at`
  - Logs to audit
- `POST /tasks/{id}/reject` — Reject a task:
  - Sets status=`rejected`
  - Logs to audit
- `POST /tasks/{id}/push` — Push approved task to external system:
  - Enforces status=`approved`
  - Executes task routing logic (task override -> client default -> error)
  - Calls the output normalizer (feature 12) to push to Asana
  - Stores `external_ref` (JSONB) on success, sets status=`pushed`, `pushed_at`
- `POST /clients/{id}/tasks/approve` — Batch approve (body: list of IDs)
- `POST /clients/{id}/tasks/push` — Batch push approved tasks
- Short ID generation logic (TSK-#### globally unique sequence)
- Task routing logic (workspace selection cascade)
- Approval enforcement middleware/logic
- Audit log entries for all status transitions

### Out of Scope
- The actual Asana API integration (creating the task in Asana) -- that is feature 12 (output normalizer)
- Mastra agent logic that generates tasks from transcripts -- that is feature 19
- Task completion status syncing from Asana -- that is feature 13 (status reconciliation)
- Agenda-related task queries (completed tasks for agenda generation) -- that is feature 14

## Key Decisions
- **Short ID format**: `TSK-####` globally unique, immutable. Uses a database sequence or equivalent to guarantee uniqueness. Never reused.
- **`external_ref` JSONB replaces `asana_task_id`**: The task stores an `external_ref` JSONB field instead of a single `asana_task_id` VARCHAR. This supports future adapters (Jira, Linear) without schema changes. For Asana, the shape is `{ "provider": "asana", "taskId": "...", "workspaceId": "...", "projectId": "..." }`.
- **Task status enum**: `draft`, `approved`, `rejected`, `pushed`. There is no `completed` status in the product database -- Asana owns task completion. The `completed` value in the database-prd.md schema is not used by this system; completion is tracked via status reconciliation (feature 13).
- **Version history**: Every edit creates a new Task Version row. The original agent-generated content is always recoverable as version 1.
- **Batch operations**: Batch approve and batch push process each task individually and return per-task results (success/failure), allowing partial success.
