# Feature 25: UI Dashboard

## Summary
Build Screen 1 (Dashboard/Home) at route `/`. Displays a client cards grid (name, pending tasks badge, agenda status, next call date, quick actions), a pending approvals panel (aggregated draft tasks across clients with short ID, title, client, estimated time), and a recent activity feed.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding — layouts, component stubs, design tokens), 24 (UI auth flow — dashboard requires authenticated user), 22 (api-client — data fetching)
- **Blocks**: None (leaf screen — other screens are navigated to from here but not blocked by it)

## Source PRDs
- `ui-prd.md` — Screen 1: Dashboard, design inspiration for dashboard

## Relevant PRD Extracts

### Screen 1: Dashboard (Home) (ui-prd.md)

**Route:** `/`

The landing page for authenticated users. Provides an at-a-glance overview of all client activity.

**Layout:**
- **Client cards** — Grid of active clients, each showing:
  - Client name
  - Pending draft tasks count (badge)
  - Current agenda status (`draft`, `in_review`, `finalized`, `shared`)
  - Next scheduled call date (if known)
  - Quick-action buttons: "View Tasks", "View Agenda"
- **Pending approvals panel** — Aggregated list of all draft tasks across clients awaiting review. Each row shows short ID, title, client, and estimated time. Clicking navigates to the task review screen.
- **Recent activity feed** — Chronological log of recent actions: tasks approved, agendas shared, emails sent, workflows triggered. Each entry shows who, what, and when.

### Dashboard Design Inspiration (ui-prd.md)

| File | Key Takeaways |
|---|---|
| `image.png` | Kanban-style task board with slide-over detail panel. Left nav + grouped task list. The slide-over detail panel pattern — clicking a task opens a rich sidebar without leaving the list view. |
| `image copy.png` | AI-powered meeting notes with chat sidebar. Two-panel layout. Summarized Notes with sections (Key Topics, Decisions Made, Pending Actions) maps to Running Notes format. Action items as table with assignee and date. Quick-action chip buttons for common operations. |
| `image copy 2.png` | Timeline-based meeting history with action items. Chronological feed of meetings with attendees (avatar chips), key points, and checkable next actions. Good for client history / transcript list. |

### Design Direction Summary (ui-prd.md)
- Clean, minimal aesthetic — white/light backgrounds, generous whitespace, subtle borders
- Left sidebar navigation — persistent nav for switching between views/clients
- Action bars — primary actions as prominent CTAs
- Avatar chips — team members shown as small circular avatars

### API Endpoints Used
- `GET /clients` — List all clients accessible to the authenticated user (for client cards)
- `GET /clients/{id}/status` — Cycle overview per client (pending approvals, agenda readiness, next call)
- `GET /clients/{id}/tasks?status=draft` — Draft tasks across clients (for pending approvals panel)
- `GET /audit` — Recent activity feed (filterable by date_range)

## Scope

### In Scope
- Dashboard page at route `/` within DashboardLayout
- Client cards grid component:
  - Client name
  - Pending draft tasks count as badge
  - Current agenda status badge (`draft`, `in_review`, `finalized`, `shared`)
  - Next scheduled call date
  - Quick-action buttons: "View Tasks" (links to `/clients/{id}/tasks`), "View Agenda" (links to `/clients/{id}/agendas`)
- Pending approvals panel component:
  - Aggregated list of all draft tasks across all accessible clients
  - Each row: short ID (`TSK-####`), title, client name, estimated time
  - Clicking a row navigates to the task review screen for that client
- Recent activity feed component:
  - Chronological log of recent actions
  - Each entry: who (user avatar/name), what (action description), when (timestamp)
  - Action types: tasks approved, agendas shared, emails sent, workflows triggered
- Data fetching via api-client
- Loading and empty states
- Responsive layout using design tokens

### Out of Scope
- Client detail pages (feature 26)
- Task review functionality (feature 27)
- Agenda editing (feature 28)
- Workflow triggering from dashboard (feature 30)
- Real-time updates / WebSocket (open question in PRD)

## Key Decisions
- The dashboard aggregates data across all clients the user has access to. It calls the client list and status endpoints, not individual detail endpoints for every entity.
- The pending approvals panel pulls draft tasks across all clients, not just the currently selected client. This provides a single view of everything needing attention.
- The recent activity feed uses the audit log endpoint. The audit log stores who, what, and when for all system actions.
- Client cards use the `/clients/{id}/status` endpoint for cycle overview data rather than making separate calls for tasks, agendas, and transcripts per client.
- Navigation from dashboard to detail screens uses client-scoped routes (`/clients/{id}/tasks`, `/clients/{id}/agendas`).
