# Feature 33: Terminal MCP Tools

## Summary
Build the terminal-side MCP client configuration and tool wrappers that connect to Mastra's MCP server (feature 21). Passes user auth tokens for permission-scoped access. Provides a conversational interface for: `get_agenda`, `get_tasks`, `trigger_intake`, `trigger_agenda`, `get_client_status`, `list_clients`, `edit_task`, `reject_task`, `approve_tasks`, `get_transcript`. Short ID support throughout.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 21 (Mastra MCP server — the server this client connects to), 32 (terminal device auth — tokens required for all tool calls), 22 (api-client — tool wrappers may use api-client for direct API calls)
- **Blocks**: None (leaf feature — end-user facing)

## Source PRDs
- `terminal-prd.md` — MCP Server section, example interactions, interaction boundaries
- `mastra-prd.md` — MCP Server

## Relevant PRD Extracts

### MCP Server — Available Tools (terminal-prd.md)

| Tool | Description |
|---|---|
| `get_agenda` | Retrieve the current agenda/Running Notes for a client |
| `get_tasks` | List generated tasks for a client (draft, approved, or completed). Returns short IDs. |
| `trigger_intake` | Kick off Workflow A (transcript -> tasks). Returns draft tasks for review. |
| `trigger_agenda` | Kick off Workflow B (completed tasks -> agenda). Returns draft agenda. |
| `get_client_status` | Overview of a client's current cycle — pending approvals, agenda readiness, upcoming call. |
| `list_clients` | List all clients the authenticated user has access to. |
| `edit_task` | Edit a task by short ID (e.g., `TSK-0042`). Update description, assignee, time, routing. |
| `reject_task` | Reject a task by short ID. |
| `approve_tasks` | Approve draft tasks by short ID. Supports individual or batch. |
| `get_transcript` | Pull a Grain transcript by client and date. |

### Example Interactions (terminal-prd.md)

```
User: "What's the agenda looking like for Total Life?"
-> Claude calls get_agenda(client="Total Life")
-> Returns the current Running Notes summary inline

User: "Process the intake call from today"
-> Claude calls trigger_intake(client="Total Life", date="today")
-> Returns generated draft tasks for review:
  TSK-0042  Set up GA4 tracking for landing pages    1h 30m   draft
  TSK-0043  Update DNS records for subdomain          0h 45m   draft
  TSK-0044  Design email template for Q2 campaign     3h 00m   draft

User: "Change TSK-0043 to 1 hour and assign it to Mike"
-> Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m", assignee="Mike")
-> Task updated, confirmation returned

User: "Approve all except TSK-0044"
-> Claude calls approve_tasks(ids=["TSK-0042", "TSK-0043"])
-> Tasks approved, confirmation returned

User: "Reject TSK-0044, that's not our scope"
-> Claude calls reject_task(id="TSK-0044")
-> Task rejected
```

### Short IDs (terminal-prd.md)

All tasks and agendas have human-readable short IDs (`TSK-####`, `AGD-####`) that work across the UI, terminal, and chat. In a conversation, users reference tasks by short ID rather than UUID. The MCP tools and API accept short IDs natively.

### MCP Server Architecture (mastra-prd.md)

Mastra exposes an MCP server for AI-native access from Claude Code and Claw. MCP tool calls route through the API layer — Mastra does not serve business data directly.

### User Context — Terminal -> Mastra MCP (mastra-prd.md)

When a user calls Mastra via MCP, their auth token (obtained via device flow) is passed through. Mastra forwards the user's token to the API so actions are scoped to the user's permissions.

### Interaction Boundaries (terminal-prd.md)

**What the terminal CAN do:**
- Read anything the user has access to (agendas, tasks, transcripts, status).
- Trigger workflows that produce draft outputs.
- Approve tasks that have already been reviewed (or approve inline if the user is confident).
- Request shareable URLs from the Mastra backend (the URL itself is hosted by the UI).

