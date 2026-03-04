# Gherkin Specification
# Feature 07: API Scaffolding (`apps/api`)

**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03

---

## Feature: API Server Infrastructure

As a developer building on the iExcel API platform,
I need a hardened server foundation with authentication, authorization, validation, and error formatting,
So that every business endpoint I build inherits these behaviors without reimplementing them.

---

## Feature: Health Check

### Scenario: Health check returns OK when database is connected

```gherkin
Given the API server is running
And the PostgreSQL database is reachable
When a client sends GET /health
Then the response status is 200
And the response body contains:
  | field              | value |
  | status             | ok    |
  | checks.database    | ok    |
And the response body contains a valid ISO 8601 timestamp in "timestamp"
And the response body contains a semantic version string in "version"
```

### Scenario: Health check returns 503 when database is unreachable

```gherkin
Given the API server is running
And the PostgreSQL database is NOT reachable
When a client sends GET /health
Then the response status is 503
And the response body contains:
  | field              | value |
  | status             | error |
  | checks.database    | error |
And the response body does NOT contain a database error message or stack trace
```

### Scenario: Health check is accessible without authentication

```gherkin
Given the API server is running
When a client sends GET /health with no Authorization header
Then the response status is 200 or 503
And the response status is NOT 401
```

### Scenario: Health check times out if database hangs

```gherkin
Given the API server is running
And the PostgreSQL database health check query takes longer than 2000 milliseconds
When a client sends GET /health
Then the response status is 503
And the response is returned within 2100 milliseconds
```

---

## Feature: OIDC Token Validation

### Scenario: Valid token grants access to protected route

```gherkin
Given the API server is running
And the auth service JWKS endpoint is configured
And a user "mark@iexcel.com" has a valid, non-expired access token
When the user sends GET /me with header "Authorization: Bearer <valid_token>"
Then the response status is 200
And the response body contains the user's email "mark@iexcel.com"
```

### Scenario: Missing Authorization header returns 401

```gherkin
Given the API server is running
When a client sends GET /me with no Authorization header
Then the response status is 401
And the response body is:
  """
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Authorization header is required."
    }
  }
  """
```

### Scenario: Malformed Authorization header returns 401

```gherkin
Given the API server is running
When a client sends GET /me with header "Authorization: Token abc123"
Then the response status is 401
And the response body contains "error.code" equal to "UNAUTHORIZED"
```

### Scenario: Expired token returns 401

```gherkin
Given the API server is running
And a user has an access token that expired 1 hour ago
When the user sends GET /me with header "Authorization: Bearer <expired_token>"
Then the response status is 401
And the response body contains "error.code" equal to "UNAUTHORIZED"
```

### Scenario: Token signed with wrong key returns 401

```gherkin
Given the API server is running
And a token is signed with a key NOT in the auth service's JWKS
When a client sends a request with that token in the Authorization header
Then the response status is 401
And the response body contains "error.code" equal to "UNAUTHORIZED"
```

### Scenario: Token with wrong audience returns 401

```gherkin
Given the API server is running
And a token has audience "iexcel-ui" instead of "iexcel-api"
When a client sends GET /me with that token
Then the response status is 401
And the response body contains "error.code" equal to "UNAUTHORIZED"
```

### Scenario: Token with wrong issuer returns 401

```gherkin
Given the API server is running
And a token is issued by "https://evil.example.com" instead of the configured auth service
When a client sends GET /me with that token
Then the response status is 401
And the response body contains "error.code" equal to "UNAUTHORIZED"
```

### Scenario: JWKS cache is used on subsequent requests (no refetch)

```gherkin
Given the API server has processed one valid token request
And the JWKS TTL has NOT expired
When a second valid token request arrives with the same key ID
Then the JWKS endpoint is NOT called again for this request
And the response status is 200
```

### Scenario: JWKS is refreshed when kid is not found in cache

```gherkin
Given the API server has a JWKS cache from a previous fetch
And the auth service has rotated its signing keys
And the new token uses a key ID not in the cached JWKS
When a client sends a request with the new token
Then the API fetches the JWKS endpoint once
And the response status is 200 if the new key validates the token
```

---

## Feature: User Profile Loading and Just-in-Time Provisioning

### Scenario: Existing user is loaded from database

```gherkin
Given the API server is running
And a product user record exists with auth_user_id "abc-123"
And a valid token has sub claim "abc-123"
When the user sends GET /me with that token
Then the response body contains:
  | field  | value                    |
  | id     | <product db UUID>        |
  | role   | account_manager          |
  | email  | mark@iexcel.com          |
```

### Scenario: First-time user is provisioned on first authenticated request

```gherkin
Given the API server is running
And no product user record exists for auth_user_id "new-user-999"
And a valid token has sub "new-user-999", email "new@iexcel.com", name "New User"
When the user sends GET /me with that token
Then a new row is inserted into the users table with:
  | field          | value         |
  | auth_user_id   | new-user-999  |
  | email          | new@iexcel.com |
  | name           | New User       |
  | role           | team_member    |
And the response status is 200
And the response body contains role "team_member"
```

### Scenario: User email is synced on login if it has changed in IdP

```gherkin
Given a product user record exists with email "old@iexcel.com" and auth_user_id "abc-123"
And the user's token contains email "new@iexcel.com" for sub "abc-123"
When the user sends GET /me with that token
Then the users table record for auth_user_id "abc-123" has email updated to "new@iexcel.com"
And the response body contains email "new@iexcel.com"
```

---

## Feature: Role-Based Access Control

