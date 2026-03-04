# FRS — Functional Requirement Specification
# Feature 33: Terminal MCP Tools

**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)

---

## 1. Functional Components Overview

| Component | Description |
|---|---|
| **F33-01: MCP Configuration** | Configuration files that declare the Mastra MCP server connection for Claude Code and Claw |
| **F33-02: Terminal Token Provider** | Adapts `getValidAccessToken()` from Feature 32 into the `TokenProvider` interface expected by `@iexcel/api-client` |
| **F33-03: MCP Header Passthrough** | Ensures the access token is forwarded as `Authorization: Bearer <token>` on every MCP tool call |
| **F33-04: Tool Definitions** | The 10 MCP tool wrapper definitions with input schemas, output formatters, and error handlers |
| **F33-05: Output Formatters** | Converts raw API response objects into readable conversational text for terminal display |
| **F33-06: Error Handler** | Catches `ApiClientError` and other failures, converts them to readable user messages |

---

## 2. F33-01: MCP Configuration

### 2.1 Claude Code Configuration

Claude Code reads MCP server configuration from `.mcp.json` at the project root (or from `~/.config/claude/mcp.json` for user-scoped configuration). Feature 33 must provide a configuration file at `.mcp.json` in the monorepo root that registers the Mastra MCP server.

The configuration must:

```json
{
  "mcpServers": {
    "iexcel-mastra": {
      "type": "http",
      "url": "${MASTRA_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${IEXCEL_ACCESS_TOKEN}"
      }
    }
  }
}
```

Where:
- `MASTRA_MCP_URL` defaults to `http://localhost:8081/mcp` for local development and is overridable via environment variable
- `IEXCEL_ACCESS_TOKEN` is resolved at call time by the terminal token provider (F33-02), not baked into the config file

If Claude Code's MCP protocol for HTTP servers supports dynamic header injection (via a script or token hook), that mechanism must be used. If static config headers are the only option, a wrapper script must be provided.

### 2.2 Claw Configuration

Claw's MCP configuration format must be confirmed during implementation. Feature 33 must provide either:
- A Claw-native config file if Claw supports MCP server registration natively
- A documented setup procedure if Claw requires manual registration

The configuration must register the same Mastra MCP server URL and use the same token passthrough mechanism.

### 2.3 Configuration Variables

| Variable | Purpose | Default |
|---|---|---|
| `MASTRA_MCP_URL` | URL of the Mastra MCP server | `http://localhost:8081/mcp` |
| `IEXCEL_AUTH_ISSUER_URL` | Auth service URL (for token refresh) | `https://auth.iexcel.com` |
| `IEXCEL_TOKEN_PATH` | Override path for token file | `~/.iexcel/auth/tokens.json` |

### 2.4 Configuration File Location

| File | Purpose |
|---|---|
| `.mcp.json` (monorepo root) | Claude Code project-scoped MCP server registration |
| `packages/terminal-tools/claw.config.json` (or equivalent) | Claw MCP server registration |
| `packages/terminal-tools/README.md` | Setup instructions for both clients |

---

## 3. F33-02: Terminal Token Provider

### 3.1 Interface

The terminal token provider wraps `getValidAccessToken()` from `@iexcel/terminal-auth` (Feature 32) into the `TokenProvider` interface required by `@iexcel/api-client`:

```typescript
import { getValidAccessToken } from '@iexcel/terminal-auth';
import type { TokenProvider } from '@iexcel/api-client';

export const terminalTokenProvider: TokenProvider = {
  async getAccessToken(): Promise<string> {
    return getValidAccessToken({ interactive: true });
  },
  async refreshAccessToken(): Promise<string> {
    // Feature 32 handles refresh internally within getValidAccessToken.
    // Force a fresh retrieval — the token manager in F32 will refresh if needed.
    return getValidAccessToken({ interactive: true });
  },
};
```

### 3.2 Interactive vs Non-Interactive Contexts

- When called from an MCP tool invocation in a terminal session: `interactive: true` (default). If no valid session exists, the user is prompted to authenticate via the device flow (Feature 32 handles this).
- The `interactive: false` mode must not be used in MCP tool handlers, because the user is present in the terminal and can complete the device flow.

