# FRS — Functional Requirement Specification
## Feature 27: UI Task Review
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Overview

Feature 27 implements two screens:
- **Screen 3 — Task Review** at `/clients/{client_id}/tasks`: a full task management table with filter bar, batch action bar, and inline-editable rows.
- **Screen 4 — Task Detail** as a slide-over panel: rich text editor, version history, source transcript link, and action buttons.

Requirements are grouped by component and identified with unique IDs for traceability.

---

## 2. Page Route and Layout

### REQ-27-ROUTE-01: Route Registration

The Task Review page must be registered at `app/(dashboard)/clients/[client_id]/tasks/page.tsx`.

### REQ-27-ROUTE-02: Alternate Entry via Transcript Filter

The page must also handle the route `/tasks?transcript={transcript_id}` — a global tasks view pre-filtered to a specific transcript. When `transcript_id` is present in query params, the transcript filter dropdown must pre-select that transcript on load.

### REQ-27-ROUTE-03: DashboardLayout

The page renders within `DashboardLayout`. No additional layout wrapper needed.

### REQ-27-ROUTE-04: Initial Data Load

On page load, the component calls `GET /clients/{client_id}/tasks` (with active filter params) to populate the table. A loading skeleton of the table must show while the request is in flight.

---

## 3. Filter Bar

### REQ-27-FILTER-01: Status Filter

A dropdown filter for task status. Options: All, `draft`, `approved`, `rejected`, `pushed`, `completed`. Default is "All" (no filter applied). Changing the selection re-fetches the task list with `?status={value}`.

### REQ-27-FILTER-02: Transcript Filter

A dropdown filter listing all transcripts for this client (from `GET /clients/{id}/transcripts`). Options: "All Transcripts" plus one entry per transcript (call date + call type). Selecting a transcript re-fetches with `?transcript_id={id}`.

### REQ-27-FILTER-03: Assignee Filter

A dropdown filter listing all unique assignees across the client's tasks. Options: "All Assignees" plus one entry per unique assignee. Selecting an assignee re-fetches with `?assignee_id={id}`.

### REQ-27-FILTER-04: Filter Persistence in URL

All active filter values must be reflected as URL search params so the filtered view can be shared or bookmarked.

### REQ-27-FILTER-05: Filter Clear

A "Clear filters" link or button must appear when any non-default filter is active. Clicking it resets all filters to their defaults and re-fetches.

---

## 4. Batch Action Bar

### REQ-27-BATCH-01: Visibility

The batch action bar is hidden when no tasks are selected. It becomes visible when one or more checkboxes in the task table are checked.

### REQ-27-BATCH-02: Selection Count

The batch action bar must display the number of currently selected tasks: "{n} task(s) selected".

### REQ-27-BATCH-03: Select All / Deselect All

A "Select all" checkbox or button selects all tasks currently visible in the table (matching active filters). If all visible tasks are selected, the control shows "Deselect all".

### REQ-27-BATCH-04: Batch Approve

A "Approve" button sends `POST /clients/{id}/tasks/approve` with the list of selected task IDs. The button must be disabled during the request. On success, selected tasks' status badges update to `approved` without full page reload. On error, display inline error.

### REQ-27-BATCH-05: Batch Reject

A "Reject" button sends a batch reject request. Same pattern as batch approve. On success, selected tasks update to `rejected`.

### REQ-27-BATCH-06: Batch Assign Workspace

A "Assign Workspace" dropdown in the batch bar allows setting the Asana workspace for all selected tasks. Options populated from `GET /asana/workspaces`. Selecting a workspace sends `PATCH /tasks/{id}` for each selected task (or a batch endpoint if available). On success, the workspace column for all selected tasks updates.

### REQ-27-BATCH-07: Role Restriction

The batch approve and batch push buttons must not be visible to users with the `team_member` role.

---

## 5. Task Table

### REQ-27-TABLE-01: Column Definitions

The task table must render the following columns in order:

| # | Column | Behaviour |
|---|---|---|
| 1 | Checkbox | Batch selection toggle per row |
| 2 | Short ID | `TSK-####` — monospace, clickable — opens task detail slide-over |
| 3 | Title | Inline-editable text (click to edit in place) |
| 4 | Assignee | Inline-editable dropdown (team members list) |
| 5 | Estimated Time | Inline-editable time input; stored as ISO 8601 duration (e.g., `PT2H30M`), displayed as human-readable (e.g., "2h 30m") |
| 6 | Scrum Stage | Inline-editable dropdown (Scrum stages from shared-types) |
| 7 | Asana Workspace | Inline-editable dropdown; shows client default as hint if no override |
| 8 | Status | Badge — non-editable; reflects current task status |
| 9 | Actions | Contextual action buttons per row |

