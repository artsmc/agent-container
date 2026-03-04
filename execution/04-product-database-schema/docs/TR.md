# TR — Technical Requirements
# Feature 04: Product Database Schema

---

## 1. Technology Stack

### 1.1 Database

- **Engine**: PostgreSQL 15 or later
- **Extensions required**: `pgcrypto` (for `gen_random_uuid()`) or `uuid-ossp`. Note: `gen_random_uuid()` is available natively in PostgreSQL 13+; no extension required for Postgres 15.
- **Encoding**: UTF-8
- **Timezone**: UTC for all `TIMESTAMPTZ` columns. Application layer must convert to local time for display.

### 1.2 Migration Tooling

The migration tooling must be capable of:
- Ordered, versioned migrations (up and down)
- Running migrations from CI/CD without interactive prompts
- Tracking applied migrations in a metadata table

**Confirmed: Drizzle ORM + `drizzle-kit`** is the selected migration tool.

| Option | Language | Notes |
|---|---|---|
| **Drizzle ORM + `drizzle-kit`** (selected) | TypeScript | Schema-as-code in TypeScript. Generates SQL migrations. Strong type inference for API layer. |

The migration files must produce the exact SQL specified in this document. Drizzle is the implementation tool; the schema is the contract. Trigger creation must be done via raw SQL in a separate migration file, as Drizzle does not natively generate Postgres triggers.

### 1.3 Package Location

Within the Nx monorepo (Feature 00):
```
packages/
  database/
    migrations/
      001_create_enums.sql (or equivalent)
      002_create_users.sql
      003_create_asana_workspaces.sql
      004_create_clients.sql
      005_create_transcripts.sql
      006_create_sequences.sql
      007_create_tasks.sql
      008_create_task_versions.sql
      009_create_agendas.sql
      010_create_agenda_versions.sql
      011_create_audit_log.sql
      012_create_indexes.sql
      013_create_triggers.sql
    seeds/
      001_seed_dev_data.sql
    schema.ts (if using Drizzle or Prisma)
    package.json
    README.md
```

---

## 2. Complete SQL Specification

The following SQL represents the canonical schema. Migration tooling must produce equivalent DDL.

### 2.1 Enum Creation

```sql
-- Enums must be created before any table that references them

CREATE TYPE task_status AS ENUM ('draft', 'approved', 'rejected', 'pushed', 'completed');

CREATE TYPE agenda_status AS ENUM ('draft', 'in_review', 'finalized', 'shared');

CREATE TYPE call_type AS ENUM ('client_call', 'intake', 'follow_up');

CREATE TYPE user_role AS ENUM ('admin', 'account_manager', 'team_member');

CREATE TYPE edit_source AS ENUM ('agent', 'ui', 'terminal');
```

### 2.2 `users` Table