### 3.3 Token Expiry During a Session

If a token expires mid-session (between tool calls), `getValidAccessToken()` from Feature 32 will silently refresh it using the stored refresh token. The user sees no interruption. Only when the refresh token itself has expired will the user be prompted to re-authenticate.

---

## 4. F33-03: MCP Header Passthrough

### 4.1 Token Injection Requirement

Every MCP tool call made from the terminal to the Mastra MCP server MUST include:

```
Authorization: Bearer <access_token>
```

Where `<access_token>` is the value returned by `getValidAccessToken()`.

### 4.2 Passthrough Chain

```
Terminal user invokes tool call
  → Claude Code / Claw sends MCP request to Mastra
  → Request includes Authorization: Bearer <token>
  → Mastra MCP server (Feature 21) extracts the token
  → Mastra forwards token to API layer on all API calls it makes for this request
  → API enforces authorization using the user's identity and permissions
```

### 4.3 Token Scope

The user's access token carries their identity and permission scope. The API (downstream of Mastra) uses this to:
- Filter clients to only those the user has access to
- Enforce read/write permissions per client
- Audit-log actions with the correct user identity

Mastra must not substitute the service token for the user token on MCP-originated requests. This is handled by Feature 21 (MCP server) and Feature 18 (Mastra runtime), not by Feature 33. Feature 33's responsibility is solely to ensure the token reaches the MCP server.

---

## 5. F33-04: Tool Definitions

### 5.1 Package Location

Tool definitions live in `packages/terminal-tools/src/tools/`. Each tool is a Mastra-compatible tool definition or a standalone function, depending on the mechanism chosen for MCP tool wiring (see TR.md).

### 5.2 Tool: `get_agenda`

**Description:** Retrieve the current agenda (Running Notes) for a named client.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name (e.g., "Total Life") or client ID |

**Behavior:**
1. Call `GET /clients/{id}/agendas` via `@iexcel/api-client` to retrieve the latest agenda for the resolved client
2. If multiple agendas exist, return the most recent non-rejected one
3. Format the agenda content as structured text (see F33-05)

**Output:** Formatted agenda text including title, status, and section content.

**Error cases:**
- Client not found: "No client named '{client}' found. Use `list_clients` to see available clients."
- No agenda exists: "No agenda found for {client}. Run `trigger_agenda` to generate one."

---

### 5.3 Tool: `get_tasks`

**Description:** List generated tasks for a client, optionally filtered by status.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name or client ID |
| `status` | string | No | Filter by status: `draft`, `approved`, `rejected`, `completed`. Omit for all statuses. |

**Behavior:**
1. Call `GET /clients/{id}/tasks` with optional `status` filter via `@iexcel/api-client`
2. Format results as a table (see F33-05)

**Output:** Table with columns: Short ID, Description, Estimated Time, Status.

**Error cases:**
- Client not found: same message as `get_agenda`
- No tasks found: "No {status} tasks found for {client}."

---

### 5.4 Tool: `trigger_intake`

**Description:** Trigger Workflow A — process a transcript and generate draft tasks.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name or client ID |
| `transcript_source` | string | No | Source hint for the transcript (e.g., a Grain URL or transcript text). If omitted, Mastra will fetch the latest transcript for the client. |
| `date` | string | No | Date of the intake call (ISO 8601 or natural language like "today", "yesterday"). Used to identify the correct transcript. |

**Behavior:**
1. Call `POST /workflows/intake` via `@iexcel/api-client` with the resolved client ID, source, and date
2. Poll `GET /workflows/{id}/status` until the workflow completes or errors (with a reasonable timeout of 120 seconds)
3. On completion, fetch the generated draft tasks and format as a table

**Output:** Table of draft tasks with Short ID, Description, Estimated Time, Status. Followed by a prompt: "Review the tasks above. Use `edit_task`, `approve_tasks`, or `reject_task` to manage them."

**Error cases:**
- Workflow timeout: "The intake workflow is taking longer than expected. Check status with `get_tasks(client='{client}', status='draft')`."
- No transcript found: "No transcript found for {client} on {date}. Verify the date or provide a transcript source."

