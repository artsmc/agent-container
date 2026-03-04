# FRS — Functional Requirement Specification
# Feature 04: Product Database Schema

## 1. Overview

This document specifies the functional requirements for every table, enum, index, constraint, and generation mechanism that makes up the iExcel product database schema. It is the implementation-level companion to the FRD.

---

## 2. Enum Definitions

All enums must be created before any table that references them. Down migrations must drop enums after dropping the tables that depend on them.

### 2.1 `task_status`

| Value | Description |
|---|---|
| `draft` | Initial state. Agent-generated, not yet reviewed. |
| `approved` | Reviewed and approved by an account manager or admin. Ready to push. |
| `rejected` | Reviewed and explicitly rejected. Not pushable. |
| `pushed` | Successfully pushed to the external project management system. |
| `completed` | Only set by historical import (Feature 38) or reconciliation cache writes (Feature 13). Never set directly by user actions. |

### 2.2 `agenda_status`

| Value | Description |
|---|---|
| `draft` | Agent-generated, not yet reviewed. |
| `in_review` | Being actively reviewed or edited by the team. |
| `finalized` | Approved internally. Ready to share with client. |
| `shared` | Shared with client via URL or email. |

### 2.3 `call_type`

| Value | Description |
|---|---|
| `client_call` | A regular recurring client call. |
| `intake` | An onboarding or initial engagement call. |
| `follow_up` | A follow-up call addressing specific prior items. |

### 2.4 `user_role`

| Value | Description |
|---|---|
| `admin` | Full system access including workspace management and user administration. |
| `account_manager` | Full CRUD on assigned clients. Can approve tasks and finalize agendas. |
| `team_member` | Read access to assigned clients. Can edit agendas collaboratively. Cannot approve or push. |

### 2.5 `edit_source`

| Value | Description |
|---|---|
| `agent` | Edit originated from a Mastra agent workflow. |
| `ui` | Edit originated from the web UI. |
| `terminal` | Edit originated from the terminal (Claude/Claw MCP client). |

---

## 3. Table Specifications

### 3.1 `clients`

The central organizing entity. Every other business entity references a client.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `name` | VARCHAR(255) | No | — | NOT NULL | Display name, e.g. "Total Life" |
| `grain_playlist_id` | VARCHAR(255) | Yes | NULL | | Reference to Grain playlist for transcript sync |
| `default_asana_workspace_id` | VARCHAR(255) | Yes | NULL | | Client-level Asana workspace default |
| `default_asana_project_id` | VARCHAR(255) | Yes | NULL | | Client-level Asana project default |
| `email_recipients` | JSONB | No | `'[]'::jsonb` | NOT NULL | Array of recipient objects for agenda distribution |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | Must be updated via trigger or application on every write |

`email_recipients` shape (NOT NULL, defaults to `'[]'::jsonb`):
```json
[
  { "name": "Jane Smith", "email": "jane@totallife.com", "role": "primary" }
]
```

### 3.2 `transcripts`

Raw and processed call transcripts. The `normalized_segments` column stores the structured parse of the raw transcript.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `client_id` | UUID | No | — | FK → `clients.id` ON DELETE RESTRICT | |
| `grain_call_id` | VARCHAR(255) | Yes | NULL | | Grain recording reference |
| `call_type` | `call_type` | No | — | NOT NULL | Enum value |
| `call_date` | TIMESTAMPTZ | No | — | NOT NULL | When the call occurred |
| `raw_transcript` | TEXT | Yes | NULL | | Full transcript text as submitted |
| `normalized_segments` | JSONB | Yes | NULL | | Structured array of NormalizedTranscript segments |
| `processed_at` | TIMESTAMPTZ | Yes | NULL | | Set when agent completes processing |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `is_imported` | BOOLEAN | No | `false` | NOT NULL | True for historically imported records |
| `imported_at` | TIMESTAMPTZ | Yes | NULL | | Timestamp of import operation |
| `import_source` | VARCHAR(255) | Yes | NULL | | e.g., Grain playlist ID used as source |

`normalized_segments` shape (array of NormalizedTranscript segment objects):
```json
[
  {
    "speaker": "Mark",
    "timestamp": "00:01:23",
    "text": "Let's review the open tasks from last week."
  }
]
```

Constraint: `call_date` must not be in the future (application-level validation; schema stores without restriction).

### 3.3 `tasks`

