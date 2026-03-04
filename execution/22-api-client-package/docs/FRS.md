# Functional Requirement Specification
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

## 2. Token Provider Interface

### FR-01: Abstract Token Provider

The client MUST accept a `TokenProvider` interface at construction time. The interface abstracts where tokens come from, enabling each consumer to inject its own strategy without modifying the client.

```typescript
interface TokenProvider {
  getAccessToken(): Promise<string>;
  refreshAccessToken(): Promise<string>;
}
```

- `getAccessToken()` — returns a valid access token. The implementation is responsible for determining if the current token is still valid before returning it.
- `refreshAccessToken()` — forces a token refresh and returns the new access token. Called automatically by the client when a `401` response is received.

### FR-02: Token Attachment

Every HTTP request (except public endpoints) MUST include the `Authorization: Bearer <token>` header. The header value is obtained by calling `tokenProvider.getAccessToken()` before each request.

### FR-03: Automatic Refresh on 401

When the API returns a `401 Unauthorized` response, the client MUST:
1. Call `tokenProvider.refreshAccessToken()` once.
2. Retry the original request with the new token.
3. If the retry also returns `401`, throw an `ApiClientError` with code `UNAUTHORIZED`. Do not retry again.

This one-retry behaviour prevents infinite refresh loops when the refresh token itself is invalid.

### FR-04: Public Endpoint Bypass

The `/shared/{token}` endpoint is public and requires no `Authorization` header. The client MUST NOT call `tokenProvider.getAccessToken()` for this endpoint. A dedicated method `getSharedAgenda(shareToken)` handles this case.

---

## 3. Client Construction and Configuration

### FR-05: Configurable Base URL

The client MUST accept a `baseUrl` at construction time. This enables environment-specific targeting (dev, staging, production) without code changes.

```typescript
const client = createApiClient({
  baseUrl: process.env.API_BASE_URL,
  tokenProvider: myProvider,
});
```

### FR-06: HTTP Transport Abstraction

The client MUST accept an optional `fetchImpl` parameter (defaulting to the global `fetch`). This enables test injection of mock HTTP layers without altering module internals.

---

## 4. Endpoint Coverage

Every API endpoint defined in `api-prd.md` must have a corresponding typed client method. The following sections define each method's signature and behaviour.

### 4.1 Authentication

**FR-10: Get Current User**

```typescript
getMe(): Promise<GetCurrentUserResponse>
// GET /me
```

### 4.2 Clients

**FR-11: List Clients**

```typescript
listClients(params?: PaginationParams): Promise<PaginatedResponse<Client>>
// GET /clients
```

**FR-12: Get Client**

```typescript
getClient(clientId: string): Promise<Client>
// GET /clients/{id}
```

**FR-13: Update Client**

```typescript
updateClient(clientId: string, body: UpdateClientRequest): Promise<Client>
// PATCH /clients/{id}
```

**FR-14: Get Client Status**

```typescript
getClientStatus(clientId: string): Promise<ClientStatusResponse>
// GET /clients/{id}/status
```

### 4.3 Transcripts

**FR-15: List Transcripts**

```typescript
listTranscripts(clientId: string, params?: PaginationParams): Promise<PaginatedResponse<GetTranscriptResponse>>
// GET /clients/{id}/transcripts
```

**FR-16: Submit Transcript**

```typescript
submitTranscript(clientId: string, body: SubmitTranscriptRequest): Promise<GetTranscriptResponse>
// POST /clients/{id}/transcripts
```

**FR-17: Get Transcript**

```typescript
getTranscript(transcriptId: string): Promise<GetTranscriptResponse>
// GET /transcripts/{id}
```

### 4.4 Tasks

All task methods accept either a UUID string or a short ID string (e.g., `TSK-0042`) as the `taskId` parameter. The API resolves short IDs transparently.

**FR-18: List Tasks**

```typescript
listTasks(clientId: string, params?: GetTasksRequest): Promise<GetTasksResponse>
// GET /clients/{id}/tasks
// Supports filtering: status, transcriptId, pagination
```

**FR-19: Create Tasks**

```typescript
createTasks(clientId: string, body: CreateTaskRequest | CreateTaskRequest[]): Promise<NormalizedTask[]>
// POST /clients/{id}/tasks
```

**FR-20: Get Task**

