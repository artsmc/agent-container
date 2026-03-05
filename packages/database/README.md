# @iexcel/database

Product database schema, migrations, and client for the iExcel automation system.

## Prerequisites

- PostgreSQL 15 or later running locally (or accessible via network)
- Node.js 22+
- pnpm 9+

## Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and set `DATABASE_URL` to your local PostgreSQL connection string:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/iexcel_product
```

3. Create the database if it does not exist:

```bash
createdb iexcel_product
```

## Running Migrations

Migrations are managed by Drizzle ORM. The schema is defined in `src/schema.ts` and migrations are generated into `migrations/`.

### Apply All Pending Migrations

```bash
pnpm --filter @iexcel/database migrate:up
```

This applies all Drizzle schema migrations and then runs the raw SQL triggers file (`src/triggers.sql`) which creates sequences, trigger functions, and triggers for short ID generation.

### Check Migration Status

```bash
pnpm --filter @iexcel/database migrate:status
```

### Generate a New Migration

After modifying `src/schema.ts`, generate a new migration:

```bash
pnpm --filter @iexcel/database migrate:generate
```

This creates a new SQL file in `migrations/` based on the diff between your schema file and the current database state.

### Rolling Back

Drizzle ORM does not natively support down migrations. To roll back:

1. Restore from a database backup, or
2. Write a manual SQL rollback script and execute it against the database, or
3. Drop the database and re-create it, then re-apply all migrations:

```bash
dropdb iexcel_product
createdb iexcel_product
pnpm --filter @iexcel/database migrate:up
```

## Seed Data

Seed data is for **local development and CI test environments only**. It creates:

- One admin user (`admin@iexcel.dev`)
- One account manager user (`manager@iexcel.dev`)
- One client ("Total Life")
- Client-user associations

```bash
pnpm --filter @iexcel/database seed
```

The seed script is idempotent -- running it multiple times will not create duplicate records (uses `ON CONFLICT DO NOTHING`).

The seed script refuses to run if `DATABASE_URL` contains "production" or "prod." as a safety measure.

## Schema Overview

### Tables

| Table | Description |
|---|---|
| `users` | Product-level user profiles (linked to auth service via `auth_user_id`) |
| `asana_workspaces` | Configured Asana workspace connections |
| `clients` | Central organizing entity; all business data is client-scoped |
| `client_users` | Many-to-many join: which users can access which clients |
| `transcripts` | Raw and processed call transcripts |
| `tasks` | Generated tasks with lifecycle tracking and short IDs (TSK-NNNN) |
| `task_versions` | Immutable edit history for tasks |
| `agendas` | Running Notes documents with lifecycle tracking and short IDs (AGD-NNNN) |
| `agenda_versions` | Immutable edit history for agendas |
| `audit_log` | Append-only log of all significant system actions |

### Enums

| Enum | Values |
|---|---|
| `task_status` | draft, approved, rejected, pushed, completed |
| `agenda_status` | draft, in_review, finalized, shared |
| `call_type` | client_call, intake, follow_up |
| `user_role` | admin, account_manager, team_member |
| `edit_source` | agent, ui, terminal |

### Short ID Generation

Tasks and agendas receive auto-generated, immutable short IDs via PostgreSQL triggers:

- Tasks: `TSK-0001`, `TSK-0002`, ..., `TSK-9999`, `TSK-10000`, ...
- Agendas: `AGD-0001`, `AGD-0002`, ..., `AGD-9999`, `AGD-10000`, ...

These are set automatically on INSERT and cannot be modified after creation.

## Adding a New Table

1. Define the table in `src/schema.ts` using Drizzle's `pgTable()`.
2. Add relation declarations if the table has foreign keys.
3. Run `pnpm --filter @iexcel/database migrate:generate` to create the migration SQL.
4. Review the generated migration in `migrations/`.
5. Apply with `pnpm --filter @iexcel/database migrate:up`.
6. If the table needs triggers or raw SQL features, add them to a new `.sql` file and update the migration runner.

## Migration Numbering Convention

Drizzle generates migrations with timestamp-based names. When adding manual SQL migrations, follow the convention:

```
migrations/
  0000_<drizzle_generated_name>/    # Drizzle-generated
  0001_<drizzle_generated_name>/    # Drizzle-generated
```

Raw SQL triggers and sequences are applied separately via `src/triggers.sql` and run after all Drizzle migrations.

## Package Exports

```typescript
// Full schema + client
import { db, schema } from '@iexcel/database';

// Individual tables and enums
import { users, tasks, clients, taskStatusEnum } from '@iexcel/database/schema';

// Client only
import { db, pool, closePool } from '@iexcel/database/client';
```
