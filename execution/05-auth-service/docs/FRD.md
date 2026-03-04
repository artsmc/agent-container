# FRD — Feature Requirement Document
# Feature 05: Auth Service

## 1. Business Objective

Build the OIDC provider service (`apps/auth/`) that serves as the centralized identity layer for the entire iExcel ecosystem. The auth service authenticates users by delegating to an external Identity Provider, then issues its own signed OIDC tokens that every downstream application validates. All login flows — browser-based SSO, terminal device authorization, and service-to-service machine auth — converge on this single service.

This is a platform service: it has no knowledge of tasks, agendas, or clients. Its domain is users, sessions, OIDC clients, and tokens. Product-level authorization stays in the API layer.

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **End users (web UI)** | Single login via SSO (Google/Okta). No separate account per iExcel tool. Existing session carries them into every app without re-authenticating. |
| **End users (terminal)** | Login once from Claude Code or Claw. Tokens persist to `~/.iexcel/auth/tokens.json` and are shared across all terminal tools on the same machine. |
| **Mastra agent runtime** | Receives a service identity token via client credentials flow. No user interaction required. Every API call is authenticated. |
| **Development team** | New apps integrate by registering an OIDC client — no auth code to write, no new user database to build. Admin API handles client lifecycle. |
| **Operations team** | Single revocation point. Deactivating a user in the auth admin instantly invalidates their access across every integrated application. |
| **Security posture** | Passwords are never stored in iExcel systems. The external IdP handles credential verification. Token signing keys are asymmetric — private key signs, public key (JWKS) verifies. |

## 3. Problem Statement

Without the auth service:

- Each application requires its own login flow, session management, and user database.
- Terminal clients have no standard auth mechanism compatible with browser-based apps.
- Mastra cannot authenticate to the API without a shared identity scheme.
- User access revocation requires hunting across multiple systems.
- Adding a new app means building auth from scratch.

The auth service resolves all of these by being a standards-compliant OIDC provider that any application can integrate with.

## 4. Target Users

### Direct Users (Authenticated via the Auth Service)

- **iExcel team members** — log in via web UI (authorization code flow) or terminal (device flow)
- **Terminal users** — Claude Code and Claw users who authenticate once and have tokens shared across all terminal tools

### System Consumers (Integrate via OIDC Client Registration)

- **Web UI (`iexcel-ui`)** — public OIDC client, authorization code flow
- **Terminal clients (`iexcel-terminal`)** — public OIDC client, device authorization flow
- **Mastra agent (`mastra-agent`)** — confidential OIDC client, client credentials flow
- **API layer (`iexcel-api`)** — registered resource server that validates tokens but does not request them

## 5. Success Metrics

| Metric | Target |
|---|---|
| All three OIDC flows complete end-to-end (web, device, client credentials) | Zero errors on happy path for each flow |
| OIDC discovery document returns all required fields | Validates against OIDC conformance spec |
| JWKS endpoint returns current public keys | Consumers can verify tokens without contacting auth service |
| Token issued for web login can be verified by the API | Round-trip token validation succeeds |
| Token issued for terminal login stored to `~/.iexcel/auth/tokens.json` and reusable | Feature 32 (terminal device auth) can use the stored token |
| Admin API CRUD for OIDC clients works without code changes to auth service | New client registerable via API call alone |
| User deactivation immediately blocks subsequent requests | Within one token TTL (max 1 hour) |
| Health check endpoint returns `200 OK` | Load balancer can route traffic correctly |
| Auth service passes tokens to Feature 06 (auth-client package) for JWKS validation | Feature 06 integration test passes |

## 6. Business Constraints

