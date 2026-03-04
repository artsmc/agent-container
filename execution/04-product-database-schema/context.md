# Feature 04: Product Database Schema

## Summary
Create the product database schema and migrations in packages/database/. Tables: Clients, Transcripts (with NormalizedTranscript segments as JSONB), Tasks (with short_id, external_ref JSONB instead of asana-specific fields, added priority/tags/due_date), Task Versions, Agendas (with short_id), Agenda Versions, Users (product profile linked to auth via auth_user_id), Asana Workspaces, Audit Log. Include import fields (is_imported, imported_at, import_source).

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding), 01 (Shared Types — type definitions inform the schema)
- **Blocks**: 07 (API Scaffolding), 09 (Client Management), 10 (Transcript Endpoints), 11 (Task Endpoints), 14 (Agenda Endpoints), 38 (Historical Import)

## Source PRDs
- database-prd.md (all entities)
- api-prd.md (endpoint patterns informing indexes)

## Relevant PRD Extracts

### Core Entities (database-prd.md)

#### Clients

The central organizing entity. Everything is scoped to a client.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | VARCHAR | Client name (e.g., "Total Life") |
| `grain_playlist_id` | VARCHAR | Reference to the client's Grain playlist |
| `default_asana_workspace_id` | VARCHAR | Default Asana workspace for task routing |
| `default_asana_project_id` | VARCHAR | Default Asana project within the workspace |
| `email_recipients` | JSONB | Default recipient list for agenda distribution |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Transcripts

Raw and processed call transcripts.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `client_id` | UUID | FK to Clients |
| `grain_call_id` | VARCHAR | Reference to the Grain recording |
| `call_type` | ENUM | `client_call`, `intake`, `follow_up` |
| `call_date` | TIMESTAMP | When the call occurred |
| `raw_transcript` | TEXT | Full transcript text |
| `processed_at` | TIMESTAMP | When the agent processed this transcript |
| `created_at` | TIMESTAMP | |

#### Tasks

Generated tasks with full lifecycle tracking. Each task gets a human-readable short ID.

