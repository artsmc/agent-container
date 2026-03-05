# Feature 06: Auth Client Package — Task Update

## Summary

Implemented the `@iexcel/auth-client` pure TypeScript library at
`packages/auth-client/`. The package provides all OIDC/OAuth2 client
utilities needed by the iExcel apps and services.

## Work Accomplished

### Phase A — Package Scaffolding
- Created `package.json` with `"type": "module"`, 8 subpath exports, runtime
  dep `jose@^5.10.0`, and dev deps `vitest`, `@vitest/coverage-v8`, `typescript`.
- Created `tsconfig.json` extending `../../tsconfig.base.json` with strict mode
  and `exactOptionalPropertyTypes: true`.
- Created `tsconfig.lib.json` for the Nx build executor.
- Created `vitest.config.ts` with 90% coverage thresholds.
- Updated `project.json` with `build`, `lint`, `test`, and `type-check` targets
  and tags `scope:shared`, `type:library`.

### Phase B — Type Definitions (`src/types/`)
- `errors.ts` — 7-class error hierarchy rooted at `AuthClientError`.
- `tokens.ts` — `TokenSet`, `StoredTokens`, `TokenClaims` interfaces.
- `discovery.ts` — `OidcDiscoveryDocument`, `DiscoveryOptions` interfaces.
- `flows.ts` — All config interfaces for every flow plus `ClientCredentialsClient`
  and `StorageOptions`.
- `index.ts` — re-exports all types.

### Phase C — Discovery (`src/discovery/`)
- `discovery-client.ts` — `getDiscoveryDocument()` with module-level in-memory
  cache (1h TTL), injectable `fetchImpl`, `clearDiscoveryCache()` helper.

### Phase D — Validation (`src/validation/`)
- `jwks-cache.ts` — `JwksCache` class wrapping `createRemoteJWKSet` with TTL
  expiry and in-flight deduplication.
- `token-validator.ts` — `createTokenValidator()` factory using `jwtVerify`;
  maps all jose error types to typed `TokenValidationError` with correct reason
  discriminator. Supports RS256 and ES256 with configurable clock skew (60s default).

### Phase E — Token Refresh (`src/refresh/`)
- `token-refresh.ts` — `refreshAccessToken()` with rotated refresh token support
  and typed `TokenRefreshError`.

### Phase F — Auth Code / PKCE (`src/auth-code/`)
- `pkce.ts` — `generatePkceChallenge()` using `globalThis.crypto` (Web Crypto API).
- `authorize-url.ts` — `buildAuthorizeUrl()` using discovery for authorization_endpoint.
- `callback-handler.ts` — `exchangeCodeForTokens()` with full state + error validation.

### Phase G — Device Flow (`src/device-flow/`)
- `initiate.ts` — `initiateDeviceFlow()` posting to device_authorization_endpoint.
- `poller.ts` — `pollDeviceToken()` implementing full RFC 8628 polling loop
  (authorization_pending, slow_down +5s, expired_token, access_denied, timeout).

### Phase H — Client Credentials (`src/client-credentials/`)
- `client.ts` — `createClientCredentialsClient()` with in-memory token caching,
  proactive expiry buffer (60s default), and in-flight deduplication.

### Phase I — Token Storage (`src/token-storage/`)
- `file-store.ts` — `saveTokens`, `loadTokens`, `clearTokens` writing to
  `~/.iexcel/auth/tokens.json` with dir mode 0o700, file mode 0o600.
  Missing/malformed files return `null` without throwing.

### Phase J — Root Barrel (`src/index.ts`)
- Re-exports all public APIs from all modules.

### Phase K — Documentation
- `README.md` with consumer guide, usage examples for all flows, error hierarchy.

## Technical Notes for Reviewer

1. **`jose` package was corrupted in pnpm store** — empty package.json files
   (0 bytes). Fixed by removing the corrupted pnpm store entry and re-running
   `pnpm install --frozen-lockfile`. The lockfile already contained jose 5.10.0
   so the package.json was updated from `^5.0.0` to `^5.10.0` to match.

2. **No test files created** — per spec. Coverage targets set to 90% in
   `vitest.config.ts` for future implementation.

3. **`exactOptionalPropertyTypes: true`** — all optional properties use
   `T | undefined` rather than `?:` where a strict distinction is needed,
   which satisfies this compiler option throughout.

4. **Node-only module** — `src/token-storage/file-store.ts` imports `node:fs/promises`,
   `node:path`, and `node:os`. This module should not be imported in browser or
   edge environments.

5. **TypeScript type-check**: `tsc --noEmit -p packages/auth-client/tsconfig.json`
   exits with code 0 (zero errors).
