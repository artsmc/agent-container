# FRD — Feature Requirement Document
# Feature 04: Product Database Schema

## 1. Business Objective

Establish the persistent, authoritative data store for all business data in the iExcel automation system. This schema is the single source of truth for every client, transcript, task, agenda, user, and audit event in the system. No business data reaches any external system (Asana, Google Docs, Email) without first being recorded here.

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Development team** | A versioned, reproducible schema applied via a single migration command across local, staging, and production environments. |
| **Feature 07 (API Scaffolding)** | Tables are present and indexed correctly when the API layer starts. No runtime schema bootstrapping required. |
| **Features 09–14 (domain endpoints)** | Every endpoint has a well-defined table, foreign key, and index to query against from day one. |
| **Feature 38 (Historical Import)** | Import fields (`is_imported`, `imported_at`, `import_source`) are already on the schema — no migration needed when the import feature ships. |
| **Operations team** | Down migrations exist for every up migration, enabling clean rollback in any environment without data loss risk. |
| **iExcel team** | Human-readable short IDs (`TSK-0001`, `AGD-0001`) make tasks and agendas immediately referenceable across the UI, terminal, and chat interfaces without needing internal UUIDs. |
| **Audit / compliance** | Every significant action in the system is captured in the audit log with user attribution, entity reference, and metadata. |

## 3. Target Users

This feature has no direct end-user interaction. Its consumers are:

- **Feature 07 (API Scaffolding)** — the primary runtime consumer of all tables.
- **Features 09, 10, 11, 14 (domain endpoint features)** — write and read clients, transcripts, tasks, and agendas.
- **Feature 38 (Historical Import)** — writes imported records with import flags set.
- **Database administrators** — who apply, verify, and roll back migrations.
- **CI/CD pipeline (Features 34/35)** — which runs migrations as part of every deployment.

## 4. Problem Statement

Prior to this feature:

- Draft tasks exist only in Mastra agent runtime memory — they are lost if a workflow crashes or restarts.
- There is no record of whether a task has been approved, rejected, or pushed to Asana.
- Client configuration (routing rules, email recipients, workspace mappings) has no persistent home.
- Multiple consumers (UI, terminal, Mastra) could create conflicting state with no arbitration layer.
- There is no audit trail of who created, edited, approved, or rejected any piece of work.
- Short-form human references to tasks and agendas (e.g., "TSK-0042") are impossible without a persistent ID registry.
- Historical client data has no place to live — there is no schema support for imported records.

This feature resolves all of these by creating the foundational schema before any application code runs.

## 5. Success Metrics

| Metric | Target |
|---|---|
| All nine tables created with correct columns, types, and constraints | 100% match to specification |
| All five enums created with correct values | Zero drift from approved enum lists |
| All up migrations apply cleanly from a blank Postgres database | Zero errors |
| All down migrations fully reverse their corresponding up migration | Schema returns to prior state |
| All specified indexes exist and are verified with `\d tablename` | 100% coverage |
| Short ID sequences (`tsk_seq`, `agd_seq`) generate correct format | `TSK-0001` through `TSK-9999+` |
| Feature 07 (API Scaffolding) connects and queries without schema changes | No schema drift |
| Seed data inserts at minimum one client record for local development | Clean local bootstrap |

## 6. Business Constraints

- **Physical isolation from auth database**: This is the product database. The auth database (Feature 03) is a separate Postgres database. The two schemas must not co-exist in the same database, though they may reside on the same Postgres instance.
- **No application logic**: This feature delivers SQL migrations, trigger functions for short ID generation, and seed data only. No ORM model definitions, no service code, no API endpoints.
- **ORM schema file is in scope**: If the project uses Drizzle or Prisma, the schema definition file (e.g., `schema.ts`) is part of this feature because it is the machine-readable source of truth for migrations. Query logic is not.
- **Dependency on Feature 00**: The `packages/database/` package must already exist in the Nx monorepo before migrations can be added.
- **Dependency on Feature 01**: Shared type definitions (e.g., `NormalizedTranscript` segment shape) must be reviewed before finalizing the JSONB column structure for `transcripts.segments`.
- **external_ref is not Asana-specific**: The `tasks.external_ref` JSONB column must be designed as a generic reference to any project management system. It must not encode Asana assumptions in its structure.

## 7. Integration with Product Roadmap

This feature sits on the primary critical path:

```
00 (monorepo) → 04 (product-database-schema) → 07 (api-scaffolding) → 09/10/11/14 (domain endpoints) → ...
```

It also receives a secondary dependency from Feature 01 (shared types), which informs the `segments` JSONB structure. Delay to this feature cascades to the entire API and domain layer. It is a Wave 1 deliverable.

```
Wave 1: 00, 01, 02, 03, [04] ← this feature
Wave 2: 05, 06, 18
Wave 3: 07, 08, 09, 22, 23, 34
...
```

## 8. Scope Boundaries

### In Scope

- Migration creating the `clients` table
- Migration creating the `transcripts` table (with `segments` JSONB and import fields)
- Migration creating the `tasks` table (with `short_id`, `external_ref` JSONB, `priority`, `tags`, `due_date`, and import fields)
- Migration creating the `task_versions` table
- Migration creating the `agendas` table (with `short_id` and import fields)
- Migration creating the `agenda_versions` table
- Migration creating the `users` table (product profile, linked via `auth_user_id`)
- Migration creating the `asana_workspaces` table
- Migration creating the `audit_log` table
- All five enums: `task_status`, `agenda_status`, `call_type`, `user_role`, `edit_source`
- All indexes specified in the database PRD and context
- Short ID generation mechanism (database sequence + trigger or application-level logic)
- Down migrations for all tables and enums
- Seed data for local development (at minimum: one client, one admin user)

### Out of Scope

- Auth database schema — Feature 03
- API application code — Feature 07 and beyond
- ORM query logic (schema file is in scope; query helpers are not)
- Terraform provisioning of the Postgres instance — Feature 02
- Historical import execution logic — Feature 38 (schema fields are in scope; the import runner is not)
- Client-user access control join table — deferred (open question from database PRD)
