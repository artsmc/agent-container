# Feature 32: Terminal Device Auth

## Summary
Implement the device authorization flow for terminal clients. A login command triggers `POST /device/authorize`, displays the user code and verification URL to the user, then polls `POST /device/token` until authentication completes. Tokens are stored at `~/.iexcel/auth/tokens.json`. Silent refresh uses the refresh token. The token store is shared across Claude Code, Claw, and future CLIs.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 05 (auth service — provides the device authorization endpoints), 06 (auth-client package — provides OIDC helpers for device flow)
- **Blocks**: 33 (terminal MCP tools — all MCP tool calls require an authenticated token)

## Source PRDs
- `terminal-prd.md` — Authentication section
- `auth-prd.md` — Device Authorization Flow, pre-registered client `iexcel-terminal`, token storage

## Relevant PRD Extracts

### Authentication (terminal-prd.md)

Authentication uses the Auth Service's **Device Authorization Flow** — designed for CLI/terminal environments where a browser redirect isn't practical. The terminal is registered as OIDC client `iexcel-terminal`.

**Login flow:**
```
1. User runs login command (or first MCP call triggers it)
2. Terminal calls Auth service: POST /device/authorize
3. Auth service returns a user code and verification URL
4. Terminal displays: "Visit https://auth.iexcel.com/device and enter code ABCD-1234"
5. User opens browser, enters code, authenticates via IdP (Google/Okta SSO)
6. Terminal polls Auth service until authentication completes
7. Auth service returns tokens (access + refresh)
8. Tokens stored at ~/.iexcel/auth/tokens.json
9. All subsequent MCP/API requests include the access token automatically
```

**Key details:**
- **Shared token store:** All terminal tools (Claude Code, Claw, future CLIs) read from `~/.iexcel/auth/tokens.json`. Log in once, every tool picks it up.
- **Silent refresh:** When access token expires, the client automatically uses the refresh token. User only re-authenticates when the refresh token expires.
- **SSO:** If the user is already logged into the auth service (e.g., from the Web UI), the device flow completes instantly — no password entry needed.
- **Scoping:** Token carries user identity. The API maps identity to product permissions (which clients, what role).

### Device Authorization Flow (auth-prd.md)

```
1. Terminal client calls: POST /device/authorize
2. Auth service returns:
   - device_code (for polling)
   - user_code (short code like "ABCD-1234")
   - verification_uri (URL to visit)
3. Terminal displays: "Visit https://auth.iexcel.com/device and enter code ABCD-1234"
4. User opens browser, enters code, authenticates via IdP
5. Terminal polls: POST /device/token with device_code
6. Once user completes auth, poll returns tokens
7. Terminal stores tokens locally (~/.iexcel/auth or equivalent)
8. All subsequent requests include the access token
```

### Pre-Registered Client (auth-prd.md)

| Client ID | Type | Grant Types | Description |
|---|---|---|---|
| `iexcel-terminal` | Public | `device_code`, `refresh_token` | Claude Code / Claw — CLI login |

### Token Storage (auth-prd.md)

| Consumer | Storage Location | Token Type |
|---|---|---|
| Claude Code | `~/.iexcel/auth/tokens.json` | Access + refresh tokens |
| Claw | Equivalent config directory | Access + refresh tokens |
| Future CLI tools | `~/.iexcel/auth/tokens.json` (shared) | Access + refresh tokens |

**Key insight:** Terminal tools share the same token store (`~/.iexcel/auth/`). Log in once from any terminal tool, and every other tool on that machine picks up the same session.

### Auth Service Endpoints (auth-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/device/authorize` | POST | Device flow initiation |
| `/device` | GET | Device flow user verification page |
| `/device/token` | POST | Device flow token polling |

### Token Contents — ID Token Claims (auth-prd.md)

```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "user-uuid-here",
  "aud": "iexcel-api",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "iat": 1709136000,
  "exp": 1709139600
}
```

### Unified Token Across Ecosystem (auth-prd.md)

| Scenario | How It Works |
|---|---|
| **Terminal login** | Device flow -> token stored at `~/.iexcel/auth` -> attached to all MCP/API requests |
| **Cross-app navigation** | User is already authenticated -> SSO session avoids re-login |
| **Access revocation** | Deactivate user in auth admin -> tokens rejected everywhere immediately |

## Scope

### In Scope
- Login command/function that initiates the device authorization flow
- `POST /device/authorize` call with `client_id=iexcel-terminal`
- Display of user code and verification URL to the terminal user
- Polling loop on `POST /device/token` with `device_code` until authentication completes
- Handling of polling responses: `authorization_pending` (continue polling), `slow_down` (increase interval), `access_denied` (error), `expired_token` (error), success (tokens received)
- Token storage to `~/.iexcel/auth/tokens.json`:
  - Access token
  - Refresh token
  - Token expiry timestamps
  - User info (sub, email, name)
- Token loading from `~/.iexcel/auth/tokens.json` on startup
- Silent refresh — automatically refresh access token using refresh token before expiry
- Automatic login trigger when an MCP tool call is made without a valid token
- Logout command that clears stored tokens
- File permission handling — `~/.iexcel/auth/tokens.json` should have restricted permissions (readable only by owner)

### Out of Scope
- Auth service implementation (feature 05)
- MCP tool implementations (feature 33)
- API endpoint calls (feature 22 — api-client)
- Web browser UI for the device verification page (that is part of the auth service, feature 05)
- Token encryption at rest (tokens are stored as JSON — file permissions provide security)

## Key Decisions
- The token store at `~/.iexcel/auth/tokens.json` is **shared** across all terminal tools. This means Claude Code, Claw, and any future CLI tool can read the same tokens. The first tool to authenticate writes the tokens; all others read them.
- The `iexcel-terminal` client is a **public** OIDC client — no client secret. This is appropriate for CLI tools distributed to user machines.
- Silent refresh is proactive — the client checks token expiry before making a request and refreshes if the access token is expired or about to expire. The user only needs to re-authenticate when the refresh token itself expires (default: 30 days per auth-prd.md).
- If the user is already logged into the auth service via the Web UI (SSO session exists), the device flow should complete instantly after the user enters the code — no password entry needed at the IdP.
- The polling interval for `POST /device/token` should respect the `interval` parameter returned by the auth service (typically 5 seconds) and the `slow_down` response that requests increasing the interval.
- File permissions on `~/.iexcel/auth/tokens.json` should be set to `0600` (owner read/write only) to prevent other users on the machine from reading the tokens.
