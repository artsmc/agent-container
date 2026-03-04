# Gherkin Specification
# Feature 06: Auth Client Package (`packages/auth-client`)

**Date:** 2026-03-03

---

## Feature: OIDC Discovery

```gherkin
Feature: OIDC Discovery Client
  As a consumer of the auth-client library
  I want to automatically discover OIDC endpoints from the issuer URL
  So that I do not need to hardcode endpoint paths in my application

  Background:
    Given the auth service is running at "https://auth.iexcel.com"
    And the discovery document at "https://auth.iexcel.com/.well-known/openid-configuration" returns:
      """json
      {
        "issuer": "https://auth.iexcel.com",
        "authorization_endpoint": "https://auth.iexcel.com/authorize",
        "token_endpoint": "https://auth.iexcel.com/token",
        "device_authorization_endpoint": "https://auth.iexcel.com/device/authorize",
        "jwks_uri": "https://auth.iexcel.com/.well-known/jwks.json"
      }
      """

  Scenario: Fetch discovery document on first call
    When I call getDiscoveryDocument("https://auth.iexcel.com")
    Then it returns the discovery document with all standard endpoints
    And the document is cached in memory

  Scenario: Return cached document on subsequent calls within TTL
    Given getDiscoveryDocument has been called once
    When I call getDiscoveryDocument("https://auth.iexcel.com") again within the cache TTL
    Then no HTTP request is made
    And the cached document is returned

  Scenario: Refresh document after TTL expiry
    Given the discovery document was cached 2 hours ago
    And the default cache TTL is 1 hour
    When I call getDiscoveryDocument("https://auth.iexcel.com")
    Then a new HTTP request is made to fetch the document
    And the cache is updated

  Scenario: Handle discovery endpoint unavailable
    Given the discovery endpoint returns HTTP 503
    When I call getDiscoveryDocument("https://auth.iexcel.com")
    Then a DiscoveryError is thrown
    And the error contains the HTTP status code 503

  Scenario: Handle malformed discovery response
    Given the discovery endpoint returns invalid JSON
    When I call getDiscoveryDocument("https://auth.iexcel.com")
    Then a DiscoveryError is thrown with message indicating parse failure
```

---

## Feature: Token Validation

```gherkin
Feature: JWT Token Validation
  As the API application
  I want to validate incoming Bearer tokens
  So that only authenticated users can access protected resources

  Background:
    Given a TokenValidator is created with:
      | issuerUrl | https://auth.iexcel.com |
      | audience  | iexcel-api              |
    And the auth service JWKS endpoint returns a valid RSA public key

  Scenario: Validate a well-formed, unexpired JWT
    Given a valid JWT signed by the auth service with:
      | iss   | https://auth.iexcel.com |
      | aud   | iexcel-api              |
      | sub   | user-uuid-abc-123       |
      | email | mark@iexcel.com         |
      | name  | Mark                    |
      | exp   | 1 hour from now         |
    When I call validateToken(jwt)
    Then it returns TokenClaims with:
      | sub   | user-uuid-abc-123 |
      | email | mark@iexcel.com   |
      | name  | Mark              |

  Scenario: Reject an expired token
    Given a JWT with exp set to 5 minutes ago
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "expired"

  Scenario: Reject a token with wrong issuer
    Given a JWT with iss set to "https://other-issuer.com"
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "invalid_issuer"

  Scenario: Reject a token with wrong audience
    Given a JWT with aud set to "other-service"
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "invalid_audience"

  Scenario: Reject a token with invalid signature
    Given a JWT whose signature has been tampered with
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "invalid_signature"

  Scenario: Reject a malformed token string
    Given the string "not.a.jwt"
    When I call validateToken("not.a.jwt")
    Then a TokenValidationError is thrown with reason "malformed"

  Scenario: Handle key rotation — kid not found in cache
    Given the JWKS cache contains key "kid-old"
    And the incoming JWT has "kid" header set to "kid-new" (a rotated key)
    When I call validateToken(jwt)
    Then the validator force-refreshes the JWKS endpoint
    And if "kid-new" is found in the refreshed JWKS, the token is validated successfully

  Scenario: Handle JWKS endpoint unavailable on forced refresh
    Given the JWKS cache contains only "kid-old"
    And the incoming JWT uses "kid-new" (not in cache)
    And the JWKS endpoint returns HTTP 503
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "jwks_fetch_failed"

  Scenario: Accept a token within clock skew tolerance
    Given a JWT with exp set to 30 seconds ago
    And the clock skew tolerance is configured as 60 seconds
    When I call validateToken(jwt)
    Then the token is considered valid and TokenClaims are returned

  Scenario: Reject a token outside clock skew tolerance
    Given a JWT with exp set to 2 minutes ago
    And the clock skew tolerance is configured as 60 seconds
    When I call validateToken(jwt)
    Then a TokenValidationError is thrown with reason "expired"
```

