# Feature Requirement Document
# Feature 22: API Client Package (`packages/api-client`)

**Date:** 2026-03-03
**Phase:** 5 — API Client
**Status:** Pending

---

## 1. Business Objective

The iExcel automation system has three distinct consumers of its REST API: the Web UI, the Mastra agent runtime, and the terminal MCP tools (Claude Code / Claw). Without a shared client library, each consumer would need to independently:

- Implement HTTP transport logic
- Attach authentication tokens to requests
- Handle token expiry and refresh
- Parse and type API responses
- Handle structured error responses

This creates three parallel maintenance burdens, inconsistent error handling, and the risk of type drift between what the API returns and what consumers expect.

The `api-client` package eliminates this duplication. It is the single, authoritative TypeScript client for the iExcel API — fully typed, auth-aware, and shared across all three consumer contexts.

---

## 2. Problem Statement

Without a shared API client:

- Each consumer reimplements HTTP boilerplate independently.
- Token attachment logic diverges across UI, Mastra, and terminal, making security audits harder.
- When API contracts change, three codebases must be updated rather than one.
- Response types are duplicated or become inconsistent with `packages/shared-types`.
- New engineers must learn each consumer's bespoke API integration patterns.

The `api-client` package centralises all of this into one auditable, typed, testable library.

---

## 3. Value Proposition

| Stakeholder | Value |
|---|---|
| **UI engineers** | Import typed methods — no manual fetch calls, no `as any` casts, no token management |
| **Mastra agent authors** | Same typed client, different token provider — consistent ergonomics across consumer contexts |
| **Terminal tool authors** | File-based token injection works out of the box via the token provider interface |
| **Platform team** | One place to audit token handling, error mapping, and API contract compliance |
| **Product team** | API contract changes propagate to all consumers via a single package update |

---

## 4. Target Users and Consumer Contexts

This package is not a user-facing feature. Its consumers are internal development teams and the runtimes they build:

### 4.1 Web UI (`apps/ui`)
- Runs in a Node.js/Next.js server context
- Access tokens stored in httpOnly cookies or in-memory
- Token provider reads from cookie/memory at request time
- Refresh tokens used to renew access tokens before expiry

### 4.2 Mastra Agent Runtime (`apps/mastra`)
- Runs in a Node.js container
- Authenticates via OIDC client credentials flow (service-to-service)
- Token provider reads from environment variable or secret manager
- No user-facing refresh flow — client credentials are re-fetched on expiry

### 4.3 Terminal MCP Tools (Claude Code / Claw)
- Runs on developer machines
- Access tokens stored in `~/.iexcel/auth/tokens.json` (managed by `packages/auth-client`)
- Token provider reads from file system
- Refresh tokens used to renew access tokens interactively

---

## 5. Fit Within the Larger System

The `api-client` sits in Phase 5 of the iExcel build sequence, between the API implementation (features 07-17) and the consumer layers (UI features 23-31, terminal features 32-33).

### 5.1 Dependency Position

```
packages/shared-types (Feature 01)
         │
         ▼
packages/api-client (Feature 22) ← this feature
         │
    ┌────┴────┐
    ▼         ▼
apps/ui   apps/mastra   (terminal MCP tools)
```

- **Blocked by**: Feature 00 (Nx monorepo scaffolding), Feature 01 (shared-types), Feature 07 (api-scaffolding — defines the endpoints this client calls)
- **Blocks**: Features 25-31 (all UI screens), Feature 33 (terminal MCP tools)

### 5.2 CI/CD Impact

A change to `packages/api-client/` triggers builds and deploys for `apps/ui` and `apps/mastra`. This is intentional — both containers bundle the client at build time.

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| All API endpoints covered | 100% — every endpoint in the API PRD has a typed method |
| Type coverage | No `any` types in the public API surface |
| Test coverage | Minimum 90% line/branch coverage |
| Consumer adoption | UI, Mastra, and terminal tools all import exclusively from this package — no raw fetch calls |
| Error mapping | Every `ApiErrorCode` from `shared-types` is handled and surfaced as a typed error |
| Token provider interface | All three consumer token strategies work without modifying the client core |

---

## 7. Business Constraints

- The package is a **library, not an app**. It does not run independently, has no Dockerfile, and is never deployed as a container.
- It has no knowledge of where tokens come from — the token provider interface abstracts this entirely.
- It must not contain business logic. It translates consumer intent into HTTP calls and translates HTTP responses into typed objects. All business rules are enforced by the API itself.
- It must not duplicate types from `packages/shared-types`. Every request and response type is imported, not redefined.
- It must support the `/shared/{token}` public endpoint without requiring token attachment.

---

## 8. Integration with Product Roadmap

The `api-client` package is a foundational enabler for Phase 6 (Web UI) and Phase 7 (Terminal). It cannot be replaced with ad-hoc fetch calls in consumer code — the dependency graph enforces this via Nx lint rules (module boundary tags).

Once this package is complete and the first consumer (UI or terminal) is integrated, the pattern is established for all subsequent consumers. The investment in the token provider abstraction pays off immediately when Mastra (different token strategy) integrates without requiring changes to the client core.
