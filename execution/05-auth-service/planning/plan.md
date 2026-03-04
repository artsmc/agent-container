# Refined Execution Plan
# Feature 05: Auth Service

**Application**: `apps/auth/`
**Phase**: 1 — Foundation
**Agent**: Single `nextjs-backend-developer`
**Status**: Approved

---

## Planning Notes

### Changes from Original Task List
1. **Moved middleware (Phase 5) before routes (Phase 4)** — Routes like `/userinfo` and admin endpoints need auth middleware to exist first
2. **Merged security verification (Phase 9) into integration tests (Phase 8)** — Same test infrastructure, no reason for separate phase
3. **Moved cleanup job (Phase 10) before tests** — Implementation code should exist before test phase
4. **Reorganized from 12 phases into 9 waves** for clearer dependency ordering
5. **Total tasks: 50 (unchanged)** — No missing tasks or dead tasks found

### Resolved Questions
- Implementation approach: `oidc-provider` library vs custom with `jose` — left as open decision (task 0.4)
- JWT signing: RS256 (RSA 2048) — confirmed in TR.md
- Device flow state: In-memory initially (Option A) — confirmed in TR.md Section 4.2
- Auth code state: In-memory initially — confirmed in TR.md Section 4.3
- Secret hashing: Argon2id — confirmed in TR.md Section 7.3

---

## Wave 0 — Pre-Flight (sequential)

- [ ] **0.1** Verify `apps/auth/` directory exists (Feature 00)
  - Reference: TR.md Section 2

- [ ] **0.2** Verify auth database tables exist: `users`, `oidc_clients`, `refresh_tokens`, `sessions` in `iexcel_auth`
  - Reference: TR.md Section 13

- [ ] **0.3** Verify four pre-registered OIDC clients: `iexcel-ui`, `iexcel-terminal`, `mastra-agent`, `iexcel-api`
  - Reference: FRS.md Section 2, TR.md Section 13

- [ ] **0.4** Decide implementation approach: `oidc-provider` vs custom with `jose`. Document in README
  - Reference: TR.md Section 1, TR.md Section 15

- [ ] **0.5** Obtain IdP credentials and generate RSA key pair for JWT signing
  - Reference: TR.md Section 11, FRS.md Section 7

---

## Wave 1 — Project Setup (parallel)

All 6 tasks can run simultaneously.

- [ ] **1.1** Create `apps/auth/package.json` with dependencies: `fastify`, `pg`, `jose`, `argon2`, `dotenv`
  - Reference: TR.md Section 10

- [ ] **1.2** Update `apps/auth/project.json` with build/serve/lint/type-check targets
  - Reference: TR.md Section 10

- [ ] **1.3** Create `apps/auth/tsconfig.json` extending workspace base
  - Reference: TR.md Section 2

- [ ] **1.4** Create `apps/auth/src/config.ts` — env var loading + validation + fail-fast
  - Required: `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_PRIVATE`, `AUTH_ISSUER_URL`
  - Reference: FRS.md Section 7, TR.md Section 11

- [ ] **1.5** Create `.env.example` with all env vars documented. Verify `.gitignore`
  - Reference: TR.md Section 11

- [ ] **1.6** Create `apps/auth/README.md`

---

## Wave 2 — Database + Crypto Infrastructure (partially parallel)

2.1 first, then 2.2-2.7 in parallel.

- [ ] **2.1** Create `db/index.ts` — Postgres Pool (max 10, idle 30s, connect 2s)
  - Reference: TR.md Section 7.1

Then parallel:

- [ ] **2.2** Create `db/users.ts` — getUserByIdpSubject, upsertUser, getUserById, setUserActive, listUsers
  - Reference: TR.md Section 4.1, 7.2

- [ ] **2.3** Create `db/clients.ts` — getClientByClientId, getClientById, listClients, createClient, updateClient, setClientActive, updateClientSecretHash
  - Reference: TR.md Section 4.1, 7.2

- [ ] **2.4** Create `db/tokens.ts` — createRefreshToken, getRefreshToken, revokeRefreshToken, revokeAllRefreshTokensForUser, countActiveRefreshTokensForUser, deleteExpiredRefreshTokens
  - Reference: TR.md Section 4.1, 7.2

- [ ] **2.5** Create `db/sessions.ts` — createSession, deleteSessionsByUserId, deleteSessionById, countActiveSessionsForUser
  - Reference: TR.md Section 4.1, 7.2

- [ ] **2.6** Create `signing-keys.ts` — load SIGNING_KEY_PRIVATE, derive JWK public key, compute kid, build JWKS response. Support SIGNING_KEY_PRIVATE_PREVIOUS for rotation.
  - Reference: TR.md Section 6

