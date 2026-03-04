# TR — Technical Requirements
# Feature 05: Auth Service

## 1. Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS | Consistent with monorepo (Feature 00 establishes Node.js 22 LTS) |
| Language | TypeScript 5.x | Consistent with monorepo |
| HTTP framework | Fastify 4.x | High performance, TypeScript-native, schema validation built-in |
| OIDC library | `oidc-provider` (panva/node-oidc-provider) | Battle-tested OIDC conformant library; handles spec compliance. Alternative: build from scratch with `jose` for JWT operations. |
| JWT library | `jose` 5.x | OIDC-compliant, native ESM, actively maintained, used internally by oidc-provider |
| Database client | `pg` (node-postgres) with connection pooling | Direct Postgres driver; no ORM. Schema already defined by Feature 03. |
| Password/secret hashing | `argon2` (preferred) or `bcryptjs` | Argon2 is the current best-practice recommendation for password hashing; bcrypt is acceptable fallback |
| Build tool | `esbuild` via Nx | Consistent with monorepo build pipeline |
| Package manager | `pnpm` | Consistent with monorepo |

**Alternative implementation path (build vs buy):**
If `oidc-provider` introduces unacceptable constraints, the service can be built from scratch using:
- `jose` for JWT signing, verification, and JWKS generation
- Custom route handlers for each OIDC endpoint
- This adds implementation complexity but gives full control over every response

The spec is written to be compatible with either approach. The endpoint contracts and token structures are identical.

---

## 2. Application Structure

```
apps/auth/
├── src/
│   ├── routes/
│   │   ├── authorize.ts           # GET /authorize — authorization code initiation
│   │   ├── callback.ts            # GET /callback — IdP callback handler (internal)
│   │   ├── token.ts               # POST /token — all grant types
│   │   ├── device/
│   │   │   ├── authorize.ts       # POST /device/authorize — device flow initiation
│   │   │   ├── verify.ts          # GET /device — user-facing code entry page
│   │   │   └── token.ts           # POST /device/token — polling endpoint
│   │   ├── userinfo.ts            # GET /userinfo
│   │   ├── well-known/
│   │   │   ├── discovery.ts       # GET /.well-known/openid-configuration
│   │   │   └── jwks.ts            # GET /.well-known/jwks.json
│   │   ├── admin/
│   │   │   ├── clients.ts         # /admin/clients CRUD
│   │   │   └── users.ts           # /admin/users management
│   │   └── health.ts              # GET /health
│   ├── services/
│   │   ├── idp.ts                 # External IdP: authorization URL, code exchange, claim extraction
│   │   ├── token.ts               # JWT sign, verify, access/id/refresh token creation
│   │   ├── session.ts             # Session create, validate, destroy
│   │   ├── user.ts                # User upsert, lookup, deactivation
│   │   ├── client.ts              # OIDC client lookup, secret verification, registration
│   │   └── device.ts              # Device flow state: create, poll, resolve
│   ├── db/
│   │   ├── index.ts               # Postgres Pool creation and export
│   │   ├── users.ts               # SQL queries for users table
│   │   ├── clients.ts             # SQL queries for oidc_clients table
│   │   ├── tokens.ts              # SQL queries for refresh_tokens table
│   │   └── sessions.ts            # SQL queries for sessions table
│   ├── middleware/
│   │   ├── auth.ts                # Bearer token validation middleware (for admin routes and /userinfo)
│   │   └── admin.ts               # Admin scope enforcement middleware
│   ├── config.ts                  # Environment variable loading and validation (fail fast on missing required vars)
│   ├── signing-keys.ts            # Load and cache signing key pair; derive JWKS
│   └── index.ts                   # Fastify app setup, plugin registration, server start
├── package.json
└── project.json
```

---

## 3. API Contracts

### 3.1 GET /.well-known/openid-configuration

**Response schema:**
```typescript
interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}
```

---

### 3.2 GET /.well-known/jwks.json

