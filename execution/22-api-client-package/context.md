# Feature 22: API Client Package

## Summary
Create `packages/api-client/` — a TypeScript API client library consumed by UI, Mastra, and terminal MCP tools. Provides typed methods for all API endpoints (clients, transcripts, tasks, agendas, workflows, asana workspaces, audit) using shared-types for request/response contracts. Handles token attachment and refresh.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 00 (Nx monorepo scaffolding), 01 (shared-types package), 07 (API scaffolding — defines the endpoints this client calls)
- **Blocks**: 23 (UI scaffolding imports api-client), 24 (UI auth flow uses api-client for authenticated requests), 25-31 (all UI screens use api-client for data fetching), 33 (terminal MCP tools use api-client)

## Source PRDs
- `infra-prd.md` — api-client package in Nx structure, dependency graph
- `api-prd.md` — all endpoint definitions, request/response contracts, error handling format

## Relevant PRD Extracts

### Package Position in Nx (infra-prd.md)

```
packages/
  ├── api-client/           # Generated or hand-written API client
  │   ├── src/              # Used by UI, Mastra, and terminal MCP tools
  │   └── project.json
```

### Nx Dependency Graph (infra-prd.md)

```
shared-types
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
 api-client      database       (direct)
     │              │              │
     ├──────┐       │              │
     ▼      ▼       │              ▼
    ui    mastra     │             api ◄── database
```

**Key relationships:**
- `api-client` depends on `shared-types` and is consumed by `ui` and `mastra`.
- `ui` depends on `shared-types` and `api-client`.
- `mastra` depends on `shared-types` and `api-client`.

### CI/CD Impact (infra-prd.md)

| Changed | Builds | Deploys |
|---|---|---|
| `packages/api-client/` | ui, mastra | ui + mastra containers |

### All API Endpoints (api-prd.md)

**Authentication:**
| Endpoint | Method | Description |
|---|---|---|
| `/me` | GET | Return current user's product profile and permissions |

**Clients:**
| Endpoint | Method | Description |
|---|---|---|
| `/clients` | GET | List all clients accessible to the authenticated user |
| `/clients/{id}` | GET | Get client details including config and defaults |
| `/clients/{id}` | PATCH | Update client config |
| `/clients/{id}/status` | GET | Cycle overview — pending approvals, agenda readiness, next call |

**Transcripts:**
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | GET | List transcripts for a client |
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |
| `/transcripts/{id}` | GET | Get a specific transcript |

**Tasks (accept UUID or short ID):**
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/tasks` | GET | List tasks for a client (filterable by status, transcript_id) |
| `/clients/{id}/tasks` | POST | Create draft tasks |
| `/tasks/{id}` | GET | Get a specific task with version history |
| `/tasks/{id}` | PATCH | Edit a draft task |
| `/tasks/{id}/approve` | POST | Approve a single task |
| `/tasks/{id}/reject` | POST | Reject a task |
| `/tasks/{id}/push` | POST | Push an approved task to Asana |
| `/clients/{id}/tasks/approve` | POST | Batch approve tasks |
| `/clients/{id}/tasks/push` | POST | Batch push approved tasks |

**Agendas (accept UUID or short ID):**
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/agendas` | GET | List agendas for a client |
| `/clients/{id}/agendas` | POST | Create a draft agenda |
| `/agendas/{id}` | GET | Get a specific agenda with version history |
| `/agendas/{id}` | PATCH | Edit agenda content |
| `/agendas/{id}/finalize` | POST | Mark agenda as finalized |
| `/agendas/{id}/share` | POST | Generate shareable URLs |
| `/agendas/{id}/email` | POST | Send agenda to recipients |
| `/agendas/{id}/export` | POST | Export to Google Docs |
| `/shared/{token}` | GET | Public endpoint — retrieve shared agenda by token (no auth) |

**Workflows:**
| Endpoint | Method | Description |
|---|---|---|
| `/workflows/intake` | POST | Trigger Workflow A: transcript → tasks |
| `/workflows/agenda` | POST | Trigger Workflow B: completed tasks → agenda |
| `/workflows/{id}/status` | GET | Check status of a running workflow |

**Asana Workspaces:**
| Endpoint | Method | Description |
|---|---|---|
| `/asana/workspaces` | GET | List configured Asana workspaces |
| `/asana/workspaces` | POST | Add a new Asana workspace connection |
| `/asana/workspaces/{id}` | DELETE | Remove a workspace connection |

**Client Import:**
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/import` | POST | Trigger historical data import |
| `/clients/{id}/import/status` | GET | Check import status |

**Audit:**
| Endpoint | Method | Description |
|---|---|---|
| `/audit` | GET | Query audit log (filterable by entity_type, entity_id, user_id, date_range) |

### Error Response Format (api-prd.md)

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

### Token Attachment (api-prd.md)
- Every request includes an access token: `Authorization: Bearer <token>`.
- The API is stateless — auth token on every request, no server-side sessions.

### Token Storage by Consumer (auth-prd.md)

| Consumer | Storage Location | Token Type |
|---|---|---|
| Web UI | httpOnly cookie or in-memory | Access + refresh tokens |
| Claude Code | `~/.iexcel/auth/tokens.json` | Access + refresh tokens |
| Mastra | Environment variable / secret manager | Client credentials token |

## Scope

### In Scope
- TypeScript API client library at `packages/api-client/`
- Typed methods for every API endpoint listed above, using types from `packages/shared-types/`
- Request/response type safety — method signatures enforce correct payloads and return typed responses
- Token attachment — every request includes `Authorization: Bearer <token>` header
- Token refresh handling — automatic refresh when access token expires, using refresh token
- Configurable base URL (`API_BASE_URL` for different environments)
- Error handling — parse API error responses into typed error objects matching the `{ error: { code, message, details } }` format
- Short ID support — task and agenda methods accept either UUID or short ID string
- Query parameter support for filterable endpoints (tasks by status/transcript_id, audit by entity_type/user_id/date_range)
- Pagination support for list endpoints

### Out of Scope
- No HTTP server or API implementation (that is the API layer, features 07-17)
- No token issuance or login flows (that is auth-client, feature 06)
- No UI components or terminal CLI logic
- No direct database or external service access
- No caching layer (consumers manage their own caching)

## Key Decisions
- The api-client is a shared library, not an app — it does not run independently. It is imported by UI, Mastra, and terminal tools.
- Token attachment is done via a configurable interceptor/middleware pattern so consumers can provide tokens from different sources (httpOnly cookie in UI, file-based in terminal, env var in Mastra).
- The client should accept an abstract token provider interface (e.g., `getAccessToken(): Promise<string>`, `refreshToken(): Promise<string>`) so each consumer injects its own auth strategy.
- All methods use types from `packages/shared-types/` — no duplicated type definitions.
- The `/shared/{token}` endpoint does not require auth token attachment (public endpoint).
- The client should handle HTTP errors and map them to typed error objects, so consumers can handle specific error codes (e.g., `TASK_NOT_APPROVABLE`, `FORBIDDEN`) programmatically.
