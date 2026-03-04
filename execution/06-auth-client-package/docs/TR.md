# Technical Requirements
# Feature 06: Auth Client Package (`packages/auth-client`)

**Date:** 2026-03-03

---

## 1. Package Identity

| Property | Value |
|---|---|
| **Nx project name** | `auth-client` |
| **Package name** | `@iexcel/auth-client` |
| **Location** | `packages/auth-client/` |
| **Type** | Nx library (not an app; no Dockerfile) |
| **Language** | TypeScript (strict mode) |
| **Runtime target** | Node.js 20+ (all consumers run on Node.js) |

---

## 2. Dependencies

### 2.1 External Dependencies

| Package | Version | Purpose |
|---|---|---|
| `jose` | `^5.x` | JWT verification, JWKS fetching, PKCE utilities. Zero-dependency, RFC-compliant, tree-shakeable ESM. The `panva/jose` library is the industry standard for OIDC/JWT in JavaScript. |

No other external runtime dependencies. The goal is minimal footprint — every consumer that imports `auth-client` brings in only `jose`.

### 2.2 Internal Nx Dependencies

| Package | Usage |
|---|---|
| `@iexcel/shared-types` | Import OIDC-adjacent types if they are defined there. If auth-specific types are defined in `shared-types`, import rather than redefine. |

Note: `shared-types` (feature 01) must be completed before `auth-client` types that reference it can be finalized. Any type overlap should be resolved in favor of importing from `shared-types`.

### 2.3 Dev Dependencies (build/test only)

| Package | Purpose |
|---|---|
| `typescript` | Compilation |
| `@nx/js` | Nx library build target |
| `vitest` | Unit testing |
| `@vitest/coverage-v8` | Code coverage |
| `msw` (Mock Service Worker) | HTTP mocking for unit tests (fetch-level interception) |

---

## 3. File Structure

```
packages/auth-client/
├── src/
│   ├── index.ts                   # Root barrel — re-exports all public API
│   ├── types/
│   │   ├── index.ts               # Re-export all types
│   │   ├── tokens.ts              # TokenSet, StoredTokens, TokenClaims
│   │   ├── discovery.ts           # OidcDiscoveryDocument, DiscoveryOptions
│   │   ├── errors.ts              # Error class hierarchy
│   │   └── flows.ts               # Flow config types (AuthCodeConfig, DeviceFlowConfig, etc.)
│   ├── discovery/
│   │   ├── index.ts               # Public exports
│   │   └── discovery-client.ts    # getDiscoveryDocument implementation + cache
│   ├── validation/
│   │   ├── index.ts               # Public exports
│   │   ├── token-validator.ts     # createTokenValidator, validateToken
│   │   └── jwks-cache.ts          # JWKS cache logic (TTL + force-refresh)
│   ├── refresh/
│   │   ├── index.ts
│   │   └── token-refresh.ts       # refreshAccessToken
│   ├── auth-code/
│   │   ├── index.ts
│   │   ├── pkce.ts                # generatePkceChallenge
│   │   ├── authorize-url.ts       # buildAuthorizeUrl
│   │   └── callback-handler.ts    # exchangeCodeForTokens
│   ├── device-flow/
│   │   ├── index.ts
│   │   ├── initiate.ts            # initiateDeviceFlow
│   │   └── poller.ts              # pollDeviceToken (RFC 8628 loop)
│   ├── client-credentials/
│   │   ├── index.ts
│   │   └── client.ts              # createClientCredentialsClient
│   └── token-storage/
│       ├── index.ts
│       └── file-store.ts          # saveTokens, loadTokens, clearTokens
├── project.json                   # Nx project configuration
├── package.json                   # Package manifest with exports map
├── tsconfig.json                  # Extends workspace tsconfig.base.json
├── tsconfig.lib.json              # Build-specific tsconfig
├── tsconfig.spec.json             # Test-specific tsconfig
└── vite.config.ts                 # Vitest configuration
```