```sql
CREATE TABLE users (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id    UUID          NOT NULL UNIQUE,
  email           VARCHAR(320)  NOT NULL,
  name            VARCHAR(255),
  role            user_role     NOT NULL DEFAULT 'team_member',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### 2.3 `asana_workspaces` Table

```sql
CREATE TABLE asana_workspaces (
  id                    UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asana_workspace_id    VARCHAR(255)  NOT NULL,
  name                  VARCHAR(255)  NOT NULL,
  access_token_ref      VARCHAR(500)  NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### 2.4 `clients` Table

```sql
CREATE TABLE clients (
  id                          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                        VARCHAR(255)  NOT NULL,
  grain_playlist_id           VARCHAR(255),
  default_asana_workspace_id  VARCHAR(255),
  default_asana_project_id    VARCHAR(255),
  email_recipients            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### 2.4a `client_users` Join Table

```sql
CREATE TABLE client_users (
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role        VARCHAR(50)   NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_id)
);
```

### 2.5 `transcripts` Table

```sql
CREATE TABLE transcripts (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  grain_call_id   VARCHAR(255),
  call_type       call_type     NOT NULL,
  call_date       TIMESTAMPTZ   NOT NULL,
  raw_transcript  TEXT,
  normalized_segments  JSONB,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- import fields
  is_imported     BOOLEAN       NOT NULL DEFAULT false,
  imported_at     TIMESTAMPTZ,
  import_source   VARCHAR(255)
);
```

### 2.6 Short ID Sequences

```sql
CREATE SEQUENCE tsk_short_id_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE;
CREATE SEQUENCE agd_short_id_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE;
```

### 2.7 `tasks` Table

```sql
CREATE TABLE tasks (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id        VARCHAR(20)   NOT NULL UNIQUE,
  client_id       UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  transcript_id   UUID          REFERENCES transcripts(id) ON DELETE SET NULL,
  status          task_status   NOT NULL DEFAULT 'draft',
  title           VARCHAR(500)  NOT NULL,
  description     JSONB,
  assignee        VARCHAR(255),
  estimated_time  INTERVAL,
  scrum_stage     VARCHAR(100)  NOT NULL DEFAULT 'Backlog',
  external_ref    JSONB,
  priority        VARCHAR(50)   CHECK (priority IN ('low','medium','high','critical')),
  tags            JSONB         DEFAULT '[]'::jsonb,
  due_date        DATE,
  approved_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  pushed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- import fields
  is_imported     BOOLEAN       NOT NULL DEFAULT false,
  imported_at     TIMESTAMPTZ,
  import_source   VARCHAR(255)
);
```

### 2.8 `task_versions` Table

```sql
CREATE TABLE task_versions (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id         UUID          NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version         INTEGER       NOT NULL,
  title           VARCHAR(500)  NOT NULL,
  description     JSONB,
  estimated_time  INTERVAL,
  edited_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  source          edit_source   NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_versions_task_version UNIQUE (task_id, version)
);
```

### 2.9 `agendas` Table

```sql
CREATE TABLE agendas (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id            VARCHAR(20)   NOT NULL UNIQUE,
  client_id           UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  status              agenda_status NOT NULL DEFAULT 'draft',
  content             TEXT,
  cycle_start         DATE,
  cycle_end           DATE,
  shared_url_token    VARCHAR(128)  UNIQUE,
  internal_url_token  VARCHAR(128)  UNIQUE,
  google_doc_id       VARCHAR(255),
  finalized_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
  finalized_at        TIMESTAMPTZ,
  shared_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- import fields
  is_imported         BOOLEAN       NOT NULL DEFAULT false,
  imported_at         TIMESTAMPTZ,
  import_source       VARCHAR(255),
  CONSTRAINT chk_cycle_dates CHECK (
    cycle_end IS NULL OR cycle_start IS NULL OR cycle_end >= cycle_start
  )
);
```

### 2.10 `agenda_versions` Table

```sql
CREATE TABLE agenda_versions (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agenda_id   UUID          NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  version     INTEGER       NOT NULL,
  content     TEXT,
  edited_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  source      edit_source   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agenda_versions_agenda_version UNIQUE (agenda_id, version)
);
```

### 2.11 `audit_log` Table

```sql
CREATE TABLE audit_log (
  id           UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100)  NOT NULL,
  entity_type  VARCHAR(50)   NOT NULL,
  entity_id    UUID          NOT NULL,
  metadata     JSONB,
  source       edit_source   NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### 2.12 Indexes

```sql
-- tasks
CREATE UNIQUE INDEX idx_tasks_short_id        ON tasks (short_id);
CREATE INDEX idx_tasks_client_status          ON tasks (client_id, status);
CREATE INDEX idx_tasks_transcript             ON tasks (transcript_id);

-- agendas
CREATE UNIQUE INDEX idx_agendas_short_id      ON agendas (short_id);
CREATE INDEX idx_agendas_client_status        ON agendas (client_id, status);
CREATE UNIQUE INDEX idx_agendas_shared_token  ON agendas (shared_url_token) WHERE shared_url_token IS NOT NULL;

-- audit_log
CREATE INDEX idx_audit_entity                 ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_user_date              ON audit_log (user_id, created_at);

-- transcripts
CREATE INDEX idx_transcripts_client_date      ON transcripts (client_id, call_date);

-- users
CREATE UNIQUE INDEX idx_users_auth_user_id    ON users (auth_user_id);
CREATE INDEX idx_users_email                  ON users (email);
```

