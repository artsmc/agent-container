# Functional Requirement Specification
# Feature 07: API Scaffolding (`apps/api`)

**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03

---

## 1. Server Initialization

### 1.1 Application Bootstrap

**FR-BOOT-01:** The application MUST export a factory function `createApp(config: AppConfig): App` that wires together all middleware and returns the configured server instance. The app MUST NOT start listening within `createApp` — startup is the responsibility of the entry point (`main.ts`).

**FR-BOOT-02:** The entry point (`main.ts`) MUST:
1. Load and validate environment variables (fail fast if required vars are missing).
2. Initialize the database connection pool.
3. Create the application instance via `createApp`.
4. Start the HTTP server.
5. Register shutdown signal handlers (`SIGTERM`, `SIGINT`).

**FR-BOOT-03:** If any required environment variable is absent at startup, the process MUST log the missing variable name and exit with code `1`. It MUST NOT start in a degraded state.

**FR-BOOT-04:** If the database connection pool fails to establish a connection on startup (health check query), the process MUST log the error and exit with code `1`.

**FR-BOOT-05:** On successful startup, the process MUST log the port it is listening on and the environment name (e.g., `API listening on port 3000 [production]`).

---

## 2. Middleware Chain

The middleware MUST execute in this order for every request:

```
1. Request Logger
2. CORS
3. Body Parser (JSON)
4. Rate Limit Stub
5. OIDC Token Validation        ← Protected routes only
6. User Profile Loader          ← Protected routes only
7. Route Handler
8. 404 Handler                  ← Unmatched routes
9. Error Handler                ← Catches all thrown errors
```

### 2.1 Request Logger

**FR-LOG-01:** Every incoming HTTP request MUST be logged with: HTTP method, path, status code, and response time in milliseconds.

**FR-LOG-02:** The logger MUST NOT log `Authorization` header values, request bodies, or any field that may contain credentials or PII.

**FR-LOG-03:** The logger MUST produce structured JSON output in production (`NODE_ENV=production`) and human-readable output in development.

**FR-LOG-04:** Request IDs MUST be generated (UUID v4) per request and attached to the request context. The request ID MUST be included in the response as `X-Request-Id` header.

### 2.2 CORS

**FR-CORS-01:** CORS origins MUST be configurable via the `CORS_ORIGINS` environment variable (comma-separated list of allowed origins).

**FR-CORS-02:** The `/health` endpoint and the `/shared/:token` public endpoint MUST allow requests from any origin (`*`).

**FR-CORS-03:** All other endpoints MUST restrict origins to the configured `CORS_ORIGINS` list.

**FR-CORS-04:** The API MUST support preflight (`OPTIONS`) requests with a `200` response and appropriate CORS headers.

### 2.3 Body Parser

**FR-BODY-01:** The server MUST parse `application/json` request bodies.

**FR-BODY-02:** The maximum request body size MUST be configurable via `MAX_REQUEST_BODY_SIZE` environment variable (default: `1mb`).

**FR-BODY-03:** If a request body is malformed JSON, the parser MUST produce an error that is caught by the error handler and returned as `400 Bad Request` with `{ "error": { "code": "INVALID_JSON", "message": "Request body is not valid JSON." } }`.

### 2.4 Rate Limit Stub

**FR-RATE-01:** A rate limiting middleware stub MUST exist in the middleware chain at the correct position. In this feature, it MUST be a pass-through (no actual limiting).

**FR-RATE-02:** The stub MUST be annotated with a `// TODO(feature-XX): Replace with real rate limiting` comment identifying it as intentionally incomplete.

### 2.5 OIDC Token Validation Middleware

**FR-AUTH-01:** All routes EXCEPT `/health` and `/shared/:token` MUST be protected by token validation middleware.

**FR-AUTH-02:** The middleware MUST extract the bearer token from the `Authorization: Bearer <token>` header.

**FR-AUTH-03:** If the `Authorization` header is absent or does not match the `Bearer <token>` pattern, the middleware MUST pass to the error handler with a `401 UNAUTHORIZED` error. It MUST NOT call the next route handler.

**FR-AUTH-04:** The middleware MUST call `validateToken(jwt)` from `@iexcel/auth-client/validation` to verify the token signature, issuer, audience, and expiry.

**FR-AUTH-05:** If `validateToken` throws a `TokenValidationError`, the middleware MUST map it to a `401 UNAUTHORIZED` API error and pass to the error handler.

**FR-AUTH-06:** If `validateToken` succeeds, the middleware MUST attach the decoded `TokenClaims` to the request context as `req.tokenClaims`.

**FR-AUTH-07:** The `TokenValidator` instance MUST be created once at application startup (singleton), not on every request. The JWKS cache lives in this singleton.

