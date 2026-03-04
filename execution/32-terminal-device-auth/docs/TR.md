# TR — Technical Requirements
# Feature 32: Terminal Device Auth

**Date:** 2026-03-03
**Phase:** Phase 7 — Terminal

---

## 1. Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS | Consistent with monorepo (Feature 00 establishes Node.js 22 LTS) |
| Language | TypeScript 5.x (strict mode) | Consistent with monorepo |
| Package manager | `pnpm` | Consistent with monorepo |
| Auth primitives | `@iexcel/auth-client` (Feature 06) | All OIDC protocol logic lives there. Feature 32 is a consumer, not a reimplementation. |
| JWT decoding (profile extraction) | `jose` (via `@iexcel/auth-client`) | Already a transitive dependency; no additional install needed. |
| File system | Node.js built-in `fs/promises`, `os`, `path` | No external dependencies for token storage. |
| Build tool | `@nx/js:tsc` via Nx | Consistent with monorepo library pattern (same as `auth-client`) |
| Testing | `vitest` | Consistent with monorepo |
| HTTP mocking in tests | `msw` (Mock Service Worker) | Consistent with `auth-client` testing strategy |

**No new external runtime dependencies** are required by Feature 32. All OIDC logic is delegated to `@iexcel/auth-client`. Feature 32 is an integration layer.

---

## 2. Package Identity and Location

Feature 32 is implemented as an Nx library in the monorepo:

| Property | Value |
|---|---|
| **Nx project name** | `terminal-auth` |
| **Package name** | `@iexcel/terminal-auth` |
| **Location** | `packages/terminal-auth/` |
| **Type** | Nx library (not an app) |
| **Consumed by** | Any terminal tool: Claude Code MCP config, Claw, future CLIs |

This is a library, not an application. Terminal tool consumers (Claude Code extension config, Claw wrapper) import from `@iexcel/terminal-auth` and wire up the `login`, `logout`, and `getValidAccessToken` exports into their CLI command surfaces.

---

## 3. File Structure

```
packages/terminal-auth/
├── src/
│   ├── index.ts                      # Barrel — re-exports all public API
│   ├── commands/
│   │   ├── login.ts                  # login() function
│   │   └── logout.ts                 # logout() function
│   ├── auth/
│   │   └── token-manager.ts          # getValidAccessToken(), refresh mutex, refresh logic
│   ├── config/
│   │   └── config.ts                 # AUTH_ISSUER_URL, IEXCEL_TOKEN_PATH, IEXCEL_TOKEN_REFRESH_BUFFER_SECONDS
│   ├── display/
│   │   └── terminal-output.ts        # stdout/stderr formatting helpers
│   ├── errors/
│   │   └── index.ts                  # AuthRequiredError class
│   └── types/
│       └── index.ts                  # StoredTokensWithProfile, re-exported types
├── src/__tests__/
│   ├── login.test.ts
│   ├── logout.test.ts
│   ├── token-manager.test.ts
│   └── token-storage.test.ts         # Integration tests against real temp files
├── project.json                      # Nx project configuration
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
└── vite.config.ts                    # Vitest configuration
```

---

## 4. Nx Project Configuration

### 4.1 `project.json`

```json
{
  "name": "terminal-auth",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/terminal-auth/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/terminal-auth",
        "main": "packages/terminal-auth/src/index.ts",
        "tsConfig": "packages/terminal-auth/tsconfig.lib.json",
        "assets": ["packages/terminal-auth/*.md"]
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/terminal-auth/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/packages/terminal-auth"],
      "options": {
        "passWithNoTests": true,
        "reportsDirectory": "../../coverage/packages/terminal-auth"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p packages/terminal-auth/tsconfig.json"
      }
    }
  },
  "tags": ["scope:terminal", "type:library"]
}
```

### 4.2 `package.json`

```json
{
  "name": "@iexcel/terminal-auth",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@iexcel/auth-client": "*"
  },
  "peerDependencies": {}
}
```

Note: `@iexcel/auth-client` is the only runtime dependency. All `jose` and `fs` usage flows through it or Node.js built-ins.

---

## 5. TypeScript Configuration

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
    { "path": "../../packages/auth-client/tsconfig.lib.json" }
  ]
}
```

---

## 6. Core Type Definitions

### 6.1 `StoredTokensWithProfile`

Extends `StoredTokens` from `@iexcel/auth-client/types` with user profile data:

```typescript
// packages/terminal-auth/src/types/index.ts

