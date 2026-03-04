# Database — Product Requirements Document

## Overview

A PostgreSQL database that serves as the **single source of truth** for all business data in the iExcel automation system. No data reaches external systems (Asana, Google Docs, Email) without first being persisted here. The database is accessed exclusively through the [API layer](./api-prd.md) — no direct connections from Mastra, the UI, or terminal clients.

## Problem Statement

Without a centralized data layer:

- Draft tasks exist only in Mastra's runtime memory — lost if a workflow fails.
- Approval state is ambiguous — did this task get pushed to Asana or not?
- There's no audit trail of what was generated, edited, approved, or rejected.
- Client configuration (routing rules, contact lists, workspace mappings) has no home.
- Multiple consumers (UI, terminal, Mastra) could create conflicting state.

The database eliminates all of this by being the authoritative record of everything.

---

## Design Principles

- **Everything persists before it leaves.** A task is saved as a draft in Postgres before it ever touches Asana. An agenda is saved before it's shared or emailed.
- **Immutable history.** Edits create new versions, not overwrites. The original agent-generated content is always recoverable.
- **Client isolation.** All business data is scoped to a client. Queries enforce this at the schema level.
- **API-only access.** No consumer connects to Postgres directly. All reads and writes go through the [API layer](./api-prd.md).

---

## Core Entities

### Clients

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

### Transcripts

Raw and processed call transcripts.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `client_id` | UUID | FK → Clients |
| `grain_call_id` | VARCHAR | Reference to the Grain recording |
| `call_type` | ENUM | `client_call`, `intake`, `follow_up` |
| `call_date` | TIMESTAMP | When the call occurred |
| `raw_transcript` | TEXT | Full transcript text |
| `processed_at` | TIMESTAMP | When the agent processed this transcript |
| `created_at` | TIMESTAMP | |

### Tasks

Generated tasks with full lifecycle tracking. Each task gets a human-readable **short ID** (`TSK-0001`, `TSK-0002`, etc.) for easy reference across the UI, terminal, and chat interfaces.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `TSK-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK → Clients |
| `transcript_id` | UUID | FK → Transcripts (source transcript) |
| `status` | ENUM | `draft`, `approved`, `rejected`, `pushed`, `completed` |
| `title` | VARCHAR | Task title |
| `description` | TEXT | Full structured description (Task Context, Additional Context, Requirements) |
| `assignee` | VARCHAR | iExcel team member |
| `estimated_time` | INTERVAL | Estimated time in hh:mm |
| `scrum_stage` | VARCHAR | Default: `Backlog` |
| `asana_workspace_id` | VARCHAR | Target Asana workspace (nullable, uses client default if null) |
| `asana_project_id` | VARCHAR | Target Asana project |
| `asana_task_id` | VARCHAR | Asana task ID after push (nullable until pushed) |
| `approved_by` | UUID | FK → Users (who approved) |
| `approved_at` | TIMESTAMP | |
| `pushed_at` | TIMESTAMP | When pushed to Asana |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### Task Versions

Immutable edit history for tasks.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `task_id` | UUID | FK → Tasks |
| `version` | INTEGER | Incrementing version number |
| `title` | VARCHAR | Title at this version |
| `description` | TEXT | Description at this version |
| `estimated_time` | INTERVAL | |
| `edited_by` | UUID | FK → Users |
| `source` | ENUM | `agent`, `ui`, `terminal` | Which consumer made the edit |
| `created_at` | TIMESTAMP | |

### Agendas

Generated Running Notes documents with lifecycle tracking. Each agenda gets a human-readable **short ID** (`AGD-0001`, `AGD-0002`, etc.).

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `AGD-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK → Clients |
| `status` | ENUM | `draft`, `in_review`, `finalized`, `shared` |
| `content` | TEXT | The agenda/Running Notes content (markdown or rich text) |
| `cycle_start` | DATE | Start of the task cycle this agenda covers |
| `cycle_end` | DATE | End of the task cycle |
| `shared_url_token` | VARCHAR | Token for the client-facing read-only link |
| `internal_url_token` | VARCHAR | Token for the internal edit link |
| `google_doc_id` | VARCHAR | Google Doc ID after export (nullable) |
| `finalized_by` | UUID | FK → Users |
| `finalized_at` | TIMESTAMP | |
| `shared_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### Agenda Versions

Immutable edit history for agendas.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `agenda_id` | UUID | FK → Agendas |
| `version` | INTEGER | Incrementing version number |
| `content` | TEXT | Content at this version |
| `edited_by` | UUID | FK → Users |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

### Users (Product Profile)

Product-level user records linked to the [Auth Service](./auth-prd.md). Identity data (email, name, authentication) lives in the auth database. This table stores **product-specific** roles and permissions only.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | FK → Auth service's user `sub` claim. The link between identity and product permissions. |
| `email` | VARCHAR | Denormalized from auth (for display/query convenience). Synced on login. |
| `name` | VARCHAR | Denormalized from auth. Synced on login. |
| `role` | ENUM | `admin`, `account_manager`, `team_member` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Note:** The auth service's database owns the canonical user identity (see [`auth-prd.md`](./auth-prd.md)). This table is created on first login (just-in-time provisioning) when a new user authenticates via SSO and is auto-linked via `auth_user_id`.

### Asana Workspaces

Configured Asana accounts/workspaces available for task routing.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `asana_workspace_id` | VARCHAR | Asana's workspace ID |
| `name` | VARCHAR | Display name |
| `access_token_ref` | VARCHAR | Reference to stored credential (not the token itself) |
| `created_at` | TIMESTAMP | |

### Audit Log

Every significant action in the system.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → Users (nullable for agent actions) |
| `action` | VARCHAR | e.g., `task.created`, `task.approved`, `agenda.shared`, `agenda.emailed` |
| `entity_type` | VARCHAR | `task`, `agenda`, `transcript`, `client` |
| `entity_id` | UUID | FK to the relevant entity |
| `metadata` | JSONB | Additional context (e.g., recipient list for emails, old/new values for edits) |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

---

## Key Relationships

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

---

## Task Lifecycle

```
agent generates → draft → (human edits) → approved → pushed (to Asana) → completed
                              ↓
                          rejected
```

Each status transition is recorded in the audit log.

---

## Agenda Lifecycle

```
agent generates → draft → in_review → (human edits) → finalized → shared
                                                            ↓
                                                     emailed / exported to Google Docs
```

---

## Indexes

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

---

## Historical Data & Client Reactivation

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

---

## Open Questions

- [ ] Should soft deletes be used (archived flag) or hard deletes for rejected tasks?
- [ ] What's the retention policy for transcripts and audit logs?
- [ ] Should agenda content be stored as markdown, HTML, or a rich text format (e.g., ProseMirror JSON for collaborative editing)?
- [ ] Do we need a `client_users` join table for multi-client access per user?
- [ ] Should Asana credentials be stored in Postgres or a separate secrets manager (e.g., Vault)?
