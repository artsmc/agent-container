# Feature 26: UI Client Detail

## Summary
Build Screen 2 (Client Detail) at route `/clients/{client_id}`. Includes a header with client info and tabs for: Tasks (links to task review), Agendas (list), Transcripts (list with call dates and processing status), Settings (client config: default workspace, project, email recipients), and History (imported records, read-only).

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding), 24 (UI auth flow), 22 (api-client)
- **Blocks**: None directly (peer screens 27, 28 are linked from tabs but built independently)

## Source PRDs
- `ui-prd.md` — Screen 2: Client Detail

## Relevant PRD Extracts

### Screen 2: Client Detail (ui-prd.md)

**Route:** `/clients/{client_id}`

Everything related to a single client in one place.

**Layout:**
- **Header** — Client name, default Asana workspace, Grain playlist link.
- **Tabs:**
  - **Tasks** — Filtered task list for this client (see Screen 3).
  - **Agendas** — List of all agendas/Running Notes for this client (see Screen 5).
  - **Transcripts** — List of ingested transcripts with call dates and processing status.
  - **Settings** — Client config: default Asana workspace, default Asana project, email recipient list, routing rules.
  - **History** — Imported historical records (if client was reactivated). Read-only.

### Client Entity (from shared-types/database)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | VARCHAR | Client name (e.g., "Total Life") |
| `grain_playlist_id` | VARCHAR | Reference to the client's Grain playlist |
| `default_asana_workspace_id` | VARCHAR | Default Asana workspace for task routing |
| `default_asana_project_id` | VARCHAR | Default Asana project within the workspace |
| `email_recipients` | JSONB | Default recipient list for agenda distribution |

### API Endpoints Used
- `GET /clients/{id}` — Get client details including config and defaults
- `GET /clients/{id}/tasks` — List tasks for this client (Tasks tab)
- `GET /clients/{id}/agendas` — List agendas for this client (Agendas tab)
- `GET /clients/{id}/transcripts` — List transcripts for this client (Transcripts tab)
- `PATCH /clients/{id}` — Update client config (Settings tab)
- `GET /clients/{id}/import/status` — Check import status (History tab)

### Client Reactivation & Historical Import (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/import` | POST | Trigger on-demand import of historical data for a returning client |
| `/clients/{id}/import/status` | GET | Check status of a running import |

All imported records are flagged with `is_imported = true` and marked read-only.

### Design Direction (ui-prd.md)
- Tab-based workflows — multi-step flows presented as tabs rather than separate pages
- Left sidebar navigation — persistent nav for switching between views/clients

## Scope

### In Scope
- Client detail page at route `/clients/{client_id}` within DashboardLayout
- Client header component:
  - Client name
  - Default Asana workspace name
  - Grain playlist link (external link)
- Tab navigation component with five tabs:
  - **Tasks tab** — Filtered task list for this client (renders task list component or links to `/clients/{client_id}/tasks` for full task review)
  - **Agendas tab** — List of agendas/Running Notes for this client with short ID, cycle dates, status badge, last edited info
  - **Transcripts tab** — List of transcripts with call date, call type, processing status (processed/pending)
  - **Settings tab** — Editable client config form:
    - Default Asana workspace (dropdown from `/asana/workspaces`)
    - Default Asana project (dropdown filtered by selected workspace)
    - Email recipients (editable list)
    - Routing rules
  - **History tab** — Read-only list of imported historical records (flagged with `is_imported = true`)
- Data fetching via api-client per tab (lazy-load tab content)
- Loading, empty, and error states per tab

### Out of Scope
- Full task review with inline editing (feature 27 — the Tasks tab provides a summary list or link)
- Agenda editing (feature 28 — Agendas tab links to the agenda editor)
- Transcript submission/upload (handled via workflow trigger, feature 30)
- Historical import triggering (feature 38)
- Client creation/deletion (admin functionality, not in current scope)

## Key Decisions
- The Tasks tab in client detail can either embed a simplified task list or navigate to the full task review screen (`/clients/{client_id}/tasks`). The full task review (feature 27) provides inline editing and batch actions; the client detail Tasks tab may show a summary view.
- The Agendas tab shows agenda cards similar to Screen 5 (Agenda List). Clicking an agenda navigates to the agenda editor (`/agendas/{short_id}`).
- The Settings tab allows direct editing of client configuration via `PATCH /clients/{id}`. Changes are saved inline.
- The History tab is read-only — imported records cannot be edited through the UI. They are flagged with `is_imported = true`.
- Tab content is lazy-loaded — only the active tab's data is fetched, not all tabs simultaneously.
