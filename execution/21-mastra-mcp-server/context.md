# Feature 21: Mastra MCP Server

## Summary
Configure Mastra's MCP server for AI-native access from Claude Code and Claw. Expose tools that allow terminal AI clients to query data, trigger workflows, and manage tasks through natural conversation. All MCP tools route through the API layer -- Mastra does not serve business data directly. Handles user token passthrough so that API actions are scoped to the calling user's permissions.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 18 (Mastra Runtime Setup — MCP server runs on the Mastra runtime), 11 (Task Endpoints — MCP tools call task API endpoints), 14 (Agenda Endpoints — MCP tools call agenda API endpoints), 17 (Workflow Orchestration — MCP tools trigger workflows via API), 09 (Client Management — MCP tools query client data via API)
- **Blocks**: 33 (Terminal MCP Tools — terminal clients connect to this MCP server)

## Source PRDs
- mastra-prd.md (MCP Server section)
- terminal-prd.md (MCP tools list, example interactions, Short IDs, Authentication)

## Relevant PRD Extracts

### MCP Server (mastra-prd.md)

> Mastra exposes an MCP server for AI-native access from Claude Code and Claw. MCP tool calls route through the API layer — Mastra does not serve business data directly. See `terminal-prd.md` for details.

### User Context — Token Passthrough (mastra-prd.md)

> **User Context (Terminal -> Mastra MCP):**
> - When a user calls Mastra via MCP, their auth token (obtained via device flow — see `terminal-prd.md`) is passed through.
> - Mastra forwards the user's token to the API so actions are scoped to the user's permissions.

### MCP Tools (terminal-prd.md)

| Tool | Description |
|---|---|
| `get_agenda` | Retrieve the current agenda/Running Notes for a client |
| `get_tasks` | List generated tasks for a client (draft, approved, or completed). Returns short IDs. |
| `trigger_intake` | Kick off Workflow A (transcript to tasks). Returns draft tasks for review |
| `trigger_agenda` | Kick off Workflow B (completed tasks to agenda). Returns draft agenda |
| `get_client_status` | Overview of a client's current cycle — pending approvals, agenda readiness, upcoming call |
| `list_clients` | List all clients the authenticated user has access to |
| `edit_task` | Edit a task by short ID (e.g., `TSK-0042`). Update description, assignee, time, routing. |
| `reject_task` | Reject a task by short ID |
| `approve_tasks` | Approve draft tasks by short ID. Supports individual or batch. |
| `get_transcript` | Pull a Grain transcript by client and date |

### Example Interactions (terminal-prd.md)

> ```
> User: "What's the agenda looking like for Total Life?"
> -> Claude calls get_agenda(client="Total Life")
> -> Returns the current Running Notes summary inline
>
> User: "Process the intake call from today"
> -> Claude calls trigger_intake(client="Total Life", date="today")
> -> Returns generated draft tasks for review:
>   TSK-0042  Set up GA4 tracking for landing pages    1h 30m   draft
>   TSK-0043  Update DNS records for subdomain          0h 45m   draft
>   TSK-0044  Design email template for Q2 campaign     3h 00m   draft
>
> User: "Change TSK-0043 to 1 hour and assign it to Mike"
> -> Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m", assignee="Mike")
> -> Task updated, confirmation returned
>
> User: "Approve all except TSK-0044"
> -> Claude calls approve_tasks(ids=["TSK-0042", "TSK-0043"])
> -> Tasks approved, confirmation returned
>
> User: "Reject TSK-0044, that's not our scope"
> -> Claude calls reject_task(id="TSK-0044")
> -> Task rejected
> ```

### Short IDs (terminal-prd.md)

> All tasks and agendas have human-readable short IDs (`TSK-####`, `AGD-####`) that work across the UI, terminal, and chat. In a conversation, users reference tasks by short ID rather than UUID. The MCP tools and API accept short IDs natively.

### Authentication (terminal-prd.md)

> Authentication uses the Auth Service's **Device Authorization Flow** — designed for CLI/terminal environments where a browser redirect isn't practical. The terminal is registered as OIDC client `iexcel-terminal`.
>
> **Key details:**
> - **Shared token store:** All terminal tools (Claude Code, Claw, future CLIs) read from `~/.iexcel/auth/tokens.json`. Log in once, every tool picks it up.
> - **Silent refresh:** When access token expires, the client automatically uses the refresh token.
> - **Scoping:** Token carries user identity. The API maps identity to product permissions (which clients, what role).

### Interaction Boundaries (terminal-prd.md)

> **What the terminal CAN do:**
> - Read anything the user has access to (agendas, tasks, transcripts, status).
> - Trigger workflows that produce draft outputs.
> - Approve tasks that have already been reviewed (or approve inline if the user is confident).
> - Request shareable URLs from the Mastra backend.
>
> **What the terminal SHOULD NOT do:**
> - Serve as the primary approval flow for large task batches. The UI provides better visibility.
> - Replace collaborative editing.
> - Distribute emails without confirmation.

## Scope

### In Scope
- Configure Mastra's MCP server endpoint within the apps/mastra/ runtime
- Implement all 10 MCP tools as defined in terminal-prd.md:
  - `get_agenda` — calls GET /clients/{id}/agendas or GET /agendas/{id} via API
  - `get_tasks` — calls GET /clients/{id}/tasks via API, returns short IDs
  - `trigger_intake` — calls POST /workflows/intake via API
  - `trigger_agenda` — calls POST /workflows/agenda via API
  - `get_client_status` — calls GET /clients/{id}/status via API
  - `list_clients` — calls GET /clients via API
  - `edit_task` — calls PATCH /tasks/{id} via API (accepts short ID)
  - `reject_task` — calls POST /tasks/{id}/reject via API (accepts short ID)
  - `approve_tasks` — calls POST /tasks/{id}/approve or POST /clients/{id}/tasks/approve via API (accepts short IDs, supports batch)
  - `get_transcript` — calls GET /clients/{id}/transcripts via API
- User token passthrough — accept the user's auth token from the MCP client and forward it to the API so actions are scoped to the user's permissions
- Tool input/output schema definitions for each MCP tool (parameters, return types)
- Proper error handling and user-friendly error messages for MCP responses
- Short ID support — all tools that reference tasks or agendas accept short IDs (TSK-####, AGD-####)

### Out of Scope
- Terminal client implementation (that is feature 33)
- Device authorization flow implementation (that is feature 32)
- API endpoint implementations (those are features 09, 10, 11, 14, 17)
- Direct database access (all data flows through the API)
- Direct external service access (Asana, Google Docs, etc. — all through the API)
- MCP tool for direct Asana or Google Docs operations
- Real-time streaming of workflow progress (open question)

## Key Decisions
- **MCP tools route through the API layer.** Mastra does not serve business data directly. Every MCP tool call translates to one or more API calls. This ensures business logic, authorization, and audit logging are consistently enforced.
- **User token passthrough for permission scoping.** When a terminal user calls an MCP tool, their auth token (obtained via the device authorization flow) is passed through Mastra to the API. The API uses this token to enforce per-user, per-client permission scoping. Mastra does not use its own service token for user-initiated actions.
- **Short IDs are the primary interface.** Terminal users reference tasks and agendas by short ID (TSK-0042, AGD-0015), not UUID. All MCP tools accept short IDs and the API resolves them transparently.
- **Tools are thin wrappers around API calls.** The MCP tools handle parameter mapping, token forwarding, and response formatting, but do not contain business logic. Business logic lives in the API layer.
- **The MCP server is part of the Mastra runtime.** It runs within the same apps/mastra/ container and shares the Mastra framework's configuration, authentication, and observability infrastructure.
