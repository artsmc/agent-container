# Refined Execution Plan
# Feature 04: Product Database Schema

**Package**: `packages/database/`
**Phase**: 1 — Foundation
**Agent**: Single `nextjs-backend-developer`
**Status**: Approved

---

## Planning Notes

### Changes from Original Task List
1. **Merged up/down migration pairs** into single tasks (28 tasks → 14)
2. **Removed Prisma task** (7.4) — Drizzle ORM confirmed in TR.md
3. **Added missing `client_users` join table** — FRS.md Section 3.10 and TR.md Section 2.4a define it, but original task list omitted it
4. **Fixed `task_status` enum** — Original task list says no `completed`, but FRS.md Section 2.1, TR.md Section 2.1, and GS.md all include `completed`. The specs are authoritative.
5. **Total tasks reduced** from 46 to 35

### Resolved Questions
- Migration tooling: **Drizzle ORM + drizzle-kit** (confirmed in TR.md Section 1.2)
- `task_status` includes `completed` (for historical import and status reconciliation)
- `client_users` join table is in scope (resolved in FRS.md Section 3.10)

---

## Wave 1 — Package Setup (parallel)

All tasks can run simultaneously.

- [ ] **1.1** Initialize `packages/database/` as Nx library with `package.json`, `tsconfig.json`, `README.md`
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.2** Install and configure Drizzle ORM + `drizzle-kit` as dev dependency
  - Complexity: Small
  - Reference: TR.md Section 1.2

- [ ] **1.3** Create `migrations/` directory with numbering convention (`001_`, `002_`, etc.)
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.4** Create `seeds/` directory for development seed scripts
  - Complexity: Small
  - Reference: TR.md Section 1.3

- [ ] **1.5** Add migration runner scripts to `package.json`: `migrate:up`, `migrate:down`, `migrate:status`, `seed`
  - Complexity: Small
  - Reference: TR.md Section 6.1

- [ ] **1.6** Configure `DATABASE_URL` env var, create `.env.example`, ensure `.env` in `.gitignore`
  - Complexity: Small
  - Reference: TR.md Section 5.2

---

## Wave 2 — Schema Migrations (sequential)

Each migration includes both up and down. Must be applied in FK dependency order.

- [ ] **2.1** Migration 001: Create all five enums (up + down)
  - `task_status`: `draft`, `approved`, `rejected`, `pushed`, `completed`
  - `agenda_status`: `draft`, `in_review`, `finalized`, `shared`
  - `call_type`: `client_call`, `intake`, `follow_up`
  - `user_role`: `admin`, `account_manager`, `team_member`
  - `edit_source`: `agent`, `ui`, `terminal`
  - Down: Drop all five enums in reverse dependency order
  - Complexity: Small
  - Reference: FRS.md Section 2, TR.md Section 2.1

- [ ] **2.2** Migration 002: Create `users` table (up + down)
  - All columns per FRS.md Section 3.7
  - `auth_user_id` UNIQUE constraint, `role` defaults to `team_member`
  - Down: Drop `users` table
  - Complexity: Small
  - Reference: FRS.md Section 3.7, TR.md Section 2.2

- [ ] **2.3** Migration 003: Create `asana_workspaces` table (up + down)
  - All columns per FRS.md Section 3.8
  - `access_token_ref` stores reference key, not token (document in comment)
  - Down: Drop `asana_workspaces` table
  - Complexity: Small
  - Reference: FRS.md Section 3.8, TR.md Section 2.3

- [ ] **2.4** Migration 004: Create `clients` table (up + down)
  - All columns per FRS.md Section 3.1
  - `email_recipients` as JSONB, NOT NULL, default `'[]'::jsonb`
  - Down: Drop `clients` table
  - Complexity: Small
  - Reference: FRS.md Section 3.1, TR.md Section 2.4

- [ ] **2.5** Migration 004a: Create `client_users` join table (up + down) [NEW]
  - Composite PK `(user_id, client_id)`
  - FK `user_id` → `users(id)` ON DELETE CASCADE
  - FK `client_id` → `clients(id)` ON DELETE CASCADE
  - `role` VARCHAR(50) NOT NULL DEFAULT `'member'`
  - Down: Drop `client_users` table
  - Complexity: Small
  - Reference: FRS.md Section 3.10, TR.md Section 2.4a

