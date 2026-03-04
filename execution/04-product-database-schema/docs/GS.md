# GS — Gherkin Specification
# Feature 04: Product Database Schema

---

## Feature: Product Database Schema Migrations

As a development team applying the product database schema,
I want all migrations to apply cleanly and correctly
So that the API layer and downstream features have a reliable, fully-indexed data store.

---

## Feature: Enum Integrity

### Scenario: task_status enum has correct values including completed
  Given the product database migration has been applied
  When I query the `task_status` enum values from `pg_enum`
  Then I see exactly: `draft`, `approved`, `rejected`, `pushed`, `completed`

### Scenario: agenda_status enum has correct values
  Given the product database migration has been applied
  When I query the `agenda_status` enum values
  Then I see exactly: `draft`, `in_review`, `finalized`, `shared`

### Scenario: call_type enum has correct values
  Given the product database migration has been applied
  When I query the `call_type` enum values
  Then I see exactly: `client_call`, `intake`, `follow_up`

### Scenario: user_role enum has correct values
  Given the product database migration has been applied
  When I query the `user_role` enum values
  Then I see exactly: `admin`, `account_manager`, `team_member`

### Scenario: edit_source enum has correct values
  Given the product database migration has been applied
  When I query the `edit_source` enum values
  Then I see exactly: `agent`, `ui`, `terminal`

---

## Feature: Client Table

### Scenario: Creating a client record
  Given the product database migration has been applied
  When I insert a row into `clients` with `name = 'Total Life'`
  Then the row is created with a UUID `id`
  And `created_at` and `updated_at` are set to the current timestamp
  And all nullable fields (`grain_playlist_id`, `default_asana_workspace_id`, `default_asana_project_id`, `email_recipients`) are NULL

### Scenario: Client name is required
  Given the product database migration has been applied
  When I attempt to insert a row into `clients` without providing `name`
  Then a NOT NULL constraint violation is raised

### Scenario: email_recipients defaults to empty JSONB array
  Given the product database migration has been applied
  When I insert a client with only `name` specified
  Then `email_recipients` defaults to `'[]'::jsonb`
  And the value is NOT NULL

### Scenario: email_recipients stored as JSONB array
  Given the product database migration has been applied
  When I insert a client with `email_recipients = '[{"name":"Jane","email":"jane@example.com","role":"primary"}]'`
  Then the value is stored and retrievable as a JSONB array
  And I can query individual elements using JSONB operators

### Scenario: client_users join table supports many-to-many
  Given a client and a user exist
  When I insert a row into `client_users` with `user_id` and `client_id`
  Then the row is created with `role` defaulting to `'member'`
  And `created_at` is set to the current timestamp

### Scenario: client_users prevents duplicate assignments
  Given a `client_users` row exists for a user-client pair
  When I attempt to insert another row with the same `user_id` and `client_id`
  Then a PRIMARY KEY constraint violation is raised

### Scenario: Deleting a client cascades to client_users
  Given a `client_users` row exists for a client
  When the client is deleted (if no RESTRICT FKs prevent it)
  Then the `client_users` row is also deleted

---

## Feature: Transcript Table

### Scenario: Creating a transcript linked to a client
  Given a client record exists with id `client-uuid`
  When I insert a row into `transcripts` with `client_id = 'client-uuid'`, `call_type = 'intake'`, and `call_date = '2026-01-15'`
  Then the transcript row is created
  And `is_imported` defaults to `false`
  And `imported_at` and `import_source` are NULL

### Scenario: Transcript normalized_segments stored as JSONB
  Given a transcript record exists
  When I update `normalized_segments` with a JSON array of speaker/timestamp/text objects
  Then the value is stored as JSONB
  And I can query segment speakers using JSONB path expressions

### Scenario: Transcript references non-existent client
  Given no client exists with id `nonexistent-uuid`
  When I attempt to insert a transcript with `client_id = 'nonexistent-uuid'`
  Then a foreign key constraint violation is raised

### Scenario: Deleting a client with transcripts is restricted
  Given a client has one or more associated transcripts
  When I attempt to DELETE the client record
  Then a foreign key RESTRICT violation is raised
  And the client record is not deleted

### Scenario: Marking a transcript as imported
  Given the product database migration has been applied
  When I insert a transcript with `is_imported = true`, `imported_at = NOW()`, and `import_source = 'grain-playlist-abc123'`
  Then all three import fields are stored correctly

---

## Feature: Task Table and Short ID Generation

### Scenario: Short ID is auto-generated on task insert
  Given the product database migration and triggers have been applied
  And no tasks exist yet
  When I insert a task with `client_id`, `title`, and `status = 'draft'`
  Then `short_id` is set to `TSK-0001`
  And the `short_id` value I supplied (if any) is ignored