**FR-AUTH-08:** The validator MUST be configured with:
- `issuerUrl` from `AUTH_ISSUER_URL` environment variable
- `audience` set to `"iexcel-api"`

### 2.6 User Profile Loader Middleware

**FR-USER-01:** After successful token validation, the user profile middleware MUST look up the user's product record from the `users` table using `auth_user_id = tokenClaims.sub`.

**FR-USER-02:** If no matching user record is found, the middleware MUST perform **just-in-time (JIT) provisioning**: insert a new `users` row with `auth_user_id = sub`, `email` and `name` from the token claims, and `role = 'team_member'`.

**FR-USER-03:** After lookup or JIT provisioning, the middleware MUST attach a `req.user` object to the request with at minimum:

```typescript
interface RequestUser {
  id: string;           // product users.id (UUID)
  authUserId: string;   // token sub claim
  email: string;
  name: string;
  role: 'admin' | 'account_manager' | 'team_member';
}
```

**FR-USER-04:** The user profile loader MUST update `users.email` and `users.name` from token claims if they differ from the stored values (keeps product DB in sync with IdP changes).

**FR-USER-05:** If the database query fails (not a "not found" condition, but a genuine DB error), the middleware MUST pass to the error handler with a `500 INTERNAL_SERVER_ERROR`.

### 2.7 Request Validation Middleware (Schema Validator Factory)

**FR-VAL-01:** The feature MUST expose a `validate(schema: ZodSchema)` middleware factory function that route handlers use to validate request bodies, query parameters, or path parameters.

**FR-VAL-02:** Validation MUST use Zod as the schema library. Zod is chosen for its TypeScript-first design and the ability to infer TypeScript types from schemas.

**FR-VAL-03:** If validation fails, the middleware MUST pass to the error handler with a `400 VALIDATION_ERROR` that includes the Zod error details in `error.details`.

**FR-VAL-04:** If validation passes, the parsed (coerced) value MUST replace the raw input on the request object so route handlers receive type-safe, coerced values.

**FR-VAL-05:** The `validate` factory MUST support three targets: `body`, `query`, `params`.

```typescript
// Usage example (for downstream features):
router.post('/clients', validate({ body: CreateClientSchema }), createClientHandler);
```

### 2.8 404 Handler

**FR-404-01:** Any request to an unregistered route MUST return `404` with:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested endpoint does not exist."
  }
}
```

### 2.9 Error Handler Middleware

**FR-ERR-01:** The error handler MUST be the **last** middleware registered on the application.

**FR-ERR-02:** The error handler MUST produce responses in the standard error envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": {}
  }
}
```

**FR-ERR-03:** The error handler MUST map known application error types to HTTP status codes using the following table:

| Error Code | HTTP Status |
|---|---|
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `INVALID_JSON` | 400 |
| `CONFLICT` | 409 |
| `UNPROCESSABLE` | 422 |
| `TASK_NOT_APPROVABLE` | 422 |
| `AGENDA_NOT_FINALIZABLE` | 422 |
| `WORKSPACE_NOT_CONFIGURED` | 422 |
| `CLIENT_NOT_FOUND` | 404 |
| `PUSH_FAILED` | 502 |
| `INTERNAL_SERVER_ERROR` | 500 |

**FR-ERR-04:** In production (`NODE_ENV=production`), the error handler MUST NOT include stack traces or internal error messages in the response body for `5xx` errors. It MUST log the full error (with stack trace) server-side.

**FR-ERR-05:** In development (`NODE_ENV=development`), the error handler MAY include stack traces in the response body for `5xx` errors to aid debugging.

**FR-ERR-06:** Any uncaught exception type that is NOT a known `ApiError` subclass MUST be treated as a `500 INTERNAL_SERVER_ERROR`.

**FR-ERR-07:** The feature MUST define an `ApiError` class hierarchy that route handlers and middleware throw:

```typescript
class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) { ... }
}

class UnauthorizedError extends ApiError { ... }
class ForbiddenError extends ApiError { ... }
class NotFoundError extends ApiError { ... }
class ValidationError extends ApiError { ... }
class UnprocessableError extends ApiError { ... }
class InternalServerError extends ApiError { ... }
```

---

## 3. Health Check Endpoint

**FR-HEALTH-01:** `GET /health` MUST be publicly accessible (no auth required).

**FR-HEALTH-02:** The response MUST include:

```json
{
  "status": "ok",
  "timestamp": "2026-03-03T12:00:00.000Z",
  "version": "0.1.0",
  "checks": {
    "database": "ok"
  }
}
```

**FR-HEALTH-03:** The `checks.database` field MUST reflect the result of a lightweight query against the PostgreSQL connection pool (e.g., `SELECT 1`).

