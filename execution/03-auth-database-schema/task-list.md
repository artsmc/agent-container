# Task List — Feature 03: Auth Database Schema

**Package:** `packages/auth-database/`
**Blocked by:** Feature 00 (Nx Monorepo Scaffolding)
**Blocks:** Feature 05 (Auth Service)
**Complexity:** Small-Medium

---

## Phase 1: Package Scaffolding

- [ ] **1.1** Verify `packages/auth-database/` directory exists (created by Feature 00). If not, raise a blocker against Feature 00 before proceeding.
  - References: FRD.md §6 (Constraints), TR.md §2 (Package Structure)

- [ ] **1.2** Create `packages/auth-database/package.json` with the package name `@iexcel/auth-database`, version `0.1.0`, `private: true`, and the four npm scripts: `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`.
  - References: TR.md §4 (package.json Scripts)

- [ ] **1.3** Create `packages/auth-database/.env.example` with the `DATABASE_URL` template comment and a placeholder connection string pointing to `iexcel_auth`.
  - References: TR.md §5 (Environment Configuration)

- [ ] **1.4** Add `packages/auth-database/.env` to the root `.gitignore` (if not already covered by a global `**/.env` rule).
  - References: TR.md §7 (Security Requirements)

- [ ] **1.5** Create `packages/auth-database/migrations/` directory (empty, with a `.gitkeep` if needed by the Nx workspace).
  - References: TR.md §2 (Package Structure)

- [ ] **1.6** Create `packages/auth-database/scripts/migrate.sh` as a wrapper script that loads `.env` and executes the golang-migrate binary with the correct flags.
  - References: TR.md §2 (Package Structure)

- [ ] **1.7** Create `packages/auth-database/README.md` documenting: prerequisites (golang-migrate binary, Postgres), setup steps, how to run migrations, how to roll back, and environment variable reference.
  - References: TR.md §2 (Package Structure)

---

## Phase 2: Migration 001 — Users Table

