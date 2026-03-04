# TR — Technical Requirements
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Date:** 2026-03-03

---

## 1. Technology Stack

| Concern | Technology | Source |
|---|---|---|
| Language | TypeScript (strict mode) | Inherited from `apps/mastra/` (Feature 18) |
| Runtime | Node.js 20+ | Inherited from `apps/mastra/` |
| Agent Framework | Mastra (`@mastra/core`, `mastra`) | Feature 18 |
| Schema Validation | Zod | Feature 18 |
| HTTP Client | `@iexcel/api-client` | Feature 22 |
| Logger | Pino (via `@mastra/loggers`) | Feature 18 |
| Observability | OpenTelemetry (OTLP) | Feature 18 |
| Module System | ESM (`"type": "module"`) | Feature 18 |

No new runtime dependencies are introduced by Feature 21. All tooling is inherited from the Feature 18 Mastra runtime setup.

---

## 2. File Structure

Feature 21 adds one new directory to `apps/mastra/src/`:

```
apps/mastra/
└── src/
    ├── agents/           (Feature 18 + 19 + 20)
    ├── tools/            (Feature 18 + 19 + 20)
    ├── auth/             (Feature 18)
    ├── config/           (Feature 18)
    ├── mcp-tools/        ← NEW in Feature 21
    │   ├── get-agenda.ts
    │   ├── get-tasks.ts
    │   ├── trigger-intake.ts
    │   ├── trigger-agenda.ts
    │   ├── get-client-status.ts
    │   ├── list-clients.ts
    │   ├── edit-task.ts
    │   ├── reject-task.ts
    │   ├── approve-tasks.ts
    │   ├── get-transcript.ts
    │   └── index.ts
    └── index.ts          (modified to register MCP tools)
```

---

## 3. MCP Server Integration with Mastra

### 3.1 Mastra MCP Server Mechanism

Mastra's framework exposes an MCP-compatible tool server natively. Based on the Mastra SDK, MCP tools are registered on the Mastra instance. The implementation team must consult Mastra's documentation to confirm the exact registration API. Two likely patterns are:

**Pattern A — Top-level tools registration:**
```typescript
export const mastra = new Mastra({
  tools: {
    get_agenda: getAgendaTool,
    get_tasks: getTasksTool,
    // ...
  },
  // ... agents, server, logger
});
```

**Pattern B — Server-level MCP route:**
```typescript
export const mastra = new Mastra({
  server: {
    port: 8081,
    // MCP handled via a dedicated server route or plugin
  },
});
```

The implementation must confirm which pattern Mastra supports for MCP tool exposure and document the result in `apps/mastra/README.md`.

### 3.2 MCP Endpoint URL

The Mastra MCP server path must be confirmed and documented. Expected default: `http://{host}:8081/mcp`. This URL is consumed by Feature 33's `.mcp.json` configuration. If Mastra uses a different path, Feature 33 must be notified.

### 3.3 MCP Protocol Version

The implementation must use the MCP protocol version that Claude Code and Claw support. As of the implementation date, verify compatibility between Mastra's MCP server version and the client tools.

---

## 4. User Token Passthrough — Technical Implementation

### 4.1 Per-Request API Client Construction

MCP tool calls carry the user's token in the `Authorization: Bearer` header of the HTTP request to the Mastra MCP server. Mastra's tool execution context must provide access to the incoming request headers.

The user token extraction and API client construction pattern:

```typescript
// Within a tool's execute function, the token is available via context
async execute({ context, mastra }: ToolExecutionContext) {
  const userToken = context.headers?.authorization?.replace('Bearer ', '');

  if (!userToken) {
    return formatError('Authentication required. Connect to the iExcel Mastra MCP server with a valid access token.');
  }

  const userApiClient = createApiClient({
    baseUrl: env.API_BASE_URL,
    getAccessToken: async () => userToken,
  });

  // All API calls for this invocation use userApiClient
}
```

The exact mechanism for accessing request headers within a Mastra MCP tool `execute` function must be determined during implementation. Mastra may provide headers via:
- A `context.requestContext` object
- A middleware/interceptor layer on the MCP server
- A closure over the HTTP server request context

If Mastra does not natively surface headers to tool execute functions, an alternative architecture is required (see Section 4.2).

### 4.2 Alternative: MCP Middleware / Token Resolver

