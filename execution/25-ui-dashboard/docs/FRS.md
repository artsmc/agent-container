# FRS — Functional Requirement Specification
# Feature 25: UI Dashboard (`ui-dashboard`)

**Route:** `/`
**Date:** 2026-03-03

---

## 1. Page Overview

The Dashboard page (`app/page.tsx` within the authenticated app router) renders inside `DashboardLayout`. It is composed of three independent sections:

1. **Client Cards Grid** — A grid of cards, one per active client.
2. **Pending Approvals Panel** — An aggregated list of all `draft` tasks across all clients.
3. **Recent Activity Feed** — A chronological log of recent system actions.

The three sections are independently loaded and independently display loading/empty states. A failure in one section must not prevent the others from rendering.

---

## 2. Client Cards Grid

### 2.1 Data Source

- `GET /clients` — Returns all clients accessible to the authenticated user.
- `GET /clients/{id}/status` — Returns cycle overview per client: pending draft task count, current agenda status, next scheduled call date.

The page initiates all status requests in parallel after the client list resolves (`Promise.allSettled` so individual failures are handled gracefully).

### 2.2 Card Content

Each card must display:

| Element | Description | Source |
|---|---|---|
| Client name | Primary heading of the card | `GET /clients` response |
| Pending draft tasks badge | Integer count. If 0, badge is hidden or shown as "None". | `GET /clients/{id}/status` → `pending_draft_count` |
| Agenda status badge | One of: `draft`, `in_review`, `finalized`, `shared`. Color-coded per status (see TR.md for token mapping). | `GET /clients/{id}/status` → `agenda_status` |
| Next call date | Human-readable date (e.g. "Mar 10"). If not set, show "No call scheduled". | `GET /clients/{id}/status` → `next_call_date` |
| "View Tasks" button | Secondary CTA. Navigates to `/clients/{id}/tasks`. | Static per card |
| "View Agenda" button | Secondary CTA. Navigates to `/clients/{id}/agendas`. | Static per card |

### 2.3 Grid Layout

- Cards are arranged in a responsive grid: 3 columns on desktop (≥1280px), 2 columns on tablet (≥768px), 1 column on mobile.
- Cards have consistent minimum height. Content does not overflow the card — long client names are truncated with ellipsis.

### 2.4 Loading State

- While `GET /clients` is in flight, render a grid of skeleton cards (same dimensions as real cards, animated shimmer effect using design tokens).
- Number of skeleton cards: 6 (sensible default before count is known).

### 2.5 Empty State

- If `GET /clients` returns an empty array, render a single card spanning the full grid width: "No clients found. Contact your administrator to be assigned client access."
- If `GET /clients/{id}/status` fails for a specific client, that card still renders with the client name and "—" for the status fields, plus a subtle inline error indicator.

### 2.6 Error State

- If `GET /clients` itself fails with a non-401 error, replace the grid with an error banner: "Could not load clients. Try refreshing the page." with a retry button that re-triggers the fetch.
- 401 responses are handled globally by the auth layer (redirect to login).

---

## 3. Pending Approvals Panel

### 3.1 Data Source

- `GET /clients/{id}/tasks?status=draft` — Called for each client returned by `GET /clients`. All results are merged into a single list sorted by task short ID ascending.

Implementation note: since the client list is already fetched for the cards grid, reuse that result. Do not call `GET /clients` a second time.

### 3.2 Panel Content

The panel is a scrollable list. Each row displays:

| Column | Description | Example |
|---|---|---|
| Short ID | `TSK-####` format, monospace font, clickable | `TSK-0042` |
| Title | Task title, truncated at ~60 characters with title tooltip on hover | "Set up onboarding automation for Q2" |
| Client | Client name, subdued secondary text | "Acme Corp" |
| Estimated time | Formatted as `Xh Ym`. If not set, show "—" | "2h 30m" |

### 3.3 Interaction

- Clicking any row (or the short ID link) navigates to the task review screen for that client: `/clients/{client_id}/tasks` with the task short ID passed as a query param or hash anchor so the task review screen can scroll to/highlight that task.
  - Route: `/clients/{client_id}/tasks?task={short_id}`

### 3.4 Sorting

- Default sort: task short ID ascending (earliest tasks first).
- No user-controlled sorting on the dashboard. Full sorting is available on the task review screen (feature 27).

### 3.5 Pagination / Truncation

