# FRS — Functional Requirement Specification
# Feature 05: Auth Service

## 1. Application Location

The auth service lives at:

```
apps/auth/
├── src/
│   ├── routes/
│   │   ├── authorize.ts          # GET /authorize
│   │   ├── token.ts              # POST /token
│   │   ├── device.ts             # GET /device, POST /device/authorize, POST /device/token
│   │   ├── userinfo.ts           # GET /userinfo
│   │   ├── discovery.ts          # GET /.well-known/openid-configuration
│   │   ├── jwks.ts               # GET /.well-known/jwks.json
│   │   ├── admin/
│   │   │   ├── clients.ts        # /admin/clients CRUD
│   │   │   └── users.ts          # /admin/users management
│   │   └── health.ts             # GET /health
│   ├── services/
│   │   ├── idp.ts                # External IdP integration
│   │   ├── token.ts              # Token issuance and validation
│   │   ├── session.ts            # Session management
│   │   ├── user.ts               # User upsert and lookup
│   │   ├── client.ts             # OIDC client registry
│   │   └── device.ts             # Device flow state management
│   ├── db/
│   │   └── index.ts              # Postgres connection (pool)
│   ├── config.ts                 # Environment variable loading and validation
│   └── index.ts                  # App entry point
├── package.json
└── project.json
```

---

## 2. OIDC Endpoints

### 2.1 GET /.well-known/openid-configuration

**Purpose:** OIDC discovery document. Allows consumers to auto-configure all endpoint URLs without hardcoding.

**Authentication:** None (public endpoint).

**Response body (application/json):**

```json
{
  "issuer": "https://auth.iexcel.com",
  "authorization_endpoint": "https://auth.iexcel.com/authorize",
  "token_endpoint": "https://auth.iexcel.com/token",
  "device_authorization_endpoint": "https://auth.iexcel.com/device/authorize",
  "userinfo_endpoint": "https://auth.iexcel.com/userinfo",
  "jwks_uri": "https://auth.iexcel.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code", "client_credentials"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "email", "name", "picture"]
}
```

**Status codes:**
- `200 OK` — always (this endpoint never fails)

---

### 2.2 GET /.well-known/jwks.json

**Purpose:** JSON Web Key Set. Consumers fetch this to obtain the public key(s) for verifying token signatures.

**Authentication:** None (public endpoint).