If Mastra does not natively expose the `Authorization` header to tool execute functions, the token can be extracted at the MCP server middleware level and injected into the tool execution context:

```typescript
// Hypothetical Mastra middleware approach
mastra.useMCPMiddleware(async (req, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  req.context = { ...req.context, userToken: token };
  return next(req);
});
```

The implementation team must determine the correct approach for Mastra's version. The architecture decision must be documented.

### 4.3 API Client Factory

Feature 18 (FR-43) established the pattern for constructing a user-scoped API client:

```typescript
// From Feature 18 FR-43 — now activated by Feature 21
const userApiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  getAccessToken: async () => userToken,
});
```

This factory call is made once per MCP tool invocation, not once per server startup. The service API client (created once at startup with `serviceTokenManager.getToken`) is NOT used for MCP tool calls.

---

## 5. Tool Implementation Pattern

### 5.1 Standard Tool Structure

Each of the 10 MCP tools follows this implementation pattern:

```typescript
// apps/mastra/src/mcp-tools/get-tasks.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createApiClient } from '@iexcel/api-client';
import { formatTaskTable, formatError } from './formatters.js';

export const getTasksTool = createTool({
  id: 'get_tasks',
  description: 'List generated tasks for a client, optionally filtered by status. Returns short IDs.',
  inputSchema: z.object({
    client: z.string().min(1).describe('Client name or client ID'),
    status: z.enum(['draft', 'approved', 'rejected', 'completed']).optional()
      .describe('Filter by task status. Omit to return all statuses.'),
  }),
  outputSchema: z.string(), // MCP tools return formatted string responses
  execute: async ({ context, mastra }) => {
    const userToken = extractUserToken(mastra);  // see Section 4.1
    if (!userToken) return formatError('Authentication required. ...');

    const userApiClient = createApiClient({
      baseUrl: env.API_BASE_URL,
      getAccessToken: async () => userToken,
    });

    try {
      const client = await resolveClient(userApiClient, context.client);
      const tasks = await userApiClient.tasks.listTasksForClient(client.id, {
        status: context.status,
      });
      if (tasks.data.length === 0) {
        return `No ${context.status ? context.status + ' ' : ''}tasks found for ${client.name}.`;
      }
      return formatTaskTable(tasks.data);
    } catch (error) {
      return handleApiError(error, context);
    }
  },
});
```

### 5.2 Client Name Resolution Helper

A shared `resolveClient` helper is used by all tools that accept a `client` parameter:

```typescript
// apps/mastra/src/mcp-tools/helpers/resolve-client.ts
async function resolveClient(
  apiClient: ApiClient,
  clientParam: string,
): Promise<{ id: string; name: string }> {
  // Attempt UUID format first (if valid UUID, use directly)
  if (isUUID(clientParam)) {
    const client = await apiClient.clients.getClient(clientParam);
    return { id: client.id, name: client.name };
  }
  // Otherwise, resolve by name
  const results = await apiClient.clients.listClients({ name: clientParam });
  if (results.data.length === 0) {
    throw new ClientNotFoundError(clientParam);
  }
  if (results.data.length > 1) {
    throw new AmbiguousClientError(clientParam);
  }
  return { id: results.data[0].id, name: results.data[0].name };
}
```

### 5.3 Short ID Passthrough

Short IDs are passed directly to the API client without local resolution:

```typescript
// Correct — pass short ID as-is
await userApiClient.tasks.editTask('TSK-0043', { estimatedTime: '1h 00m' });

// Incorrect — do NOT attempt local resolution
const uuid = await resolveShortId('TSK-0043'); // This does NOT happen in Feature 21
```

The `@iexcel/api-client` package must support short IDs in URL path parameters (e.g., `PATCH /tasks/TSK-0043`). This is a dependency on Feature 22's API client implementation.

---

## 6. Output Formatters

### 6.1 Formatter Location

Output formatters live in `apps/mastra/src/mcp-tools/formatters.ts` (or a subdirectory if volume warrants it). They are shared across all 10 tools.

### 6.2 Task Table Formatter

```typescript
function formatTaskTable(tasks: Task[]): string {
  const header = '| ID       | Description                              | Time   | Status   |';
  const divider = '|----------|------------------------------------------|--------|----------|';
  const rows = tasks.map(t =>
    `| ${t.shortId.padEnd(8)} | ${truncate(t.title, 40).padEnd(40)} | ${formatTime(t.estimatedTime).padEnd(6)} | ${t.status.padEnd(8)} |`
  );
  return [header, divider, ...rows].join('\n');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
```

