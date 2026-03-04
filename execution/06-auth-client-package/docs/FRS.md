# Functional Requirement Specification
# Feature 06: Auth Client Package (`packages/auth-client`)

**Phase:** Phase 1 — Foundation
**Date:** 2026-03-03

---

## 1. Package Overview

`packages/auth-client` is a pure TypeScript library published as an Nx library project. It exports independent modules (subpath exports) so each consumer imports only what it needs.

### 1.1 Module Map

| Export Path | Module | Primary Consumer |
|---|---|---|
| `@iexcel/auth-client` | Root index — re-exports all public API | Any consumer needing multiple modules |
| `@iexcel/auth-client/discovery` | OIDC discovery client | All modules (used internally) |
| `@iexcel/auth-client/validation` | Token validation + JWKS cache | `apps/api` |
| `@iexcel/auth-client/refresh` | Token refresh | `apps/api`, `apps/ui` |
| `@iexcel/auth-client/auth-code` | Authorization code flow + PKCE | `apps/ui` |
| `@iexcel/auth-client/device-flow` | Device authorization flow | Terminal tools |
| `@iexcel/auth-client/client-credentials` | Client credentials flow | `apps/mastra` |
| `@iexcel/auth-client/token-storage` | File-based token store | Terminal tools |
| `@iexcel/auth-client/types` | TypeScript interfaces only | All consumers |

---

## 2. OIDC Discovery Module

### 2.1 Functional Requirements

**FR-DISC-01:** The discovery module MUST fetch the OIDC discovery document from `{issuerUrl}/.well-known/openid-configuration` on first call.

**FR-DISC-02:** The discovery document MUST be cached in-memory for the lifetime of the process. A configurable `discoveryTtlMs` option (default: 3,600,000 ms / 1 hour) controls cache expiry.

**FR-DISC-03:** The module MUST expose a function `getDiscoveryDocument(issuerUrl: string, options?: DiscoveryOptions): Promise<OidcDiscoveryDocument>` that returns a cached or freshly-fetched document.

**FR-DISC-04:** The document MUST contain at minimum: `issuer`, `authorization_endpoint`, `token_endpoint`, `device_authorization_endpoint`, `userinfo_endpoint`, `jwks_uri`, `grant_types_supported`, `scopes_supported`.

**FR-DISC-05:** If the discovery fetch fails (network error, non-200 response), the module MUST throw a typed `DiscoveryError` with the upstream status code and message.

**FR-DISC-06:** All other modules in this package MUST obtain endpoint URLs from the discovery module rather than accepting raw endpoint URLs directly. The only required configuration input to any module is `issuerUrl`.

### 2.2 Input / Output

```typescript
interface DiscoveryOptions {
  cacheTtlMs?: number;       // default: 3_600_000 (1 hour)
  fetchImpl?: typeof fetch;  // injectable for testing
}

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  grant_types_supported: string[];
  scopes_supported: string[];
  response_types_supported: string[];
  // Allow additional standard OIDC fields
  [key: string]: unknown;
}
```

---

## 3. Token Validation Module

### 3.1 Functional Requirements

**FR-VAL-01:** The validation module MUST expose a function `createTokenValidator(config: TokenValidatorConfig): TokenValidator`.

**FR-VAL-02:** The returned `TokenValidator` MUST expose `validateToken(jwt: string): Promise<TokenClaims>`.

**FR-VAL-03:** Validation MUST verify the JWT signature against public keys fetched from the auth service's JWKS endpoint (`jwks_uri` from discovery).

**FR-VAL-04:** JWKS MUST be cached in-process with a configurable TTL (default: 300,000 ms / 5 minutes).

**FR-VAL-05:** On verification failure where the key ID (`kid`) is not found in the cache, the module MUST force-refresh the JWKS before returning an error. This handles key rotation without requiring a full restart.

**FR-VAL-06:** Validation MUST verify the following claims:
- `iss` (issuer) — MUST match the configured `issuerUrl`
- `aud` (audience) — MUST match the configured `audience` value (e.g., `iexcel-api`)
- `exp` (expiration) — MUST be in the future (with configurable clock skew tolerance, default 60 seconds)
- `iat` (issued at) — MUST be in the past

