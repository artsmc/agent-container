# GS — Gherkin Specification
# Feature 05: Auth Service

## Feature: Auth Service — OIDC Provider

  As the iExcel platform
  I need a centralized OIDC provider
  So that every application — web, terminal, and service — can authenticate users
  with a single identity and a single set of tokens

---

## Background

  Given the auth service is running on port 8090
  And the auth database (Feature 03) has been migrated with all four tables
  And the four pre-registered OIDC clients are seeded: iexcel-ui, iexcel-terminal, mastra-agent, iexcel-api
  And the external IdP is configured with IDP_CLIENT_ID, IDP_CLIENT_SECRET, and IDP_ISSUER_URL
  And a valid RSA signing key pair is loaded from SIGNING_KEY_PRIVATE

---

## Feature: OIDC Discovery

  ### Scenario: Discovery document returns all required fields
    Given the auth service is running
    When a GET request is made to /.well-known/openid-configuration
    Then the response status is 200
    And the response body contains "issuer": "https://auth.iexcel.com"
    And the response body contains "authorization_endpoint"
    And the response body contains "token_endpoint"
    And the response body contains "device_authorization_endpoint"
    And the response body contains "userinfo_endpoint"
    And the response body contains "jwks_uri"
    And the response body contains "grant_types_supported" with values including "authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code", "client_credentials"
    And the response body contains "scopes_supported" with values including "openid", "profile", "email"

  ### Scenario: Discovery document is publicly accessible without authentication
    Given no Authorization header is present
    When a GET request is made to /.well-known/openid-configuration
    Then the response status is 200

---

## Feature: JWKS Endpoint

  ### Scenario: JWKS endpoint returns the current signing public key
    Given the auth service is running with a valid RSA signing key
    When a GET request is made to /.well-known/jwks.json
    Then the response status is 200
    And the response body contains a "keys" array with at least one entry
    And each key entry contains "kty", "use", "kid", "alg", "n", "e"
    And the "use" field is "sig"
    And the "alg" field is "RS256"

  ### Scenario: JWKS response includes cache headers
    When a GET request is made to /.well-known/jwks.json
    Then the response includes a Cache-Control header with max-age >= 3600

  ### Scenario: JWT issued by the auth service can be verified using the JWKS
    Given a user has completed the authorization code flow
    And an access token has been issued
    When the JWKS endpoint is fetched
    And the access token is verified using the public key matching the token's "kid" header
    Then the signature verification succeeds
    And the decoded payload contains the expected "iss", "sub", and "aud" claims

---

