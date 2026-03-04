# FRS — Functional Requirement Specification
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for configuring Mastra's built-in MCP server and implementing the 10 MCP tool definitions within `apps/mastra/`. The MCP server is the entry point for Claude Code and Claw terminal clients. Every tool translates an MCP call into one or more API layer HTTP requests, forwarding the calling user's auth token to ensure all operations are scoped to the user's permissions.

---

## 2. MCP Server Configuration

### FR-01: MCP Server Enablement

The Mastra instance in `apps/mastra/src/index.ts` must enable the built-in MCP server. Based on Mastra's framework, the MCP server is enabled via the `server` configuration block:

```typescript
export const mastra = new Mastra({
  // ... existing agents, logger, observability config from Feature 18 ...
  server: {
    port: env.MASTRA_PORT ?? 8081,
    host: env.MASTRA_HOST ?? '0.0.0.0',
    apiRoutes: [
      // existing routes
    ],
  },
});
```

The MCP server endpoint must be reachable at the path Mastra exposes by default. The exact path (e.g., `/mcp`) must be confirmed during implementation and documented in `apps/mastra/README.md` so Feature 33 can configure terminal clients correctly.

### FR-02: MCP Tool Registration

All 10 MCP tools defined in this feature must be registered with the Mastra MCP server so they appear in the tool listing returned to MCP clients. Each tool must be discoverable via the MCP `tools/list` request.

### FR-03: MCP Server Port and Host

The MCP server shares the same port and host as the Mastra HTTP server (port `8081`, host `0.0.0.0`), as established in Feature 18 (FR-21). No additional port is required.

### FR-04: MCP Tool File Location

All 10 MCP tool implementations must reside in `apps/mastra/src/mcp-tools/`. Each tool lives in its own file:

```
apps/mastra/src/mcp-tools/
├── get-agenda.ts
├── get-tasks.ts
├── trigger-intake.ts
├── trigger-agenda.ts
├── get-client-status.ts
├── list-clients.ts
├── edit-task.ts
├── reject-task.ts
├── approve-tasks.ts
├── get-transcript.ts
└── index.ts
```

The `index.ts` barrel must export all tool instances for registration with the Mastra MCP server.

---

## 3. User Token Passthrough

### FR-10: Token Extraction from MCP Request

The MCP server must extract the `Authorization: Bearer <token>` header from each incoming MCP tool call request. This is the user's access token, obtained via the device authorization flow (Feature 32) and passed by the terminal client (Feature 33).

### FR-11: User-Scoped API Client Construction

For every MCP tool invocation, a user-scoped API client must be constructed using the extracted token:

```typescript
const userApiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  getAccessToken: async () => userToken,
});
```

This pattern is defined in Feature 18 (FR-43) and is now activated by Feature 21. The service API client (using `serviceTokenManager.getToken`) must NOT be used for MCP tool calls.

### FR-12: Token Forwarding on All Downstream API Calls

Every API call made within a tool's `execute` function must use the user-scoped API client constructed per FR-11. No tool may mix user and service tokens within the same invocation.

### FR-13: Missing Token Handling

If no `Authorization` header is present in an MCP tool call request, the tool must return a user-friendly error:

```
Authentication required. Connect to the iExcel Mastra MCP server with a valid access token.
```

The tool must NOT attempt to substitute the service token or make unauthenticated API calls.

### FR-14: Token Validation

Mastra must NOT perform local JWT validation on the user token. The token is forwarded to the API as-is. If the token is invalid or expired, the API will return a `401 Unauthorized` response, which Mastra maps to a user-facing error (see FR-90).

---

## 4. Tool: `get_agenda`

### FR-20: Tool Identity

```typescript
{
  id: 'get_agenda',
  description: 'Retrieve the current agenda (Running Notes) for a named client.',
}
```

### FR-21: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name (e.g., "Total Life") or client short ID'),
})
```

### FR-22: Behavior

1. Resolve the client identifier by calling `GET /clients?name={client}` or `GET /clients/{client}` via the user-scoped API client.
2. Retrieve the latest non-rejected agenda via `GET /clients/{clientId}/agendas`.
3. Return the agenda content (see FR-91 for output formatting).

### FR-23: Error Cases

| Condition | Response |
|---|---|
| Client not found | `"No client named '{client}' found. Use list_clients to see available clients."` |
| No agenda exists | `"No agenda found for {client}. Run trigger_agenda to generate one."` |
| API `401` | See FR-90 |
| API `403` | See FR-90 |

---

## 5. Tool: `get_tasks`

### FR-30: Tool Identity

```typescript
{
  id: 'get_tasks',
  description: 'List generated tasks for a client, optionally filtered by status. Returns short IDs.',
}
```

### FR-31: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name or client ID'),
  status: z.enum(['draft', 'approved', 'rejected', 'completed']).optional()
    .describe('Filter by task status. Omit to return all statuses.'),
})
```

