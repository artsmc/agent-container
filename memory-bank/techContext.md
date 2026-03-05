# Technical Context

## Technology Stack
- **Monorepo Tool:** Nx ~20.0.0
- **Package Manager:** pnpm 9.15.4
- **Language:** TypeScript ~5.7.0
- **Runtime:** Node.js >=22.0.0
- **API Framework:** Fastify (apps/api)
- **Auth Service:** Express-based (apps/auth)
- **AI Orchestration:** Mastra Framework (apps/mastra)
- **Web UI:** Next.js (apps/ui)
- **Database:** PostgreSQL (via Drizzle ORM)
- **ORM/Migrations:** Drizzle ORM
- **Background Jobs:** BullMQ + Redis (Mastra workers)
- **Cloud Provider:** GCP (Cloud SQL, Cloud Run, Artifact Registry, Secret Manager, Cloud DNS, Cloud CDN)
- **IaC:** Terraform (infra/terraform/)
- **Testing:** Vitest
- **Linting:** ESLint 9.x with flat config

## Project Structure
```
agent-container/
├── apps/
│   ├── api/          # Fastify REST API (transcripts, tasks, clients, agendas, workflows)
│   ├── auth/         # Authentication service (JWT, signing keys)
│   ├── mastra/       # Mastra AI agents + MCP server
│   └── ui/           # Next.js web frontend
├── packages/
│   ├── shared-types/    # @iexcel/shared-types — canonical types
│   ├── database/        # Drizzle schema + migrations
│   ├── api-client/      # Typed API client for consuming apps
│   ├── auth-client/     # Auth client utilities
│   ├── auth-database/   # Auth-specific DB schema
│   ├── terminal-auth/   # Terminal device auth flow
│   ├── terminal-tools/  # Terminal MCP tool definitions
│   └── ui-tokens/       # Design tokens for UI
├── infra/
│   └── terraform/       # GCP infrastructure as code
├── execution/
│   └── job-queue/       # Feature execution tracking (index.md)
└── planning/            # Planning documents
```

## Development Setup
```bash
# Install dependencies
pnpm install

# Build all
nx run-many --target=build

# Test all
nx run-many --target=test

# Lint all
nx run-many --target=lint

# Type check
nx run-many --target=type-check
```

## Key Dependencies
- `@mastra/core` — AI agent framework
- `drizzle-orm` + `drizzle-kit` — Database ORM and migrations
- `bullmq` + `ioredis` — Background job processing
- `fastify` — API framework
- `next` — Web UI framework
- `zod` — Runtime schema validation
- `jose` / `jsonwebtoken` — JWT handling
- `@google-cloud/*` — GCP service SDKs

## Constraints
- Node.js >=22.0.0 required
- PostgreSQL for all persistent data
- Redis required for BullMQ workers
- Asana credentials encrypted with AES-256-GCM in database
- ISO 8601 duration format for time estimates (API), INTERVAL in Postgres
- ProseMirror JSON for agenda content storage
- Short IDs use 3+ digit uncapped format (e.g., TSK-001, AGD-042)
