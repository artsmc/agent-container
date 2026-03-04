# TR — Technical Requirements
# Feature 03: Auth Database Schema

## 1. Technology Stack

| Component | Choice | Version Constraint |
|---|---|---|
| Database | PostgreSQL | 13+ (required for `gen_random_uuid()` built-in) |
| Migration tool | golang-migrate | v4.x CLI binary |
| Migration format | Plain SQL (`.up.sql` / `.down.sql` pairs) | — |
| Package runtime | Node.js (for `package.json` scripts only) | 20+ (LTS, consistent with monorepo) |

**Why golang-migrate over Drizzle Kit / Prisma Migrate:**
- The `packages/auth-database/` package is a pure migration package with no ORM dependency.
- golang-migrate runs as a standalone CLI binary, making it suitable for CI/CD pipelines regardless of the auth service's runtime language.
- Plain SQL migrations are readable, diffable, and portable across any toolchain.
- Future decisions to rewrite the auth service in a different language do not require migration tooling changes.

---

## 2. Package Structure

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
├── scripts/
│   └── migrate.sh          (wrapper script for golang-migrate CLI)
├── package.json            (npm scripts: migrate:up, migrate:down, migrate:status)
├── .env.example            (template for DATABASE_URL)
└── README.md
```

---

## 3. Migration File Specifications

### 3.1 001_create_users.up.sql

```sql
-- Enable pgcrypto if not already enabled (for gen_random_uuid on PG < 13)
-- On PG 13+, gen_random_uuid() is built-in; this is a no-op safety measure.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idp_subject     VARCHAR(255)  NOT NULL,
  idp_provider    VARCHAR(100)  NOT NULL,
  email           VARCHAR(255)  NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  picture         VARCHAR(2048)     NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ       NULL,

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_idp_unique   UNIQUE (idp_subject, idp_provider)
);

CREATE INDEX users_idp_subject_provider
  ON users (idp_subject, idp_provider);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 3.2 001_create_users.down.sql

```sql
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
```

### 3.3 002_create_oidc_clients.up.sql