- [ ] **2.6** Migration 005: Create `transcripts` table (up + down)
  - All columns per FRS.md Section 3.2
  - FK `client_id` → `clients(id)` ON DELETE RESTRICT
  - `normalized_segments` JSONB column for NormalizedTranscript segments
  - Import fields: `is_imported`, `imported_at`, `import_source`
  - Down: Drop `transcripts` table
  - Complexity: Small
  - Reference: FRS.md Section 3.2, TR.md Section 2.5

- [ ] **2.7** Migration 006: Create sequences (up + down)
  - `tsk_short_id_seq` starting at 1
  - `agd_short_id_seq` starting at 1
  - Down: Drop both sequences
  - Complexity: Small
  - Reference: FRS.md Section 4, TR.md Section 2.6

- [ ] **2.8** Migration 007: Create `tasks` table (up + down)
  - All columns per FRS.md Section 3.3
  - `short_id` VARCHAR(20) NOT NULL UNIQUE (trigger-populated)
  - `external_ref` JSONB (generic, not Asana-specific)
  - `priority` VARCHAR(50) with CHECK constraint, `tags` JSONB, `due_date` DATE
  - Import fields: `is_imported`, `imported_at`, `import_source`
  - FK: `client_id` RESTRICT, `transcript_id` SET NULL, `approved_by` SET NULL
  - Down: Drop `tasks` table
  - Complexity: Medium
  - Reference: FRS.md Section 3.3, TR.md Section 2.7

- [ ] **2.9** Migration 008: Create `task_versions` table (up + down)
  - All columns per FRS.md Section 3.4
  - UNIQUE constraint on `(task_id, version)`
  - FK: `task_id` CASCADE, `edited_by` SET NULL
  - Down: Drop `task_versions` table
  - Complexity: Small
  - Reference: FRS.md Section 3.4, TR.md Section 2.8

- [ ] **2.10** Migration 009: Create `agendas` table (up + down)
  - All columns per FRS.md Section 3.5
  - `short_id` VARCHAR(20) NOT NULL UNIQUE
  - `shared_url_token` UNIQUE, `internal_url_token` UNIQUE
  - CHECK: `cycle_end >= cycle_start` when both non-null
  - Import fields
  - FK: `client_id` RESTRICT, `finalized_by` SET NULL
  - Down: Drop `agendas` table
  - Complexity: Medium
  - Reference: FRS.md Section 3.5, TR.md Section 2.9

- [ ] **2.11** Migration 010: Create `agenda_versions` table (up + down)
  - All columns per FRS.md Section 3.6
  - UNIQUE constraint on `(agenda_id, version)`
  - FK: `agenda_id` CASCADE, `edited_by` SET NULL
  - Down: Drop `agenda_versions` table
  - Complexity: Small
  - Reference: FRS.md Section 3.6, TR.md Section 2.10

- [ ] **2.12** Migration 011: Create `audit_log` table (up + down)
  - All columns per FRS.md Section 3.9
  - `user_id` nullable FK → `users(id)` ON DELETE SET NULL
  - Down: Drop `audit_log` table
  - Complexity: Small
  - Reference: FRS.md Section 3.9, TR.md Section 2.11

- [ ] **2.13** Migration 012: Create all indexes (up + down)
  - 12 indexes total (11 from original + `idx_users_email`)
  - Partial index for `idx_agendas_shared_token` (`WHERE shared_url_token IS NOT NULL`)
  - Down: Drop all indexes by name
  - Complexity: Small
  - Reference: FRS.md Section 5, TR.md Section 2.12

- [ ] **2.14** Migration 013: Create trigger functions + triggers (up + down)
  - `generate_task_short_id()` + `trg_tasks_short_id_insert`
  - `guard_task_short_id()` + `trg_tasks_short_id_update` with WHEN clause
  - `generate_agenda_short_id()` + `trg_agendas_short_id_insert`
  - `guard_agenda_short_id()` + `trg_agendas_short_id_update` with WHEN clause
  - Down: Drop all 4 triggers, then all 4 functions
  - Complexity: Medium
  - Reference: FRS.md Section 4, TR.md Section 2.13