**Response schema:**
```typescript
interface JWKSResponse {
  keys: Array<{
    kty: 'RSA' | 'EC';
    use: 'sig';
    kid: string;
    alg: 'RS256' | 'ES256';
    // RSA-specific:
    n?: string;
    e?: string;
    // EC-specific:
    crv?: string;
    x?: string;
    y?: string;
  }>;
}
```

---

### 3.3 GET /authorize (Query Parameters)

```typescript
interface AuthorizeRequest {
  client_id: string;
  redirect_uri: string;
  response_type: 'code';
  scope: string;                  // space-separated
  state: string;
  code_challenge?: string;        // Required for public clients
  code_challenge_method?: 'S256';
  nonce?: string;
}
```

---

### 3.4 POST /token (Form Body)

**Request (application/x-www-form-urlencoded):**
```typescript
// Authorization code grant
interface TokenRequestAuthCode {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  client_id: string;
  code_verifier?: string;
}

// Refresh token grant
interface TokenRequestRefresh {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
}

// Client credentials grant
interface TokenRequestClientCreds {
  grant_type: 'client_credentials';
  client_id: string;
  client_secret: string;
  scope?: string;
}
```

**Success response:**
```typescript
interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  id_token?: string;          // Not in client_credentials
  refresh_token?: string;     // Not in client_credentials
}
```

**Error response (RFC 6749):**
```typescript
interface TokenErrorResponse {
  error: string;
  error_description?: string;
}
```

---

### 3.5 POST /device/authorize (Form Body)

```typescript
interface DeviceAuthorizeRequest {
  client_id: string;
  scope?: string;
}

interface DeviceAuthorizeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;          // 900
  interval: number;            // 5
}
```

---

### 3.6 POST /device/token (Form Body)

```typescript
interface DeviceTokenRequest {
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code';
  device_code: string;
  client_id: string;
}
```

Response: `TokenResponse` (success) or `TokenErrorResponse` (pending/error).

---

### 3.7 Admin Client Endpoints

**POST /admin/clients Request:**
```typescript
interface CreateClientRequest {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  grant_types: Array<'authorization_code' | 'refresh_token' | 'device_code' | 'client_credentials'>;
  redirect_uris: string[];
  scopes: string[];
  token_lifetime?: number;            // seconds, default 3600
  refresh_token_lifetime?: number;    // seconds, default 2592000
}
```

**PATCH /admin/clients/{id} Request:**
```typescript
interface UpdateClientRequest {
  client_name?: string;
  grant_types?: string[];
  redirect_uris?: string[];
  scopes?: string[];
  token_lifetime?: number;
  refresh_token_lifetime?: number;
  is_active?: boolean;
}
```

**Client Object (responses):**
```typescript
interface ClientObject {
  id: string;                   // UUID
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  grant_types: string[];
  redirect_uris: string[];
  scopes: string[];
  token_lifetime: number;
  refresh_token_lifetime: number;
  is_active: boolean;
  created_at: string;           // ISO 8601
  updated_at: string;
  // client_secret NEVER returned except on create and rotate-secret
}
```

---

## 4. Data Models

The auth service interacts with the four tables defined in Feature 03. No additional tables are created by this feature. All SQL is hand-written (no ORM).

### 4.1 Table Reference

| Table | Primary Operations |
|---|---|
| `users` | SELECT by (idp_subject, idp_provider); UPSERT on login; UPDATE last_login_at; UPDATE is_active |
| `oidc_clients` | SELECT by client_id; INSERT new client; UPDATE (PATCH endpoint); UPDATE is_active; UPDATE client_secret_hash |
| `refresh_tokens` | INSERT on token issuance; SELECT by token_hash (validate); UPDATE revoked_at (revoke); DELETE by user_id (session revocation) |
| `sessions` | INSERT on login; SELECT count by user_id (admin detail); DELETE by user_id (session revocation); DELETE by id (logout) |

### 4.2 Device Flow State

