# FRD — Feature Requirements Document
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Specified

---

## 1. Business Objective

Account managers and developers working in terminal environments (Claude Code, Claw) need to interact with the iExcel automation system without leaving their CLI session. The Mastra MCP server bridges the gap between AI-native terminal clients and the iExcel backend, exposing the full set of workflow management capabilities as conversational tools.

The MCP server enables:
- Querying client agendas and task status mid-conversation
- Triggering Workflow A (intake-to-tasks) and Workflow B (tasks-to-agenda) directly from the terminal
- Reviewing and acting on draft outputs (approve, reject, edit tasks) without switching to the Web UI
- Pulling Grain transcripts into context for further analysis

This feature makes iExcel's automation system AI-native: terminal users interact with the system through natural language, and the underlying MCP tools handle all translation to structured API calls.

---

## 2. Value Proposition

| Persona | Current Pain | With MCP Server |
|---|---|---|
| Account Manager | Must open the Web UI to check task status or trigger a workflow between other tasks | Ask "what's the agenda for Total Life?" inline in their existing Claude Code session |
| Developer / Admin | Must use curl or navigate the UI to inspect workflow state | Call `get_client_status` and inspect results without leaving the terminal |
| Any terminal user | Workflow management is tied to browser context | MCP tools feel native to Claude Code/Claw — no context switching |

---

## 3. Target Users

| User | Environment | Primary MCP Actions |
|---|---|---|
| Account Manager | Claude Code, Claw | `get_agenda`, `get_tasks`, `trigger_intake`, `trigger_agenda`, `approve_tasks`, `edit_task`, `reject_task` |
| Developer / Admin | Claude Code | All tools; especially `get_client_status`, `list_clients`, `get_transcript` for debugging |

---

## 4. Feature Scope

### In Scope

- Configure Mastra's built-in MCP server endpoint within `apps/mastra/`
- Implement all 10 MCP tool definitions (see Section 6)
- User token passthrough: accept the user's auth token from the MCP client (via `Authorization: Bearer`) and forward it to every downstream API call
- Tool input and output schema definitions using Zod
- Error handling and user-friendly error messages for all tool failure modes
- Short ID native support: all tools accept `TSK-####` and `AGD-####` identifiers; resolution to UUIDs is handled by the API layer
- Client name resolution forwarded to the API layer (not implemented locally in Mastra)

### Out of Scope

- Terminal client implementation and MCP configuration files (Feature 33)
- Device authorization flow and terminal token management (Feature 32)
- API endpoint implementations (Features 09, 10, 11, 14, 17)
- Direct database access — all data flows through the API layer
- Direct external service access (Asana, Grain, Google Docs) — all through the API
- Real-time streaming of workflow progress (open question — not in V1)
- Ad-hoc task creation from terminal (not in V1)

---

## 5. Success Criteria

| Criterion | Measure |
|---|---|
| All 10 tools discoverable | MCP client can list all 10 tools with correct descriptions and input schemas |
| Token passthrough functional | API requests from MCP-triggered tools carry the user's Bearer token, not the Mastra service token |
| Short IDs accepted natively | All tools that accept task/agenda references work with `TSK-####` / `AGD-####` format |
| Error messages user-friendly | No raw stack traces or JSON error bodies in tool responses |
| Tools integrate with Feature 33 | Terminal MCP clients (Feature 33) can connect to this server and call all tools successfully |
| Read tools work for any authorized user | `list_clients`, `get_agenda`, `get_tasks`, `get_transcript`, `get_client_status` return only data the user is authorized to see |
| Write tools enforce scoping | `edit_task`, `approve_tasks`, `reject_task`, `trigger_intake`, `trigger_agenda` operate only on clients the user has access to |

---

## 6. MCP Tool Summary

| Tool | API Endpoint(s) Called | Auth Model |
|---|---|---|
| `get_agenda` | `GET /clients/{id}/agendas` | User token |
| `get_tasks` | `GET /clients/{id}/tasks` | User token |
| `trigger_intake` | `POST /workflows/intake` | User token |
| `trigger_agenda` | `POST /workflows/agenda` | User token |
| `get_client_status` | `GET /clients/{id}/status` | User token |
| `list_clients` | `GET /clients` | User token |
| `edit_task` | `PATCH /tasks/{id}` | User token |
| `reject_task` | `POST /tasks/{id}/reject` | User token |
| `approve_tasks` | `POST /tasks/{id}/approve` or `POST /clients/{clientId}/tasks/approve` | User token |
| `get_transcript` | `GET /clients/{id}/transcripts` | User token |

