# Technical Requirements
# Feature 22: API Client Package (`packages/api-client`)

**Date:** 2026-03-03

---

## 1. Package Identity

| Property | Value |
|---|---|
| **Nx project name** | `api-client` |
| **Package name** | `@iexcel/api-client` |
| **Location** | `packages/api-client/` |
| **Type** | Nx library (not an app; no Dockerfile) |
| **Language** | TypeScript (strict mode) |
| **Runtime target** | Node.js 20+ |

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Matches monorepo standard; all consumers are TypeScript |
| Build executor | `@nx/js:tsc` | Consistent with `auth-client` (feature 06) and `shared-types` (feature 01) |
| HTTP transport | Native `fetch` (Node.js 18+) | Zero dependencies; available in all target runtimes |
| Test framework | `vitest` | Consistent with feature 06 |
| HTTP mocking | `msw` (Mock Service Worker) | Fetch-level interception; consistent with feature 06 |
| Coverage | `@vitest/coverage-v8` | Consistent with feature 06 |
| No external HTTP library | — | `axios`, `ky`, etc. add unnecessary bundle weight; native fetch is sufficient |

---

## 3. Dependencies

### 3.1 Internal Nx Dependencies

| Package | Usage |
|---|---|
| `@iexcel/shared-types` | All request/response types, error codes, pagination types |

No other internal package dependencies. The `api-client` does NOT depend on `@iexcel/auth-client` — token management is injected via the `TokenProvider` interface.

### 3.2 External Runtime Dependencies

None. The package has zero external runtime dependencies. All consumers already have `fetch` available via Node.js 18+.

### 3.3 Dev Dependencies

| Package | Purpose |
|---|---|
| `typescript` | Compilation |
| `@nx/js` | Nx library build target |
| `vitest` | Unit testing |
| `@vitest/coverage-v8` | Code coverage |
| `msw` | HTTP mocking for unit tests |

---

## 4. File Structure

```
packages/api-client/
├── src/
│   ├── index.ts                    # Root barrel — re-exports public API
│   ├── types/
│   │   ├── index.ts                # Re-export all types
│   │   ├── client-options.ts       # ApiClientOptions, TokenProvider interface
│   │   ├── errors.ts               # ApiClientError class
│   │   └── additional.ts           # ClientStatusResponse, AuditEntry, etc. not in shared-types
│   ├── core/
│   │   ├── index.ts
│   │   ├── http.ts                 # Internal HTTP transport: request(), buildUrl(), parseError()
│   │   └── api-client.ts           # ApiClient class — all endpoint method implementations
│   └── endpoints/
│       ├── index.ts
│       ├── auth.ts                 # getMe()
│       ├── clients.ts              # listClients(), getClient(), updateClient(), getClientStatus()
│       ├── transcripts.ts          # listTranscripts(), submitTranscript(), getTranscript()
│       ├── tasks.ts                # All task methods
│       ├── agendas.ts              # All agenda methods including getSharedAgenda()
│       ├── workflows.ts            # triggerIntakeWorkflow(), triggerAgendaWorkflow(), getWorkflowStatus()
│       ├── asana.ts                # listAsanaWorkspaces(), addAsanaWorkspace(), deleteAsanaWorkspace()
│       ├── import.ts               # triggerImport(), getImportStatus()
│       └── audit.ts                # queryAuditLog()
├── project.json                    # Nx project configuration
├── package.json                    # Package manifest with exports map
├── tsconfig.json                   # Extends workspace tsconfig.base.json
├── tsconfig.lib.json               # Build-specific tsconfig
├── tsconfig.spec.json              # Test-specific tsconfig
└── vite.config.ts                  # Vitest configuration
```

Note: The endpoint files are organisational — they are not exposed as subpath exports. All public methods are re-exported through the root `index.ts`. Internal separation into endpoint files keeps the codebase navigable as method count grows.

---

## 5. Core Type Definitions

### 5.1 `types/client-options.ts`

