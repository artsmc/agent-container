# Terminal (CLI/AI Client) — Product Requirements Document

## Overview

Define how AI-native clients — [Claude Code](https://claude.ai/claude-code) and [Claw](https://openclaw.ai/) — interact with the iExcel automation system from terminal sessions. Terminal clients talk to the [API layer](./api-prd.md) for business data and actions, and connect to [Mastra's](./mastra-prd.md) MCP server for agent-powered capabilities. This layer enables account managers and developers to query, trigger, and manage workflows without leaving their CLI environment.

## Problem Statement

The Web UI handles approval flows and collaboration. But not every interaction needs a browser. Account managers and technical users often want to:

- Quickly check agenda status for a client.
- Trigger a workflow without opening a dashboard.
- Pull task summaries into an ongoing AI conversation.
- Get data inline while working on something else.

Forcing these interactions through a web UI adds friction. The terminal layer provides a fast, conversational interface to the same Mastra backend.

---

## Users

| User | Environment | Primary Actions |
|---|---|---|
| **Account Manager** | Claude Code / Claw | Query agendas, check task status, trigger workflows, review summaries |
| **Developer / Admin** | Claude Code | Debug workflows, inspect agent outputs, manage configuration |

---

## Access Methods

### MCP Server (Primary)

Mastra exposes an MCP server that Claude Code and Claw can connect to as a tool provider. This is the preferred method — it makes Mastra capabilities feel native to the AI session.

**Available tools (exposed via MCP):**

| Tool | Description |
|---|---|
| `get_agenda` | Retrieve the current agenda/Running Notes for a client |
| `get_tasks` | List generated tasks for a client (draft, approved, or completed). Returns short IDs. |
| `trigger_intake` | Kick off Workflow A (transcript → tasks). Returns draft tasks for review |
| `trigger_agenda` | Kick off Workflow B (completed tasks → agenda). Returns draft agenda |
| `get_client_status` | Overview of a client's current cycle — pending approvals, agenda readiness, upcoming call |
| `list_clients` | List all clients the authenticated user has access to |
| `edit_task` | Edit a task by short ID (e.g., `TSK-0042`). Update description, assignee, time, routing. |
| `reject_task` | Reject a task by short ID |
| `approve_tasks` | Approve draft tasks by short ID. Supports individual or batch. |
| `get_transcript` | Pull a Grain transcript by client and date |

**Example interactions:**

```
User: "What's the agenda looking like for Total Life?"
→ Claude calls get_agenda(client="Total Life")
→ Returns the current Running Notes summary inline

User: "Process the intake call from today"
→ Claude calls trigger_intake(client="Total Life", date="today")
→ Returns generated draft tasks for review:
  TSK-0042  Set up GA4 tracking for landing pages    1h 30m   draft
  TSK-0043  Update DNS records for subdomain          0h 45m   draft
  TSK-0044  Design email template for Q2 campaign     3h 00m   draft

User: "Change TSK-0043 to 1 hour and assign it to Mike"
→ Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m", assignee="Mike")
→ Task updated, confirmation returned

User: "Approve all except TSK-0044"
→ Claude calls approve_tasks(ids=["TSK-0042", "TSK-0043"])
→ Tasks approved, confirmation returned

User: "Reject TSK-0044, that's not our scope"
→ Claude calls reject_task(id="TSK-0044")
→ Task rejected
```

### Short IDs

All tasks and agendas have human-readable short IDs (`TSK-####`, `AGD-####`) that work across the UI, terminal, and chat. In a conversation, users reference tasks by short ID rather than UUID. The MCP tools and API accept short IDs natively. See [`database-prd.md`](./database-prd.md) for schema details.

### REST API (Fallback)

For environments where MCP isn't available, the same capabilities are accessible via the [API layer](./api-prd.md) REST endpoints directly. Claude Code or Claw can call these via `curl` or HTTP tools. See [`api-prd.md`](./api-prd.md) for the full endpoint reference.

---

## Authentication

Authentication uses the [Auth Service's](./auth-prd.md) **Device Authorization Flow** — designed for CLI/terminal environments where a browser redirect isn't practical. The terminal is registered as OIDC client `iexcel-terminal`.

**Login flow:**
```
1. User runs login command (or first MCP call triggers it)
2. Terminal calls Auth service: POST /device/authorize
3. Auth service returns a user code and verification URL
4. Terminal displays: "Visit https://auth.iexcel.com/device and enter code ABCD-1234"
5. User opens browser, enters code, authenticates via IdP (Google/Okta SSO)
6. Terminal polls Auth service until authentication completes
7. Auth service returns tokens (access + refresh)
8. Tokens stored at ~/.iexcel/auth/tokens.json
9. All subsequent MCP/API requests include the access token automatically
```

**Key details:**
- **Shared token store:** All terminal tools (Claude Code, Claw, future CLIs) read from `~/.iexcel/auth/tokens.json`. Log in once, every tool picks it up.
- **Silent refresh:** When access token expires, the client automatically uses the refresh token. User only re-authenticates when the refresh token expires.
- **SSO:** If the user is already logged into the auth service (e.g., from the Web UI), the device flow completes instantly — no password entry needed.
- **Scoping:** Token carries user identity. The API maps identity to product permissions (which clients, what role).

---

## Relationship to Other Layers

The terminal layer and the Web UI are **peers** — both consume the same [API layer](./api-prd.md). They are not dependent on each other. Neither talks to the [database](./database-prd.md) or external services directly.

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

**Key principle:** The terminal is optimized for speed and querying. The Web UI is optimized for review, collaboration, and sharing. Complex approval flows with editing should go through the UI. Quick checks and triggers are better in the terminal.

---

## Interaction Boundaries

### What the terminal CAN do:
- Read anything the user has access to (agendas, tasks, transcripts, status).
- Trigger workflows that produce draft outputs.
- Approve tasks that have already been reviewed (or approve inline if the user is confident).
- Request shareable URLs from the Mastra backend (the URL itself is hosted by the UI).

### What the terminal SHOULD NOT do:
- Serve as the primary approval flow for large task batches. The UI provides better visibility.
- Replace collaborative editing. Multi-person document review belongs in the UI.
- Distribute emails without confirmation. The terminal can trigger email sends, but should always confirm recipient list and content first.

---

## Open Questions

- [ ] Should the MCP server support streaming responses for long-running workflows (e.g., transcript processing)?
- [ ] Should `approve_tasks` in the terminal require per-task confirmation or allow batch approve without review?
- [ ] Does Claw support MCP natively, or does it need REST API only?
- [ ] Should the terminal be able to create ad-hoc tasks (not from a transcript) and push them to Asana?
- [ ] How should the terminal handle conflicts — e.g., user approves via terminal while someone else is editing in the UI?