All 10 tools use the user's forwarded token. Mastra does not substitute its service token for MCP-originated calls.

---

## 7. Authentication Model

### User Token Passthrough

When a terminal client (Claude Code or Claw) makes an MCP tool call, it includes `Authorization: Bearer <user_access_token>` in the HTTP request headers. The Mastra MCP server:

1. Extracts the bearer token from the incoming request
2. Constructs a user-scoped API client instance (using the token as the access token provider)
3. Forwards the token on all downstream API calls made to fulfill that tool invocation

The API layer uses the token to enforce per-user, per-client permission scoping. Mastra acts as a pass-through for authorization — it does not perform its own authorization checks.

### Service Token (Not Used for MCP)

Mastra's service token (OIDC client credentials, `mastra-agent` client) is used exclusively for autonomous workflow calls (Workflow A and Workflow B agent invocations). It is never used for MCP tool calls, which always carry a user identity.

---

## 8. Key Architectural Decisions

1. **MCP tools are thin API wrappers.** Business logic, authorization enforcement, and data persistence all remain in the API layer. The MCP tools handle parameter mapping, token forwarding, and response formatting only.

2. **The MCP server runs within the Mastra runtime.** It is exposed via Mastra's built-in MCP server mechanism at `apps/mastra/`, sharing the same process, configuration, and observability infrastructure as the agent workflows.

3. **Short IDs are the primary user-facing interface.** Users reference tasks and agendas by short ID. The API resolves short IDs to UUIDs transparently. Mastra passes short IDs through without local resolution.

4. **Client name resolution is server-side.** When a user passes `client="Total Life"`, the API resolves the name to a client ID. Mastra does not maintain a local client registry.

5. **No streaming in V1.** Workflow-triggering tools (`trigger_intake`, `trigger_agenda`) call the API and return the workflow run ID. Status polling is the responsibility of Feature 33 (terminal client). Mastra's MCP tools return the initial trigger confirmation synchronously.

---

## 9. Dependencies

### Blocked By (Must Be Complete Before This Feature)

| Feature | Why Required |
|---|---|
| 18 (Mastra Runtime Setup) | MCP server runs within the Mastra runtime; service token manager and API client patterns are established here |
| 19 (Workflow A — Intake Agent) | `trigger_intake` tool calls the workflow endpoint that Feature 19 implements |
| 20 (Workflow B — Agenda Agent) | `trigger_agenda` tool calls the workflow endpoint that Feature 20 implements |
| 11 (Task Endpoints) | `get_tasks`, `edit_task`, `approve_tasks`, `reject_task` call task API endpoints |
| 14 (Agenda Endpoints) | `get_agenda` calls agenda API endpoints |
| 17 (Workflow Orchestration) | `trigger_intake`, `trigger_agenda` call workflow trigger endpoints |
| 09 (Client Management) | `list_clients`, `get_client_status` call client API endpoints |

### Blocks (Cannot Start Until This Feature Is Complete)

| Feature | Why Blocked |
|---|---|
| 33 (Terminal MCP Tools) | Feature 33 configures terminal clients to connect to this MCP server. The server must exist before client configuration can be validated. |

---

## 10. Relationship to Other System Layers

```
Claude Code / Claw (terminal)
        |
        | MCP protocol (HTTP + Authorization: Bearer <user_token>)
        |
   Mastra MCP Server (this feature)
        |
        | HTTP + Authorization: Bearer <user_token> (forwarded)
        |
     API Layer
        |
      ┌─┴──────────────┐
  Postgres         External Services
                 (Asana, Grain, GDocs)
```

Mastra is the translation layer between MCP protocol and the REST API. It adds no business logic and owns no persistent state.

---

## 11. Open Questions

| Question | Impact | Owner |
|---|---|---|
| Should `trigger_intake` and `trigger_agenda` block and poll for completion, or return immediately with a workflow run ID? | Determines whether Feature 21 needs polling logic or Feature 33 handles it | Product |
| Does Mastra's MCP server support dynamic header injection (reading the `Authorization` header per-request)? | If not, user token passthrough architecture may need adjustment | Engineering (Feature 21 implementer) |
| Should the MCP server validate the user token before forwarding (e.g., inspect expiry)? | Could improve error messages but adds latency | Engineering |
| What is the MCP server URL path: `/mcp`, `/mcp/v1`, or Mastra default? | Feature 33 config must match | Engineering |