```typescript
export interface TokenProvider {
  /**
   * Returns a valid access token for the current session.
   * The implementation is responsible for determining freshness.
   * Called before every authenticated request.
   */
  getAccessToken(): Promise<string>;

  /**
   * Forces a token refresh and returns the new access token.
   * Called automatically by the client after a 401 response.
   * Must return a valid token or throw.
   */
  refreshAccessToken(): Promise<string>;
}

export interface ApiClientOptions {
  /**
   * Base URL of the iExcel API. e.g., "https://api.iexcel.com"
   * Trailing slashes are normalised internally.
   */
  baseUrl: string;

  /**
   * Token provider for this client instance.
   * Each consumer injects its own implementation.
   */
  tokenProvider: TokenProvider;

  /**
   * Optional custom fetch implementation.
   * Defaults to global fetch (Node.js 18+).
   * Inject a mock implementation in tests.
   */
  fetchImpl?: typeof fetch;
}
```

### 5.2 `types/errors.ts`

```typescript
import type { ApiErrorCode } from '@iexcel/shared-types';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode | 'UNKNOWN_ERROR' | 'NETWORK_ERROR',
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
```

### 5.3 `types/additional.ts`

Types required by the client that are not yet in `shared-types` at the time of implementation. These should be proposed for inclusion in `shared-types` if they are used by multiple consumers.

```typescript
/** Response shape for GET /clients/{id}/status */
export interface ClientStatusResponse {
  clientId: string;
  pendingApprovals: number;
  agendaReady: boolean;
  nextCallDate: string | null;
}

/** Query parameters for GET /audit */
export interface AuditQueryParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/** Single audit log entry returned by GET /audit */
export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  action: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

/** Request body for POST /asana/workspaces */
export interface AddAsanaWorkspaceRequest {
  asanaWorkspaceId: string;
  name: string;
  accessToken: string;
}

/** Response for GET /clients/{id}/import/status and POST /clients/{id}/import */
export interface ImportStatusResponse {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

/** Request body for POST /clients/{id}/import */
export interface TriggerImportRequest {
  grainPlaylistId?: string;
  asanaProjectId?: string;
}

/** Request body for POST /tasks/{id}/reject */
export interface RejectTaskRequest {
  reason?: string;
}
```

---

## 6. Core HTTP Transport

### 6.1 `core/http.ts` — Internal Implementation

The HTTP transport is not exposed publicly. It is used only by the `ApiClient` class.

```typescript
// Pseudocode — full implementation in core/http.ts

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  skipAuth?: boolean;  // true for /shared/{token} endpoint
}

class HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: TokenProvider,
    private readonly fetchImpl: typeof fetch
  ) {}

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const headers = await this.buildHeaders(options.skipAuth);

    let response = await this.fetchImpl(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Token refresh on 401 — single retry
    if (response.status === 401 && !options.skipAuth) {
      const newToken = await this.tokenProvider.refreshAccessToken();
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }

    if (!response.ok) {
      await this.throwParsedError(response);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private buildUrl(path: string, params?: Record<string, ...>): string {
    const base = this.baseUrl.replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async buildHeaders(skipAuth?: boolean): Promise<Headers> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });
    if (!skipAuth) {
      const token = await this.tokenProvider.getAccessToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private async throwParsedError(response: Response): Promise<never> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      const rawText = await response.text().catch(() => '');
      throw new ApiClientError('Unexpected non-JSON error response', 'UNKNOWN_ERROR', response.status, { rawBody: rawText });
    }

    const errorBody = body as ApiErrorResponse;
    if (errorBody?.error?.code) {
      throw new ApiClientError(
        errorBody.error.message,
        errorBody.error.code as ApiErrorCode,
        response.status,
        errorBody.error.details
      );
    }

    throw new ApiClientError('Unknown API error', 'UNKNOWN_ERROR', response.status, { rawBody: body });
  }
}
```

### 6.2 Network Error Wrapping

All `fetchImpl` calls are wrapped to catch network-level errors:

```typescript
try {
  response = await this.fetchImpl(url, init);
} catch (err) {
  throw new ApiClientError(
    err instanceof Error ? err.message : 'Network request failed',
    'NETWORK_ERROR',
    0,
    { cause: err }
  );
}
```

---

## 7. ApiClient Class

### 7.1 Factory Function

The public API exposes a factory function, not the class constructor directly. This is consistent with the `auth-client` pattern and makes it easier to mock in tests.

```typescript
export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
```

### 7.2 Class Structure