import type { StoredTokens } from '@iexcel/auth-client/types';

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
}

export interface StoredTokensWithProfile extends StoredTokens {
  user: UserProfile;
}
```

### 6.2 `AuthRequiredError`

```typescript
// packages/terminal-auth/src/errors/index.ts

import { AuthClientError } from '@iexcel/auth-client/types';

export class AuthRequiredError extends AuthClientError {
  constructor(message: string = 'Authentication required. Run `iexcel login` to authenticate.') {
    super(message, 'AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
  }
}
```

---

## 7. Configuration Module

```typescript
// packages/terminal-auth/src/config/config.ts

import { homedir } from 'os';
import { join } from 'path';

export const config = {
  issuerUrl: process.env['AUTH_ISSUER_URL'] ?? 'https://auth.iexcel.com',
  tokenPath: process.env['IEXCEL_TOKEN_PATH'] ?? join(homedir(), '.iexcel', 'auth', 'tokens.json'),
  refreshBufferSeconds: Number(process.env['IEXCEL_TOKEN_REFRESH_BUFFER_SECONDS'] ?? '60'),
  clientId: 'iexcel-terminal',
} as const;
```

The config module is imported by all other modules. It is evaluated at module load time, not at class instantiation. For tests, the environment variables can be set before importing.

---

## 8. Login Command Implementation

### 8.1 `commands/login.ts` — Core Logic

```typescript
import { initiateDeviceFlow, pollDeviceToken } from '@iexcel/auth-client/device-flow';
import { saveTokens, loadTokens } from '@iexcel/auth-client/token-storage';
import { decodeJwt } from 'jose';
import { config } from '../config/config';
import { print, printError } from '../display/terminal-output';
import type { StoredTokensWithProfile } from '../types';

export async function login(): Promise<StoredTokensWithProfile> {
  // 1. Check for existing valid session
  const existing = await loadExistingSession();
  if (existing && !isExpiredOrExpiringSoon(existing)) {
    print(`Already authenticated as ${existing.user.email}. Run logout to clear the session.`);
    return existing;
  }

  // 2. Initiate device flow
  const deviceResponse = await initiateDeviceFlow({
    clientId: config.clientId,
    issuerUrl: config.issuerUrl,
  });

  // 3. Display user instructions
  print(`To authenticate, visit: ${deviceResponse.verification_uri}`);
  print(`Enter code: ${deviceResponse.user_code}`);
  print(`Waiting for authentication... (expires in ${Math.round(deviceResponse.expires_in / 60)} minutes)`);

  // 4. Poll until complete
  const tokenSet = await pollDeviceToken({
    clientId: config.clientId,
    issuerUrl: config.issuerUrl,
    deviceCode: deviceResponse.device_code,
    interval: deviceResponse.interval,
    expiresIn: deviceResponse.expires_in,
  });

  // 5. Extract user profile from id_token
  const claims = decodeJwt(tokenSet.id_token!);
  const user = {
    sub: claims.sub as string,
    email: claims.email as string,
    name: claims.name as string,
  };

  // 6. Build StoredTokensWithProfile
  const now = Math.floor(Date.now() / 1000);
  const stored: StoredTokensWithProfile = {
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token!,
    id_token: tokenSet.id_token,
    token_type: tokenSet.token_type,
    expires_at: now + tokenSet.expires_in,
    issued_at: now,
    user,
  };

  // 7. Save to disk
  await saveTokens(stored as StoredTokens, { filePath: config.tokenPath });

  // 8. Confirm
  print(`Authenticated as ${user.email}`);

  return stored;
}
```

Note: `decodeJwt` from `jose` decodes the JWT without verifying the signature. This is acceptable here because the ID token was just received from the auth service over HTTPS — verification has already occurred at the server. We are only reading the claims.

### 8.2 Display Helpers

```typescript
// packages/terminal-auth/src/display/terminal-output.ts

export function print(message: string): void {
  process.stdout.write(message + '\n');
}

export function printError(message: string): void {
  process.stderr.write(message + '\n');
}
```

---

## 9. Token Manager (`getValidAccessToken`) Implementation

```typescript
// packages/terminal-auth/src/auth/token-manager.ts

import { loadTokens, saveTokens } from '@iexcel/auth-client/token-storage';
import { refreshAccessToken } from '@iexcel/auth-client/refresh';
import { TokenRefreshError } from '@iexcel/auth-client/types';
import { config } from '../config/config';
import { AuthRequiredError } from '../errors';
import { login } from '../commands/login';
import type { StoredTokens } from '@iexcel/auth-client/types';

let refreshInFlight: Promise<string> | null = null;

export async function getValidAccessToken(options: { interactive?: boolean } = {}): Promise<string> {
  const interactive = options.interactive ?? true;
  const tokens = await loadTokens({ filePath: config.tokenPath }) as StoredTokens | null;

  // No session
  if (!tokens) {
    if (interactive) {
      const fresh = await login();
      return fresh.access_token;
    }
    throw new AuthRequiredError();
  }

  // Token is valid
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + config.refreshBufferSeconds) {
    return tokens.access_token;
  }