Generated tasks with full lifecycle tracking. Each task receives an auto-generated, globally unique, immutable short ID.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `short_id` | VARCHAR(20) | No | (trigger) | UNIQUE, NOT NULL | e.g., `TSK-0001`. Set by trigger on INSERT. Never writable by application. |
| `client_id` | UUID | No | — | FK → `clients.id` ON DELETE RESTRICT | |
| `transcript_id` | UUID | Yes | NULL | FK → `transcripts.id` ON DELETE SET NULL | Null if task created manually |
| `status` | `task_status` | No | `'draft'` | NOT NULL | |
| `title` | VARCHAR(500) | No | — | NOT NULL | |
| `description` | JSONB | Yes | NULL | | Stores TaskDescription object (taskContext, additionalContext, requirements[]) |
| `assignee` | VARCHAR(255) | Yes | NULL | | iExcel team member name |
| `estimated_time` | INTERVAL | Yes | NULL | | e.g., `01:30:00` |
| `scrum_stage` | VARCHAR(100) | No | `'Backlog'` | NOT NULL | |
| `external_ref` | JSONB | Yes | NULL | | Reference to external PM system after push |
| `priority` | VARCHAR(50) | Yes | NULL | CHECK (priority IN ('low','medium','high','critical')) | Must be one of: low, medium, high, critical |
| `tags` | JSONB | Yes | `'[]'` | | Array of string tags |
| `due_date` | DATE | Yes | NULL | | Optional task due date |
| `approved_by` | UUID | Yes | NULL | FK → `users.id` ON DELETE SET NULL | Set on approval |
| `approved_at` | TIMESTAMPTZ | Yes | NULL | | |
| `pushed_at` | TIMESTAMPTZ | Yes | NULL | | Set when external_ref is populated |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `is_imported` | BOOLEAN | No | `false` | NOT NULL | |
| `imported_at` | TIMESTAMPTZ | Yes | NULL | | |
| `import_source` | VARCHAR(255) | Yes | NULL | | e.g., Asana project ID used as source |

`external_ref` shape:
```json
{
  "system": "asana",
  "externalId": "1234567890",
  "externalUrl": "https://app.asana.com/0/project/task",
  "projectId": "9876543210",
  "workspaceId": "1122334455"
}
```

Constraint: `short_id` must never be updated after initial insertion. Enforced by trigger that raises an exception on UPDATE to `short_id`.

Constraint: `approved_by` must reference a user with `role IN ('admin', 'account_manager')`. This is an application-level constraint enforced by the API; not a check constraint in the schema.

### 3.4 `task_versions`

Immutable edit history. One row is appended for every edit to a task's mutable content fields. Rows are never updated or deleted.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `task_id` | UUID | No | — | FK → `tasks.id` ON DELETE CASCADE | |
| `version` | INTEGER | No | — | NOT NULL | Monotonically incrementing per task |
| `title` | VARCHAR(500) | No | — | NOT NULL | Snapshot of title at this version |
| `description` | JSONB | Yes | NULL | | Snapshot of TaskDescription object |
| `estimated_time` | INTERVAL | Yes | NULL | | Snapshot of estimated_time |
| `edited_by` | UUID | Yes | NULL | FK → `users.id` ON DELETE SET NULL | Null for agent edits before user records exist |
| `source` | `edit_source` | No | — | NOT NULL | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

Note: `version` is expected to increment sequentially per `task_id`. The application is responsible for reading the current MAX(version) and inserting version+1. A unique constraint on `(task_id, version)` enforces this.

Additional constraint: `UNIQUE (task_id, version)`.

### 3.5 `agendas`

Generated Running Notes documents. Each agenda receives an auto-generated, globally unique, immutable short ID.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `short_id` | VARCHAR(20) | No | (trigger) | UNIQUE, NOT NULL | e.g., `AGD-0001`. Set by trigger on INSERT. |
| `client_id` | UUID | No | — | FK → `clients.id` ON DELETE RESTRICT | |
| `status` | `agenda_status` | No | `'draft'` | NOT NULL | |
| `content` | TEXT | Yes | NULL | | Markdown content of the Running Notes |
| `cycle_start` | DATE | Yes | NULL | | Start of the task cycle covered |
| `cycle_end` | DATE | Yes | NULL | | End of the task cycle covered |
| `shared_url_token` | VARCHAR(128) | Yes | NULL | UNIQUE | Cryptographically random token for public link |
| `internal_url_token` | VARCHAR(128) | Yes | NULL | UNIQUE | Token for internal edit link |
| `google_doc_id` | VARCHAR(255) | Yes | NULL | | Populated after Google Docs export |
| `finalized_by` | UUID | Yes | NULL | FK → `users.id` ON DELETE SET NULL | |
| `finalized_at` | TIMESTAMPTZ | Yes | NULL | | |
| `shared_at` | TIMESTAMPTZ | Yes | NULL | | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `is_imported` | BOOLEAN | No | `false` | NOT NULL | |
| `imported_at` | TIMESTAMPTZ | Yes | NULL | | |
| `import_source` | VARCHAR(255) | Yes | NULL | | |

