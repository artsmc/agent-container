# Feature 00: Nx Monorepo Scaffolding

## Summary
Set up the Nx monorepo with the folder structure defined in infra-prd.md. This includes nx.json, tsconfig.base.json, package.json, the apps/ and packages/ directories, and project.json for each project. No application code — just the scaffolding that all other features build on.

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: Nothing (this is the root)
- **Blocks**: 01, 02, 03, 04, 05, 06, 07, 08, 09, 18, 22, 23, 34, 35

## Source PRDs
- infra-prd.md (Nx Monorepo Structure section, Nx Dependency Graph section)

## Relevant PRD Extracts

### Nx Monorepo Structure (infra-prd.md)

```
/
├── apps/
│   ├── auth/                 # OIDC provider / Auth service
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json      # Nx project config
│   ├── api/                  # REST API server
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json
│   ├── mastra/               # Mastra agent runtime
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── project.json
│   └── ui/                   # Web UI (Next.js or similar)
│       ├── src/
│       ├── Dockerfile
│       └── project.json
│
├── packages/
│   ├── shared-types/         # TypeScript types shared across all apps
│   │   ├── src/
│   │   │   ├── task.ts       # Task, TaskVersion, short ID types
│   │   │   ├── agenda.ts     # Agenda, AgendaVersion types
│   │   │   ├── client.ts     # Client config types
│   │   │   ├── auth.ts       # OIDC token types, user identity types
│   │   │   ├── api.ts        # API request/response contracts
│   │   │   └── index.ts
│   │   └── project.json
│   ├── api-client/           # Generated or hand-written API client
│   │   ├── src/              # Used by UI, Mastra, and terminal MCP tools
│   │   └── project.json
│   ├── auth-client/          # OIDC client helpers (token validation, refresh, device flow)
│   │   ├── src/              # Used by API (validation), UI (auth code flow), terminal (device flow)
│   │   └── project.json
│   ├── database/             # Product database migrations and seed data
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── project.json
│   └── auth-database/        # Auth/identity database migrations
│       ├── migrations/
│       ├── seeds/
│       └── project.json
│
├── infra/
│   └── terraform/
│       ├── modules/
│       │   ├── networking/       # VPC, subnets, firewall/security groups
│       │   ├── database/         # Product Postgres instance (Cloud SQL / RDS)
│       │   ├── auth-database/    # Auth Postgres instance (separate from product)
│       │   ├── container-registry/ # GCR / ECR
│       │   ├── auth/             # Auth service container
│       │   ├── api/              # API container service
│       │   ├── mastra/           # Mastra container service
│       │   ├── ui/               # UI container service
│       │   ├── secrets/          # Secret manager config
│       │   ├── dns/              # DNS and load balancing
│       │   └── iam/              # Service accounts, roles, policies
│       ├── environments/
│       │   ├── dev.tfvars
│       │   ├── staging.tfvars
│       │   └── production.tfvars
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── project.json          # Nx project config for infra
│
├── nx.json                   # Nx workspace config
├── package.json
└── tsconfig.base.json
```

### Nx Dependency Graph (infra-prd.md)

```
shared-types
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
 api-client      database       (direct)
     │              │              │
     ├──────┐       │              │
     ▼      ▼       │              ▼
    ui    mastra     │             api ◄── database
                     │
                     └──── api
```

**Key relationships:**
- `shared-types` is the root dependency — changes here affect everything downstream.
- `api-client` depends on `shared-types` and is consumed by `ui` and `mastra`.
- `api` depends on `shared-types` and `database` (migration types).
- `ui` depends on `shared-types` and `api-client`.
- `mastra` depends on `shared-types` and `api-client`.
- `infra/terraform` is independent — only triggered by changes to `.tf` files.

### Design Principles (infra-prd.md)

- **Deploy only what changed.** A UI fix should not trigger an API deployment. Nx's affected graph and CI/CD pipeline enforce this.
- **One container, one concern.** Each application is its own container with its own build, deploy, and scaling configuration.
- **Infrastructure is code.** Every cloud resource is defined in Terraform. No manual console clicks. All changes go through PR review.
- **Environment parity.** Dev, staging, and production use the same Terraform modules with different variable files.
- **Secrets never live in code.** All credentials and tokens are managed by the cloud provider's secret manager.

## Scope

### In Scope
- Create nx.json with workspace configuration
- Create tsconfig.base.json with shared TypeScript compiler settings
- Create root package.json with Nx and shared dev dependencies
- Create directory structure for all apps (auth, api, mastra, ui) with placeholder project.json files
- Create directory structure for all packages (shared-types, api-client, auth-client, database, auth-database) with placeholder project.json files
- Create directory structure for infra/terraform with module directories and project.json
- Create environment tfvars files (dev, staging, production) as placeholders
- Create placeholder main.tf, variables.tf, outputs.tf

### Out of Scope
- No application source code (that is features 01-38)
- No Dockerfile contents (that is feature 35)
- No CI/CD pipeline configuration (that is feature 34)
- No Terraform module implementations (that is feature 02)
- No database migration files (those are features 03 and 04)

## Key Decisions
- This feature creates the skeleton only. Each project.json should define the project name and tags but does not need build/test/lint targets until the respective feature implements them.
- The Nx dependency graph relationships will be expressed through package.json dependencies as each feature adds its code. Feature 00 just ensures the structure exists.
- Terraform directories are created as empty scaffolding for feature 02 to populate.