## Feature: Authorization Code Flow

  ### Scenario: Valid authorization request redirects to IdP
    Given the OIDC client "iexcel-ui" is registered with redirect_uri "https://app.iexcel.com/auth/callback"
    When a GET request is made to /authorize with:
      | client_id             | iexcel-ui                              |
      | redirect_uri          | https://app.iexcel.com/auth/callback   |
      | response_type         | code                                   |
      | scope                 | openid profile email                   |
      | state                 | random-csrf-state-value                |
      | code_challenge        | S256-encoded-challenge                 |
      | code_challenge_method | S256                                   |
    Then the response status is 302
    And the Location header points to the external IdP's authorization endpoint
    And the IdP redirect includes the auth service's client_id and redirect_uri

  ### Scenario: Authorization request with unknown client_id is rejected
    When a GET request is made to /authorize with client_id "unknown-app" and a valid redirect_uri
    Then the response status is 400
    And the response does not redirect to any URI

  ### Scenario: Authorization request with mismatched redirect_uri is rejected
    Given the OIDC client "iexcel-ui" is registered with redirect_uri "https://app.iexcel.com/auth/callback"
    When a GET request is made to /authorize with redirect_uri "https://evil.com/steal"
    Then the response status is 400
    And the response does not redirect

  ### Scenario: Public client without PKCE is rejected
    Given the OIDC client "iexcel-ui" is a public client
    When a GET request is made to /authorize without code_challenge
    Then the response redirects to the client's redirect_uri
    And the redirect includes error=invalid_request

  ### Scenario: Invalid scope is rejected
    When a GET request is made to /authorize with scope "openid write:secrets"
    Then the response redirects to the client's redirect_uri
    And the redirect includes error=invalid_scope

  ### Scenario: Authorization code exchange issues tokens
    Given a valid authorization code has been issued (IdP callback completed)
    When a POST request is made to /token with:
      | grant_type    | authorization_code                           |
      | code          | <the authorization code>                     |
      | redirect_uri  | https://app.iexcel.com/auth/callback         |
      | client_id     | iexcel-ui                                    |
      | code_verifier | <PKCE verifier matching the code_challenge>  |
    Then the response status is 200
    And the response body contains "access_token"
    And the response body contains "id_token"
    And the response body contains "refresh_token"
    And the response body contains "token_type": "Bearer"
    And the response body contains "expires_in": 3600

  ### Scenario: Authorization code cannot be reused
    Given an authorization code has already been exchanged for tokens
    When a second POST request is made to /token with the same code
    Then the response status is 400
    And the response body contains "error": "invalid_grant"

  ### Scenario: Expired authorization code is rejected
    Given an authorization code was issued more than 5 minutes ago
    When a POST request is made to /token with that code
    Then the response status is 400
    And the response body contains "error": "invalid_grant"

  ### Scenario: PKCE code_verifier mismatch is rejected
    Given a valid authorization code was issued with a specific code_challenge
    When a POST request is made to /token with an incorrect code_verifier
    Then the response status is 400
    And the response body contains "error": "invalid_grant"

  ### Scenario: New user is created on first login
    Given no user exists with email "newuser@iexcel.com"
    And the IdP authenticates a user with email "newuser@iexcel.com"
    When the authorization code flow completes
    Then a new row is inserted into the users table with email "newuser@iexcel.com"
    And the user's "is_active" is true
    And the issued token's "sub" claim matches the new user's UUID

  ### Scenario: Existing user is updated on subsequent login
    Given a user exists with email "mark@iexcel.com" and name "Mark Old"
    And the IdP returns updated claims with name "Mark New"
    When the authorization code flow completes
    Then the users table row for "mark@iexcel.com" has name "Mark New"
    And no duplicate row is created
    And "last_login_at" is updated to the current timestamp

  ### Scenario: Deactivated user cannot log in
    Given a user exists with email "deactivated@iexcel.com" and is_active = false
    And the IdP authenticates that user
    When the authorization code flow completes (IdP callback received)
    Then the user is NOT issued tokens
    And an error page is shown: "Your account has been deactivated"

---

## Feature: Token Refresh

  ### Scenario: Valid refresh token issues new access token and rotated refresh token
    Given a user has a valid, non-expired, non-revoked refresh token for client "iexcel-ui"
    When a POST request is made to /token with:
      | grant_type    | refresh_token          |
      | refresh_token | <the refresh token>    |
      | client_id     | iexcel-ui              |
    Then the response status is 200
    And the response body contains a new "access_token"
    And the response body contains a new "refresh_token" (different from the original)
    And the original refresh token is now marked as revoked in the database

  ### Scenario: Expired refresh token is rejected
    Given a refresh token exists with expires_at in the past
    When a POST request is made to /token with that refresh token
    Then the response status is 400
    And the response body contains "error": "invalid_grant"

  ### Scenario: Revoked refresh token is rejected
    Given a refresh token has been revoked (revoked_at IS NOT NULL)
    When a POST request is made to /token with that refresh token
    Then the response status is 400
    And the response body contains "error": "invalid_grant"

  ### Scenario: Reuse of a rotated refresh token triggers full revocation
    Given a refresh token was used and a new refresh token was issued (rotation)
    When the original (now-revoked) refresh token is presented again
    Then the response status is 400
    And all refresh tokens for that user+client combination are revoked
    And the response body contains "error": "invalid_grant"

