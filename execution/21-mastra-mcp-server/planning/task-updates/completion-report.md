# Feature 21: Mastra MCP Server -- Completion Report

**Date:** 2026-03-05
**Status:** Complete

---

## Summary

Implemented all 10 MCP tools for the iExcel Automation platform's Mastra MCP server. The tools are registered with the Mastra instance via the top-level `tools` config and exposed through Mastra's built-in MCP server endpoint at `/mcp`.

---

## Completed Tasks

### Group 1: MCP Server Setup (Tasks 1.1-1.8)

- **1.1 Research:** Mastra's `@mastra/core` v1.9 exposes MCP tools via the top-level `tools` config on the Mastra instance. Tools created with `createTool()` are automatically served via the MCP protocol. The `ToolExecutionContext.mcp.extra.authInfo.token` provides the user's Bearer token from the incoming MCP HTTP request.

- **1.2 MCP Server Enabled:** Updated `apps/mastra/src/index.ts` to register MCP tools under `tools: { ...mcpTools }`. Mastra exposes them at `/mcp` (streamable HTTP transport) on port 8081.

- **1.3 Directory Structure:** Created `apps/mastra/src/mcp-tools/` with all 10 tool files, barrel `index.ts`, formatters, and helpers subdirectory.

- **1.4 Token Extraction:** Implemented `helpers/extract-token.ts` -- extracts Bearer token from MCP `authInfo`, with fallback to `requestContext`. Never logs token values. 6 unit tests.

- **1.5 User-Scoped API Client:** Implemented `helpers/create-user-api-client.ts` -- constructs a per-request `ApiClient` using the user's token. Service token is never used for MCP calls.

- **1.6 Client Resolution:** Implemented `helpers/resolve-client.ts` with `resolveClient()`, `ClientNotFoundError`, `AmbiguousClientError`. Supports UUID direct lookup and case-insensitive name matching. 7 unit tests.

- **1.7 Output Formatters:** Implemented `formatters.ts` with `formatTaskTable`, `formatClientStatus`, `formatClientList`, `formatAgenda`, `truncateTranscript` (2000 char limit), `truncate` (configurable), `formatError`. 12 unit tests.

- **1.8 API Error Handler:** Implemented `helpers/handle-api-error.ts` mapping all API error codes (401, 403, 404, 409, 5xx, NETWORK_ERROR) to user-friendly messages. Handles `ClientNotFoundError`, `AmbiguousClientError`, and unknown errors. 11 unit tests.

### Group 2: Read-Only Tools (Tasks 2.1-2.5)

| Tool | File | Description |
|------|------|-------------|
| `list_clients` | `list-clients.ts` | Lists all accessible clients. No parameters. |
| `get_client_status` | `get-client-status.ts` | Client workflow cycle overview. |
| `get_agenda` | `get-agenda.ts` | Most recent non-rejected agenda for a client. |
| `get_tasks` | `get-tasks.ts` | Task list with optional status filter. |
| `get_transcript` | `get-transcript.ts` | Transcript with 2000-char truncation. |

All read-only tools have `readOnlyHint: true` in MCP annotations.

### Group 3: Workflow Trigger Tools (Tasks 3.1-3.2)

| Tool | File | Description |
|------|------|-------------|
| `trigger_intake` | `trigger-intake.ts` | Starts Workflow A. Returns workflow run ID. |
| `trigger_agenda` | `trigger-agenda.ts` | Starts Workflow B. Returns workflow run ID. |

Neither tool polls for completion -- they return immediately per spec.

### Group 4: Task Management Tools (Tasks 4.1-4.3)

| Tool | File | Description |
|------|------|-------------|
| `edit_task` | `edit-task.ts` | Edit by short ID. Validates time format, requires at least one field. |
| `reject_task` | `reject-task.ts` | Reject draft task with optional reason. |
| `approve_tasks` | `approve-tasks.ts` | Single or batch approval. Handles mixed results. |

### Group 5: Integration (Tasks 5.1-5.3)

- **5.1 Registration:** All 10 tools registered in barrel `index.ts` and wired into Mastra via `src/index.ts`.
- **5.2 Structured Logging:** `helpers/log-tool-call.ts` wraps every tool execution with structured log entries (tool, userId, clientParam, durationMs, success, requestSource: 'mcp'). No token values logged.
- **5.3 OTel Spans:** Deferred to Mastra's built-in MCP tracing. Manual span creation is not required -- Mastra v1.9 produces spans for tool executions automatically via its observability config.

---

## Architecture Decisions

1. **Token Passthrough:** MCP tools extract the user token from `context.mcp.extra.authInfo.token`. Each tool creates a fresh `ApiClient` per invocation using `createUserApiClient()`. The service token is never used for MCP calls.

2. **Tool Registration:** Tools are registered at the top level of the Mastra instance via the `tools` config (not as MCP server plugins). Mastra's built-in MCP server discovers and exposes them automatically.

3. **Short ID Passthrough:** Task and agenda short IDs (TSK-NNN, AGD-NNN) are passed directly to the API without local UUID resolution.

4. **Client Name Resolution:** `resolveClient()` performs case-insensitive matching with support for both exact and partial matches. UUID detection triggers direct `getClient()` calls.

---

## Test Results

- **42 new unit tests** across 4 test files (all passing)
- **82 existing tests** unaffected (all passing)
- **124 total tests** passing
- **TypeScript compilation:** Zero errors with strict mode

---

## MCP Server Configuration (for Feature 33)

| Property | Value |
|----------|-------|
| Server URL | `http://localhost:8081/mcp` |
| Protocol | MCP Streamable HTTP |
| Auth Header | `Authorization: Bearer <user_access_token>` |
| Port | 8081 (configurable via `MASTRA_PORT`) |
| Tool Count | 10 |

---

## Files Created/Modified

### New Files (18)

- `apps/mastra/src/mcp-tools/index.ts` -- barrel export
- `apps/mastra/src/mcp-tools/formatters.ts` -- output formatters
- `apps/mastra/src/mcp-tools/helpers/extract-token.ts`
- `apps/mastra/src/mcp-tools/helpers/create-user-api-client.ts`
- `apps/mastra/src/mcp-tools/helpers/resolve-client.ts`
- `apps/mastra/src/mcp-tools/helpers/handle-api-error.ts`
- `apps/mastra/src/mcp-tools/helpers/log-tool-call.ts`
- `apps/mastra/src/mcp-tools/list-clients.ts`
- `apps/mastra/src/mcp-tools/get-client-status.ts`
- `apps/mastra/src/mcp-tools/get-agenda.ts`
- `apps/mastra/src/mcp-tools/get-tasks.ts`
- `apps/mastra/src/mcp-tools/get-transcript.ts`
- `apps/mastra/src/mcp-tools/trigger-intake.ts`
- `apps/mastra/src/mcp-tools/trigger-agenda.ts`
- `apps/mastra/src/mcp-tools/edit-task.ts`
- `apps/mastra/src/mcp-tools/reject-task.ts`
- `apps/mastra/src/mcp-tools/approve-tasks.ts`
- `apps/mastra/src/mcp-tools/__tests__/` (4 test files)

### Modified Files (1)

- `apps/mastra/src/index.ts` -- added MCP tools import and `tools` config