Note: `idx_agendas_shared_token` uses a partial index (`WHERE shared_url_token IS NOT NULL`) to exclude unshared agendas from the index, reducing index size and improving lookup performance.

### 2.13 Short ID Trigger Functions and Triggers

```sql
-- Task short ID generation
CREATE OR REPLACE FUNCTION generate_task_short_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.short_id := 'TSK-' || LPAD(nextval('tsk_short_id_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_short_id_insert
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION generate_task_short_id();

-- Task short ID immutability guard
CREATE OR REPLACE FUNCTION guard_task_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id <> OLD.short_id THEN
    RAISE EXCEPTION 'short_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_short_id_update
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.short_id IS DISTINCT FROM OLD.short_id)
  EXECUTE FUNCTION guard_task_short_id();

-- Agenda short ID generation
CREATE OR REPLACE FUNCTION generate_agenda_short_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.short_id := 'AGD-' || LPAD(nextval('agd_short_id_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agendas_short_id_insert
  BEFORE INSERT ON agendas
  FOR EACH ROW
  EXECUTE FUNCTION generate_agenda_short_id();

-- Agenda short ID immutability guard
CREATE OR REPLACE FUNCTION guard_agenda_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id <> OLD.short_id THEN
    RAISE EXCEPTION 'short_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agendas_short_id_update
  BEFORE UPDATE ON agendas
  FOR EACH ROW
  WHEN (NEW.short_id IS DISTINCT FROM OLD.short_id)
  EXECUTE FUNCTION guard_agenda_short_id();
```

---

## 3. Data Models Summary

### 3.1 Entity Relationship Summary

```
users
  ├── client_users.user_id (FK, CASCADE on delete)
  ├── tasks.approved_by (FK, SET NULL on delete)
  ├── task_versions.edited_by (FK, SET NULL on delete)
  ├── agenda_versions.edited_by (FK, SET NULL on delete)
  ├── agendas.finalized_by (FK, SET NULL on delete)
  └── audit_log.user_id (FK, SET NULL on delete)

clients
  ├── client_users.client_id (FK, CASCADE on delete)
  ├── transcripts.client_id (FK, RESTRICT on delete)
  ├── tasks.client_id (FK, RESTRICT on delete)
  └── agendas.client_id (FK, RESTRICT on delete)

transcripts
  └── tasks.transcript_id (FK, SET NULL on delete)

tasks
  └── task_versions.task_id (FK, CASCADE on delete)

agendas
  └── agenda_versions.agenda_id (FK, CASCADE on delete)

asana_workspaces
  (standalone — no FK references from other tables in this schema)
```

### 3.2 JSONB Column Contracts

These are advisory contracts. The database does not enforce JSONB structure. Enforcement is at the application layer.

**`clients.email_recipients`** (NOT NULL, defaults to `'[]'::jsonb`)
```typescript
Array<{
  name: string;
  email: string;
  role?: string; // e.g., 'primary', 'cc', 'bcc'
}>
```

**`transcripts.normalized_segments`**
```typescript
// Matches NormalizedTranscript from Feature 01 (shared-types-package)
Array<{
  speaker: string;
  timestamp: string; // "HH:MM:SS" format
  text: string;
}>
```

**`tasks.description`** (JSONB — stores TaskDescription object)
```typescript
{
  taskContext: string;
  additionalContext: string;
  requirements: string[];
}
```

**`tasks.external_ref`**
```typescript
{
  system: string;         // e.g., "asana", "monday"
  externalId: string;     // Primary ID in the external system
  externalUrl: string;    // Deep link to the item in the external system
  projectId: string;      // Project or board ID
  workspaceId: string;    // Workspace or organization ID
} | null
```