### REQ-27-TABLE-02: Inline Edit — Title

Clicking the title cell activates an `InlineEdit` text input. The previous value is shown as placeholder. Pressing Enter or clicking away (blur) triggers `PATCH /tasks/{id}` with the new title. The cell reverts to read-only display on save.

### REQ-27-TABLE-03: Inline Edit — Assignee Dropdown

Clicking the assignee cell opens a `<select>` or custom dropdown with the team member list. Selecting a value triggers `PATCH /tasks/{id}` immediately (no blur required — selection is the commit action).

### REQ-27-TABLE-04: Inline Edit — Estimated Time

Clicking the estimated time cell activates an `InlineEdit` time input. The API stores `estimated_time` as an ISO 8601 duration string (e.g., `PT2H30M`). The UI must display this as human-readable text (e.g., "2h 30m") and accept input in `hh mm` format (e.g., `2 30` for 2 hours 30 minutes), converting to/from ISO 8601 duration on read/write. Validation: numeric values only, `mm` must be 0–59. Blur triggers `PATCH /tasks/{id}`.

### REQ-27-TABLE-05: Inline Edit — Scrum Stage Dropdown

Same pattern as assignee dropdown. Valid Scrum Stage values are sourced from the shared-types enum. Selecting a value triggers `PATCH /tasks/{id}` immediately.

### REQ-27-TABLE-06: Inline Edit — Asana Workspace Dropdown

Same pattern as assignee dropdown. Options from `GET /asana/workspaces`. The client's default workspace is shown as a visual hint (e.g., italic or secondary text) when the task has no workspace override. Selecting a value triggers `PATCH /tasks/{id}` with `asana_workspace_id`.

### REQ-27-TABLE-07: Inline Edit — Save Feedback

A successful inline edit must show a brief visual confirmation on the saved cell (e.g., a green flash or checkmark for 1 second). A failed inline edit must revert the cell to its previous value and show a row-level error indicator.

### REQ-27-TABLE-08: Row Actions — Approve

An "Approve" button renders on rows with status `draft`. Clicking sends `POST /tasks/{id}/approve`. On success, the status badge updates to `approved` and the Approve button is replaced by the Push button. Hidden for `team_member` role.

### REQ-27-TABLE-09: Row Actions — Reject

A "Reject" button renders on rows with status `draft` or `approved`. Clicking sends `POST /tasks/{id}/reject`. On success, status badge updates to `rejected`. Reject button is then hidden. Hidden for `team_member` role.

### REQ-27-TABLE-10: Row Actions — Push

A "Push" button renders on rows with status `approved`. Clicking sends `POST /tasks/{id}/push`. On success, status badge updates to `pushed`. Push button is then hidden. Hidden for `team_member` role.

### REQ-27-TABLE-11: Status Badge Variants

| Status | Badge Variant |
|---|---|
| `draft` | `default` (gray) |
| `approved` | `success` (green) |
| `rejected` | `danger` (red) |
| `pushed` | `primary` (blue) |
| `completed` | `info` (teal) |

### REQ-27-TABLE-12: Pagination

The table must support pagination. Default page size: 25 tasks. A pagination control (Previous / Next, current page indicator, total count) must appear below the table. Page changes re-fetch with `?limit=25&offset={n}`.

### REQ-27-TABLE-13: Optimistic Updates

Inline edits and row-level actions (approve/reject/push) must use optimistic updates — the UI updates immediately and reverts on API error. This prevents the table from feeling slow.

---

## 6. Task Detail Slide-Over Panel (Screen 4)

### REQ-27-DETAIL-01: Trigger

Clicking the Short ID (`TSK-####`) in any task table row opens the task detail slide-over panel. The panel slides in from the right side without leaving the task list view.

### REQ-27-DETAIL-02: Panel Header

The panel header must display:
- Short ID (`TSK-0042`) in monospace, prominently
- Status badge (same variants as the table)
- Client name

### REQ-27-DETAIL-03: Title Field

The title must be click-to-edit (inline). Editing and saving triggers `PATCH /tasks/{id}`.

### REQ-27-DETAIL-04: Description — Rich Text Editor

The description field uses the `RichTextEditor` component. The structured content must be organized into three named sections:
1. **Task Context** — background and reason for the task
2. **Additional Context** — supplementary information
3. **Requirements** — specific deliverables or acceptance criteria

The rich text editor must support at minimum: bold, italic, bullet lists, and numbered lists.

### REQ-27-DETAIL-05: Custom Fields

