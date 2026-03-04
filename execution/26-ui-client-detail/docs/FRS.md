# FRS — Functional Requirement Specification
## Feature 26: UI Client Detail
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for all components and behaviours delivered in feature 26. Requirements are identified with unique IDs for traceability to GS.md scenarios and TR.md technical details.

The page at `/clients/{client_id}` consists of:
- A client header (REQ-26-HDR)
- A tab navigation bar (REQ-26-TAB)
- Five tab content panels: Tasks (REQ-26-TASKS), Agendas (REQ-26-AGD), Transcripts (REQ-26-TRN), Settings (REQ-26-SET), History (REQ-26-HIST)

---

## 2. Page Route and Layout

### REQ-26-ROUTE-01: Route Registration

The page must be registered at `app/(dashboard)/clients/[client_id]/page.tsx` within the Next.js App Router. The `[client_id]` segment is a UUID string.

### REQ-26-ROUTE-02: DashboardLayout Wrapping

The page must render within `DashboardLayout` (inherited from the `(dashboard)` route group layout). No additional layout wrapper is needed at the page level.

### REQ-26-ROUTE-03: Initial Data Fetch

On page load, the component must call `GET /clients/{client_id}` via the api-client to retrieve the client entity. This call is made in a server component or via a `useEffect`/React Query hook. The page must not render tab content until the client entity is loaded.

### REQ-26-ROUTE-04: 404 and Error Handling

If `GET /clients/{client_id}` returns `404`, the page must render a "Client not found" error state. If it returns any other error status, a generic error state must be shown with a retry option.

---

## 3. Client Header

### REQ-26-HDR-01: Client Name

The header must display the client's `name` field prominently as a page-level heading (`<h1>`).

### REQ-26-HDR-02: Default Asana Workspace

The header must display the `default_asana_workspace_id` resolved to a human-readable workspace name. If no workspace is configured, display "No default workspace" in a muted style.

### REQ-26-HDR-03: Grain Playlist Link

If `grain_playlist_id` is set, the header must render an external link ("View Grain Playlist") that opens the Grain playlist in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). If `grain_playlist_id` is null or empty, the link must not be shown.

### REQ-26-HDR-04: Loading State

While `GET /clients/{client_id}` is in flight, the header must render a skeleton loading state (three placeholder lines) rather than empty content.

---

## 4. Tab Navigation

### REQ-26-TAB-01: Tab List

The tab navigation must render exactly five tabs in this order:
1. Tasks
2. Agendas
3. Transcripts
4. Settings
5. History

### REQ-26-TAB-02: Default Active Tab

The default active tab is **Tasks**. The first tab is active on initial page load.

### REQ-26-TAB-03: Tab State via URL Search Param

The active tab must be reflected in (and controlled by) the URL search parameter `?tab=tasks|agendas|transcripts|settings|history`. This allows deep-linking to a specific tab. If no `tab` param is present, `tasks` is the default.

### REQ-26-TAB-04: Lazy Loading

Tab content is lazy-loaded. A tab's data is fetched only when that tab is first activated. Switching back to a previously loaded tab must use cached data (no re-fetch on tab switch unless explicitly refreshed).

### REQ-26-TAB-05: Active Tab Indicator

The active tab must be visually distinguished using the active state styling from `ui-tokens` (e.g., a bottom border in `$color-primary`, or a filled background).

### REQ-26-TAB-06: Loading State Per Tab

When a tab is first activated and its data is being fetched, the tab panel must show a loading skeleton appropriate to the content type (table skeleton for Tasks/Transcripts/History, card skeleton for Agendas, form skeleton for Settings).

### REQ-26-TAB-07: Error State Per Tab

If a tab's data fetch fails, the tab panel must show an error message with a "Retry" button that re-triggers the fetch. The error must not affect other tabs.

### REQ-26-TAB-08: Empty State Per Tab

If a tab's data fetch succeeds but returns an empty collection, the tab panel must show an appropriate empty state message. Examples:
- Tasks: "No tasks for this client yet."
- Agendas: "No agendas created yet."
- Transcripts: "No transcripts ingested yet."
- History: "No imported records." (only shown if `is_imported` records exist)

