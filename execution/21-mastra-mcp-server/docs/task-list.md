# Task List
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Date:** 2026-03-03

---

## Prerequisites

Before starting any task in this feature, confirm the following are complete and merged:
- Feature 18 (Mastra Runtime Setup) — Mastra instance, env config, service token manager, API client factory
- Feature 19 (Workflow A — Intake Agent) — `trigger_intake` calls this workflow
- Feature 20 (Workflow B — Agenda Agent) — `trigger_agenda` calls this workflow
- Feature 22 (API Client Package) — typed API client methods used by all tools
- Feature 23 (Shared Types) — `Task`, `Agenda`, `Client`, `WorkflowRun`, `ClientStatus` types

---

## Task Group 1: MCP Server Setup and Token Passthrough

These tasks establish the MCP server infrastructure. All subsequent tool implementation tasks depend on Group 1 being complete.

---

- [ ] **Task 1.1 — Research and document Mastra MCP server registration API** (Small)

  Consult Mastra documentation and source code to determine:
  - How MCP tools are registered on a Mastra instance (top-level tools, server config, or plugin)
  - How the MCP endpoint URL path is determined (e.g., `/mcp`)
  - Whether and how incoming HTTP request headers (e.g., `Authorization`) are surfaced to tool `execute` functions

  Document findings in `apps/mastra/NOTES.md` (temporary dev notes). This unblocks Task 1.2 and all tool implementations.

  References: TR.md - Section 3

---

- [ ] **Task 1.2 — Enable MCP server on the Mastra instance** (Small)

  Modify `apps/mastra/src/index.ts` to enable Mastra's built-in MCP server using the registration pattern determined in Task 1.1.

  Verification: Start Mastra locally and confirm the MCP tools/list endpoint is reachable (e.g., via curl or a Mastra MCP client). Confirm port 8081 and the correct URL path.

  Update `apps/mastra/README.md` with the confirmed MCP server URL.

  References: FRS.md - FR-01, FR-02, FR-03; TR.md - Section 3

---

- [ ] **Task 1.3 — Create `apps/mastra/src/mcp-tools/` directory structure** (Small)

  Create the directory `apps/mastra/src/mcp-tools/` with:
  - 10 empty tool stub files (one per tool, see FRS.md FR-04 for names)
  - `index.ts` barrel file (empty for now)
  - `formatters.ts` (empty for now)
  - `helpers/` subdirectory with `resolve-client.ts` and `extract-token.ts` stubs

  Each stub file must export a placeholder constant so the barrel compiles without errors.

  References: FRS.md - FR-04; TR.md - Section 2

---

- [ ] **Task 1.4 — Implement user token extraction helper** (Small)

  Create `apps/mastra/src/mcp-tools/helpers/extract-token.ts` that:
  - Accepts the Mastra execution context (or request headers, per findings from Task 1.1)
  - Extracts the `Authorization: Bearer <token>` value
  - Returns the token string or `null` if not present
  - Never logs the token value

  Write unit tests covering: token present, token absent, malformed Authorization header.

  References: FRS.md - FR-10, FR-13; TR.md - Section 4.1

---

- [ ] **Task 1.5 — Implement per-request user-scoped API client factory** (Small)

  Create `apps/mastra/src/mcp-tools/helpers/create-user-api-client.ts` that:
  - Accepts a user token string
  - Calls `createApiClient({ baseUrl: env.API_BASE_URL, getAccessToken: async () => userToken })`
  - Returns the configured API client instance

  This activates the pattern established in Feature 18 FR-43.

  Confirm that the service API client (created at startup with `serviceTokenManager.getToken`) is NOT used anywhere in `src/mcp-tools/`.

  References: FRS.md - FR-11, FR-12; TR.md - Section 4.3

---

- [ ] **Task 1.6 — Implement `resolveClient` shared helper** (Small)

  Create `apps/mastra/src/mcp-tools/helpers/resolve-client.ts` that:
  - Accepts an `apiClient` instance and a `clientParam` string
  - If `clientParam` looks like a UUID, calls `apiClient.clients.getClient(clientParam)`
  - Otherwise, calls `apiClient.clients.listClients({ name: clientParam })`
  - If 0 results: throws `ClientNotFoundError`
  - If 2+ results: throws `AmbiguousClientError`
  - Returns `{ id: string; name: string }`

  Write unit tests covering: UUID input, name input (single match), name input (no match), name input (multiple matches).

  References: FRS.md - FR-130, FR-131, FR-132; TR.md - Section 5.2

