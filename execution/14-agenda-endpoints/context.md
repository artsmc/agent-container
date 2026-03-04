# Feature 14: Agenda Endpoints

## Summary
Implement CRUD and lifecycle endpoints for agendas (Running Notes documents). This includes creation with auto-assigned short IDs, listing, detail with version history, editing, finalization, sharing via generated URLs, email distribution, Google Docs export, and public shared access without authentication.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 07 (API Scaffolding — routing, middleware, error handling framework), 04 (Product Database Schema — Agendas and Agenda Versions tables), 01 (Shared Types — Agenda, AgendaVersion types)
- **Blocks**: 15 (Google Docs Adapter — called via POST /agendas/{id}/export), 16 (Email Adapter — called via POST /agendas/{id}/email), 20 (Workflow B Agenda Agent — calls POST /clients/{id}/agendas to save draft agendas), 28 (UI Agenda Editor)

## Source PRDs
- api-prd.md (Agenda endpoints, Agenda Lifecycle, Business Logic)
- database-prd.md (Agendas entity, Agenda Versions entity, Agenda Lifecycle)

## Relevant PRD Extracts

### Agenda Endpoints (api-prd.md)

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

### Agenda Lifecycle (api-prd.md)

> - Agendas can only be shared or emailed if `status = finalized`.
> - Finalizing requires at least one edit or explicit confirmation (prevents accidental sharing of raw agent output).

### Agenda Lifecycle (database-prd.md)

```
agent generates -> draft -> in_review -> (human edits) -> finalized -> shared
                                                               |
                                                        emailed / exported to Google Docs
```

### Agendas Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `short_id` | VARCHAR | Human-readable ID (e.g., `AGD-0001`). Auto-generated, globally unique, immutable. |
| `client_id` | UUID | FK to Clients |
| `status` | ENUM | `draft`, `in_review`, `finalized`, `shared` |
| `content` | TEXT | The agenda/Running Notes content (markdown or rich text) |
| `cycle_start` | DATE | Start of the task cycle this agenda covers |
| `cycle_end` | DATE | End of the task cycle |
| `shared_url_token` | VARCHAR | Token for the client-facing read-only link |
| `internal_url_token` | VARCHAR | Token for the internal edit link |
| `google_doc_id` | VARCHAR | Google Doc ID after export (nullable) |
| `finalized_by` | UUID | FK to Users |
| `finalized_at` | TIMESTAMP | |
| `shared_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### Agenda Versions Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `agenda_id` | UUID | FK to Agendas |
| `version` | INTEGER | Incrementing version number |
| `content` | TEXT | Content at this version |
| `edited_by` | UUID | FK to Users |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

### Data Scoping (api-prd.md)

> - Every query is scoped to the authenticated user's accessible clients.
> - A user cannot access tasks, agendas, or transcripts for clients they don't have permissions for.

### Indexes (database-prd.md)

- `agendas(short_id)` — UNIQUE — lookup by human-readable ID
- `agendas(client_id, status)` — "Get the current draft agenda for Total Life"
- `agendas(shared_url_token)` — Client-facing link lookups

## Scope

### In Scope
- POST /clients/{id}/agendas — create a draft agenda with auto-assigned short ID (AGD-####), save initial version to Agenda Versions
- GET /clients/{id}/agendas — list agendas for a client, filterable by status
- GET /agendas/{id} — get agenda detail with version history, accepts UUID or short ID (AGD-####)
- PATCH /agendas/{id} — edit agenda content, create new version record, track edited_by and source
- POST /agendas/{id}/finalize — transition status to finalized, enforce lifecycle rules (must have at least one edit or explicit confirmation)
- POST /agendas/{id}/share — generate shareable URL tokens (client read-only + internal edit), set status to shared
- POST /agendas/{id}/email — delegate to email adapter (feature 16), enforce finalized status requirement
- POST /agendas/{id}/export — delegate to Google Docs adapter (feature 15), store resulting google_doc_id
- GET /shared/{token} — public endpoint, no authentication required, retrieve agenda by shared_url_token
- Short ID resolution (AGD-#### to UUID) transparent to callers
- Audit log entries for all state transitions (created, edited, finalized, shared, emailed, exported)
- Proper error responses: AGENDA_NOT_FINALIZABLE (422), CLIENT_NOT_FOUND (404), UNAUTHORIZED (401), FORBIDDEN (403)

### Out of Scope
- Google Docs conversion logic (that is feature 15)
- Email sending logic (that is feature 16)
- Agenda content generation by the Mastra agent (that is feature 20)
- Collaborative real-time editing (that is a UI concern, feature 28)
- Rich text storage format decision (open question in database-prd.md)

## Key Decisions
- Short IDs (AGD-####) are auto-generated on creation and are globally unique and immutable. The API accepts both UUID and short ID for all agenda endpoints and resolves transparently.
- Agenda lifecycle is strictly enforced: sharing and emailing require `status = finalized`. Finalizing requires at least one human edit or explicit confirmation to prevent accidental distribution of raw agent output.
- Version history is immutable. Every edit creates a new Agenda Version record. The original agent-generated content is always recoverable.
- The `/shared/{token}` endpoint is public and requires no authentication. It serves the read-only client-facing view of a finalized agenda.
- The email and export endpoints delegate to their respective adapters (features 15 and 16) but the agenda endpoint owns the lifecycle checks and audit logging.
