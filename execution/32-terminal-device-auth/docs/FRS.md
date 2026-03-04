# FRS — Functional Requirement Specification
# Feature 32: Terminal Device Auth

**Date:** 2026-03-03
**Phase:** Phase 7 — Terminal

---

## 1. Functional Components Overview

Feature 32 consists of five functional components:

| Component | Description |
|---|---|
| **F32-01: Login Command** | Initiates device authorization flow, displays user code, waits for completion |
| **F32-02: Token Storage** | Persists and loads tokens from `~/.iexcel/auth/tokens.json` with correct file permissions |
| **F32-03: Silent Refresh** | Proactively refreshes access token using the stored refresh token |
| **F32-04: Authenticated Token Retrieval** | Returns a valid access token for use by MCP tools; triggers login if no valid session |
| **F32-05: Logout Command** | Clears stored tokens and terminates the local session |

---

## 2. F32-01: Login Command

### 2.1 Description

The login command initiates the OAuth 2.0 Device Authorization Grant flow. It is the primary way a user establishes an authenticated session. It can be invoked explicitly by the user or triggered automatically when an MCP tool call is made without a valid session.

### 2.2 Invocation

The login command is exported as a function `login()` from the auth module. It may be exposed as a CLI command `iexcel login` (or similar) by the terminal tool consumer. It may also be invoked programmatically by `getValidAccessToken()` when no valid session exists.

### 2.3 Login Flow Steps

1. Load the OIDC discovery document from `AUTH_ISSUER_URL/.well-known/openid-configuration` (or use `@iexcel/auth-client/discovery` cache) to resolve the `device_authorization_endpoint`.
2. Call `initiateDeviceFlow({ clientId: 'iexcel-terminal', issuerUrl: AUTH_ISSUER_URL })` from `@iexcel/auth-client/device-flow`.
3. Receive `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`.
4. Print to stdout:

   ```
   To authenticate, visit: https://auth.iexcel.com/device
   Enter code: ABCD-1234

   Waiting for authentication... (expires in 15 minutes)
   ```

5. Call `pollDeviceToken(...)` from `@iexcel/auth-client/device-flow` with the `device_code` and `interval`.
6. On success: receive `TokenSet`, convert to `StoredTokens`, call `saveTokens(...)` from `@iexcel/auth-client/token-storage`.
7. Print to stdout:

   ```
   Authenticated as mark@iexcel.com
   ```

8. Return the `StoredTokens` to the caller.

### 2.4 User Display Requirements

| Display Element | Format | Required |
|---|---|---|
| Verification URL | Full URL on its own line, prefixed with "To authenticate, visit: " | Yes |
| User code | Code on its own line, prefixed with "Enter code: " | Yes |
| Expiry notice | "Waiting for authentication... (expires in N minutes)" | Yes |
| Polling progress | "Waiting for authentication..." or spinner (optional) | Optional |
| Success confirmation | "Authenticated as {email}" | Yes |
| Error message | Human-readable description of the failure | Yes |

### 2.5 Polling Response Handling

The `pollDeviceToken` function in `@iexcel/auth-client` handles RFC 8628 polling responses. Feature 32 must handle the errors thrown by that function:

| Error | User-Facing Message | Behavior |
|---|---|---|
| `DeviceFlowError('expired')` | "Authentication timed out. Please run login again." | Exit login command with error |
| `DeviceFlowError('access_denied')` | "Authentication was denied. Please run login again." | Exit login command with error |
| `DeviceFlowError('timeout')` | "Authentication timed out. Please run login again." | Exit login command with error |
| `DeviceFlowError('server_error')` | "Authentication failed due to a server error. Please try again." | Exit login command with error |
| Network error | "Could not reach the authentication server. Check your connection." | Exit login command with error |

### 2.6 Already-Authenticated Case

Before initiating a new device flow, the login command must check for an existing valid session:

- Call `loadTokens()`. If tokens exist and are not expired (including a short grace period check), print "Already authenticated as {email}. Run logout to clear the session." and return without initiating a new flow.
- If tokens exist but are expired, silently proceed to initiate the device flow (do not attempt silent refresh here — silent refresh is for automated renewal, not for a user-initiated login command).

### 2.7 Error Handling — Network and Server Failures

If the call to `POST /device/authorize` fails (network error, 5xx response), the login command must:
- Print a descriptive error message to stderr.
- Exit with a non-zero exit code (for CLI context) or throw a typed error (for programmatic context).
- Not leave any partial state in the token store.

---

## 3. F32-02: Token Storage

### 3.1 Storage Location

Tokens are stored at `~/.iexcel/auth/tokens.json`. The path is derived as:

```typescript
import { homedir } from 'os';
import { join } from 'path';

const TOKEN_PATH = join(homedir(), '.iexcel', 'auth', 'tokens.json');
```

This path is the canonical location. All terminal tools in the iExcel ecosystem read from and write to this same path.

### 3.2 Token File Schema

The token file is a JSON object matching the `StoredTokens` interface from `@iexcel/auth-client/types`:

```typescript
interface StoredTokens {
  access_token: string;       // JWT access token
  refresh_token: string;      // Opaque refresh token
  id_token?: string;          // JWT ID token (optional)
  token_type: string;         // "Bearer"
  expires_at: number;         // Unix timestamp (seconds) when access token expires
  issued_at: number;          // Unix timestamp (seconds) when tokens were issued
}
```

Additionally, Feature 32 augments the stored data with user profile information extracted from the ID token claims at the time of login:

```typescript
interface StoredTokensWithProfile extends StoredTokens {
  user: {
    sub: string;              // User UUID (from id_token.sub)
    email: string;            // User email (from id_token.email)
    name: string;             // Display name (from id_token.name)
  };
}
```

The `user` field is populated by decoding (not verifying — the auth service already verified this) the ID token claims at save time. This allows the terminal to display "Authenticated as {email}" without making an additional API call.

### 3.3 File Permission Requirements

| Requirement | Value |
|---|---|
| File permissions | `0600` (owner read/write only) |
| Directory permissions | `0700` (owner read/write/execute only) |
| Directory path | `~/.iexcel/auth/` |
| Behavior if directory does not exist | Create it with `0700` permissions |
| Behavior if file already exists | Overwrite. The new token set replaces the old one atomically. |

The `saveTokens` function in `@iexcel/auth-client/token-storage` handles directory creation and file permission setting. Feature 32 calls it directly.

### 3.4 Token Loading Behavior

`loadTokens()` from `@iexcel/auth-client/token-storage` is called:
- At startup / before any authenticated operation.
- To check current auth state (e.g., for the `login --check` flag or for `getValidAccessToken`).

Expected return behaviors:

| Condition | Return Value |
|---|---|
| File exists, valid JSON, tokens present | `StoredTokensWithProfile` object |
| File does not exist | `null` |
| File exists but JSON is malformed or corrupted | `null` (treat as unauthenticated; do not crash) |
| File exists but tokens are structurally invalid (missing required fields) | `null` (treat as unauthenticated) |

Malformed file handling: wrap the `JSON.parse` call in a try/catch. Log a debug message if the file is malformed (do not log the raw file contents). Return `null`.

### 3.5 Shared Token Store Semantics

Because all terminal tools share the same file:
- Token writes are full-file overwrites. There is no merge behavior.
- If two tools attempt to write tokens simultaneously (unlikely in practice), the last write wins. This is acceptable at the scale of personal developer machines.
- All tools must tolerate reading a file that was written by a different tool (same schema).

---

## 4. F32-03: Silent Refresh

### 4.1 Description

Silent refresh is the proactive renewal of an expired or soon-to-expire access token using the stored refresh token. It requires no user interaction. The user only re-authenticates when the refresh token itself has expired (default: 30 days per `auth-prd.md`).

### 4.2 Refresh Trigger Conditions

The `getValidAccessToken()` function (F32-04) checks token validity before returning. A refresh is triggered when:

| Condition | Action |
|---|---|
| `expires_at` is in the past | Trigger refresh |
| `expires_at` is within 60 seconds of now | Trigger refresh (proactive — avoids edge cases where token expires mid-request) |
| `access_token` is missing | Trigger login (not refresh) |
| `refresh_token` is missing | Trigger login (not refresh) |

The 60-second proactive window is configurable as `IEXCEL_TOKEN_REFRESH_BUFFER_SECONDS` with a default of `60`.

### 4.3 Refresh Procedure

1. Call `refreshAccessToken({ refreshToken, clientId: 'iexcel-terminal', issuerUrl: AUTH_ISSUER_URL })` from `@iexcel/auth-client/refresh`.
2. On success: receive a new `TokenSet`. Compute new `StoredTokens` (new `expires_at`, new `issued_at`). If the response includes a new `refresh_token` (rotation), use it. Call `saveTokens(...)` to persist the new tokens.
3. Return the new `access_token`.

### 4.4 Refresh Failure Handling

| Error | Behavior |
|---|---|
| `TokenRefreshError` with `oauthErrorCode: 'invalid_grant'` | Refresh token has expired or been revoked. Clear stored tokens. Trigger interactive login flow. |
| `TokenRefreshError` with any other error code | Log the error. Treat as unauthenticated. Trigger interactive login if in interactive context; throw `AuthRequiredError` if in non-interactive context. |
| Network error | Log the error. If the access token is still valid (not yet expired), return it anyway (network may be temporarily down). If the access token is also expired, throw `AuthRequiredError`. |

### 4.5 Refresh Token Rotation

The iExcel Auth Service (per Feature 05) implements refresh token rotation: each refresh call returns a new refresh token and revokes the old one. Feature 32 must:
- Always persist the new `refresh_token` from the `TokenSet` response if one is present.
- Never cache the old refresh token after a successful refresh.

---

## 5. F32-04: Authenticated Token Retrieval (`getValidAccessToken`)

### 5.1 Description

