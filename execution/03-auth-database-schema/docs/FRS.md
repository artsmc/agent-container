# FRS — Functional Requirement Specification
# Feature 03: Auth Database Schema

## 1. Package Location

All migration files and tooling configuration live in:

```
packages/auth-database/
├── migrations/
│   ├── 001_create_users.up.sql
│   ├── 001_create_users.down.sql
│   ├── 002_create_oidc_clients.up.sql
│   ├── 002_create_oidc_clients.down.sql
│   ├── 003_create_refresh_tokens.up.sql
│   ├── 003_create_refresh_tokens.down.sql
│   ├── 004_create_sessions.up.sql
│   ├── 004_create_sessions.down.sql
│   └── 005_seed_oidc_clients.sql
├── package.json
└── README.md
```

## 2. Table Specifications

### 2.1 Users Table

**Purpose:** The canonical identity record for every human user who authenticates via the auth service. The `id` field becomes the `sub` claim in all OIDC tokens and the `auth_user_id` foreign key in the product database.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `idp_subject` | VARCHAR(255) | NOT NULL | — | — |
| `idp_provider` | VARCHAR(100) | NOT NULL | — | — |
| `email` | VARCHAR(255) | NOT NULL | — | UNIQUE |
| `name` | VARCHAR(255) | NOT NULL | — | — |
| `picture` | VARCHAR(2048) | NULL | NULL | — |
| `is_active` | BOOLEAN | NOT NULL | `true` | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `last_login_at` | TIMESTAMPTZ | NULL | NULL | — |

**Indexes:**
- `UNIQUE INDEX users_email_unique ON users(email)` — enforces uniqueness and accelerates login lookups by email.
- `INDEX users_idp_subject_provider ON users(idp_subject, idp_provider)` — enables IdP callback lookup without a full table scan.

**Business Rules:**
- A user is never deleted. Deactivation sets `is_active = false`.
- `email` is sourced from the IdP and treated as authoritative. The auth service updates it on each login in case the IdP email changes.
- `idp_subject` + `idp_provider` together uniquely identify a user at the IdP. This composite should be unique in practice; a UNIQUE constraint on `(idp_subject, idp_provider)` is recommended.
- `updated_at` must be updated on every write via a trigger or application-layer enforcement.

---

### 2.2 OIDC Clients Table

**Purpose:** Registry of all applications authorized to request tokens from the auth service. Each registered application is a row in this table.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `client_id` | VARCHAR(255) | NOT NULL | — | UNIQUE |
| `client_name` | VARCHAR(255) | NOT NULL | — | — |
| `client_secret_hash` | VARCHAR(255) | NULL | NULL | — |
| `client_type` | VARCHAR(20) | NOT NULL | — | CHECK IN ('public', 'confidential') |
| `grant_types` | JSONB | NOT NULL | `'[]'` | — |
| `redirect_uris` | JSONB | NOT NULL | `'[]'` | — |
| `scopes` | JSONB | NOT NULL | `'[]'` | — |
| `token_lifetime` | INTEGER | NOT NULL | `3600` | CHECK > 0 |
| `refresh_token_lifetime` | INTEGER | NOT NULL | `2592000` | CHECK > 0 |
| `is_active` | BOOLEAN | NOT NULL | `true` | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Notes on column types:**
- `client_type` is implemented as VARCHAR with a CHECK constraint rather than a Postgres ENUM to allow future values to be added via ALTER TABLE without recreating the type.
- `grant_types`, `redirect_uris`, and `scopes` use JSONB for flexibility. Expected values:
  - `grant_types`: e.g., `["authorization_code", "refresh_token"]`
  - `redirect_uris`: e.g., `["https://app.iexcel.com/auth/callback"]`
  - `scopes`: e.g., `["openid", "profile", "email"]`
- `client_secret_hash` is NULL for public clients (`iexcel-ui`, `iexcel-terminal`). Confidential clients (`mastra-agent`) have a non-null hash.
- `token_lifetime` default: 3600 seconds (1 hour).
- `refresh_token_lifetime` default: 2592000 seconds (30 days).