**FR-VAL-07:** On successful validation, the function MUST return a `TokenClaims` object containing: `sub`, `email`, `name`, `iss`, `aud`, `iat`, `exp`, and any additional claims present in the token.

**FR-VAL-08:** On validation failure (expired, invalid signature, wrong issuer/audience, malformed JWT), the module MUST throw a typed `TokenValidationError` with a `reason` discriminator field:

```typescript
type TokenValidationErrorReason =
  | 'expired'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'malformed'
  | 'jwks_fetch_failed';
```

**FR-VAL-09:** The library underlying JWKS verification and JWT parsing MUST be `jose` (panva/jose). This library is zero-dependency, RFC-compliant, and supports RS256 and ES256 — the expected signing algorithms.

**FR-VAL-10:** The validator MUST support both RS256 and ES256 signing algorithms. The `alg` restriction MUST be configurable (default: accept both).

### 3.2 Input / Output

```typescript
interface TokenValidatorConfig {
  issuerUrl: string;
  audience: string;
  jwksCacheTtlMs?: number;       // default: 300_000 (5 minutes)
  clockSkewToleranceSeconds?: number; // default: 60
  allowedAlgorithms?: string[];  // default: ['RS256', 'ES256']
  fetchImpl?: typeof fetch;      // injectable for testing
}

interface TokenClaims {
  sub: string;      // user UUID — primary identity
  email: string;
  name: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  [key: string]: unknown; // additional claims
}
```

---

## 4. Token Refresh Module

### 4.1 Functional Requirements

**FR-REF-01:** The refresh module MUST expose `refreshAccessToken(config: RefreshConfig, refreshToken: string): Promise<TokenSet>`.

**FR-REF-02:** The function MUST POST to the `token_endpoint` from discovery with `grant_type=refresh_token` and the provided refresh token.

**FR-REF-03:** The function MUST include `client_id` in the request. For confidential clients, it MUST also include `client_secret`.

**FR-REF-04:** On success, the function MUST return a `TokenSet` containing: `access_token`, `refresh_token` (may be rotated), `id_token` (optional), `expires_in`, `token_type`.

**FR-REF-05:** If the auth service returns a refresh token rotation response (new `refresh_token` in response), the caller is responsible for persisting the new token. The module surfaces it in the response; it does not store it.

**FR-REF-06:** On failure (expired refresh token, revoked token, network error), the module MUST throw a typed `TokenRefreshError` with a `code` field matching the OAuth error response (`invalid_grant`, `invalid_client`, `server_error`, etc.).

### 4.2 Input / Output

```typescript
interface RefreshConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string; // required for confidential clients
  fetchImpl?: typeof fetch;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;   // present if rotated
  id_token?: string;
  expires_in: number;       // seconds
  token_type: string;       // 'Bearer'
}
```

---

## 5. Authorization Code Flow Module

### 5.1 Functional Requirements

**FR-AUTH-01:** The module MUST expose `buildAuthorizeUrl(config: AuthCodeConfig, state: string, codeVerifier: string): Promise<string>` that constructs the full authorization URL.

**FR-AUTH-02:** The URL MUST include: `response_type=code`, `client_id`, `redirect_uri`, `scope` (joined by space), `state`, and `code_challenge` (SHA-256 of the code verifier, base64url-encoded), `code_challenge_method=S256`.

**FR-AUTH-03:** PKCE (Proof Key for Code Exchange) MUST be used for all authorization code flows. The public client (UI) is a PKCE client; there is no implicit flow.

**FR-AUTH-04:** The module MUST expose `generatePkceChallenge(): { codeVerifier: string; codeChallenge: string }` as a utility for callers to generate a PKCE pair before calling `buildAuthorizeUrl`.

