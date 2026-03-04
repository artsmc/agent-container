# Task List — Feature 05: Auth Service

**Application:** `apps/auth/`
**Blocked by:** Feature 00 (Nx Monorepo Scaffolding), Feature 03 (Auth Database Schema)
**Blocks:** Feature 06 (Auth Client Package), Feature 24 (UI Auth Flow), Feature 32 (Terminal Device Auth)
**Complexity:** Large

---

## Pre-Flight Checklist

- [ ] **0.1** Verify `apps/auth/` directory exists (created by Feature 00). If not, raise a blocker against Feature 00 before proceeding.
  - References: TR.md §2 (Application Structure)

- [ ] **0.2** Verify the auth database migrations (Feature 03) have been applied: tables `users`, `oidc_clients`, `refresh_tokens`, `sessions` must exist in `iexcel_auth`. Verify via `\dt` in psql or equivalent.
  - References: TR.md §13 (Dependencies on Upstream Features)

- [ ] **0.3** Verify the four pre-registered OIDC clients exist in `oidc_clients`: `iexcel-ui`, `iexcel-terminal`, `mastra-agent`, `iexcel-api`.
  - References: FRS.md §2 (Background), TR.md §13

- [ ] **0.4** Decide on implementation approach: `oidc-provider` library vs custom implementation with `jose`. Document the decision and rationale in `apps/auth/README.md` (to be created in Phase 1).
  - References: TR.md §1 (Technology Stack), TR.md §15 (Open Technical Questions)

- [ ] **0.5** Obtain external IdP credentials (`IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`) and generate an RSA key pair for JWT signing (`SIGNING_KEY_PRIVATE`). Store in local `.env` file (never commit).
  - References: TR.md §11 (Environment Variable Schema), FRS.md §7 (Environment Configuration)

---

## Phase 1: Project Setup

- [ ] **1.1** Create `apps/auth/package.json` with all required dependencies: `fastify`, `pg`, `jose`, `argon2`, `dotenv`, and dev dependencies `@types/pg`, `typescript`.
  - References: TR.md §10 (Nx Project Configuration), TR.md §1 (Technology Stack)

- [ ] **1.2** Update `apps/auth/project.json` with build, serve, lint, and type-check targets using `@nx/esbuild`, `@nx/node`, and `@nx/eslint` executors.
  - References: TR.md §10 (Nx Project Configuration)

- [ ] **1.3** Create `apps/auth/tsconfig.json` extending `../../tsconfig.base.json` with `outDir: dist/apps/auth` and `rootDir: src`.
  - References: TR.md §2 (Application Structure)

- [ ] **1.4** Create `apps/auth/src/config.ts` that reads all environment variables using `process.env`, validates that all required variables are present, and exits with a clear error message if any are missing.
  - Required variables: `AUTH_DATABASE_URL`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, `IDP_ISSUER_URL`, `SIGNING_KEY_PRIVATE`, `AUTH_ISSUER_URL`.
  - References: FRS.md §7 (Environment Configuration), TR.md §11

- [ ] **1.5** Create `apps/auth/.env.example` with all environment variables documented with placeholder values. Verify `.env` is gitignored at the monorepo root.
  - References: TR.md §11 (Environment Variable Schema), FRS.md §7

- [ ] **1.6** Create `apps/auth/README.md` documenting: purpose, local development setup, required environment variables, how to run, how to run tests, and any implementation decisions made in step 0.4.

---

## Phase 2: Database and Signing Key Infrastructure

- [ ] **2.1** Create `apps/auth/src/db/index.ts` — create and export a Postgres `Pool` using the `AUTH_DATABASE_URL` environment variable. Pool configuration: max 10 connections, idle timeout 30s, connection timeout 2s.
  - References: TR.md §7.1 (Connection Pool)