### 6.3 Client Status Formatter

```typescript
function formatClientStatus(status: ClientStatus): string {
  const lines = [
    `Client: ${status.clientName}`,
    `Cycle Status: ${status.cycleStatus}`,
    `Draft Tasks: ${status.draftTaskCount} pending approval${status.draftTaskIds.length > 0 ? ` (${status.draftTaskIds.join(', ')})` : ''}`,
    `Agenda: ${status.agendaStatus}`,
    `Last Intake: ${status.lastIntakeDate ?? 'None'}`,
    `Next Call: ${status.nextCallDate ?? 'Not scheduled'}`,
  ];
  return lines.join('\n');
}
```

### 6.4 Error Formatter

```typescript
function handleApiError(error: unknown, context: Record<string, unknown>): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return 'Your session has expired. Re-authenticate and try again.';
      case 'FORBIDDEN':
        return "You don't have permission to access that resource. Contact your administrator.";
      case 'NOT_FOUND':
        return `Resource not found.`; // Overridden per-tool for specificity
      case 'NETWORK_ERROR':
        return 'Could not reach the iExcel API. Check your network connection and try again.';
      default:
        return `An unexpected error occurred. Try again shortly.`;
    }
  }
  return 'An unexpected error occurred. Try again shortly.';
}
```

---

## 7. API Endpoints Called by MCP Tools

| Tool | HTTP Method | Endpoint | Notes |
|---|---|---|---|
| `get_agenda` | GET | `/clients/{clientId}/agendas` | Returns latest non-rejected agenda |
| `get_tasks` | GET | `/clients/{clientId}/tasks` | Optional `?status=` query param |
| `trigger_intake` | POST | `/workflows/intake` | Body: `{ clientId, date?, transcriptSource? }` |
| `trigger_agenda` | POST | `/workflows/agenda` | Body: `{ clientId, cycleStart?, cycleEnd? }` |
| `get_client_status` | GET | `/clients/{clientId}/status` | Returns cycle overview |
| `list_clients` | GET | `/clients` | Returns user's accessible clients |
| `edit_task` | PATCH | `/tasks/{shortId}` | Accepts short ID directly |
| `reject_task` | POST | `/tasks/{shortId}/reject` | Optional body: `{ reason }` |
| `approve_tasks` (single) | POST | `/tasks/{shortId}/approve` | For single task approval |
| `approve_tasks` (batch) | POST | `/clients/{clientId}/tasks/approve` | For batch approval; body: `{ ids: string[] }` |
| `get_transcript` | GET | `/clients/{clientId}/transcripts` | Optional `?date=` query param |
| Client resolution | GET | `/clients` or `/clients/{id}` | Used by all tools with `client` parameter |

All endpoints are implementations of API layer features (09, 11, 14, 17). Feature 21 does not implement any API endpoints.

---

## 8. Input Validation

### 8.1 Zod Schema Enforcement

All tool input schemas use Zod. Validation failures are caught by Mastra's tool execution layer before the `execute` function is called. When Zod validation fails, Mastra returns a structured error to the MCP client.

### 8.2 Short ID Pattern

```typescript
const shortIdSchema = z.string().regex(/^TSK-\d{3,4}$/, {
  message: "Use the format TSK-0042.",
});
```

### 8.3 Estimated Time Pattern

```typescript
const estimatedTimeSchema = z.string().regex(
  /^(\d+h\s*)?(\d+m)?$/,
  { message: "Use format '1h 30m' or '0h 45m'." }
).refine(s => s.trim().length > 0, { message: "Time cannot be empty." });
```

---

## 9. Error Handling Architecture

### 9.1 Error Classification

```typescript
enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}
```

### 9.2 Tool-Level Try/Catch

Each tool wraps its entire execute body in a try/catch:

```typescript
execute: async ({ context }) => {
  try {
    // ... tool logic
  } catch (error) {
    return handleApiError(error, { toolId: 'get_tasks', context });
  }
}
```

### 9.3 Missing Token Early Return

Token extraction is performed before any API call. If no token is found, the function returns immediately with an auth error message. No API calls are made without a user token.