**Response body (application/json):**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-id-1",
      "alg": "RS256",
      "n": "<base64url-encoded modulus>",
      "e": "AQAB"
    }
  ]
}
```

**Behaviour:**
- Contains only the current signing key(s). If key rotation has occurred, may include the outgoing key for a transition period (until all tokens signed by it have expired).
- `kid` (key ID) in the JWKS must match the `kid` header in issued JWTs so consumers know which key to use.
- Response must include `Cache-Control: public, max-age=3600` to allow consumers to cache.

**Status codes:**
- `200 OK`

---

### 2.3 GET /authorize

**Purpose:** OIDC authorization endpoint. Initiates the authorization code flow. Redirects the user's browser to the external IdP.

**Authentication:** None (initiated by browser).

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `client_id` | Yes | Must match a registered OIDC client with `authorization_code` grant type |
| `redirect_uri` | Yes | Must exactly match one of the client's registered `redirect_uris` |
| `response_type` | Yes | Must be `code` |
| `scope` | Yes | Space-separated. Must include `openid`. Other allowed values: `profile`, `email` |
| `state` | Yes | Opaque value from client; echoed back in redirect. Used for CSRF protection. |
| `code_challenge` | Recommended | PKCE challenge (S256 method). Required for public clients. |
| `code_challenge_method` | Recommended | Must be `S256` if `code_challenge` is present |

**Validation:**
1. Look up `client_id` in `oidc_clients` table. If not found or `is_active = false`: redirect back to `redirect_uri` with `error=unauthorized_client`.
2. Validate `redirect_uri` against the client's registered `redirect_uris`. If mismatch: return `400 Bad Request` (do not redirect — the redirect_uri itself is untrusted).
3. Validate `response_type = code`. Otherwise: redirect with `error=unsupported_response_type`.
4. Validate all requested scopes are in the client's allowed `scopes`. Otherwise: redirect with `error=invalid_scope`.
5. If client is public and no `code_challenge` provided: reject with `error=invalid_request` (PKCE required for public clients).

**Success behaviour:**
- Save the authorization request parameters (including `state`, `code_challenge`) to a short-lived session (e.g., keyed by a random nonce stored in a cookie).
- Redirect the browser to the external IdP's authorization endpoint with the IdP's `client_id`, `redirect_uri` pointing back to the auth service's callback, and `scope=openid profile email`.

**Error redirects (to `redirect_uri`):**
```
{redirect_uri}?error={error_code}&error_description={human_readable}&state={state}
```

---

### 2.4 GET /callback (Internal — IdP Callback)

**Purpose:** Receives the authorization code from the external IdP after user authentication. Not documented in the OIDC discovery document (it is internal). Completes the server-side code exchange with the IdP.

**Query parameters:**

| Parameter | Description |
|---|---|
| `code` | Authorization code from IdP |
| `state` | State value from the original IdP redirect (used to retrieve the original client's request) |

**Processing:**
1. Validate `state` against the short-lived session stored during `/authorize`.
2. Exchange `code` with the IdP: `POST {idp_token_endpoint}` with `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`.
3. Verify the IdP's ID token signature and extract claims: `sub` (IdP subject), `email`, `name`, `picture`.
4. Upsert user into the `users` table (see §5.1).
5. Create a session record in the `sessions` table.
6. Generate an authorization code (opaque, short-lived — 5 minutes — stored in memory or database).
7. Redirect to the original client's `redirect_uri` with the auth service's own `code` and original `state`.

---

### 2.5 POST /token

**Purpose:** Token endpoint. Issues tokens in exchange for authorization codes, refresh tokens, or client credentials.

**Authentication:** Varies by grant type (see below).

**Request content-type:** `application/x-www-form-urlencoded`

**Supported grant types:**

#### 2.5.1 authorization_code

**Parameters:**

| Parameter | Required | Description |
|---|---|---|
| `grant_type` | Yes | `authorization_code` |
| `code` | Yes | Authorization code issued by /authorize flow |
| `redirect_uri` | Yes | Must match what was used in /authorize |
| `client_id` | Yes | The OIDC client's ID |
| `code_verifier` | If PKCE used | PKCE verifier. Auth service derives `S256(code_verifier)` and compares to stored `code_challenge`. |

**Processing:**
1. Validate `code` — must exist, not expired (max 5 minutes old), not already used (single-use).
2. Validate `code_verifier` against stored `code_challenge` if PKCE was used.
3. Validate `redirect_uri` matches what was used during `/authorize`.
4. Issue tokens (see §4 Token Issuance).
5. Store refresh token hash in `refresh_tokens` table.
6. Return token response.

**Response:**
```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "<JWT>",
  "refresh_token": "<opaque string>"
}
```

#### 2.5.2 refresh_token

**Parameters:**

| Parameter | Required | Description |
|---|---|---|
| `grant_type` | Yes | `refresh_token` |
| `refresh_token` | Yes | Refresh token previously issued |
| `client_id` | Yes | The OIDC client's ID |

**Processing:**
1. Hash the incoming refresh token and look up in `refresh_tokens` table.
2. Validate: must exist, `revoked_at IS NULL`, `expires_at > NOW()`.
3. Validate `client_id` matches the stored `client_id` on the refresh token row.
4. Revoke the old refresh token (set `revoked_at = NOW()`).
5. Issue new access token and new refresh token (rotation).
6. Store new refresh token hash.
7. Return token response.

**Token rotation:** Every refresh generates a new refresh token. If the old refresh token is presented again after being rotated, treat it as a potential token theft — revoke all tokens for that user+client combination.

#### 2.5.3 client_credentials

**Parameters:**

| Parameter | Required | Description |
|---|---|---|
| `grant_type` | Yes | `client_credentials` |
| `client_id` | Yes | Confidential client ID |
| `client_secret` | Yes | Client secret (plaintext, to be hashed and compared) |
| `scope` | No | Requested scopes |

**Processing:**
1. Look up `client_id` in `oidc_clients`. Must be `client_type = 'confidential'` and `is_active = true`.
2. Hash the provided `client_secret` and compare against `client_secret_hash`. If mismatch: `401 Unauthorized`.
3. Issue access token with no `sub` claim (service identity — not a user).
4. No refresh token issued for client credentials.
5. Return token response (no `id_token`, no `refresh_token`).

**Response:**
```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Status codes for all /token requests:**
- `200 OK` — success
- `400 Bad Request` — missing or invalid parameters (`error` field in body per RFC 6749)
- `401 Unauthorized` — invalid client credentials or invalid/expired code