---

## 5. Tasks Tab

### REQ-26-TASKS-01: Summary Task List

The Tasks tab renders a summary task list for this client. This is NOT the full inline-editable task review table (that is feature 27). It shows a condensed read-only list of recent tasks.

### REQ-26-TASKS-02: Summary Columns

The summary list must display per task:
- Short ID (`TSK-####`) — clickable, navigates to `/clients/{client_id}/tasks` and highlights/opens that task
- Title (truncated at 60 characters with ellipsis if longer)
- Status badge (`draft`, `approved`, `rejected`, `pushed`, `completed`)
- Assignee (initials avatar)

### REQ-26-TASKS-03: Row Limit

The summary list shows a maximum of 10 tasks, ordered by creation date descending (newest first). If more than 10 tasks exist, a "View all tasks" link must appear below the list, navigating to `/clients/{client_id}/tasks` (the full Task Review screen, feature 27).

### REQ-26-TASKS-04: "Review All Tasks" Navigation

A primary action button "Review Tasks" must appear in the tab panel header. Clicking it navigates to `/clients/{client_id}/tasks`.

### REQ-26-TASKS-05: Data Source

Data is fetched from `GET /clients/{id}/tasks`. The request must include a `limit=10` query parameter and sort by `created_at` descending.

---

## 6. Agendas Tab

### REQ-26-AGD-01: Agenda Card List

The Agendas tab renders a list of agenda cards, one per agenda returned from `GET /clients/{id}/agendas`. Cards are ordered by cycle start date descending (most recent first).

### REQ-26-AGD-02: Agenda Card Content

Each agenda card must display:
- Short ID (`AGD-####`) in a monospace style
- Cycle dates formatted as `MMM D, YYYY → MMM D, YYYY`
- Status badge with variants: `draft` (default), `in_review` (info), `finalized` (success), `shared` (primary)
- Last edited by: user display name (or "Agent" if source is agent) and relative timestamp (e.g., "2 hours ago")

### REQ-26-AGD-03: Card Actions

Each agenda card must include an "Edit" button that navigates to `/agendas/{short_id}`. No inline editing of agendas occurs on this screen.

### REQ-26-AGD-04: "Create Agenda" Placeholder

A placeholder note must appear at the top of the tab: "Agendas are created automatically by the intake workflow." No "New Agenda" button is shown (agenda creation is handled by Mastra, feature 20).

---

## 7. Transcripts Tab

### REQ-26-TRN-01: Transcript List

The Transcripts tab renders a table of ingested transcripts from `GET /clients/{id}/transcripts`, ordered by call date descending.

### REQ-26-TRN-02: Transcript Columns

Each row must display:
- Call date (formatted as `MMM D, YYYY`)
- Call type (e.g., "Intake Call", "Follow-up Call" — displayed as a text label)
- Processing status badge: `processed` (success) or `pending` (warning)
- Short transcript identifier if available

### REQ-26-TRN-03: No Actions

The Transcripts tab is read-only. No edit, delete, or reprocess actions are available on this screen. Transcript submission belongs to feature 30.

---

## 8. Settings Tab

### REQ-26-SET-01: Settings Form

The Settings tab renders an editable form for the client's configuration. The form must contain the following fields:

| Field | Input Type | Source | Validation |
|---|---|---|---|
| Default Asana Workspace | Dropdown | `GET /asana/workspaces` | Required |
| Default Asana Project | Dropdown | `GET /asana/workspaces/{id}/projects` (filtered by selected workspace) | Optional |
| Email Recipients | Editable tag list | `client.email_recipients` (JSONB) | Valid email format per entry |
| Routing Rules | Text area or structured field | `client.routing_rules` | Valid JSON / structured format |

### REQ-26-SET-02: Workspace Dropdown Cascade

When the Default Asana Workspace selection changes, the Default Asana Project dropdown must reset and reload its options filtered to the newly selected workspace.