```typescript
getTask(taskId: string): Promise<GetTaskResponse>
// GET /tasks/{id} — includes version history
```

**FR-21: Update Task**

```typescript
updateTask(taskId: string, body: UpdateTaskRequest): Promise<NormalizedTask>
// PATCH /tasks/{id}
```

**FR-22: Approve Task**

```typescript
approveTask(taskId: string): Promise<NormalizedTask>
// POST /tasks/{id}/approve
```

**FR-23: Reject Task**

```typescript
rejectTask(taskId: string, body?: RejectTaskRequest): Promise<NormalizedTask>
// POST /tasks/{id}/reject
```

**FR-24: Push Task**

```typescript
pushTask(taskId: string): Promise<NormalizedTask>
// POST /tasks/{id}/push
```

**FR-25: Batch Approve Tasks**

```typescript
batchApproveTasks(clientId: string, body: ApproveTasksRequest): Promise<BatchOperationResponse>
// POST /clients/{id}/tasks/approve
```

**FR-26: Batch Push Tasks**

```typescript
batchPushTasks(clientId: string, body: PushTasksRequest): Promise<BatchOperationResponse>
// POST /clients/{id}/tasks/push
```

### 4.5 Agendas

All agenda methods accept either a UUID string or a short ID string (e.g., `AGD-0015`) as the `agendaId` parameter.

**FR-27: List Agendas**

```typescript
listAgendas(clientId: string, params?: PaginationParams): Promise<GetAgendasResponse>
// GET /clients/{id}/agendas
```

**FR-28: Create Agenda**

```typescript
createAgenda(clientId: string, body: CreateAgendaRequest): Promise<Agenda>
// POST /clients/{id}/agendas
```

**FR-29: Get Agenda**

```typescript
getAgenda(agendaId: string): Promise<GetAgendaResponse>
// GET /agendas/{id} — includes version history
```

**FR-30: Update Agenda**

```typescript
updateAgenda(agendaId: string, body: UpdateAgendaRequest): Promise<Agenda>
// PATCH /agendas/{id}
```

**FR-31: Finalize Agenda**

```typescript
finalizeAgenda(agendaId: string): Promise<Agenda>
// POST /agendas/{id}/finalize
```

**FR-32: Share Agenda**

```typescript
shareAgenda(agendaId: string): Promise<ShareAgendaResponse>
// POST /agendas/{id}/share
```

**FR-33: Email Agenda**

```typescript
emailAgenda(agendaId: string, body?: EmailAgendaRequest): Promise<void>
// POST /agendas/{id}/email
```

**FR-34: Export Agenda**

```typescript
exportAgenda(agendaId: string): Promise<ExportAgendaResponse>
// POST /agendas/{id}/export
```

**FR-35: Get Shared Agenda (Public)**

```typescript
getSharedAgenda(shareToken: string): Promise<Agenda>
// GET /shared/{token} — no auth header attached
```

### 4.6 Workflows

**FR-36: Trigger Intake Workflow**

```typescript
triggerIntakeWorkflow(body: TriggerIntakeWorkflowRequest): Promise<WorkflowStatusResponse>
// POST /workflows/intake
```

**FR-37: Trigger Agenda Workflow**

```typescript
triggerAgendaWorkflow(body: TriggerAgendaWorkflowRequest): Promise<WorkflowStatusResponse>
// POST /workflows/agenda
```

**FR-38: Get Workflow Status**

```typescript
getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse>
// GET /workflows/{id}/status
```

### 4.7 Asana Workspaces

**FR-39: List Asana Workspaces**

```typescript
listAsanaWorkspaces(): Promise<AsanaWorkspace[]>
// GET /asana/workspaces
```

**FR-40: Add Asana Workspace**

```typescript
addAsanaWorkspace(body: AddAsanaWorkspaceRequest): Promise<AsanaWorkspace>
// POST /asana/workspaces
```

**FR-41: Delete Asana Workspace**

```typescript
deleteAsanaWorkspace(workspaceId: string): Promise<void>
// DELETE /asana/workspaces/{id}
```

### 4.8 Client Import

**FR-42: Trigger Import**

```typescript
triggerImport(clientId: string, body: TriggerImportRequest): Promise<ImportStatusResponse>
// POST /clients/{id}/import
```

**FR-43: Get Import Status**