```typescript
export class ApiClient {
  private readonly http: HttpTransport;

  constructor(options: ApiClientOptions) {
    this.http = new HttpTransport(
      options.baseUrl,
      options.tokenProvider,
      options.fetchImpl ?? fetch
    );
  }

  // Auth
  getMe(): Promise<GetCurrentUserResponse> {
    return this.http.request({ method: 'GET', path: '/me' });
  }

  // Clients
  listClients(params?: PaginationParams): Promise<PaginatedResponse<Client>> {
    return this.http.request({ method: 'GET', path: '/clients', params });
  }

  getClient(clientId: string): Promise<Client> {
    return this.http.request({ method: 'GET', path: `/clients/${clientId}` });
  }

  updateClient(clientId: string, body: UpdateClientRequest): Promise<Client> {
    return this.http.request({ method: 'PATCH', path: `/clients/${clientId}`, body });
  }

  getClientStatus(clientId: string): Promise<ClientStatusResponse> {
    return this.http.request({ method: 'GET', path: `/clients/${clientId}/status` });
  }

  // ... all other methods follow the same pattern
  // See FRS.md for full method signatures

  // Public endpoint — no token attachment
  getSharedAgenda(shareToken: string): Promise<Agenda> {
    return this.http.request({ method: 'GET', path: `/shared/${shareToken}`, skipAuth: true });
  }
}
```

---

## 8. Nx Project Configuration

### 8.1 `project.json`

```json
{
  "name": "api-client",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/api-client/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/api-client",
        "main": "packages/api-client/src/index.ts",
        "tsConfig": "packages/api-client/tsconfig.lib.json",
        "assets": ["packages/api-client/*.md"]
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/api-client/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/packages/api-client"],
      "options": {
        "passWithNoTests": true,
        "reportsDirectory": "../../coverage/packages/api-client"
      }
    }
  },
  "tags": ["scope:shared", "type:library"]
}
```

### 8.2 `package.json`

```json
{
  "name": "@iexcel/api-client",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./package.json": "./package.json"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "peerDependencies": {
    "@iexcel/shared-types": "*"
  }
}
```

Note: No subpath exports unlike `auth-client` — the `api-client` public surface is a flat list of methods on a single `ApiClient` class. No reason to tree-shake by module.

### 8.3 Root `tsconfig.base.json` Path Alias Addition

```json
{
  "compilerOptions": {
    "paths": {
      "@iexcel/api-client": ["packages/api-client/src/index.ts"]
    }
  }
}
```

---

## 9. TypeScript Configuration

### 9.1 `tsconfig.json`

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
    { "path": "../../packages/shared-types/tsconfig.lib.json" }
  ]
}
```

### 9.2 Strict Requirements

- `strict: true` is non-negotiable
- No `any` types without explicit justification and `// eslint-disable` comment
- All function parameters and return types must be explicitly typed
- All `catch` blocks must use typed errors (no `catch (e: any)`)

---

## 10. Query Parameter Serialisation

Query parameters are serialised using the `URLSearchParams` API via `URL.searchParams`. Rules:

| Value | Behaviour |
|---|---|
| `undefined` | Omitted from query string |
| `null` | Omitted from query string |
| `string` | Added as-is |
| `number` | Converted with `String()` |
| `boolean` | Converted with `String()` (`"true"` / `"false"`) |
| Array (future) | Repeated parameter: `?status=draft&status=approved` |

The `params` object type must reflect these rules so TypeScript enforces correct values at call sites.

---

## 11. Testing Strategy

### 11.1 Unit Tests

All modules must have unit tests using `vitest`. HTTP interactions must be mocked using `msw` at the `fetch` level, not by mocking module internals.

Test files live alongside source files: `src/core/http.test.ts`, `src/endpoints/tasks.test.ts`, etc.

| Module / Concern | Key Test Cases |
|---|---|
| Token attachment | Correct `Authorization` header on every authenticated request |
| Public endpoint bypass | No `Authorization` header on `getSharedAgenda` |
| 401 refresh flow | Single retry, no double refresh, correct final token used |
| 401 double failure | Throws `ApiClientError` with `UNAUTHORIZED` |
| Non-401 error | No refresh triggered, correct error code |
| JSON error parsing | `code`, `message`, `details` extracted correctly |
| Non-JSON error fallback | `UNKNOWN_ERROR` with raw body in `details` |
| Network error wrapping | `NETWORK_ERROR` with original message |
| URL construction | Trailing slash normalisation, param serialisation |
| Undefined params omitted | Query string does not contain undefined/null keys |
| `createApiClient` | Returns `ApiClient` instance with correct methods |
| All endpoint methods | Correct HTTP method, correct URL, correct body shape |
| `deleteAsanaWorkspace` | Returns `void` on 204 |
| `emailAgenda` with no body | Empty body or no body sent |
| Batch operations | Partial success response typed as `BatchOperationResponse` |

