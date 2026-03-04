# Feature 07: API Scaffolding

## Summary
Set up the REST API application at `apps/api/` with Express/Fastify server, middleware chain (OIDC token validation, permission lookup, request validation, error handling), health check endpoint, and database connection. This is the foundation layer -- no business endpoints, just the infrastructure that all subsequent API features build on.

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 00 (Nx monorepo scaffolding), 04 (product database schema), 06 (auth-client package)
- **Blocks**: 08, 09, 10, 11, 12, 14, 15, 16, 22

## Source PRDs
- `api-prd.md` — Architecture Position, Authentication & Authorization, Error Handling, Design Principles
- `auth-prd.md` — Token validation, JWKS endpoint, OIDC flows

## Relevant PRD Extracts

### Architecture Position (api-prd.md)
The API layer sits between all consumers (Mastra agents, Web UI, Terminal clients) and the PostgreSQL database. It also owns the connection to external systems (Asana, Google Docs, Grain, Email). No consumer talks to the database or external services directly -- everything routes through this API.

### Design Principles (api-prd.md)
- **Single point of integration.** Mastra, the UI, and terminal clients all call the same API. No direct database or external service access.
- **Business logic lives here.** "Can this user approve tasks for this client?" "Which Asana workspace does this task route to?" -- all answered by the API, not the consumer.
- **External systems are abstracted.** The API exposes actions like "push task" and "generate doc." The consumer doesn't know or care that Asana or Google Docs is behind it.
- **Stateless.** Auth token on every request. No server-side sessions.

### Authentication & Authorization (api-prd.md)
Authentication is fully delegated to the Auth Service. The API is a relying party -- it validates tokens but never issues them.

**Token Validation:**
1. Every request includes an access token: `Authorization: Bearer <token>`.
2. API validates the token signature against the auth service's JWKS (`/.well-known/jwks.json`).
3. API extracts the `sub` claim (user ID) from the token.
4. API looks up the user's product-level permissions from its own database (`auth_user_id` -> roles, client access).
5. If the token is expired or invalid -> `401 Unauthorized`.

**Permission Model (Product-Level):**

| Role | Capabilities |
|---|---|
| Admin | Everything. Manage workspaces, users, and system config. |
| Account Manager | Full CRUD on their assigned clients. Approve tasks, finalize agendas, trigger workflows. |
| Team Member | Read access to assigned clients. Edit agendas (collaborative). Cannot approve or push. |

### Error Handling (api-prd.md)
Standard error response format:
```json
{
  "error": {
    "code": "TASK_NOT_APPROVABLE",
    "message": "Task is in 'draft' status and must be reviewed before approval.",
    "details": {
      "task_id": "abc-123",
      "current_status": "rejected"
    }
  }
}
```

Common error codes:

| Code | HTTP Status | Description |
|---|---|---|
| UNAUTHORIZED | 401 | Invalid or expired token |
| FORBIDDEN | 403 | User lacks permission for this action |
| CLIENT_NOT_FOUND | 404 | Client ID doesn't exist or user can't access it |
| TASK_NOT_APPROVABLE | 422 | Task status doesn't allow approval |
| AGENDA_NOT_FINALIZABLE | 422 | Agenda hasn't been reviewed |
| PUSH_FAILED | 502 | External service (Asana, Google Docs) returned an error |
| WORKSPACE_NOT_CONFIGURED | 422 | No Asana workspace set for this task or client |

### Token Validation Detail (auth-prd.md)
The auth service exposes `/.well-known/jwks.json` for token verification. The API validates token signatures against this JWKS endpoint. Tokens contain `sub` (user ID), `iss` (auth service URL), `aud` (target audience), `email`, and `name` claims.

**Service-to-Service Auth (Mastra):**
- Mastra authenticates using the OIDC client credentials flow with its own `client_id` and `client_secret`.
- The API validates Mastra's access token the same way it validates user tokens.

## Scope

### In Scope
- Express or Fastify application setup at `apps/api/`
- Middleware chain:
  - OIDC token validation middleware (using `auth-client` package from feature 06) that validates JWT signatures against the auth service JWKS endpoint
  - Permission lookup middleware that maps `sub` claim to product-level roles from the product database
  - Request validation middleware (schema validation for request bodies/params)
  - Standard error handling middleware producing the `{ error: { code, message, details } }` response format
- Health check endpoint (`GET /health` or equivalent)
- Database connection setup (PostgreSQL via connection pool, using the schema from feature 04)
- Standard HTTP response helpers (success, error, pagination)
- CORS configuration
- Request logging
- Graceful shutdown handling

### Out of Scope
- Business endpoints (clients, tasks, transcripts, agendas) -- those are features 09-16
- External service adapters (Asana, Google Docs, Grain, Email) -- those are features 12, 15, 16, 37
- WebSocket support (open question in PRD)
- Rate limiting implementation (open question in PRD; stub/placeholder acceptable)
- Workflow triggering endpoints

## Key Decisions
- The API is stateless -- auth token on every request, no server-side sessions
- The API never issues tokens; it only validates them (relying party pattern)
- Product-level permissions (roles, client access) are stored in the product database, not the auth database
- The auth service knows "who you are"; the API knows "what you can do in this product"
- Mastra service-to-service tokens are validated identically to user tokens
- Error responses use a consistent `{ error: { code, message, details } }` envelope
- Tech stack is open (Express vs. Fastify) per api-prd.md open questions