---

### 5.5 Tool: `trigger_agenda`

**Description:** Trigger Workflow B — compile completed tasks into an agenda (Running Notes).

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name or client ID |
| `cycle_start` | string | No | Start date of the work cycle (ISO 8601). Defaults to the date of the last agenda if omitted. |
| `cycle_end` | string | No | End date of the work cycle (ISO 8601). Defaults to today if omitted. |

**Behavior:**
1. Call `POST /workflows/agenda` via `@iexcel/api-client`
2. Poll for completion (120 second timeout)
3. On completion, display a summary of the generated agenda

**Output:** Agenda summary including the sections generated. Full agenda available via `get_agenda`.

**Error cases:**
- No completed tasks found: "No completed tasks found for {client} in the specified cycle. Ensure tasks are marked completed before generating an agenda."

---

### 5.6 Tool: `get_client_status`

**Description:** Return an overview of a client's current workflow cycle — pending approvals, agenda readiness, upcoming call.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name or client ID |

**Behavior:**
1. Call `GET /clients/{id}/status` via `@iexcel/api-client`
2. Format the status response as a readable summary

**Output:**

```
Client: Total Life
Cycle Status: Active
Draft Tasks: 3 pending approval (TSK-0042, TSK-0043, TSK-0044)
Agenda: Not yet generated
Last Intake: 2026-02-28
Next Call: 2026-03-07
```

**Error cases:**
- Client not found: same as `get_agenda`

---

### 5.7 Tool: `list_clients`

**Description:** List all clients the authenticated user has access to.

**Input Parameters:** None

**Behavior:**
1. Call `GET /clients` via `@iexcel/api-client`
2. Format as a table

**Output:** Table with columns: Client Name, ID, Status.

**Error cases:**
- No clients found: "No clients found for your account. Contact your administrator."

---

### 5.8 Tool: `edit_task`

**Description:** Edit a task by short ID. Supports updating description, assignee, estimated time, and workspace.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Short ID of the task (e.g., `TSK-0043`) |
| `description` | string | No | New task description |
| `assignee` | string | No | Assignee name or user ID |
| `estimated_time` | string | No | New estimated time (e.g., `1h 00m`, `0h 45m`) |
| `workspace` | string | No | Asana workspace name or ID to route the task to |

**Behavior:**
1. Validate at least one editable field is provided; if none provided, return: "Please specify at least one field to update (description, assignee, estimated_time, workspace)."
2. Call `PATCH /tasks/{id}` via `@iexcel/api-client` with the provided fields
3. Return the updated task details

**Output:** "Task TSK-0043 updated. [Updated field summary]"

**Error cases:**
- Task not found: "No task found with ID TSK-0043."
- Task not editable (e.g., already approved): "TSK-0043 cannot be edited — it is in '{status}' status. Only draft tasks can be edited."
- Invalid estimated time format: "Invalid time format. Use format '1h 30m' or '0h 45m'."

---

### 5.9 Tool: `reject_task`

**Description:** Reject a task by short ID.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Short ID of the task (e.g., `TSK-0044`) |
| `reason` | string | No | Optional rejection reason for the audit log |

**Behavior:**
1. Call `POST /tasks/{id}/reject` via `@iexcel/api-client`
2. Return confirmation

**Output:** "Task TSK-0044 rejected."

**Error cases:**
- Task not found: "No task found with ID TSK-0044."
- Task not rejectable (already approved/completed): "TSK-0044 cannot be rejected — it is in '{status}' status."

---

### 5.10 Tool: `approve_tasks`

