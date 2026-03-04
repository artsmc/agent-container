# FRD — Feature Requirements Document
# Feature 33: Terminal MCP Tools

**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)

---

## 1. Business Objective

iExcel account managers and technical users need fast, conversational access to client data and workflow triggers without leaving their terminal environment. Opening a browser to perform a quick status check or trigger a routine workflow introduces unnecessary friction.

Feature 33 delivers this by wiring up the terminal AI clients — Claude Code and Claw — to Mastra's MCP server (Feature 21). The result is a native-feeling AI tool session where users can query agendas, inspect tasks, trigger intake and agenda workflows, and perform task approvals using natural language — all without touching a browser.

---

## 2. Value Proposition

| Benefit | Description |
|---|---|
| Speed | Check client status, trigger workflows, and approve tasks without context-switching to a browser |
| Conversational workflow | Chain multiple actions in one session ("process today's intake, edit TSK-0043, approve the rest") |
| Inline review | Draft tasks from `trigger_intake` appear inline for immediate inspection and action |
| Uniform identity | The same user session authenticated once via device flow (Feature 32) is used by all tools |
| Consistent IDs | Short IDs (`TSK-####`, `AGD-####`) are human-friendly and work identically in the terminal and Web UI |

---

## 3. Target Users

| User | Environment | Primary Use Cases |
|---|---|---|
| Account Manager | Claude Code or Claw | Check agenda for a client before a call; trigger intake after a meeting; approve draft tasks; look up transcript |
| Developer / Admin | Claude Code | Debug workflow outputs; inspect agent results; verify task state; test integrations |

---

## 4. Feature Scope

### 4.1 In Scope

- MCP client configuration files for Claude Code (`.mcp.json` or equivalent) and Claw
- Auth token passthrough implementation — reads `~/.iexcel/auth/tokens.json` (written by Feature 32) and injects the access token into every MCP tool call header
- Tool wrapper implementations for all 10 MCP tools defined in the Mastra MCP server (Feature 21):
  1. `get_agenda` — retrieve current agenda for a client
  2. `get_tasks` — list tasks for a client, optionally filtered by status
  3. `trigger_intake` — trigger Workflow A (transcript to tasks)
  4. `trigger_agenda` — trigger Workflow B (completed tasks to agenda)
  5. `get_client_status` — cycle overview for a client
  6. `list_clients` — list all accessible clients
  7. `edit_task` — edit task by short ID
  8. `reject_task` — reject task by short ID
  9. `approve_tasks` — approve one or more tasks by short ID (batch support)
  10. `get_transcript` — retrieve transcript for a client
- Short ID support — all tool parameters that accept IDs accept `TSK-####` and `AGD-####` format
- Client name resolution — tools accept client names (e.g., "Total Life") in addition to IDs; resolution happens server-side
- Formatted conversational output — task lists rendered as tables, agendas as structured text, status as readable summaries
- Error handling — API errors surfaced in a user-friendly conversational format
- Token provider wired to `getValidAccessToken()` from Feature 32

### 4.2 Out of Scope

- Mastra MCP server implementation (Feature 21)
- Device authorization flow and token storage (Features 05, 32)
- API endpoint implementation (Features 07–17)
- REST API fallback client — the `@iexcel/api-client` package (Feature 22) is available directly for this purpose
- Rich text editing (terminal is limited to conversational, field-level edits)
- Collaborative editing
- Email composition or distribution UI
- Ad-hoc task creation outside of a workflow

---

## 5. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | Claude Code can connect to the Mastra MCP server using the provided configuration and call all 10 tools |
| AC-02 | Claw can connect to the Mastra MCP server using the provided configuration and call all 10 tools |
| AC-03 | Every tool call automatically includes the user's access token from `~/.iexcel/auth/tokens.json` |
| AC-04 | When no valid session exists, the user is prompted to authenticate before the tool call proceeds |
| AC-05 | All tools accept short IDs (`TSK-0042`, `AGD-0015`) in place of UUIDs |
| AC-06 | `approve_tasks` supports both single-task and multi-task batch approval in one call |
| AC-07 | Tools return formatted, readable output suitable for display in a conversational AI session |
| AC-08 | API errors are surfaced as human-readable messages (not raw JSON stack traces) |
| AC-09 | A complete session — trigger intake, edit a task, batch approve the rest — works end-to-end against a running environment |

---

## 6. Success Metrics

- Account managers can complete a post-intake review session (trigger, inspect, edit, approve) entirely in the terminal in under 5 minutes
- Zero instances of raw error JSON surfaced to the user
- All 10 MCP tools callable from both Claude Code and Claw without additional configuration

---

## 7. Dependencies

| Feature | Relationship |
|---|---|
| Feature 21 (mastra-mcp-server) | Provides the MCP server that these client configurations connect to |
| Feature 32 (terminal-device-auth) | Provides `getValidAccessToken()` and the `~/.iexcel/auth/tokens.json` token store |
| Feature 22 (api-client-package) | `@iexcel/api-client` and its `TokenProvider` interface are used by the token passthrough mechanism |

---

## 8. Interaction Boundaries

### What the terminal CAN do

- Read anything the authenticated user has access to: agendas, tasks, transcripts, client status
- Trigger workflows that produce draft outputs
- Approve tasks individually or in batch
- Edit task fields (description, assignee, estimated time, workspace) via conversational input
- Request shareable URLs for agendas (the URL is hosted by the Web UI)

### What the terminal SHOULD NOT do

- Serve as the primary approval flow for large task batches — the Web UI provides better visibility and side-by-side comparison
- Replace collaborative editing — multi-person document review belongs in the Web UI
- Distribute emails without explicit confirmation — the terminal can trigger sends but must confirm recipient list and content first

### Redirection Pattern

When the user's request is better served by the Web UI, the terminal should acknowledge the limitation and suggest the UI: "For detailed review of all 24 tasks, visit [UI URL]. Use the terminal to approve specific tasks by ID."

---

## 9. Integration with Larger System

Feature 33 is a leaf node in the feature dependency graph — it has no downstream feature dependencies. It integrates with:

- **Mastra MCP Server (Feature 21):** The primary connection. MCP tools map one-to-one to the server's exposed tool definitions.
- **Auth layer (Feature 32):** Token retrieval and refresh are handled entirely by Feature 32. Feature 33 calls `getValidAccessToken()` and attaches the result.
- **API layer (Features 07–17):** The terminal never calls the API directly — all requests route through Mastra's MCP server, which in turn routes through the API. The API enforces authorization using the user's token forwarded by Mastra.
- **Web UI (Features 23–31):** Peer consumer. Both use the same underlying API data. Short IDs are consistent between both interfaces.
