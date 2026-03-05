# Technology Stack

## Core Technologies

### TypeScript
**Purpose:** Primary language for all applications and packages
**Version:** ~5.7.0
**Usage:** Strict mode enabled across the monorepo

### Node.js
**Purpose:** Runtime for all services
**Version:** >=22.0.0
**Notes:** Specified in `engines` field of root `package.json`

## Application Frameworks

### Fastify
**Purpose:** REST API framework for the API service (`apps/api`)
**Key Features Used:** Route registration, schema validation, lifecycle hooks, error handling

### Next.js
**Purpose:** Web UI framework (`apps/ui`)
**Key Features Used:** App Router, Server Components, Server Actions, route groups `(dashboard)`

### Mastra Framework
**Purpose:** AI agent orchestration engine (`apps/mastra`)
**Key Features Used:** Agent definitions, tool registration, MCP server, workflow execution, prompt management

## Database & ORM

### PostgreSQL
**Purpose:** Primary persistent datastore for all services
**Managed By:** GCP Cloud SQL (production), Docker (local development)
**Key Patterns:**
- JSONB for structured data: `external_ref`, `description`, `email_recipients`, `normalized_segments`, agenda `content`
- `TIMESTAMPTZ` for all timestamps (never `TIMESTAMP`)
- `INTERVAL` for estimated time storage
- CHECK constraints for enums (`priority`, `status`)

### Drizzle ORM
**Purpose:** TypeScript ORM for schema definition, migrations, and queries
**Package:** `packages/database/` (shared schema), `packages/auth-database/` (auth schema)
**Migration Strategy:** Feature-owned migrations (Features 17, 38 own their own tables)

## Background Processing

### BullMQ
**Purpose:** Job queue for async workflow execution in Mastra
**Backend:** Redis

### Redis
**Purpose:** BullMQ job queue backend, caching
**Managed By:** GCP Memorystore (production), Docker (local)

## Authentication & Authorization

### OAuth2
**Purpose:** Authentication protocol for all clients
**Flows Implemented:**
- Authorization Code Flow (Web UI)
- Device Flow (Terminal/CLI)
- Client Credentials (Service-to-service)
- Refresh Token rotation

### JWT (JSON Web Tokens)
**Purpose:** Access and refresh tokens
**Algorithm:** RS256 (asymmetric signing)
**Libraries:** `jose`, `jsonwebtoken`

## External Integrations

### Asana API
**Purpose:** Task management — push tasks, pull status reconciliation, historical import
**Auth:** AES-256-GCM encrypted credentials stored in DB
**Client:** Shared `asana-client.ts` in `apps/api/src/adapters/asana/`

### Google Docs API
**Purpose:** Deliver meeting agendas as Google Docs
**Adapter:** `apps/api/src/adapters/google-docs/`

### Resend (Email)
**Purpose:** Send agenda emails to meeting participants
**Adapter:** `apps/api/src/adapters/email/resend-provider.ts`

### Grain
**Purpose:** Meeting recording transcript source (V2: direct API; V1: manual paste)
**Client:** `apps/api/src/normalizers/grain/grain-client.ts`

## Validation & Schema

### Zod
**Purpose:** Runtime schema validation for API inputs, shared types, and agent I/O
**Usage:** Route validators, service layer validation, shared type definitions

## UI Libraries

### React 19
**Purpose:** UI component library
**Used In:** `apps/ui`

### TipTap
**Purpose:** Rich text editor for agenda editing
**Content Format:** ProseMirror JSON (stored in DB, parsed by Google Docs adapter)

### TanStack Query
**Purpose:** Server state management (data fetching, caching, mutations)

### Tailwind CSS
**Purpose:** Utility-first CSS framework for UI styling

## Monorepo & Build

### Nx
**Purpose:** Monorepo management, build orchestration, dependency graph
**Version:** ~20.0.0
**Key Features:** Affected commands, build caching, parallel execution

### pnpm
**Purpose:** Package manager
**Version:** 9.15.4
**Workspace:** `pnpm-workspace.yaml` for monorepo package linking

## Infrastructure

### GCP (Google Cloud Platform)
**Purpose:** Production cloud provider
**Services Used:**
- **Cloud Run** — Container hosting for all 4 services
- **Cloud SQL** — Managed PostgreSQL
- **Artifact Registry** — Container image storage
- **Secret Manager** — Secrets and credentials
- **Cloud DNS** — DNS management
- **Cloud CDN** — Content delivery for UI

### Terraform
**Purpose:** Infrastructure as Code
**Location:** `infra/terraform/`
**Structure:** Reusable modules + per-environment configurations (dev, staging, prod)

### Docker
**Purpose:** Container builds for all services
**CI/CD:** Automated container builds (Feature 35)

## Testing

### Vitest
**Purpose:** Test runner and assertion library
**Config:** `vitest.config.ts` per app
**Coverage:** 497+ tests in final waves alone

## Linting & Formatting

### ESLint 9.x
**Purpose:** Code linting with flat config
**Config:** `eslint.config.js` at monorepo root

### Prettier
**Purpose:** Code formatting
**Version:** ^3.0.0

## MCP (Model Context Protocol)

### Mastra MCP Server
**Purpose:** Exposes 10 tools for Claude Code terminal access
**Tools:** Task management, client lookup, agenda operations, workflow triggers
**Auth:** User token passthrough (terminal-auth → MCP tool context)

### Terminal Tools Package
**Purpose:** Tool definitions and formatters for MCP
**Package:** `packages/terminal-tools/`
