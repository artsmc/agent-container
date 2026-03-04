# GS — Gherkin Specification
# Feature 32: Terminal Device Auth

**Date:** 2026-03-03
**Phase:** Phase 7 — Terminal

---

## Feature: Terminal Device Authorization Login

  As an iExcel terminal user
  I want to authenticate once using a device code flow
  So that I can use all iExcel terminal tools without managing API keys

---

### Background

  Given the iExcel Auth Service is running at "https://auth.iexcel.com"
  And the OIDC client "iexcel-terminal" is registered as a public client with grant types "device_code" and "refresh_token"
  And the token storage path is "~/.iexcel/auth/tokens.json"

---

## Feature: Login — Happy Path

### Scenario: User runs login command and completes device flow successfully

  Given the user has no existing session (tokens.json does not exist)
  When the user invokes the login command
  Then the terminal calls "POST /device/authorize" with "client_id=iexcel-terminal"
  And the terminal displays the verification URL "https://auth.iexcel.com/device"
  And the terminal displays the user code "ABCD-1234"
  And the terminal displays a message "Waiting for authentication... (expires in 15 minutes)"
  When the user visits the verification URL and enters the code in their browser
  And the user authenticates via SSO
  Then the terminal receives a TokenSet containing an access_token, refresh_token, and id_token
  And the terminal writes tokens to "~/.iexcel/auth/tokens.json" with file permissions 0600
  And the terminal displays "Authenticated as mark@iexcel.com"
  And the login command exits successfully

### Scenario: User is already logged in to the browser SSO session — device flow completes instantly

  Given the user has no existing session in the terminal
  But the user is already authenticated via SSO in their browser
  When the user invokes the login command
  And the user visits the verification URL and enters the code
  Then the terminal poll returns tokens on the next poll without delay
  And the terminal displays "Authenticated as mark@iexcel.com"

### Scenario: Terminal displays verification_uri_complete for QR or direct navigation

  Given the auth service returns "verification_uri_complete" in the device authorize response
  When the user invokes the login command
  Then the terminal uses the "verification_uri" (base URL) for the displayed URL
  And the "verification_uri_complete" may be used for a future QR code feature (not required in this feature)

---

## Feature: Login — Already Authenticated

### Scenario: User runs login when a valid session already exists

  Given the user has a valid session with tokens stored at "~/.iexcel/auth/tokens.json"
  And the access token expiry is more than 60 seconds in the future
  When the user invokes the login command
  Then the terminal does not call "POST /device/authorize"
  And the terminal displays "Already authenticated as mark@iexcel.com. Run logout to clear the session."
  And the login command exits without error

### Scenario: User runs login when session is expired but can be silently refreshed

  Given the user has stored tokens at "~/.iexcel/auth/tokens.json"
  And the access token has expired
  And a valid refresh token is present
  When the user invokes the login command
  Then the terminal initiates a fresh device flow (does not attempt silent refresh during explicit login)
  And the login flow proceeds as the happy path

---

## Feature: Login — Polling Error States

### Scenario: Device code expires before user completes authentication

  Given the user has invoked the login command
  And the terminal is polling for authentication
  When the device code TTL expires (15 minutes elapsed without user action)
  Then the poll returns "expired_token"
  And the terminal displays "Authentication timed out. Please run login again."
  And the login command exits with an error
  And no tokens are written to disk

### Scenario: User denies the authorization request in the browser

  Given the user has invoked the login command
  And the terminal is polling for authentication
  When the user clicks "Deny" in the browser
  Then the poll returns "access_denied"
  And the terminal displays "Authentication was denied. Please run login again."
  And the login command exits with an error
  And no tokens are written to disk

### Scenario: Auth service requests polling slow-down

  Given the terminal is polling "POST /device/token"
  When the auth service returns "slow_down"
  Then the terminal increases the polling interval by 5 seconds
  And continues polling at the new interval
  And does not display an error to the user

### Scenario: Auth service returns authorization_pending during polling

  Given the terminal is polling "POST /device/token"
  When the auth service returns "authorization_pending"
  Then the terminal continues polling at the current interval
  And does not display an error to the user

---

## Feature: Login — Network and Server Errors

### Scenario: Auth service is unreachable when initiating device flow

  Given the user invokes the login command
  When the call to "POST /device/authorize" fails with a network error
  Then the terminal displays "Could not reach the authentication server. Check your connection." to stderr
  And the login command exits with an error
  And no partial state is written to the token store

### Scenario: Auth service returns 5xx when initiating device flow

  Given the user invokes the login command
  When the call to "POST /device/authorize" returns HTTP 503
  Then the terminal displays "Authentication failed due to a server error. Please try again." to stderr
  And the login command exits with an error

---

## Feature: Token Storage

### Scenario: Tokens are stored with correct file permissions on first login

  Given no token file exists at "~/.iexcel/auth/tokens.json"
  When the terminal writes tokens after a successful device flow
  Then the directory "~/.iexcel/auth/" is created with permissions 0700
  And the file "~/.iexcel/auth/tokens.json" is created with permissions 0600
  And the file contains valid JSON matching the StoredTokensWithProfile schema

### Scenario: Token file is overwritten on re-login

  Given a token file exists at "~/.iexcel/auth/tokens.json"
  When the terminal completes a new device flow
  Then the existing token file is overwritten with the new tokens
  And the file permissions remain 0600

### Scenario: Token file contains user profile information

  Given the terminal has completed a successful device flow
  And the id_token contains claims: sub="user-uuid", email="mark@iexcel.com", name="Mark"
  When the tokens are saved to disk
  Then the token file contains a "user" object with sub, email, and name
  And the access_token and refresh_token are stored verbatim (not modified)
  And the expires_at is computed as the current Unix timestamp plus the expires_in value