- [ ] **2.1** Create `migrations/001_create_users.up.sql`:
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto`
  - `CREATE OR REPLACE FUNCTION set_updated_at()` trigger function
  - `CREATE TABLE users` with all columns, types, nullability, defaults, and constraints as specified
  - `CONSTRAINT users_email_unique UNIQUE (email)`
  - `CONSTRAINT users_idp_unique UNIQUE (idp_subject, idp_provider)`
  - `CREATE INDEX users_idp_subject_provider`
  - `CREATE TRIGGER users_set_updated_at`
  - References: FRS.md §2.1, TR.md §3.1

- [ ] **2.2** Create `migrations/001_create_users.down.sql`:
  - Drop trigger `users_set_updated_at`
  - `DROP TABLE IF EXISTS users CASCADE`
  - `DROP FUNCTION IF EXISTS set_updated_at()`
  - References: FRS.md §2.1 (Business Rules), TR.md §3.2

- [ ] **2.3** Apply migration 001 against a local dev database and verify:
  - Table `users` exists with all expected columns
  - `is_active` defaults to `true`
  - `email` UNIQUE constraint is enforced (test with duplicate INSERT)
  - `(idp_subject, idp_provider)` UNIQUE constraint is enforced
  - `updated_at` auto-updates on UPDATE via trigger
  - References: GS.md — Users Table scenarios

- [ ] **2.4** Apply migration 001 down and verify the table is fully removed and the schema is clean.
  - References: GS.md — "Roll back the users migration"

---

## Phase 3: Migration 002 — OIDC Clients Table

- [ ] **3.1** Create `migrations/002_create_oidc_clients.up.sql`:
  - `CREATE TABLE oidc_clients` with all columns, types, nullability, defaults, and constraints
  - `CHECK (client_type IN ('public', 'confidential'))`
  - `CHECK (token_lifetime > 0)` and `CHECK (refresh_token_lifetime > 0)`
  - `CONSTRAINT oidc_clients_client_id_unique UNIQUE (client_id)`
  - `CREATE TRIGGER oidc_clients_set_updated_at`
  - References: FRS.md §2.2, TR.md §3.3

- [ ] **3.2** Create `migrations/002_create_oidc_clients.down.sql`:
  - Drop trigger `oidc_clients_set_updated_at`
  - `DROP TABLE IF EXISTS oidc_clients CASCADE`
  - References: TR.md §3.4

- [ ] **3.3** Apply migration 002 and verify:
  - Table `oidc_clients` exists with all expected columns
  - `client_type` CHECK constraint rejects values outside ('public', 'confidential')
  - `client_id` UNIQUE constraint enforced
  - `client_secret_hash` accepts NULL
  - `grant_types`, `redirect_uris`, `scopes` accept valid JSONB arrays
  - `updated_at` auto-updates via trigger
  - References: GS.md — OIDC Clients Table scenarios

- [ ] **3.4** Apply migration 002 down and verify only the `oidc_clients` table is removed; `users` remains intact.
  - References: GS.md — "Roll back the OIDC clients migration"

---

## Phase 4: Migration 003 — Refresh Tokens Table

- [ ] **4.1** Create `migrations/003_create_refresh_tokens.up.sql`:
  - `CREATE TABLE refresh_tokens` with all columns, types, nullability, and constraints
  - `REFERENCES users(id) ON DELETE CASCADE` on `user_id`
  - `CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)`
  - `CREATE INDEX refresh_tokens_user_id`
  - `CREATE INDEX refresh_tokens_token_hash`
  - `CREATE INDEX refresh_tokens_expires_at`
  - References: FRS.md §2.3, TR.md §3.5

- [ ] **4.2** Create `migrations/003_create_refresh_tokens.down.sql`:
  - `DROP TABLE IF EXISTS refresh_tokens CASCADE`
  - References: TR.md §3.6

- [ ] **4.3** Apply migration 003 and verify:
  - Table `refresh_tokens` exists with all expected columns
  - `user_id` FK constraint: INSERT with non-existent user_id raises FK error
  - ON DELETE CASCADE: deleting a user row removes their refresh token rows
  - `token_hash` UNIQUE constraint enforced
  - `revoked_at` accepts NULL
  - All three indexes exist
  - References: GS.md — Refresh Tokens Table scenarios

- [ ] **4.4** Apply migration 003 down and verify only `refresh_tokens` is removed; `users` and `oidc_clients` remain.
  - References: GS.md — "Roll back the refresh tokens migration"

---

## Phase 5: Migration 004 — Sessions Table

- [ ] **5.1** Create `migrations/004_create_sessions.up.sql`:
  - `CREATE TABLE sessions` with all columns, types, nullability, and constraints
  - `REFERENCES users(id) ON DELETE CASCADE` on `user_id`
  - `CREATE INDEX sessions_user_id`
  - `CREATE INDEX sessions_expires_at`
  - `CREATE INDEX sessions_idp_session_id ... WHERE idp_session_id IS NOT NULL` (partial index)
  - References: FRS.md §2.4, TR.md §3.7

- [ ] **5.2** Create `migrations/004_create_sessions.down.sql`:
  - `DROP TABLE IF EXISTS sessions CASCADE`
  - References: TR.md §3.8

- [ ] **5.3** Apply migration 004 and verify:
  - Table `sessions` exists with all expected columns
  - `user_id` FK constraint enforced
  - ON DELETE CASCADE: deleting a user removes their session rows
  - `idp_session_id` accepts NULL
  - All three indexes exist (verify partial index is a partial index)
  - References: GS.md — Sessions Table scenarios

- [ ] **5.4** Apply migration 004 down and verify only `sessions` is removed; the three other tables remain.
  - References: GS.md — "Roll back the sessions migration"

---

## Phase 6: Seed Data — Pre-Registered OIDC Clients

- [ ] **6.1** Create `migrations/005_seed_oidc_clients.sql` using `INSERT ... ON CONFLICT (client_id) DO NOTHING` with all four pre-registered OIDC clients:
  - `iexcel-ui`: public, authorization_code + refresh_token
  - `iexcel-terminal`: public, device_code + refresh_token
  - `mastra-agent`: confidential, client_credentials
  - `iexcel-api`: public, no grant types (resource server)
  - References: FRS.md §3 (Seed Data), TR.md §3.9

- [ ] **6.2** Apply seed migration and verify:
  - Exactly 4 rows exist in `oidc_clients`
  - Each row's `client_type`, `grant_types`, and `client_secret_hash` match the specification
  - Run the seed a second time and verify no error and no duplicate rows
  - References: GS.md — Seed Data scenarios

---

## Phase 7: Full Stack Verification

- [ ] **7.1** From a completely empty database, apply all 5 migrations in order (001 → 005) using `npm run migrate:up` and verify no errors.
  - References: GS.md — "Applying all migrations to a clean database succeeds"

- [ ] **7.2** Verify `schema_migrations` table contains 5 entries.

- [ ] **7.3** Run `npm run migrate:status` and verify the current version is reported as 5.

- [ ] **7.4** Apply all down migrations in reverse order (004 → 001) and verify the database returns to an empty state (no user tables, no seed data).
  - References: GS.md — "Full rollback from a clean state"

- [ ] **7.5** Test partial rollback and re-apply: roll back migration 003, re-apply migration 003, verify `refresh_tokens` table is recreated correctly with all indexes.
  - References: GS.md — "Partial rollback and re-apply"

---

## Phase 8: Index Audit

- [ ] **8.1** Query `pg_indexes` to confirm all required indexes exist with the correct index types and column targets as listed in GS.md §Index Verification.
  - References: GS.md — "Required indexes exist after migration", FRS.md §2.1–2.4

---

## Phase 9: CI/CD Integration Notes (Handoff to Feature 34)

- [ ] **9.1** Document in `README.md` the exact `migrate` CLI command to run in CI, including the environment variable expected (`DATABASE_URL` or `AUTH_DATABASE_URL`).
  - References: TR.md §9 (Migration Versioning and CI/CD Integration)

- [ ] **9.2** Confirm with the Feature 34 (CI/CD Pipeline) implementer that the golang-migrate binary will be available in the pipeline execution environment (either pre-installed in the runner image or downloaded as a pipeline step).

---

## Completion Checklist

Before marking this feature complete:

- [ ] All 9 migration files exist in `packages/auth-database/migrations/`
- [ ] All four up migrations apply cleanly from an empty database with zero errors
- [ ] All four down migrations fully reverse their table
- [ ] Seed data inserts 4 rows idempotently
- [ ] All indexes verified via `pg_indexes` query
- [ ] `package.json` scripts work correctly
- [ ] `.env.example` committed, `.env` gitignored
- [ ] `README.md` documents prerequisites and usage
- [ ] Feature 05 (Auth Service) team has been notified that the schema is ready