### REQ-26-SET-03: Email Recipients Input

The email recipients field must allow:
- Adding a new recipient by typing an email address and pressing Enter or clicking "Add"
- Removing a recipient by clicking an "x" button on its tag chip
- Displaying existing recipients as tag chips

### REQ-26-SET-04: Save Action

A "Save Settings" button must appear below the form. Clicking it submits a `PATCH /clients/{id}` request with the updated fields. The button must be disabled while a save is in progress.

### REQ-26-SET-05: Save Feedback

On successful save, display an inline success message ("Settings saved") for 3 seconds, then fade out. On error, display an inline error message with the API error detail.

### REQ-26-SET-06: Dirty State Detection

If the user modifies any field and attempts to navigate to another tab or leave the page without saving, display a browser `confirm()` dialog: "You have unsaved settings changes. Leave without saving?"

### REQ-26-SET-07: Loading State

While the workspace dropdown options are being fetched (`GET /asana/workspaces`), the dropdown must show a "Loading workspaces..." disabled state.

---

## 9. History Tab

### REQ-26-HIST-01: Imported Records Table

The History tab renders a read-only table of records where `is_imported = true`, fetched from `GET /clients/{id}/import/status`. Records are ordered by import date descending.

### REQ-26-HIST-02: Record Columns

Each row must display:
- Record type (e.g., "Task", "Agenda", "Transcript")
- Short ID or title
- Import date
- Source (description of the original import batch)

### REQ-26-HIST-03: Read-Only Enforcement

No edit, approve, reject, or delete controls must appear on any imported record in this tab. Each row must display an "Imported" badge to make its status clear.

### REQ-26-HIST-04: Empty State

If no imported records exist for this client, the tab must display: "No historical records have been imported for this client." This is the expected state for new clients who have never been reactivated.

---

## 10. Component Reuse

The following components from feature 23 (ui-scaffolding) must be used and fleshed out as needed:

| Component | Used In |
|---|---|
| `Badge` | Status badges on every tab (tasks, agendas, transcripts, history) |
| `Card` | Agenda cards in Agendas tab |
| `Avatar` | Assignee initials in Tasks tab, last-edited-by in Agendas tab |
| `Button` | Tab actions, Save Settings, Review Tasks, Edit (per agenda card) |
| `Table` / `TableRow` | Tasks summary, Transcripts, History |
| `InlineEdit` | Settings tab fields (optional — or standard form inputs with save button) |

New components introduced by this feature:
- `ClientHeader` — client name, workspace, Grain link
- `TabNav` / `TabPanel` — tab navigation and content wrapper
- `TagInput` — email recipients editable tag list (Settings tab)

---

## 11. Error Handling and Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| `GET /clients/{id}` returns 404 | Render "Client not found" full-page error state with back navigation |
| `GET /clients/{id}` returns 500 | Render generic error state with retry button |
| Tab data fetch fails | Show error state within the tab panel; other tabs unaffected |
| `PATCH /clients/{id}` fails on save | Inline error message; form data preserved, user can retry |
| `grain_playlist_id` is null | Grain link not rendered; no broken link |
| Workspace dropdown fetch fails | Show error state within the dropdown; save is blocked until resolved |
| Client has 0 tasks | Tasks tab shows empty state: "No tasks for this client yet." |
| Client has 0 agendas | Agendas tab shows empty state: "No agendas created yet." |
| Tab URL param is invalid (e.g., `?tab=invalid`) | Fall back to default tab (Tasks) |

---

## 12. Accessibility Requirements

- Tab navigation must be keyboard accessible: arrow keys navigate between tabs, Enter/Space activates a tab.
- All form inputs in the Settings tab must have associated `<label>` elements.
- Status badges must include `aria-label` attributes for screen readers (e.g., `aria-label="Status: approved"`).
- The Grain playlist link must include `aria-label="View Grain Playlist for {client name} (opens in new tab)"`.
- Empty states must use `role="status"` to announce to screen readers.
- Loading skeletons must use `aria-busy="true"` on their container.