Original PRD schema:

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `TSK-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK to Clients |
| `transcript_id` | UUID | FK to Transcripts (source transcript) |
| `status` | ENUM | `draft`, `approved`, `rejected`, `pushed`, `completed` |
| `title` | VARCHAR | Task title |
| `description` | TEXT | Full structured description (Task Context, Additional Context, Requirements) |
| `assignee` | VARCHAR | iExcel team member |
| `estimated_time` | INTERVAL | Estimated time in hh:mm |
| `scrum_stage` | VARCHAR | Default: `Backlog` |
| `asana_workspace_id` | VARCHAR | Target Asana workspace (nullable, uses client default if null) |
| `asana_project_id` | VARCHAR | Target Asana project |
| `asana_task_id` | VARCHAR | Asana task ID after push (nullable until pushed) |
| `approved_by` | UUID | FK to Users (who approved) |
| `approved_at` | TIMESTAMP | |
| `pushed_at` | TIMESTAMP | When pushed to Asana |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Task Versions

Immutable edit history for tasks.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `task_id` | UUID | FK to Tasks |
| `version` | INTEGER | Incrementing version number |
| `title` | VARCHAR | Title at this version |
| `description` | TEXT | Description at this version |
| `estimated_time` | INTERVAL | |
| `edited_by` | UUID | FK to Users |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

#### Agendas

Generated Running Notes documents with lifecycle tracking.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `AGD-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK to Clients |
| `status` | ENUM | `draft`, `in_review`, `finalized`, `shared` |
| `content` | TEXT | The agenda/Running Notes content (markdown or rich text) |
| `cycle_start` | DATE | Start of the task cycle this agenda covers |
| `cycle_end` | DATE | End of the task cycle |
| `shared_url_token` | VARCHAR | Token for the client-facing read-only link |
| `internal_url_token` | VARCHAR | Token for the internal edit link |
| `google_doc_id` | VARCHAR | Google Doc ID after export (nullable) |
| `finalized_by` | UUID | FK to Users |
| `finalized_at` | TIMESTAMP | |
| `shared_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Agenda Versions

Immutable edit history for agendas.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `agenda_id` | UUID | FK to Agendas |
| `version` | INTEGER | Incrementing version number |
| `content` | TEXT | Content at this version |
| `edited_by` | UUID | FK to Users |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

#### Users (Product Profile)

Product-level user records linked to the Auth Service. Identity data (email, name, authentication) lives in the auth database. This table stores product-specific roles and permissions only.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | FK to Auth service's user `sub` claim. The link between identity and product permissions. |
| `email` | VARCHAR | Denormalized from auth (for display/query convenience). Synced on login. |
| `name` | VARCHAR | Denormalized from auth. Synced on login. |
| `role` | ENUM | `admin`, `account_manager`, `team_member` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Note:** The auth service's database owns the canonical user identity. This table is created on first login (just-in-time provisioning) when a new user authenticates via SSO and is auto-linked via `auth_user_id`.

#### Asana Workspaces

Configured Asana accounts/workspaces available for task routing.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `asana_workspace_id` | VARCHAR | Asana's workspace ID |
| `name` | VARCHAR | Display name |
| `access_token_ref` | VARCHAR | Reference to stored credential (not the token itself) |
| `created_at` | TIMESTAMP | |

#### Audit Log

Every significant action in the system.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to Users (nullable for agent actions) |
| `action` | VARCHAR | e.g., `task.created`, `task.approved`, `agenda.shared`, `agenda.emailed` |
| `entity_type` | VARCHAR | `task`, `agenda`, `transcript`, `client` |
| `entity_id` | UUID | FK to the relevant entity |
| `metadata` | JSONB | Additional context (e.g., recipient list for emails, old/new values for edits) |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

### Key Relationships (database-prd.md)

```
Clients
  ├── Transcripts (1:many)
  ├── Tasks (1:many)
  │     └── Task Versions (1:many)
  ├── Agendas (1:many)
  │     └── Agenda Versions (1:many)
  └── Asana Workspaces (many:many via client default + per-task override)

Users
  ├── Tasks (approved_by)
  ├── Task Versions (edited_by)
  ├── Agenda Versions (edited_by)
  └── Audit Log (user_id)
```

### Task Lifecycle (database-prd.md)

```
agent generates -> draft -> (human edits) -> approved -> pushed (to Asana) -> completed
                              |
                          rejected
```

Each status transition is recorded in the audit log.

### Agenda Lifecycle (database-prd.md)

```
agent generates -> draft -> in_review -> (human edits) -> finalized -> shared
                                                              |
                                                       emailed / exported to Google Docs