---

- [ ] **Task 1.7 — Implement output formatters** (Small)

  Create `apps/mastra/src/mcp-tools/formatters.ts` with:
  - `formatTaskTable(tasks: Task[]): string` — Markdown table with ID, Description, Time, Status columns; description truncated to 60 chars
  - `formatClientStatus(status: ClientStatus): string` — key-value format per FRS.md FR-63
  - `formatClientList(clients: Client[]): string` — Markdown table with Client Name and Status
  - `formatAgenda(agenda: Agenda): string` — structured section output per FRS.md reference
  - `formatError(message: string): string` — returns the message string (passthrough for consistency)
  - `truncateTranscript(content: string, uiUrl: string, transcriptId: string): string` — truncates at 2000 chars

  Write unit tests for each formatter covering empty inputs, truncation boundaries, and correct Markdown structure.

  References: FRS.md - FR-91, FR-92; TR.md - Section 6

---

- [ ] **Task 1.8 — Implement API error handler** (Small)

  Create `apps/mastra/src/mcp-tools/helpers/handle-api-error.ts` that:
  - Accepts an `unknown` error and tool context
  - Maps `ApiClientError` codes to user-friendly messages per FRS.md FR-90
  - Never includes raw JSON, stack traces, UUIDs, or token values in the returned string
  - Returns a safe, user-readable error string for all error cases

  Write unit tests for each `ApiClientError` code and for unknown error types.

  References: FRS.md - FR-90, FR-91; TR.md - Section 9

---

## Task Group 2: Read-Only MCP Tools

These tools make GET requests only and carry no side effects. Implement them after Group 1 is complete.

---

- [ ] **Task 2.1 — Implement `list_clients` tool** (Small)

  File: `apps/mastra/src/mcp-tools/list-clients.ts`

  - Extract user token; return auth error if absent
  - Create user-scoped API client
  - Call `GET /clients` via `userApiClient.clients.listClients()`
  - Format result with `formatClientList`
  - Handle empty result: "No clients found for your account. Contact your administrator."
  - Wrap in try/catch with `handleApiError`

  Register the tool in `apps/mastra/src/mcp-tools/index.ts`.

  Write unit tests: success with multiple clients, success with zero clients, UNAUTHORIZED, NETWORK_ERROR.

  References: FRS.md - FR-70 through FR-74

---

- [ ] **Task 2.2 — Implement `get_client_status` tool** (Small)

  File: `apps/mastra/src/mcp-tools/get-client-status.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `GET /clients/{clientId}/status`
  - Format with `formatClientStatus`
  - Handle client not found error

  Register the tool. Write unit tests: success, client not found, FORBIDDEN.

  References: FRS.md - FR-60 through FR-64

---

- [ ] **Task 2.3 — Implement `get_agenda` tool** (Small)

  File: `apps/mastra/src/mcp-tools/get-agenda.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `GET /clients/{clientId}/agendas`
  - Select the most recent non-rejected agenda
  - Format with `formatAgenda`
  - Handle: no agenda exists, client not found, FORBIDDEN

  Register the tool. Write unit tests: success, no agenda, client not found, FORBIDDEN.

  References: FRS.md - FR-20 through FR-23

---

- [ ] **Task 2.4 — Implement `get_tasks` tool** (Small)

  File: `apps/mastra/src/mcp-tools/get-tasks.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `GET /clients/{clientId}/tasks` with optional `status` query param
  - Format with `formatTaskTable`
  - Handle: no tasks found (with/without status filter), client not found

  Register the tool. Write unit tests: success (all statuses), success (filtered), no tasks, client not found.

  References: FRS.md - FR-30 through FR-33

---

- [ ] **Task 2.5 — Implement `get_transcript` tool** (Small)

  File: `apps/mastra/src/mcp-tools/get-transcript.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `GET /clients/{clientId}/transcripts` with optional `date` query param
  - Apply transcript truncation via `truncateTranscript` (2000 char limit)
  - Handle: no transcript found, client not found

  Register the tool. Write unit tests: success (short content), success (long content — truncation applied), no transcript, client not found.

  References: FRS.md - FR-110 through FR-113

---

## Task Group 3: Workflow Trigger Tools