---

## Wave 3 — Schema + Seeds (parallel)

Tasks 3.1-3.3 (Drizzle schema) and 3.4-3.5 (seeds) can run in parallel.

- [ ] **3.1** Create `packages/database/src/schema.ts` (Drizzle) matching all SQL exactly
  - Include all table and enum definitions
  - Export all table definitions for API layer consumption
  - Note: Triggers handled by migration 013, not Drizzle schema
  - Complexity: Large
  - Reference: TR.md Section 7

- [ ] **3.2** Run `drizzle-kit generate` and verify generated SQL matches hand-written SQL
  - Resolve discrepancies in favor of hand-written SQL (authoritative spec)
  - Complexity: Medium

- [ ] **3.3** Export database client from `packages/database/src/client.ts` with connection pool config
  - Complexity: Small

- [ ] **3.4** Write `seeds/001_seed_dev_data.sql`
  - One client: `name = 'Total Life'`, nulls for external IDs
  - One admin user: known `auth_user_id`, `role = 'admin'`
  - One account_manager user: for approval workflow testing
  - `INSERT ... ON CONFLICT DO NOTHING` for idempotency
  - Complexity: Small
  - Reference: FRS.md Section 7

- [ ] **3.5** Add seed runner script (dev-only, cannot run against production DATABASE_URL)
  - Complexity: Small

---

## Wave 4 — Verification (partially parallel)

Tasks 4.1-4.7 can run in parallel (read-only verification). Tasks 4.8-4.9 must be sequential.

- [ ] **4.1** Apply all up migrations to blank Postgres 15 DB. Verify: 9 tables + `client_users`, 5 enums, 2 sequences, 12 indexes, 8 trigger functions
  - Complexity: Small

- [ ] **4.2** Test short ID generation: TSK-0001, TSK-0002, trigger overwrites supplied value
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.3** Test short_id immutability: exception on UPDATE
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.4** Test agenda short ID: AGD-0001, independent sequence from tasks
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.5** Test `cycle_end >= cycle_start` CHECK constraint
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.6** Test FK cascade/restrict behavior (RESTRICT on client delete, CASCADE on task delete, SET NULL on user delete)
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.7** Test UNIQUE constraints (auth_user_id, shared_url_token, task_version composite)
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.8** Apply all down migrations in reverse. Verify: all objects dropped, no errors
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.9** Re-apply all up migrations after rollback. Verify: identical schema, sequences restart at 1
  - Complexity: Small
  - Reference: GS.md

- [ ] **4.10** Run seed data. Verify: 3 users, 1 client, idempotent re-run
  - Complexity: Small
  - Reference: FRS.md Section 7.2

- [ ] **4.11** Run EXPLAIN queries to verify index usage for key query patterns
  - Complexity: Small
  - Reference: GS.md

---

## Wave 5 — Documentation

- [ ] **5.1** Write `packages/database/README.md` (migrations, seeds, env vars, conventions)
  - Complexity: Small

- [ ] **5.2** Document `external_ref` JSONB contract in tasks migration file
  - Complexity: Small
  - Reference: FRS.md Section 3.3, TR.md Section 3.2

- [ ] **5.3** Document `segments` JSONB contract in transcripts migration file
  - Complexity: Small
  - Reference: TR.md Section 3.2

- [ ] **5.4** Confirm with Feature 07 team on schema export compatibility
  - Complexity: Small

---

## Completion Checklist

- [ ] All 10 tables exist with correct schema (9 original + `client_users`)
- [ ] All 5 enums exist with correct values (`completed` IS in `task_status`)
- [ ] All 2 sequences exist and generate correct short IDs
- [ ] All 12 indexes exist
- [ ] All 8 trigger functions exist and behave correctly
- [ ] `short_id` is immutable on both `tasks` and `agendas`
- [ ] All down migrations succeed with no errors
- [ ] Up-down-up cycle produces identical schema
- [ ] Seed data is idempotent
- [ ] Drizzle schema file matches the SQL schema
- [ ] `packages/database/README.md` is written
- [ ] Feature 07 team has confirmed schema exports meet their requirements