---

## Feature: Device Authorization Flow

  ### Scenario: Device authorize returns device_code and user_code
    Given the OIDC client "iexcel-terminal" is registered with device_code grant
    When a POST request is made to /device/authorize with:
      | client_id | iexcel-terminal          |
      | scope     | openid profile email     |
    Then the response status is 200
    And the response body contains "device_code"
    And the response body contains "user_code" (8 characters, formatted as XXXX-XXXX)
    And the response body contains "verification_uri": "https://auth.iexcel.com/device"
    And the response body contains "verification_uri_complete" with the user_code appended
    And the response body contains "expires_in": 900
    And the response body contains "interval": 5

  ### Scenario: Device authorize with invalid client_id is rejected
    When a POST request is made to /device/authorize with client_id "unknown-client"
    Then the response status is 400
    And the response body contains "error": "invalid_client"

  ### Scenario: Device authorize with client that does not support device_code is rejected
    Given the OIDC client "iexcel-ui" only supports authorization_code grant
    When a POST request is made to /device/authorize with client_id "iexcel-ui"
    Then the response status is 400
    And the response body contains "error": "unauthorized_client"

  ### Scenario: Device verification page renders with user_code pre-filled
    Given a device flow has been initiated and user_code "ABCD-1234" was issued
    When a GET request is made to /device?user_code=ABCD-1234
    Then the response status is 200
    And the response body is HTML
    And the code input field is pre-filled with "ABCD-1234"

  ### Scenario: Polling before user authenticates returns authorization_pending
    Given a device flow has been initiated with device_code "device-code-abc"
    And the user has not yet entered the code in the browser
    When a POST request is made to /device/token with:
      | grant_type  | urn:ietf:params:oauth:grant-type:device_code |
      | device_code | device-code-abc                              |
      | client_id   | iexcel-terminal                              |
    Then the response status is 400
    And the response body contains "error": "authorization_pending"

  ### Scenario: Polling too frequently returns slow_down
    Given a device flow has been initiated
    And the terminal polled less than 5 seconds ago
    When another POST request is made to /device/token
    Then the response status is 400
    And the response body contains "error": "slow_down"

  ### Scenario: Polling after user authenticates returns tokens
    Given a device flow has been initiated with device_code "device-code-xyz"
    And the user has visited /device, entered the user_code, and authenticated via IdP
    When a POST request is made to /device/token with device_code "device-code-xyz"
    Then the response status is 200
    And the response body contains "access_token"
    And the response body contains "id_token"
    And the response body contains "refresh_token"

  ### Scenario: Polling with an expired device_code returns expired_token
    Given a device flow was initiated more than 900 seconds ago
    When a POST request is made to /device/token with that device_code
    Then the response status is 400
    And the response body contains "error": "expired_token"

  ### Scenario: Device_code is consumed after successful token issuance
    Given tokens have been issued for a device flow
    When a POST request is made to /device/token with the same device_code again
    Then the response status is 400
    And the response body contains "error": "expired_token" or "access_denied"

---

## Feature: Client Credentials Flow

  ### Scenario: Valid client credentials return an access token
    Given the OIDC client "mastra-agent" is registered as confidential with a known client_secret
    When a POST request is made to /token with:
      | grant_type    | client_credentials  |
      | client_id     | mastra-agent        |
      | client_secret | <known secret>      |
    Then the response status is 200
    And the response body contains "access_token"
    And the response body contains "token_type": "Bearer"
    And the response body contains "expires_in": 3600
    And the response body does NOT contain "refresh_token"
    And the response body does NOT contain "id_token"

  ### Scenario: Incorrect client_secret is rejected
    When a POST request is made to /token with grant_type=client_credentials and an incorrect client_secret
    Then the response status is 401
    And the response body contains "error": "invalid_client"

  ### Scenario: Public client cannot use client_credentials
    Given the OIDC client "iexcel-ui" is a public client
    When a POST request is made to /token with grant_type=client_credentials and client_id=iexcel-ui
    Then the response status is 400
    And the response body contains "error": "unauthorized_client"

  ### Scenario: Client credentials token has no sub claim for a user
    Given "mastra-agent" exchanges credentials for a token
    When the access token is decoded
    Then the "sub" claim equals "mastra-agent" (or is absent from user-contextual claims)
    And there is no "email" claim
    And there is no "name" claim