- [ ] **2.2** Create `apps/auth/src/db/users.ts` with the following parameterized SQL functions:
  - `getUserByIdpSubject(idpSubject: string, idpProvider: string): Promise<User | null>`
  - `upsertUser(params): Promise<User>` — INSERT ON CONFLICT using (idp_subject, idp_provider); updates email, name, picture, last_login_at on conflict.
  - `getUserById(id: string): Promise<User | null>`
  - `setUserActive(id: string, isActive: boolean): Promise<void>`
  - `listUsers(params: { isActive?: boolean; limit: number; offset: number }): Promise<{ users: User[]; total: number }>`
  - References: TR.md §4.1, TR.md §7.2

- [ ] **2.3** Create `apps/auth/src/db/clients.ts` with:
  - `getClientByClientId(clientId: string): Promise<OidcClient | null>`
  - `getClientById(id: string): Promise<OidcClient | null>`
  - `listClients(): Promise<OidcClient[]>`
  - `createClient(params): Promise<OidcClient>`
  - `updateClient(id: string, updates: Partial<OidcClient>): Promise<OidcClient>`
  - `setClientActive(id: string, isActive: boolean): Promise<void>`
  - `updateClientSecretHash(id: string, hash: string): Promise<void>`
  - References: TR.md §4.1, TR.md §7.2

- [ ] **2.4** Create `apps/auth/src/db/tokens.ts` with:
  - `createRefreshToken(params: { userId: string; clientId: string; tokenHash: string; expiresAt: Date }): Promise<void>`
  - `getRefreshToken(tokenHash: string): Promise<RefreshToken | null>`
  - `revokeRefreshToken(id: string): Promise<void>`
  - `revokeAllRefreshTokensForUser(userId: string, clientId?: string): Promise<number>` — returns revoked count
  - `countActiveRefreshTokensForUser(userId: string): Promise<number>`
  - `deleteExpiredRefreshTokens(): Promise<number>` — for cleanup job
  - References: TR.md §4.1, TR.md §7.2

- [ ] **2.5** Create `apps/auth/src/db/sessions.ts` with:
  - `createSession(params: { userId: string; idpSessionId?: string; expiresAt: Date }): Promise<Session>`
  - `deleteSessionsByUserId(userId: string): Promise<number>` — returns deleted count
  - `deleteSessionById(id: string): Promise<void>`
  - `countActiveSessionsForUser(userId: string): Promise<number>`
  - References: TR.md §4.1, TR.md §7.2

- [ ] **2.6** Create `apps/auth/src/signing-keys.ts`:
  - At startup, load `SIGNING_KEY_PRIVATE` (PEM) using `importPKCS8` from `jose`.
  - Derive the JWK representation of the public key using `exportJWK`.
  - Compute the `kid` using `calculateJwkThumbprint`.
  - Export: `privateKey`, `publicKeyJwk`, `kid`, and the full JWKS response object (`{ keys: [{ kty, use, kid, alg, n, e }] }`).
  - If `SIGNING_KEY_PRIVATE_PREVIOUS` is set, load it and add its public key to the JWKS as a second entry.
  - References: TR.md §6 (JWT Signing and Verification)

- [ ] **2.7** Write a unit test for `signing-keys.ts`:
  - Generate a real RSA key pair in the test.
  - Verify `kid` is derived deterministically.
  - Verify the JWKS object contains the correct fields.
  - References: GS.md — JWKS Endpoint scenarios

---

## Phase 3: Core Services

- [ ] **3.1** Create `apps/auth/src/services/token.ts`:
  - `signAccessToken(payload: AccessTokenPayload, lifetime: number): Promise<string>` — uses `SignJWT` from `jose`.
  - `signIdToken(payload: IdTokenPayload, lifetime: number): Promise<string>`.
  - `verifyAccessToken(token: string): Promise<JWTPayload>` — validates iss, aud, exp.
  - `generateRefreshToken(): string` — 32 bytes, base64url encoded.
  - References: FRS.md §4 (Token Issuance), TR.md §6

- [ ] **3.2** Create `apps/auth/src/services/user.ts`:
  - `upsertUserFromIdpClaims(claims: IdpClaims): Promise<User>` — wraps `db/users.ts` upsertUser.
  - `assertUserIsActive(user: User): void` — throws `UserDeactivatedError` if `is_active = false`.
  - References: FRS.md §5.1 (User Upsert on Login)

