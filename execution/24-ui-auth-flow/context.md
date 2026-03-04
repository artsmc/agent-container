# Feature 24: UI Auth Flow

## Summary
Implement the OIDC authorization code flow in the Next.js app. Includes login/logout, token storage (httpOnly cookie or in-memory), silent refresh when access tokens expire, protected route middleware that redirects unauthenticated users to login, and an auth context/provider for React components. Uses the auth-client package.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 05 (auth service — the OIDC provider this flow authenticates against), 06 (auth-client package — provides OIDC helpers), 23 (UI scaffolding — the Next.js app to add auth into)
- **Blocks**: 25 (dashboard — requires authenticated user), 26-28, 30-31 (all authenticated screens depend on auth context)

## Source PRDs
- `ui-prd.md` — Authentication section
- `auth-prd.md` — Authorization Code Flow, token contents, pre-registered client `iexcel-ui`, token storage

## Relevant PRD Extracts

### Authentication (ui-prd.md)

Authentication is handled by the Auth Service via OIDC. The UI is a registered OIDC client (`iexcel-ui`).

- **Internal users (account managers, team):** OIDC **Authorization Code Flow**. User clicks "Login" -> redirected to auth service -> IdP authentication (Google/Okta SSO) -> redirected back with tokens. SSO session means logging into any iExcel app logs you into all of them.
- **Clients (read-only links):** Token-based access embedded in the URL. No login required. Token scoped to a specific document and client. Served via the API's `/shared/{token}` endpoint. Expiry configurable. These links bypass OIDC — they are not user sessions.

### Authorization Code Flow (auth-prd.md)

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

### Pre-Registered Client (auth-prd.md)

| Client ID | Type | Grant Types | Description |
|---|---|---|---|
| `iexcel-ui` | Public | `authorization_code`, `refresh_token` | Web UI — browser-based SSO |

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

### Token Storage — UI (auth-prd.md)

| Consumer | Storage Location | Token Type |
|---|---|---|
| Web UI | httpOnly cookie or in-memory | Access + refresh tokens |

### Cross-App Identity (auth-prd.md)

Because every app validates tokens from the same issuer (`https://auth.iexcel.com`), the user's `sub` claim is consistent everywhere. Log in to the UI -> `sub: abc-123`. Log in via terminal -> `sub: abc-123`.

### Unified Token (auth-prd.md)

| Scenario | How It Works |
|---|---|
| **UI login** | Authorization code flow -> token stored in browser (httpOnly cookie or secure storage) |
| **Cross-app navigation** | User is already authenticated -> SSO session avoids re-login |
| **Access revocation** | Deactivate user in auth admin -> tokens rejected everywhere immediately |

### Users (ui-prd.md)

| User | Access Level | Primary Actions |
|---|---|---|
| **Account Manager** | Full access | Trigger workflows, review/approve tasks, edit agendas, manage routing, send emails |
| **Internal Team** | Edit access | Collaborate on agendas, view task details, add notes |
| **Client** | Read-only | View shared agendas via public link (no auth) |

### Permission Model (api-prd.md)

| Role | Capabilities |
|---|---|
| **Admin** | Everything. Manage workspaces, users, and system config. |
| **Account Manager** | Full CRUD on assigned clients. Approve tasks, finalize agendas, trigger workflows. |
| **Team Member** | Read access to assigned clients. Edit agendas (collaborative). Cannot approve or push. |

## Scope

### In Scope
- OIDC authorization code flow implementation using auth-client package
- Login page/button that redirects to auth service `/authorize` endpoint with `client_id=iexcel-ui`
- Callback handler route that exchanges the authorization code for tokens via back-channel
- Logout flow that clears tokens and optionally triggers auth service session logout
- Token storage — httpOnly cookie or in-memory (decision to be made during implementation)
- Silent refresh — automatically use refresh token to obtain new access token before expiry
- Protected route middleware (Next.js middleware) that redirects unauthenticated users to login
- Auth context/provider (`AuthProvider`) exposing current user info (sub, email, name, role) to React components
- Integration with api-client — provide the access token to api-client's token provider interface
- `/me` endpoint call after login to fetch product-level permissions (role, assigned clients)

### Out of Scope
- Shared agenda token-based access (`/shared/{token}`) — that bypasses OIDC entirely and is handled in feature 29
- User management / role assignment UI — that is feature 31 (admin settings)
- Auth service implementation — that is feature 05
- Device authorization flow — that is feature 32 (terminal)
- OIDC client registration — pre-registered as `iexcel-ui` in feature 05

## Key Decisions
- The UI is a **public** OIDC client (`iexcel-ui`) — it does not have a client secret. Authorization code flow with PKCE is recommended for public browser clients.
- Token storage decision (httpOnly cookie vs. in-memory) impacts XSS/CSRF tradeoffs. httpOnly cookies prevent JavaScript access but require CSRF protection. In-memory tokens are lost on page refresh but avoid CSRF. This remains an open design decision per the PRD.
- Silent refresh should be proactive — refresh the access token before it expires, not after a 401 response.
- The auth context should call `/me` after token acquisition to populate the user's product-level role and accessible clients. The auth token provides identity (`sub`, `email`, `name`); the API provides authorization (`role`, `assigned_clients`).
- SSO is handled by the auth service — if the user already has an active session (e.g., from logging in via terminal), the authorization code flow should complete without requiring password entry.
- The `/shared/{token}` routes (PublicLayout) are explicitly excluded from protected route middleware.