**Error response body:**
```json
{
  "error": "invalid_grant",
  "error_description": "The authorization code has expired."
}
```

---

### 2.6 POST /device/authorize

**Purpose:** Initiates the device authorization flow. Issues a `user_code` and `device_code` for display on the terminal.

**Authentication:** None (public endpoint; client_id identifies the client).

**Request (application/x-www-form-urlencoded):**

| Parameter | Required | Description |
|---|---|---|
| `client_id` | Yes | Must match a client with `device_code` grant type |
| `scope` | No | Requested scopes; defaults to `openid profile email` |

**Processing:**
1. Validate `client_id` — must exist, `is_active = true`, must have `device_code` in `grant_types`.
2. Generate:
   - `device_code` — cryptographically random, long (32+ bytes), opaque. Store in memory or database with TTL.
   - `user_code` — short, human-readable (e.g., 8 uppercase alphanumeric characters formatted as `ABCD-1234`). Exclude ambiguous characters (0, O, I, 1).
3. Store mapping: `device_code → { user_code, client_id, scope, status: "pending", created_at, expires_at }`.
4. Return response.

**Response (200 OK):**
```json
{
  "device_code": "<opaque string>",
  "user_code": "ABCD-1234",
  "verification_uri": "https://auth.iexcel.com/device",
  "verification_uri_complete": "https://auth.iexcel.com/device?user_code=ABCD-1234",
  "expires_in": 900,
  "interval": 5
}
```

- `expires_in`: 900 seconds (15 minutes). After this, the device_code is invalid.
- `interval`: 5 seconds. Terminal must wait at least this long between polls.

---

### 2.7 GET /device

**Purpose:** Human-facing page where the user enters their `user_code`. Renders an HTML form.

**Authentication:** None (public). User must authenticate via IdP after submitting the code.

**Query parameters:**

| Parameter | Optional | Description |
|---|---|---|
| `user_code` | Optional | Pre-fills the code input field if provided (from `verification_uri_complete`) |

**User journey:**
1. User navigates to this page (opens URL from terminal display).
2. Enters or confirms their `user_code`.
3. Auth service validates the `user_code` — must match a pending `device_code` that has not expired.
4. Auth service redirects the user to the external IdP for authentication (same as authorization code flow but the callback resolves the device flow, not a client redirect_uri).
5. After IdP callback, auth service resolves the device flow: updates the `device_code` record with the authenticated user's identity and sets status to `"complete"`.
6. Page confirms: "You have been authenticated. You may close this tab."

**Error states:**
- Invalid or expired `user_code` → display error message on the page (do not redirect; device codes are not trusted redirect targets).

---

### 2.8 POST /device/token

**Purpose:** Token polling endpoint for device flow. Terminal calls this repeatedly until the user completes authentication or the code expires.

**Authentication:** None. `device_code` is the credential.

**Request (application/x-www-form-urlencoded):**

| Parameter | Required | Description |
|---|---|---|
| `grant_type` | Yes | `urn:ietf:params:oauth:grant-type:device_code` |
| `device_code` | Yes | The `device_code` returned from `/device/authorize` |
| `client_id` | Yes | Same `client_id` used in `/device/authorize` |

**Response states:**