Device flow records are not stored in the Feature 03 schema. Two options:

**Option A (recommended for simplicity): In-memory store with TTL**
- Use a `Map<string, DeviceRecord>` with a background interval that evicts expired entries.
- Acceptable because device codes have a short TTL (15 minutes) and the service is expected to have a small number of concurrent device flows.
- Caveat: does not survive process restart. For production with horizontal scaling, use Option B.

**Option B (production-safe): Postgres table**
- Add a `device_codes` table via a separate migration (can be part of this feature's implementation, added to `packages/auth-database/` as migration 006 or handled inline).
- Fields: `device_code_hash`, `user_code`, `client_id`, `scope`, `status`, `user_id` (nullable), `expires_at`, `last_polled_at`, `created_at`.
- Enables horizontal scaling and survives process restart.

**Decision:** Start with Option A. If horizontal scaling is required before Feature 36 (Terraform deployment), migrate to Option B. Note in README.

### 4.3 Authorization Code State

Authorization codes (from `/authorize` → `/token`) must be stored between the redirect and the code exchange:

**Option A (recommended): In-memory store with TTL**
- Map from code → `{ user_id, client_id, redirect_uri, code_challenge, scope, expires_at, used: boolean }`.
- TTL: 5 minutes.
- Acceptable for single-instance deployments.

**Option B: Postgres table (for horizontal scaling)**
- `authorization_codes` table with the same fields.

Same recommendation as device flow: start in-memory, migrate to DB if horizontal scaling is needed.

---

## 5. External IdP Integration

### 5.1 Integration Pattern

The auth service acts as an OAuth 2.0 **client** to the external IdP, and as an OIDC **provider** to downstream consumers. This is sometimes called "OIDC federation" or "upstream IdP."

```
Terminal/UI → [auth service as OIDC provider] → [external IdP as OIDC provider]
```

### 5.2 IdP-Facing Configuration

The auth service registers itself as an OAuth application with the external IdP (done once, manually):

| Field | Value |
|---|---|
| App type | Web application (confidential client at the IdP) |
| Redirect URI (IdP-side) | `https://auth.iexcel.com/callback` |
| Scopes requested | `openid profile email` |

The IdP issues `IDP_CLIENT_ID` and `IDP_CLIENT_SECRET` to the auth service.

### 5.3 IdP Authorization URL Construction

```typescript
function buildIdpAuthorizationUrl(params: {
  idpIssuerUrl: string;
  idpClientId: string;
  nonce: string;
  state: string;
  scopes: string[];
}): string
```

The auth service fetches the IdP's OIDC discovery document from `{IDP_ISSUER_URL}/.well-known/openid-configuration` at startup to obtain the IdP's `authorization_endpoint` and `token_endpoint`. This avoids hardcoding IdP-specific URLs.

### 5.4 Code Exchange with IdP

After the user authenticates at the IdP and is redirected back to `/callback`:

```typescript
async function exchangeIdpCode(params: {
  code: string;
  idpTokenEndpoint: string;
  idpClientId: string;
  idpClientSecret: string;
  redirectUri: string;
}): Promise<IdpTokenResponse>
```

The IdP returns an ID token and access token. The auth service:
1. Verifies the IdP's ID token signature against the IdP's own JWKS.
2. Extracts claims: `sub` (IdP subject), `email`, `name`, `picture`.
3. Does NOT use the IdP's access token downstream — it issues its own.

---

## 6. JWT Signing and Verification

### 6.1 Signing Key Loading

At startup, `signing-keys.ts` reads `SIGNING_KEY_PRIVATE` (PEM string), imports it using the `jose` library, and derives:
- The `KeyLike` private key object for signing.
- The JWK representation of the public key for JWKS publication.
- A `kid` (key ID) — derived from a SHA-256 thumbprint of the public key.

```typescript
import { importPKCS8, exportJWK, calculateJwkThumbprint } from 'jose';

const privateKey = await importPKCS8(process.env.SIGNING_KEY_PRIVATE!, 'RS256');
const publicKeyJwk = await exportJWK(privateKey.asymmetricKeyDetails...);
const kid = await calculateJwkThumbprint(publicKeyJwk);
```

### 6.2 Access Token Signing

```typescript
import { SignJWT } from 'jose';

const accessToken = await new SignJWT(payload)
  .setProtectedHeader({ alg: 'RS256', kid })
  .setIssuedAt()
  .setExpirationTime(tokenLifetime)
  .sign(privateKey);
```

### 6.3 Access Token Verification (for /userinfo and admin routes)

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';

// Or use local key (preferred — no network call for own tokens):
const { payload } = await jwtVerify(token, privateKey.publicKey, {
  issuer: AUTH_ISSUER_URL,
  audience: 'iexcel-api',
});
```

### 6.4 Key Rotation Strategy

When the signing key is rotated:
1. Both the old and new public keys are published in JWKS, differentiated by `kid`.
2. Tokens signed by the old key have `kid` pointing to the old key — consumers can still verify them.
3. After all old-key tokens have expired (max `token_lifetime` = 1 hour), the old key can be removed from JWKS.
4. Implementation: `signing-keys.ts` can accept an optional `SIGNING_KEY_PRIVATE_PREVIOUS` env var during the transition period.

---

## 7. Database Access Pattern

### 7.1 Connection Pool

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 7.2 Query Pattern

All queries use parameterized statements (no string interpolation):

```typescript
// users.ts
async function upsertUser(params: {
  idpSubject: string;
  idpProvider: string;
  email: string;
  name: string;
  picture: string | null;
}): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (idp_subject, idp_provider, email, name, picture)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (idp_subject, idp_provider)
     DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture = EXCLUDED.picture,
       last_login_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [params.idpSubject, params.idpProvider, params.email, params.name, params.picture]
  );
  return result.rows[0];
}
```

### 7.3 Hashing Strategy

**Client secrets and refresh tokens are hashed before storage.**

```typescript
import argon2 from 'argon2';