**Indexes:**
- `UNIQUE INDEX oidc_clients_client_id_unique ON oidc_clients(client_id)` — primary lookup path for all token requests.

**Business Rules:**
- A client is never deleted. Deactivation sets `is_active = false`.
- The `client_secret` plaintext is shown exactly once (at registration). Only its hash is stored.
- Resource servers (e.g., `iexcel-api`) that validate tokens but never request them can be registered with no grant types, no secret hash, and `is_active = true`.

---

### 2.3 Refresh Tokens Table

**Purpose:** Stores hashed refresh tokens tied to a user and client. Used by the auth service to validate token refresh requests and detect token reuse (rotation).

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | UUID | NOT NULL | — | FK → users(id) ON DELETE CASCADE |
| `client_id` | VARCHAR(255) | NOT NULL | — | — |
| `token_hash` | VARCHAR(255) | NOT NULL | — | UNIQUE |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | — |
| `revoked_at` | TIMESTAMPTZ | NULL | NULL | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Notes:**
- `client_id` references the `client_id` string (not the UUID) from `oidc_clients`. This is intentional — if an OIDC client record is deleted (which should not happen; use deactivation), historical token records remain readable without a cascading loss.
- `token_hash` is UNIQUE to prevent the same token hash from being inserted twice (defensive against hash collision edge cases).
- Soft revocation: when a token is revoked, `revoked_at` is set. The row is not deleted. This preserves the audit trail and supports token reuse detection.
- ON DELETE CASCADE from `users`: if a user record were ever deleted (not recommended — use `is_active = false`), their refresh tokens cascade-delete.

**Indexes:**
- `INDEX refresh_tokens_user_id ON refresh_tokens(user_id)` — "revoke all tokens for user X".
- `INDEX refresh_tokens_token_hash ON refresh_tokens(token_hash)` — "validate this incoming refresh token".
- `INDEX refresh_tokens_expires_at ON refresh_tokens(expires_at)` — "delete all expired tokens" (cleanup job).

**Business Rules:**
- Expired tokens are not automatically deleted; a periodic cleanup job (in the auth service) should purge rows where `expires_at < NOW()` and `revoked_at IS NOT NULL`.
- A token with `revoked_at IS NOT NULL` must be rejected regardless of `expires_at`.
- A token with `expires_at < NOW()` must be rejected regardless of `revoked_at`.

---

### 2.4 Sessions Table

**Purpose:** Tracks active browser/device sessions. Enables single logout — when a user logs out of the IdP, the auth service can look up their sessions by `idp_session_id` and invalidate all of them.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | UUID | NOT NULL | — | FK → users(id) ON DELETE CASCADE |
| `idp_session_id` | VARCHAR(255) | NULL | NULL | — |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Notes:**
- `idp_session_id` is nullable because not all IdPs provide a back-channel session ID. Device flow sessions and client credentials sessions do not have an IdP session reference.
- Sessions do not have a `revoked_at` column. Revocation is performed by deleting the row (hard delete). This is intentional — session revocation is immediate and there is no audit value in retaining revoked session rows.
- On DELETE CASCADE from `users`: consistent with refresh tokens.

**Indexes:**
- `INDEX sessions_user_id ON sessions(user_id)` — "get all active sessions for user X" (admin panel, force logout).
- `INDEX sessions_expires_at ON sessions(expires_at)` — cleanup job efficiency.
- `INDEX sessions_idp_session_id ON sessions(idp_session_id)` WHERE `idp_session_id IS NOT NULL` — single-logout lookup.

---

## 3. Seed Data — Pre-Registered OIDC Clients

The following four rows must be inserted as part of the initial schema setup. They represent the pre-registered OIDC clients defined in `auth-prd.md`.

