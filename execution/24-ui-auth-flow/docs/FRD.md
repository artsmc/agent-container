# FRD — Feature Requirement Document
## Feature 24: UI Auth Flow
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Business Objective

The iExcel web UI (`apps/ui`) must be accessible only to authenticated internal users — account managers and team members. Authentication is centralised in the Auth Service (feature 05), which issues OIDC tokens. This feature wires the Next.js application into that auth system so that:

- Every protected route requires a valid session before rendering.
- Users who are not authenticated are redirected to the auth service login page without any manual intervention.
- After a successful login, the user lands on the authenticated dashboard.
- Access tokens are silently refreshed before expiry so users never see an unexpected logout during a working session.
- Logging out clears all session state and optionally ends the IdP SSO session.
- React components throughout the app can read the current user's identity and product-level role from a shared context without making redundant API calls.

This feature is the gating dependency for every authenticated screen (features 25–31). Without it, those screens cannot safely render.

---

## 2. Target Users

| User | Auth Mechanism | Expected Experience |
|---|---|---|
| **Account Manager** | OIDC Authorization Code Flow via SSO (Google/Okta) | Clicks "Login", authenticates once via IdP, is returned to the dashboard. Session persists for the browser session. Silent refresh keeps them logged in. |
| **Internal Team Member** | Same as Account Manager | Identical login experience. Role reflected in context restricts certain UI actions. |
| **Client** | None — public link | `/shared/{token}` routes are explicitly excluded from all auth checks. Clients are never redirected to login. |

---

## 3. Value Proposition

| Benefit | Details |
|---|---|
| **Security** | No authenticated route can be reached without a valid, unexpired access token issued by the auth service. |
| **SSO consistency** | Because the auth service is a central OIDC provider, a user who has already authenticated via the terminal or another iExcel app will not be asked to re-enter credentials when accessing the UI. The IdP SSO session handles silent login. |
| **Developer ergonomics** | All downstream screen features (25–31) consume a single `useAuth()` hook to read user state. They do not reimplement auth logic. |
| **Operational safety** | When a user is deactivated in the auth admin, their token is immediately rejected. The proxy check on every request ensures they cannot continue using the UI. |

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Zero unauthenticated access to protected routes | All requests to `/(dashboard)/*` without a valid session must redirect to login |
| Seamless silent refresh | Users with a valid refresh token must never see a login prompt during an active session |
| Correct role in context | `useAuth().user.role` must reflect the role from the product API `/me` endpoint within 500ms of the dashboard loading |
| Token hand-off to api-client | Every API call made via `@iexcel/api-client` carries the current access token without manual token management by screen feature authors |
| Session cleared on logout | After logout, all auth cookies are cleared; navigating to a protected route redirects to login |

---

## 5. Business Constraints

- **Client (`iexcel-ui`) is a public OIDC client**: no client secret. PKCE (Proof Key for Code Exchange) with S256 is required per OAuth 2.0 security best practices for public clients.
- **Token storage**: the PRD leaves httpOnly cookie vs. in-memory open. This feature resolves that: **httpOnly cookie** is the chosen approach (see Key Decisions in context.md). This prevents XSS access to tokens at the cost of requiring `SameSite=Lax` CSRF protection.
- **No custom auth logic**: all identity verification is handled by the auth service and `@iexcel/auth-client`. This feature does not validate JWT signatures itself; it delegates to the auth-client package.
- **`/shared/{token}` is out of scope**: client-facing public links are handled in feature 29. The auth proxy must never intercept these routes.
- **Scopes**: `openid profile email` — the standard minimum set. Product-level roles come from the API `/me` endpoint, not from the token.

---

## 6. Dependencies

### Upstream (must be complete before 24 begins)
| Feature | What is needed |
|---|---|
| 05 — auth-service | Running OIDC provider at `https://auth.iexcel.com`. Endpoints: `/authorize`, `/token`, `/userinfo`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`. Client `iexcel-ui` pre-registered with `authorization_code` and `refresh_token` grant types. |
| 06 — auth-client-package | `@iexcel/auth-client` package providing `buildAuthorizeUrl`, `exchangeCodeForTokens`, `refreshAccessToken`, `generatePkceChallenge`, `validateToken` utilities. |
| 23 — ui-scaffolding | `apps/ui` Next.js 16 app with App Router, route group `(dashboard)`, `PublicLayout`, `DashboardLayout`, component stubs, SCSS token system. |

### Downstream (blocked until 24 is complete)
| Feature | Why it needs 24 |
|---|---|
| 25 — ui-dashboard | Requires `AuthProvider` and `useAuth()` hook. Cannot render user-specific data without auth context. |
| 26–28, 30–31 | All authenticated screens depend on auth context and protected routing from this feature. |

---

## 7. Integration with Larger Roadmap

Feature 24 is in **Phase 3 — Consumers**. It is the first consumer-layer feature that establishes the browser-based identity flow. The auth infrastructure (features 03, 05, 06) provides the foundation; this feature is the first proof that the OIDC system works end-to-end from a browser. All subsequent UI features are built on top of the auth context this feature establishes.

The terminal auth flow (feature 32) is a parallel consumer that uses the device authorization flow — a different mechanism for the same auth service. Feature 24 and feature 32 share `@iexcel/auth-client` but implement completely separate flows.

---

## 8. Out of Scope

- Shared agenda token-based access (`/shared/{token}`) — feature 29
- User management / role assignment UI — feature 31
- Auth service implementation — feature 05
- Device authorization flow (terminal) — feature 32
- OIDC client registration — pre-registered as `iexcel-ui` in feature 05
- Role enforcement in the UI (hiding/showing buttons based on role) — feature 25 and later; this feature only provides the role in context
- MFA — handled entirely by the external IdP