// Hash on storage:
const hash = await argon2.hash(plaintext);

// Verify on retrieval:
const valid = await argon2.verify(storedHash, incoming);
```

**Argon2 parameters (production):** use defaults from the `argon2` npm package (Argon2id variant, time cost 3, memory cost 65536, parallelism 4). Adjust if performance is a concern under load.

---

## 8. Security Requirements

| Requirement | Implementation |
|---|---|
| No secrets in logs | Middleware strips `Authorization` headers from request logs. Never log token payloads, secrets, or codes. |
| Signed JWTs only (asymmetric) | `alg` is always RS256 (or ES256). Never HS256 (symmetric HMAC). |
| PKCE enforcement for public clients | Enforce `code_challenge` in `/authorize`; reject missing `code_challenge` for `iexcel-ui` and `iexcel-terminal`. |
| Redirect URI exact match | `===` string comparison. No URL parsing, normalization, or wildcard matching. |
| Authorization code single-use | Mark code `used: true` immediately on first use. Any subsequent use returns `invalid_grant` and logs a security warning. |
| Refresh token rotation | On every refresh, issue a new refresh token and revoke the old. |
| Refresh token reuse detection | If a previously-revoked refresh token is presented, revoke all tokens for that user+client. |
| SQL injection prevention | All database queries use parameterized statements (`$1`, `$2`, etc.). No dynamic SQL construction. |
| Environment variable secrets | `SIGNING_KEY_PRIVATE`, `IDP_CLIENT_SECRET`, database credentials — all from environment variables, never hardcoded or committed. |
| Admin endpoint protection | Middleware validates bearer token, checks for `admin` scope claim. Returns 403 (not 401) if authenticated but not admin. |
| CORS | CORS headers restrict token endpoint and admin endpoints to configured allowed origins. The `/authorize` and `/device` browser endpoints do not need CORS. |
| Rate limiting | Apply basic rate limiting on `/token` and `/device/token` endpoints (e.g., 20 req/min per IP) to mitigate brute-force attacks. |
| HTTPS in production | Auth service must only be accessible via HTTPS in production. Local dev can use HTTP on localhost. |
| Cookie security | If cookies are used for short-lived state (e.g., authorization request session), they must be `HttpOnly`, `Secure`, `SameSite=Lax`, and short-lived (5 minutes for auth code flow state). |

---

## 9. Performance Requirements

| Scenario | Target |
|---|---|
| `GET /.well-known/jwks.json` | < 50ms p99 (served from in-memory cache, no DB call) |
| `GET /.well-known/openid-configuration` | < 20ms p99 (static response built at startup) |
| `POST /token` (authorization_code) | < 500ms p99 (1 DB read for code, 1 DB write for refresh token) |
| `POST /token` (refresh_token) | < 500ms p99 (1 DB read for token hash, 1 DB write for rotation) |
| `GET /userinfo` | < 200ms p99 (1 DB read for user) |
| `POST /device/token` (polling) | < 100ms p99 (in-memory or single DB read) |
| `GET /health` | < 50ms p99 |

At the projected scale of iExcel (tens of users, tens of active sessions), these targets are easily achievable without caching layers beyond the JWKS in-memory cache.

---

## 10. Nx Project Configuration

**`apps/auth/project.json`:**

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "auth",
  "projectType": "application",
  "root": "apps/auth",
  "sourceRoot": "apps/auth/src",
  "tags": ["scope:auth", "type:app"],
  "targets": {
    "build": {
      "executor": "@nx/esbuild:esbuild",
      "options": {
        "outputPath": "dist/apps/auth",
        "main": "apps/auth/src/index.ts",
        "tsConfig": "apps/auth/tsconfig.json",
        "format": ["cjs"]
      }
    },
    "serve": {
      "executor": "@nx/node:node",
      "options": {
        "buildTarget": "auth:build"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["apps/auth/**/*.ts"]
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p apps/auth/tsconfig.json"
      }
    }
  }
}
```