```sql
CREATE TABLE oidc_clients (
  id                      UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id               VARCHAR(255)  NOT NULL,
  client_name             VARCHAR(255)  NOT NULL,
  client_secret_hash      VARCHAR(255)      NULL,
  client_type             VARCHAR(20)   NOT NULL
                            CHECK (client_type IN ('public', 'confidential')),
  grant_types             JSONB         NOT NULL DEFAULT '[]',
  redirect_uris           JSONB         NOT NULL DEFAULT '[]',
  scopes                  JSONB         NOT NULL DEFAULT '[]',
  token_lifetime          INTEGER       NOT NULL DEFAULT 3600
                            CHECK (token_lifetime > 0),
  refresh_token_lifetime  INTEGER       NOT NULL DEFAULT 2592000
                            CHECK (refresh_token_lifetime > 0),
  is_active               BOOLEAN       NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT oidc_clients_client_id_unique UNIQUE (client_id)
);

CREATE TRIGGER oidc_clients_set_updated_at
  BEFORE UPDATE ON oidc_clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Note:** `set_updated_at()` is created in migration 001. Migration 002 depends on 001 having run first.

### 3.4 002_create_oidc_clients.down.sql

```sql
DROP TRIGGER IF EXISTS oidc_clients_set_updated_at ON oidc_clients;
DROP TABLE IF EXISTS oidc_clients CASCADE;
```

### 3.5 003_create_refresh_tokens.up.sql

```sql
CREATE TABLE refresh_tokens (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID          NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
  client_id   VARCHAR(255)  NOT NULL,
  token_hash  VARCHAR(255)  NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL,
  revoked_at  TIMESTAMPTZ       NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_expires_at ON refresh_tokens (expires_at);
```

### 3.6 003_create_refresh_tokens.down.sql

```sql
DROP TABLE IF EXISTS refresh_tokens CASCADE;
```

### 3.7 004_create_sessions.up.sql

```sql
CREATE TABLE sessions (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  idp_session_id  VARCHAR(255)      NULL,
  expires_at      TIMESTAMPTZ   NOT NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id
  ON sessions (user_id);

CREATE INDEX sessions_expires_at
  ON sessions (expires_at);

CREATE INDEX sessions_idp_session_id
  ON sessions (idp_session_id)
  WHERE idp_session_id IS NOT NULL;
```

**Note:** The partial index on `idp_session_id` (WHERE NOT NULL) avoids indexing the majority of rows that have no IdP session reference (device flow, client credentials).

### 3.8 004_create_sessions.down.sql

```sql
DROP TABLE IF EXISTS sessions CASCADE;
```

### 3.9 005_seed_oidc_clients.sql

```sql
INSERT INTO oidc_clients (
  client_id,
  client_name,
  client_type,
  grant_types,
  redirect_uris,
  scopes,
  token_lifetime,
  refresh_token_lifetime,
  client_secret_hash,
  is_active
)
VALUES
  (
    'iexcel-ui',
    'iExcel Web UI',
    'public',
    '["authorization_code","refresh_token"]',
    '[]',
    '["openid","profile","email"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'iexcel-terminal',
    'iExcel Terminal',
    'public',
    '["device_code","refresh_token"]',
    '[]',
    '["openid","profile","email"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'mastra-agent',
    'Mastra Agent',
    'confidential',
    '["client_credentials"]',
    '[]',
    '["openid"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'iexcel-api',
    'iExcel API',
    'public',
    '[]',
    '[]',
    '["openid"]',
    3600,
    2592000,
    NULL,
    true
  )
ON CONFLICT (client_id) DO NOTHING;
```

---

## 4. package.json Scripts

```json
{
  "name": "@iexcel/auth-database",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "migrate:up":     "migrate -path ./migrations -database $DATABASE_URL up",
    "migrate:down":   "migrate -path ./migrations -database $DATABASE_URL down 1",
    "migrate:status": "migrate -path ./migrations -database $DATABASE_URL version",
    "migrate:reset":  "migrate -path ./migrations -database $DATABASE_URL drop -f"
  },
  "devDependencies": {}
}
```

**Notes:**
- `migrate:down` steps down by 1 migration at a time. This is intentional — bulk rollback in production must be deliberate.
- `migrate:reset` drops all tables. For development use only. Should be guarded against production use in CI scripts.
- The `migrate` binary must be installed separately (via `brew install golang-migrate` on macOS, or downloaded in the CI pipeline).

---

## 5. Environment Configuration

```bash
# .env.example
# Copy to .env and fill in values. Never commit .env.

# Auth database connection string
# Format: postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
DATABASE_URL=postgres://auth_user:change_me@localhost:5432/iexcel_auth?sslmode=disable
```

The `.env` file is gitignored. In CI/CD (Feature 34), `DATABASE_URL` is injected as a pipeline secret.

---

## 6. Database Isolation Architecture

The auth database is a **separate Postgres database** from the product database:

```
Postgres Instance (shared or separate server)
├── Database: iexcel_auth          ← Feature 03 (this feature)
│   ├── users
│   ├── oidc_clients
│   ├── refresh_tokens
│   └── sessions
│
└── Database: iexcel_product       ← Feature 04
    ├── users (product profile)
    ├── clients
    ├── tasks
    ├── ...
```

- Both databases may run on the same Postgres instance (cost efficiency) but must be separate databases (not schemas).
- The auth service's connection string points exclusively to `iexcel_auth`.
- The product API's connection string points exclusively to `iexcel_product`.
- No cross-database foreign keys exist. The link between the two databases is the `auth_user_id` UUID value, validated at the application layer.

---

## 7. Security Requirements

| Requirement | Implementation |
|---|---|
| Secrets are never stored in plaintext | `client_secret_hash` and `token_hash` columns store only hashed values. The migration defines the columns; the auth service (Feature 05) enforces hashing before insert. |
| Database credentials are not committed | `.env` is gitignored. `DATABASE_URL` is injected at runtime. |
| SSL in production | `?sslmode=require` in production `DATABASE_URL`. `sslmode=disable` only in local development. |
| Minimal database user privileges | The auth service's database user should have SELECT, INSERT, UPDATE, DELETE on the four tables only — no DDL privileges in production. Migrations run under a separate privileged user. |
| No cross-database access | The auth database connection string provides access only to `iexcel_auth`. No `GRANT` permissions to the product database user. |

---

## 8. Performance Requirements

| Query Pattern | Index | Expected Load |
|---|---|---|
| Login lookup by email | `users_email_unique` (UNIQUE index) | Low-medium: ~100 logins/day |
| IdP callback lookup | `users_idp_subject_provider` | Low: matches login frequency |
| Token refresh validation | `refresh_tokens_token_hash` (UNIQUE index) | Medium: every API call with expiring token |
| Revoke all tokens for user | `refresh_tokens_user_id` | Low: admin action |
| Session lookup by IdP session ID | `sessions_idp_session_id` (partial index) | Low: single-logout events |
| Session cleanup (expiry) | `sessions_expires_at` | Low: background job |
| Token cleanup (expiry) | `refresh_tokens_expires_at` | Low: background job |

At the projected scale of iExcel (tens of users, not thousands), no additional performance tuning is required beyond the specified indexes.

---

## 9. Migration Versioning and CI/CD Integration

- Migrations are numbered sequentially: `001`, `002`, `003`, `004`, `005`.
- golang-migrate records the highest applied migration version in a `schema_migrations` table (auto-created on first run).
- In the CI/CD pipeline (Feature 34/35), migration runs as a step in the deployment pipeline before the auth service container starts.
- Migration must succeed before the auth service pod/container receives traffic. A failed migration should fail the deployment.

**CI pipeline step (pseudocode):**
```yaml
- name: Run auth database migrations
  run: |
    migrate \
      -path packages/auth-database/migrations \
      -database $AUTH_DATABASE_URL \
      up
```

---

## 10. Decisions and Alternatives Considered

| Decision | Choice | Alternative Considered | Reason for Choice |
|---|---|---|---|
| Migration tool | golang-migrate (SQL files) | Drizzle Kit, Prisma Migrate | Language-agnostic; no ORM lock-in |
| ENUM types | VARCHAR + CHECK constraint | Native Postgres ENUM | ALTER TYPE is DDL; CHECK constraint allows future values via migration |
| Secret storage | Hash only (VARCHAR) | Encrypted column | Hashing is one-way; even DB admin cannot recover plaintext |
| Session revocation | Hard delete | Soft delete (revoked_at) | No audit value in retaining revoked sessions; hard delete keeps table lean |
| Refresh token revocation | Soft delete (revoked_at) | Hard delete | Retaining revoked tokens enables reuse detection (detect if stolen token was used after revocation) |
| Timestamp type | TIMESTAMPTZ | TIMESTAMP | Timezone-aware; avoids DST-related bugs |
| UUID generation | `gen_random_uuid()` | Application-generated UUID | Removes round-trip from app to DB; no insert contention |
| Database vs schema isolation | Separate databases | Separate schemas in same DB | Complete isolation; connection strings enforce boundary; schema-level mistakes cannot bleed across |

---

## 11. Out of Scope (explicitly excluded from this feature)

- ORM model definitions (Drizzle, Prisma, TypeORM, etc.) — these belong in Feature 05 or a shared library
- Application code for the auth service — Feature 05
- Terraform resource for the Postgres database and user — Feature 02
- Product database schema — Feature 04
- Any Postgres extensions beyond `pgcrypto` (e.g., pg_partman, TimescaleDB)
- Row-level security (RLS) policies — the auth service is the only consumer; RLS adds complexity without benefit at this scale
