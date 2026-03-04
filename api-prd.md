# API Layer — Product Requirements Document

## Overview

A REST API that owns all business logic for the iExcel automation system. It sits between every consumer (Mastra agents, Web UI, Terminal clients) and the [PostgreSQL database](./database-prd.md). It also owns the connection to external systems (Asana, Google Docs, Grain, Email). No consumer talks to the database or external services directly — everything routes through this API.

## Problem Statement

Without a dedicated API layer:

- Business logic gets duplicated across Mastra workflows, the UI, and terminal clients.
- Mastra agents would need direct knowledge of Asana's API, Google Docs, and database schemas.
- Swapping an external service (e.g., Asana → Monday.com) means rewriting multiple consumers.
- There's no single place to enforce authorization, validation, and rate limiting.

The API layer centralizes all of this. Every consumer makes the same calls, gets the same responses, and follows the same rules.

---

## Design Principles

- **Single point of integration.** Mastra, the UI, and terminal clients all call the same API. No direct database or external service access.
- **Business logic lives here.** "Can this user approve tasks for this client?" "Which Asana workspace does this task route to?" "Is this agenda ready to share?" — all answered by the API, not the consumer.
- **External systems are abstracted.** The API exposes actions like "push task" and "generate doc." The consumer doesn't know or care that Asana or Google Docs is behind it.
- **Stateless.** Auth token on every request. No server-side sessions.

---

## Architecture Position

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Web UI  │  │ Terminal  │  │  Mastra  │
│          │  │(Claude/   │  │ (Agents) │
│          │  │ Claw)     │  │          │
└────┬─────┘  └────┬──────┘  └────┬─────┘
     │             │              │
     └─────────────┼──────────────┘
                   │
                   ▼
          ┌────────────────┐
          │    API LAYER    │
          │                │
          │ - Authz (token │
          │   validation)  │
          │ - Business     │
          │   Logic        │
          │ - Validation   │
          │ - External     │
          │   Service      │
          │   Adapters     │
          └───┬────────┬───┘
              │        │
       ┌──────┘        └──────────┐
       ▼                          ▼
┌──────────────┐    ┌──────────────────────┐
│  PostgreSQL  │    │  External Services   │
│  (database   │    │  - Asana             │
│   -prd.md)   │    │  - Google Docs       │
│              │    │  - Grain             │
│              │    │  - Email (SendGrid/  │
│              │    │    Resend)           │
└──────────────┘    └──────────────────────┘
```

---

## API Endpoints

### Authentication

Authentication is handled by the [Auth Service](./auth-prd.md). The API **does not** have its own login or token issuance endpoints. Instead:

- All requests include an OIDC access token issued by the auth service.
- The API validates tokens against the auth service's JWKS endpoint.
- The API maps the token's `sub` claim to product-level permissions (roles, client access).

| Endpoint | Method | Description |
|---|---|---|
| `/me` | GET | Return current user's product profile and permissions (uses auth token's `sub` to look up product roles) |

### Clients

| Endpoint | Method | Description |
|---|---|---|
| `/clients` | GET | List all clients accessible to the authenticated user |
| `/clients/{id}` | GET | Get client details including config and defaults |
| `/clients/{id}` | PATCH | Update client config (routing rules, email recipients, etc.) |
| `/clients/{id}/status` | GET | Cycle overview — pending approvals, agenda readiness, next call |

### Transcripts

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | GET | List transcripts for a client |
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |
| `/transcripts/{id}` | GET | Get a specific transcript |

### Tasks

All task endpoints accept either the internal UUID or the human-readable **short ID** (e.g., `TSK-0042`) as the `{id}` parameter. The API resolves short IDs transparently.

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/tasks` | GET | List tasks for a client (filterable by `status`, `transcript_id`) |
| `/clients/{id}/tasks` | POST | Create draft tasks (called by Mastra after transcript processing). Short IDs are auto-assigned. |
| `/tasks/{id}` | GET | Get a specific task with version history. Accepts UUID or short ID (e.g., `TSK-0042`). |
| `/tasks/{id}` | PATCH | Edit a draft task (description, assignee, estimated time, routing) |
| `/tasks/{id}/approve` | POST | Approve a single task |
| `/tasks/{id}/reject` | POST | Reject a task |
| `/tasks/{id}/push` | POST | Push an approved task to Asana |
| `/clients/{id}/tasks/approve` | POST | Batch approve tasks (body: list of task short IDs or UUIDs) |
| `/clients/{id}/tasks/push` | POST | Batch push approved tasks to Asana |

