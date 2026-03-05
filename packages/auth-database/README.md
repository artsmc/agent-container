# @iexcel/auth-database

Auth/identity database schema and migrations for iExcel. This package contains plain SQL migration files managed by [golang-migrate](https://github.com/golang-migrate/migrate).

## Database Overview

The auth database (`iexcel_auth`) is a separate PostgreSQL database from the product database. It stores identity and authentication data:

| Table | Purpose |
|---|---|
| `users` | Canonical identity record for authenticated users. `id` becomes the OIDC `sub` claim. |
| `oidc_clients` | Registry of applications authorized to request tokens from the auth service. |
| `refresh_tokens` | Hashed refresh tokens tied to a user and client. Supports rotation and reuse detection. |
| `sessions` | Active browser/device sessions. Enables single logout via IdP session tracking. |

## Prerequisites

- **PostgreSQL 13+** (required for built-in `gen_random_uuid()`)
- **golang-migrate v4.x** CLI binary

### Installing golang-migrate

```bash
# macOS
brew install golang-migrate

# Linux (download binary)
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/

# Docker
docker pull migrate/migrate
```

## Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set `DATABASE_URL` to your auth database connection string:
   ```
   DATABASE_URL=postgres://auth_user:your_password@localhost:5432/iexcel_auth?sslmode=disable
   ```

3. Create the database (if it does not exist):
   ```bash
   createdb iexcel_auth
   ```

## Running Migrations

### Via npm scripts

```bash
# Apply all pending migrations
npm run migrate:up

# Roll back the last migration (one at a time)
npm run migrate:down

# Show current migration version
npm run migrate:status

# Drop all tables (DEVELOPMENT ONLY)
npm run migrate:reset
```

### Via wrapper script

```bash
./scripts/migrate.sh up
./scripts/migrate.sh down 1
./scripts/migrate.sh version
```

### Via golang-migrate CLI directly

```bash
migrate -path ./migrations -database "$DATABASE_URL" up
migrate -path ./migrations -database "$DATABASE_URL" down 1
migrate -path ./migrations -database "$DATABASE_URL" version
```

## Migration Files

| Migration | Description |
|---|---|
| `001_create_users` | Creates `pgcrypto` extension, `set_updated_at()` trigger function, and `users` table with indexes |
| `002_create_oidc_clients` | Creates `oidc_clients` table with CHECK constraints and `updated_at` trigger |
| `003_create_refresh_tokens` | Creates `refresh_tokens` table with FK to `users` and indexes |
| `004_create_sessions` | Creates `sessions` table with FK to `users`, indexes, and partial index on `idp_session_id` |
| `005_seed_oidc_clients` | Seeds 4 pre-registered OIDC clients (idempotent via `ON CONFLICT DO NOTHING`) |

## Schema Diagram

```
users
  id              UUID PK
  idp_subject     VARCHAR(255)
  idp_provider    VARCHAR(100)
  email           VARCHAR(255) UNIQUE
  name            VARCHAR(255)
  picture         VARCHAR(2048) NULLABLE
  is_active       BOOLEAN DEFAULT true
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ (auto-updated via trigger)
  last_login_at   TIMESTAMPTZ NULLABLE

oidc_clients
  id                      UUID PK
  client_id               VARCHAR(255) UNIQUE
  client_name             VARCHAR(255)
  client_secret_hash      VARCHAR(255) NULLABLE
  client_type             VARCHAR(20) CHECK ('public','confidential')
  grant_types             JSONB DEFAULT '[]'
  redirect_uris           JSONB DEFAULT '[]'
  scopes                  JSONB DEFAULT '[]'
  token_lifetime          INTEGER DEFAULT 3600 CHECK > 0
  refresh_token_lifetime  INTEGER DEFAULT 2592000 CHECK > 0
  is_active               BOOLEAN DEFAULT true
  created_at              TIMESTAMPTZ
  updated_at              TIMESTAMPTZ (auto-updated via trigger)

refresh_tokens
  id          UUID PK
  user_id     UUID FK -> users(id) ON DELETE CASCADE
  client_id   VARCHAR(255)
  token_hash  VARCHAR(255) UNIQUE
  expires_at  TIMESTAMPTZ
  revoked_at  TIMESTAMPTZ NULLABLE
  created_at  TIMESTAMPTZ

sessions
  id              UUID PK
  user_id         UUID FK -> users(id) ON DELETE CASCADE
  idp_session_id  VARCHAR(255) NULLABLE
  expires_at      TIMESTAMPTZ
  created_at      TIMESTAMPTZ
```

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the auth database | `postgres://auth_user:pass@localhost:5432/iexcel_auth?sslmode=disable` |

In production, use `sslmode=require`. The `DATABASE_URL` is injected as a pipeline secret in CI/CD.

## CI/CD Integration

In deployment pipelines, run migrations before starting the auth service:

```bash
migrate \
  -path packages/auth-database/migrations \
  -database "$AUTH_DATABASE_URL" \
  up
```

The migration must succeed before the auth service container receives traffic. A failed migration should fail the deployment.

The `migrate` binary must be available in the CI runner environment, either pre-installed in the runner image or downloaded as a pipeline step.

## Security Notes

- Database credentials are never committed. `.env` is gitignored.
- `client_secret_hash` and `token_hash` columns store only hashed values, never plaintext.
- The auth database connection string provides access only to `iexcel_auth` -- no cross-database access.
- In production, the auth service's database user should have SELECT, INSERT, UPDATE, DELETE only -- no DDL privileges. Migrations run under a separate privileged user.