```typescript
getImportStatus(clientId: string): Promise<ImportStatusResponse>
// GET /clients/{id}/import/status
```

### 4.9 Audit

**FR-44: Query Audit Log**

```typescript
queryAuditLog(params: AuditQueryParams): Promise<PaginatedResponse<AuditEntry>>
// GET /audit
// Supports filtering: entity_type, entity_id, user_id, date_range, pagination
```

---

## 5. Error Handling

### FR-50: Typed API Error Parsing

When the API returns a non-2xx response, the client MUST:
1. Attempt to parse the response body as `ApiErrorResponse` (`{ error: { code, message, details } }`).
2. If parsing succeeds, throw an `ApiClientError` with the parsed `code`, `message`, and `details`.
3. If parsing fails (e.g., unexpected HTML error page from a gateway), throw an `ApiClientError` with code `UNKNOWN_ERROR` and the raw response body in `details`.

### FR-51: ApiClientError Class

```typescript
class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode | 'UNKNOWN_ERROR',
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {}
}
```

Consumers can use `instanceof ApiClientError` to distinguish API-level errors from network errors. They can then switch on `error.code` to handle specific cases (e.g., `TASK_NOT_APPROVABLE`, `FORBIDDEN`).

### FR-52: Network Error Handling

Network-level failures (DNS failure, timeout, connection refused) MUST be caught and rethrown as `ApiClientError` with code `NETWORK_ERROR` so consumers have a uniform error handling pattern.

---

## 6. Query Parameter Handling

### FR-55: Filterable Endpoints

Methods for filterable endpoints accept typed parameter objects. The client serialises these to URL query parameters:

- `undefined` values are omitted from the query string
- `null` values are omitted from the query string
- Arrays are serialised as repeated parameters (e.g., `status=draft&status=approved`)
- `PaginationParams` (`page`, `limit`) are included when provided

### FR-56: Pagination Support

All list endpoint methods accept `PaginationParams` and return `PaginatedResponse<T>` matching the `shared-types` definition. Callers are responsible for page iteration — the client does not auto-paginate.

---

## 7. User Workflows

### 7.1 UI Engineer Workflow

1. Import `createApiClient` from `@iexcel/api-client`.
2. Instantiate with `baseUrl` (from `process.env.API_BASE_URL`) and a `TokenProvider` that reads from the UI's session/cookie mechanism.
3. Call typed methods — e.g., `client.listTasks(clientId, { status: TaskStatus.Draft })`.
4. Receive fully-typed response objects.
5. Catch `ApiClientError` for error handling — switch on `error.code`.

### 7.2 Mastra Agent Workflow

1. Import `createApiClient` from `@iexcel/api-client`.
2. Instantiate with `baseUrl` and a `TokenProvider` that uses the `auth-client` client credentials flow.
3. Call methods within agent tool handlers — e.g., `client.createTasks(clientId, tasks)`.
4. The token provider transparently refreshes client credentials on expiry.

### 7.3 Terminal MCP Tool Workflow

1. Import `createApiClient` from `@iexcel/api-client`.
2. Instantiate with `baseUrl` (from config file) and a `TokenProvider` that reads/writes `~/.iexcel/auth/tokens.json` via `@iexcel/auth-client`.
3. Call methods from MCP tool handlers.
4. On `401`, the token provider refreshes using the stored refresh token.

---

## 8. Input/Output Specifications

### 8.1 Request Bodies

All request body types are imported from `@iexcel/shared-types/api`. Methods are typed to reject incorrect payloads at compile time. The client serialises request bodies as `application/json`.

### 8.2 Response Bodies

All response types are imported from `@iexcel/shared-types/api`. Methods return typed Promises. The client deserialises response bodies from JSON.

### 8.3 Content-Type Header

The client MUST set `Content-Type: application/json` on all requests with a body (POST, PATCH). It MUST set `Accept: application/json` on all requests.

---

## 9. Out of Scope

- No HTTP server or API route implementation
- No token issuance, login flows, or PKCE (that is `packages/auth-client`, feature 06)
- No UI components or terminal CLI scaffolding
- No direct database or external service access
- No response caching (consumers manage their own caching)
- No request queuing or retry logic beyond the single 401-triggered token refresh retry
- No WebSocket or SSE support (polling via `getWorkflowStatus` is sufficient for v1)