**Description:** Approve one or more draft tasks by short ID. Supports individual and batch approval.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ids` | string or string[] | Yes | Short ID or array of short IDs (e.g., `"TSK-0042"` or `["TSK-0042", "TSK-0043"]`) |

**Behavior:**

Single task:
1. Call `POST /tasks/{id}/approve` via `@iexcel/api-client`

Multiple tasks:
1. Call `POST /clients/{clientId}/tasks/approve` via `@iexcel/api-client` with the array of IDs
2. The `clientId` is resolved from the first task's client association

**Output:**
- Single: "Task TSK-0042 approved."
- Batch: "3 tasks approved: TSK-0042, TSK-0043, TSK-0045. TSK-0044 was not in draft status and was skipped."

**Error cases:**
- No valid IDs found: "None of the provided task IDs could be found. Check IDs with `get_tasks`."
- Mixed success: Report approved tasks and skip reasons for any that were not approvable.

---

### 5.11 Tool: `get_transcript`

**Description:** Retrieve a Grain transcript for a client, optionally filtered by date.

**Input Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `client` | string | Yes | Client name or client ID |
| `date` | string | No | Date of the call (ISO 8601 or natural language). Returns the most recent transcript if omitted. |

**Behavior:**
1. Call `GET /clients/{id}/transcripts` with optional date filter via `@iexcel/api-client`
2. Return the transcript content

**Output:** Transcript header (date, duration, participants) followed by the transcript text (truncated to first 2000 characters with a note to use the Web UI for the full transcript if longer).

**Error cases:**
- No transcript found: "No transcript found for {client} on {date}."
- Client not found: same as `get_agenda`

---

## 6. F33-05: Output Formatters

### 6.1 Task Table Format

Tasks are formatted as a Markdown table for conversational display:

```
| ID       | Description                              | Time   | Status   |
|----------|------------------------------------------|--------|----------|
| TSK-0042 | Set up GA4 tracking for landing pages    | 1h 30m | draft    |
| TSK-0043 | Update DNS records for subdomain         | 0h 45m | draft    |
| TSK-0044 | Design email template for Q2 campaign    | 3h 00m | draft    |
```

### 6.2 Agenda Format

Agendas are formatted as structured sections:

```
Agenda for Total Life — AGD-0015 (draft)
Generated: 2026-03-02

COMPLETED TASKS
- Set up GA4 tracking for landing pages
- Updated DNS records for subdomain

INCOMPLETE TASKS
- Design email template for Q2 campaign (in progress)