### Agendas

All agenda endpoints accept either the internal UUID or the human-readable **short ID** (e.g., `AGD-0015`) as the `{id}` parameter.

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/agendas` | GET | List agendas for a client |
| `/clients/{id}/agendas` | POST | Create a draft agenda (called by Mastra after summarization). Short ID auto-assigned. |
| `/agendas/{id}` | GET | Get a specific agenda with version history. Accepts UUID or short ID. |
| `/agendas/{id}` | PATCH | Edit agenda content |
| `/agendas/{id}/finalize` | POST | Mark agenda as finalized |
| `/agendas/{id}/share` | POST | Generate shareable URLs (client read-only + internal edit) |
| `/agendas/{id}/email` | POST | Send agenda to recipients (body: optional recipient override) |
| `/agendas/{id}/export` | POST | Export to Google Docs |
| `/shared/{token}` | GET | Public endpoint — retrieve shared agenda by token (no auth required) |

### Workflows

Endpoints that Mastra agents or consumers call to trigger the two core workflows.

| Endpoint | Method | Description |
|---|---|---|
| `/workflows/intake` | POST | Trigger Workflow A: submit transcript, invoke Mastra agent, return draft tasks |
| `/workflows/agenda` | POST | Trigger Workflow B: pull completed tasks, invoke Mastra agent, return draft agenda |
| `/workflows/{id}/status` | GET | Check status of a running workflow |

**Workflow execution flow:**
1. Consumer calls `/workflows/intake` with `client_id` and `transcript_id`.
2. API validates the request, persists a workflow run record.
3. API invokes the Mastra agent (async).
4. Mastra agent processes the transcript and calls back to `/clients/{id}/tasks` (POST) to save draft tasks.
5. Consumer polls `/workflows/{id}/status` or receives a webhook/event when complete.

### Asana Workspaces

| Endpoint | Method | Description |
|---|---|---|
| `/asana/workspaces` | GET | List configured Asana workspaces |
| `/asana/workspaces` | POST | Add a new Asana workspace connection |
| `/asana/workspaces/{id}` | DELETE | Remove a workspace connection |

### Client Reactivation & Historical Import

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/import` | POST | Trigger on-demand import of historical data for a returning client |
| `/clients/{id}/import/status` | GET | Check status of a running import |

**Import flow:**
1. Account manager provides references to historical sources (Grain playlist ID, Asana project ID).
2. API validates access to those sources, creates an import job.
3. API pulls historical transcripts, tasks, and documents via the Grain and Asana adapters.
4. Optionally invokes Mastra to reprocess old transcripts for structured data.
5. All imported records are flagged with `is_imported = true` and marked read-only.

### Audit Log

| Endpoint | Method | Description |
|---|---|---|
| `/audit` | GET | Query audit log (filterable by `entity_type`, `entity_id`, `user_id`, `date_range`) |

---

## Business Logic (owned by the API)

### Task Routing
- When a task is pushed, the API determines the target Asana workspace:
  1. Check task-level override (`asana_workspace_id` on the task).
  2. Fall back to client default (`default_asana_workspace_id` on the client).
  3. If neither is set, reject the push with an error.

### Approval Enforcement
- Tasks can only be pushed if `status = approved`.
- Only users with `account_manager` or `admin` role can approve.
- Approval sets `approved_by`, `approved_at`, and logs to audit.

