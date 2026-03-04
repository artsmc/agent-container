# Feature 01: Shared Types Package

## Summary
Create the packages/shared-types/ package with TypeScript types shared across all apps. Includes types for tasks (NormalizedTask with short IDs, external_ref), agendas, clients, auth (OIDC tokens, user identity), transcripts (NormalizedTranscript with segments), and API request/response contracts.

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding)
- **Blocks**: 04, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23 (all features that import shared types)

## Source PRDs
- infra-prd.md (shared-types package in Nx structure)
- database-prd.md (all entity schemas)
- api-prd.md (endpoint contracts, error codes)

## Relevant PRD Extracts

### Package Structure (infra-prd.md)

```
packages/
  └── shared-types/
      ├── src/
      │   ├── task.ts       # Task, TaskVersion, short ID types
      │   ├── agenda.ts     # Agenda, AgendaVersion types
      │   ├── client.ts     # Client config types
      │   ├── auth.ts       # OIDC token types, user identity types
      │   ├── api.ts        # API request/response contracts
      │   └── index.ts
      └── project.json
```

### Entity Schemas (database-prd.md)

#### Clients

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
| `asana_workspace_id` | VARCHAR | Target Asana workspace (nullable) |
| `asana_project_id` | VARCHAR | Target Asana project |
| `asana_task_id` | VARCHAR | Asana task ID after push (nullable until pushed) |
| `approved_by` | UUID | FK to Users |
| `approved_at` | TIMESTAMP | |
| `pushed_at` | TIMESTAMP | When pushed to Asana |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Task Versions

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

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `AGD-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK to Clients |
| `status` | ENUM | `draft`, `in_review`, `finalized`, `shared` |
| `content` | TEXT | The agenda/Running Notes content |
| `cycle_start` | DATE | Start of the task cycle |
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

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | FK to Auth service's user `sub` claim |
| `email` | VARCHAR | Denormalized from auth |
| `name` | VARCHAR | Denormalized from auth |
| `role` | ENUM | `admin`, `account_manager`, `team_member` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Asana Workspaces

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `asana_workspace_id` | VARCHAR | Asana's workspace ID |
| `name` | VARCHAR | Display name |
| `access_token_ref` | VARCHAR | Reference to stored credential |
| `created_at` | TIMESTAMP | |

#### Audit Log

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to Users (nullable for agent actions) |
| `action` | VARCHAR | e.g., `task.created`, `task.approved`, `agenda.shared` |
| `entity_type` | VARCHAR | `task`, `agenda`, `transcript`, `client` |
| `entity_id` | UUID | FK to the relevant entity |
| `metadata` | JSONB | Additional context |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

### API Error Codes (api-prd.md)

Standard error response format:

```json
{
  "error": {
    "code": "TASK_NOT_APPROVABLE",
    "message": "Task is in 'draft' status and must be reviewed before approval.",
    "details": {
      "task_id": "abc-123",
      "current_status": "rejected"
    }
  }
}
```

Common error codes:

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | User lacks permission for this action |
| `CLIENT_NOT_FOUND` | 404 | Client ID doesn't exist or user can't access it |
| `TASK_NOT_APPROVABLE` | 422 | Task status doesn't allow approval |
| `AGENDA_NOT_FINALIZABLE` | 422 | Agenda hasn't been reviewed |
| `PUSH_FAILED` | 502 | External service returned an error |
| `WORKSPACE_NOT_CONFIGURED` | 422 | No Asana workspace set for this task or client |

### API Endpoint Contracts (api-prd.md)

#### Task Endpoints
- All task endpoints accept either the internal UUID or the human-readable short ID (e.g., `TSK-0042`) as the `{id}` parameter. The API resolves short IDs transparently.
- `GET /clients/{id}/tasks` — List tasks for a client (filterable by `status`, `transcript_id`)
- `POST /clients/{id}/tasks` — Create draft tasks (called by Mastra). Short IDs are auto-assigned.
- `GET /tasks/{id}` — Get a specific task with version history. Accepts UUID or short ID.
- `PATCH /tasks/{id}` — Edit a draft task
- `POST /tasks/{id}/approve` — Approve a single task
- `POST /tasks/{id}/reject` — Reject a task
- `POST /tasks/{id}/push` — Push an approved task to Asana
- `POST /clients/{id}/tasks/approve` — Batch approve
- `POST /clients/{id}/tasks/push` — Batch push

#### Agenda Endpoints
- `GET /clients/{id}/agendas` — List agendas for a client
- `POST /clients/{id}/agendas` — Create a draft agenda. Short ID auto-assigned.
- `GET /agendas/{id}` — Get a specific agenda with version history. Accepts UUID or short ID.
- `PATCH /agendas/{id}` — Edit agenda content
- `POST /agendas/{id}/finalize` — Mark agenda as finalized
- `POST /agendas/{id}/share` — Generate shareable URLs
- `POST /agendas/{id}/email` — Send agenda to recipients
- `POST /agendas/{id}/export` — Export to Google Docs
- `GET /shared/{token}` — Public endpoint, retrieve shared agenda by token (no auth)

#### Permission Model
| Role | Capabilities |
|---|---|
| **Admin** | Everything. Manage workspaces, users, and system config. |
| **Account Manager** | Full CRUD on their assigned clients. Approve tasks, finalize agendas, trigger workflows. |
| **Team Member** | Read access to assigned clients. Edit agendas (collaborative). Cannot approve or push. |

### Auth Token Structure (auth-prd.md)

ID Token Claims:

```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "user-uuid-here",
  "aud": "iexcel-api",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "iat": 1709136000,
  "exp": 1709139600
}
```

## Scope

### In Scope
- `task.ts` — NormalizedTask interface (with shortId, external_ref pattern), TaskVersion, TaskStatus enum, TaskSource enum, short ID type
- `agenda.ts` — Agenda interface (with shortId), AgendaVersion, AgendaStatus enum
- `client.ts` — Client config types, email recipients type
- `auth.ts` — OIDC token claims types, user identity types, user role enum
- `transcript.ts` — NormalizedTranscript interface with segments array
- `api.ts` — API request/response contracts, error response types, error code enum
- `index.ts` — Barrel exports

### Out of Scope
- No runtime code — types only (no functions, classes, or implementations)
- No database ORM models (those belong in packages/database and packages/auth-database)
- No API client implementation (that is feature 22)

## Key Decisions

### NormalizedTranscript Interface
The NormalizedTranscript interface standardizes transcript data from any source:
- `source` — origin system (e.g., "grain", "manual")
- `sourceId` — ID in the source system
- `meetingDate` — when the meeting occurred
- `client` — client reference
- `meetingType` — type of meeting (maps to call_type enum: client_call, intake, follow_up)
- `participants` — list of meeting participants
- `durationSeconds` — meeting duration
- `segments` — array of transcript segments, each with: `speaker`, `timestamp`, `text`
- `summary` — optional summary text
- `highlights` — optional array of key highlights

### NormalizedTask Interface
The NormalizedTask interface uses an external_ref pattern instead of Asana-specific fields:
- `shortId` — human-readable ID (e.g., TSK-0001)
- `transcriptId` — source transcript reference
- `title` — task title
- `description` — structured object with `taskContext`, `additionalContext`, `requirements`
- `assignee` — team member
- `priority` — task priority level
- `estimatedTime` — estimated duration
- `dueDate` — optional due date
- `tags` — array of tags for categorization
- `client` — client reference
- `scrumStage` — default "Backlog"
- `status` — draft, approved, rejected, pushed (no "completed" — external system owns that status)
- `externalRef` — object with `system` (e.g., "asana"), `externalId`, `externalUrl`, `projectId`, `workspaceId`

### External Ref Pattern
The `externalRef` JSONB object replaces the Asana-specific fields (`asana_task_id`, `asana_workspace_id`, `asana_project_id`) from the original database PRD. This makes the system extensible to other project management tools (Monday.com, Jira, etc.) without schema changes. The type definition should reflect this generalized pattern while the database stores it as JSONB.

### Task Status Enum
The status enum is: `draft`, `approved`, `rejected`, `pushed`. The `completed` status from the database PRD is removed because the external system (Asana) owns completion status, not the iExcel system.
