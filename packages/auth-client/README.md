# @iexcel/auth-client

Pure TypeScript OIDC authentication client library for the iExcel Automation platform.
No framework dependencies — works in Node.js and edge runtimes.

## Installation

This is a private workspace package. It is available automatically within the monorepo.

## Runtime Dependency

- `jose` ^5.10.0 — JWK/JWT operations via the Web Crypto API

## Subpath Exports

Each module is independently importable for tree-shaking:

| Subpath | Description |
|---|---|
| `@iexcel/auth-client` | Root barrel — re-exports everything |
| `@iexcel/auth-client/types` | All TypeScript types and error classes |
| `@iexcel/auth-client/discovery` | OIDC Discovery Document fetching with cache |
| `@iexcel/auth-client/validation` | JWT validation via JWKS |
| `@iexcel/auth-client/refresh` | Refresh token exchange |
| `@iexcel/auth-client/auth-code` | PKCE authorization code flow |
| `@iexcel/auth-client/device-flow` | Device authorization flow (RFC 8628) |
| `@iexcel/auth-client/client-credentials` | Client credentials grant with caching |
| `@iexcel/auth-client/token-storage` | File-based token persistence |

---

## Usage

### OIDC Discovery

```ts
import { getDiscoveryDocument } from '@iexcel/auth-client/discovery';

const doc = await getDiscoveryDocument('https://auth.iexcel.com');
console.log(doc.token_endpoint);
```

### Token Validation

```ts
import { createTokenValidator } from '@iexcel/auth-client/validation';

const validator = createTokenValidator({
  issuerUrl: 'https://auth.iexcel.com',
  audience: 'iexcel-api',
  clockSkewToleranceSeconds: 30,
});

const claims = await validator.validateToken(jwt);
```

### Token Refresh

```ts
import { refreshAccessToken } from '@iexcel/auth-client/refresh';

const tokens = await refreshAccessToken(
  { issuerUrl: 'https://auth.iexcel.com', clientId: 'my-app' },
  storedRefreshToken
);
```

### Authorization Code Flow (PKCE)

```ts
import {
  generatePkceChallenge,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
} from '@iexcel/auth-client/auth-code';

// Step 1: Generate PKCE and redirect
const { codeVerifier, codeChallenge } = await generatePkceChallenge();
const state = crypto.randomUUID();
const url = await buildAuthorizeUrl(config, state, codeChallenge);
// redirect user to url, persist state + codeVerifier in session

// Step 2: Handle callback
const tokens = await exchangeCodeForTokens(config, callbackUrl, state, codeVerifier);
```

### Device Flow (RFC 8628)

```ts
import { initiateDeviceFlow, pollDeviceToken } from '@iexcel/auth-client/device-flow';

const resp = await initiateDeviceFlow({ issuerUrl, clientId });
console.log(`Visit ${resp.verification_uri} and enter ${resp.user_code}`);

const tokens = await pollDeviceToken(
  { issuerUrl, clientId },
  resp.device_code,
  resp.interval ?? 5,
  resp.expires_in,
  { onPrompt: (msg) => process.stdout.write(msg + '\n') }
);
```

### Client Credentials

```ts
import { createClientCredentialsClient } from '@iexcel/auth-client/client-credentials';

const client = createClientCredentialsClient({
  issuerUrl: 'https://auth.iexcel.com',
  clientId: 'my-service',
  clientSecret: process.env.CLIENT_SECRET,
  scope: 'read:tasks',
});

// Called for every outgoing request — returns cached token when still fresh
const accessToken = await client.getAccessToken();
```

### Token Storage

```ts
import { saveTokens, loadTokens, clearTokens } from '@iexcel/auth-client/token-storage';

await saveTokens({ ...tokenSet, storedAt: new Date().toISOString(), issuer, clientId });
const stored = await loadTokens(); // StoredTokens | null
await clearTokens();
```

---

## Error Hierarchy

All errors extend `AuthClientError` which carries `.code` and `.cause` fields.

```
AuthClientError
├── DiscoveryError
├── TokenValidationError      (.reason: TokenValidationErrorReason)
├── TokenRefreshError         (.oauthError: string | undefined)
├── AuthCallbackError         (.reason: AuthCallbackErrorReason)
├── DeviceFlowError           (.reason: DeviceFlowErrorReason)
├── ClientCredentialsError    (.oauthError: string | undefined)
└── TokenStorageError
```

---

## Design Notes

- All HTTP calls accept an optional `fetchImpl` parameter for testability and edge runtime compatibility.
- No `console.log` or `console.error` — errors are always surfaced as typed exceptions.
- No side effects on import — all work is deferred to function calls.
- Token caching (discovery, JWKS, client credentials) uses in-memory stores with TTL expiry.
- JWKS cache includes in-flight deduplication to prevent concurrent requests from spawning multiple remote key set instances.
