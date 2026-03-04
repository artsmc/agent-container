# Feature Requirement Document
# Feature 07: API Scaffolding (`apps/api`)

**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03
**Status:** Spec Complete

---

## 1. Overview

Feature 07 establishes the REST API application at `apps/api/` in the Nx monorepo. This is a pure infrastructure feature — no business endpoints are created here. The output is a fully operational server process that all subsequent API features (08–16, 22) build on top of.

The API is the **single integration point** for every consumer in the iExcel system: the Web UI, Mastra agents, and terminal clients (Claude Code, Claw). Nothing talks to the PostgreSQL database or external services (Asana, Google Docs, Grain, Email) directly — everything routes through this layer.

---

## 2. Business Objectives

### 2.1 Primary Objective

Provide a hardened, production-ready server foundation that enforces authentication, authorization, validation, and error formatting consistently across all API endpoints — before any business logic is written.

### 2.2 Value Proposition

Without this foundation:
- Each subsequent feature (09–16) would implement its own token validation, permission checks, and error formatting — duplicating logic and creating inconsistencies.
- Business features would ship with unguarded endpoints or inconsistent error shapes.
- Integration between the API and the auth service would be done ad hoc per endpoint.

By solving the infrastructure once in Feature 07, every downstream feature inherits:
- Validated identity on every request (`req.user.sub`, `req.user.role`, `req.user.clientIds`)
- A consistent `{ error: { code, message, details } }` response envelope
- A working database connection pool
- Request validation with schema enforcement

### 2.3 Architectural Position

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Web UI  │  │ Terminal  │  │  Mastra  │
└────┬─────┘  └────┬──────┘  └────┬─────┘
     └─────────────┼──────────────┘
                   │  Bearer <token>
                   ▼
          ┌────────────────┐
          │   apps/api      │  ← Feature 07 builds this
          │                │
          │  [token valid] │
          │  [user loaded] │
          │  [body valid]  │
          │  [err format]  │
          └───┬────────────┘
              │
              ▼
       ┌──────────────┐
       │  PostgreSQL  │
       │  (Feature 04)│
       └──────────────┘
```

---

## 3. Target Users / Consumers

This feature has no end users in the UI sense. Its consumers are:

| Consumer | How They Interact |
|---|---|
| **Feature 09 developer** (client management) | Registers routes on the scaffold; relies on auth middleware already running |
| **Feature 08 developer** (input normalizer) | Adds route handlers; error middleware formats their thrown errors |
| **All API feature developers (10–16)** | Same pattern — routes register into the scaffolded app |
| **Mastra agents** | Send Bearer tokens via client credentials; get validated sub/claims back |
| **Web UI** | Sends Bearer tokens from OIDC auth code flow; gets permission context from `/me` |
| **Terminal clients** | Send Bearer tokens from device flow; interact identically to UI |

---

## 4. Success Metrics / Acceptance Criteria

The feature is complete when:

1. `GET /health` returns `200 OK` with a JSON body containing at minimum `{ "status": "ok" }`.
2. A request with a valid JWT to any authenticated route resolves `req.user` with `sub`, `email`, `name`, `role`, and accessible client IDs.
3. A request with an expired or invalid JWT returns `401` with `{ "error": { "code": "UNAUTHORIZED", ... } }`.
4. A request to an authenticated route by a user without the required role returns `403` with `{ "error": { "code": "FORBIDDEN", ... } }`.
5. A request body that fails schema validation returns `400` with `{ "error": { "code": "VALIDATION_ERROR", ... } }`.
6. An unhandled exception in any route handler is caught by the error middleware and returned as a `500` with the standard error envelope (no raw stack traces in production).
7. The server connects to PostgreSQL on startup; if the connection fails, the process exits with a non-zero code.
8. The server handles `SIGTERM` gracefully: stops accepting new connections, waits for in-flight requests (max 10 seconds), then exits cleanly.
9. `GET /me` returns the authenticated user's product profile and roles for a valid token.
10. All middleware is exercised by the integration test suite without a live auth service (using mocked JWKS).

---

## 5. Business Constraints

### 5.1 Relying Party Only

The API **never issues tokens**. It validates tokens issued by the Auth Service (`apps/auth`, Feature 05). This is a hard architectural constraint — adding token issuance to this service is out of scope permanently.

### 5.2 Stateless

No server-side sessions. Every request is authenticated via the `Authorization: Bearer <token>` header. This enables horizontal scaling without sticky sessions.

### 5.3 Single Permission Model

Product-level permissions (roles, client access) are resolved from the product database (Feature 04), not from the token claims. The token proves identity; the database provides authorization context.

### 5.4 Service-to-Service Parity

Mastra's client credentials tokens are validated identically to user tokens. No special bypass or trust elevation for service accounts.

---

## 6. Dependencies

| Dependency | Feature | What It Provides |
|---|---|---|
| Nx monorepo scaffolding | 00 | `apps/api/` project, TypeScript config, Nx targets |
| Product database schema | 04 | `users` table with `auth_user_id` and `role`; migration tooling decision |
| Auth client package | 06 | `@iexcel/auth-client/validation` — `createTokenValidator`, `validateToken` |

---

## 7. What This Feature Does NOT Include

- Business endpoints (clients, tasks, transcripts, agendas) — Features 09–16
- External service adapters (Asana, Google Docs, Grain, Email) — Features 12, 15, 16, 37
- WebSocket support — open question in PRD; deferred
- Rate limiting implementation — open question in PRD; stub placeholder only
- Workflow triggering endpoints — Feature 17
- The `@iexcel/api-client` package — Feature 22
- Database migration execution — Feature 04 owns migration files; Feature 07 runs them on startup

---

## 8. Integration with Product Roadmap

Feature 07 is the **second biggest blocker** in the entire roadmap after Feature 00. Nine features depend directly on it:

- 08 (input-normalizer-text)
- 09 (client-management)
- 10 (transcript-endpoints)
- 11 (task-endpoints)
- 12 (output-normalizer-asana)
- 14 (agenda-endpoints)
- 15 (google-docs-adapter)
- 16 (email-adapter)
- 22 (api-client-package)

Until Feature 07 is merged, none of these can begin. This feature is on the critical path:

```
00 → 01 → 04 → 07 → 11 → 12 → 13 → 14 → 17 → 19/20 → 21 → 33
          ↑
     06 ──┘
```

---

## 9. Open Questions Carried from PRDs

| Question | Impact on This Feature | Status |
|---|---|---|
| Express vs Fastify vs FastAPI? | Determines server framework, middleware pattern | Decided in TR.md (Express/Fastify — see TR) |
| ORM choice: Drizzle vs Prisma vs raw? | Feature 04 deferred to Feature 07 team | Decided in TR.md |
| Rate limiting strategy? | Stub acceptable; full implementation deferred | Stub with TODO in middleware chain |
| WebSocket support? | Out of scope for Feature 07 | Deferred |