---

## 4. Nx Project Configuration

### 4.1 `project.json`

```json
{
  "name": "auth-client",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/auth-client/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/auth-client",
        "main": "packages/auth-client/src/index.ts",
        "tsConfig": "packages/auth-client/tsconfig.lib.json",
        "assets": ["packages/auth-client/*.md"]
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/auth-client/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/packages/auth-client"],
      "options": {
        "passWithNoTests": true,
        "reportsDirectory": "../../coverage/packages/auth-client"
      }
    }
  },
  "tags": ["scope:shared", "type:library"]
}
```

### 4.2 `package.json` with Subpath Exports

```json
{
  "name": "@iexcel/auth-client",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./types": {
      "types": "./src/types/index.ts",
      "import": "./src/types/index.ts"
    },
    "./discovery": {
      "types": "./src/discovery/index.ts",
      "import": "./src/discovery/index.ts"
    },
    "./validation": {
      "types": "./src/validation/index.ts",
      "import": "./src/validation/index.ts"
    },
    "./refresh": {
      "types": "./src/refresh/index.ts",
      "import": "./src/refresh/index.ts"
    },
    "./auth-code": {
      "types": "./src/auth-code/index.ts",
      "import": "./src/auth-code/index.ts"
    },
    "./device-flow": {
      "types": "./src/device-flow/index.ts",
      "import": "./src/device-flow/index.ts"
    },
    "./client-credentials": {
      "types": "./src/client-credentials/index.ts",
      "import": "./src/client-credentials/index.ts"
    },
    "./token-storage": {
      "types": "./src/token-storage/index.ts",
      "import": "./src/token-storage/index.ts"
    },
    "./package.json": "./package.json"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "jose": "^5.0.0"
  },
  "peerDependencies": {
    "@iexcel/shared-types": "*"
  }
}
```

Note: In the Nx monorepo, the TypeScript path aliases in `tsconfig.base.json` handle resolution without needing to build first. Direct TypeScript source exports (not pre-compiled dist) is the preferred pattern for intra-monorepo consumption.

---

## 5. TypeScript Configuration

### 5.1 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../../packages/shared-types/tsconfig.lib.json" }
  ]
}
```

### 5.2 TypeScript Strict Requirements

- `strict: true` is non-negotiable
- No `any` types without explicit justification and `// eslint-disable` comment
- All function parameters and return types must be explicitly typed
- All error cases must be typed (no `catch (e: any)`)

---

## 6. Core Type Definitions

```typescript
// packages/auth-client/src/types/errors.ts

export class AuthClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

export class DiscoveryError extends AuthClientError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: Error
  ) {
    super(message, 'DISCOVERY_ERROR', cause);
    this.name = 'DiscoveryError';
  }
}

export type TokenValidationErrorReason =
  | 'expired'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'malformed'
  | 'jwks_fetch_failed';

export class TokenValidationError extends AuthClientError {
  constructor(
    message: string,
    public readonly reason: TokenValidationErrorReason,
    cause?: Error
  ) {
    super(message, `TOKEN_VALIDATION_${reason.toUpperCase()}`, cause);
    this.name = 'TokenValidationError';
  }
}

export type DeviceFlowErrorReason =
  | 'expired'
  | 'access_denied'
  | 'timeout'
  | 'server_error';

export class DeviceFlowError extends AuthClientError {
  constructor(
    message: string,
    public readonly reason: DeviceFlowErrorReason,
    cause?: Error
  ) {
    super(message, `DEVICE_FLOW_${reason.toUpperCase()}`, cause);
    this.name = 'DeviceFlowError';
  }
}

export type AuthCallbackErrorReason = 'state_mismatch' | 'provider_error';

export class AuthCallbackError extends AuthClientError {
  constructor(
    message: string,
    public readonly reason: AuthCallbackErrorReason,
    public readonly providerError?: string,
    cause?: Error
  ) {
    super(message, `AUTH_CALLBACK_${reason.toUpperCase()}`, cause);
    this.name = 'AuthCallbackError';
  }
}

export class TokenRefreshError extends AuthClientError {
  constructor(
    message: string,
    public readonly oauthErrorCode: string,
    cause?: Error
  ) {
    super(message, `TOKEN_REFRESH_${oauthErrorCode.toUpperCase()}`, cause);
    this.name = 'TokenRefreshError';
  }
}

export class ClientCredentialsError extends AuthClientError {
  constructor(
    message: string,
    public readonly oauthErrorCode: string,
    cause?: Error
  ) {
    super(message, `CLIENT_CREDENTIALS_${oauthErrorCode.toUpperCase()}`, cause);
    this.name = 'ClientCredentialsError';
  }
}

export class TokenStorageError extends AuthClientError {
  constructor(message: string, cause?: Error) {
    super(message, 'TOKEN_STORAGE_ERROR', cause);
    this.name = 'TokenStorageError';
  }
}
```

