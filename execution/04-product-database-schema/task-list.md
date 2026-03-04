# Task List — Feature 04: Product Database Schema

**Package**: `packages/database/`
**Phase**: 1 — Foundation
**Blocked by**: Feature 00 (Nx Monorepo Scaffolding), Feature 01 (Shared Types)
**Blocks**: Feature 07 (API Scaffolding)

---

## Prerequisites (Verify Before Starting)

- [ ] Feature 00 is complete: `packages/database/` directory exists in the Nx monorepo
- [ ] Feature 01 is complete or in progress: confirm the `NormalizedTranscript` segment shape (`speaker`, `timestamp`, `text`) is finalized in shared types — this determines the `transcripts.segments` JSONB contract
- [ ] A local PostgreSQL 15+ instance is available for migration testing
- [ ] Migration tooling decision has been made (Drizzle, Prisma, or raw SQL) — coordinate with Feature 07 team if needed

---

## Phase 1: Package Setup

- [ ] **1.1** Initialize `packages/database/` as an Nx library with `package.json`, `tsconfig.json`, and a `README.md` describing the package's role
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.2** Install and configure the chosen migration tool (e.g., `drizzle-kit`, `prisma`, or `db-migrate`) as a dev dependency in `packages/database/`
  - Complexity: Small
  - Reference: TR.md Section 1.2

- [ ] **1.3** Create the `migrations/` directory with a numbering convention (`001_`, `002_`, etc.)
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.4** Create the `seeds/` directory for development seed scripts
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.5** Add migration runner scripts to `package.json`:
  - `migrate:up` — apply all pending migrations
  - `migrate:down` — roll back the last migration
  - `migrate:status` — list applied migrations
  - `seed` — apply seed data (must not run in production)
  - Complexity: Small
  - Reference: TR.md Section 6.1

- [ ] **1.6** Configure database connection via environment variable (`DATABASE_URL`). Add `.env.example` with the variable name and a local development placeholder value. Ensure `.env` is in `.gitignore`.
  - Complexity: Small
  - Reference: TR.md Section 5.2

---

## Phase 2: Enum Migrations

- [ ] **2.1** Write migration `001_create_enums` (up):
  - Create `task_status` enum: `draft`, `approved`, `rejected`, `pushed` (no `completed`)
  - Create `agenda_status` enum: `draft`, `in_review`, `finalized`, `shared`
  - Create `call_type` enum: `client_call`, `intake`, `follow_up`
  - Create `user_role` enum: `admin`, `account_manager`, `team_member`
  - Create `edit_source` enum: `agent`, `ui`, `terminal`
  - Complexity: Small
  - Reference: FRS.md Section 2, TR.md Section 2.1

- [ ] **2.2** Write down migration for `001_create_enums`:
  - Drop all five enums in reverse dependency order
  - Verify: Re-apply up migration after down with no errors
  - Complexity: Small
  - Reference: FRS.md Section 6.2

---

## Phase 3: Core Table Migrations (No Business FKs)

- [ ] **3.1** Write migration `002_create_users` (up):
  - All columns per FRS.md Section 3.7
  - `auth_user_id` UNIQUE constraint
  - `role` defaults to `team_member`
  - Complexity: Small
  - Reference: FRS.md Section 3.7, TR.md Section 2.2

- [ ] **3.2** Write down migration for `002_create_users`
  - Complexity: Small

- [ ] **3.3** Write migration `003_create_asana_workspaces` (up):
  - All columns per FRS.md Section 3.8
  - `access_token_ref` stores a reference key, not a token value (document this in a comment in the migration file)
  - Complexity: Small
  - Reference: FRS.md Section 3.8, TR.md Section 2.3

- [ ] **3.4** Write down migration for `003_create_asana_workspaces`
  - Complexity: Small

- [ ] **3.5** Write migration `004_create_clients` (up):
  - All columns per FRS.md Section 3.1
  - `email_recipients` as JSONB
  - Complexity: Small
  - Reference: FRS.md Section 3.1, TR.md Section 2.4