### Agenda Lifecycle
- Agendas can only be shared or emailed if `status = finalized`.
- Finalizing requires at least one edit or explicit confirmation (prevents accidental sharing of raw agent output).

### Data Scoping
- Every query is scoped to the authenticated user's accessible clients.
- A user cannot access tasks, agendas, or transcripts for clients they don't have permissions for.
- Client-scoped tokens (for terminal/MCP) are validated on every request.

### External Service Adapters
- **Asana Adapter** — Translates internal task format to Asana's API. Handles workspace routing, custom field mapping, and error recovery.
- **Google Docs Adapter** — Converts agenda content to a Google Doc. Creates or appends based on client config.
- **Grain Adapter** — Pulls transcripts by playlist/call ID. Handles pagination and rate limits.
- **Email Adapter** — Sends formatted agenda emails. Manages recipient lists and delivery tracking.

Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter — nothing else changes.

---

## Authentication & Authorization

Authentication is fully delegated to the [Auth Service](./auth-prd.md). The API is a **relying party** — it validates tokens but never issues them.

### Token Validation
1. Every request includes an access token: `Authorization: Bearer <token>`.
2. API validates the token signature against the auth service's JWKS (`/.well-known/jwks.json`).
3. API extracts the `sub` claim (user ID) from the token.
4. API looks up the user's product-level permissions from its own database (`auth_user_id` → roles, client access).
5. If the token is expired or invalid → `401 Unauthorized`.

### Permission Model (Product-Level)

The auth service knows **who you are**. The API knows **what you can do in this product**.

| Role | Capabilities |
|---|---|
| **Admin** | Everything. Manage workspaces, users, and system config. |
| **Account Manager** | Full CRUD on their assigned clients. Approve tasks, finalize agendas, trigger workflows. |
| **Team Member** | Read access to assigned clients. Edit agendas (collaborative). Cannot approve or push. |

Roles are stored in the product database, linked to the auth service's user ID via `auth_user_id`. See [`database-prd.md`](./database-prd.md) and [`auth-prd.md`](./auth-prd.md) for the schema relationship.

### Service-to-Service Auth (Mastra)
- Mastra authenticates using the OIDC **client credentials flow** with its own `client_id` and `client_secret` registered in the auth service.
- The API validates Mastra's access token the same way it validates user tokens.

---

## Error Handling

Standard error response format:

```json
{
  "error": {
    "code": "TASK_NOT_APPROVABLE",
    "message": "Task is in 'draft' status and must be reviewed before approval.",
    "details": {
      "task_id": "abc-123",
      "current_status": "rejected"
    }
  }
}
```

Common error codes:

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | User lacks permission for this action |
| `CLIENT_NOT_FOUND` | 404 | Client ID doesn't exist or user can't access it |
| `TASK_NOT_APPROVABLE` | 422 | Task status doesn't allow approval |
| `AGENDA_NOT_FINALIZABLE` | 422 | Agenda hasn't been reviewed |
| `PUSH_FAILED` | 502 | External service (Asana, Google Docs) returned an error |
| `WORKSPACE_NOT_CONFIGURED` | 422 | No Asana workspace set for this task or client |

---

## Open Questions

- [ ] Tech stack — Node.js/Express, Fastify, or Python/FastAPI?
- [ ] Should workflow triggering be synchronous (wait for Mastra) or async (webhook/polling)?
- [x] ~~How does Mastra authenticate back to the API when saving draft tasks?~~ → Resolved: OIDC client credentials flow via the [Auth Service](./auth-prd.md).
- [ ] Should the API support WebSocket events for real-time updates (e.g., "new draft tasks available")?
- [ ] Rate limiting strategy — per-user, per-client, or per-consumer-type?
- [ ] Should the `/shared/{token}` endpoint be on the API or served by the UI directly?