```

### Historical Data & Import Fields (database-prd.md)

| Field | Table | Description |
|---|---|---|
| `is_imported` | Transcripts, Tasks, Agendas | `BOOLEAN DEFAULT false` — distinguishes imported historical records from system-generated ones |
| `imported_at` | Transcripts, Tasks, Agendas | `TIMESTAMP` — when the import occurred |
| `import_source` | Transcripts, Tasks, Agendas | `VARCHAR` — origin reference (e.g., Grain playlist ID, Asana project ID) |

Imported records are read-only by default — they represent the historical state, not active work.

### Indexes (database-prd.md)

Priority indexes for common query patterns:

- `tasks(short_id)` — UNIQUE — lookup by human-readable ID
- `tasks(client_id, status)` — "Show me all draft tasks for Total Life"
- `tasks(transcript_id)` — "Show me all tasks from this intake call"
- `agendas(short_id)` — UNIQUE — lookup by human-readable ID
- `agendas(client_id, status)` — "Get the current draft agenda for Total Life"
- `agendas(shared_url_token)` — Client-facing link lookups
- `audit_log(entity_type, entity_id)` — "Show me the history of this task"
- `audit_log(user_id, created_at)` — "Show me everything Mark did today"
- `transcripts(client_id, call_date)` — "Get the latest transcript for Total Life"

### API Endpoint Patterns Informing Indexes (api-prd.md)

- `GET /clients/{id}/tasks` — filterable by `status`, `transcript_id` (needs client_id+status index, transcript_id index)
- `GET /tasks/{id}` — accepts UUID or short ID (needs short_id unique index)
- `GET /clients/{id}/agendas` — list by client (needs client_id index)
- `GET /agendas/{id}` — accepts UUID or short ID (needs short_id unique index)
- `GET /shared/{token}` — public lookup by token (needs shared_url_token index)
- `GET /audit` — filterable by entity_type, entity_id, user_id, date_range

## Scope

### In Scope
- Migration creating the `clients` table
- Migration creating the `transcripts` table with FK to clients, call_type enum, and import fields
- Migration creating the `tasks` table with short_id, external_ref JSONB (replacing asana-specific fields), added priority/tags/due_date columns, FK to clients and transcripts, and import fields
- Migration creating the `task_versions` table with FK to tasks and users
- Migration creating the `agendas` table with short_id, FK to clients, and import fields
- Migration creating the `agenda_versions` table with FK to agendas and users
- Migration creating the `users` table (product profile) with auth_user_id link
- Migration creating the `asana_workspaces` table
- Migration creating the `audit_log` table
- All enums: task_status, agenda_status, call_type, user_role, edit_source
- All indexes listed in database-prd.md
- Additional indexes for auth_user_id (unique), users.email
- Transcript segments stored as JSONB column (for NormalizedTranscript segments)
- Down migrations for rollback
- Seed data setup

### Out of Scope
- Auth database schema — that is feature 03
- API application code — that is feature 07+
- ORM model definitions (if using Drizzle/Prisma, the schema file counts as part of this feature, but query logic does not)
- Terraform database provisioning — that is feature 02

## Key Decisions

### external_ref JSONB Replaces Asana-Specific Fields
The original database PRD has `asana_workspace_id`, `asana_project_id`, and `asana_task_id` as separate columns on the Tasks table. Per Q&A decisions, these are replaced with a single `external_ref` JSONB column containing: `{ system, externalId, externalUrl, projectId, workspaceId }`. This makes the schema extensible to other project management tools without migrations. The Clients table retains `default_asana_workspace_id` and `default_asana_project_id` as-is since they are client configuration, not per-task state.

### Transcript Segments Stored as JSONB
In addition to the `raw_transcript` TEXT column from the original PRD, the transcripts table should include a `segments` JSONB column to store the NormalizedTranscript segments array (each segment has speaker, timestamp, text). This enables structured queries against transcript data without re-parsing the raw text.

### Task Status Enum — "completed" Removed
The task status enum is: `draft`, `approved`, `rejected`, `pushed`. The `completed` status from the original database PRD is removed because the external system (Asana) owns completion status. The iExcel system tracks tasks up to the point they are pushed; completion is reconciled from Asana via feature 13 (Status Reconciliation).

### Added Fields on Tasks
The following fields are added to the Tasks table beyond the original database PRD:
- `priority` (VARCHAR or ENUM) — task priority level
- `tags` (JSONB) — array of tags for categorization
- `due_date` (DATE) — optional due date for the task

### Short ID Generation
Both `tasks.short_id` and `agendas.short_id` are auto-generated, globally unique, and immutable. The generation mechanism (sequence-based, e.g., `TSK-` + zero-padded sequence) should be implemented as a database trigger or application-level logic in the migration.

### Import Fields
The `is_imported`, `imported_at`, and `import_source` fields are added to Transcripts, Tasks, and Agendas tables to support the historical data import feature (feature 38). These default to `false`/null for system-generated records.