### Scenario: Short IDs increment sequentially
  Given two tasks have been inserted
  When I select `short_id` from both tasks in insert order
  Then the first task has `short_id = 'TSK-0001'`
  And the second task has `short_id = 'TSK-0002'`

### Scenario: Short ID is globally unique
  Given one hundred tasks exist in the database
  When I select all `short_id` values
  Then all values are distinct

### Scenario: Attempting to update short_id raises an exception
  Given a task exists with `short_id = 'TSK-0001'`
  When I attempt to UPDATE the task setting `short_id = 'TSK-9999'`
  Then an exception is raised with message `short_id is immutable and cannot be changed`
  And the task's `short_id` remains `TSK-0001`

### Scenario: Task created with default status
  Given the product database migration has been applied
  When I insert a task without specifying `status`
  Then `status` defaults to `draft`

### Scenario: Task created with default scrum_stage
  Given the product database migration has been applied
  When I insert a task without specifying `scrum_stage`
  Then `scrum_stage` defaults to `Backlog`

### Scenario: Task description stored as JSONB TaskDescription object
  Given the product database migration has been applied
  When I insert a task with `description = '{"taskContext":"ctx","additionalContext":"add","requirements":["req1","req2"]}'`
  Then the value is stored and queryable as JSONB
  And individual fields are queryable via JSONB operators

### Scenario: Task priority constrained to valid values
  Given the product database migration has been applied
  When I attempt to insert a task with `priority = 'invalid'`
  Then a CHECK constraint violation is raised

### Scenario: Task priority accepts valid values
  Given the product database migration has been applied
  When I insert a task with `priority = 'critical'`
  Then the task is created successfully

### Scenario: external_ref stores multi-system reference as JSONB
  Given a task exists
  When I update `external_ref` with `{"system":"asana","externalId":"123","externalUrl":"https://...","projectId":"456","workspaceId":"789"}`
  Then the value is stored as JSONB
  And individual fields are queryable via JSONB operators

### Scenario: Task linked to transcript
  Given a client and a transcript exist
  When I insert a task with both `client_id` and `transcript_id`
  Then the task is created with both foreign keys set

### Scenario: Transcript deleted sets task transcript_id to null
  Given a task exists linked to a transcript
  When the transcript is deleted
  Then `transcript_id` on the task is set to NULL
  And the task record is not deleted

### Scenario: Task with import fields set
  Given the product database migration has been applied
  When I insert a task with `is_imported = true`, `imported_at = NOW()`, `import_source = 'asana-project-xyz'`
  Then all three import fields are stored correctly

### Scenario: tags stored as JSONB array
  Given the product database migration has been applied
  When I insert a task with `tags = '["billing","follow-up","urgent"]'`
  Then the value is stored and queryable as a JSONB array

---

## Feature: Task Versions

### Scenario: Task version created on edit
  Given a task exists with `id = 'task-uuid'`
  When I insert a row into `task_versions` with `task_id = 'task-uuid'`, `version = 1`, `title = 'Original Title'`, `source = 'agent'`
  Then the version row is created

### Scenario: Duplicate task version number is rejected
  Given a task has a version 1 already in `task_versions`
  When I attempt to insert another version 1 for the same task
  Then a UNIQUE constraint violation is raised on `(task_id, version)`

### Scenario: Task deletion cascades to versions
  Given a task exists with three version records
  When I DELETE the task
  Then all three version records are also deleted

### Scenario: User deletion sets edited_by to null on task versions
  Given a task version has `edited_by` pointing to user `user-uuid`
  When user `user-uuid` is deleted
  Then `edited_by` on the task version is set to NULL
  And the version record is not deleted

---

## Feature: Agenda Table and Short ID Generation

### Scenario: Agenda short ID is auto-generated on insert
  Given the product database migration and triggers have been applied
  And no agendas exist yet
  When I insert an agenda with `client_id` and `status = 'draft'`
  Then `short_id` is set to `AGD-0001`

### Scenario: Agenda short ID sequence is independent of task sequence
  Given ten tasks have been inserted (last short_id `TSK-0010`)
  When I insert the first agenda
  Then the agenda's `short_id` is `AGD-0001`
  And the task sequence is unaffected

### Scenario: Attempting to update agenda short_id raises an exception
  Given an agenda exists with `short_id = 'AGD-0001'`
  When I attempt to UPDATE `short_id = 'AGD-9999'`
  Then an exception is raised
  And the agenda's `short_id` remains `AGD-0001`

### Scenario: Cycle date constraint enforced
  Given the product database migration has been applied
  When I attempt to insert an agenda with `cycle_start = '2026-03-10'` and `cycle_end = '2026-03-01'`
  Then a CHECK constraint violation is raised

### Scenario: Agenda with null cycle dates is accepted
  Given the product database migration has been applied
  When I insert an agenda with both `cycle_start` and `cycle_end` as NULL
  Then the row is created successfully