**FR-AUTH-05:** The module MUST expose `exchangeCodeForTokens(config: AuthCodeConfig, callbackUrl: string, state: string, codeVerifier: string): Promise<TokenSet>` that:
1. Parses the `code` and `state` from the callback URL query parameters.
2. Validates that the `state` parameter matches the expected value (CSRF protection).
3. POSTs to the `token_endpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, and `code_verifier`.
4. Returns the `TokenSet`.

**FR-AUTH-06:** If the `state` parameter in the callback does not match, the module MUST throw `AuthCallbackError` with reason `state_mismatch`.

**FR-AUTH-07:** If the callback URL contains an `error` parameter (e.g., `access_denied`), the module MUST throw `AuthCallbackError` with reason `provider_error` and include the upstream error and `error_description`.

### 5.2 Input / Output

```typescript
interface AuthCodeConfig {
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];          // e.g., ['openid', 'profile', 'email']
  fetchImpl?: typeof fetch;
}
```

---

## 6. Device Flow Module

### 6.1 Functional Requirements

**FR-DEV-01:** The module MUST expose `initiateDeviceFlow(config: DeviceFlowConfig): Promise<DeviceAuthorizationResponse>` that POSTs to the `device_authorization_endpoint`.

**FR-DEV-02:** The `DeviceAuthorizationResponse` MUST contain: `device_code`, `user_code`, `verification_uri`, `verification_uri_complete` (optional), `expires_in`, `interval`.

**FR-DEV-03:** The module MUST expose `pollDeviceToken(config: DeviceFlowConfig, deviceCode: string, interval: number, expiresIn: number): Promise<TokenSet>` that implements the RFC 8628 polling loop.

**FR-DEV-04:** The poller MUST wait `interval` seconds between requests (initial wait before first poll).

**FR-DEV-05:** The poller MUST handle `authorization_pending` responses by continuing to poll at the current interval.

**FR-DEV-06:** The poller MUST handle `slow_down` responses by increasing the polling interval by 5 seconds (per RFC 8628 Section 3.5) and continuing.

**FR-DEV-07:** The poller MUST handle `expired_token` responses by throwing `DeviceFlowError` with reason `expired`.

**FR-DEV-08:** The poller MUST handle `access_denied` responses by throwing `DeviceFlowError` with reason `access_denied`.

**FR-DEV-09:** The poller MUST respect the `expires_in` from the initial device authorization response. If polling has continued past expiry without success, it MUST throw `DeviceFlowError` with reason `timeout`.

**FR-DEV-10:** On success (HTTP 200 from the token endpoint), the poller MUST return the `TokenSet`.

**FR-DEV-11:** The module MUST expose an `onPrompt` callback option in `pollDeviceToken` so the caller can display polling status messages (e.g., "Still waiting...") without the module knowing about terminal output.

### 6.2 Input / Output

```typescript
interface DeviceFlowConfig {
  issuerUrl: string;
  clientId: string;
  scopes: string[];          // e.g., ['openid', 'profile', 'email']
  fetchImpl?: typeof fetch;
}

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;        // seconds
  interval: number;          // polling interval in seconds
}

interface DeviceFlowPollOptions {
  onPrompt?: (message: string) => void; // callback for status messages
}
```

---

## 7. Client Credentials Module

### 7.1 Functional Requirements

**FR-CC-01:** The module MUST expose `createClientCredentialsClient(config: ClientCredentialsConfig): ClientCredentialsClient`.

**FR-CC-02:** The returned client MUST expose `getAccessToken(): Promise<string>` that returns a valid access token for the service identity.

**FR-CC-03:** On first call (or after token expiry), `getAccessToken()` MUST POST to the `token_endpoint` with `grant_type=client_credentials`, `client_id`, `client_secret`, and `scope`.

**FR-CC-04:** The client MUST cache the access token in-memory and return the cached token on subsequent calls until it is within a configurable expiry buffer (default: 60 seconds before `exp`).

**FR-CC-05:** Token refresh MUST happen automatically and transparently to the caller. The caller always receives a valid token or a thrown error.

**FR-CC-06:** On failure (invalid client credentials, network error), the module MUST throw `ClientCredentialsError` with the OAuth error code.

**FR-CC-07:** The client MUST be safe to call concurrently. If two concurrent calls find the token expired, only one refresh request MUST be sent (deduplication via in-flight promise).

### 7.2 Input / Output

```typescript
interface ClientCredentialsConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];            // e.g., ['api:read', 'api:write']
  expiryBufferSeconds?: number; // default: 60
  fetchImpl?: typeof fetch;
}