### 11.2 Test Isolation

- All tests must pass without a running API server.
- `fetchImpl` injection via `ApiClientOptions` enables full test isolation.
- `msw` handlers intercept at the fetch level — no need to mock the `ApiClient` itself.

### 11.3 Coverage Target

Minimum 90% line/branch coverage enforced in CI via `vitest --coverage`.

---

## 12. Security Considerations

| Concern | Mitigation |
|---|---|
| Token logging | Access tokens must NEVER appear in error messages, log statements, or error `details` |
| Token in URL | Tokens are always in the `Authorization` header, never in the URL query string |
| HTTPS enforcement | The `baseUrl` should be `https://` in all non-dev environments. The client does not enforce this but documentation must warn against `http://` in production. |
| Refresh token leakage | The `TokenProvider` interface abstracts refresh — the client never sees or logs the refresh token |
| Public endpoint token bypass | The `skipAuth: true` flag is set only for `getSharedAgenda`. No other endpoint uses this flag. |
| Error response content | API error `details` may contain user data — do not log error details without sanitisation |

---

## 13. Performance Considerations

| Concern | Requirement |
|---|---|
| Token fetch per request | `getAccessToken()` is called before every authenticated request. Implementations must use in-memory caching — the client calls it on every request by design. |
| No bundled dependencies | Zero external runtime dependencies keeps the package lightweight and does not add to consumer bundle sizes. |
| Retry limit | Only one retry on 401. No exponential backoff, no retry on 5xx (consumers handle retries). |
| URL construction | `URL` and `URLSearchParams` are built-in — no string manipulation overhead. |

---

## 14. Nx Dependency Graph Impact

Per `infra-prd.md`, changes to `packages/api-client/` trigger:

| Affected App | Why |
|---|---|
| `apps/ui` | Imports `@iexcel/api-client` for all API calls |
| `apps/mastra` | Imports `@iexcel/api-client` for agent tool implementations |

Terminal tools are not containers. They pick up changes when the terminal tool package is updated.

---

## 15. Environment Variable Convention

The client does not read environment variables directly. Consumers are responsible for injecting configuration. However, the recommended convention for consumer apps:

| App | Env Var | Usage |
|---|---|---|
| `apps/ui` | `API_BASE_URL` | Passed to `createApiClient({ baseUrl: process.env.API_BASE_URL })` |
| `apps/mastra` | `API_BASE_URL` | Same |
| Terminal tools | Config file `~/.iexcel/config.json` | `{ apiBaseUrl: "https://api.iexcel.com" }` |

---

## 16. Deployment Notes

- `api-client` is not deployed independently — it is a library bundled into each consumer.
- No Dockerfile, no container registry entry, no Terraform module for this package.
- The Nx build target (`@nx/js:tsc`) compiles to `dist/packages/api-client/` for use in container builds.
- For local development: TypeScript path aliases in `tsconfig.base.json` allow apps to import directly from source — no pre-build step needed.

---

## 17. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| Should `ClientStatusResponse` and `AuditEntry` types be added to `shared-types` (feature 01)? | If yes, `api-client` imports them; if no, they live in `api-client/src/types/additional.ts` | Add to `shared-types` if any other consumer needs them raw; otherwise keep local |
| Does the API use camelCase or snake_case for query parameter names? | Affects `listTasks` param serialisation (`transcriptId` vs `transcript_id`) | Confirm with feature 07/11 spec before implementing |
| What is the exact response shape for `POST /clients/{id}/tasks` when creating multiple tasks? | `NormalizedTask[]` or a wrapper object? | Confirm with feature 11 spec |
| Should `getSharedAgenda` return `Agenda` or a lighter public-facing type? | If the API returns a reduced payload for public access, a distinct type is needed | Confirm with feature 14 spec |
| Does `POST /tasks/{id}/reject` require a request body? | Determines if `RejectTaskRequest` is mandatory or optional | Confirm with feature 11 spec |
| Node.js 18 vs 20 — is `fetch` available without `--experimental-fetch` flag? | Node.js 18.0 requires flag; 18.3+ has it stable | Target Node.js 20 to avoid this concern entirely |