| State | HTTP Status | Response body |
|---|---|---|
| User has not yet authenticated | 400 | `{"error": "authorization_pending"}` |
| Terminal is polling too fast | 400 | `{"error": "slow_down"}` — terminal must increase interval by 5 seconds |
| Device code has expired | 400 | `{"error": "expired_token"}` |
| Device code was denied | 400 | `{"error": "access_denied"}` |
| Authentication complete | 200 | Full token response (access, id, refresh tokens) |

**On success:**
- Issue tokens for the user who completed the device flow.
- Mark the `device_code` as consumed (cannot be used again).
- Store refresh token hash in `refresh_tokens` table.
- Return:

```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "<JWT>",
  "refresh_token": "<opaque string>"
}
```

---

### 2.9 GET /userinfo

**Purpose:** Returns the authenticated user's identity claims.

**Authentication:** Bearer token in `Authorization` header. Access token must be valid and contain `openid` scope.

**Response (200 OK):**
```json
{
  "sub": "user-uuid-here",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "picture": "https://example.com/photo.jpg"
}
```

**Returned claims depend on granted scopes:**
- `openid` scope: `sub` always included
- `profile` scope: `name`, `picture`
- `email` scope: `email`

**Status codes:**
- `200 OK`
- `401 Unauthorized` — missing, expired, or invalid token
- `403 Forbidden` — token does not have `openid` scope

---

### 2.10 GET /health

**Purpose:** Health check for load balancer and deployment pipeline.