- [ ] **3.6** Write down migration for `004_create_clients`
  - Complexity: Small

---

## Phase 4: Business Table Migrations (With FKs)

- [ ] **4.1** Write migration `005_create_transcripts` (up):
  - All columns per FRS.md Section 3.2
  - `client_id` FK → `clients(id)` ON DELETE RESTRICT
  - `segments` JSONB column for NormalizedTranscript segments
  - All three import fields (`is_imported`, `imported_at`, `import_source`)
  - Complexity: Small
  - Reference: FRS.md Section 3.2, TR.md Section 2.5

- [ ] **4.2** Write down migration for `005_create_transcripts`
  - Complexity: Small

- [ ] **4.3** Write migration `006_create_sequences` (up):
  - `tsk_short_id_seq` starting at 1
  - `agd_short_id_seq` starting at 1
  - Complexity: Small
  - Reference: FRS.md Section 4, TR.md Section 2.6

- [ ] **4.4** Write down migration for `006_create_sequences`:
  - Drop both sequences
  - Complexity: Small

- [ ] **4.5** Write migration `007_create_tasks` (up):
  - All columns per FRS.md Section 3.3
  - `short_id` VARCHAR(20) NOT NULL UNIQUE (value populated by trigger, not application)
  - `external_ref` JSONB (not `asana_workspace_id` / `asana_project_id` / `asana_task_id`)
  - `priority` VARCHAR(50), `tags` JSONB DEFAULT `'[]'`, `due_date` DATE
  - All three import fields
  - FK references: `client_id` RESTRICT, `transcript_id` SET NULL, `approved_by` SET NULL
  - Complexity: Medium
  - Reference: FRS.md Section 3.3, TR.md Section 2.7

- [ ] **4.6** Write down migration for `007_create_tasks`
  - Complexity: Small

- [ ] **4.7** Write migration `008_create_task_versions` (up):
  - All columns per FRS.md Section 3.4
  - `UNIQUE (task_id, version)` constraint
  - FK: `task_id` CASCADE, `edited_by` SET NULL
  - Complexity: Small
  - Reference: FRS.md Section 3.4, TR.md Section 2.8

- [ ] **4.8** Write down migration for `008_create_task_versions`
  - Complexity: Small

- [ ] **4.9** Write migration `009_create_agendas` (up):
  - All columns per FRS.md Section 3.5
  - `short_id` VARCHAR(20) NOT NULL UNIQUE
  - `shared_url_token` UNIQUE, `internal_url_token` UNIQUE
  - CHECK constraint: `cycle_end >= cycle_start` when both non-null
  - All three import fields
  - FK references: `client_id` RESTRICT, `finalized_by` SET NULL
  - Complexity: Medium
  - Reference: FRS.md Section 3.5, TR.md Section 2.9

- [ ] **4.10** Write down migration for `009_create_agendas`
  - Complexity: Small

- [ ] **4.11** Write migration `010_create_agenda_versions` (up):
  - All columns per FRS.md Section 3.6
  - `UNIQUE (agenda_id, version)` constraint
  - FK: `agenda_id` CASCADE, `edited_by` SET NULL
  - Complexity: Small
  - Reference: FRS.md Section 3.6, TR.md Section 2.10

- [ ] **4.12** Write down migration for `010_create_agenda_versions`
  - Complexity: Small

- [ ] **4.13** Write migration `011_create_audit_log` (up):
  - All columns per FRS.md Section 3.9
  - `user_id` nullable FK → `users(id)` ON DELETE SET NULL
  - Complexity: Small
  - Reference: FRS.md Section 3.9, TR.md Section 2.11

- [ ] **4.14** Write down migration for `011_create_audit_log`
  - Complexity: Small

---

## Phase 5: Indexes

- [ ] **5.1** Write migration `012_create_indexes` (up):
  - All eleven indexes per FRS.md Section 5
  - Use partial index for `idx_agendas_shared_token` (`WHERE shared_url_token IS NOT NULL`)
  - Complexity: Small
  - Reference: FRS.md Section 5, TR.md Section 2.12