### Scenario: User with required role is granted access

```gherkin
Given a route requires role "account_manager" or "admin"
And the authenticated user has role "account_manager"
When the user sends a request to that route
Then the request proceeds to the route handler
And the response status is NOT 403
```

### Scenario: User without required role is denied

```gherkin
Given a route requires role "account_manager" or "admin"
And the authenticated user has role "team_member"
When the user sends a request to that route
Then the response status is 403
And the response body is:
  """
  {
    "error": {
      "code": "FORBIDDEN",
      "message": "You do not have permission to perform this action."
    }
  }
  """
```

### Scenario: Admin role has access to all guarded routes

```gherkin
Given a route requires role "account_manager"
And the authenticated user has role "admin"
When the user sends a request to that route
Then the request proceeds to the route handler
And the response status is NOT 403
```

---

## Feature: Request Validation

### Scenario: Valid request body passes schema validation

```gherkin
Given a route validates the request body with a Zod schema requiring { "name": string }
And a client sends a request body: { "name": "Total Life" }
When the request is processed
Then the request proceeds to the route handler
And "req.body.name" equals "Total Life"
```

### Scenario: Invalid request body returns 400

```gherkin
Given a route validates the request body with a Zod schema requiring { "name": string }
And a client sends a request body: { "name": 42 }
When the request is processed
Then the response status is 400
And the response body contains:
  | field             | value              |
  | error.code        | VALIDATION_ERROR   |
And the response body contains "error.details" with the field path "name"
```

### Scenario: Missing required field returns 400 with field detail

```gherkin
Given a route validates the request body with a Zod schema requiring { "name": string, "clientId": string }
And a client sends a request body: { "name": "Total Life" }
When the request is processed
Then the response status is 400
And the response body contains "error.details" referencing the missing field "clientId"
```

### Scenario: Malformed JSON body returns 400

```gherkin
Given a route accepts a JSON body
And a client sends a body with Content-Type: application/json but invalid JSON text
When the request is processed
Then the response status is 400
And the response body contains:
  | field       | value         |
  | error.code  | INVALID_JSON  |
```

---

## Feature: Error Handling

### Scenario: Unhandled exception returns 500 without stack trace in production

```gherkin
Given the API is running in production mode (NODE_ENV=production)
And a route handler throws an unexpected Error("Database crashed")
When a client sends a request to that route
Then the response status is 500
And the response body contains:
  | field      | value                  |
  | error.code | INTERNAL_SERVER_ERROR  |
And the response body does NOT contain the text "Database crashed"
And the response body does NOT contain a stack trace
And the error with stack trace IS logged to the server log
```

### Scenario: Unhandled exception includes stack trace in development

```gherkin
Given the API is running in development mode (NODE_ENV=development)
And a route handler throws an unexpected Error
When a client sends a request to that route
Then the response status is 500
And the response body MAY contain a stack trace or error message
```

### Scenario: Request to unknown endpoint returns 404

```gherkin
Given the API server is running
When a client sends GET /does-not-exist
Then the response status is 404
And the response body contains:
  | field      | value      |
  | error.code | NOT_FOUND  |
```

### Scenario: All error responses include request ID

```gherkin
Given any request produces an error response
Then the response body's request context (or response header X-Request-Id) contains the request ID
```

---

## Feature: Graceful Shutdown

### Scenario: Server drains in-flight requests on SIGTERM

```gherkin
Given the API server has 3 in-flight requests that will complete in 1 second
When the process receives SIGTERM
Then the server stops accepting new connections immediately
And the 3 in-flight requests complete successfully
And the database connection pool is drained
And the process exits with code 0
```

### Scenario: Server force-exits if shutdown takes too long

```gherkin
Given the API server has an in-flight request that will take 30 seconds
When the process receives SIGTERM
And 10 seconds have elapsed since the signal
Then the process exits with code 1
And a log message states the number of requests that were abandoned
```

---

## Feature: Mastra Service-to-Service Authentication

### Scenario: Mastra client credentials token is accepted

```gherkin
Given Mastra has obtained an access token via the OIDC client credentials flow
And the token has sub claim matching Mastra's service identity
And the token has audience "iexcel-api"
When Mastra sends a POST request with that token
Then the response status is NOT 401
And the request proceeds past authentication middleware
```

### Scenario: Mastra token without matching product user is provisioned

```gherkin
Given Mastra's service account has no product user record
When Mastra sends a first authenticated request
Then a product user is provisioned with role "team_member"
And the request proceeds
```

---

## Feature: CORS

### Scenario: Cross-origin request from allowed origin is accepted

```gherkin
Given CORS_ORIGINS is configured as "https://app.iexcel.com"
When a browser sends a request from origin "https://app.iexcel.com"
Then the response includes "Access-Control-Allow-Origin: https://app.iexcel.com"
```

### Scenario: Cross-origin request from disallowed origin is rejected

```gherkin
Given CORS_ORIGINS is configured as "https://app.iexcel.com"
When a browser sends a request from origin "https://evil.example.com"
Then the response does NOT include an "Access-Control-Allow-Origin" header
```

### Scenario: Preflight request is handled correctly

```gherkin
Given CORS_ORIGINS is configured
When a browser sends OPTIONS /me with:
  | Origin: https://app.iexcel.com
  | Access-Control-Request-Method: GET
  | Access-Control-Request-Headers: Authorization
Then the response status is 200
And the response includes "Access-Control-Allow-Methods" containing "GET"
And the response includes "Access-Control-Allow-Headers" containing "Authorization"
```