---

## Feature: Token Refresh

```gherkin
Feature: Access Token Refresh
  As a UI or API consumer with a stored refresh token
  I want to obtain a new access token using my refresh token
  So that the user remains authenticated without re-logging in

  Background:
    Given a refresh configuration with:
      | issuerUrl | https://auth.iexcel.com |
      | clientId  | iexcel-ui               |

  Scenario: Successfully refresh access token
    Given a valid refresh token "rt-abc123"
    And the token endpoint returns a new token set
    When I call refreshAccessToken(config, "rt-abc123")
    Then a TokenSet is returned containing:
      | access_token  | (new access token)  |
      | refresh_token | (rotated or same)   |
      | expires_in    | 3600                |
      | token_type    | Bearer              |

  Scenario: Handle expired refresh token
    Given a refresh token that has expired
    And the token endpoint returns error "invalid_grant"
    When I call refreshAccessToken(config, expiredRefreshToken)
    Then a TokenRefreshError is thrown with code "invalid_grant"

  Scenario: Handle revoked refresh token
    Given a refresh token that has been revoked
    And the token endpoint returns error "invalid_grant"
    When I call refreshAccessToken(config, revokedRefreshToken)
    Then a TokenRefreshError is thrown with code "invalid_grant"

  Scenario: Handle network failure during refresh
    Given the token endpoint is unreachable
    When I call refreshAccessToken(config, refreshToken)
    Then a TokenRefreshError is thrown with code "server_error"
```

---

## Feature: Authorization Code Flow (PKCE)

```gherkin
Feature: Authorization Code Flow with PKCE
  As the UI application
  I want to implement the OIDC authorization code flow with PKCE
  So that users can log in securely via the auth service

  Background:
    Given an auth code config with:
      | issuerUrl   | https://auth.iexcel.com         |
      | clientId    | iexcel-ui                       |
      | redirectUri | https://app.iexcel.com/callback |
      | scopes      | openid profile email            |

  Scenario: Generate PKCE challenge pair
    When I call generatePkceChallenge()
    Then it returns a codeVerifier and codeChallenge
    And the codeChallenge is the base64url-encoded SHA-256 hash of the codeVerifier

  Scenario: Build authorization URL with PKCE
    Given a codeVerifier generated via generatePkceChallenge()
    And state value "random-state-xyz"
    When I call buildAuthorizeUrl(config, "random-state-xyz", codeVerifier)
    Then the URL starts with "https://auth.iexcel.com/authorize"
    And it contains query parameter "response_type=code"
    And it contains query parameter "client_id=iexcel-ui"
    And it contains query parameter "redirect_uri=https%3A%2F%2Fapp.iexcel.com%2Fcallback"
    And it contains query parameter "scope=openid+profile+email"
    And it contains query parameter "state=random-state-xyz"
    And it contains query parameter "code_challenge_method=S256"
    And it contains a "code_challenge" parameter

  Scenario: Exchange authorization code for tokens
    Given the auth service redirected back to:
      "https://app.iexcel.com/callback?code=auth-code-xyz&state=random-state-xyz"
    And the original state was "random-state-xyz"
    And the original codeVerifier matches the codeChallenge in the authorize request
    When I call exchangeCodeForTokens(config, callbackUrl, "random-state-xyz", codeVerifier)
    Then a TokenSet is returned

  Scenario: Reject callback with mismatched state
    Given the callback URL contains state "tampered-state"
    And the expected state is "random-state-xyz"
    When I call exchangeCodeForTokens(config, callbackUrl, "random-state-xyz", codeVerifier)
    Then an AuthCallbackError is thrown with reason "state_mismatch"

  Scenario: Handle provider error in callback
    Given the callback URL is:
      "https://app.iexcel.com/callback?error=access_denied&error_description=User+denied+access"
    When I call exchangeCodeForTokens(config, callbackUrl, state, codeVerifier)
    Then an AuthCallbackError is thrown with reason "provider_error"
    And the error includes the upstream "access_denied" code

  Scenario: Handle missing code in callback
    Given the callback URL contains neither "code" nor "error"
    When I call exchangeCodeForTokens(config, callbackUrl, state, codeVerifier)
    Then an AuthCallbackError is thrown with reason "provider_error"
```

