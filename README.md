# iExcel Automation

**Automate the path from meeting transcripts to actionable tasks.**

iExcel Automation ingests meeting transcripts (text paste, file upload, or Grain recordings), runs them through AI agents to extract structured action items, manages an approval workflow, syncs tasks bidirectionally with Asana, and generates meeting agendas delivered via Google Docs and email.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Running the Applications](#running-the-applications)
- [Testing](#testing)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Terminal (MCP) Integration](#terminal-mcp-integration)
- [Key Concepts](#key-concepts)
- [Contributing](#contributing)
- [License](#license)

---

## Why This Exists

Meeting action items get lost. Manually transcribing tasks is slow and error-prone. Task status drifts out of sync between meetings and project management tools. Preparing the next meeting's agenda means reviewing every open item by hand.

iExcel Automation solves this by connecting the dots:

1. A transcript goes in (from any source).
2. An AI intake agent extracts tasks with context, assignees, priorities, and time estimates.
3. A human reviews and approves the tasks.
4. Approved tasks are pushed to Asana automatically.
5. Status is reconciled back from Asana on a schedule.
6. An AI agenda agent generates the next meeting's agenda from reconciled data.
7. The agenda is delivered as a Google Doc and/or email.

---

## Architecture Overview

```
User --> Web UI (:3500) --> API (:4000) --> Mastra Engine (:3000)
              |                 |                  |
              |                 v                  v
              +-------> Auth (:3001)          BullMQ / Redis
                            |
                            v
                       PostgreSQL
```

| Service | Port | Framework | Purpose |
|---------|------|-----------|---------|
| **API** | 4000 | Fastify 5 | REST API for transcripts, tasks, clients, agendas, workflows |
| **Auth** | 3001 | Fastify 4 | OAuth2 server (authorization code, device flow, client credentials) |
| **Mastra** | 3000 | Mastra Framework | AI agent orchestration, MCP server, background workers |
| **Web UI** | 3500 | Next.js 15 | Dashboard, task review, agenda editor, admin settings |

External integrations: **Asana** (task sync), **Google Docs** (agenda delivery), **Resend** (email), **Grain** (recordings).

For detailed architecture diagrams and database schemas, see [`cline-docs/systemArchitecture.md`](cline-docs/systemArchitecture.md).

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | >= 22.0.0 |
| **pnpm** | >= 9.0.0 |
| **PostgreSQL** | 15+ |
| **Redis** | 6+ |

Optional for infrastructure deployment:

| Requirement | Version |
|-------------|---------|
| **Terraform** | >= 1.5 |
| **Docker** | 20+ |
| **GCP CLI (`gcloud`)** | Latest |

---

## Getting Started

### 1. Clone and install

```bash
git clone <repository-url>
cd agent-container
pnpm install
```

### 2. Set up databases

Create two PostgreSQL databases — one for the product data and one for the auth service:

```bash
createdb iexcel_product
createdb iexcel_auth
```

### 3. Configure environment variables

Each application has a `.env.example` file. Copy and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/auth/.env.example apps/auth/.env
cp apps/mastra/.env.example apps/mastra/.env
cp apps/ui/.env.example apps/ui/.env
```

See [Configuration](#configuration) for a full breakdown of required and optional variables.

### 4. Run database migrations

```bash
# Product database (used by API and Mastra)
pnpm --filter @iexcel/database run migrate

# Auth database
pnpm --filter @iexcel/auth-database run migrate
```

### 5. Build shared packages

```bash
pnpm run build
```

### 6. Start all services

```bash
# In separate terminals (or use a process manager):
pnpm --filter api run dev          # API on :4000
pnpm --filter auth run dev         # Auth on :3001
pnpm --filter mastra run dev       # Mastra on :3000
pnpm --filter ui run dev           # Web UI on :3500
```

Or build and run everything through Nx:

```bash
nx run-many --target=serve --all --parallel=4
```

Open [http://localhost:3500](http://localhost:3500) in your browser.

---

## Project Structure

```
agent-container/
├── apps/
│   ├── api/                # Fastify REST API
│   │   ├── src/
│   │   │   ├── routes/         # Endpoint handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── adapters/       # External integrations (Asana, Google Docs, Email)
│   │   │   ├── normalizers/    # Input normalization (text, Grain)
│   │   │   ├── repositories/   # Data access layer
│   │   │   ├── middleware/     # Auth, validation, short ID resolution
│   │   │   ├── schemas/        # Zod validation schemas
│   │   │   ├── workers/        # BullMQ background jobs
│   │   │   └── errors/         # RFC 7807 error classes
│   │   └── .env.example
│   ├── auth/               # OAuth2 authentication service
│   │   ├── src/
│   │   │   ├── routes/         # OAuth2 endpoints (authorize, token, device/, admin/)
│   │   │   ├── services/       # Token generation, IDP logic
│   │   │   └── db/             # Auth database access
│   │   └── .env.example
│   ├── mastra/             # AI agent engine
│   │   ├── src/
│   │   │   ├── agents/         # Intake agent, agenda agent
│   │   │   ├── mcp-tools/      # 10 MCP tools for terminal access
│   │   │   ├── tools/          # Mastra tool definitions
│   │   │   ├── prompts/        # LLM prompt templates
│   │   │   └── auth/           # Service token management
│   │   └── .env.example
│   └── ui/                 # Next.js web frontend
│       ├── src/
│       │   ├── app/            # Next.js App Router pages
│       │   ├── features/       # Feature modules (agendas, clients, settings)
│       │   ├── components/     # Shared UI components
│       │   └── lib/            # API client, utilities
│       └── .env.example
├── packages/
│   ├── shared-types/       # Canonical TypeScript types (@iexcel/shared-types)
│   ├── database/           # Drizzle ORM schema & migrations (@iexcel/database)
│   ├── auth-database/      # Auth-specific Drizzle schema (@iexcel/auth-database)
│   ├── api-client/         # Typed HTTP client (@iexcel/api-client)
│   ├── auth-client/        # OAuth2 client utilities (@iexcel/auth-client)
│   ├── terminal-auth/      # Device flow auth for CLI (@iexcel/terminal-auth)
│   ├── terminal-tools/     # MCP tool definitions & formatters (@iexcel/terminal-tools)
│   └── ui-tokens/          # SCSS design tokens (@iexcel/ui-tokens)
├── infra/
│   └── terraform/          # GCP infrastructure (Cloud Run, Cloud SQL, etc.)
├── memory-bank/            # Project context files
├── cline-docs/             # Architecture documentation
└── execution/
    └── job-queue/          # Feature execution tracking
```

For module-level responsibilities, see [`cline-docs/keyPairResponsibility.md`](cline-docs/keyPairResponsibility.md).

---

## Configuration

### API Service (`apps/api/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for the product database |
| `AUTH_ISSUER_URL` | Yes | — | Base URL of the auth service |
| `AUTH_AUDIENCE` | No | `iexcel-api` | Expected JWT audience claim |
| `PORT` | No | `8080` | API listen port |
| `HOST` | No | `0.0.0.0` | API bind address |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated) |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `MASTRA_BASE_URL` | No | — | Mastra engine URL (for workflow triggers) |
| `MASTRA_CLIENT_ID` | No | — | OAuth2 client ID for Mastra service calls |
| `API_BASE_URL` | No | — | Self-referencing base URL |
| `GRAIN_API_KEY` | No | — | Grain API key (V2 integration) |

### Auth Service (`apps/auth/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_DATABASE_URL` | Yes | — | PostgreSQL connection string for the auth database |
| `IDP_CLIENT_ID` | Yes | — | External IdP (Google) client ID |
| `IDP_CLIENT_SECRET` | Yes | — | External IdP client secret |
| `IDP_ISSUER_URL` | Yes | — | External IdP issuer (e.g., `https://accounts.google.com`) |
| `SIGNING_KEY_PRIVATE` | Yes | — | RS256 private key (PEM format) for JWT signing |
| `AUTH_ISSUER_URL` | Yes | — | This auth service's public issuer URL |
| `PORT` | No | `8090` | Auth listen port |
| `CORS_ALLOWED_ORIGINS` | No | — | Allowed CORS origins (comma-separated) |

### Mastra Engine (`apps/mastra/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_BASE_URL` | Yes | — | iExcel API service URL |
| `AUTH_ISSUER_URL` | Yes | — | Auth service URL |
| `MASTRA_CLIENT_ID` | Yes | — | OAuth2 client ID for service-to-service auth |
| `MASTRA_CLIENT_SECRET` | Yes | — | OAuth2 client secret |
| `LLM_API_KEY` | Yes | — | LLM provider API key |
| `LLM_PROVIDER` | No | `anthropic` | LLM provider (`openai` or `anthropic`) |
| `LLM_MODEL` | No | `claude-sonnet-4-20250514` | Model identifier |
| `MASTRA_PORT` | No | `8081` | Mastra listen port |

### Web UI (`apps/ui/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_ISSUER_URL` | Yes | — | Auth service OIDC issuer (server-side) |
| `API_BASE_URL` | Yes | — | Product API base URL (server-side) |
| `NEXT_PUBLIC_APP_URL` | Yes | — | This UI's public URL (browser + server) |

---

## Running the Applications

### Development

```bash
# Individual services
pnpm --filter api run dev          # API        → http://localhost:4000
pnpm --filter auth run dev         # Auth       → http://localhost:3001
pnpm --filter mastra run dev       # Mastra     → http://localhost:3000
pnpm --filter ui run dev           # Web UI     → http://localhost:3500
```

### Build

```bash
# Build all apps and packages
pnpm run build

# Build only what changed
pnpm run build:affected

# Build a specific app
nx build api
```

### Useful Nx Commands

```bash
# Visualize the dependency graph
nx graph

# Run a target for specific projects
nx run-many --target=build --projects=api,auth --parallel=2

# Run only affected targets (based on git diff)
nx affected --target=test --base=main

# Clear Nx cache (if builds behave unexpectedly)
nx reset
```

---

## Testing

All applications use [Vitest](https://vitest.dev/).

```bash
# Run all tests across the monorepo
pnpm run test

# Run tests for only changed projects
pnpm run test:affected

# Run tests for a specific app
nx test api
nx test ui

# Run with coverage
nx test api --coverage

# Watch mode
nx test api --watch
```

---

## Infrastructure & Deployment

Production infrastructure runs on **Google Cloud Platform** and is defined as Terraform modules.

```
infra/terraform/
├── main.tf              # Root module
├── variables.tf         # Input variables
├── modules/
│   ├── api/             # Cloud Run — API service
│   ├── auth/            # Cloud Run — Auth service
│   ├── mastra/          # Cloud Run — Mastra engine
│   ├── ui/              # Cloud Run — Web UI
│   ├── database/        # Cloud SQL — Product database
│   ├── auth-database/   # Cloud SQL — Auth database
│   ├── container-registry/ # Artifact Registry
│   ├── dns/             # Cloud DNS
│   ├── iam/             # IAM roles and permissions
│   └── secrets/         # Secret Manager
└── environments/
    ├── dev/
    ├── staging/
    └── production/
```

### Deploy

```bash
cd infra/terraform/environments/dev
terraform init
terraform plan
terraform apply
```

### CI/CD

GitHub Actions workflows are defined in `.github/workflows/`:

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Lint, type-check, test on every push |
| `deploy-staging.yml` | Build containers, deploy to staging |
| `deploy-production.yml` | Promote staging to production |

---

## Terminal (MCP) Integration

iExcel exposes **10 MCP tools** through the Mastra engine, allowing Claude Code to interact with the platform directly from the terminal.

### Setup

The repository includes an `.mcp.json` that configures the MCP proxy:

```json
{
  "mcpServers": {
    "iexcel-mastra": {
      "type": "command",
      "command": "node",
      "args": ["./packages/terminal-tools/bin/mcp-proxy.js"],
      "env": {
        "MASTRA_MCP_URL": "http://localhost:8081/mcp"
      }
    }
  }
}
```

### Authentication

Terminal users authenticate via the **OAuth2 Device Flow**:

1. The CLI initiates a device code request.
2. The user opens a URL in their browser and approves.
3. The CLI polls for token issuance.
4. Tokens are cached locally by the token manager.

Each MCP tool invocation passes the user's token for authenticated API access.

### Available Tools

| Tool | Description |
|------|-------------|
| List clients | Browse all clients you have access to |
| Get client | View client details |
| List tasks | Query tasks by client, status, or transcript |
| Get task | View full task details |
| Approve task | Move a task from draft to approved |
| Reject task | Reject a drafted task with a reason |
| List agendas | Browse agendas for a client |
| Get agenda | View agenda content |
| Generate agenda | Trigger the agenda agent for a client |
| Trigger workflow | Start an intake or agenda workflow |

---

## Key Concepts

A short glossary of domain terms used throughout the codebase. For the full glossary, see [`cline-docs/glossary.md`](cline-docs/glossary.md).

| Term | Meaning |
|------|---------|
| **Client** | An organizational entity (company/team) whose meetings are tracked |
| **NormalizedTranscript** | Canonical transcript format after input normalization (speaker-attributed, timestamped) |
| **NormalizedTask** | Canonical task type extracted by the intake agent |
| **TaskDescription** | Structured JSONB: `{ taskContext, additionalContext, requirements }` |
| **External Ref** | JSONB linking a task to an external PM tool: `{ system, externalId, externalUrl, ... }` |
| **Short ID** | Human-readable identifier (e.g., `TSK-001`, `AGD-042`) resolved to UUIDs via middleware |
| **Input Normalizer** | Converts source-specific formats to canonical `NormalizedTranscript` |
| **Output Normalizer** | Converts `NormalizedTask` to external PM tool format (Asana) |
| **Reconciliation** | Bidirectional status sync between internal tasks and Asana |
| **ProseMirror JSON** | Structured content format for agendas (native to the TipTap editor) |
| **Task Status** | `draft` → `approved` → `pushed` → `completed` (or `rejected`) |

---

## Contributing

### Branching

- `main` is the default branch.
- Create feature branches from `main`.
- Use descriptive branch names: `feat/add-slack-adapter`, `fix/reconciliation-timeout`.

### Code Quality

```bash
# Lint
pnpm run lint

# Auto-fix lint issues
pnpm run lint:affected -- --fix

# Format
pnpm run format

# Type-check
pnpm run type-check
```

### Conventions

- **TypeScript strict mode** is enabled across the monorepo.
- **Zod** validates all API inputs at the boundary.
- **Drizzle ORM** manages all database migrations — never modify schemas by hand.
- **RFC 7807 Problem Details** for all API error responses.
- All timestamps use `TIMESTAMPTZ` in PostgreSQL.
- Shared types live in `@iexcel/shared-types` — do not duplicate type definitions across apps.

### Adding a New Feature

1. Define types in `packages/shared-types/` if they cross package boundaries.
2. Add database migrations in `packages/database/` (or as a feature-owned migration).
3. Implement API endpoints in `apps/api/src/routes/`.
4. Add UI pages/features in `apps/ui/src/features/`.
5. Write tests alongside your code.
6. Run `pnpm run test:affected` and `pnpm run lint:affected` before pushing.

---

## License

This project is **UNLICENSED** and proprietary. All rights reserved.