RECOMMENDATIONS
...
```

### 6.3 Client Status Format

Client status is formatted as key-value pairs (as shown in section 5.6).

### 6.4 Client List Format

```
| Client Name     | Status   |
|-----------------|----------|
| Total Life      | active   |
| Acme Corp       | active   |
| Old Client Co   | inactive |
```

### 6.5 Truncation Rules

- Transcripts: truncate at 2000 characters, append "[Transcript truncated. Full version at {UI_URL}]"
- Agenda content: if a section exceeds 500 characters, truncate with "[... See full agenda with `get_agenda` or at {UI_URL}]"
- Task descriptions in tables: truncate at 60 characters with "..."

---

## 7. F33-06: Error Handler

### 7.1 Error Classification

| Error Type | User-Facing Message Pattern |
|---|---|
| `ApiClientError` with code `NOT_FOUND` | Resource-specific "not found" message (see individual tools) |
| `ApiClientError` with code `FORBIDDEN` | "You don't have permission to access {resource}. Contact your administrator." |
| `ApiClientError` with code `UNAUTHORIZED` | "Your session has expired. Please authenticate: run `iexcel login`." |
| `ApiClientError` with code `TASK_NOT_APPROVABLE` | "Task {id} cannot be approved — it is in '{status}' status." |
| `ApiClientError` with code `NETWORK_ERROR` | "Could not reach the iExcel API. Check your network connection and try again." |
| `ApiClientError` with code `UNKNOWN_ERROR` | "An unexpected error occurred. Details: {message}." |
| `AuthRequiredError` | "Authentication required. Run `iexcel login` to authenticate." |

### 7.2 No Raw JSON to User

Raw JSON error bodies, stack traces, and internal error codes must never be surfaced directly to the user. All errors must pass through the error handler before display.

### 7.3 Error Output Target

Error messages are written to the conversational output (not to a separate stderr stream) so that Claude Code and Claw display them inline as part of the agent response.

---

## 8. Short ID Handling

### 8.1 Input Validation

All tool parameters that accept short IDs must validate the format before making an API call:
- `TSK-` followed by 3 or more digits (uncapped) (e.g., `TSK-0042`, `TSK-1234`, `TSK-12345`)
- `AGD-` followed by 3 or more digits (uncapped) (e.g., `AGD-0015`, `AGD-12345`)

If the format is invalid, return: "'{input}' is not a valid task ID. Use the format TSK-0042."

### 8.2 Server-Side Resolution

Short ID to UUID resolution happens in the API layer. Feature 33 passes short IDs as-is to the `@iexcel/api-client` methods, which pass them as-is to the API. The API resolves the short ID to the internal UUID. Feature 33 does not perform local ID resolution.

### 8.3 Display

Short IDs are always used for display in tool output. UUIDs are never shown to the user.

---

## 9. Client Name Resolution

### 9.1 Resolution Location

Client name-to-ID resolution happens server-side. Feature 33 passes the raw client name string in the `client` parameter. The Mastra MCP server (Feature 21) and/or the API resolve the name to a client ID.

### 9.2 Ambiguous Names

If a client name matches more than one client, the tool must return: "Multiple clients match '{name}'. Use `list_clients` to find the exact client name or ID."

### 9.3 Fuzzy Matching

Fuzzy matching (e.g., "total life" matching "Total Life") is handled server-side. Feature 33 does not implement fuzzy matching locally.

---

## 10. Package Identity and Location

### 10.1 Package

| Property | Value |
|---|---|
| **Nx project name** | `terminal-tools` |
| **Package name** | `@iexcel/terminal-tools` |
| **Location** | `packages/terminal-tools/` |
| **Type** | Nx library (not an app; no Dockerfile) |
| **Language** | TypeScript (strict mode) |
| **Runtime target** | Node.js 20+ |

### 10.2 Dependencies

| Dependency | Purpose |
|---|---|
| `@iexcel/terminal-auth` | `getValidAccessToken()` for token retrieval (Feature 32) |
| `@iexcel/api-client` | Typed API client for all data operations (Feature 22) |
| `@iexcel/shared-types` | Shared type definitions |
| `zod` | Input schema validation for tool parameters |

### 10.3 Directory Layout

```
packages/terminal-tools/
├── src/
│   ├── tools/
│   │   ├── get-agenda.ts
│   │   ├── get-tasks.ts
│   │   ├── trigger-intake.ts
│   │   ├── trigger-agenda.ts
│   │   ├── get-client-status.ts
│   │   ├── list-clients.ts
│   │   ├── edit-task.ts
│   │   ├── reject-task.ts
│   │   ├── approve-tasks.ts
│   │   ├── get-transcript.ts
│   │   └── index.ts
│   ├── auth/
│   │   └── terminal-token-provider.ts
│   ├── formatters/
│   │   ├── task-formatter.ts
│   │   ├── agenda-formatter.ts
│   │   ├── client-formatter.ts
│   │   └── index.ts
│   ├── errors/
│   │   └── error-handler.ts
│   ├── config/
│   │   └── env.ts
│   └── index.ts
├── .mcp.json              (Claude Code MCP config — symlinked or copied to monorepo root)
├── claw.config.json       (Claw MCP config)
├── README.md
├── package.json
└── project.json
```

---

## 11. Non-Functional Requirements

### 11.1 No Secrets in Output

Access tokens, refresh tokens, and other credentials must never appear in:
- Tool output shown to the user
- Log messages
- Error messages

### 11.2 Graceful Degradation

If the Mastra MCP server is unreachable:
- Tools return: "Cannot connect to the iExcel Mastra server at {MASTRA_MCP_URL}. Ensure the server is running."
- The terminal session continues; the user can retry or check other things

### 11.3 Timeout Handling

For workflow-triggering tools (`trigger_intake`, `trigger_agenda`), a polling timeout of 120 seconds is enforced. On timeout, the tool returns a helpful message rather than hanging indefinitely.

### 11.4 Idempotency Guidance

`approve_tasks` and `reject_task` are not idempotent (approving an already-approved task will likely error). Tools should surface the API's rejection gracefully with the status-specific error message defined in F33-06.