- [ ] **2.7** Unit test for signing-keys.ts — deterministic kid, correct JWKS fields
  - Reference: GS.md JWKS scenarios

---

## Wave 3 — Services + Middleware (parallel after Wave 2)

All tasks can run in parallel.

- [ ] **3.1** Create `services/token.ts` — signAccessToken, signIdToken, verifyAccessToken, generateRefreshToken
  - Reference: FRS.md Section 4, TR.md Section 6

- [ ] **3.2** Create `services/user.ts` — upsertUserFromIdpClaims, assertUserIsActive
  - Reference: FRS.md Section 5.1

- [ ] **3.3** Create `services/client.ts` — lookupClient, assertClientSupportsGrant, verifyClientSecret, generateAndHashClientSecret
  - Reference: FRS.md Section 3.2, TR.md Section 7.3

- [ ] **3.4** Create `services/idp.ts` — fetch IdP discovery, buildIdpAuthorizationUrl, exchangeIdpCode
  - Reference: TR.md Section 5, FRS.md Section 2.4

- [ ] **3.5** Create `services/session.ts` — createSession (30-day expiry), revokeAllUserSessions
  - Reference: FRS.md Section 5.2, TR.md Section 4.1

- [ ] **3.6** Create `services/device.ts` — createDeviceFlow, lookupByUserCode, lookupByDeviceCode, resolveDeviceFlow, consumeDeviceFlow, enforcePollingInterval. In-memory Map with TTL.
  - Reference: FRS.md Section 6, TR.md Section 4.2

- [ ] **3.7** Create `services/auth-codes.ts` — createAuthCode, consumeAuthCode. In-memory store with 5-min TTL.
  - Reference: TR.md Section 4.3

- [ ] **3.8** Create `middleware/auth.ts` — extract Bearer token, verify via verifyAccessToken, attach to request context, 401 on failure
  - Reference: FRS.md Section 9, TR.md Section 8
  - (Was original task 5.1)

- [ ] **3.9** Create `middleware/admin.ts` — check token scope contains ADMIN_SCOPE, 403 if absent
  - Reference: FRS.md Section 3, FRS.md Section 9
  - (Was original task 5.2)

---

## Wave 4 — OIDC Endpoints (partially parallel after Wave 3)

Group A (parallel — no dependencies on each other):

- [ ] **4.1** `routes/well-known/discovery.ts` — GET /.well-known/openid-configuration
  - Reference: FRS.md Section 2.1, GS.md

- [ ] **4.2** `routes/well-known/jwks.ts` — GET /.well-known/jwks.json + Cache-Control header
  - Reference: FRS.md Section 2.2, GS.md

- [ ] **4.9** `routes/userinfo.ts` — GET /userinfo (requires auth middleware)
  - Reference: FRS.md Section 2.9, GS.md

- [ ] **4.10** `routes/health.ts` — GET /health (SELECT 1 health check)
  - Reference: FRS.md Section 2.10, GS.md

Group B (sequential — auth code flow):

- [ ] **4.3** `routes/authorize.ts` — GET /authorize (validate params, redirect to IdP)
  - Reference: FRS.md Section 2.3, GS.md

- [ ] **4.4** `routes/callback.ts` — GET /callback (IdP callback, upsert user, issue auth code)
  - Reference: FRS.md Section 2.4, GS.md

Group C (sequential — device flow):

- [ ] **4.6** `routes/device/authorize.ts` — POST /device/authorize
  - Reference: FRS.md Section 2.6, GS.md

- [ ] **4.7** `routes/device/verify.ts` — GET /device (HTML form for code entry)
  - Reference: FRS.md Section 2.7, GS.md

- [ ] **4.8** `routes/device/token.ts` — POST /device/token (polling endpoint)
  - Reference: FRS.md Section 2.8, GS.md

Group D (depends on auth code + device flow services):

- [ ] **4.5** `routes/token.ts` — POST /token (all grant types: authorization_code, refresh_token, client_credentials)
  - Reference: FRS.md Section 2.5, GS.md

---

## Wave 5 — Admin Endpoints (after Wave 4)

- [ ] **5.1** `routes/admin/clients.ts` — GET/POST/GET :id/PATCH :id/DELETE :id/POST rotate-secret (all admin-protected)
  - Reference: FRS.md Sections 3.1-3.6, GS.md
  - (Was original task 6.1)

- [ ] **5.2** `routes/admin/users.ts` — GET/GET :id/POST deactivate/DELETE sessions (all admin-protected)
  - Reference: FRS.md Sections 3.7-3.10, GS.md
  - (Was original task 6.2)

---

## Wave 6 — App Entry Point + Cleanup (sequential)