### Scenario: shared_url_token is unique across agendas
  Given an agenda exists with `shared_url_token = 'abc123token'`
  When I attempt to insert another agenda with the same `shared_url_token`
  Then a UNIQUE constraint violation is raised

### Scenario: Agenda with import fields
  Given the product database migration has been applied
  When I insert an agenda with `is_imported = true`
  Then `is_imported` is stored as true

---

## Feature: Agenda Versions

### Scenario: Agenda version created on content edit
  Given an agenda exists with `id = 'agenda-uuid'`
  When I insert a row into `agenda_versions` with `agenda_id = 'agenda-uuid'`, `version = 1`, `content = 'Draft content'`, `source = 'ui'`
  Then the version row is created

### Scenario: Duplicate agenda version number is rejected
  Given an agenda has version 1 in `agenda_versions`
  When I insert another version 1 for the same agenda
  Then a UNIQUE constraint violation is raised on `(agenda_id, version)`

### Scenario: Agenda deletion cascades to versions
  Given an agenda has two version records
  When I DELETE the agenda
  Then both version records are deleted

---

## Feature: Users Table

### Scenario: User created with default role
  Given the product database migration has been applied
  When I insert a user with `auth_user_id = 'auth-sub-uuid'` and `email = 'mark@iexcel.com'`
  Then `role` defaults to `team_member`

### Scenario: auth_user_id is unique
  Given a user exists with `auth_user_id = 'auth-sub-uuid'`
  When I attempt to insert another user with the same `auth_user_id`
  Then a UNIQUE constraint violation is raised

### Scenario: email is indexed for search
  Given the product database migration has been applied
  When I query `EXPLAIN SELECT * FROM users WHERE email = 'mark@iexcel.com'`
  Then the query plan uses the `idx_users_email` index

---

## Feature: Asana Workspaces Table

### Scenario: Workspace registered with credential reference
  Given the product database migration has been applied
  When I insert a workspace with `asana_workspace_id = 'ws-123'`, `name = 'iExcel Workspace'`, `access_token_ref = 'vault/secret/asana/ws-123'`
  Then the workspace row is created
  And `access_token_ref` stores the reference string, not a token value

---

## Feature: Audit Log

### Scenario: Audit log entry created for agent action
  Given a task exists with `id = 'task-uuid'`
  When I insert an audit log row with `user_id = NULL`, `action = 'task.created'`, `entity_type = 'task'`, `entity_id = 'task-uuid'`, `source = 'agent'`
  Then the row is created with `user_id = NULL`

### Scenario: Audit log entry created for user action
  Given a user exists with `id = 'user-uuid'`
  And a task exists with `id = 'task-uuid'`
  When I insert an audit log row with `user_id = 'user-uuid'`, `action = 'task.approved'`, `entity_type = 'task'`, `entity_id = 'task-uuid'`, `source = 'ui'`
  Then the row is created with user attribution

### Scenario: Audit log metadata stored as JSONB
  Given an audit log entry is created for agenda sharing
  When `metadata = '{"recipients":["jane@totallife.com"]}'` is stored
  Then the metadata is retrievable as JSONB

### Scenario: Audit log user_id set to null when user is deleted
  Given an audit log entry has `user_id = 'user-uuid'`
  When the user is deleted
  Then `user_id` on the audit log entry is set to NULL
  And the audit log entry is not deleted

---

## Feature: Index Coverage

### Scenario: tasks composite index supports client-scoped status queries
  Given tasks exist for multiple clients with various statuses
  When I run `EXPLAIN SELECT * FROM tasks WHERE client_id = $1 AND status = 'draft'`
  Then the query plan uses `idx_tasks_client_status`

### Scenario: agendas shared_url_token index supports public link lookup
  Given an agenda exists with `shared_url_token = 'abc123'`
  When I run `EXPLAIN SELECT * FROM agendas WHERE shared_url_token = 'abc123'`
  Then the query plan uses `idx_agendas_shared_token`

### Scenario: audit_log entity index supports entity history queries
  Given audit log entries exist for multiple entity types
  When I run `EXPLAIN SELECT * FROM audit_log WHERE entity_type = 'task' AND entity_id = $1`
  Then the query plan uses `idx_audit_entity`

---

## Feature: Migration Rollback

### Scenario: Down migration fully reverses the schema
  Given all up migrations have been applied
  When all down migrations are applied in reverse order
  Then no tables from this feature remain in the database
  And no enums from this feature remain in the database
  And no sequences from this feature remain in the database
  And no triggers from this feature remain in the database

### Scenario: Up migration is idempotent when re-applied after down
  Given all migrations have been applied and then rolled back
  When all up migrations are applied again
  Then the schema is identical to the first application
  And no errors occur