| client_id | client_name | client_type | grant_types | redirect_uris | scopes | token_lifetime | refresh_token_lifetime | client_secret_hash |
|---|---|---|---|---|---|---|---|---|
| `iexcel-ui` | iExcel Web UI | `public` | `["authorization_code","refresh_token"]` | `[]` (configured at deploy time) | `["openid","profile","email"]` | 3600 | 2592000 | NULL |
| `iexcel-terminal` | iExcel Terminal | `public` | `["device_code","refresh_token"]` | `[]` | `["openid","profile","email"]` | 3600 | 2592000 | NULL |
| `mastra-agent` | Mastra Agent | `confidential` | `["client_credentials"]` | `[]` | `["openid"]` | 3600 | 2592000 | NULL (set at deploy) |
| `iexcel-api` | iExcel API | `public` | `[]` | `[]` | `["openid"]` | 3600 | 2592000 | NULL |

**Notes:**
- `redirect_uris` for `iexcel-ui` is intentionally empty in the seed. The actual redirect URI (e.g., `https://app.iexcel.com/auth/callback`) is environment-specific and must be patched in during deployment via a Terraform output or environment-specific migration override.
- `mastra-agent` requires a `client_secret_hash`. The secret is generated and hashed during deployment (Feature 02/05). The seed inserts the row with NULL hash; the auth service or a deployment script patches it.
- `iexcel-api` has `client_type = 'public'` and no grant types because it is a resource server, not an authorization client.

---

## 4. Migration Tool Selection

The migration tool is **golang-migrate** (`github.com/golang-migrate/migrate`), using plain SQL migration files.

**Rationale:**
- Plain SQL files are human-readable and tool-agnostic — no ORM lock-in.
- golang-migrate is framework-independent, making it suitable for a standalone `packages/auth-database/` package that has no opinion about the auth service's language or framework.
- The auth service (Feature 05) may be written in TypeScript (Node.js). golang-migrate can be run as a CLI binary in CI/CD and does not require the auth service to import migration logic.
- Alternative considered: Drizzle Kit (TypeScript-native). Rejected because it ties the migration package to TypeScript/Node.js. Plain SQL is more portable.

**Configuration file:** `packages/auth-database/migrate.env` (gitignored) or passed via environment variables:
```
MIGRATE_DATABASE_URL=postgres://user:pass@host:5432/auth_db?sslmode=require
MIGRATE_SOURCE_PATH=file://migrations
```

---

## 5. Error Handling and Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| Migration applied to a database that already has the schema | golang-migrate tracks applied migrations in a `schema_migrations` table. Already-applied migrations are skipped. |
| Down migration run on a table with existing data | Down migration drops the table (CASCADE). Data is lost. This is expected and acceptable in development. Production rollbacks require a data backup strategy (out of scope). |
| Duplicate email on user insert | Postgres raises a UNIQUE constraint violation. The auth service must catch and handle this (map to an HTTP 409 response). |
| Duplicate `client_id` on OIDC client insert | UNIQUE constraint violation. The admin API must catch and return an appropriate error. |
| Refresh token with expired `expires_at` | The schema permits the row to exist. Enforcement is in the auth service application layer. |
| Seed data run twice (idempotency) | Seed migration must use `INSERT ... ON CONFLICT (client_id) DO NOTHING` to be idempotent. |

---

## 6. Timestamp Conventions

- All timestamp columns use `TIMESTAMPTZ` (timestamp with time zone), not `TIMESTAMP`. This ensures correct behaviour across time zones and avoids ambiguity when the database server or application server changes timezone.
- `created_at` and `updated_at` default to `NOW()`.
- `updated_at` requires a Postgres trigger to auto-update on row changes. A shared trigger function `set_updated_at()` is created in a prerequisite migration or within each table's migration.

---

## 7. UUID Generation

- All primary keys use `gen_random_uuid()` (available natively in Postgres 13+).
- No sequence-based IDs or application-generated UUIDs are used for primary keys. This avoids insert contention and removes the need for the application to pre-generate IDs.