- [ ] **3.3** Create `apps/auth/src/services/client.ts`:
  - `lookupClient(clientId: string): Promise<OidcClient>` — throws `InvalidClientError` if not found or not active.
  - `assertClientSupportsGrant(client: OidcClient, grantType: string): void` — throws `UnauthorizedClientError` if grant not in client's `grant_types`.
  - `verifyClientSecret(client: OidcClient, incomingSecret: string): Promise<void>` — hashes incoming, compares to stored hash via argon2.verify.
  - `generateAndHashClientSecret(): Promise<{ plaintext: string; hash: string }>`.
  - References: FRS.md §3.2 (POST /admin/clients), FRS.md §2.5.3 (client_credentials), TR.md §7.3

- [ ] **3.4** Create `apps/auth/src/services/idp.ts`:
  - At module load: fetch IdP discovery document from `{IDP_ISSUER_URL}/.well-known/openid-configuration`. Cache the result (refresh every 24h).
  - `buildIdpAuthorizationUrl(params: { state: string; nonce: string; redirectUri: string }): string` — constructs the URL to redirect to the IdP.
  - `exchangeIdpCode(code: string, redirectUri: string): Promise<IdpClaims>` — calls the IdP token endpoint, verifies the IdP's ID token using `jose`, extracts and returns claims.
  - References: TR.md §5 (External IdP Integration), FRS.md §2.4 (GET /callback)

- [ ] **3.5** Create `apps/auth/src/services/session.ts`:
  - `createSession(userId: string, idpSessionId?: string): Promise<Session>` — sets `expires_at` to 30 days from now.
  - `revokeAllUserSessions(userId: string): Promise<number>`.
  - References: FRS.md §5.2 (Session Lifecycle), TR.md §4.1

- [ ] **3.6** Create `apps/auth/src/services/device.ts`:
  - `createDeviceFlow(clientId: string, scope: string): DeviceFlowRecord` — generates `device_code` (32 bytes) and `user_code` (8 alphanumeric chars formatted as `XXXX-XXXX`, excluding ambiguous chars: 0, O, 1, I). Stores in in-memory map with TTL.
  - `lookupByUserCode(userCode: string): DeviceFlowRecord | null` — case-insensitive, strip hyphens before lookup.
  - `lookupByDeviceCode(deviceCode: string): DeviceFlowRecord | null`.
  - `resolveDeviceFlow(deviceCode: string, userId: string): void` — marks status as `'complete'`, stores userId.
  - `consumeDeviceFlow(deviceCode: string): DeviceFlowRecord` — marks as consumed, removes from map.
  - `enforcePollingInterval(record: DeviceFlowRecord): 'ok' | 'slow_down'` — checks `last_polled_at`.
  - References: FRS.md §6 (Device Flow State Management), TR.md §4.2

- [ ] **3.7** Create in-memory authorization code store (`apps/auth/src/services/auth-codes.ts`):
  - `createAuthCode(params: { userId: string; clientId: string; redirectUri: string; codeChallenge?: string; scope: string }): string` — returns opaque code.
  - `consumeAuthCode(code: string): AuthCodeRecord` — marks used, throws if expired (> 5 min) or already used.
  - References: TR.md §4.3 (Authorization Code State)

---

## Phase 4: OIDC Standard Endpoints

- [ ] **4.1** Create `apps/auth/src/routes/well-known/discovery.ts`:
  - Return the static OIDC discovery document (built at startup from `AUTH_ISSUER_URL`).
  - References: FRS.md §2.1, GS.md — OIDC Discovery scenarios

- [ ] **4.2** Create `apps/auth/src/routes/well-known/jwks.ts`:
  - Return the JWKS response from `signing-keys.ts` (pre-built at startup).
  - Add `Cache-Control: public, max-age=3600` header.
  - References: FRS.md §2.2, GS.md — JWKS Endpoint scenarios