- **Standards compliance only.** No custom auth protocols. OIDC 1.0 and OAuth 2.0 (RFC 6749, RFC 8628 for device flow).
- **No password storage.** Credential verification is fully delegated to the external IdP. The auth service stores only IdP-issued identity claims.
- **Stateless process.** The auth service process holds no state. All sessions, tokens, and user records live in the auth Postgres database (Feature 03).
- **Separate database.** The auth database (`iexcel_auth`) is completely isolated from the product database (`iexcel_product`). No cross-database foreign keys.
- **Port 8090.** The container listens on port 8090 as defined in `infra-prd.md`.
- **Blocked by Feature 03.** The auth database schema must be applied before the auth service can run. Tables `users`, `oidc_clients`, `refresh_tokens`, and `sessions` must exist.
- **Admin endpoints are protected.** Only users with admin scope or a designated admin role may call `/admin/*` endpoints.
- **Build vs buy is an open question.** This spec is implementation-agnostic. The service can be built with a Node.js OIDC library (e.g., `oidc-provider` by panva), or adapted from an existing OIDC server. The key constraint is that it must live in `apps/auth/` and satisfy the endpoint and token contracts defined here.

## 7. Integration with Product Roadmap

The auth service is on the critical path:

```
00 (monorepo) → 03 (auth-database-schema) → 05 (auth-service) → 06 (auth-client-package) → 07 (api-scaffolding) → ...
```

- **Blocked by:** Feature 00 (Nx Monorepo Scaffolding) and Feature 03 (Auth Database Schema)
- **Blocks:** Feature 06 (Auth Client Package), Feature 24 (UI Auth Flow), Feature 32 (Terminal Device Auth)

Delay to this feature cascades to the entire API layer and all downstream features. It is the most critical Wave 2 deliverable.

## 8. Scope Boundaries

### In Scope

- Authorization code flow (web UI login via IdP redirect)
- Device authorization flow (terminal/CLI login via browser code entry)
- Client credentials flow (Mastra service-to-service)
- Refresh token grant (silent renewal for all user-facing flows)
- JWT issuance: ID tokens, access tokens, refresh tokens with asymmetric signing (RSA or ECDSA)
- OIDC discovery endpoint (`/.well-known/openid-configuration`)
- JWKS endpoint (`/.well-known/jwks.json`)
- Userinfo endpoint (`/userinfo`)
- External IdP integration (redirect, code exchange, identity claim extraction)
- User upsert on login (create or update user record from IdP claims)
- Session management (create, validate, expire, destroy)
- Admin API: OIDC client CRUD and secret rotation
- Admin API: user management (list, deactivate, session revocation)
- Health check endpoint (`GET /health`)
- Device flow verification page (`GET /device` — HTML form for code entry)
- Token cleanup job (purge expired refresh tokens and sessions periodically)

### Out of Scope

- Product-level authorization (roles, client access permissions) — stays in the API layer
- Auth client library (`packages/auth-client/`) — Feature 06
- Main login UI screens — Feature 24
- Terminal login command implementation — Feature 32
- Dockerfile — Feature 35
- Terraform provisioning — Feature 36
- SCIM provisioning for automatic user sync from IdP
- Multi-tenancy or organization-level isolation
- Password storage (delegated entirely to external IdP)

## 9. Key Decisions

| Decision | Resolution |
|---|---|
| Token issuer | The auth service is a full OIDC **provider**, not just an OAuth client. It issues its own signed tokens after verifying identity through the IdP. Consumers validate against the auth service's JWKS — not the IdP's. |
| Token signing algorithm | Asymmetric key pair (RSA 2048+ or ECDSA P-256). Private key signs tokens; public key published via JWKS. Open question: RSA vs ECDSA — both are acceptable. |
| Token `sub` claim | The `users.id` UUID from the auth database. This is the cross-system user identifier. The same `sub` appears in all tokens regardless of which app the user logged into. |
| Stateless service | Zero in-process session state. The auth service reads and writes the auth Postgres database for all persistence. |
| Admin API protection | Admin endpoints (`/admin/*`) require a token with `admin` scope or a designated claim. Only super-admins can call these endpoints. |
| Build vs buy | Open. Recommended path: Node.js with `oidc-provider` (panva/node-oidc-provider) — battle-tested, OIDC conformant, actively maintained. Alternative: Ory Hydra (Go binary, more ops overhead). The spec is implementation-agnostic. |
| IdP selection | Open. Google Workspace, Okta, and Azure AD are all viable. The auth service uses the IdP's OAuth 2.0 / OIDC authorization code flow to obtain IdP tokens; the implementation is the same regardless of IdP. Configurable via environment variables. |
