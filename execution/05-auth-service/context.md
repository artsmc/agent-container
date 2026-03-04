# Feature 05: Auth Service

## Summary
Build the OIDC provider service at apps/auth/. Implements authorization code flow (web), device authorization flow (terminal), client credentials flow (service-to-service). Connects to external IdP. Issues tokens with standard claims. Exposes OIDC discovery, JWKS, admin endpoints for client management.

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding), 03 (Auth Database Schema — needs auth tables for users, clients, tokens, sessions)
- **Blocks**: 06 (Auth Client Package — needs the auth service running to validate tokens against), 24 (UI Auth Flow), 32 (Terminal Device Auth)

## Source PRDs
- auth-prd.md (all OIDC flows, endpoints, token structure, admin API)

## Relevant PRD Extracts

### Overview (auth-prd.md)

A standalone OIDC (OpenID Connect) provider that serves as the centralized identity layer for all iExcel applications — current and future. The auth service connects to an external Identity Provider (IdP) for SSO, issues tokens that work across every app in the ecosystem, and manages OIDC client registrations so new applications can be onboarded without touching the auth service's code.

This is a **platform service**, not a product-specific service. It lives in the monorepo but is designed to be used by any application iExcel builds, inside or outside this repo.

### Design Principles (auth-prd.md)

- **Platform-level, not product-level.** The auth service doesn't know what a "task" or "agenda" is. It knows users, roles, and OIDC clients. Product-specific permissions stay in the product's API.
- **Standards-based.** OIDC and OAuth 2.0 — no custom auth protocols.
- **Self-service client registration.** Admins can register new OIDC clients and generate client secrets through the admin UI or API. No code changes required.
- **IdP-backed.** The auth service federates to an external IdP (Google Workspace, Okta, Azure AD, etc.) for actual identity verification. It doesn't store passwords.
- **Separate data.** User identity data lives in its own schema/database, completely isolated from business data.

### OIDC Flows (auth-prd.md)

#### Authorization Code Flow (Web UI)

```
1. User clicks "Login" in the UI
2. UI redirects to Auth service: /authorize?client_id=ui&redirect_uri=...&scope=openid profile email
3. Auth service redirects to IdP (Google/Okta) for authentication
4. IdP authenticates user, redirects back to Auth service with code
5. Auth service exchanges code with IdP, verifies identity
6. Auth service issues its own tokens:
   - ID token (who the user is)
   - Access token (what they can do)
   - Refresh token (for silent renewal)
7. Auth service redirects back to UI with authorization code
8. UI exchanges code for tokens via back-channel
9. User is logged in
```

#### Device Authorization Flow (Terminal / CLI)

```
1. Terminal client calls: POST /device/authorize
2. Auth service returns:
   - device_code (for polling)
   - user_code (short code like "ABCD-1234")
   - verification_uri (URL to visit)
3. Terminal displays: "Visit https://auth.iexcel.com/device and enter code ABCD-1234"
4. User opens browser, enters code, authenticates via IdP
5. Terminal polls: POST /device/token with device_code
6. Once user completes auth, poll returns tokens
7. Terminal stores tokens locally (~/.iexcel/auth or equivalent)
8. All subsequent requests include the access token
```

#### Client Credentials Flow (Service-to-Service)

```
1. Mastra sends: POST /token with client_id + client_secret
2. Auth service validates credentials
3. Auth service issues access token (no user context — this is a service identity)
4. Mastra includes token on all API calls
```

### OIDC Client Management (auth-prd.md)

#### Client Registration Fields

| Field | Description |
|---|---|
| `client_id` | Unique identifier for the app (e.g., `iexcel-ui`, `iexcel-terminal`, `mastra-agent`) |
| `client_name` | Display name (e.g., "iExcel Web App") |
| `client_secret` | Generated secret for confidential clients. Not issued for public clients. |
| `grant_types` | Allowed flows: `authorization_code`, `device_code`, `client_credentials`, `refresh_token` |
| `redirect_uris` | Allowed callback URLs (for authorization code flow) |
| `scopes` | Allowed scopes: `openid`, `profile`, `email`, custom scopes |
| `token_lifetime` | Access token TTL (default: 1 hour) |
| `refresh_token_lifetime` | Refresh token TTL (default: 30 days) |

#### Pre-Registered Clients