- [ ] **4.3** Create `apps/auth/src/routes/authorize.ts` (GET /authorize):
  - Validate query parameters: `client_id`, `redirect_uri`, `response_type`, `scope`, `state`, `code_challenge` (if public client).
  - Validation failures: return 400 or redirect with error as specified in FRS.md §2.3.
  - On success: store authorization request in a short-lived cookie-backed session; redirect to IdP.
  - References: FRS.md §2.3, GS.md — Authorization Code Flow scenarios

- [ ] **4.4** Create `apps/auth/src/routes/callback.ts` (GET /callback — internal IdP callback):
  - Validate `state` against stored session.
  - Call `idp.exchangeIdpCode()`.
  - Call `user.upsertUserFromIdpClaims()` and `user.assertUserIsActive()`.
  - Create session via `session.createSession()`.
  - Determine if this is a device flow callback or a regular auth code callback. If device flow: resolve the device flow and show confirmation page. If regular: create auth code via `authCodes.createAuthCode()` and redirect to client's `redirect_uri` with `code` and `state`.
  - References: FRS.md §2.4, GS.md — New user created / Existing user updated scenarios

- [ ] **4.5** Create `apps/auth/src/routes/token.ts` (POST /token):
  - Parse `grant_type` from form body and dispatch to the appropriate handler:
    - `authorization_code`: validate and consume auth code, issue tokens, store refresh token hash.
    - `refresh_token`: validate refresh token, rotate, issue new tokens.
    - `client_credentials`: validate client credentials, issue access token only.
  - Return `TokenResponse` or `TokenErrorResponse` as appropriate.
  - References: FRS.md §2.5, GS.md — Authorization Code Flow / Token Refresh / Client Credentials scenarios

- [ ] **4.6** Create `apps/auth/src/routes/device/authorize.ts` (POST /device/authorize):
  - Validate `client_id` and that client supports `device_code` grant.
  - Call `device.createDeviceFlow()`.
  - Return `DeviceAuthorizeResponse`.
  - References: FRS.md §2.6, GS.md — Device Authorization Flow scenarios

- [ ] **4.7** Create `apps/auth/src/routes/device/verify.ts` (GET /device):
  - Render HTML page with a form for user code entry.
  - If `user_code` query param present, pre-fill the form.
  - On form POST: look up `user_code` via `device.lookupByUserCode()`, validate it is pending and not expired, then redirect the user to the IdP for authentication (with a device-flow-specific callback).
  - On invalid/expired code: display error on the page.
  - References: FRS.md §2.7, GS.md — Device Verification Page scenario

- [ ] **4.8** Create `apps/auth/src/routes/device/token.ts` (POST /device/token):
  - Validate `grant_type`, `device_code`, `client_id`.
  - Look up device flow record. Check: expired → `expired_token`; polling too fast → `slow_down`; pending → `authorization_pending`; complete → issue tokens and consume record.
  - References: FRS.md §2.8, GS.md — Device Authorization Flow polling scenarios

- [ ] **4.9** Create `apps/auth/src/routes/userinfo.ts` (GET /userinfo):
  - Validate bearer token via `token.verifyAccessToken()`.
  - Look up user via `db/users.getUserById(sub)`.
  - Return claims based on granted scopes.
  - References: FRS.md §2.9, GS.md — Userinfo Endpoint scenarios

- [ ] **4.10** Create `apps/auth/src/routes/health.ts` (GET /health):
  - Execute a lightweight `SELECT 1` on the database pool.
  - Return `{ status: 'ok', timestamp }` or `{ status: 'degraded', reason: 'database_unreachable' }`.
  - References: FRS.md §2.10, GS.md — Health Check scenarios

---

## Phase 5: Middleware

- [ ] **5.1** Create `apps/auth/src/middleware/auth.ts`:
  - Extract bearer token from `Authorization` header.
  - Verify token using `token.verifyAccessToken()`.
  - Attach decoded payload to request context.
  - Return 401 if token is missing, malformed, or expired.
  - References: FRS.md §9 (Security Requirements), TR.md §8

- [ ] **5.2** Create `apps/auth/src/middleware/admin.ts`:
  - Depends on `auth.ts` middleware having run first (request context has decoded token).
  - Check that the token's `scope` claim contains the `ADMIN_SCOPE` value.
  - Return 403 if admin scope is absent.
  - References: FRS.md §3 (Admin API Endpoints), FRS.md §9