Constraint: `cycle_end` must be greater than or equal to `cycle_start` when both are set. Enforced as a CHECK constraint:
```sql
CONSTRAINT chk_cycle_dates CHECK (cycle_end IS NULL OR cycle_start IS NULL OR cycle_end >= cycle_start)
```

### 3.6 `agenda_versions`

Immutable edit history for agendas.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `agenda_id` | UUID | No | — | FK → `agendas.id` ON DELETE CASCADE | |
| `version` | INTEGER | No | — | NOT NULL | Monotonically incrementing per agenda |
| `content` | TEXT | Yes | NULL | | Snapshot of content at this version |
| `edited_by` | UUID | Yes | NULL | FK → `users.id` ON DELETE SET NULL | |
| `source` | `edit_source` | No | — | NOT NULL | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

Additional constraint: `UNIQUE (agenda_id, version)`.

### 3.7 `users`

Product-level user profile. Identity (email, authentication) is owned by the auth service. This table stores product-specific role and is the FK target for approval, editing, and audit attribution throughout the schema.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `auth_user_id` | UUID | No | — | UNIQUE, NOT NULL | The `sub` claim from the auth service OIDC token |
| `email` | VARCHAR(320) | No | — | NOT NULL | Denormalized from auth for display. Synced on login. |
| `name` | VARCHAR(255) | Yes | NULL | | Denormalized from auth. Synced on login. |
| `role` | `user_role` | No | `'team_member'` | NOT NULL | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

Note: Rows are created via just-in-time provisioning on first SSO login. The API layer, not the database, is responsible for upsert logic on login.

### 3.8 `asana_workspaces`

Registry of configured Asana workspace connections. The `access_token_ref` stores a reference key (e.g., a Vault path or AWS Secrets Manager ARN), not the token itself.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `asana_workspace_id` | VARCHAR(255) | No | — | NOT NULL | Asana's own workspace identifier |
| `name` | VARCHAR(255) | No | — | NOT NULL | Human-readable display name |
| `access_token_ref` | VARCHAR(500) | No | — | NOT NULL | Reference to credential store, not the actual token |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

### 3.9 `audit_log`

Append-only log of every significant system action. Rows are never updated or deleted.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `id` | UUID | No | `gen_random_uuid()` | PK | |
| `user_id` | UUID | Yes | NULL | FK → `users.id` ON DELETE SET NULL | Null when the actor is an agent (Mastra) |
| `action` | VARCHAR(100) | No | — | NOT NULL | e.g., `task.created`, `task.approved`, `agenda.shared` |
| `entity_type` | VARCHAR(50) | No | — | NOT NULL | `task`, `agenda`, `transcript`, `client` |
| `entity_id` | UUID | No | — | NOT NULL | ID of the affected entity |
| `metadata` | JSONB | Yes | NULL | | Additional context |
| `source` | `edit_source` | No | — | NOT NULL | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

`metadata` examples:
```json
// task.approved
{ "previous_status": "draft", "approved_by_role": "account_manager" }

// agenda.emailed
{ "recipients": ["jane@totallife.com"], "subject": "Running Notes — March 2026" }

// task.edited
{ "field": "description", "previous_length": 240, "new_length": 310 }
```

### 3.10 `client_users`

Many-to-many join table for user-client access control. Determines which clients a non-admin user can access.

| Column | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `user_id` | UUID | No | — | FK → `users.id` ON DELETE CASCADE | |
| `client_id` | UUID | No | — | FK → `clients.id` ON DELETE CASCADE | |
| `role` | VARCHAR(50) | No | `'member'` | NOT NULL | Role within the client context, e.g., `'member'`, `'lead'` |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | NOT NULL | |

Primary key: `(user_id, client_id)`.

### 3.11 Externally Owned Tables

The following tables are referenced in the schema but are owned by their respective features:

- `workflow_runs` — owned by Feature 17 (Workflow Orchestration)
- `import_jobs` — owned by Feature 38 (Historical Import)

These tables are not defined in this feature's migrations. They are documented here for reference only.

---

## 4. Short ID Generation

### 4.1 Mechanism

Two Postgres sequences must be created:
- `tsk_short_id_seq` — starts at 1, increments by 1, no maximum (or very high maximum)
- `agd_short_id_seq` — starts at 1, increments by 1

Two `BEFORE INSERT` triggers must be created:

**`set_task_short_id`** — fires on `tasks`:
```sql
NEW.short_id := 'TSK-' || LPAD(nextval('tsk_short_id_seq')::text, 4, '0');
```

**`set_agenda_short_id`** — fires on `agendas`:
```sql
NEW.short_id := 'AGD-' || LPAD(nextval('agd_short_id_seq')::text, 4, '0');
```

### 4.2 Immutability