These tools initiate state changes by triggering workflows. Implement after Group 1.

---

- [ ] **Task 3.1 — Implement `trigger_intake` tool** (Small)

  File: `apps/mastra/src/mcp-tools/trigger-intake.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `POST /workflows/intake` with `{ clientId, date?, transcriptSource? }`
  - Return workflow run ID and next-step instructions (per FRS.md FR-43 output format)
  - Do NOT poll for completion
  - Handle: no transcript found, workflow already running, client not found

  Register the tool. Write unit tests: success, no transcript, conflict (workflow already running), client not found.

  References: FRS.md - FR-40 through FR-44

---

- [ ] **Task 3.2 — Implement `trigger_agenda` tool** (Small)

  File: `apps/mastra/src/mcp-tools/trigger-agenda.ts`

  - Extract user token
  - Resolve client via `resolveClient`
  - Call `POST /workflows/agenda` with `{ clientId, cycleStart?, cycleEnd? }`
  - Return workflow run ID and next-step instructions (per FRS.md FR-53 output format)
  - Do NOT poll for completion
  - Handle: no completed tasks, client not found

  Register the tool. Write unit tests: success, no completed tasks, client not found.

  References: FRS.md - FR-50 through FR-54

---

## Task Group 4: Task Management Tools

These tools allow modification and state transitions on tasks. Implement after Group 1.

---

- [ ] **Task 4.1 — Implement `edit_task` tool** (Medium)

  File: `apps/mastra/src/mcp-tools/edit-task.ts`

  - Input schema validation: `id` must match `TSK-\d{3,4}` (Zod); at least one optional field required (explicit check)
  - Validate `estimated_time` format if provided
  - Extract user token
  - Call `PATCH /tasks/{shortId}` with the provided fields (pass short ID directly — no UUID resolution)
  - Return confirmation with updated fields summary
  - Handle: task not found, task not editable (already approved/completed), no fields provided, invalid time format

  Register the tool. Write unit tests: success, no fields, invalid short ID, invalid time format, task not editable, task not found.

  References: FRS.md - FR-80 through FR-84; TR.md - Section 8

---

- [ ] **Task 4.2 — Implement `reject_task` tool** (Small)

  File: `apps/mastra/src/mcp-tools/reject-task.ts`

  - Input schema: `id` must match `TSK-\d{3,4}`
  - Extract user token
  - Call `POST /tasks/{shortId}/reject` with optional `{ reason }` body
  - Return: "Task {id} rejected."
  - Handle: task not found, task not rejectable

  Register the tool. Write unit tests: success (no reason), success (with reason), task not found, task not rejectable.

  References: FRS.md - FR-85 through FR-89

---

- [ ] **Task 4.3 — Implement `approve_tasks` tool** (Medium)

  File: `apps/mastra/src/mcp-tools/approve-tasks.ts`

  - Input schema: `ids` is either a single `TSK-\d{3,4}` string or an array of them
  - Normalize single string to array
  - Extract user token
  - If single ID: call `POST /tasks/{shortId}/approve`
  - If multiple IDs:
    - Resolve the `clientId` from the first task's association (via a GET or batch endpoint that accepts client-scoped approval)
    - Call `POST /clients/{clientId}/tasks/approve` with the IDs array
  - Return results with success/skip breakdown per FRS.md FR-103
  - Handle: no valid IDs, mixed success/failure, all IDs not found

  Register the tool. Write unit tests: single approve, batch approve (all success), batch approve (mixed), batch approve (all fail), invalid ID format.

  References: FRS.md - FR-100 through FR-104; TR.md - Section 5.1

---

## Task Group 5: Integration and Observability

---

- [ ] **Task 5.1 — Register all 10 MCP tools with the Mastra instance** (Small)

  Update `apps/mastra/src/mcp-tools/index.ts` to export all 10 tools.

  Update `apps/mastra/src/index.ts` to register the MCP tools with the Mastra instance (per the mechanism determined in Task 1.1).

  Verification: Start Mastra locally. Use a Mastra MCP client or curl to call `tools/list`. Confirm all 10 tools appear with correct descriptions and input schemas.

  References: FRS.md - FR-02

---

- [ ] **Task 5.2 — Add structured logging to all MCP tool invocations** (Small)

  Implement the `logToolCall` wrapper utility in `apps/mastra/src/mcp-tools/helpers/log-tool-call.ts` (per TR.md Section 12.1).

  Wrap every tool's execute body in `logToolCall` to emit structured log entries with:
  - `tool`, `requestSource: 'mcp'`, `userId`, `clientParam`, `startedAt`, `durationMs`, `success`

  Ensure no token values appear in any log entry (redact before logging if inspecting headers).

  References: FRS.md - FR-200, FR-201

---

- [ ] **Task 5.3 — Add OpenTelemetry trace spans to MCP tools** (Small)

  If Mastra does not automatically produce spans for MCP tool calls, add manual OTel span creation in each tool:
  - Span name: `mcp.{tool_id}` (e.g., `mcp.get_agenda`)
  - Attributes: `mcp.tool`, `mcp.user_id`, `mcp.client_param`, `mcp.success`, `mcp.api_status_code`

  Verify spans appear in the OTEL backend when running locally with tracing configured.

  References: FRS.md - FR-202; TR.md - Section 12.2

---

## Task Group 6: Documentation and Handoff

---

- [ ] **Task 6.1 — Document MCP server URL in `apps/mastra/README.md`** (Small)

  Update the Mastra app README to include:
  - The confirmed MCP server URL (e.g., `http://localhost:8081/mcp`)
  - A list of all 10 MCP tools with brief descriptions
  - Instructions for testing with a Mastra MCP client or curl

  This is the handoff document for Feature 33 (Terminal MCP Tools). Feature 33 implementers must be able to configure `.mcp.json` from this documentation alone.

  References: FRD.md - Section 4 (Out of Scope: terminal client config)