---

## Phase 6: Admin Endpoints

- [ ] **6.1** Create `apps/auth/src/routes/admin/clients.ts`:
  - `GET /admin/clients` — `db/clients.listClients()`, never return `client_secret_hash`.
  - `POST /admin/clients` — validate body, call `client.generateAndHashClientSecret()` for confidential, insert, return plaintext secret once.
  - `GET /admin/clients/:id` — `db/clients.getClientById()`.
  - `PATCH /admin/clients/:id` — partial update; validate updatable fields only.
  - `DELETE /admin/clients/:id` — `db/clients.setClientActive(id, false)`.
  - `POST /admin/clients/:id/rotate-secret` — generate new secret, update hash, return new plaintext.
  - All routes protected by admin middleware.
  - References: FRS.md §3.1–3.6, GS.md — Admin API Client Management scenarios

- [ ] **6.2** Create `apps/auth/src/routes/admin/users.ts`:
  - `GET /admin/users` — `db/users.listUsers()` with optional filters.
  - `GET /admin/users/:id` — `db/users.getUserById()` + count active sessions and refresh tokens.
  - `POST /admin/users/:id/deactivate` — `db/users.setUserActive(id, false)`.
  - `DELETE /admin/users/:id/sessions` — `db/sessions.deleteSessionsByUserId()` + `db/tokens.revokeAllRefreshTokensForUser()`.
  - All routes protected by admin middleware.
  - References: FRS.md §3.7–3.10, GS.md — Admin API User Management scenarios

---

## Phase 7: Application Entry Point

- [ ] **7.1** Create `apps/auth/src/index.ts`:
  - Initialize `config.ts` (fail fast on missing env vars).
  - Load signing keys (`signing-keys.ts`).
  - Fetch and cache IdP discovery document (`services/idp.ts`).
  - Create Fastify app with JSON schema validation and request logging.
  - Register all routes.
  - Register rate limiting (`@fastify/rate-limit`) on `/token` and `/device/token`.
  - Register CORS (`@fastify/cors`) with configured allowed origins.
  - Register cookie plugin (`@fastify/cookie`) for authorization request state.
  - Start listening on `PORT`.
  - References: TR.md §12 (Deployment Notes — Startup Sequence)

---

## Phase 8: Integration Tests

All integration tests run against a real test database (an empty `iexcel_auth` database with the Feature 03 migrations applied).

- [ ] **8.1** Test: OIDC discovery document returns all required fields.
  - References: GS.md — OIDC Discovery scenarios

- [ ] **8.2** Test: JWKS endpoint returns RSA public key; JWT signed by the private key is verifiable using that key.
  - References: GS.md — JWKS Endpoint scenarios

- [ ] **8.3** Test: Authorization code flow end-to-end (mock IdP).
  - Mock the external IdP's token endpoint to return a synthetic ID token.
  - Verify: new user created, session created, auth code issued, code exchanged for tokens, tokens have correct claims.
  - Verify: code cannot be reused.
  - References: GS.md — Authorization Code Flow scenarios

- [ ] **8.4** Test: Deactivated user cannot log in.
  - References: GS.md — "Deactivated user cannot log in"

- [ ] **8.5** Test: Refresh token flow — issue, refresh (rotation), verify old token is revoked.
  - References: GS.md — Token Refresh scenarios

- [ ] **8.6** Test: Reuse of rotated refresh token triggers full revocation.
  - References: GS.md — "Reuse of a rotated refresh token triggers full revocation"

- [ ] **8.7** Test: Device authorization flow end-to-end.
  - Initiate device flow, simulate user verification (directly set status to complete), poll, verify tokens issued.
  - Verify: polling before auth returns `authorization_pending`.
  - Verify: polling too fast returns `slow_down`.
  - Verify: expired device code returns `expired_token`.
  - References: GS.md — Device Authorization Flow scenarios

