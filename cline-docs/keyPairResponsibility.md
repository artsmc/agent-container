# Key Modules & Responsibilities

## Project Overview

iExcel Automation is an Nx monorepo with 4 applications and 8 shared packages that automate the meeting-to-task pipeline: transcript ingestion, AI-powered task extraction, Asana synchronization, and agenda generation.

## Applications

### API Service (`apps/api`)
**Port:** 4000
**Framework:** Fastify
**Responsibility:** Central REST API for all business operations — transcripts, tasks, clients, agendas, workflows, and imports.

**Key Modules:**

| Directory | Responsibility |
|-----------|---------------|
| `routes/` | Fastify route handlers: `clients.ts`, `tasks.ts`, `agendas.ts`, `transcripts/`, `workflows.ts`, `import.ts`, `shared.ts`, `health.ts`, `me.ts` |
| `services/` | Business logic: `client-service.ts`, `task-service.ts`, `agenda-service.ts`, `workflow.service.ts`, `output-normalizer.ts`, `import-job-service.ts`, `task-transitions.ts`, `task-batch.ts` |
| `adapters/` | External service integrations: `asana/` (client + reconcile), `google-docs/` (adapter + content-parser), `email/` (adapter + html-formatter + resend-provider), `mastra.adapter.ts` |
| `normalizers/` | Input normalization: `text/` (plain text transcripts), `grain/` (Grain recording client) |
| `repositories/` | Data access: `transcript-repository.ts`, `workflow.repository.ts`, `import-jobs-repository.ts` |
| `middleware/` | Auth, validation, short ID resolution |
| `schemas/` | Zod validation schemas for all endpoints |
| `validators/` | Route-level validation middleware |
| `db/` | Drizzle client and connection management |
| `workers/` | BullMQ background job processors |
| `errors/` | API error classes (RFC 7807 Problem Details) |
| `helpers/` | Utility functions (task helpers, share tokens) |

---

### Auth Service (`apps/auth`)
**Port:** 3001
**Framework:** Fastify/Express
**Responsibility:** OAuth2-compliant authentication and authorization server.

**Key Modules:**

| Directory | Responsibility |
|-----------|---------------|
| `routes/authorize.ts` | Authorization code flow initiation |
| `routes/callback.ts` | OAuth2 callback handling |
| `routes/token.ts` | Token issuance (authorization code, refresh, client credentials) |
| `routes/device/` | Device flow for terminal authentication |
| `routes/admin/` | Admin client management (CRUD OAuth clients) |
| `routes/well-known/` | OIDC discovery endpoints |
| `routes/userinfo.ts` | User profile endpoint |
| `services/` | Token generation, IDP logic, client management |
| `middleware/` | Auth middleware, request validation |
| `db/` | Auth-specific database (users, clients, tokens, codes) |
| `signing-keys.ts` | JWT RS256 key management |

---

### Mastra Engine (`apps/mastra`)
**Port:** 3000
**Framework:** Mastra Framework
**Responsibility:** AI agent orchestration, MCP server, and workflow execution.

**Key Modules:**

| Directory | Responsibility |
|-----------|---------------|
| `agents/` | AI agent implementations: `intake-agent.ts` (transcript → tasks), `agenda-handler.ts` (tasks → agenda) |
| `mcp-tools/` | MCP tool implementations (10 tools) with `helpers/` for token extraction, client resolution, API client creation |
| `tools/` | Mastra tool definitions for agent use |
| `prompts/` | LLM prompt templates for agents |
| `schemas/` | Zod schemas for agent I/O: `agenda-output.ts` |
| `auth/` | Service token management for API-to-API calls |
| `config/` | Mastra runtime configuration |
| `utils/` | Prompt helpers, formatting utilities |
| `api-client.ts` | Typed API client for calling the API service |

---

### Web UI (`apps/ui`)
**Port:** 3500
**Framework:** Next.js
**Responsibility:** User-facing web application for task review, agenda management, and administration.

**Key Modules:**

| Directory | Responsibility |
|-----------|---------------|
| `app/(dashboard)/` | Dashboard pages: clients, agendas, client detail |
| `app/auth/` | Authentication pages (login callback) |
| `app/login/` | Login page |
| `app/shared/` | Public shared agenda pages |
| `features/agendas/` | Agenda list, detail, editor (TipTap), mutations, hooks |
| `features/clients/` | Client detail, tasks summary, transcripts, hooks |
| `features/settings/` | Admin settings UI (Asana credentials, user management) |
| `components/` | Shared UI components: `ClientCard`, `ClientHeader`, `WorkflowTrigger` |
| `lib/` | API client setup, dashboard data fetching, workflow submission |
| `auth/` | Token provider, session management |

---

## Shared Packages

| Package | Location | Responsibility |
|---------|----------|---------------|
| `@iexcel/shared-types` | `packages/shared-types/` | Canonical TypeScript types: `NormalizedTranscript`, `NormalizedTask`, `TaskDescription`, `ExternalRef`, `EmailRecipient`, `TaskStatus`, `TaskPriority`, API error codes |
| `@iexcel/database` | `packages/database/` | Drizzle ORM schema definitions and migration scripts for all tables |
| `@iexcel/api-client` | `packages/api-client/` | Typed HTTP client for consuming the API: `endpoints/clients.ts`, `endpoints/agendas.ts`, `endpoints/workflows.ts` |
| `@iexcel/auth-client` | `packages/auth-client/` | OAuth2 client utilities: authorization code, client credentials, device flow, token refresh, validation |
| `@iexcel/auth-database` | `packages/auth-database/` | Auth-specific Drizzle schema (users, OAuth clients, tokens, authorization codes) |
| `@iexcel/terminal-auth` | `packages/terminal-auth/` | Terminal device auth flow: `token-manager.ts`, `commands/login.ts` |
| `@iexcel/terminal-tools` | `packages/terminal-tools/` | MCP tool definitions and formatters: `client-formatter.ts`, `agenda-formatter.ts`, `schemas.ts` |
| `@iexcel/ui-tokens` | `packages/ui-tokens/` | Design tokens for the web UI (colors, spacing, typography) |

---

## Infrastructure

| Component | Location | Responsibility |
|-----------|----------|---------------|
| Terraform | `infra/terraform/` | GCP IaC: `main.tf`, `modules/`, `environments/` |
| Terraform modules | `infra/terraform/modules/` | Reusable modules: Cloud Run, Cloud SQL, networking |
| Environments | `infra/terraform/environments/` | Per-environment configs (dev, staging, prod) |

## Package Dependency Graph

```
shared-types ← database ← api (service layer)
shared-types ← api-client ← ui, mastra, terminal-tools
shared-types ← auth-client ← ui, terminal-auth
auth-database ← auth
terminal-auth ← terminal-tools ← mastra (MCP tools)
ui-tokens ← ui
```