**`tasks.tags`**
```typescript
string[] // e.g., ["billing", "follow-up", "urgent"]
```

**`audit_log.metadata`**
```typescript
Record<string, unknown> // Flexible; documented per action type
```

---

## 4. Performance Requirements

| Query Pattern | Target Latency | Mechanism |
|---|---|---|
| `SELECT * FROM tasks WHERE short_id = $1` | < 5ms | UNIQUE index on `short_id` |
| `SELECT * FROM tasks WHERE client_id = $1 AND status = $2` | < 10ms | Composite index on `(client_id, status)` |
| `SELECT * FROM agendas WHERE shared_url_token = $1` | < 5ms | Partial UNIQUE index on `shared_url_token` |
| `SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = $2` | < 15ms | Composite index on `(entity_type, entity_id)` |
| `SELECT * FROM transcripts WHERE client_id = $1 ORDER BY call_date DESC` | < 10ms | Composite index on `(client_id, call_date)` |

These targets assume a single Postgres instance with moderate data volumes (< 100k rows per table). Revisit at scale.

---

## 5. Security Requirements

### 5.1 Credential Storage

- `asana_workspaces.access_token_ref` stores a reference key to an external secrets manager (Vault, AWS Secrets Manager, or equivalent). The actual OAuth token must never be stored in the database.
- No other secrets, API keys, or tokens are stored in any table.

### 5.2 Data Isolation

- The product database is a separate database from the auth database. They must not share a database name or connection string.
- Connection strings must be provided via environment variables, never hardcoded.

### 5.3 Access Control

- No application user should have DDL privileges (`CREATE`, `DROP`, `ALTER`) in production. Migrations run under a separate migration-only role.
- The application runtime user requires: `SELECT`, `INSERT`, `UPDATE` on all tables; `DELETE` only on `task_versions` and `agenda_versions` if soft-delete is not used; `USAGE` on sequences.
- `audit_log` should be append-only in practice. Consider a separate DB role with only `INSERT` and `SELECT` for audit writes.

### 5.4 `is_imported` Read-Only Enforcement

Records with `is_imported = true` are read-only by convention. The database does not enforce this with a check constraint. The API layer (Feature 07+) must reject writes to imported records with a `403 FORBIDDEN` or `422 UNPROCESSABLE_ENTITY` response.

---

## 6. Migration Execution Strategy

### 6.1 Local Development

```bash
# Apply all up migrations
pnpm --filter @iexcel/database migrate:up

# Roll back last migration
pnpm --filter @iexcel/database migrate:down

# Apply seed data
pnpm --filter @iexcel/database seed
```

### 6.2 CI/CD

Migrations must run automatically as part of every deployment pipeline (Feature 34/35). The pipeline must:
1. Run `migrate:up` before starting the API service.
2. Fail the deployment if any migration errors.
3. Never run seed data in staging or production.

### 6.3 Production Rollback

Down migrations provide the rollback mechanism. In production, rolling back a migration requires:
1. Stopping the API service (to prevent writes during rollback).
2. Running `migrate:down` for the target migration.
3. Redeploying the previous API version.

Destructive operations (column drops, table drops) in down migrations must be evaluated carefully in production. Column drops are not recoverable without a backup.

---

## 7. Drizzle Schema Reference (If Using Drizzle ORM)

If the team selects Drizzle as the ORM (decision point in Feature 07), the `packages/database/` package should export a `schema.ts` file. The following is a partial reference for key tables:

```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp, date, interval, jsonb, pgEnum, integer, serial } from 'drizzle-orm/pg-core';

export const taskStatusEnum = pgEnum('task_status', ['draft', 'approved', 'rejected', 'pushed', 'completed']);
export const agendaStatusEnum = pgEnum('agenda_status', ['draft', 'in_review', 'finalized', 'shared']);
export const callTypeEnum = pgEnum('call_type', ['client_call', 'intake', 'follow_up']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'account_manager', 'team_member']);
export const editSourceEnum = pgEnum('edit_source', ['agent', 'ui', 'terminal']);

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  authUserId:   uuid('auth_user_id').notNull().unique(),
  email:        varchar('email', { length: 320 }).notNull(),
  name:         varchar('name', { length: 255 }),
  role:         userRoleEnum('role').notNull().default('team_member'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable('clients', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  name:                     varchar('name', { length: 255 }).notNull(),
  grainPlaylistId:          varchar('grain_playlist_id', { length: 255 }),
  defaultAsanaWorkspaceId:  varchar('default_asana_workspace_id', { length: 255 }),
  defaultAsanaProjectId:    varchar('default_asana_project_id', { length: 255 }),
  emailRecipients:          jsonb('email_recipients').notNull().default([]),
  createdAt:                timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:                timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable('tasks', {
  id:             uuid('id').primaryKey().defaultRandom(),
  shortId:        varchar('short_id', { length: 20 }).notNull().unique(),
  clientId:       uuid('client_id').notNull().references(() => clients.id),
  transcriptId:   uuid('transcript_id').references(() => transcripts.id),
  status:         taskStatusEnum('status').notNull().default('draft'),
  title:          varchar('title', { length: 500 }).notNull(),
  description:    jsonb('description'),
  assignee:       varchar('assignee', { length: 255 }),
  estimatedTime:  interval('estimated_time'),
  scrumStage:     varchar('scrum_stage', { length: 100 }).notNull().default('Backlog'),
  externalRef:    jsonb('external_ref'),
  priority:       varchar('priority', { length: 50 }),
  tags:           jsonb('tags').default([]),
  dueDate:        date('due_date'),
  approvedBy:     uuid('approved_by').references(() => users.id),
  approvedAt:     timestamp('approved_at', { withTimezone: true }),
  pushedAt:       timestamp('pushed_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  isImported:     boolean('is_imported').notNull().default(false),
  importedAt:     timestamp('imported_at', { withTimezone: true }),
  importSource:   varchar('import_source', { length: 255 }),
});
```

Note: Drizzle does not natively generate Postgres triggers. Trigger creation must be done via raw SQL in a separate migration file even when using Drizzle.

---

## 8. Dependencies and Integration Points

| Feature | Relationship | Notes |
|---|---|---|
| Feature 00 (Nx Monorepo) | Must exist first | `packages/database/` directory must exist |
| Feature 01 (Shared Types) | Informs schema | `NormalizedTranscript` segment shape determines `transcripts.segments` JSONB structure |
| Feature 02 (Terraform) | Provides Postgres instance | Connection string injected via environment |
| Feature 07 (API Scaffolding) | Primary consumer | API layer imports schema types; connects with runtime DB user |
| Feature 13 (Status Reconciliation) | Reads `tasks.status` and `tasks.external_ref` | Schema fields already in place |
| Feature 38 (Historical Import) | Writes `is_imported = true` rows | Import fields already in schema |

---

## 9. Open Questions and Deferred Decisions

| Question | Impact | Owner | Status |
|---|---|---|---|
| Which migration tool: Drizzle, Prisma, or raw SQL? | Affects schema file format and migration commands | Feature 07 team | **Resolved: Drizzle ORM** |
| Soft delete vs hard delete for rejected tasks? | May require `deleted_at` column on `tasks` | Product | Open |
| Should `audit_log` have a retention policy? | May require a scheduled purge job | Operations | Open |
| Should `content` on `agendas` be stored as markdown, HTML, or ProseMirror JSON? | Affects `agenda_versions.content` structure | Product / Feature 28 (UI Agenda Editor) | Open |
| Client-user access control join table? | If users can be restricted to specific clients, a `client_users` join table is needed | Product | **Resolved: `client_users` join table added** |
| Should Asana credentials use a dedicated secrets manager? | Affects `access_token_ref` semantics | Security / Infrastructure | Open |