The panel must render each of the following as inline-editable fields (same component as the table columns):
- Assignee (dropdown)
- Estimated Time (time input — ISO 8601 duration displayed as human-readable, e.g., "2h 30m")
- Scrum Stage (dropdown)
- Asana Workspace (dropdown)
- Asana Project (dropdown — filtered by selected workspace, uses `GET /asana/workspaces/{id}/projects`)

All edits trigger `PATCH /tasks/{id}`.

### REQ-27-DETAIL-06: Version History Sidebar

A collapsible version history panel within the slide-over shows all edits to this task:
- Each entry: who changed it, what changed (field name + old → new value), when (timestamp), source (`agent`, `ui`, or `terminal`)
- Source is displayed as a badge or icon for quick scanning
- Entries are ordered newest first
- The panel is collapsed by default; a "History" button/toggle expands it

### REQ-27-DETAIL-07: Source Transcript Link

If the task was generated from a transcript, a "Source transcript" link must appear in the panel. The link opens the transcript or navigates to the Transcripts tab of the client detail page with the relevant transcript highlighted. The relevant quote from the transcript (if available from the API) is displayed below the link.

### REQ-27-DETAIL-08: Action Buttons

The panel must include the same action buttons as the table row, contextual to status and role:
- **Approve** — visible for `draft` status, hidden for `team_member`
- **Reject** — visible for `draft` and `approved` status, hidden for `team_member`
- **Push to Asana** — visible for `approved` status, hidden for `team_member`

### REQ-27-DETAIL-09: Panel Close

The panel must close via:
- Clicking the X button in the panel header
- Pressing the Escape key
- Clicking the overlay backdrop

---

## 7. Role-Based Access Control

### REQ-27-ROLE-01: Role Source

The authenticated user's role is available from the auth context (set up in feature 24). The roles are: `admin`, `account_manager`, `team_member`.

### REQ-27-ROLE-02: Approve/Reject/Push Visibility

| Role | Approve | Reject | Push | Batch Approve | Batch Push |
|---|---|---|---|---|---|
| `admin` | Visible | Visible | Visible | Visible | Visible |
| `account_manager` | Visible | Visible | Visible | Visible | Visible |
| `team_member` | Hidden | Hidden | Hidden | Hidden | Hidden |

### REQ-27-ROLE-03: Edit Access

All roles can perform inline edits (title, assignee, time, scrum stage, workspace). The API enforces final authorization; the UI shows editing controls to all authenticated users.

---

## 8. Component Reuse

Components from feature 23 (to be fleshed out):

| Component | Used In |
|---|---|
| `Table` / `TableRow` | Task table |
| `SlideOver` | Task detail panel |
| `InlineEdit` | Title, time estimate inline editing |
| `Badge` | Status badges (table and panel) |
| `Avatar` | Assignee column |
| `Button` | Row actions, batch actions, panel actions |

Components from feature 26 (reused here):

| Component | Used In |
|---|---|
| `Badge` (fully styled) | Status badges |
| `Avatar` (fully styled) | Assignee avatars |
| `TagInput` | Not used here |

New components introduced by this feature:
- `FilterBar` — filter dropdowns row
- `BatchActionBar` — batch selection controls
- `TaskTable` — the full task table with inline editing
- `TaskDetailPanel` — the slide-over detail panel
- `RichTextEditor` (full implementation) — description editing in the panel
- `VersionHistory` — collapsible version history list

---

## 9. Error Handling and Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| `GET /clients/{id}/tasks` fails | Full-page error state with retry button |
| Inline edit PATCH fails | Revert cell to previous value; show row-level error indicator |
| Batch approve partially fails | Show partial success message: "{n} approved, {m} failed"; update succeeded rows optimistically |
| Push fails with `WORKSPACE_NOT_CONFIGURED` | Show error in row: "No workspace configured. Set one in the workspace column." |
| Task detail fetch fails | Panel shows error state with retry; table remains functional |
| User without approve role somehow reaches the approve button (e.g., via devtools) | API returns 403; UI shows permission error toast |
| All tasks selected, then filter changes | Selection is cleared when the task list re-fetches |
| Slide-over open, user edits inline in table behind it | Slide-over and table operate independently; both can save to the same task |

---

## 10. Accessibility Requirements

- The task table must be a proper `<table>` with `<thead>`, `<tbody>`, `<th scope="col">` headers.
- Checkbox cells must include `aria-label="Select task {short_id}"`.
- Action buttons must include descriptive `aria-label` attributes (e.g., `aria-label="Approve task TSK-0042"`).
- The slide-over panel must trap focus while open (`focus-trap` pattern).
- The slide-over must announce its open/close state to screen readers via `aria-expanded` on the trigger.
- Inline edit cells must use `role="button"` and `tabIndex={0}` to make them keyboard-reachable before entering edit mode.
- The version history panel toggle must use `aria-expanded` and `aria-controls`.