**What the terminal SHOULD NOT do:**
- Serve as the primary approval flow for large task batches. The UI provides better visibility.
- Replace collaborative editing. Multi-person document review belongs in the UI.
- Distribute emails without confirmation. The terminal can trigger email sends, but should always confirm recipient list and content first.

### REST API Fallback (terminal-prd.md)

For environments where MCP isn't available, the same capabilities are accessible via the API layer REST endpoints directly. Claude Code or Claw can call these via `curl` or HTTP tools.

### Terminal vs. UI Capability Comparison (terminal-prd.md)

| Capability | Terminal | Web UI |
|---|---|---|
| Query agendas and tasks | Yes | Yes |
| Trigger workflows | Yes | Yes |
| Approve tasks | Yes (inline) | Yes (with visual review) |
| Edit task descriptions | Limited (via conversation) | Full (rich text editor) |
| Collaborative editing | No | Yes |
| Shareable links | No (returns URL) | Yes (generates and hosts) |
| Email distribution | Can trigger | Full compose and send |
| Multi-account routing | Can specify per command | Visual selector with defaults |
| Client read-only view | No | Yes |

## Scope

### In Scope
- MCP client configuration for connecting to Mastra's MCP server (feature 21)
- Auth token passthrough — user's token from `~/.iexcel/auth/tokens.json` is included with every MCP tool call
- Tool wrapper implementations for all 10 MCP tools:
  - `get_agenda(client)` — retrieve current agenda for a client
  - `get_tasks(client, status?)` — list tasks for a client, optionally filtered by status
  - `trigger_intake(client, transcript_source, date?)` — trigger Workflow A
  - `trigger_agenda(client, cycle_start?, cycle_end?)` — trigger Workflow B
  - `get_client_status(client)` — cycle overview for a client
  - `list_clients()` — list all accessible clients
  - `edit_task(id, fields...)` — edit task by short ID (description, assignee, estimated_time, workspace)
  - `reject_task(id)` — reject task by short ID
  - `approve_tasks(ids)` — approve one or more tasks by short ID (batch support)
  - `get_transcript(client, date?)` — retrieve transcript for a client
- Short ID support — all tool parameters accept short IDs (`TSK-####`, `AGD-####`)
- Client name resolution — tools accept client names (e.g., "Total Life") in addition to IDs
- Formatted output for conversational display (task lists as tables, agenda content as structured text)
- Error handling — surface API errors in a conversational format
- MCP configuration files for Claude Code (`.claude/mcp.json` or equivalent) and Claw

### Out of Scope
- Mastra MCP server implementation (feature 21)
- Auth service or device flow implementation (feature 05, 32)
- API implementation (features 07-17)
- REST API fallback client (the api-client package from feature 22 can be used directly for this)
- Rich text editing (terminal is limited to conversational edits)
- Collaborative editing
- Email composition UI

## Key Decisions
- The terminal MCP tools are **client-side wrappers** that connect to Mastra's MCP server. They do not implement business logic — they pass parameters to MCP tool calls which route through the API.
- User auth tokens from `~/.iexcel/auth/tokens.json` (written by feature 32) are passed with every MCP request. Mastra forwards these to the API for permission-scoped data access.
- Short IDs are the primary identifier in all terminal interactions. Users say "approve TSK-0042", not "approve 550e8400-e29b-41d4-a716-446655440000". The MCP tools and API both accept short IDs natively.
- Client names can be used instead of client IDs for convenience (e.g., `get_agenda(client="Total Life")`). Name resolution happens server-side.
- `approve_tasks` supports both individual and batch approval. A user can say "approve TSK-0042" or "approve TSK-0042, TSK-0043, TSK-0044".
- The terminal is optimized for speed and querying. Complex review workflows (large batch approvals with editing, collaborative document review, email composition) should be redirected to the UI. The terminal can suggest "For detailed review, visit [UI URL]".
- MCP configuration must be provided for both Claude Code and Claw, as these are the two supported terminal clients. The configuration specifies the Mastra MCP server URL and auth token source.