### Scenario: Corrupted token file is handled gracefully

  Given the token file at "~/.iexcel/auth/tokens.json" contains invalid JSON
  When any operation calls loadTokens()
  Then the function returns null
  And no exception is thrown to the caller
  And the terminal treats the state as unauthenticated

### Scenario: Missing token file is handled gracefully

  Given the token file at "~/.iexcel/auth/tokens.json" does not exist
  When any operation calls loadTokens()
  Then the function returns null
  And no exception is thrown

### Scenario: Token file written by Claw is readable by Claude Code

  Given Claw has written tokens to "~/.iexcel/auth/tokens.json"
  And the token file conforms to the StoredTokensWithProfile schema
  When the Claude Code terminal tool calls loadTokens()
  Then it successfully reads and returns the stored tokens
  And getValidAccessToken() returns the access_token without initiating a new login

---

## Feature: Silent Refresh

### Scenario: Access token is silently refreshed when expired

  Given the terminal has stored tokens with an expired access_token
  And a valid refresh_token is stored
  When getValidAccessToken() is called
  Then the terminal calls "POST /token" with grant_type "refresh_token"
  And the terminal receives a new access_token and optionally a new refresh_token
  And the new tokens are saved to "~/.iexcel/auth/tokens.json"
  And getValidAccessToken() returns the new access_token
  And the user sees no interruption

### Scenario: Access token is proactively refreshed when within 60 seconds of expiry

  Given the terminal has stored tokens expiring in 45 seconds
  When getValidAccessToken() is called
  Then the terminal proactively refreshes the token (does not wait for it to expire)
  And returns the new access_token

### Scenario: Refresh token rotation — new refresh token is persisted

  Given the terminal performs a silent refresh
  When the auth service returns both a new access_token and a new refresh_token
  Then the terminal saves the new refresh_token to "~/.iexcel/auth/tokens.json"
  And the old refresh_token is no longer stored

### Scenario: Refresh token has expired — triggers interactive re-login

  Given the terminal has stored tokens with an expired access_token
  And the stored refresh_token has expired or been revoked
  When getValidAccessToken({ interactive: true }) is called
  Then the token endpoint returns error "invalid_grant"
  And the terminal clears the stored tokens
  And the terminal initiates a fresh device flow
  And the user is prompted to authenticate again

### Scenario: Refresh token has expired in non-interactive context — throws error

  Given the terminal has stored tokens with an expired access_token
  And the stored refresh_token has expired
  When getValidAccessToken({ interactive: false }) is called
  Then the terminal throws AuthRequiredError
  And no user-facing prompt is shown

### Scenario: Network error during refresh — falls back to existing access token if still valid

  Given the terminal has stored tokens
  And the access token has not yet expired
  But a network error occurs when attempting refresh
  When getValidAccessToken() is called and a proactive refresh is attempted
  Then the terminal logs the network error (debug level)
  And returns the still-valid access_token

### Scenario: Two concurrent callers both need a refresh — only one refresh request is sent

  Given the access token is expired
  And two async operations call getValidAccessToken() simultaneously
  When both calls detect the token needs refreshing
  Then only one "POST /token" request is sent to the auth service
  And both callers receive the same new access_token
  And the token file is written exactly once

---

## Feature: Automatic Login Trigger (MCP Tool Call Context)

### Scenario: MCP tool call without an existing session triggers login interactively

  Given no session exists at "~/.iexcel/auth/tokens.json"
  When an MCP tool calls getValidAccessToken({ interactive: true })
  Then the terminal initiates the device flow
  And displays the verification URL and user code
  And waits for the user to complete authentication
  And then returns the access_token to the calling MCP tool

### Scenario: MCP tool call in non-interactive context without session throws AuthRequiredError

  Given no session exists at "~/.iexcel/auth/tokens.json"
  When an MCP tool calls getValidAccessToken({ interactive: false })
  Then AuthRequiredError is thrown immediately
  And no device flow is initiated

---

## Feature: Logout

### Scenario: User logs out and clears their session

  Given the user has a valid session at "~/.iexcel/auth/tokens.json"
  When the user invokes the logout command
  Then the token file at "~/.iexcel/auth/tokens.json" is deleted or cleared
  And the terminal displays "Logged out. Your session has been cleared."
  And subsequent calls to getValidAccessToken({ interactive: false }) throw AuthRequiredError

### Scenario: User runs logout when no session exists

  Given no token file exists at "~/.iexcel/auth/tokens.json"
  When the user invokes the logout command
  Then the terminal displays "No active session found."
  And the command exits cleanly with no error

### Scenario: After logout, re-login is possible

  Given the user has just run logout
  When the user invokes the login command
  Then the terminal initiates a fresh device flow
  And the flow proceeds as the happy path login scenario

---

## Feature: Configuration and Environment

### Scenario: AUTH_ISSUER_URL defaults to production

  Given AUTH_ISSUER_URL is not set in the environment
  When any auth operation is performed
  Then the terminal uses "https://auth.iexcel.com" as the issuer URL

### Scenario: AUTH_ISSUER_URL is overridden for local development

  Given AUTH_ISSUER_URL is set to "http://localhost:8090"
  When the login command is invoked
  Then the terminal calls "POST http://localhost:8090/device/authorize"

### Scenario: IEXCEL_TOKEN_PATH overrides the default storage location

  Given IEXCEL_TOKEN_PATH is set to "/tmp/test-tokens.json"
  When the terminal writes tokens
  Then the tokens are written to "/tmp/test-tokens.json"
  And not to "~/.iexcel/auth/tokens.json"