- [ ] **5.2** Write down migration for `012_create_indexes`:
  - Drop all eleven indexes by name
  - Complexity: Small

---

## Phase 6: Short ID Triggers

- [ ] **6.1** Write migration `013_create_triggers` (up):
  - `generate_task_short_id()` function using `tsk_short_id_seq`
  - `trg_tasks_short_id_insert` BEFORE INSERT trigger on `tasks`
  - `guard_task_short_id()` function that raises exception on `short_id` change
  - `trg_tasks_short_id_update` BEFORE UPDATE trigger with `WHEN` clause
  - `generate_agenda_short_id()` function using `agd_short_id_seq`
  - `trg_agendas_short_id_insert` BEFORE INSERT trigger on `agendas`
  - `guard_agenda_short_id()` function
  - `trg_agendas_short_id_update` BEFORE UPDATE trigger with `WHEN` clause
  - Complexity: Medium
  - Reference: FRS.md Section 4, TR.md Section 2.13

- [ ] **6.2** Write down migration for `013_create_triggers`:
  - Drop all four triggers
  - Drop all four trigger functions
  - Complexity: Small

---

## Phase 7: ORM Schema File (If Using Drizzle or Prisma)

- [ ] **7.1** If using Drizzle: create `packages/database/src/schema.ts` with table and enum definitions matching the SQL schema exactly
  - Include all column types, defaults, and FK references
  - Export all table definitions for use by the API layer
  - Note: Triggers cannot be defined in Drizzle schema; they are handled by migration 013
  - Complexity: Large
  - Reference: TR.md Section 7

- [ ] **7.2** If using Drizzle: run `drizzle-kit generate` and verify the generated SQL matches the hand-written migration SQL
  - If discrepancies exist, resolve in favor of the hand-written SQL (the hand-written SQL is the authoritative spec)
  - Complexity: Medium

- [ ] **7.3** If using Drizzle: export database client instance from `packages/database/src/client.ts` with connection pool configuration
  - Complexity: Small

- [ ] **7.4** If using Prisma: create `packages/database/prisma/schema.prisma` with equivalent model definitions
  - Run `prisma generate` to produce the client
  - Complexity: Large

---

## Phase 8: Seed Data

- [ ] **8.1** Write `seeds/001_seed_dev_data.sql`:
  - One client record: `name = 'Total Life'`, nulls for external IDs
  - One admin user: known `auth_user_id` matching dev SSO account, `role = 'admin'`
  - One account_manager user: for testing approval workflows
  - Use `INSERT ... ON CONFLICT DO NOTHING` for idempotency
  - Complexity: Small
  - Reference: FRS.md Section 7

- [ ] **8.2** Add a Nx target or npm script to run seeds. Ensure it is clearly labeled for development use only and cannot be run against a production `DATABASE_URL`.
  - Complexity: Small

---

## Phase 9: Verification and Testing

- [ ] **9.1** Apply all up migrations against a blank local Postgres 15 database. Verify:
  - All nine tables exist with correct columns
  - All five enums exist with correct values
  - All two sequences exist
  - All eleven indexes exist (run `\d tablename` or equivalent)
  - All eight trigger functions exist
  - Complexity: Small

- [ ] **9.2** Insert a task record and verify:
  - `short_id` is auto-populated as `TSK-0001`
  - A second task insert produces `TSK-0002`
  - Supplying a `short_id` value on insert does not persist (trigger overwrites)
  - Complexity: Small
  - Reference: GS.md — Task Table and Short ID Generation

- [ ] **9.3** Attempt to UPDATE `tasks.short_id` on an existing row. Verify:
  - An exception is raised with message `short_id is immutable and cannot be changed`
  - Complexity: Small
  - Reference: GS.md — Attempting to update short_id

- [ ] **9.4** Insert an agenda record and verify:
  - `short_id` is auto-populated as `AGD-0001`
  - The task sequence is not affected (tasks continue from `TSK-0002`)
  - Complexity: Small
  - Reference: GS.md — Agenda short ID sequence is independent of task sequence

