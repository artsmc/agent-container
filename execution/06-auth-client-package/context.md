# Feature 06: Auth Client Package

## Summary
Create packages/auth-client/ with OIDC client helpers. Token validation (JWKS verification), token refresh, device flow helpers, authorization code flow helpers. Consumed by API (validation), UI (auth code flow), terminal (device flow), and Mastra (client credentials).

## Phase
Phase 1 — Foundation

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding), 05 (Auth Service — the auth-client validates tokens against the auth service's JWKS endpoint)
- **Blocks**: 07 (API Scaffolding — needs token validation middleware), 24 (UI Auth Flow — needs auth code flow helpers), 32 (Terminal Device Auth — needs device flow helpers), 18 (Mastra Runtime Setup — needs client credentials helpers)

## Source PRDs
- auth-prd.md (OIDC flows, token contents)
- infra-prd.md (auth-client package in Nx structure)

## Relevant PRD Extracts

### Package Structure (infra-prd.md)

```
packages/
  └── auth-client/
      ├── src/              # Used by API (validation), UI (auth code flow), terminal (device flow)
      └── project.json
```

### Nx Dependency Graph (infra-prd.md)

- `auth-client` is consumed by `api`, `ui`, `mastra`, and terminal clients.
- Changes to `auth-client` trigger rebuilds and deploys of `api + ui + mastra` containers.

### What Triggers What (infra-prd.md)

| Changed | Builds | Deploys |
|---|---|---|
| `packages/auth-client/` | api, ui, mastra | api + ui + mastra containers |

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

**Auth-client responsibility:** Build the authorization URL, handle the callback (exchange code for tokens), manage token storage/renewal.

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

**Auth-client responsibility:** Initiate device flow, poll for completion, store tokens to disk, load tokens on subsequent runs.

#### Client Credentials Flow (Service-to-Service)

```
1. Mastra sends: POST /token with client_id + client_secret
2. Auth service validates credentials
3. Auth service issues access token (no user context — this is a service identity)
4. Mastra includes token on all API calls
```

**Auth-client responsibility:** Exchange client credentials for token, handle token refresh/re-fetch on expiry.

### Token Validation (auth-prd.md, api-prd.md)

From api-prd.md — Token Validation:
1. Every request includes an access token: `Authorization: Bearer <token>`.
2. API validates the token signature against the auth service's JWKS (`/.well-known/jwks.json`).
3. API extracts the `sub` claim (user ID) from the token.
4. API looks up the user's product-level permissions from its own database.
5. If the token is expired or invalid -> `401 Unauthorized`.

**Auth-client responsibility:** Fetch and cache JWKS, verify token signature, validate claims (iss, aud, exp), extract user identity from token.

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

### OIDC Discovery (auth-prd.md)

The auth service exposes `/.well-known/openid-configuration` which provides:
- issuer URL
- authorization_endpoint
- token_endpoint
- device_authorization_endpoint
- userinfo_endpoint
- jwks_uri
- supported grant types
- supported scopes

**Auth-client responsibility:** Fetch discovery document to auto-configure endpoints. Cache it.

### Token Storage by Consumer (auth-prd.md)

| Consumer | Storage Location | Token Type |
|---|---|---|
| Web UI | httpOnly cookie or in-memory | Access + refresh tokens |
| Claude Code | `~/.iexcel/auth/tokens.json` | Access + refresh tokens |
| Claw | Equivalent config directory | Access + refresh tokens |
| Mastra | Environment variable / secret manager | Client credentials token |
| Future CLI tools | `~/.iexcel/auth/tokens.json` (shared) | Access + refresh tokens |

**Key insight:** Terminal tools share the same token store (`~/.iexcel/auth/`). Log in once from any terminal tool, and every other tool on that machine picks up the same session.

### Container — Auth Service Connection Details (infra-prd.md)

| Property | Value |
|---|---|
| **Port** | 8090 |
| **Public endpoints** | `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/authorize`, `/token`, `/device`, `/device/authorize`, `/device/token` |

API container environment variables relevant to auth-client:
- `AUTH_ISSUER_URL` — the auth service's issuer URL
- `AUTH_JWKS_URL` — the auth service's JWKS endpoint

## Scope

### In Scope
- **Token validation module** — Fetch JWKS from auth service, verify JWT signatures, validate standard claims (iss, aud, exp, iat), extract user identity (sub, email, name). Cache JWKS with TTL-based refresh.
- **Token refresh module** — Use refresh token to obtain new access token. Handle refresh token rotation if the auth service implements it.
- **Authorization code flow helpers** — Build authorize URL with correct parameters (client_id, redirect_uri, scope, state, PKCE code_challenge). Handle callback: exchange authorization code for tokens.
- **Device flow helpers** — Initiate device authorization (POST /device/authorize). Poll for token (POST /device/token) with proper interval and backoff. Handle pending/slow_down/expired responses per RFC 8628.
- **Client credentials helpers** — Exchange client_id + client_secret for access token. Auto-refresh on expiry.
- **Token storage utilities** — Read/write tokens to `~/.iexcel/auth/tokens.json` for terminal clients. In-memory token management for server-side consumers.
- **OIDC discovery client** — Fetch and cache `/.well-known/openid-configuration`. Auto-configure all endpoint URLs from the discovery document.
- **TypeScript types** — Interfaces for token payloads, JWKS responses, discovery documents, flow parameters (these may import from shared-types or be defined locally).

### Out of Scope
- The auth service itself — that is feature 05
- Express/Fastify middleware for API token validation — the auth-client provides the validation function; the API (feature 07) wraps it in middleware
- UI login page implementation — that is feature 24 (which uses auth-client helpers)
- Terminal login command implementation — that is feature 32 (which uses auth-client helpers)
- Product-level permission checking — the auth-client extracts user identity; the API maps identity to permissions

## Key Decisions
- The auth-client is a **library package**, not a service. It runs inside each consumer's process (API server, UI server, terminal client, Mastra runtime).
- JWKS caching is critical for performance — the auth-client should not fetch JWKS on every request. Use a TTL-based cache (e.g., refresh every 5-15 minutes) with forced refresh on key-not-found errors (to handle key rotation).
- The auth-client should be **OIDC-discovery-first**: given an issuer URL, it auto-discovers all endpoints from `/.well-known/openid-configuration`. This avoids hardcoding endpoint paths.
- PKCE (Proof Key for Code Exchange) should be used for the authorization code flow since the UI is a public client.
- Device flow polling should follow RFC 8628 — respect the `interval` parameter, handle `authorization_pending` and `slow_down` responses gracefully.
- The library should export separate entry points or modules for each flow, so consumers only import what they need (e.g., API only needs validation, terminal only needs device flow).