interface ClientCredentialsClient {
  getAccessToken(): Promise<string>;
  // Forces a refresh, ignoring cached token
  forceRefresh(): Promise<string>;
}
```

---

## 8. Token Storage Module (Terminal / File-based)

### 8.1 Functional Requirements

**FR-STORE-01:** The module MUST expose `saveTokens(tokens: StoredTokens, options?: StorageOptions): Promise<void>` that writes tokens to `~/.iexcel/auth/tokens.json`.

**FR-STORE-02:** The module MUST expose `loadTokens(options?: StorageOptions): Promise<StoredTokens | null>` that reads from the same path. Returns `null` if the file does not exist.

**FR-STORE-03:** The storage path MUST be configurable via `StorageOptions.filePath` to override the default. This enables tests to use a temp directory.

**FR-STORE-04:** The directory (`~/.iexcel/auth/`) MUST be created automatically if it does not exist on first write.

**FR-STORE-05:** The tokens file MUST be written with file permissions `0600` (owner read/write only). This is a security requirement — tokens MUST NOT be world-readable.

**FR-STORE-06:** The module MUST expose `clearTokens(options?: StorageOptions): Promise<void>` that deletes the tokens file (logout).

**FR-STORE-07:** If the tokens file exists but cannot be parsed as valid JSON, `loadTokens` MUST return `null` (not throw). The caller decides whether to re-initiate authentication.

**FR-STORE-08:** The `StoredTokens` type MUST include: `access_token`, `refresh_token`, `id_token` (optional), `expires_at` (Unix timestamp in seconds), `token_type`, `issued_at`.

**FR-STORE-09:** All terminal tools on the same machine share the same token store (`~/.iexcel/auth/tokens.json`). This is by design — a user who logs in with Claude Code is also authenticated for Claw and any future terminal tools.

### 8.2 Input / Output

```typescript
interface StoredTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;         // 'Bearer'
  expires_at: number;         // Unix timestamp (seconds)
  issued_at: number;          // Unix timestamp (seconds)
}

interface StorageOptions {
  filePath?: string;           // override default ~/.iexcel/auth/tokens.json
}
```

---

## 9. TypeScript Types Module

### 9.1 Functional Requirements

**FR-TYPES-01:** The `@iexcel/auth-client/types` export MUST define all public TypeScript interfaces and types used across the library.

**FR-TYPES-02:** The types module MUST NOT import from any other module in this package (it is a leaf dependency — no circular imports).

**FR-TYPES-03:** Types that overlap with `packages/shared-types` SHOULD be imported from `@iexcel/shared-types` rather than redefined. For any OIDC-specific types not present in shared-types, they are defined here.

**FR-TYPES-04:** All error classes MUST extend a base `AuthClientError` class that includes: `message`, `code` (string discriminator), and optionally `cause` (upstream Error).

---

## 10. Cross-Cutting Requirements

### 10.1 Fetch Abstraction

**FR-CROSS-01:** All HTTP calls throughout the library MUST use a `fetchImpl` parameter (defaulting to the global `fetch` available in Node.js 18+). This makes every HTTP interaction testable without network access.

### 10.2 Logging

**FR-CROSS-02:** The library MUST NOT write to `console.log`, `console.error`, or any logging framework directly. It MUST surface errors via thrown typed exceptions. Callers are responsible for logging.

### 10.3 No Side Effects on Import

**FR-CROSS-03:** Importing any module from this package MUST NOT trigger network calls, file I/O, or timers. All such operations are deferred until a function is called.

### 10.4 Tree-shakeable

**FR-CROSS-04:** The package MUST be published with ESM exports (or dual CJS/ESM). Consumers that import only `@iexcel/auth-client/validation` MUST NOT include device flow code in their bundle.

### 10.5 Error Hierarchy

All errors thrown by this package MUST follow this hierarchy:

```
AuthClientError (base)
├── DiscoveryError
├── TokenValidationError (+ reason discriminator)
├── TokenRefreshError (+ OAuth error code)
├── AuthCallbackError (+ reason discriminator)
├── DeviceFlowError (+ reason discriminator)
├── ClientCredentialsError (+ OAuth error code)
└── TokenStorageError
```

### 10.6 Environment Variable Fallbacks

**FR-CROSS-05:** For consumers running in server environments, the following environment variables SHOULD be readable as defaults if no explicit configuration is passed:
- `AUTH_ISSUER_URL` — default issuer URL
- `AUTH_JWKS_URL` — overrides the JWKS URL derived from discovery (optional optimization for API)

These are documented defaults only. All configuration can be passed explicitly.
