# Feature Requirement Document
# Feature 06: Auth Client Package (`packages/auth-client`)

**Phase:** Phase 1 — Foundation (Wave 2 of spec generation)
**Date:** 2026-03-03
**Status:** Draft

---

## 1. Business Objectives

The iExcel automation system requires a single, centralized OIDC client library that every consumer — the REST API, the Next.js UI, the terminal CLI tools, and the Mastra agent runtime — can import to handle authentication and token management uniformly.

Without this package:
- Each consumer would independently implement token validation, JWKS fetching, PKCE flows, device polling, and refresh logic. This leads to inconsistent security posture, duplicated code, and divergent bug fixes.
- A single change in the auth service's token format or JWKS rotation strategy would require coordinated changes across four separate applications with no shared abstraction.
- Consumers on the critical path (the API) would have no validated, tested utility for JWT verification before they can serve any authenticated request.

The `auth-client` package eliminates this duplication and provides a consistent, auditable security boundary across the entire ecosystem.

---

## 2. Target Users / Consumers

This is a **developer-facing library package**, not an end-user feature. Its consumers are:

| Consumer | Primary Use |
|---|---|
| `apps/api` | Token validation middleware — verify every incoming Bearer token |
| `apps/ui` | Authorization code flow + PKCE — build authorize URL, handle callback, refresh tokens |
| `apps/mastra` | Client credentials flow — obtain and auto-refresh service-to-service tokens |
| Terminal tools (Claude Code, Claw) | Device authorization flow — initiate device login, poll, store tokens to disk |

---

## 3. Value Proposition

| Concern | Without auth-client | With auth-client |
|---|---|---|
| Token validation | Each app fetches JWKS independently, no caching | Shared JWKS cache with TTL, forced refresh on key-not-found |
| Authorization code flow | UI implements PKCE manually | Validated helper functions: buildAuthorizeUrl, handleCallback |
| Device flow | Terminal duplicates polling logic | RFC 8628-compliant poller with `slow_down` and `authorization_pending` handling |
| Client credentials | Mastra manages its own token lifecycle | Auto-refresh client with expiry tracking |
| Discovery | Each app hardcodes endpoint URLs | Auto-configured from `/.well-known/openid-configuration` |
| Type safety | Ad-hoc types per app | Shared TypeScript interfaces for all OIDC constructs |

---

## 4. Relationship to Feature 05 (Auth Service)

The `auth-client` is the **client-side complement** to the auth service:

- The auth service (feature 05) exposes OIDC endpoints: `/authorize`, `/token`, `/device/authorize`, `/device/token`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`.
- The auth-client (this feature) consumes those endpoints from within each application process.
- Token validation depends on the auth service's JWKS endpoint being live. For local development and testing, the JWKS URL is configurable so tests can target a mock or a locally-running auth service.

---

## 5. Success Metrics / KPIs

| Metric | Target |
|---|---|
| JWKS fetch rate reduction | Less than 1 JWKS fetch per 5-minute window per process (TTL caching) |
| Token validation latency | Sub-millisecond on cache hit (JWKS cached in-process) |
| Zero cross-consumer duplication | No OIDC-specific logic in `apps/api`, `apps/ui`, `apps/mastra`, or terminal code outside this package |
| Test coverage | Greater than 90% unit test coverage across all modules |
| RFC compliance | Device flow correctly handles all RFC 8628 error codes without retry storms |
| Build impact | Changes to `auth-client` correctly trigger rebuilds of `api`, `ui`, and `mastra` in Nx |

---

## 6. Business Constraints

- **No standalone runtime.** The package runs as a library inside each consumer process. It never runs as a standalone service.
- **No UI components.** This package is pure TypeScript logic — no React components, no HTML rendering.
- **Nx-managed lifecycle.** The package participates in the Nx dependency graph. Any consumer that imports it will be rebuilt when it changes. The `project.json` must be correctly configured.
- **Auth service is external.** The auth-client cannot control what the auth service does. It must handle auth service errors gracefully (e.g., JWKS endpoint temporarily unavailable — fall back to cached keys; token endpoint errors — surface typed error responses).
- **Security-first.** This package is on the security critical path. All token validation logic must be reviewed with security in mind. No shortcuts that weaken JWT validation (e.g., skipping audience or issuer checks).

---

## 7. Integration with the Product Roadmap

| Downstream Feature | Dependency on auth-client |
|---|---|
| 07 — API Scaffolding | Imports `validateToken()` to build the auth middleware |
| 24 — UI Auth Flow | Imports `buildAuthorizeUrl()`, `handleAuthCallback()`, `refreshAccessToken()` |
| 32 — Terminal Device Auth | Imports `initiateDeviceFlow()`, `pollDeviceToken()`, `loadTokensFromDisk()`, `saveTokensToDisk()` |
| 18 — Mastra Runtime Setup | Imports `getClientCredentialsToken()` for service-to-service auth |

This package is on the **critical path**: it blocks four downstream features. It must be complete and tested before those features can proceed.

---

## 8. Out of Scope

- The auth service itself (feature 05)
- Express/Fastify middleware wrapping — the API (feature 07) wraps `validateToken()` in framework-specific middleware
- UI login page, redirect handling in the browser — feature 24 builds the page using auth-client helpers
- Terminal login command CLI interface — feature 32 calls auth-client functions; the CLI scaffolding is separate
- Product-level permission checking — auth-client extracts `sub`, `email`, `name`; permission mapping stays in the API
- Session management beyond token storage — no concept of "session" in this library
