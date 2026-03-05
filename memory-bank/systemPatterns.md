# System Patterns

## Architecture Overview
Layered Nx monorepo with 4 apps and 8 shared packages. Apps communicate via REST APIs. AI agents run in Mastra with LLM-backed workflows. Background processing via BullMQ workers.

```
User → UI (Next.js) → API (Fastify) → Mastra (AI Agents) → External Services
                           ↓                    ↓
                      PostgreSQL             Redis/BullMQ
                      (Drizzle)              (Workers)
```

## Key Technical Decisions
- **Input/Output Normalization**: Two-layer pattern. Input normalizer converts any transcript source to `NormalizedTranscript`. Output normalizer converts `NormalizedTask` to any PM tool format. Both live in the API layer.
- **External References**: `external_ref` JSONB with standardized fields: `system`, `externalId`, `externalUrl`, `projectId`, `workspaceId` — supports multi-PM-tool future.
- **Task Description**: Structured JSONB (`TaskDescription` with `taskContext`, `additionalContext`, `requirements`) stored as JSONB in Postgres.
- **Reconciliation Strategy**: Postgres cache pattern. Reconciled data written to DB after Asana sync. Agents read reconciled tasks via API.
- **Agenda Content**: ProseMirror JSON format. TipTap editor in UI reads/writes natively. Google Docs adapter parses ProseMirror nodes.
- **Credential Storage**: AES-256-GCM encrypted in database. Swappable resolver pattern.
- **No Composio**: Custom adapters for 4 services (Asana, Google Docs, Grain, Email).
- **Feature-Owned Migrations**: Features 17, 38 own their own Drizzle migrations for `workflow_runs` and `import_jobs`/`import_job_errors` tables.

## Design Patterns
- **Repository Pattern**: `apps/api/src/repositories/` — data access layer
- **Service Layer**: `apps/api/src/services/` — business logic
- **Route Registration**: `apps/api/src/routes/` — Fastify route handlers
- **Schema Validation**: Zod schemas in `apps/api/src/schemas/` and `packages/shared-types/`
- **Middleware Pipeline**: Auth, validation, short ID resolution middleware
- **Adapter Pattern**: `apps/api/src/adapters/` — external service integrations
- **Normalizer Pattern**: `apps/api/src/normalizers/` — input/output data transformation
- **Worker Pattern**: `apps/api/src/workers/` — BullMQ background job processors
- **Shared Types**: `@iexcel/shared-types` package is the canonical type source consumed by all apps
- **Typed API Client**: `@iexcel/api-client` provides typed methods for consuming the API

## Component Relationships
- **shared-types** → consumed by all apps and packages (canonical types)
- **database** → consumed by api, mastra (Drizzle schema)
- **auth-client** → consumed by api, ui (auth utilities)
- **api-client** → consumed by ui, mastra, terminal-tools (typed API access)
- **terminal-tools** → consumed by mastra MCP server (tool definitions)
- **auth-database** → consumed by auth service (auth schema)

## Task Status Flow
```
draft → approved → pushed → (completed via reconciliation)
  ↓
rejected
```
`completed` status set only by: (a) historical import when Asana says completed, (b) reconciliation cache writes.

## Workflow Execution Flow
```
1. Transcript submitted (POST /clients/{id}/transcripts)
2. Input normalizer → NormalizedTranscript
3. Workflow orchestration triggers intake agent
4. Intake agent (Mastra) → extracts NormalizedTask[]
5. Tasks created in DB (batch POST /tasks)
6. User reviews/approves tasks in UI
7. Output normalizer → pushes approved tasks to Asana
8. Status reconciliation syncs Asana status back
9. Agenda agent (Mastra) → generates agenda from reconciled tasks
10. Agenda delivered via Google Docs / Email adapters
```