- [ ] **8.8** Test: Client credentials flow — issue access token, verify no id_token or refresh_token returned.
  - References: GS.md — Client Credentials Flow scenarios

- [ ] **8.9** Test: Userinfo endpoint — valid token returns correct claims based on scope.
  - References: GS.md — Userinfo Endpoint scenarios

- [ ] **8.10** Test: Health check — returns 200 when DB is reachable.
  - References: GS.md — Health Check scenarios

- [ ] **8.11** Test: Admin client CRUD — create, list, get, update, deactivate, rotate-secret.
  - Verify `client_secret_hash` is never returned in any response.
  - Verify old secret is invalid after rotation.
  - References: GS.md — Admin API Client Management scenarios

- [ ] **8.12** Test: Admin user management — list, get detail, deactivate, revoke sessions.
  - Verify session and refresh token counts in detail response.
  - Verify all sessions and tokens revoked after DELETE /sessions.
  - References: GS.md — Admin API User Management scenarios

- [ ] **8.13** Test: Non-admin token returns 403 on all /admin/* endpoints.
  - References: GS.md — "Non-admin token cannot access admin endpoints"

---

## Phase 9: Security Verification

- [ ] **9.1** Verify PKCE enforcement: confirm `/authorize` for `iexcel-ui` (public client) without `code_challenge` is rejected.
  - References: GS.md — "Public client without PKCE is rejected", FRS.md §9

- [ ] **9.2** Verify redirect URI exact match: confirm `/authorize` with a redirect_uri that differs by a trailing slash is rejected.
  - References: GS.md — "Redirect URI must exactly match registered URI", FRS.md §10

- [ ] **9.3** Verify state parameter is required: confirm `/authorize` without `state` is rejected.
  - References: GS.md — "State parameter is required for authorization code flow"

- [ ] **9.4** Audit: confirm `client_secret_hash` does not appear in any API response via a search of response serializers.
  - References: FRS.md §3.1

- [ ] **9.5** Verify rate limiting is active on `/token` and `/device/token` by exceeding the limit and confirming a 429 response.
  - References: TR.md §8 (Security Requirements)

---

## Phase 10: Cleanup Job

- [ ] **10.1** Implement a periodic cleanup function in `apps/auth/src/index.ts` (or a separate `cleanup.ts` module):
  - Every 1 hour: delete `sessions` rows where `expires_at < NOW()`.
  - Every 1 hour: delete `refresh_tokens` rows where `expires_at < NOW()` AND `revoked_at IS NOT NULL`.
  - Log count of rows deleted for observability.
  - References: FRS.md §1 (In Scope — Token cleanup job), TR.md §4.1

---

## Phase 11: Handoff to Downstream Features

- [ ] **11.1** Notify the Feature 06 (Auth Client Package) team that the auth service is running locally and provide:
  - The auth service base URL (for local dev: `http://localhost:8090`).
  - The JWKS endpoint URL.
  - A valid test access token for integration testing.
  - References: TR.md §14 (Contracts for Downstream Features)

- [ ] **11.2** Update `apps/auth/project.json` to add `implicitDependencies: ["auth-database"]` so Nx knows that changes to the database schema trigger auth service rebuilds and re-validation.
  - References: TR.md §10 (Nx Project Configuration)

- [ ] **11.3** Document the token structure (claims, format, example) in `apps/auth/README.md` for consumption by API team (Feature 07) and terminal auth team (Feature 32).
  - References: FRS.md §4 (Token Issuance), FRD.md §9 (Key Decisions)

---

## Completion Checklist

Before marking this feature complete:

- [ ] All three OIDC flows complete end-to-end: authorization code, device, client credentials
- [ ] Refresh token flow works with rotation and reuse detection
- [ ] OIDC discovery document validates against expected schema
- [ ] JWKS endpoint returns correct public key and tokens are verifiable
- [ ] Userinfo endpoint returns correct claims per scope
- [ ] Health check returns 200 when DB reachable, 503 when not
- [ ] Admin CRUD for clients and users is functional
- [ ] Client secrets and refresh tokens are stored as hashes only (never plaintext)
- [ ] PKCE is enforced for public clients
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