---

## 10. Security Requirements

### 10.1 No Service Token on MCP Calls

The Mastra service token (`ServiceTokenManager.getToken()`) must never be used in MCP tool `execute` functions. A code review check or linting rule should enforce this.

### 10.2 No Token in Logs

The user token value must be redacted before any logging. If a debug log must reference a token for troubleshooting, log only the first 8 characters followed by `...`.

### 10.3 No UUID Exposure

UUIDs must not appear in tool response strings. Short IDs are the only form of task/agenda identifier returned to the user.

### 10.4 No Cross-Client Leakage

Client resolution uses the user's token. The API enforces per-user client access. Mastra must not cache client name-to-ID mappings across requests, as different users have different access.

---

## 11. Performance Considerations

### 11.1 API Client Per Request (Not Cached)

A new `userApiClient` is constructed for each MCP tool invocation. This is a lightweight object construction (no connection pooling overhead at the HTTP client library level). It ensures token freshness and avoids cross-request token leakage.

### 11.2 No Workflow Polling in Feature 21

`trigger_intake` and `trigger_agenda` call the API to start the workflow and return immediately. They do NOT poll for completion. Feature 33 handles polling at the terminal client layer. This keeps MCP tool response times fast and avoids holding server-side connections during long-running LLM workflows.

### 11.3 Transcript Truncation

The `get_transcript` tool truncates at 2000 characters before returning to the MCP client. This prevents large payloads from being transmitted over the MCP protocol and keeps terminal context windows manageable.

---

## 12. Observability Implementation

### 12.1 Log Wrapper

A shared `logToolCall` utility wraps each tool invocation:

```typescript
function logToolCall(toolId: string, userId: string, fn: () => Promise<string>): Promise<string> {
  const startedAt = Date.now();
  return fn()
    .then(result => {
      logger.info({ tool: toolId, userId, durationMs: Date.now() - startedAt, success: true, requestSource: 'mcp' });
      return result;
    })
    .catch(err => {
      logger.warn({ tool: toolId, userId, durationMs: Date.now() - startedAt, success: false, requestSource: 'mcp', error: err.message });
      throw err;
    });
}
```

### 12.2 OTel Span Naming

Each tool produces a span named `mcp.{tool_id}` (e.g., `mcp.get_agenda`). Mastra's framework may produce these automatically via its built-in tracing. If not, manual span creation is required using the OTEL SDK.

---

## 13. Dependencies on Other Features

| Feature | What Feature 21 Consumes |
|---|---|
| Feature 18 (Mastra Runtime Setup) | `env` config, `createApiClient` factory pattern, Pino logger, Mastra instance, service token manager (for reference/contrast only) |
| Feature 22 (API Client Package) | `createApiClient`, all typed API method calls (`tasks.*`, `clients.*`, `agendas.*`, `transcripts.*`, `workflows.*`) |
| Feature 23 (Shared Types) | `Task`, `Agenda`, `Client`, `WorkflowRun`, `ClientStatus` types |
| Features 09, 11, 14, 17 (API Endpoints) | The actual HTTP endpoints that MCP tool API calls hit |
| Features 19, 20 (Agent Workflows) | `trigger_intake` and `trigger_agenda` trigger workflows implemented in these features |

---

## 14. Testing Strategy

### 14.1 Unit Tests (per tool)

Each tool has a unit test file at `apps/mastra/src/mcp-tools/__tests__/{tool-name}.test.ts` that:
- Mocks `createApiClient` and its methods
- Tests all input validation paths (valid input, invalid short ID, missing required fields)
- Tests happy path: correct API method called with correct arguments
- Tests each error case: NOT_FOUND, FORBIDDEN, UNAUTHORIZED, NETWORK_ERROR
- Tests token passthrough: confirms the user token is passed to `createApiClient`, not the service token

### 14.2 Integration Tests

An integration test suite connects a real (or stub) MCP client to a local Mastra instance with a mocked API backend. It verifies:
- All 10 tools are discoverable via `tools/list`
- Token passthrough reaches the API backend (inspect request headers in the mock server)
- A complete conversation flow: `list_clients` → `trigger_intake` → `get_tasks` → `approve_tasks`

### 14.3 No E2E Tests in This Feature

End-to-end tests using a live Claude Code or Claw client against a running stack are owned by Feature 33, not Feature 21.
