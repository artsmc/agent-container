# Feature 09: Client Management

## Summary
Implement client CRUD endpoints: `GET /clients`, `GET /clients/{id}`, `PATCH /clients/{id}`, and `GET /clients/{id}/status`. The client entity includes name, default workspace/project, email recipients, and Grain playlist reference. Clients are the central organizing entity -- all business data is scoped to a client.

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 07 (API scaffolding), 04 (product database schema with Clients table)
- **Blocks**: 10 (transcript endpoints are client-scoped), 11 (task endpoints are client-scoped), 14 (agenda endpoints are client-scoped)

## Source PRDs
- `api-prd.md` — Clients endpoints, Data Scoping
- `database-prd.md` — Clients entity schema

## Relevant PRD Extracts

### Clients Endpoints (api-prd.md)
| Endpoint | Method | Description |
|---|---|---|
| `/clients` | GET | List all clients accessible to the authenticated user |
| `/clients/{id}` | GET | Get client details including config and defaults |
| `/clients/{id}` | PATCH | Update client config (routing rules, email recipients, etc.) |
| `/clients/{id}/status` | GET | Cycle overview -- pending approvals, agenda readiness, next call |

### Clients Entity (database-prd.md)
The central organizing entity. Everything is scoped to a client.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | Client name (e.g., "Total Life") |
| grain_playlist_id | VARCHAR | Reference to the client's Grain playlist |
| default_asana_workspace_id | VARCHAR | Default Asana workspace for task routing |
| default_asana_project_id | VARCHAR | Default Asana project within the workspace |
| email_recipients | JSONB | Default recipient list for agenda distribution |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Data Scoping (api-prd.md)
- Every query is scoped to the authenticated user's accessible clients.
- A user cannot access tasks, agendas, or transcripts for clients they don't have permissions for.
- Client-scoped tokens (for terminal/MCP) are validated on every request.

### Permission Model (api-prd.md)
| Role | Capabilities |
|---|---|
| Admin | Everything. Manage workspaces, users, and system config. |
| Account Manager | Full CRUD on their assigned clients. |
| Team Member | Read access to assigned clients. |

### Key Relationships (database-prd.md)
```
Clients
  |-- Transcripts (1:many)
  |-- Tasks (1:many)
  |-- Agendas (1:many)
  +-- Asana Workspaces (many:many via client default + per-task override)
```

## Scope

### In Scope
- `GET /clients` — List clients accessible to the authenticated user (scoped by user permissions)
- `GET /clients/{id}` — Get client details including config, defaults, and Asana workspace/project settings
- `PATCH /clients/{id}` — Update client config fields (name, default workspace/project, email recipients, Grain playlist ID)
- `GET /clients/{id}/status` — Cycle overview aggregating pending approvals count, agenda readiness, next scheduled call
- Permission enforcement: users only see/edit clients they are assigned to (admin sees all)
- Request validation for PATCH body
- Pagination for client list

### Out of Scope
- Client creation (`POST /clients`) — not listed in the PRD endpoints; likely an admin-only operation to be scoped later
- Client deletion — not specified in PRD
- Client-user assignment management (assigning users to clients)
- Asana workspace CRUD — that is a separate set of endpoints in the PRD
- Historical import endpoints (`/clients/{id}/import`) — that is feature 38

## Key Decisions
- Clients are the central scoping entity; all downstream data (transcripts, tasks, agendas) is client-scoped
- The `email_recipients` field is JSONB, allowing flexible recipient list structures
- The status endpoint (`/clients/{id}/status`) is a computed/aggregate endpoint, not a simple CRUD read -- it requires querying tasks and agendas for the client
- Data scoping is enforced at the API level: the middleware (from feature 07) identifies the user, and client queries filter to only accessible clients