`getValidAccessToken()` is the primary interface between Feature 32 and Feature 33 (MCP tools). Every MCP tool call invokes this function before making any authenticated API request. It is the single point of truth for whether the terminal is authenticated.

### 5.2 Function Signature

```typescript
async function getValidAccessToken(options?: {
  interactive?: boolean;   // Default: true. If false, throws instead of triggering login flow.
}): Promise<string>
```

Returns the raw access token string (for use as `Authorization: Bearer {token}`).

### 5.3 Decision Logic

```
1. Call loadTokens()
2. If null → no session
   a. If interactive: run login() flow, then return access_token
   b. If not interactive: throw AuthRequiredError
3. If tokens.expires_at > now + refresh_buffer
   → Token is valid. Return tokens.access_token.
4. If tokens.refresh_token exists
   → Attempt silent refresh (F32-03).
   → On success: return new access_token.
   → On failure (invalid_grant): clear tokens
       a. If interactive: run login() flow, then return access_token
       b. If not interactive: throw AuthRequiredError
5. If no refresh_token
   a. If interactive: run login() flow, then return access_token
   b. If not interactive: throw AuthRequiredError
```

### 5.4 Error Types

| Error Class | When Thrown |
|---|---|
| `AuthRequiredError` | `interactive: false` and no valid session could be established without user input |

`AuthRequiredError` extends the base `AuthClientError` from `@iexcel/auth-client/types` with `code: 'AUTH_REQUIRED'`.

### 5.5 Concurrency

If two MCP tool calls are made simultaneously and both trigger a refresh, only one refresh request should be sent. Implement a simple in-process mutex: if a refresh is already in flight, the second caller waits for the same promise rather than issuing a duplicate token request.

```typescript
let refreshInFlight: Promise<string> | null = null;

async function getValidAccessToken(): Promise<string> {
  // ... (check if refresh needed)
  if (needsRefresh && refreshInFlight) {
    return refreshInFlight;
  }
  if (needsRefresh) {
    refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }
  // ...
}
```

---

## 6. F32-05: Logout Command

### 6.1 Description

The logout command clears the stored tokens from `~/.iexcel/auth/tokens.json`. After logout, any call to `getValidAccessToken()` with `interactive: true` will trigger a fresh device flow.

### 6.2 Logout Steps

1. Call `clearTokens()` from `@iexcel/auth-client/token-storage` (deletes the token file or overwrites with empty content).
2. Print to stdout: "Logged out. Your session has been cleared."
3. Return.

### 6.3 Logout When Not Authenticated

If no token file exists (user is not logged in), the logout command must:
- Print "No active session found." to stdout.
- Exit cleanly (no error).

### 6.4 Post-Logout Behavior

After logout:
- All subsequent calls to `getValidAccessToken({ interactive: true })` initiate a fresh device flow.
- All subsequent calls to `getValidAccessToken({ interactive: false })` throw `AuthRequiredError`.
- The `~/.iexcel/auth/tokens.json` file must not exist (or be empty) after logout.

---

## 7. Terminal Module Export Surface

Feature 32 exports the following public API for consumption by Feature 33 (MCP tools) and any terminal tool consumer:

```typescript
// packages/terminal-auth/src/index.ts (or equivalent path — see TR.md)

export { login } from './commands/login';
export { logout } from './commands/logout';
export { getValidAccessToken } from './auth/token-manager';
export { AuthRequiredError } from './errors';
export type { StoredTokensWithProfile } from './types';
```

The `getValidAccessToken` function is the only function that MCP tools need to call. `login` and `logout` are for CLI command bindings.

---

## 8. Configuration

Feature 32 reads the following environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `AUTH_ISSUER_URL` | Base URL of the iExcel Auth Service | `https://auth.iexcel.com` |
| `IEXCEL_TOKEN_PATH` | Override path for token storage | `~/.iexcel/auth/tokens.json` |
| `IEXCEL_TOKEN_REFRESH_BUFFER_SECONDS` | Seconds before expiry to proactively refresh | `60` |

The `AUTH_ISSUER_URL` default allows the terminal to work with the production auth service without any configuration. Developers testing against a local auth service can override it.

---

## 9. Non-Functional Requirements

### 9.1 No Secrets in Output

Under no circumstances should tokens, refresh tokens, or user codes appear in:
- Log output (structured or unstructured).
- Error messages shown to the user.
- Stack traces.

The user code (`ABCD-1234`) is intentionally displayed — it is a short-lived, non-secret code that the user must type into a browser.

### 9.2 Graceful Degradation

If the token file cannot be read (permissions issue, disk error), the terminal must not crash. It must treat the unreadable file as an unauthenticated state and trigger the interactive login flow.

### 9.3 Terminal Output Format

All output is to stdout (success messages, prompts). All errors are to stderr. This allows terminal tool consumers to pipe stdout and capture errors separately.

### 9.4 Cross-Tool Compatibility

The token file schema written by Feature 32 is the canonical schema. Future terminal tools that read `~/.iexcel/auth/tokens.json` must be forward-compatible with this schema. Additional fields may be added by future tools but must not break existing readers.