---

- [ ] **Task 6.2 — Run end-to-end smoke test against local stack** (Medium)

  With the full local stack running (API, Mastra, Auth), use a Mastra MCP client to execute a representative set of tool calls:

  1. Call `list_clients` — verify client list returned
  2. Call `get_client_status` for a known client — verify status shape
  3. Call `get_tasks` for a known client — verify task table returned
  4. Call `trigger_intake` for a client with a known transcript — verify workflow run ID returned
  5. Wait for workflow to complete; call `get_tasks` with `status="draft"` — verify draft tasks appear
  6. Call `edit_task` on one draft task — verify update confirmation
  7. Call `approve_tasks` on one draft task — verify approval confirmation
  8. Call `reject_task` on another draft task — verify rejection confirmation
  9. Call `trigger_agenda` — verify workflow run ID returned
  10. Call `get_agenda` after agenda workflow completes — verify agenda content returned

  Document any issues found as bugs against Feature 21.

  References: GS.md - Feature: approve_tasks (end-to-end conversation flow)

---

- [ ] **Task 6.3 — Notify Feature 33 team that MCP server is ready** (Small)

  Confirm with the Feature 33 implementers:
  - The MCP server URL and protocol version
  - The `Authorization: Bearer` header requirement
  - The list of available tools and their input schemas
  - Any quirks or caveats discovered during implementation (e.g., tool call timeout behavior)

  Feature 33 cannot fully implement `.mcp.json` and the terminal token provider without this information.

  References: FRD.md - Section 9 (Blocks)

---

## Task Summary

| Group | Tasks | Complexity | Dependencies |
|---|---|---|---|
| Group 1: MCP Server Setup | 1.1 – 1.8 (8 tasks) | Small each | Features 18, 22, 23 |
| Group 2: Read-Only Tools | 2.1 – 2.5 (5 tasks) | Small each | Group 1 complete |
| Group 3: Workflow Trigger Tools | 3.1 – 3.2 (2 tasks) | Small each | Group 1 + Features 17, 19, 20 |
| Group 4: Task Management Tools | 4.1 – 4.3 (3 tasks) | Small–Medium | Group 1 + Feature 11 |
| Group 5: Integration & Observability | 5.1 – 5.3 (3 tasks) | Small each | All Groups 1–4 complete |
| Group 6: Documentation & Handoff | 6.1 – 6.3 (3 tasks) | Small–Medium | Group 5 complete |

**Total tasks: 24**

**Recommended implementation order:**
1. Task 1.1 (research) — unblocks everything else
2. Tasks 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 (sequential, each builds on prior)
3. Groups 2, 3, 4 can be parallelized across developers once Group 1 is done
4. Task 5.1 requires all tools to be implemented; Tasks 5.2 and 5.3 can be done tool-by-tool in parallel with Groups 2–4
5. Group 6 is last