- [ ] **9.5** Verify the `cycle_end >= cycle_start` CHECK constraint:
  - Insert an agenda with `cycle_end < cycle_start` — expect a constraint violation
  - Insert an agenda with both as NULL — expect success
  - Complexity: Small
  - Reference: GS.md — Cycle date constraint enforced

- [ ] **9.6** Verify FK cascade/restrict behavior:
  - Delete a client with associated transcripts — expect RESTRICT
  - Delete a task — expect its task_versions to cascade delete
  - Delete a user who approved a task — expect `approved_by` to SET NULL
  - Complexity: Small
  - Reference: GS.md — various FK scenarios

- [ ] **9.7** Verify UNIQUE constraints:
  - Insert two users with the same `auth_user_id` — expect UNIQUE violation
  - Insert two agendas with the same `shared_url_token` — expect UNIQUE violation
  - Insert two task_versions with the same `(task_id, version)` — expect UNIQUE violation
  - Complexity: Small
  - Reference: GS.md — various UNIQUE scenarios

- [ ] **9.8** Apply all down migrations in reverse order against the migrated database. Verify:
  - All nine tables are dropped
  - All five enums are dropped
  - All two sequences are dropped
  - All trigger functions are dropped
  - No errors occur during rollback
  - Complexity: Small
  - Reference: GS.md — Migration Rollback

- [ ] **9.9** Re-apply all up migrations after a successful rollback. Verify:
  - Schema is identical to the first application
  - Short ID sequences restart at 1
  - No errors occur
  - Complexity: Small
  - Reference: GS.md — Up migration is idempotent when re-applied after down

- [ ] **9.10** Run seed data and verify:
  - Three user rows exist (one admin, one account_manager, one placeholder)
  - One client row exists
  - Running seed again produces no duplicates (idempotency)
  - Complexity: Small
  - Reference: FRS.md Section 7.2

- [ ] **9.11** Run `EXPLAIN` queries to verify index usage for:
  - `SELECT * FROM tasks WHERE client_id = $1 AND status = 'draft'` → `idx_tasks_client_status`
  - `SELECT * FROM agendas WHERE shared_url_token = $1` → `idx_agendas_shared_token`
  - `SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = $2` → `idx_audit_entity`
  - `SELECT * FROM users WHERE auth_user_id = $1` → `idx_users_auth_user_id`
  - Complexity: Small
  - Reference: GS.md — Index Coverage

---

## Phase 10: Documentation and Handoff

- [ ] **10.1** Write `packages/database/README.md` documenting:
  - How to run migrations locally
  - How to run seeds
  - Environment variable requirements
  - Migration numbering convention for adding new migrations
  - How to add a new table (step-by-step)
  - Complexity: Small

- [ ] **10.2** Document the `external_ref` JSONB contract in a comment in the `tasks` migration file. Include an example value for Asana and a note that the field is system-agnostic.
  - Complexity: Small
  - Reference: FRS.md Section 3.3, TR.md Section 3.2

- [ ] **10.3** Document the `segments` JSONB contract in a comment in the `transcripts` migration file. Reference the shared types package for the canonical type definition.
  - Complexity: Small
  - Reference: TR.md Section 3.2

- [ ] **10.4** Confirm with Feature 07 team that the exported schema types (from `schema.ts` or equivalent) satisfy their import requirements before marking this feature complete.
  - Complexity: Small

---

## Completion Checklist

- [ ] All nine tables exist with correct schema
- [ ] All five enums exist with correct values (`completed` is NOT in `task_status`)
- [ ] All two sequences exist and generate correct short IDs
- [ ] All eleven indexes exist
- [ ] All eight trigger functions exist and behave correctly
- [ ] `short_id` is immutable on both `tasks` and `agendas`
- [ ] All down migrations succeed with no errors
- [ ] Up-down-up cycle produces identical schema
- [ ] Seed data is idempotent
- [ ] ORM schema file (if applicable) matches the SQL schema
- [ ] `packages/database/README.md` is written
- [ ] Feature 07 team has confirmed the schema exports meet their requirements
