# GS — Gherkin Specification
## Feature 24: UI Auth Flow
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

```gherkin
Feature: OIDC Authorization Code Flow — UI Auth

  The iExcel web UI authenticates internal users (account managers and team members)
  via the OIDC authorization code flow with PKCE. Public routes (/shared/*) are
  explicitly excluded from all authentication checks.

  Background:
    Given the auth service is running at "https://auth.iexcel.com"
    And the OIDC client "iexcel-ui" is pre-registered with grant types "authorization_code" and "refresh_token"
    And the UI is running at "https://app.iexcel.com"
    And the redirect URI "https://app.iexcel.com/auth/callback" is registered for "iexcel-ui"

  #---------------------------------------------------------------------------
  # Login Flow
  #---------------------------------------------------------------------------

  Scenario: Unauthenticated user is redirected to login from a protected route
    Given I am not authenticated (no auth cookies present)
    When I navigate to "https://app.iexcel.com/"
    Then the proxy intercepts the request
    And an "iexcel_redirect_after_login" cookie is set with value "/"
    And I am redirected to "/login"
    And the login page renders a "Login with SSO" button

  Scenario: Unauthenticated user is redirected to login and original path is preserved
    Given I am not authenticated
    When I navigate to "https://app.iexcel.com/clients/abc-123"
    Then I am redirected to "/login"
    And an "iexcel_redirect_after_login" cookie contains the value "/clients/abc-123"

  Scenario: Authenticated user visiting /login is redirected to dashboard
    Given I am authenticated with a valid session
    When I navigate to "/login"
    Then I am redirected to "/"

  Scenario: User initiates SSO login
    Given I am on the "/login" page
    When I click "Login with SSO"
    Then a PKCE code verifier and code challenge are generated
    And a random state parameter is generated
    And the "iexcel_pkce" cookie is set with the code verifier and state (httpOnly, SameSite=Lax, Secure)
    And the browser is redirected to "https://auth.iexcel.com/authorize" with:
      | Parameter              | Value                                            |
      | client_id              | iexcel-ui                                        |
      | redirect_uri           | https://app.iexcel.com/auth/callback             |
      | response_type          | code                                             |
      | scope                  | openid profile email                             |
      | state                  | {generated state value}                          |
      | code_challenge         | {S256 hash of code verifier}                     |
      | code_challenge_method  | S256                                             |

  Scenario: Successful authorization code callback
    Given the user has authenticated with the IdP
    And the auth service redirects to "/auth/callback" with a valid code and state
    And the "iexcel_pkce" cookie contains the matching state and code verifier
    When the callback route handler processes the request
    Then the handler validates the state matches the cookie
    And the handler exchanges the code for tokens via a back-channel POST to "https://auth.iexcel.com/token"
    And the "iexcel_access_token" cookie is set (httpOnly, SameSite=Lax, Secure, maxAge=expires_in)
    And the "iexcel_refresh_token" cookie is set (httpOnly, SameSite=Lax, Secure, maxAge=2592000)
    And the "iexcel_token_expires_at" cookie is set with the expiry timestamp
    And the "iexcel_pkce" cookie is cleared
    And I am redirected to "/" (or the path from "iexcel_redirect_after_login" if present)

  Scenario: Callback with preserved return path
    Given the "iexcel_redirect_after_login" cookie contains "/clients/abc-123"
    And the auth service callback returns a valid code and state
    When the callback handler processes the request
    Then after setting auth cookies, I am redirected to "/clients/abc-123"
    And the "iexcel_redirect_after_login" cookie is cleared

  #---------------------------------------------------------------------------
  # Callback Error States
  #---------------------------------------------------------------------------

  Scenario: Auth service returns an error in the callback
    Given the user denied consent or an error occurred at the auth service
    When the browser is redirected to "/auth/callback?error=access_denied&error_description=User+denied+access"
    Then the callback handler does not attempt token exchange
    And the "/auth/error" page is rendered with message "User denied access"

  Scenario: State mismatch in callback (CSRF protection)
    Given the "iexcel_pkce" cookie contains state "abc123"
    When the browser is redirected to "/auth/callback?code=some_code&state=xyz789"
    Then the callback handler detects the state mismatch
    And a 400 error page is rendered with message "Login session expired or invalid"
    And no token exchange is attempted
    And the mismatch is logged server-side

  Scenario: Token exchange fails at auth service
    Given the callback has a valid state match
    When the auth service returns a non-2xx response to the token exchange request
    Then the "/auth/error" page is rendered with "Authentication failed"
    And the raw error from the auth service is NOT shown to the user
    And the error is logged server-side

  Scenario: User navigates directly to /auth/callback without PKCE cookie
    Given the "iexcel_pkce" cookie is absent
    When a request arrives at "/auth/callback?code=some_code&state=some_state"
    Then a 400 error page is returned with "Login session expired"

  #---------------------------------------------------------------------------
  # Protected Route Proxy
  #---------------------------------------------------------------------------

  Scenario: Authenticated request passes through proxy
    Given I have a valid "iexcel_access_token" cookie
    And the token expiry is more than 60 seconds from now
    When I navigate to "/clients/abc-123"
    Then the proxy allows the request through
    And the "x-user-sub" request header is set with my user sub claim
    And the dashboard page renders

  Scenario: Proxy skips auth for /shared/* routes
    Given I am not authenticated
    When I navigate to "/shared/some-public-token"
    Then the proxy does not intercept the request
    And the public layout renders without redirecting to login

  Scenario: Proxy skips auth for /login route
    Given I am not authenticated
    When I navigate to "/login"
    Then the proxy does not intercept the request
    And the login page renders

  Scenario: Proxy skips auth for /auth/* routes
    Given I am not authenticated
    When I navigate to "/auth/callback?code=x&state=y"
    Then the proxy does not intercept the request
    And the callback handler processes the request

  Scenario: Proxy skips auth for Next.js static assets
    When a request arrives for "/_next/static/chunks/main.js"
    Then the proxy does not intercept the request
    And the static file is served

  #---------------------------------------------------------------------------
  # Silent Token Refresh
  #---------------------------------------------------------------------------

  Scenario: Proxy proactively refreshes token expiring within 60 seconds
    Given I have valid auth cookies
    And the "iexcel_token_expires_at" cookie indicates the access token expires in 30 seconds
    And the "iexcel_refresh_token" cookie contains a valid refresh token
    When I navigate to "/clients/abc-123"
    Then the proxy calls "https://auth.iexcel.com/token" with grant_type "refresh_token"
    And a new "iexcel_access_token" cookie is set with the new token
    And a new "iexcel_token_expires_at" cookie is set with the new expiry
    And the original request to "/clients/abc-123" is allowed through
    And I see no login redirect

  Scenario: Proxy refreshes token and receives a rotated refresh token
    Given the auth service returns a new refresh token alongside the new access token
    When the proxy processes the silent refresh
    Then the "iexcel_refresh_token" cookie is updated with the new refresh token value

  Scenario: Proxy fails to refresh because refresh token is expired
    Given the "iexcel_token_expires_at" indicates the access token expires in 30 seconds
    And the auth service returns "invalid_grant" for the refresh attempt
    When I navigate to "/clients/abc-123"
    Then the proxy clears all auth cookies ("iexcel_access_token", "iexcel_refresh_token", "iexcel_token_expires_at")
    And I am redirected to "/login"

  Scenario: Proxy fails to refresh because refresh token cookie is absent
    Given the "iexcel_token_expires_at" indicates the access token expires in 30 seconds
    And the "iexcel_refresh_token" cookie is absent
    When I navigate to any protected route
    Then the proxy clears the "iexcel_access_token" cookie
    And I am redirected to "/login"

  Scenario: Proxy cannot reach auth service during refresh
    Given the access token is about to expire
    And the auth service is unreachable (network error)
    When I navigate to a protected route
    Then the proxy clears all auth cookies
    And I am redirected to "/login"
    And the network error is logged server-side

  #---------------------------------------------------------------------------
  # Dashboard Layout and AuthProvider
  #---------------------------------------------------------------------------

  Scenario: Dashboard layout loads user data from API after proxy passes request
    Given I am authenticated with a valid session
    And the proxy has set "x-user-sub" to "user-uuid-123"
    When the "(dashboard)/layout.tsx" Server Component renders
    Then it reads the "iexcel_access_token" cookie as a Bearer token
    And it calls the product API "GET /me" with the Bearer token
    And the API responds with:
      """
      {
        "role": "account_manager",
        "assignedClientIds": ["client-a", "client-b"]
      }
      """
    And the layout decodes "sub", "email", "name" from the access token JWT payload
    And it constructs an AuthenticatedUser with all fields populated
    And passes it to AuthProvider

  Scenario: useAuth() hook returns current user in a client component
    Given the AuthProvider wraps the (dashboard) route group
    And the authenticated user is { sub: "abc", email: "mark@iexcel.com", name: "Mark", role: "account_manager", assignedClientIds: ["client-a"] }
    When a client component calls useAuth()
    Then it receives { user: { sub: "abc", email: "mark@iexcel.com", name: "Mark", role: "account_manager", assignedClientIds: ["client-a"] } }

  Scenario: useAuth() throws when called outside AuthProvider
    Given a client component calls useAuth() outside the dashboard route group
    When the component mounts
    Then an error is thrown with message "useAuth must be used within an AuthProvider"

  Scenario: Dashboard layout redirects to /login if /me call fails
    Given I am authenticated
    And the product API "GET /me" returns 500
    When the dashboard layout renders
    Then I am redirected to "/login"
    And the 500 error is logged server-side

  #---------------------------------------------------------------------------
  # Logout Flow
  #---------------------------------------------------------------------------

  Scenario: User logs out successfully
    Given I am authenticated and on the dashboard
    When I click the "Logout" button in the sidebar
    Then a POST request is sent to "/auth/logout"
    And the "iexcel_access_token" cookie is cleared (maxAge: 0)
    And the "iexcel_refresh_token" cookie is cleared (maxAge: 0)
    And the "iexcel_token_expires_at" cookie is cleared (maxAge: 0)
    And I am redirected to "/login"

  Scenario: After logout, navigating to a protected route triggers login
    Given I have just logged out
    When I navigate to "/clients/abc-123"
    Then the proxy detects no auth cookies
    And I am redirected to "/login"

  #---------------------------------------------------------------------------
  # Cookie Security Properties
  #---------------------------------------------------------------------------

  Scenario: Auth cookies have correct security attributes
    Given the login flow has completed successfully
    Then the "iexcel_access_token" cookie has:
      | Attribute | Value      |
      | httpOnly  | true       |
      | Secure    | true       |
      | SameSite  | Lax        |
      | Path      | /          |
    And the "iexcel_refresh_token" cookie has:
      | Attribute | Value      |
      | httpOnly  | true       |
      | Secure    | true       |
      | SameSite  | Lax        |
      | Path      | /          |
    And neither token cookie value is accessible via document.cookie in the browser

  #---------------------------------------------------------------------------
  # API Client Token Integration
  #---------------------------------------------------------------------------

  Scenario: api-client receives access token for API calls made from Server Components
    Given I am authenticated with a valid "iexcel_access_token" cookie
    When a Server Component calls the api-client to fetch data
    Then the api-client's tokenProvider reads the "iexcel_access_token" cookie
    And the HTTP request to the product API includes "Authorization: Bearer {access_token}"

  #---------------------------------------------------------------------------
  # SSO Cross-App Session
  #---------------------------------------------------------------------------

  Scenario: User with active IdP SSO session logs in without password prompt
    Given the user previously authenticated via the terminal (active IdP SSO session exists)
    When the user navigates to the UI and clicks "Login with SSO"
    And the auth service redirects to the IdP
    Then the IdP detects the existing SSO session
    And does not prompt for credentials
    And completes the authorization code flow automatically
    And the user is logged into the UI without entering a password
```