```typescript
// packages/auth-client/src/types/tokens.ts

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;     // seconds
  token_type: string;     // 'Bearer'
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_at: number;     // Unix timestamp (seconds)
  issued_at: number;      // Unix timestamp (seconds)
}

export interface TokenClaims {
  sub: string;
  email: string;
  name: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  [key: string]: unknown;
}
```

---

## 7. JWKS Caching Implementation Strategy

The JWKS cache is the most performance-critical component because it is invoked on every authenticated API request.

### 7.1 `jose` Integration

The `jose` library provides `createRemoteJWKSet(url)` which handles JWKS fetching and key selection. However, the default implementation does not support TTL-based cache invalidation with forced refresh on `kid` not found. The implementation must wrap `createRemoteJWKSet` or implement a custom JWKS cache layer:

```typescript
// Pseudocode — implementation in jwks-cache.ts

class JwksCache {
  private keys: jose.JWK[] = [];
  private fetchedAt: number = 0;
  private inFlightFetch: Promise<void> | null = null;

  constructor(
    private readonly jwksUri: string,
    private readonly cacheTtlMs: number,
    private readonly fetchImpl: typeof fetch
  ) {}

  async getKey(kid: string): Promise<jose.KeyLike> {
    // 1. If cache is valid and kid exists, return from cache
    // 2. If cache is stale, refresh (with in-flight deduplication)
    // 3. If kid still not found after refresh, throw TokenValidationError('jwks_fetch_failed')
  }

  private async refresh(): Promise<void> {
    if (this.inFlightFetch) return this.inFlightFetch;
    this.inFlightFetch = this._doFetch().finally(() => {
      this.inFlightFetch = null;
    });
    return this.inFlightFetch;
  }
}
```

Using `jose`'s `jwtVerify` with a custom `JWKS` function that calls into the cache above:

```typescript
import { jwtVerify, createLocalJWKSet } from 'jose';

const result = await jwtVerify(jwt, jwksCache.getKeyFunction(), {
  issuer: config.issuerUrl,
  audience: config.audience,
  algorithms: config.allowedAlgorithms,
  clockTolerance: config.clockSkewToleranceSeconds,
});
```

---

## 8. Device Flow Polling Implementation

RFC 8628 Section 3.5 defines the polling behavior. Key implementation requirements:

```typescript
// Pseudocode — device flow poller

async function pollDeviceToken(
  config: DeviceFlowConfig,
  deviceCode: string,
  initialInterval: number,
  expiresIn: number,
  options?: DeviceFlowPollOptions
): Promise<TokenSet> {
  const expiresAt = Date.now() + expiresIn * 1000;
  let interval = initialInterval;

  while (Date.now() < expiresAt) {
    await sleep(interval * 1000);

    const response = await postToTokenEndpoint({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: config.clientId,
      device_code: deviceCode,
    });

    if (response.ok) {
      return response.json() as TokenSet;
    }

    const error = await response.json();
    switch (error.error) {
      case 'authorization_pending':
        options?.onPrompt?.('Waiting for user to complete authentication...');
        continue;
      case 'slow_down':
        interval += 5; // RFC 8628 §3.5 — increase by 5 seconds
        options?.onPrompt?.(`Slowing down polling. New interval: ${interval}s`);
        continue;
      case 'expired_token':
        throw new DeviceFlowError('Device code expired', 'expired');
      case 'access_denied':
        throw new DeviceFlowError('User denied access', 'access_denied');
      default:
        throw new DeviceFlowError(`Server error: ${error.error}`, 'server_error');
    }
  }

  throw new DeviceFlowError('Device authorization timed out', 'timeout');
}
```

---

## 9. Token Storage Security

### 9.1 File Permissions

```typescript
import { writeFile, mkdir, constants } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_TOKEN_PATH = join(homedir(), '.iexcel', 'auth', 'tokens.json');

async function saveTokens(tokens: StoredTokens, options?: StorageOptions): Promise<void> {
  const filePath = options?.filePath ?? DEFAULT_TOKEN_PATH;
  const dir = path.dirname(filePath);

  // Create directory with restrictive permissions
  await mkdir(dir, { recursive: true, mode: 0o700 });

  // Write file with 0600 permissions (owner read/write only)
  await writeFile(filePath, JSON.stringify(tokens, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}
```

Note: On Windows, file permission mode bits are not enforced in the same way. The `mode: 0o600` applies primarily to Unix-like systems (macOS, Linux). Terminal tools are expected to run on macOS/Linux developer machines.

---

## 10. PKCE Implementation

PKCE uses the Web Crypto API (available in Node.js 18+) via `jose` utilities or native crypto:

```typescript
import { webcrypto } from 'crypto';

export function generatePkceChallenge(): { codeVerifier: string; codeChallenge: string } {
  // Generate 32 random bytes → base64url encode → code_verifier
  const randomBytes = webcrypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64url(randomBytes);

  // SHA-256 hash of code_verifier → base64url encode → code_challenge
  const hash = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64url(new Uint8Array(hash));

  return { codeVerifier, codeChallenge };
}

// Note: jose exports generateSecret and other crypto utilities that can be leveraged
// Alternatively, use jose's built-in PKCE helpers if available in jose v5
```

---

## 11. Environment Variable Defaults

The `apps/api` container receives the following environment variables (from `infra-prd.md`) that the auth-client should read as defaults:

| Env Var | Usage |
|---|---|
| `AUTH_ISSUER_URL` | Default issuer URL for `createTokenValidator` |
| `AUTH_JWKS_URL` | Optional — overrides the JWKS URI derived from discovery. Used as a performance optimization to skip discovery fetch if the JWKS URL is already known. |

Implementation pattern:

```typescript
// In createTokenValidator, if issuerUrl not passed, read from env
const issuerUrl = config.issuerUrl ?? process.env.AUTH_ISSUER_URL;
if (!issuerUrl) {
  throw new Error('AUTH_ISSUER_URL must be configured (env var or config)');
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

All modules must have unit tests using `vitest`. HTTP interactions must be mocked using `msw` (Mock Service Worker) at the `fetch` level, not by mocking module internals.

| Module | Key Test Cases |
|---|---|
| discovery | Cache TTL behavior, error handling, cache invalidation |
| validation | Happy path, each error reason, JWKS refresh on kid-not-found, clock skew |
| refresh | Success with rotation, expired refresh token, network failure |
| auth-code | PKCE generation correctness, URL structure, state mismatch, provider error |
| device-flow | authorization_pending loop, slow_down accumulation, expiry, access_denied, timeout |
| client-credentials | Cache hit, cache miss, expiry buffer, concurrent refresh dedup |
| token-storage | Save/load round-trip, permission mode, missing file returns null, corrupt file returns null |

### 12.2 Test Isolation

- All tests must pass without a running auth service
- `fetchImpl` injection pattern enables full test isolation
- `StorageOptions.filePath` injection enables file store tests in temp directories without polluting `~/.iexcel/`

### 12.3 Coverage Target

Minimum 90% line/branch coverage enforced in CI via `vitest --coverage`.

---

## 13. Nx Dependency Graph Impact

Per `infra-prd.md`, changes to `packages/auth-client/` trigger builds and deploys of:

| Affected App | Why |
|---|---|
| `apps/api` | Imports `@iexcel/auth-client/validation` |
| `apps/ui` | Imports `@iexcel/auth-client/auth-code` and `@iexcel/auth-client/refresh` |
| `apps/mastra` | Imports `@iexcel/auth-client/client-credentials` |

This is reflected in the `project.json` via Nx's implicit dependency tracking — when `auth-client` source changes, `nx affected` will include `api`, `ui`, and `mastra`.

Terminal tools (Claude Code, Claw) are not containers — they run locally. They pick up changes to `auth-client` when the consumer tool is updated.

---

## 14. Performance Considerations

| Concern | Requirement |
|---|---|
| JWKS fetch per-request | MUST NOT happen. Cache with 5-min TTL. Cache hit is sub-millisecond (in-process memory). |
| Discovery fetch frequency | Once per hour per process. All endpoint URLs derived from one cached document. |
| Device flow polling | Must not poll faster than the `interval` parameter from the auth service. No tight retry loops. |
| Client credentials token | One fetch per token lifetime per process. Concurrent deduplication prevents thundering herd. |
| JWT verification | `jose` uses native crypto (Node.js built-in). Verification is CPU-bound, not I/O-bound. Sub-millisecond on modern hardware. |

---

## 15. Security Considerations

| Concern | Mitigation |
|---|---|
| JWKS cache poisoning | JWKS fetched over HTTPS only. TLS validation is the responsibility of the Node.js runtime and the network layer. |
| Token storage permissions | `0600` file permissions on Unix. Tokens not logged or exposed in error messages. |
| PKCE downgrade attack | `code_challenge_method=S256` is required. Plain PKCE is NOT supported. |
| State parameter CSRF | `exchangeCodeForTokens` validates state matches before accepting the code. |
| Refresh token leakage | Refresh tokens are never logged. They appear only in return values. |
| Clock skew | Configurable tolerance (default 60s) prevents false rejections due to minor clock differences between services. |
| Algorithm confusion | Allowed algorithms are explicitly configured. No `none` algorithm is ever permitted. |
| `jose` version pinning | Pin to major version `^5.x` to avoid breaking changes. Monitor security advisories for `jose`. |

---

## 16. Deployment Notes

- `auth-client` is **not deployed independently** — it is a library bundled into each consumer.
- No Dockerfile, no container registry entry, no Terraform module for this package.
- The Nx build target (`@nx/js:tsc`) compiles to `dist/packages/auth-client/` which is consumed by the build pipeline for each app container.
- For local development: TypeScript path aliases in `tsconfig.base.json` mean apps import directly from source — no pre-build step needed in development.

---

## 17. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| Does `jose` v5 provide built-in PKCE generation utilities? | If yes, use them instead of manual Web Crypto implementation | Check `jose` docs before implementing `pkce.ts` |
| Is `shared-types` (feature 01) spec finalized? If so, what auth types are already defined there? | Avoid duplicating types | Review feature 01 spec before writing `types/tokens.ts` |
| Does the auth service (feature 05) implement refresh token rotation? | If yes, the refresh module must surface the new refresh token. If no, `refresh_token` is stable. | Confirm with feature 05 spec |
| What signing algorithm does the auth service use — RS256 or ES256? | Affects default `allowedAlgorithms` and test fixture key generation | Confirm with feature 05 spec |
| Windows support for terminal tools? | `0600` file permissions don't apply on Windows | Confirm target OS for terminal tools (assumed macOS/Linux) |