### FR-32: Behavior

1. Resolve the client identifier (same as FR-22, step 1).
2. Call `GET /clients/{clientId}/tasks` with optional `?status={status}` query parameter via the user-scoped API client.
3. Return tasks formatted as a Markdown table (see FR-91).

### FR-33: Error Cases

| Condition | Response |
|---|---|
| Client not found | Same as FR-23 |
| No tasks found | `"No {status} tasks found for {client}."` (or "No tasks found" if no status filter) |

---

## 6. Tool: `trigger_intake`

### FR-40: Tool Identity

```typescript
{
  id: 'trigger_intake',
  description: 'Kick off Workflow A — process a call transcript and generate draft tasks. Returns the workflow run ID.',
}
```

### FR-41: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name or client ID'),
  date: z.string().optional()
    .describe('Date of the intake call (ISO 8601 or natural language: "today", "yesterday"). Used to identify the correct transcript.'),
  transcript_source: z.string().optional()
    .describe('Grain URL or transcript text. If omitted, Mastra fetches the latest transcript for the client.'),
})
```

### FR-42: Behavior

1. Resolve the client identifier.
2. Call `POST /workflows/intake` via the user-scoped API client with:
   ```typescript
   { clientId: string, date?: string, transcriptSource?: string }
   ```
3. Return the workflow run ID and a status message. Do NOT poll for completion — Feature 33 handles polling.

### FR-43: Output

```
Intake workflow started for {client}.
Workflow Run ID: {workflowRunId}
Use get_tasks(client="{client}", status="draft") to check for generated tasks once complete.
```

### FR-44: Error Cases

| Condition | Response |
|---|---|
| Client not found | Same as FR-23 |
| No transcript found | `"No transcript found for {client} on {date}. Verify the date or provide a transcript source."` |
| Workflow already running | `"A workflow is already running for {client}. Check status with get_client_status."` |

---

## 7. Tool: `trigger_agenda`

### FR-50: Tool Identity

```typescript
{
  id: 'trigger_agenda',
  description: 'Kick off Workflow B — compile completed tasks into a Running Notes agenda. Returns the workflow run ID.',
}
```

### FR-51: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name or client ID'),
  cycle_start: z.string().optional()
    .describe('Start date of the work cycle (ISO 8601). Defaults to the last agenda date if omitted.'),
  cycle_end: z.string().optional()
    .describe('End date of the work cycle (ISO 8601). Defaults to today if omitted.'),
})
```

### FR-52: Behavior

1. Resolve the client identifier.
2. Call `POST /workflows/agenda` via the user-scoped API client with:
   ```typescript
   { clientId: string, cycleStart?: string, cycleEnd?: string }
   ```
3. Return the workflow run ID and a status message.

### FR-53: Output

```
Agenda workflow started for {client}.
Workflow Run ID: {workflowRunId}
Use get_agenda(client="{client}") to check the generated agenda once complete.
```

### FR-54: Error Cases

| Condition | Response |
|---|---|
| Client not found | Same as FR-23 |
| No completed tasks in cycle | `"No completed tasks found for {client} in the specified cycle. Ensure tasks are marked completed before generating an agenda."` |

---

## 8. Tool: `get_client_status`

### FR-60: Tool Identity

```typescript
{
  id: 'get_client_status',
  description: 'Get an overview of a client\'s current workflow cycle — pending approvals, agenda readiness, and upcoming call date.',
}
```