  // Token needs refresh — deduplicate concurrent calls
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async (): Promise<string> => {
    try {
      const newTokenSet = await refreshAccessToken({
        refreshToken: tokens.refresh_token!,
        clientId: config.clientId,
        issuerUrl: config.issuerUrl,
      });

      const newNow = Math.floor(Date.now() / 1000);
      const updated: StoredTokens = {
        ...tokens,
        access_token: newTokenSet.access_token,
        refresh_token: newTokenSet.refresh_token ?? tokens.refresh_token!,
        expires_at: newNow + newTokenSet.expires_in,
        issued_at: newNow,
      };

      await saveTokens(updated, { filePath: config.tokenPath });
      return updated.access_token;

    } catch (err) {
      if (err instanceof TokenRefreshError && err.oauthErrorCode === 'invalid_grant') {
        // Refresh token expired/revoked — clear and re-authenticate
        await clearTokens({ filePath: config.tokenPath });
        if (interactive) {
          const fresh = await login();
          return fresh.access_token;
        }
        throw new AuthRequiredError();
      }

      // Other errors — if token is not yet fully expired, use it
      if (tokens.expires_at > now) {
        return tokens.access_token;
      }

      if (interactive) {
        const fresh = await login();
        return fresh.access_token;
      }
      throw new AuthRequiredError();
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
```

---

## 10. API Contracts (Auth Service Endpoints Used)

Feature 32 does not call auth service endpoints directly — all calls are made through `@iexcel/auth-client`. The following contracts are exercised:

### 10.1 `POST /device/authorize`

Via `initiateDeviceFlow` from `@iexcel/auth-client/device-flow`.

**Request (application/x-www-form-urlencoded):**
```
client_id=iexcel-terminal
scope=openid profile email
```

**Response:**
```typescript
interface DeviceAuthorizeResponse {
  device_code: string;           // e.g., "GMMhmHCXhWEzkobqIHGG_EnNYYsAkukHspeYUk9E8"
  user_code: string;             // e.g., "ABCD-1234"
  verification_uri: string;     // "https://auth.iexcel.com/device"
  verification_uri_complete: string; // "https://auth.iexcel.com/device?user_code=ABCD-1234"
  expires_in: number;            // 900 (15 minutes)
  interval: number;              // 5 (seconds between polls)
}
```

### 10.2 `POST /device/token`

Via `pollDeviceToken` from `@iexcel/auth-client/device-flow`.

**Request (application/x-www-form-urlencoded):**
```
grant_type=urn:ietf:params:oauth:grant-type:device_code
device_code={device_code}
client_id=iexcel-terminal
```

**Success Response (`TokenSet`):**
```typescript
interface TokenSet {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;   // 3600
  id_token: string;     // JWT — decoded to extract user profile
  refresh_token: string;
}
```

**Error Responses (handled inside `pollDeviceToken`):**
```
{ error: "authorization_pending" }  → continue polling
{ error: "slow_down" }              → increase interval by 5s, continue
{ error: "expired_token" }          → throw DeviceFlowError('expired')
{ error: "access_denied" }          → throw DeviceFlowError('access_denied')
```

### 10.3 `POST /token` (Refresh)

Via `refreshAccessToken` from `@iexcel/auth-client/refresh`.

**Request (application/x-www-form-urlencoded):**
```
grant_type=refresh_token
refresh_token={stored_refresh_token}
client_id=iexcel-terminal
```

**Success Response:**
```typescript
{
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;   // New refresh token (rotation). Must be stored if present.
}
```

**Error Response (triggers re-login):**
```
{ error: "invalid_grant", error_description: "Refresh token expired" }
```

---

## 11. Token File Schema (Canonical)

```typescript
// Full schema written to ~/.iexcel/auth/tokens.json

{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "refresh_token": "a9b8c7d6e5f4...",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "token_type": "Bearer",
  "expires_at": 1741139600,
  "issued_at": 1741136000,
  "user": {
    "sub": "user-uuid-here",
    "email": "mark@iexcel.com",
    "name": "Mark"
  }
}
```

**File permissions:** `0600` (Unix). Directory permissions: `0700`.

---

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| No secrets in stdout/stderr | `access_token`, `refresh_token`, `id_token` must never appear in any log or terminal output. The user code (e.g., "ABCD-1234") is intentionally displayed — it is non-secret. |
| Token file permissions | `saveTokens` (from `@iexcel/auth-client`) writes with `mode: 0o600`. Feature 32 must verify this in tests. |
| Token directory permissions | `mkdir` with `mode: 0o700`. Created recursively. |
| No token verification skip | Do not pass `{ algorithms: ['none'] }` or equivalent to any `jose` function. |
| Signed ID token decoding only | `decodeJwt` (not `jwtVerify`) is used for profile extraction because the auth service has already issued a trusted token over HTTPS. This is acceptable and standard practice for OIDC clients. |
| No token logging | TypeScript `debug`/`trace` logging must exclude token values. Log shapes, not values: `"Loaded tokens: { expires_at: <timestamp>, user.email: <email> }"`. |
| Environment variable isolation | `AUTH_ISSUER_URL` must only be read from environment, never from the token file or user-controlled input. |

---

## 13. Testing Strategy

### 13.1 Unit Tests — All with `msw` HTTP mocking

| Test File | Scenarios |
|---|---|
| `login.test.ts` | Happy path device flow, already authenticated, expired code, access denied, network error on initiate, slow_down interval increase |
| `logout.test.ts` | Clear tokens, logout when not authenticated |
| `token-manager.test.ts` | Valid token returned directly, expired token triggers refresh, proactive refresh within buffer, refresh rotation persists new token, invalid_grant triggers re-login, network error with valid token uses existing, concurrent refresh deduplication, non-interactive throws AuthRequiredError |
| `token-storage.test.ts` | Write tokens to temp dir with 0600 permissions, read back round-trip, corrupted JSON returns null, missing file returns null |

### 13.2 Test Isolation

- All tests use `IEXCEL_TOKEN_PATH` pointed at a temp directory (e.g., `os.tmpdir()/<random>`) — never `~/.iexcel/`.
- `AUTH_ISSUER_URL` is set to `http://localhost:9999` in tests.
- `msw` intercepts all `fetch` calls at the network layer — no real auth service is required.
- The `login()` function can optionally accept injected `initiateDeviceFlow` and `pollDeviceToken` for unit testing without `msw`.

### 13.3 Coverage Target

Minimum 90% line/branch coverage enforced in CI via `vitest --coverage`.

### 13.4 Integration Tests (Optional, CI-Gated)

If a local auth service (Feature 05) is available in the CI environment, a separate `e2e` test suite can exercise the full device flow against a real auth server. These tests are gated behind an environment variable (`IEXCEL_E2E_AUTH=true`) and are not required for the feature to be considered complete.

---

## 14. Performance Requirements

| Operation | Target |
|---|---|
| `getValidAccessToken()` — valid token | < 5ms (file read + expiry check, no network) |
| `getValidAccessToken()` — token needs refresh | < 500ms p99 (one HTTP call to `/token`) |
| `login()` — device flow initiation | < 500ms p99 (one HTTP call to `/device/authorize`) |
| `login()` — polling loop | Controlled by `interval` from auth service (default 5s). No tight loops. |
| `saveTokens()` — file write | < 20ms (local file system) |
| `loadTokens()` — file read | < 10ms (local file system) |

At the scale of personal developer machines, these targets are trivially achievable.

---

## 15. Nx Dependency Graph Impact

Changes to `packages/terminal-auth/` affect:

| Consumer | Why |
|---|---|
| Terminal tool consumers (Claude Code config, Claw) | Import `@iexcel/terminal-auth` directly |
| Feature 33 (`terminal-mcp-tools`) | Imports `getValidAccessToken` from `@iexcel/terminal-auth` |

`packages/terminal-auth/` depends on:

| Dependency | Why |
|---|---|
| `packages/auth-client/` (Feature 06) | All OIDC primitives |

---

## 16. Environment Variable Schema

```bash
# Required in production — has a sensible default
AUTH_ISSUER_URL=https://auth.iexcel.com

# Optional overrides
IEXCEL_TOKEN_PATH=/custom/path/to/tokens.json         # Default: ~/.iexcel/auth/tokens.json
IEXCEL_TOKEN_REFRESH_BUFFER_SECONDS=60                # Default: 60
```

No environment variables are required to be set for the package to function — all have defaults. This is intentional: terminal tools should work out of the box against production without any configuration.

---

## 17. Dependencies on Upstream Features

| Feature | What It Provides |
|---|---|
| **Feature 00 (Nx Monorepo Scaffolding)** | `packages/terminal-auth/` directory, `project.json`, `pnpm` workspace |
| **Feature 05 (Auth Service)** | Running `POST /device/authorize`, `POST /device/token`, `POST /token` endpoints |
| **Feature 06 (Auth Client Package)** | `@iexcel/auth-client` with `initiateDeviceFlow`, `pollDeviceToken`, `refreshAccessToken`, `saveTokens`, `loadTokens`, `clearTokens` |

---

## 18. Contracts for Downstream Features

| Feature | What It Needs from Feature 32 |
|---|---|
| **Feature 33 (Terminal MCP Tools)** | `getValidAccessToken({ interactive: true })` returns a valid Bearer token string. `AuthRequiredError` is thrown when non-interactive and unauthenticated. |

The contract is deliberately minimal. Feature 33 calls `getValidAccessToken()` and uses the result as the `Authorization` header value on all API requests. All authentication complexity is hidden behind that single call.

---

## 19. Decisions and Alternatives Considered

| Decision | Choice | Alternative | Reason |
|---|---|---|---|
| Package scope | Library (`packages/terminal-auth/`) | Application (`apps/terminal-auth/`) | Terminal auth is not a standalone app; it is a dependency library consumed by tool-specific wrappers. Libraries cannot be containerized, which is correct — this code runs on user machines. |
| User profile extraction | `decodeJwt` (no sig verification) | `jwtVerify` against JWKS | The ID token was received over HTTPS from the auth service. Re-verifying its signature locally is unnecessary overhead and adds a JWKS dependency at login time. This follows standard OIDC client practice. |
| Concurrency control | In-process mutex (Promise reference) | File lock | File locks are complex and error-prone. In-process mutex is sufficient because the token manager is a single Node.js module in a single process. |
| Refresh buffer | 60 seconds proactive refresh | Refresh only after expiry | 60-second buffer prevents edge cases where a token expires in the milliseconds between fetching it and making an API call. This is standard practice. |
| Token file format | JSON with user profile embedded | Separate profile file | Single file is simpler for cross-tool sharing. All readers need the same data structure. Embedding profile avoids a `/userinfo` API call on every startup. |
| Windows support | Not required | Full cross-platform | `terminal-prd.md` implies macOS/Linux developer machines. `0600` file permissions are Unix-specific. Confirmed by Feature 06 TR §9.1. |

---

## 20. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| Should `terminal-auth` expose a `whoami()` function that reads and prints the stored user profile? | Nice-to-have for UX. Low implementation effort. | Add as a follow-up in Feature 33 or as a minor addition to this feature. |
| Should logout call `POST /token/revoke` to revoke the refresh token server-side? | Improves security — prevents use of a stolen refresh token after logout. | Feature 05 auth-prd.md does not specify a revocation endpoint. Note in implementation: local clear only for now; add server revocation when Feature 05 exposes it. |
| What happens if `~/.iexcel/auth/` directory is owned by another user (permission error on read)? | `loadTokens()` would throw an OS-level permission error. | Wrap in try/catch in `loadTokens`. Return `null` on any OS error. Log at debug level. |