- [ ] **6.1** Create `index.ts` — Fastify app setup, plugin registration (rate-limit, CORS, cookie), route registration, startup sequence
  - Reference: TR.md Section 12
  - (Was original task 7.1)

- [ ] **6.2** Implement cleanup job — hourly: delete expired sessions, delete expired+revoked refresh tokens, log counts
  - Reference: FRS.md Section 1, TR.md Section 4.1
  - (Was original task 10.1)

---

## Wave 7 — Integration Tests + Security Verification (parallel)

All test suites can run in parallel against a test database.

- [ ] **7.1** Test: OIDC discovery document returns all required fields
  - Reference: GS.md OIDC Discovery

- [ ] **7.2** Test: JWKS endpoint returns RSA public key; JWT verifiable with that key
  - Reference: GS.md JWKS Endpoint

- [ ] **7.3** Test: Authorization code flow end-to-end (mock IdP) — user created, session created, code issued, code exchanged, tokens correct, code single-use
  - Reference: GS.md Authorization Code Flow

- [ ] **7.4** Test: Deactivated user cannot log in
  - Reference: GS.md

- [ ] **7.5** Test: Refresh token flow — issue, refresh with rotation, verify old token revoked
  - Reference: GS.md Token Refresh

- [ ] **7.6** Test: Reuse of rotated refresh token triggers full revocation
  - Reference: GS.md

- [ ] **7.7** Test: Device authorization flow end-to-end — initiate, simulate user verify, poll, tokens issued, authorization_pending, slow_down, expired_token
  - Reference: GS.md Device Authorization Flow

- [ ] **7.8** Test: Client credentials flow — access token issued, no id_token, no refresh_token
  - Reference: GS.md Client Credentials Flow

- [ ] **7.9** Test: Userinfo endpoint — valid token returns correct claims per scope
  - Reference: GS.md Userinfo Endpoint

- [ ] **7.10** Test: Health check — 200 when DB reachable
  - Reference: GS.md Health Check

- [ ] **7.11** Test: Admin client CRUD — create, list, get, update, deactivate, rotate-secret. client_secret_hash never returned.
  - Reference: GS.md Admin Client Management

- [ ] **7.12** Test: Admin user management — list, get detail, deactivate, revoke sessions
  - Reference: GS.md Admin User Management

- [ ] **7.13** Test: Non-admin token returns 403 on all /admin/* endpoints
  - Reference: GS.md

- [ ] **7.14** Verify: PKCE enforcement — public client without code_challenge rejected
  - Reference: GS.md, FRS.md Section 9
  - (Was original task 9.1)

- [ ] **7.15** Verify: Redirect URI exact match — trailing slash rejected
  - Reference: GS.md, FRS.md Section 10
  - (Was original task 9.2)

- [ ] **7.16** Verify: State parameter required
  - Reference: GS.md
  - (Was original task 9.3)

- [ ] **7.17** Audit: client_secret_hash never appears in any API response
  - Reference: FRS.md Section 3.1
  - (Was original task 9.4)

- [ ] **7.18** Verify: Rate limiting active on /token and /device/token (429 on exceed)
  - Reference: TR.md Section 8
  - (Was original task 9.5)

---

## Wave 8 — Handoff (sequential)

- [ ] **8.1** Notify Feature 06 team — auth service base URL, JWKS URL, test access token
  - Reference: TR.md Section 14

- [ ] **8.2** Update `apps/auth/project.json` — add `implicitDependencies: ["auth-database"]`
  - Reference: TR.md Section 10

- [ ] **8.3** Document token structure (claims, format, example) in README
  - Reference: FRS.md Section 4, FRD.md Section 9

---

## Completion Checklist

- [ ] All three OIDC flows complete end-to-end: authorization code, device, client credentials
- [ ] Refresh token flow works with rotation and reuse detection
- [ ] OIDC discovery document validates against expected schema
- [ ] JWKS endpoint returns correct public key and tokens are verifiable
- [ ] Userinfo endpoint returns correct claims per scope
- [ ] Health check returns 200 when DB reachable, 503 when not
- [ ] Admin CRUD for clients and users is functional
- [ ] Client secrets and refresh tokens stored as hashes only
- [ ] PKCE enforced for public clients
- [ ] Redirect URI exact match enforced
- [ ] Authorization codes are single-use
- [ ] Refresh token rotation and reuse detection work correctly
- [ ] Non-admin tokens cannot reach admin endpoints
- [ ] Rate limiting active on token endpoints
- [ ] Cleanup job implemented for expired sessions and tokens
- [ ] All integration tests pass
- [ ] `.env` is gitignored, `.env.example` is committed
- [ ] README documents local setup, env vars, and token structure
- [ ] Feature 06 team notified with local URL and test token