### FR-61: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name or client ID'),
})
```

### FR-62: Behavior

1. Resolve the client identifier.
2. Call `GET /clients/{clientId}/status` via the user-scoped API client.
3. Format the response as key-value status output (see FR-91).

### FR-63: Output Format

```
Client: Total Life
Cycle Status: Active
Draft Tasks: 3 pending approval (TSK-0042, TSK-0043, TSK-0044)
Agenda: Not yet generated
Last Intake: 2026-02-28
Next Call: 2026-03-07
```

### FR-64: Error Cases

| Condition | Response |
|---|---|
| Client not found | Same as FR-23 |

---

## 9. Tool: `list_clients`

### FR-70: Tool Identity

```typescript
{
  id: 'list_clients',
  description: 'List all clients the authenticated user has access to.',
}
```

### FR-71: Input Schema

```typescript
inputSchema: z.object({})  // No parameters
```

### FR-72: Behavior

1. Call `GET /clients` via the user-scoped API client.
2. Return clients as a Markdown table (see FR-91).

### FR-73: Output Format

```
| Client Name     | Status   |
|-----------------|----------|
| Total Life      | active   |
| Acme Corp       | active   |
```

### FR-74: Error Cases

| Condition | Response |
|---|---|
| No clients accessible | `"No clients found for your account. Contact your administrator."` |

---

## 10. Tool: `edit_task`

### FR-80: Tool Identity

```typescript
{
  id: 'edit_task',
  description: 'Edit a task by short ID (e.g., TSK-0042). Update description, assignee, estimated time, or workspace.',
}
```

### FR-81: Input Schema

```typescript
inputSchema: z.object({
  id: z.string().regex(/^TSK-\d{3,}$/).describe('Short ID of the task (e.g., TSK-0043)'),
  description: z.string().optional().describe('New task description'),
  assignee: z.string().optional().describe('Assignee name or user ID'),
  estimated_time: z.string().optional()
    .describe('New estimated time (e.g., "1h 00m", "0h 45m")'),
  workspace: z.string().optional().describe('Asana workspace name or ID'),
})
```

### FR-82: Behavior

1. Validate that at least one optional field is provided. If none: `"Please specify at least one field to update (description, assignee, estimated_time, workspace)."`
2. Validate `estimated_time` format if provided. Accepted formats: `Xh Ym`, `Xh`, `Ym`. If invalid: `"Invalid time format. Use format '1h 30m' or '0h 45m'."`
3. Call `PATCH /tasks/{id}` via the user-scoped API client, passing the short ID directly (the API resolves it to a UUID).
4. Return the updated task confirmation.

### FR-83: Output

```
Task TSK-0043 updated.
Estimated time: 1h 00m
Assignee: Mike
```

### FR-84: Error Cases

| Condition | Response |
|---|---|
| Task not found | `"No task found with ID TSK-0043."` |
| Task not editable | `"TSK-0043 cannot be edited — it is in '{status}' status. Only draft tasks can be edited."` |
| No fields provided | `"Please specify at least one field to update."` |
| Invalid time format | `"Invalid time format. Use format '1h 30m' or '0h 45m'."` |

---

## 11. Tool: `reject_task`

### FR-85: Tool Identity

```typescript
{
  id: 'reject_task',
  description: 'Reject a task by short ID. The task must be in draft status.',
}
```

### FR-86: Input Schema

```typescript
inputSchema: z.object({
  id: z.string().regex(/^TSK-\d{3,}$/).describe('Short ID of the task (e.g., TSK-0044)'),
  reason: z.string().optional().describe('Optional rejection reason for the audit log'),
})
```

### FR-87: Behavior

1. Call `POST /tasks/{id}/reject` via the user-scoped API client. Pass `reason` if provided.
2. Return rejection confirmation.

### FR-88: Output

```
Task TSK-0044 rejected.
```

### FR-89: Error Cases

| Condition | Response |
|---|---|
| Task not found | `"No task found with ID TSK-0044."` |
| Task not rejectable | `"TSK-0044 cannot be rejected — it is in '{status}' status."` |

---

## 12. Tool: `approve_tasks`

### FR-100: Tool Identity

```typescript
{
  id: 'approve_tasks',
  description: 'Approve one or more draft tasks by short ID. Supports individual and batch approval.',
}
```

### FR-101: Input Schema

```typescript
inputSchema: z.object({
  ids: z.union([
    z.string().regex(/^TSK-\d{3,}$/),
    z.array(z.string().regex(/^TSK-\d{3,}$/)).min(1),
  ]).describe('Short ID or array of short IDs (e.g., "TSK-0042" or ["TSK-0042", "TSK-0043"])'),
})
```

### FR-102: Behavior

Single task:
1. Normalize `ids` to an array if a single string is provided.
2. Call `POST /tasks/{id}/approve` via the user-scoped API client.

Multiple tasks:
1. Resolve the `clientId` from the first task (via a `GET /tasks/{firstId}` lookup if needed, or let the batch endpoint handle it).
2. Call `POST /clients/{clientId}/tasks/approve` with the array of short IDs via the user-scoped API client.

### FR-103: Output

Single: `"Task TSK-0042 approved."`

Batch (mixed result): `"3 tasks approved: TSK-0042, TSK-0043, TSK-0045. TSK-0044 was not in draft status and was skipped."`

Batch (all success): `"3 tasks approved: TSK-0042, TSK-0043, TSK-0045."`

### FR-104: Error Cases

| Condition | Response |
|---|---|
| No valid IDs found | `"None of the provided task IDs could be found. Check IDs with get_tasks."` |
| Some non-approvable | Report which succeeded and which were skipped with reason |

---

## 13. Tool: `get_transcript`

### FR-110: Tool Identity

```typescript
{
  id: 'get_transcript',
  description: 'Retrieve a Grain transcript for a client, optionally filtered by date.',
}
```

### FR-111: Input Schema

```typescript
inputSchema: z.object({
  client: z.string().min(1).describe('Client name or client ID'),
  date: z.string().optional()
    .describe('Date of the call (ISO 8601 or natural language). Returns the most recent transcript if omitted.'),
})
```

### FR-112: Behavior

1. Resolve the client identifier.
2. Call `GET /clients/{clientId}/transcripts` with optional `?date={date}` filter via the user-scoped API client.
3. Return the transcript content, truncated at 2000 characters if longer (see FR-92).

### FR-113: Error Cases

| Condition | Response |
|---|---|
| Client not found | Same as FR-23 |
| No transcript found | `"No transcript found for {client} on {date}."` |

---

## 14. Short ID Validation

### FR-120: Input Validation for Short IDs

All tools that accept `id` or `ids` parameters referencing tasks must validate the short ID format before making an API call:
- Pattern: `TSK-\d{3,}` (3 or more digit numeric suffix, uncapped)
- Examples of valid IDs: `TSK-001`, `TSK-0042`, `TSK-9999`, `TSK-12345`
- If invalid: `"'{input}' is not a valid task ID. Use the format TSK-0042."`

### FR-121: No Local Short ID Resolution

Mastra does not resolve short IDs to UUIDs. Short IDs are passed as-is to the API client, which passes them as-is to the API. The API performs the resolution. This applies to all 10 tools.

---

## 15. Client Name Resolution

### FR-130: Client Name Forwarded to API

When a tool receives a `client` parameter (string), Mastra passes it to the API using a name-lookup query (e.g., `GET /clients?name={client}` or equivalent). The API resolves the name to a client ID.

### FR-131: Ambiguous Name Handling

If the API indicates multiple clients match the name (e.g., API returns a `AMBIGUOUS_CLIENT` error or multiple results), the tool must return:
```
Multiple clients match '{name}'. Use list_clients to find the exact client name or ID.
```

### FR-132: Case-Insensitive Matching

The API handles fuzzy/case-insensitive matching. Feature 21 passes the client string as-is without local normalization.

---

## 16. Error Handling (All Tools)

### FR-90: Standard Error Mapping

All tools must map API errors to user-friendly messages:

| API Error | Tool Response |
|---|---|
| `401 Unauthorized` | `"Your session has expired. Re-authenticate and try again."` |
| `403 Forbidden` | `"You don't have permission to access {resource}. Contact your administrator."` |
| `404 Not Found` | Resource-specific message (defined per tool above) |
| `409 Conflict` | Status-specific message (e.g., task not in correct state) |
| `5xx Server Error` | `"An unexpected server error occurred. Try again shortly."` |
| Network / timeout | `"Could not reach the iExcel API. Check your network connection and try again."` |

### FR-91: No Raw JSON or Stack Traces

Tool responses must never include:
- Raw JSON error bodies
- Stack traces
- Internal UUIDs (always use short IDs for user-facing output)
- Access tokens or credentials of any kind

### FR-92: Transcript Truncation

Transcript content returned by `get_transcript` must be truncated to 2000 characters if longer, with the following appended:
```
[Transcript truncated. View the full transcript at {UI_URL}/transcripts/{id}]
```

---

## 17. Observability

### FR-200: Structured Log Per Tool Call

Each MCP tool invocation must produce a structured log entry (via Pino logger from Feature 18) including:

| Field | Value |
|---|---|
| `tool` | MCP tool name (e.g., `get_agenda`) |
| `requestSource` | `'mcp'` |
| `userId` | Extracted from the user token (JWT sub claim), or `'unknown'` if not decodable |
| `clientParam` | The raw `client` parameter if present |
| `startedAt` | ISO 8601 timestamp |
| `durationMs` | Time from tool call receipt to response |
| `apiStatusCode` | HTTP status code from the downstream API call |
| `success` | Boolean |

### FR-201: No Credential Logging

Access tokens must never appear in log entries. Token values must be redacted before logging.

### FR-202: OTel Trace Span

Each MCP tool invocation must produce an OpenTelemetry trace span named `mcp.{tool_name}` (e.g., `mcp.get_agenda`) with attributes:
- `mcp.tool`
- `mcp.user_id`
- `mcp.client_param` (if applicable)
- `mcp.success`
- `mcp.api_status_code`

---

## 18. Nx Integration

### FR-210: No New Nx Project

Feature 21 does not create a new Nx project. All code is added to the existing `apps/mastra/` project defined in Feature 18.

### FR-211: New Source Directory

The new `src/mcp-tools/` directory is added to the `apps/mastra/` project. No changes to `project.json` targets or tags are required unless Nx linting rules mandate explicit path declarations.

### FR-212: Type Safety

All tool implementations must use typed API client methods from `packages/api-client/` and types from `packages/shared-types/`. No `any` types allowed in MCP tool code.