---

## Feature: Device Authorization Flow

```gherkin
Feature: Device Authorization Flow (RFC 8628)
  As a terminal tool (Claude Code, Claw)
  I want to authenticate using the device authorization flow
  So that users can log in via their browser without needing a redirect URL

  Background:
    Given a device flow config with:
      | issuerUrl | https://auth.iexcel.com    |
      | clientId  | iexcel-terminal            |
      | scopes    | openid profile email       |

  Scenario: Initiate device authorization
    Given the device_authorization_endpoint returns:
      """json
      {
        "device_code": "device-code-abc",
        "user_code": "ABCD-1234",
        "verification_uri": "https://auth.iexcel.com/device",
        "verification_uri_complete": "https://auth.iexcel.com/device?user_code=ABCD-1234",
        "expires_in": 300,
        "interval": 5
      }
      """
    When I call initiateDeviceFlow(config)
    Then a DeviceAuthorizationResponse is returned with:
      | device_code      | device-code-abc                      |
      | user_code        | ABCD-1234                            |
      | verification_uri | https://auth.iexcel.com/device       |
      | expires_in       | 300                                  |
      | interval         | 5                                    |

  Scenario: Poll until user completes authentication
    Given a device_code "device-code-abc" and interval 5 seconds
    And the first 2 polls return error "authorization_pending"
    And the third poll returns a valid token set
    When I call pollDeviceToken(config, "device-code-abc", 5, 300)
    Then the poller waits 5 seconds between each attempt
    And it returns the TokenSet on success

  Scenario: Handle slow_down response
    Given the first poll returns error "slow_down"
    When I call pollDeviceToken(config, deviceCode, 5, 300)
    Then the polling interval is increased by 5 seconds to 10 seconds
    And subsequent polls use the new 10-second interval

  Scenario: Handle further slow_down accumulation
    Given slow_down has been received once (interval is now 10 seconds)
    And another "slow_down" is received
    When the poller continues
    Then the polling interval increases by 5 more seconds to 15 seconds

  Scenario: Handle device code expiry
    Given the device_code has expired
    And the token endpoint returns error "expired_token"
    When I call pollDeviceToken(config, deviceCode, 5, 300)
    Then a DeviceFlowError is thrown with reason "expired"

  Scenario: Handle user denying access
    Given the user denied access at the verification URI
    And the token endpoint returns error "access_denied"
    When I call pollDeviceToken(config, deviceCode, 5, 300)
    Then a DeviceFlowError is thrown with reason "access_denied"

  Scenario: Handle polling timeout (expires_in elapsed)
    Given the device authorization expires_in was 10 seconds
    And 10+ seconds have elapsed without a successful token response
    When the poller checks elapsed time
    Then a DeviceFlowError is thrown with reason "timeout"

  Scenario: onPrompt callback receives status messages
    Given a pollDeviceToken call with an onPrompt callback registered
    When the poller receives "authorization_pending"
    Then the onPrompt callback is invoked with a human-readable status message
```

---

## Feature: Client Credentials Flow

