# Auth Service — Product Requirements Document

## Overview

A standalone **OIDC (OpenID Connect) provider** that serves as the centralized identity layer for all iExcel applications — current and future. The auth service connects to an external **Identity Provider (IdP)** for SSO, issues tokens that work across every app in the ecosystem, and manages OIDC client registrations so new applications can be onboarded without touching the auth service's code.

This is a **platform service**, not a product-specific service. It lives in the monorepo but is designed to be used by any application iExcel builds, inside or outside this repo.

## Problem Statement

Without a centralized auth service:

- Each application implements its own login flow — inconsistent UX, duplicated code.
- Adding a new app means building auth from scratch every time.
- No SSO — users log in separately to each tool.
- Terminal clients (Claude Code, Claw) need their own auth mechanism that doesn't integrate with the web apps.
- User management is scattered across databases — no single source of truth for "who are our users and what can they access?"
- Revoking access means hunting across multiple systems.

The auth service solves all of this. One login, one token, one user directory — every app is a relying party.

---

## Design Principles

- **Platform-level, not product-level.** The auth service doesn't know what a "task" or "agenda" is. It knows users, roles, and OIDC clients. Product-specific permissions (which clients a user can access, what they can approve) stay in the product's API.
- **Standards-based.** OIDC and OAuth 2.0 — no custom auth protocols. Any app that speaks OIDC can integrate.
- **Self-service client registration.** Admins can register new OIDC clients (apps) and generate client secrets through the admin UI or API. No code changes required.
- **IdP-backed.** The auth service federates to an external IdP (Google Workspace, Okta, Azure AD, etc.) for actual identity verification. It doesn't store passwords.
- **Separate data.** User identity data lives in its own schema/database, completely isolated from business data.

---

## Architecture Position

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│  Web UI  │  │ Terminal  │  │  Mastra  │  │ Future Apps  │
└────┬─────┘  └────┬──────┘  └────┬─────┘  └──────┬───────┘
     │             │              │                │
     └─────────────┼──────────────┼────────────────┘
                   │              │
                   ▼              │
          ┌────────────────┐     │
          │  AUTH SERVICE   │     │
          │  (OIDC Provider)│     │
          │                │     │
          │ - Login/SSO    │     │
          │ - Token issue  │     │
          │ - Client mgmt  │     │
          │ - User dir     │     │
          └───┬────────┬───┘     │
              │        │         │
              ▼        │         │
     ┌────────────┐    │         │
     │  Auth DB   │    │         │
     │ (identity  │    │         │
     │  schema)   │    │         │
     └────────────┘    │         │
                       ▼         │
              ┌──────────────┐   │
              │  External    │   │
              │  IdP         │   │
              │  (Google/    │   │
              │   Okta/etc)  │   │
              └──────────────┘   │
                                 │
     Tokens issued by Auth ──────┘
     are validated by every app
```

**Key flow:** Users authenticate through the Auth service → Auth service verifies identity with the IdP → Auth service issues OIDC tokens → Tokens are accepted by API, UI, Mastra, terminal, and any future app.

---

## OIDC Flows

### Authorization Code Flow (Web UI)

Standard OIDC flow for browser-based apps.

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

### Device Authorization Flow (Terminal / CLI)

For Claude Code, Claw, and other terminal clients that can't open a browser redirect.

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

### Client Credentials Flow (Service-to-Service)

For Mastra calling the API, or any backend service calling another.

```
1. Mastra sends: POST /token with client_id + client_secret
2. Auth service validates credentials
3. Auth service issues access token (no user context — this is a service identity)
4. Mastra includes token on all API calls
```

---

## OIDC Client Management

Every application that authenticates through the auth service is an **OIDC client**. Clients are registered and managed through the admin interface.

### Client Registration

| Field | Description |
|---|---|
| `client_id` | Unique identifier for the app (e.g., `iexcel-ui`, `iexcel-terminal`, `mastra-agent`) |
| `client_name` | Display name (e.g., "iExcel Web App") |
| `client_secret` | Generated secret for confidential clients (API, Mastra). Not issued for public clients (UI, terminal). |
| `grant_types` | Allowed flows: `authorization_code`, `device_code`, `client_credentials`, `refresh_token` |
| `redirect_uris` | Allowed callback URLs (for authorization code flow) |
| `scopes` | Allowed scopes: `openid`, `profile`, `email`, custom scopes |
| `token_lifetime` | Access token TTL (default: 1 hour) |
| `refresh_token_lifetime` | Refresh token TTL (default: 30 days) |

### Pre-Registered Clients

These are created during initial deployment:

| Client ID | Type | Grant Types | Description |
|---|---|---|---|
| `iexcel-ui` | Public | `authorization_code`, `refresh_token` | Web UI — browser-based SSO |
| `iexcel-terminal` | Public | `device_code`, `refresh_token` | Claude Code / Claw — CLI login |
| `mastra-agent` | Confidential | `client_credentials` | Mastra service-to-service |
| `iexcel-api` | Resource server | (validates tokens, doesn't request them) | API layer — token audience |

### Adding New Clients

When a new app is built (inside or outside this repo):

1. Admin navigates to auth admin UI or calls the API.
2. Creates a new OIDC client with appropriate grant types and redirect URIs.
3. System generates a `client_id` and (if confidential) a `client_secret`.
4. New app configures its auth integration with those credentials.
5. Users can now log in to the new app with the same SSO session — no new accounts needed.

**No code changes to the auth service required.** Client registration is a data operation, not a deployment.

---

## Auth Database (Identity Schema)

The auth service has its own database (or a separate schema within the same Postgres instance). This is **completely isolated** from the product database ([`database-prd.md`](./database-prd.md)).

### Users

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

### OIDC Clients

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

### Refresh Tokens

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → Users |
| `client_id` | VARCHAR | Which OIDC client issued this |
| `token_hash` | VARCHAR | Hashed refresh token |
| `expires_at` | TIMESTAMP | |
| `revoked_at` | TIMESTAMP | Nullable — set when revoked |
| `created_at` | TIMESTAMP | |

### Sessions

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → Users |
| `idp_session_id` | VARCHAR | Reference to IdP session (for single logout) |
| `expires_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