**`apps/auth/package.json`:**

```json
{
  "name": "@iexcel/auth",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "fastify": "^4.0.0",
    "pg": "^8.0.0",
    "jose": "^5.0.0",
    "argon2": "^0.31.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/pg": "^8.0.0",
    "typescript": "~5.7.0"
  }
}
```

---

## 11. Environment Variable Schema

```bash
# Required — auth service will not start without these

# Postgres connection string for iexcel_auth database
AUTH_DATABASE_URL=postgres://auth_user:password@localhost:5432/iexcel_auth?sslmode=require

# External IdP OAuth credentials
IDP_CLIENT_ID=<your-idp-client-id>
IDP_CLIENT_SECRET=<your-idp-client-secret>
IDP_ISSUER_URL=https://accounts.google.com

# PEM-encoded RSA private key for JWT signing
SIGNING_KEY_PRIVATE="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# The auth service's own issuer URL — appears in all issued tokens
AUTH_ISSUER_URL=https://auth.iexcel.com

# Optional

# Previous signing key — used during key rotation transition period
SIGNING_KEY_PRIVATE_PREVIOUS="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Scope value that grants admin access (default: admin)
ADMIN_SCOPE=admin

# Port (default: 8090)
PORT=8090

# Node environment
NODE_ENV=production
```

---

## 12. Deployment Notes

**Container runtime:** Node.js 22. Dockerfile is defined in Feature 35.

**Port:** 8090 (matches `infra-prd.md` specification).

**Health check:** `GET /health` — used by the load balancer to determine readiness. The health endpoint must return 200 only when:
- The process is running.
- A database connection is reachable (verified by a lightweight `SELECT 1` query).

