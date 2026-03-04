# Feature 03: Auth Database Schema

## Summary
Create the auth database schema and migrations in packages/auth-database/. Tables: Users (identity), OIDC Clients, Refresh Tokens, Sessions. This is the identity database, completely separate from the product database.

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding — provides packages/auth-database/ directory)
- **Blocks**: 05 (Auth Service — needs the auth database tables to store users, clients, tokens, sessions)

## Source PRDs
- auth-prd.md (Auth Database section)
- database-prd.md (relationship note about auth_user_id link)

## Relevant PRD Extracts

### Auth Database — Identity Schema (auth-prd.md)

The auth service has its own database (or a separate schema within the same Postgres instance). This is **completely isolated** from the product database (database-prd.md).

#### Users

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key — the OIDC `sub` claim |
| `idp_subject` | VARCHAR | The user's ID from the external IdP |
| `idp_provider` | VARCHAR | Which IdP (e.g., `google`, `okta`) |
| `email` | VARCHAR | Unique. From IdP. |
| `name` | VARCHAR | Display name. From IdP. |
| `picture` | VARCHAR | Profile picture URL. From IdP. |
| `is_active` | BOOLEAN | Can be deactivated without deleting |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `last_login_at` | TIMESTAMP | |

#### OIDC Clients

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `client_id` | VARCHAR | Unique public identifier |
| `client_name` | VARCHAR | Display name |
| `client_secret_hash` | VARCHAR | Hashed secret (nullable for public clients) |
| `client_type` | ENUM | `public`, `confidential` |
| `grant_types` | JSONB | Allowed grant types |
| `redirect_uris` | JSONB | Allowed redirect URIs |
| `scopes` | JSONB | Allowed scopes |
| `token_lifetime` | INTEGER | Access token TTL in seconds |
| `refresh_token_lifetime` | INTEGER | Refresh token TTL in seconds |
| `is_active` | BOOLEAN | Can be disabled without deleting |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Refresh Tokens

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to Users |
| `client_id` | VARCHAR | Which OIDC client issued this |
| `token_hash` | VARCHAR | Hashed refresh token |
| `expires_at` | TIMESTAMP | |
| `revoked_at` | TIMESTAMP | Nullable — set when revoked |
| `created_at` | TIMESTAMP | |

#### Sessions

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to Users |
| `idp_session_id` | VARCHAR | Reference to IdP session (for single logout) |
| `expires_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

### Relationship Between Auth and Product Databases (auth-prd.md)

```
┌──────────────────────┐         ┌──────────────────────┐
│   AUTH DATABASE       │         │  PRODUCT DATABASE     │
│   (identity schema)   │         │  (database-prd.md)    │
│                      │         │                      │
│  Users               │         │  Users (product)     │
│  - id (sub claim) ───┼────────>│  - auth_user_id (FK) │
│  - email             │         │  - role              │
│  - name              │         │  - assigned_clients  │
│  - idp_provider      │         │                      │
│                      │         │  Tasks, Agendas,     │
│  OIDC Clients        │         │  Transcripts, etc.   │
│  Refresh Tokens      │         │                      │
│  Sessions            │         │                      │
└──────────────────────┘         └──────────────────────┘
```

- Auth DB owns **who you are** (identity, authentication, sessions).
- Product DB owns **what you can do** (roles, client access, business permissions).
- The link is the `sub` claim / `auth_user_id` foreign key.

### Product Users Table (database-prd.md)

Product-level user records linked to the Auth Service. Identity data (email, name, authentication) lives in the auth database. This table stores product-specific roles and permissions only.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | FK to Auth service's user `sub` claim. The link between identity and product permissions. |
| `email` | VARCHAR | Denormalized from auth (for display/query convenience). Synced on login. |
| `name` | VARCHAR | Denormalized from auth. Synced on login. |
| `role` | ENUM | `admin`, `account_manager`, `team_member` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Note:** The auth service's database owns the canonical user identity. The product Users table is created on first login (just-in-time provisioning) when a new user authenticates via SSO and is auto-linked via `auth_user_id`.

### Pre-Registered OIDC Clients (auth-prd.md)

These are created during initial deployment (as seed data):

| Client ID | Type | Grant Types | Description |
|---|---|---|---|
| `iexcel-ui` | Public | `authorization_code`, `refresh_token` | Web UI — browser-based SSO |
| `iexcel-terminal` | Public | `device_code`, `refresh_token` | Claude Code / Claw — CLI login |
| `mastra-agent` | Confidential | `client_credentials` | Mastra service-to-service |
| `iexcel-api` | Resource server | (validates tokens, doesn't request them) | API layer — token audience |

## Scope

### In Scope
- Initial migration creating the `users` table with all fields from the auth-prd.md schema
- Initial migration creating the `oidc_clients` table with all fields
- Initial migration creating the `refresh_tokens` table with all fields and FK to users
- Initial migration creating the `sessions` table with all fields and FK to users
- Appropriate indexes (unique on `users.email`, unique on `oidc_clients.client_id`, index on `refresh_tokens.user_id`, index on `refresh_tokens.token_hash`, index on `sessions.user_id`, index on `sessions.expires_at`)
- Seed data for the four pre-registered OIDC clients (iexcel-ui, iexcel-terminal, mastra-agent, iexcel-api)
- Migration tooling setup (Drizzle Kit, Prisma Migrate, or golang-migrate — tech stack dependent)
- Down migrations for rollback

### Out of Scope
- The product database schema — that is feature 04
- The auth service application code — that is feature 05
- Terraform provisioning of the Postgres instance — that is feature 02
- No application logic, no ORM models, no API code

## Key Decisions
- The auth database is **physically separate** from the product database. This provides complete isolation — the auth service cannot accidentally query product data and vice versa.
- The `users.id` field in the auth database becomes the `sub` claim in OIDC tokens and the `auth_user_id` foreign key in the product database's Users table. This is the single link between the two databases.
- Secrets (client_secret) are stored as **hashes**, never plaintext. The `client_secret_hash` field uses a one-way hash.
- Refresh tokens are also stored as **hashes** (`token_hash`), with a `revoked_at` timestamp for soft revocation rather than deletion.
- The `is_active` boolean on both Users and OIDC Clients enables deactivation without deletion, preserving audit history.