---

## How Product Apps Use Auth Tokens

The auth service issues tokens. Product apps **validate** them and map the user identity to product-specific permissions.

### Token Contents (ID Token Claims)

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

### Product-Side Permission Mapping

The [API layer](./api-prd.md) maintains its own permission table that maps auth user IDs to product roles:

```
Auth service says: "This is user abc-123, mark@iexcel.com"
API layer looks up: "User abc-123 is an account_manager for clients [Total Life, Client Y]"
```

The auth service does NOT know about clients, tasks, or agendas. It only knows "this person is authenticated." Product-level authorization stays in the product.

### Cross-App Identity

Because every app validates tokens from the same issuer (`https://auth.iexcel.com`), the user's `sub` claim is consistent everywhere:

- Log in to the UI → `sub: abc-123`
- Log in via terminal → `sub: abc-123`
- Mastra agent acts on behalf of a user → carries `sub: abc-123`
- Future app built next year → same `sub: abc-123`

One identity across the entire ecosystem.

---

## Auth Admin Interface

### Endpoints

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

### Admin API

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

---

## Unified Token Across the Ecosystem

The auth service's tokens are the **universal credential** for all iExcel apps:

| Scenario | How It Works |
|---|---|
| **UI login** | Authorization code flow → token stored in browser (httpOnly cookie or secure storage) |
| **Terminal login** | Device flow → token stored at `~/.iexcel/auth` → attached to all MCP/API requests |
| **Mastra service calls** | Client credentials → token attached to all API calls |
| **New app (future)** | Register as OIDC client → users log in with existing SSO → same `sub` claim |
| **Cross-app navigation** | User is already authenticated → SSO session avoids re-login |
| **Access revocation** | Deactivate user in auth admin → tokens rejected everywhere immediately |

### Token Storage by Consumer

| Consumer | Storage Location | Token Type |
|---|---|---|
| Web UI | httpOnly cookie or in-memory | Access + refresh tokens |
| Claude Code | `~/.iexcel/auth/tokens.json` | Access + refresh tokens |
| Claw | Equivalent config directory | Access + refresh tokens |
| Mastra | Environment variable / secret manager | Client credentials token |
| Future CLI tools | `~/.iexcel/auth/tokens.json` (shared) | Access + refresh tokens |

**Key insight:** Terminal tools share the same token store (`~/.iexcel/auth/`). Log in once from any terminal tool, and every other tool on that machine picks up the same session.

---

## Relationship to Product Database

The auth service and product database are **separate but linked**:

```
┌──────────────────────┐         ┌──────────────────────┐
│   AUTH DATABASE       │         │  PRODUCT DATABASE     │
│   (identity schema)   │         │  (database-prd.md)    │
│                      │         │                      │
│  Users               │         │  Users (product)     │
│  - id (sub claim) ───┼────────►│  - auth_user_id (FK) │
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

---

## Related PRDs

| Layer | PRD | Relationship |
|---|---|---|
| **API** | [`api-prd.md`](./api-prd.md) | Validates auth tokens, maps user identity to product permissions. No longer owns `/auth/*` endpoints. |
| **Database** | [`database-prd.md`](./database-prd.md) | Product DB links to auth via `auth_user_id`. Users table updated. |
| **UI** | [`ui-prd.md`](./ui-prd.md) | Redirects to auth service for login (authorization code flow). SSO. |
| **Terminal** | [`terminal-prd.md`](./terminal-prd.md) | Uses device authorization flow. Tokens stored locally. |
| **Mastra** | [`mastra-prd.md`](./mastra-prd.md) | Uses client credentials flow for service-to-service auth. |
| **Infra** | [`infra-prd.md`](./infra-prd.md) | Auth service is its own container (`apps/auth`). Terraform provisions auth DB. |

---

## Open Questions

- [ ] Which external IdP? Google Workspace (if iExcel uses Google), Okta, Azure AD?
- [ ] Build the OIDC server from scratch or use an existing solution (e.g., Ory Hydra, Keycloak, Auth0)?
- [ ] Should the auth admin UI be a separate screen in the main UI app, or its own standalone app?
- [ ] Token signing — RSA or ECDSA keys? Key rotation strategy?
- [ ] Should there be a concept of "organizations" in the auth layer for multi-tenant future expansion?
- [ ] Do we need SCIM provisioning for automatic user sync from the IdP?
- [ ] Should the auth database be a separate Postgres instance or a separate schema in the same instance?