---

## Feature: Userinfo Endpoint

  ### Scenario: Valid access token returns user identity claims
    Given a user has authenticated and holds a valid access token with scopes "openid profile email"
    When a GET request is made to /userinfo with Authorization: Bearer <access_token>
    Then the response status is 200
    And the response body contains "sub": "<user UUID>"
    And the response body contains "email"
    And the response body contains "name"

  ### Scenario: Token with only openid scope returns only sub
    Given a user holds an access token with scope "openid" only
    When a GET request is made to /userinfo
    Then the response body contains "sub"
    And the response body does NOT contain "email"
    And the response body does NOT contain "name"

  ### Scenario: Missing authorization token returns 401
    When a GET request is made to /userinfo without an Authorization header
    Then the response status is 401

  ### Scenario: Expired access token returns 401
    Given an access token with exp in the past
    When a GET request is made to /userinfo with that token
    Then the response status is 401

---

## Feature: Health Check

  ### Scenario: Health check returns ok when database is reachable
    Given the auth service is running and the database is reachable
    When a GET request is made to /health
    Then the response status is 200
    And the response body contains "status": "ok"
    And the response body contains "timestamp"

  ### Scenario: Health check returns degraded when database is unreachable
    Given the database connection is broken or timed out
    When a GET request is made to /health
    Then the response status is 503
    And the response body contains "status": "degraded"

---

## Feature: Admin API — OIDC Client Management

  ### Scenario: Admin lists all registered OIDC clients
    Given a user holds a valid access token with "admin" scope
    When a GET request is made to /admin/clients
    Then the response status is 200
    And the response body contains a "clients" array
    And the array includes entries for "iexcel-ui", "iexcel-terminal", "mastra-agent", "iexcel-api"
    And no entry contains "client_secret_hash"

  ### Scenario: Non-admin token cannot access admin endpoints
    Given a user holds a valid access token without "admin" scope
    When a GET request is made to /admin/clients
    Then the response status is 403

  ### Scenario: Admin registers a new OIDC client
    Given an admin holds a valid access token with "admin" scope
    When a POST request is made to /admin/clients with:
      | client_id    | new-app          |
      | client_name  | New Application  |
      | client_type  | confidential     |
      | grant_types  | ["client_credentials"] |
      | scopes       | ["openid"]       |
    Then the response status is 201
    And the response body contains "client_id": "new-app"
    And the response body contains "client_secret" (plaintext — shown once)
    And a row exists in the oidc_clients table with client_id "new-app"

  ### Scenario: Duplicate client_id is rejected
    Given a client with client_id "new-app" already exists
    When a POST request is made to /admin/clients with client_id "new-app"
    Then the response status is 409

  ### Scenario: Admin updates a client's redirect URIs
    Given a client "iexcel-ui" exists with empty redirect_uris
    When a PATCH request is made to /admin/clients/{id} with redirect_uris ["https://app.iexcel.com/auth/callback"]
    Then the response status is 200
    And the oidc_clients row for "iexcel-ui" has redirect_uris containing "https://app.iexcel.com/auth/callback"

  ### Scenario: Admin deactivates a client
    When a DELETE request is made to /admin/clients/{id}
    Then the response status is 200
    And the oidc_clients row has is_active = false
    And the row is not deleted from the database

  ### Scenario: Admin rotates a client secret
    Given a confidential client "mastra-agent" exists with a client_secret_hash
    When a POST request is made to /admin/clients/{id}/rotate-secret
    Then the response status is 200
    And the response body contains a new "client_secret" (plaintext)
    And the oidc_clients row has a new client_secret_hash (different from the previous one)
    And the old client_secret is immediately invalid

