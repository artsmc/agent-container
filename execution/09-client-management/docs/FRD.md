# FRD — Feature Requirement Document
# Feature 09: Client Management

## 1. Overview

### 1.1 Feature Summary

Client Management exposes the Client entity to API consumers (Web UI, Mastra agents, Terminal clients) via four REST endpoints. The Client is the central organizing entity in the iExcel automation system — all transcripts, tasks, agendas, and Asana routing rules are scoped to a client record. This feature makes that entity readable and partially editable through the API layer.

### 1.2 Business Context

The iExcel automation system manages account relationships for multiple clients simultaneously. Each client has its own Grain playlist for call recordings, its own Asana workspace and project for task delivery, and its own email recipient list for agenda distribution. Without a dedicated client management API, consumers cannot discover which clients they have access to, cannot read a client's configuration before routing tasks, and cannot update that configuration when it changes.

This feature is part of **Phase 3: API Core** and sits in **Wave 3** of the spec generation roadmap. It is a direct prerequisite for transcript endpoints (10), task endpoints (11), and agenda endpoints (14).

### 1.3 Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| Account Manager | Can view and update client configuration (routing rules, recipients, Grain playlist) without developer intervention. |
| Team Member | Can see which clients they are assigned to and inspect their current cycle status. |
| Mastra Agents | Can resolve client configuration (default workspace, project) when routing generated tasks. |
| Web UI | Has a client-scoped data structure to build the dashboard and client detail views on top of. |
| Admin | Can see all clients system-wide for oversight and management. |

### 1.4 Success Metrics

- All four endpoints respond correctly for valid requests across all three permission roles (Admin, Account Manager, Team Member).
- Client list is correctly scoped: users see only their assigned clients; Admins see all.
- PATCH requests validate all field types and reject invalid payloads with structured error responses.
- Status endpoint returns accurate aggregate counts (pending approvals, agenda readiness) by querying live data.
- Zero client data leakage across permission boundaries (verified by integration tests).

---

## 2. Target Users

### 2.1 Admin

Full system access. Sees all clients regardless of assignment. Primary use case: system oversight and initial client configuration.

### 2.2 Account Manager

Assigned to one or more clients. Can read and update the clients they manage. Primary use case: updating routing rules when a client's Asana project changes, updating email recipients before agenda distribution.

### 2.3 Team Member

Assigned to one or more clients in a read-only capacity. Can view client details and status. Cannot modify configuration. Primary use case: checking cycle status before a call.

### 2.4 Mastra Agents (Service Account)

Authenticated via OIDC client credentials. Needs to read client configuration to resolve Asana routing. Cannot modify client records. Treated as a service consumer with read access scoped to the client they are operating on behalf of.

---

## 3. Business Constraints and Dependencies

### 3.1 Blocked By

- **Feature 07 (API Scaffolding)**: The API framework, middleware, token validation, and routing infrastructure must exist before client endpoints can be registered.
- **Feature 04 (Product Database Schema)**: The `clients`, `users`, and related tables must exist in Postgres before any queries can run.

### 3.2 Blocks

- **Feature 10 (Transcript Endpoints)**: Transcript queries are scoped to `client_id`; the client record must be resolvable.
- **Feature 11 (Task Endpoints)**: Task queries and routing use client defaults.
- **Feature 14 (Agenda Endpoints)**: Agenda creation and sharing are scoped to a client.
- **Feature 38 (Historical Import)**: Import is triggered per client.

### 3.3 Out of Scope

The following are explicitly excluded from this feature:

- `POST /clients` — Client creation is not listed in the PRD endpoints. It is an admin-only operation to be scoped in a later feature.
- `DELETE /clients/{id}` — Not specified in the PRD.
- Client-user assignment management — Assigning or removing users from clients.
- Asana workspace CRUD — Covered by the `/asana/workspaces` endpoints (separate feature).
- Historical import endpoints — Feature 38.

---

## 4. Integration with Product Roadmap

Client Management is the foundation for all client-scoped data flows in the system. Every subsequent Phase 3 feature reads from or writes to a client context. The `GET /clients/{id}/status` endpoint in particular is the entry point for the cycle overview view in the Web UI — it aggregates live data across tasks and agendas without requiring the UI to make multiple independent queries.

```
[Feature 09: Client Management]
         |
         |---> [10: Transcript Endpoints]
         |---> [11: Task Endpoints] ---> [12: Output Normalizer]
         |---> [14: Agenda Endpoints] ---> [15: Google Docs] [16: Email]
         |---> [38: Historical Import]
```