```gherkin
Feature: Client Credentials Flow
  As the Mastra agent runtime
  I want to obtain and auto-refresh service-to-service access tokens
  So that all API calls from Mastra are authenticated

  Background:
    Given a client credentials config with:
      | issuerUrl    | https://auth.iexcel.com |
      | clientId     | mastra-agent            |
      | clientSecret | secret-xyz              |
      | scopes       | api:read api:write      |

  Scenario: Obtain initial access token
    Given no cached token exists
    When I call client.getAccessToken()
    Then the token endpoint is called with grant_type=client_credentials
    And a valid access token string is returned

  Scenario: Return cached token before expiry
    Given a cached token with 10 minutes remaining
    When I call client.getAccessToken() again
    Then no HTTP request is made
    And the same cached token is returned

  Scenario: Auto-refresh token within expiry buffer
    Given a cached token that expires in 30 seconds
    And the expiry buffer is 60 seconds
    When I call client.getAccessToken()
    Then a new token is fetched from the token endpoint
    And the new token is returned and cached

  Scenario: Deduplicate concurrent refresh requests
    Given a cached token is expired
    When two concurrent calls to getAccessToken() are made simultaneously
    Then only one HTTP request is sent to the token endpoint
    And both callers receive the same new token

  Scenario: Handle invalid client credentials
    Given the client secret is incorrect
    And the token endpoint returns error "invalid_client"
    When I call client.getAccessToken()
    Then a ClientCredentialsError is thrown with code "invalid_client"

  Scenario: Force refresh ignores cache
    Given a cached token with 30 minutes remaining
    When I call client.forceRefresh()
    Then a new token is fetched from the token endpoint regardless of cache
```

---

## Feature: Token Storage (Terminal / File-based)

```gherkin
Feature: File-Based Token Storage for Terminal Tools
  As a terminal tool (Claude Code, Claw)
  I want to persist and load tokens from the local filesystem
  So that the user does not need to log in on every command invocation

  Background:
    Given the token storage module is initialized with default path "~/.iexcel/auth/tokens.json"

  Scenario: Save tokens to disk
    Given a TokenSet obtained from the device flow
    When I call saveTokens(tokenSet)
    Then the tokens are written to "~/.iexcel/auth/tokens.json"
    And the file permissions are set to 0600 (owner read/write only)

  Scenario: Create directory if it does not exist
    Given the directory "~/.iexcel/auth/" does not exist
    When I call saveTokens(tokenSet)
    Then the directory is created automatically
    And tokens are written to the file

  Scenario: Load existing tokens
    Given "~/.iexcel/auth/tokens.json" contains valid token JSON
    When I call loadTokens()
    Then a StoredTokens object is returned

  Scenario: Return null when no tokens file exists
    Given "~/.iexcel/auth/tokens.json" does not exist
    When I call loadTokens()
    Then null is returned (no error thrown)

  Scenario: Return null for corrupted tokens file
    Given "~/.iexcel/auth/tokens.json" contains malformed JSON
    When I call loadTokens()
    Then null is returned (no error thrown)

  Scenario: Clear tokens on logout
    Given "~/.iexcel/auth/tokens.json" exists with tokens
    When I call clearTokens()
    Then the tokens file is deleted
    And a subsequent loadTokens() returns null

  Scenario: Override storage path for testing
    Given a StorageOptions with filePath set to "/tmp/test-tokens.json"
    When I call saveTokens(tokenSet, { filePath: "/tmp/test-tokens.json" })
    Then tokens are written to "/tmp/test-tokens.json" instead of the default path

  Scenario: Shared token store across terminal tools
    Given Claude Code has saved tokens to "~/.iexcel/auth/tokens.json"
    When Claw calls loadTokens() on the same machine
    Then it reads the same tokens (shared authentication session)
```

---

## Feature: Error Handling

```gherkin
Feature: Typed Error Hierarchy
  As a consumer of the auth-client library
  I want all errors to be typed and discriminated
  So that I can handle each error case programmatically

  Scenario: All auth-client errors extend AuthClientError
    When any module in auth-client throws an error
    Then the error is an instance of AuthClientError
    And it has a "code" string property that uniquely identifies the error type

  Scenario: TokenValidationError has reason field
    When validateToken fails
    Then the error has a "reason" field matching one of:
      | expired            |
      | invalid_signature  |
      | invalid_issuer     |
      | invalid_audience   |
      | malformed          |
      | jwks_fetch_failed  |

  Scenario: DeviceFlowError has reason field
    When the device flow fails
    Then the error has a "reason" field matching one of:
      | expired      |
      | access_denied |
      | timeout      |
      | server_error |
```