| Client ID | Type | Grant Types | Description |
|---|---|---|---|
| `iexcel-ui` | Public | `authorization_code`, `refresh_token` | Web UI — browser-based SSO |
| `iexcel-terminal` | Public | `device_code`, `refresh_token` | Claude Code / Claw — CLI login |
| `mastra-agent` | Confidential | `client_credentials` | Mastra service-to-service |
| `iexcel-api` | Resource server | (validates tokens, doesn't request them) | API layer — token audience |

### Token Contents — ID Token Claims (auth-prd.md)

```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "user-uuid-here",
  "aud": "iexcel-api",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "iat": 1709136000,
  "exp": 1709139600
}
```

### Endpoints (auth-prd.md)

#### OIDC Standard Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/authorize` | GET | OIDC authorization endpoint |
| `/token` | POST | Token endpoint (all grant types) |
| `/device/authorize` | POST | Device flow initiation |
| `/device` | GET | Device flow user verification page |
| `/device/token` | POST | Device flow token polling |
| `/userinfo` | GET | OIDC userinfo endpoint |
| `/.well-known/openid-configuration` | GET | OIDC discovery document |
| `/.well-known/jwks.json` | GET | JSON Web Key Set for token verification |

#### Admin API

| Endpoint | Method | Description |
|---|---|---|
| `/admin/clients` | GET | List all registered OIDC clients |
| `/admin/clients` | POST | Register a new OIDC client. Returns `client_id` and `client_secret`. |
| `/admin/clients/{id}` | GET | Get client details |
| `/admin/clients/{id}` | PATCH | Update client config (redirect URIs, scopes, etc.) |
| `/admin/clients/{id}` | DELETE | Deactivate a client |
| `/admin/clients/{id}/rotate-secret` | POST | Generate a new client secret (invalidates old one) |
| `/admin/users` | GET | List all users |
| `/admin/users/{id}` | GET | Get user details (login history, active sessions, linked clients) |
| `/admin/users/{id}/deactivate` | POST | Deactivate a user across all apps |
| `/admin/users/{id}/sessions` | DELETE | Revoke all active sessions (force re-login everywhere) |

### Container Specification (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (or depends on OIDC provider choice — Ory Hydra is Go, Keycloak is Java) |
| **Port** | 8090 |
| **Health check** | `GET /health` |
| **Environment variables** | `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_*` (all from secret manager) |
| **Scaling** | Horizontal — based on request count / CPU. Critical path — all login flows go through here. |
| **Persistent storage** | None — stateless. Sessions and tokens in auth Postgres. |
| **Public endpoints** | `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/authorize`, `/token`, `/device`, `/device/authorize`, `/device/token` |

### Unified Token Across the Ecosystem (auth-prd.md)

| Scenario | How It Works |
|---|---|
| **UI login** | Authorization code flow -> token stored in browser (httpOnly cookie or secure storage) |
| **Terminal login** | Device flow -> token stored at `~/.iexcel/auth` -> attached to all MCP/API requests |
| **Mastra service calls** | Client credentials -> token attached to all API calls |
| **New app (future)** | Register as OIDC client -> users log in with existing SSO -> same `sub` claim |
| **Cross-app navigation** | User is already authenticated -> SSO session avoids re-login |
| **Access revocation** | Deactivate user in auth admin -> tokens rejected everywhere immediately |

### Token Storage by Consumer (auth-prd.md)

| Consumer | Storage Location | Token Type |
|---|---|---|
| Web UI | httpOnly cookie or in-memory | Access + refresh tokens |
| Claude Code | `~/.iexcel/auth/tokens.json` | Access + refresh tokens |
| Claw | Equivalent config directory | Access + refresh tokens |
| Mastra | Environment variable / secret manager | Client credentials token |
| Future CLI tools | `~/.iexcel/auth/tokens.json` (shared) | Access + refresh tokens |

**Key insight:** Terminal tools share the same token store (`~/.iexcel/auth/`). Log in once from any terminal tool, and every other tool on that machine picks up the same session.

## Scope

### In Scope
- OIDC authorization code flow implementation (for web UI)
- Device authorization flow implementation (for terminal/CLI)
- Client credentials flow implementation (for service-to-service)
- Refresh token grant implementation
- Token issuance (ID tokens, access tokens, refresh tokens) with JWT signing
- OIDC discovery endpoint (`/.well-known/openid-configuration`)
- JWKS endpoint (`/.well-known/jwks.json`)
- Userinfo endpoint (`/userinfo`)
- External IdP integration (redirect to Google/Okta for authentication, exchange codes, verify identity)
- User creation/update on login (upsert from IdP claims into auth database)
- Session management (create, validate, destroy)
- Admin API for OIDC client management (CRUD, secret rotation)
- Admin API for user management (list, deactivate, session revocation)
- Health check endpoint (`GET /health`)
- Device flow verification page (`GET /device` — renders the code entry form)

### Out of Scope
- Product-level authorization (roles, client access) — that stays in the API layer
- Auth client library — that is feature 06
- UI login screens (the auth service provides the device verification page, but the main login UI redirect is feature 24)
- Terraform provisioning of the auth container — that is feature 36
- Dockerfile — that is feature 35
- Password storage — the auth service delegates to the external IdP

## Key Decisions
- The auth service is an **OIDC provider**, not just an OAuth client. It issues its own tokens (with its own signing keys) after verifying identity via the external IdP. Consumers validate tokens against the auth service's JWKS, not the IdP's.
- The auth service is **stateless** in terms of process memory. All sessions, tokens, and user data are persisted in the auth Postgres database (feature 03).
- Token signing uses asymmetric keys (RSA or ECDSA — open question). The private key signs tokens, the public key is published via JWKS for any consumer to verify.
- The `sub` claim in issued tokens is the auth database's `users.id` (UUID), which is the cross-system user identifier.
- The admin API should be protected — only users with admin privileges (or a specific admin scope) can access `/admin/*` endpoints.
- Build vs. buy is an open question: the service could be built from scratch, use Ory Hydra (Go), Keycloak (Java), or a Node.js OIDC library. The PRD is implementation-agnostic.