A second `BEFORE UPDATE` trigger on both `tasks` and `agendas` must raise an exception if `short_id` is modified:
```sql
IF NEW.short_id <> OLD.short_id THEN
  RAISE EXCEPTION 'short_id is immutable and cannot be changed';
END IF;
```

### 4.3 Format

- Tasks: `TSK-` followed by a zero-padded 4-digit number. Expands automatically beyond 4 digits as the sequence grows (e.g., `TSK-10000`).
- Agendas: `AGD-` followed by a zero-padded 4-digit number.

---

## 5. Index Specifications

| Index Name | Table | Columns | Type | Notes |
|---|---|---|---|---|
| `idx_tasks_short_id` | `tasks` | `(short_id)` | UNIQUE B-Tree | Already implied by UNIQUE constraint; explicit for clarity |
| `idx_tasks_client_status` | `tasks` | `(client_id, status)` | B-Tree | Composite for "show all draft tasks for client X" |
| `idx_tasks_transcript` | `tasks` | `(transcript_id)` | B-Tree | "Show all tasks from this intake call" |
| `idx_agendas_short_id` | `agendas` | `(short_id)` | UNIQUE B-Tree | |
| `idx_agendas_client_status` | `agendas` | `(client_id, status)` | B-Tree | "Get the current draft agenda for client X" |
| `idx_agendas_shared_token` | `agendas` | `(shared_url_token)` | UNIQUE B-Tree | Public link lookups (no auth) |
| `idx_audit_entity` | `audit_log` | `(entity_type, entity_id)` | B-Tree | "Show history of task TSK-0042" |
| `idx_audit_user_date` | `audit_log` | `(user_id, created_at)` | B-Tree | "Show everything Mark did today" |
| `idx_transcripts_client_date` | `transcripts` | `(client_id, call_date)` | B-Tree | "Get latest transcript for client X" |
| `idx_users_auth_user_id` | `users` | `(auth_user_id)` | UNIQUE B-Tree | JIT provisioning lookup on login |
| `idx_users_email` | `users` | `(email)` | B-Tree | Display/search queries |

---

## 6. Migration Order and Down Migration Requirements

### 6.1 Up Migration Order

Migrations must be applied in this order to satisfy foreign key dependencies:

1. Create all enums
2. Create `users` table (no FKs to business tables)
3. Create `asana_workspaces` table (no FKs to business tables)
4. Create `clients` table
5. Create `client_users` join table (FK → `users`, `clients`)
6. Create `transcripts` table (FK → `clients`)
7. Create sequences (`tsk_short_id_seq`, `agd_short_id_seq`)
8. Create `tasks` table (FK → `clients`, `transcripts`, `users`)
9. Create `task_versions` table (FK → `tasks`, `users`)
10. Create `agendas` table (FK → `clients`, `users`)
11. Create `agenda_versions` table (FK → `agendas`, `users`)
12. Create `audit_log` table (FK → `users`)
13. Create all indexes
14. Create short ID trigger functions and attach triggers

### 6.2 Down Migration Order (reverse of up)

1. Drop triggers
2. Drop trigger functions
3. Drop indexes
4. Drop `audit_log`
5. Drop `agenda_versions`
6. Drop `agendas`
7. Drop `task_versions`
8. Drop `tasks`
9. Drop sequences
10. Drop `transcripts`
11. Drop `client_users`
12. Drop `clients`
13. Drop `asana_workspaces`
14. Drop `users`
15. Drop all enums

---

## 7. Seed Data Requirements

Seed data is for local development and CI test environments only. It must not run automatically in production.

### 7.1 Required Seeds

- **One client record**: e.g., `{ name: "Total Life", ... }` with nulls for external IDs
- **One admin user**: A placeholder user record with a known `auth_user_id` matching a dev SSO account. `role: 'admin'`.
- **One account manager user**: For testing approval workflows.

### 7.2 Idempotency

Seed scripts must be idempotent — running them twice must not insert duplicate records. Use `INSERT ... ON CONFLICT DO NOTHING` or equivalent.

---

## 8. Error and Edge Case Handling

| Scenario | Expected Behavior |
|---|---|
| INSERT to `tasks` with `short_id` supplied by application | Trigger overwrites with sequence-generated value |
| UPDATE to `tasks.short_id` | Trigger raises exception: `short_id is immutable` |
| INSERT to `task_versions` with duplicate `(task_id, version)` | UNIQUE constraint violation — application must read MAX(version) before inserting |
| DELETE a client that has tasks or transcripts | RESTRICT — must delete or reassign children first |
| DELETE a task that has versions | CASCADE — task_versions are deleted |
| DELETE a user who approved tasks | `approved_by` SET NULL — task retains its approved status |
| INSERT to `agendas` with `cycle_end < cycle_start` | CHECK constraint violation |
| INSERT to `agendas` with a duplicate `shared_url_token` | UNIQUE constraint violation — application must generate a unique token |