- Dashboard panel shows a maximum of 20 rows.
- If total draft task count exceeds 20, show a footer link: "View all {N} pending tasks" which navigates to a filtered task view (aggregate URL TBD by feature 27 — leave as a placeholder link for now).

### 3.6 Loading State

- Render a skeleton list of 5 rows while tasks are being fetched.

### 3.7 Empty State

- If no draft tasks exist across any client, render: "No tasks pending approval. All caught up."

### 3.8 Error State

- If one or more client task fetches fail, render the tasks that did load and show a non-blocking warning banner above the list: "Some clients could not be loaded. Showing partial results."

---

## 4. Recent Activity Feed

### 4.1 Data Source

- `GET /audit` — Filterable by `date_range`. Dashboard fetches the most recent 20 entries (e.g. `?limit=20&sort=desc`).

### 4.2 Feed Entry Content

Each entry displays:

| Element | Description |
|---|---|
| Actor | User avatar (initials-based if no photo) + user full name |
| Action description | Human-readable string. See action types below. |
| Timestamp | Relative time ("2 hours ago") with absolute date/time on hover as a tooltip |

### 4.3 Action Types

The audit log records the following action types. The UI must render a human-readable description for each:

| Action Type | Rendered Description |
|---|---|
| `task.approved` | "Approved task TSK-####" |
| `task.rejected` | "Rejected task TSK-####" |
| `task.pushed` | "Pushed task TSK-#### to Asana" |
| `agenda.shared` | "Shared agenda AGD-#### with client [Client Name]" |
| `agenda.finalized` | "Finalized agenda AGD-####" |
| `email.sent` | "Sent email for agenda AGD-####" |
| `workflow.triggered` | "Triggered [workflow name] for [Client Name]" |
| Unknown type | "Performed action on [entity type] [entity ID]" |

### 4.4 Loading State

- Render a skeleton feed of 5 entries while the audit log is in flight.

### 4.5 Empty State

- If the audit log returns no entries: "No recent activity."

### 4.6 Error State

- If `GET /audit` fails, show: "Activity feed unavailable." — do not block the rest of the page.

---

## 5. Navigation

The dashboard provides navigation to all downstream screens via:

- Client card "View Tasks" button → `/clients/{id}/tasks`
- Client card "View Agenda" button → `/clients/{id}/agendas`
- Pending approvals panel row click → `/clients/{id}/tasks?task={short_id}`
- Left sidebar navigation (from `DashboardLayout`, feature 23) → other top-level screens

---

## 6. Authentication

The dashboard page is only accessible to authenticated users. If the OIDC session is missing or expired:

- The Next.js middleware (established in feature 24) redirects to the login page before the dashboard renders.
- The dashboard page itself does not implement its own auth check — it relies on the middleware.

---

## 7. Data Freshness

- Dashboard data is fetched on each page load. There is no client-side auto-refresh or WebSocket subscription (deferred).
- A "Refresh" button or keyboard shortcut is not required in this feature — full-page refresh is acceptable for MVP.

---

## 8. Accessibility

- All interactive elements (card buttons, panel rows) are keyboard-focusable and have visible focus rings (from design tokens).
- Short ID links have descriptive `aria-label` attributes (e.g. `aria-label="Review task TSK-0042"`).
- Status badges include `aria-label` text matching their visual label (e.g. `aria-label="Agenda status: in review"`).
- Skeleton loading states include `aria-busy="true"` on their container with `aria-label="Loading clients"`.

---

## 9. User Workflows

### Workflow A: Account Manager Reviews Daily Queue

1. Account manager logs in → lands on `/` (dashboard).
2. Sees client cards grid — notes 3 clients have pending badge counts > 0.
3. Sees pending approvals panel — 7 tasks listed.
4. Clicks a row in the pending approvals panel (e.g. TSK-0042).
5. Navigates to `/clients/acme-corp/tasks?task=TSK-0042` (task review screen, feature 27).

### Workflow B: Account Manager Checks Client Agenda Status

1. Account manager on dashboard.
2. Sees client card for "Globex Corp" — agenda status badge shows `in_review`.
3. Clicks "View Agenda" on the Globex Corp card.
4. Navigates to `/clients/globex-corp/agendas` (agenda list screen, feature 28).

### Workflow C: Account Manager Monitors Recent Activity

1. Account manager returns from a meeting.
2. Checks the recent activity feed on the dashboard.
3. Sees "Alice approved task TSK-0038 — 1 hour ago".
4. No action needed — stays on dashboard.