**Startup sequence:**
1. Load and validate all environment variables (`config.ts`). Exit with error if any required variable is missing.
2. Load signing key from `SIGNING_KEY_PRIVATE`. Exit with error if key is invalid.
3. Derive and cache the JWKS response.
4. Fetch external IdP's discovery document from `{IDP_ISSUER_URL}/.well-known/openid-configuration`. Cache the IdP's endpoints.
5. Open Postgres connection pool. Verify connectivity.
6. Register all Fastify routes.
7. Start listening on `PORT`.

**Stateless scaling:** The auth service is horizontally scalable. Multiple instances can run simultaneously because all state (sessions, tokens, user records) is in the auth Postgres database. Authorization codes and device flow records may need to move from in-memory to Postgres (see §4.3) before horizontal scaling is enabled.

**Migrations:** Feature 03 migrations must be applied before the auth service starts. In the CI/CD pipeline (Feature 34), the migration step runs before the container starts receiving traffic.

---

## 13. Dependencies on Upstream Features

| Feature | Dependency |
|---|---|
| Feature 00 (Nx Monorepo Scaffolding) | `apps/auth/` directory and `project.json` must exist |
| Feature 03 (Auth Database Schema) | All four tables must exist in `iexcel_auth` before the auth service starts. The four pre-registered OIDC clients must be seeded. |

---

## 14. Contracts for Downstream Features

| Feature | What It Needs from Feature 05 |
|---|---|
| Feature 06 (Auth Client Package) | JWKS endpoint (`/.well-known/jwks.json`) returning valid RSA public keys. Discovery endpoint returning correct endpoint URLs. `/token` endpoint functioning for all grant types. |
| Feature 24 (UI Auth Flow) | Authorization code flow complete: `/authorize`, `/callback`, `/token` (auth_code grant). |
| Feature 32 (Terminal Device Auth) | Device flow complete: `/device/authorize`, `/device`, `/device/token`. |
| Feature 07 (API Scaffolding, via Feature 06) | Tokens issued by Feature 05 must be verifiable using the JWKS. Token `sub` claim must be a valid user UUID. |

---

## 15. Open Technical Questions

| Question | Default Assumption | Decision Owner |
|---|---|---|
| OIDC library: `oidc-provider` vs custom build? | `oidc-provider` (recommended) | Tech lead |
| JWT signing algorithm: RSA 2048 vs ECDSA P-256? | RS256 (RSA 2048) — broader ecosystem support | Tech lead |
| Device flow and auth code state: in-memory vs Postgres? | In-memory initially; Postgres when horizontal scaling is needed | Tech lead |
| External IdP: Google Workspace, Okta, or Azure AD? | Configurable via environment variables; no code changes required | Business |
| Secret hashing: Argon2 vs bcrypt? | Argon2id (recommended); bcrypt as fallback | Tech lead |
| Admin UI: part of auth service or separate app? | Out of scope for this feature. Admin endpoints are API-only. | Business |
| Rate limiting library? | `@fastify/rate-limit` | Tech lead |
| CORS configuration? | `@fastify/cors` with configurable allowed origins | Tech lead |

---

## 16. Decisions and Alternatives Considered

| Decision | Choice | Alternative | Reason |
|---|---|---|---|
| HTTP framework | Fastify | Express | Fastify's schema validation, TypeScript support, and performance are superior for this use case |
| JWT library | `jose` | `jsonwebtoken` | `jose` is ESM-native, supports JWKS, and is the library used by `oidc-provider`. `jsonwebtoken` is CommonJS and less actively maintained for modern use cases. |
| Token storage | Opaque refresh tokens (hashed) | JWT refresh tokens | Opaque tokens enable server-side revocation without token introspection. JWT refresh tokens cannot be revoked without a blocklist. |
| Admin auth | Scope-based (`admin` scope in token) | Separate admin secret header | Scope-based auth integrates with the existing OIDC token infrastructure. No additional credential management. |
| Redirect URI matching | Exact string match | URL normalization + comparison | URL normalization introduces edge cases (trailing slash, encoding). Exact match is simplest and most secure. |