**Authentication:** None.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-03T00:00:00Z"
}
```

**Validation performed:**
- Confirm the database connection is reachable (e.g., `SELECT 1` query).
- If database is unreachable: return `503 Service Unavailable` with `{"status": "degraded", "reason": "database_unreachable"}`.

---

## 3. Admin API Endpoints

All `/admin/*` endpoints require an authenticated request with the `admin` scope. Non-admin tokens receive `403 Forbidden`.

### 3.1 GET /admin/clients

**Purpose:** List all registered OIDC clients.

**Response (200 OK):**
```json
{
  "clients": [
    {
      "id": "<uuid>",
      "client_id": "iexcel-ui",
      "client_name": "iExcel Web UI",
      "client_type": "public",
      "grant_types": ["authorization_code", "refresh_token"],
      "redirect_uris": ["https://app.iexcel.com/auth/callback"],
      "scopes": ["openid", "profile", "email"],
      "token_lifetime": 3600,
      "refresh_token_lifetime": 2592000,
      "is_active": true,
      "created_at": "2026-03-03T00:00:00Z",
      "updated_at": "2026-03-03T00:00:00Z"
    }
  ]
}
```

**Note:** `client_secret_hash` is NEVER returned in any API response.

---

### 3.2 POST /admin/clients

**Purpose:** Register a new OIDC client. For confidential clients, generates and returns the plaintext `client_secret` exactly once.

**Request body (application/json):**
```json
{
  "client_id": "new-app",
  "client_name": "New Application",
  "client_type": "confidential",
  "grant_types": ["client_credentials"],
  "redirect_uris": [],
  "scopes": ["openid"],
  "token_lifetime": 3600,
  "refresh_token_lifetime": 2592000
}
```

**Processing:**
1. Validate all fields.
2. Check `client_id` uniqueness — return `409 Conflict` if already exists.
3. For confidential clients: generate a cryptographically random `client_secret` (32+ bytes, base64url encoded), hash it (bcrypt or Argon2), store the hash.
4. Insert into `oidc_clients`.
5. Return the new client record including the plaintext `client_secret` (once only).

**Response (201 Created):**
```json
{
  "id": "<uuid>",
  "client_id": "new-app",
  "client_name": "New Application",
  "client_type": "confidential",
  "client_secret": "<plaintext — shown once>",
  "grant_types": ["client_credentials"],
  "redirect_uris": [],
  "scopes": ["openid"],
  "token_lifetime": 3600,
  "refresh_token_lifetime": 2592000,
  "is_active": true,
  "created_at": "2026-03-03T00:00:00Z"
}
```

---

### 3.3 GET /admin/clients/{id}

**Purpose:** Retrieve a single OIDC client by its UUID.

**Path parameter:** `id` — the UUID primary key (not the `client_id` string).

**Response:** Same shape as a single element from `GET /admin/clients`. `client_secret_hash` is not returned.

**Status codes:**
- `200 OK`
- `404 Not Found` — no client with that UUID

---

### 3.4 PATCH /admin/clients/{id}

**Purpose:** Update a client's configuration. Only provided fields are updated (partial update).

**Updatable fields:** `client_name`, `grant_types`, `redirect_uris`, `scopes`, `token_lifetime`, `refresh_token_lifetime`, `is_active`.

**Not updatable via PATCH:** `client_id` (immutable), `client_type` (immutable), `client_secret_hash` (use rotate-secret endpoint).

**Response:** Updated client object (same shape as GET, without secret hash).

**Status codes:**
- `200 OK`
- `404 Not Found`
- `400 Bad Request` — validation failure

---

### 3.5 DELETE /admin/clients/{id}

**Purpose:** Deactivate a client. Sets `is_active = false`. Does not delete the row.

**Response (200 OK):**
```json
{ "deactivated": true, "client_id": "new-app" }
```

**Note:** A deactivated client's tokens remain valid until they expire. If immediate revocation is needed, use token revocation (out of scope for this feature) or reduce TTL.

---

### 3.6 POST /admin/clients/{id}/rotate-secret

**Purpose:** Invalidate the current client secret and issue a new one.

**Processing:**
1. Generate a new `client_secret`.
2. Hash it and update `client_secret_hash` in the `oidc_clients` row.
3. Return the new plaintext secret (once only).
4. The old secret is immediately invalid.

**Response (200 OK):**
```json
{
  "client_id": "new-app",
  "client_secret": "<new plaintext secret — shown once>"
}
```

---

### 3.7 GET /admin/users

**Purpose:** List all registered users.

**Query parameters (optional):**
| Parameter | Description |
|---|---|
| `is_active` | `true` or `false` — filter by active status |
| `limit` | Page size (default: 50, max: 200) |
| `offset` | Pagination offset |

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "<uuid>",
      "email": "mark@iexcel.com",
      "name": "Mark",
      "idp_provider": "google",
      "is_active": true,
      "created_at": "2026-03-03T00:00:00Z",
      "last_login_at": "2026-03-03T00:00:00Z"
    }
  ],
  "total": 12
}
```

---

### 3.8 GET /admin/users/{id}

**Purpose:** Get detailed information about a single user, including active session count and recent activity.

**Response (200 OK):**
```json
{
  "id": "<uuid>",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "picture": "https://example.com/photo.jpg",
  "idp_provider": "google",
  "idp_subject": "google-oauth2|12345",
  "is_active": true,
  "created_at": "2026-03-03T00:00:00Z",
  "updated_at": "2026-03-03T00:00:00Z",
  "last_login_at": "2026-03-03T00:00:00Z",
  "active_sessions": 2,
  "active_refresh_tokens": 3
}
```

---

### 3.9 POST /admin/users/{id}/deactivate

**Purpose:** Deactivate a user. Sets `is_active = false`. Existing tokens remain valid until expiry (1 hour max). For immediate effect, also call the session revocation endpoint.

**Response (200 OK):**
```json
{ "deactivated": true, "user_id": "<uuid>" }
```

---

### 3.10 DELETE /admin/users/{id}/sessions

**Purpose:** Revoke all active sessions for a user. This forces re-login on next request for all active browser sessions.

**Processing:**
1. Delete all rows from `sessions` where `user_id = {id}`.
2. Set `revoked_at = NOW()` on all rows in `refresh_tokens` where `user_id = {id}` and `revoked_at IS NULL`.

**Response (200 OK):**
```json
{
  "sessions_revoked": 2,
  "refresh_tokens_revoked": 3
}
```

---

## 4. Token Issuance

### 4.1 Access Token (JWT)

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "<key-id matching JWKS>"
}
```

**Payload — user flows (authorization_code, device_code, refresh_token):**
```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "<users.id UUID>",
  "aud": "iexcel-api",
  "iat": 1709136000,
  "exp": 1709139600,
  "scope": "openid profile email",
  "jti": "<unique token ID for revocation tracking>"
}
```

**Payload — client credentials flow (no user context):**
```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "mastra-agent",
  "aud": "iexcel-api",
  "iat": 1709136000,
  "exp": 1709139600,
  "scope": "openid",
  "client_id": "mastra-agent"
}
```

**TTL:** Per client's `token_lifetime` (default: 3600 seconds).

---

### 4.2 ID Token (JWT)

Issued alongside access token in authorization_code and device_code flows. Not issued for client_credentials.

**Payload:**
```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "<users.id UUID>",
  "aud": "<client_id that requested the token>",
  "iat": 1709136000,
  "exp": 1709139600,
  "email": "mark@iexcel.com",
  "name": "Mark",
  "picture": "https://example.com/photo.jpg",
  "nonce": "<if provided in /authorize request>"
}
```

**Claims included based on scope:**
- `openid`: `sub`, `iss`, `aud`, `iat`, `exp` (always)
- `profile`: `name`, `picture`
- `email`: `email`

---

### 4.3 Refresh Token

- Opaque random string (32+ bytes, base64url encoded).
- Stored as a hash in `refresh_tokens.token_hash`.
- TTL per client's `refresh_token_lifetime` (default: 30 days).
- Single-use with rotation: each use issues a new refresh token and revokes the old one.

---

### 4.4 Signing Key Management

- The auth service loads its private signing key from the `SIGNING_KEY_PRIVATE` environment variable at startup.
- The corresponding public key is derived and published via JWKS.
- Each key has a `kid` (key ID) embedded in issued JWTs and published in JWKS.
- Key rotation: when `SIGNING_KEY_PRIVATE` is changed (new key rotation), the auth service publishes both the old and new public keys in JWKS until all tokens signed by the old key have expired.

---

## 5. User Management

### 5.1 User Upsert on Login

When a user successfully authenticates via the IdP (in the `/callback` handler):

1. Extract from IdP token: `idp_subject`, `idp_provider`, `email`, `name`, `picture`.
2. Attempt `SELECT` from `users` where `(idp_subject, idp_provider)` matches.
3. If found:
   - Update `email`, `name`, `picture` if they have changed (IdP is authoritative).
   - Update `last_login_at = NOW()`.
   - If `is_active = false`: reject login — return an error page ("Your account has been deactivated.").
4. If not found:
   - Insert new user row with `gen_random_uuid()` primary key.
   - Set `is_active = true`.
5. The resulting `users.id` becomes the `sub` claim in all issued tokens.

**Upsert must be idempotent.** Concurrent logins from the same user must not result in duplicate rows.

---

### 5.2 Session Lifecycle

**Session creation:**
- Create a `sessions` row when a user completes the authorization code or device flow.
- `expires_at` = login time + 30 days (configurable).
- `idp_session_id` = IdP session identifier if provided in the IdP callback (for future single-logout support).

**Session validation:**
- For endpoints that require an active session (e.g., `/device` code entry), verify the session exists and `expires_at > NOW()`.

**Session destruction:**
- Hard delete the `sessions` row on logout or admin revocation.
- Admin endpoint `DELETE /admin/users/{id}/sessions` hard-deletes all sessions for a user.

---

## 6. Device Flow State Management

Device flow requires tracking in-flight device authorization requests across HTTP calls. State is stored server-side (in-memory with a backing database record, or fully in database).

**Device flow record fields:**

| Field | Description |
|---|---|
| `device_code` | Hashed or raw; opaque to client |
| `user_code` | 8-character code shown to user |
| `client_id` | Which OIDC client initiated the flow |
| `scope` | Requested scopes |
| `status` | `pending`, `complete`, `denied`, `expired` |
| `user_id` | Populated once user completes auth (FK to users.id) |
| `expires_at` | 15 minutes from creation |
| `last_polled_at` | Used to enforce polling interval |

**Polling rate enforcement:** If terminal polls within less than the `interval` (5 seconds), return `slow_down`. Update `last_polled_at` on each poll.

---

## 7. Environment Configuration

All environment variables are loaded at startup. Missing required variables cause the process to exit with a clear error message.

| Variable | Required | Description |
|---|---|---|
| `AUTH_DATABASE_URL` | Yes | Postgres connection string for `iexcel_auth` database |
| `IDP_CLIENT_ID` | Yes | The auth service's OAuth client ID at the external IdP |
| `IDP_CLIENT_SECRET` | Yes | The auth service's OAuth client secret at the external IdP |
| `IDP_ISSUER_URL` | Yes | The external IdP's OIDC issuer URL (e.g., `https://accounts.google.com`) |
| `SIGNING_KEY_PRIVATE` | Yes | PEM-encoded RSA or ECDSA private key for signing JWTs |
| `AUTH_ISSUER_URL` | Yes | The auth service's own issuer URL (e.g., `https://auth.iexcel.com`) |
| `ADMIN_SCOPE` | No | The scope value that grants admin access (default: `admin`) |
| `NODE_ENV` | No | `development` or `production`. Affects logging verbosity and HTTPS enforcement. |
| `PORT` | No | Port to listen on (default: `8090`) |

---

## 8. Error Handling

### 8.1 OAuth/OIDC Error Responses

For redirect-based flows (`/authorize`): errors are sent as query parameters on the redirect back to the client's `redirect_uri`:

```
{redirect_uri}?error=invalid_request&error_description=Missing+required+parameter+scope&state={state}
```

For non-redirect flows (`/token`, `/device/token`, `/admin/*`): errors use JSON body per RFC 6749:

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization code has expired or has already been used."
}
```

### 8.2 Standard Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | Missing or invalid parameter |
| `invalid_client` | 401 | Client authentication failed |
| `invalid_grant` | 400 | Code/token is invalid, expired, or already used |
| `unauthorized_client` | 400 | Client not authorized for this grant type |
| `unsupported_grant_type` | 400 | Grant type not supported |
| `invalid_scope` | 400 | Requested scope is invalid or not allowed |
| `authorization_pending` | 400 | Device flow: user has not yet authenticated |
| `slow_down` | 400 | Device flow: polling too fast |
| `expired_token` | 400 | Device code has expired |
| `access_denied` | 400 | User or system denied the request |

### 8.3 Unhandled Errors

Any unexpected error must return `500 Internal Server Error` with a generic message. Never expose stack traces, internal error details, or database error messages in API responses. Log full errors server-side.

---

## 9. Security Requirements

| Requirement | Implementation |
|---|---|
| Secrets never stored in plaintext | `client_secret_hash` and `token_hash` stored only as bcrypt or Argon2 hashes. Plaintext destroyed after hashing. |
| JWT signing with asymmetric key | Private key signs; public key published via JWKS. Private key loaded only from environment variable (never from file in production). |
| PKCE required for public clients | Authorization code flow rejects public client requests without `code_challenge`. |
| Authorization codes are single-use | Code is marked as consumed on first use. Subsequent use returns `invalid_grant`. |
| Refresh token rotation | Every refresh generates a new refresh token. Reuse of an old token triggers full revocation. |
| Redirect URI exact match | No wildcard matching. No pattern matching. Exact string comparison only. |
| Admin endpoints protected | Require `admin` scope in bearer token. |
| CORS | `/authorize` and `/device` are browser-facing. Token and admin endpoints should restrict CORS to configured origins. |
| State parameter required | `/authorize` must require `state` to prevent CSRF. |

---

## 10. Data Validation Rules

| Input | Validation |
|---|---|
| `client_id` in requests | Must be an existing, active OIDC client |
| `redirect_uri` | Must exactly match a URI in the client's `redirect_uris` list |
| `scope` | Each scope must be in the client's allowed `scopes` list |
| `code_challenge_method` | Only `S256` accepted (plain not supported) |
| Admin client `token_lifetime` | Must be a positive integer, max 86400 (24 hours) |
| Admin client `refresh_token_lifetime` | Must be a positive integer, max 7776000 (90 days) |
| Admin client `grant_types` values | Must be from: `authorization_code`, `refresh_token`, `device_code`, `client_credentials` |
| `user_code` entry in `/device` | Case-insensitive, strip hyphens before lookup |