**FR-HEALTH-04:** If the database check fails, the response MUST return HTTP `503 Service Unavailable` and `checks.database = "error"`. The error message MUST be logged server-side but MUST NOT be included in the response body in production.

**FR-HEALTH-05:** The health check MUST complete within 2 seconds. If it exceeds this timeout, it MUST return `503`.

---

## 4. Current User Endpoint

**FR-ME-01:** `GET /me` MUST be a protected endpoint (requires valid token).

**FR-ME-02:** The response MUST return the authenticated user's product profile:

```json
{
  "id": "uuid",
  "authUserId": "uuid",
  "email": "mark@iexcel.com",
  "name": "Mark",
  "role": "account_manager"
}
```

**FR-ME-03:** The `/me` endpoint uses the `req.user` object set by the user profile loader middleware — it performs no additional database queries.

---

## 5. Database Connection

**FR-DB-01:** The API MUST use a PostgreSQL connection pool, not a single connection. The pool size MUST be configurable via `DB_POOL_MAX` (default: 10) and `DB_POOL_MIN` (default: 2) environment variables.

**FR-DB-02:** The database connection MUST be initialized before the server starts accepting requests.

**FR-DB-03:** The connection pool MUST be exposed as a singleton accessible to all route handlers and middleware (dependency injection or module-level singleton — see TR.md for approach).

**FR-DB-04:** On startup, the API MUST verify the migration state. If there are pending unapplied migrations, the server MUST log a warning but MAY still start (to avoid blocking reads-only deployments). The migration check result MUST appear in `/health` response.

**FR-DB-05:** The database connection string MUST be read from the `DATABASE_URL` environment variable. It MUST NOT be hardcoded.

**FR-DB-06:** On graceful shutdown, the connection pool MUST be drained before the process exits.

---

## 6. Graceful Shutdown

**FR-SHUT-01:** The server MUST listen for `SIGTERM` and `SIGINT` signals.

**FR-SHUT-02:** On receiving a shutdown signal, the server MUST:
1. Stop accepting new connections (close the HTTP server).
2. Allow in-flight requests to complete up to a maximum of 10 seconds.
3. Drain the database connection pool.
4. Exit with code `0`.

**FR-SHUT-03:** If in-flight requests do not complete within 10 seconds, the server MUST force-exit with code `1` and log the number of requests that were abandoned.

---

## 7. HTTP Response Helpers

**FR-RESP-01:** The feature MUST expose a `sendSuccess` helper function for route handlers to return consistent success responses:

```typescript
function sendSuccess<T>(res: Response, data: T, statusCode?: number): void
// Default status: 200
// Response shape: { data: T }
```

**FR-RESP-02:** The feature MUST expose a `sendPaginated` helper for list endpoints:

```typescript
function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
): void
// Response shape: { data: T[], pagination: { page, pageSize, total, totalPages } }
```

**FR-RESP-03:** Route handlers MUST use these helpers rather than calling `res.json()` directly, to ensure response shape consistency across all endpoints.

---

## 8. Permission Guard Helper

**FR-PERM-01:** The feature MUST expose a `requireRole(...roles: UserRole[])` middleware factory:

```typescript
function requireRole(...roles: UserRole[]): RequestHandler
```

**FR-PERM-02:** If `req.user.role` is not in the allowed roles list, the middleware MUST throw a `ForbiddenError`.

**FR-PERM-03:** Downstream features use this factory on individual routes:

```typescript
// Example usage by Feature 11:
router.post('/tasks/:id/approve', requireRole('admin', 'account_manager'), approveTaskHandler);
```

---

## 9. Environment Variable Specification

All environment variables MUST be validated at startup via a Zod schema. Missing required variables cause immediate process exit.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | — | `development`, `staging`, `production` |
| `PORT` | No | `3000` | HTTP port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `DB_POOL_MIN` | No | `2` | Minimum pool connections |
| `DB_POOL_MAX` | No | `10` | Maximum pool connections |
| `AUTH_ISSUER_URL` | Yes | — | Auth service base URL (e.g., `https://auth.iexcel.com`) |
| `CORS_ORIGINS` | Yes | — | Comma-separated allowed origins |
| `MAX_REQUEST_BODY_SIZE` | No | `1mb` | Max JSON body size |
| `LOG_LEVEL` | No | `info` | Logger level (`debug`, `info`, `warn`, `error`) |

---

## 10. CORS Configuration Detail

**FR-CORS-05:** Allowed HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.

**FR-CORS-06:** Allowed headers: `Content-Type`, `Authorization`, `X-Request-Id`.

**FR-CORS-07:** Exposed response headers: `X-Request-Id`.

**FR-CORS-08:** Credentials mode: `true` (required for cookies in browser-based auth flows).

**FR-CORS-09:** Max preflight age: `86400` seconds (24 hours).