---

## Feature: Admin API — User Management

  ### Scenario: Admin lists all users
    Given an admin holds a valid access token with "admin" scope
    When a GET request is made to /admin/users
    Then the response status is 200
    And the response body contains a "users" array
    And each user entry contains "id", "email", "name", "is_active", "last_login_at"

  ### Scenario: Admin gets user details
    Given a user exists with id "uuid-mark"
    When a GET request is made to /admin/users/uuid-mark
    Then the response status is 200
    And the response body contains "id": "uuid-mark"
    And the response body contains "active_sessions" (count)
    And the response body contains "active_refresh_tokens" (count)

  ### Scenario: Admin deactivates a user
    Given a user "uuid-alice" exists with is_active = true
    When a POST request is made to /admin/users/uuid-alice/deactivate
    Then the response status is 200
    And the users table row for "uuid-alice" has is_active = false
    And that user's next login attempt is rejected

  ### Scenario: Admin revokes all sessions for a user
    Given user "uuid-bob" has 3 active sessions and 2 active refresh tokens
    When a DELETE request is made to /admin/users/uuid-bob/sessions
    Then the response status is 200
    And the response body contains "sessions_revoked": 3
    And the response body contains "refresh_tokens_revoked": 2
    And no session rows remain for user "uuid-bob"
    And all refresh token rows for "uuid-bob" have revoked_at set to a non-null timestamp

---

## Feature: Token Claims and Structure

  ### Scenario: Access token contains required standard claims
    Given a user has authenticated and received an access token
    When the access token is decoded (without signature verification for this test)
    Then the header contains "alg": "RS256"
    And the header contains "kid" matching a key in the JWKS
    And the payload contains "iss": "https://auth.iexcel.com"
    And the payload contains "sub" (the user's UUID)
    And the payload contains "aud": "iexcel-api"
    And the payload contains "iat" (issued-at timestamp)
    And the payload contains "exp" (expiration timestamp where exp - iat = token_lifetime)
    And the payload contains "scope"
    And the payload contains "jti" (unique token identifier)

  ### Scenario: ID token contains user identity claims
    Given a user has authenticated with scopes "openid profile email"
    And an ID token has been issued
    When the ID token is decoded
    Then the payload contains "sub"
    And the payload contains "iss": "https://auth.iexcel.com"
    And the payload contains "aud": "iexcel-ui"
    And the payload contains "email"
    And the payload contains "name"
    And the payload contains "picture" (if available from IdP)

  ### Scenario: Client credentials token has no user identity claims
    Given "mastra-agent" has exchanged credentials for an access token
    When the access token is decoded
    Then the payload does NOT contain "email"
    And the payload does NOT contain "name"
    And the "sub" claim identifies the client, not a user

---

## Feature: Security Constraints

  ### Scenario: Authorization code is single-use
    Given an authorization code has been exchanged for tokens
    When the same code is presented to /token again
    Then the response contains "error": "invalid_grant"
    And no new tokens are issued

  ### Scenario: Redirect URI must exactly match registered URI
    Given a client has redirect_uri "https://app.iexcel.com/auth/callback"
    When /authorize is called with redirect_uri "https://app.iexcel.com/auth/callback/"  (trailing slash added)
    Then the request is rejected with error=invalid_request

  ### Scenario: State parameter is required for authorization code flow
    When a GET request is made to /authorize without a state parameter
    Then the response redirects back with error=invalid_request

  ### Scenario: Tokens signed with rotated key cannot be verified with old JWKS
    Given the signing key has been rotated (new SIGNING_KEY_PRIVATE loaded)
    And both old and new keys appear in the JWKS during transition
    When a token issued after rotation is verified with the new key
    Then verification succeeds
    When a token issued before rotation is verified with the old key (still in JWKS)
    Then verification also succeeds
