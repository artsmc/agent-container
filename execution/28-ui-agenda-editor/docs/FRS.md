# FRS — Functional Requirement Specification
## Feature 28: UI Agenda Editor
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Overview

Feature 28 implements two screens:
- **Screen 5 — Agenda List** at `/clients/{client_id}/agendas`: a card-based list of all agendas for a client with quick action buttons.
- **Screen 6 — Agenda Editor** at `/agendas/{short_id}`: the full editing experience — rich text, collaborative editing, internal comments, version history, and the action bar (finalize, share, email, export).

Requirements are identified with unique IDs for traceability.

---

## 2. Screen 5: Agenda List

### REQ-28-LIST-ROUTE-01: Route Registration

The Agenda List page must be registered at `app/(dashboard)/clients/[client_id]/agendas/page.tsx`.

### REQ-28-LIST-ROUTE-02: DashboardLayout

The page renders within `DashboardLayout`. No additional layout wrapper needed.

### REQ-28-LIST-01: Data Source

Data is fetched from `GET /clients/{id}/agendas` on page load. A loading skeleton must show while the request is in flight.

### REQ-28-LIST-02: Card Grid Layout

Agendas are displayed as a vertical list of cards (or a responsive grid at wider viewports). Cards are ordered by `cycle_start` date descending (most recent first).

### REQ-28-LIST-03: Agenda Card Content

Each agenda card must display:
- Short ID (`AGD-####`) in monospace font
- Cycle dates formatted as `MMM D, YYYY → MMM D, YYYY`
- Status badge with variants:
  - `draft` → `default` (gray)
  - `in_review` → `info` (blue/teal)
  - `finalized` → `success` (green)
  - `shared` → `primary` (brand color)
- Last edited by: user display name (or "Agent" if source is agent) and relative timestamp (e.g., "3 hours ago")

### REQ-28-LIST-04: Quick Action Buttons

Each card must include:
- **Edit** — navigates to `/agendas/{short_id}`
- **Finalize** — calls `POST /agendas/{id}/finalize` directly from the list (without opening the editor). Only visible for `admin` and `account_manager` roles. Disabled if status is already `finalized` or `shared`. Shows a confirmation dialog before sending.
- **Share** — calls `POST /agendas/{id}/share`. Only available if status is `finalized`. Shows a modal with the two generated URLs on success.
- **Email** — navigates to `/agendas/{short_id}?action=email` (or opens a modal from the list). Only available if status is `finalized`. Pre-fills recipients from the client's `email_recipients` config.

### REQ-28-LIST-05: Empty State

If `GET /clients/{id}/agendas` returns an empty array, display: "No agendas have been created for this client yet. Agendas are created automatically by the intake workflow."

### REQ-28-LIST-06: Error State

If `GET /clients/{id}/agendas` fails, display an error state with a "Retry" button.

### REQ-28-LIST-07: No Create Button

There is no "New Agenda" button. Agenda creation is handled by Mastra (feature 20) only.

---

## 3. Screen 6: Agenda Editor

### REQ-28-EDIT-ROUTE-01: Route Registration

The Agenda Editor page must be registered at `app/(dashboard)/agendas/[short_id]/page.tsx`. The `[short_id]` segment accepts the human-readable short ID (e.g., `AGD-0015`).

### REQ-28-EDIT-ROUTE-02: 404 Handling

If `GET /agendas/{short_id}` returns 404, display "Agenda not found" with a back navigation link.

### REQ-28-EDIT-HDR-01: Editor Header

The editor header must display:
- Short ID (`AGD-0015`) in monospace
- Client name (from the agenda entity's `client_id`, resolved to `client.name`)
- Cycle dates formatted as `MMM D, YYYY → MMM D, YYYY`
- Status badge (same variants as the list screen)

### REQ-28-EDIT-HDR-02: Auto-Save Indicator

An auto-save status indicator must appear in the header: "Saved" (with timestamp), "Saving...", or "Unsaved changes". This changes as the user edits.

---

## 4. Rich Text Editor

### REQ-28-EDIT-RTE-01: Running Notes Sections

The agenda content is stored as ProseMirror JSON. TipTap reads and writes ProseMirror JSON natively, making it the natural format for the editor. Each section's content field contains a ProseMirror JSON document object.

The agenda content is structured into six named sections in this fixed order:
1. Completed Tasks
2. Incomplete Tasks
3. Relevant Deliverables
4. Recommendations
5. New Ideas
6. Next Steps

Each section is rendered as a labeled block with a non-editable section header (`<h3>`) and a `RichTextEditor` below it.

### REQ-28-EDIT-RTE-02: Rich Text Formatting

Within each section, the editor must support:
- Bold, italic, underline
- Bullet lists and numbered lists
- Headings (h4 only — h2/h3 are reserved for section headers)
- Inline code
- Hyperlinks

### REQ-28-EDIT-RTE-03: Auto-Save

Changes to any section auto-save via `PATCH /agendas/{id}` after a debounce delay of 1500ms from the last keystroke. The auto-save indicator in the header reflects the current save state.

### REQ-28-EDIT-RTE-04: Read-Only Mode

When the agenda status is `finalized` or `shared`, the rich text editor must switch to read-only mode — no edits are possible. The editor renders content in a clean, read-only format. A banner must appear: "This agenda is finalized and locked for editing."

### REQ-28-EDIT-RTE-05: Section Collapse (Optional V1)

Each section may have a collapse toggle to hide its content while keeping the section header visible. This simplifies navigation for longer agendas. Mark as optional in V1.

---

## 5. Collaborative Editing

### REQ-28-COLLAB-01: Presence Indicators

When multiple authenticated users are viewing or editing the same agenda, cursor presence indicators must show who else is present. Each active user is represented by a colored avatar/initials chip with their name on hover.

### REQ-28-COLLAB-02: Polling-Based Synchronization (V1)

In V1, collaborative synchronization is implemented via polling: the client polls `GET /agendas/{id}` every 5 seconds to check for updates from other users. If the server version is newer than the local version, the editor content is refreshed.

**Conflict handling:** If a local save is in flight when a newer server version arrives, the save completes first (last-write-wins), then the refreshed content is merged. The user sees a notification: "The agenda was updated by {user}."

### REQ-28-COLLAB-03: WebSocket Upgrade Path

The implementation must not hard-code the polling mechanism in a way that prevents WebSocket replacement. The polling logic must be isolated in a `useAgendaSync` hook that can be swapped for a WebSocket implementation in V2 without changing consumer components.

---

## 6. Internal Comments

### REQ-28-COMMENT-01: Comments Sidebar

The agenda editor must include a collapsible comments sidebar on the right side. It contains all internal comments for the current agenda.

### REQ-28-COMMENT-02: Comment Content

Each comment thread must display:
- Author avatar and name
- Comment text (plain text, no rich formatting in V1)
- Timestamp (relative, e.g., "1 hour ago")
- Threaded replies: each comment can have replies displayed below it, indented

### REQ-28-COMMENT-03: Add Comment

A text input at the top or bottom of the comments sidebar allows any authenticated user to add a new comment. Submitting calls `POST /agendas/{id}/comments` (if this endpoint exists) or `PATCH /agendas/{id}` with a comments update.

### REQ-28-COMMENT-04: Reply to Comment

Each comment must have a "Reply" button that expands an inline reply input below the comment thread.

### REQ-28-COMMENT-05: Internal Only

Comments must never appear in:
- The client-facing shared agenda view (feature 29)
- The exported Google Docs output
- The emailed agenda content

### REQ-28-COMMENT-06: Comment Visibility Badge

If the agenda has any comments, a badge on the comments sidebar toggle button must show the count (e.g., "Comments (3)").

---

## 7. Version History

### REQ-28-VER-01: Version History Panel

The agenda editor includes a collapsible version history panel. It can be opened via a "History" button in the editor toolbar or action bar.

### REQ-28-VER-02: Version Entry Content

Each version entry must show:
- Who edited (name + source: `agent`, `ui`, `terminal`)
- When (relative timestamp)
- What changed (diff view: old text struck through in red, new text in green)

### REQ-28-VER-03: Source Labels

The source of each edit must be displayed as a labeled badge:
- `agent` — edit made by the Mastra agent
- `ui` — edit made through the web UI
- `terminal` — edit made via the CLI/terminal interface

### REQ-28-VER-04: Collapsed by Default

The version history panel is collapsed by default. Opening it does not replace the editor — it renders as a side panel or below the editor.

---

## 8. Action Bar

### REQ-28-ACTION-01: Action Bar Position

The action bar is a fixed or sticky bar at the bottom of the editor view, always visible while the editor is active.

### REQ-28-ACTION-02: Finalize Button

The Finalize button:
- Only visible for `admin` and `account_manager` roles
- Disabled if the agenda is already `finalized` or `shared`
- Disabled if the API indicates the agenda has not been edited (handles `FINALIZE_REQUIRES_EDIT` error)
- On click: shows a confirmation modal ("Finalize this agenda? This will lock editing.")
- On confirm: calls `POST /agendas/{id}/finalize`
- On success: status badge updates to `finalized`, editor switches to read-only mode, Finalize button becomes disabled

### REQ-28-ACTION-03: Share Button

The Share button:
- Only visible for `admin` and `account_manager` roles
- Disabled unless status is `finalized`
- On click: calls `POST /agendas/{id}/share`
- On success: opens a modal with two URLs:
  - **Client-facing URL** (read-only, no auth): `https://app.iexcel.com/shared/{token}` — with a Copy button
  - **Internal URL** (edit-enabled, auth required): `https://app.iexcel.com/agendas/{short_id}` — with a Copy button
- Status badge updates to `shared`

### REQ-28-ACTION-04: Email Button

The Email button:
- Only visible for `admin` and `account_manager` roles
- Disabled unless status is `finalized`
- On click: opens an email send modal:
  - Recipients field (pre-filled from client `email_recipients`, editable)
  - Subject line (pre-filled as "Running Notes — {client_name} — {cycle_dates}", editable)
  - Preview of the agenda content (read-only)
  - "Send" button
- On send: calls `POST /agendas/{id}/email` with the final recipients and subject
- On success: shows confirmation toast: "Email sent to {n} recipient(s)"

### REQ-28-ACTION-05: Export Button

The Export button:
- Available for all authenticated roles
- On click: shows a dropdown with options:
  - "Export to Google Docs"
  - "Download as PDF"
- "Export to Google Docs": calls `POST /agendas/{id}/export?format=google_docs`
- "Download as PDF": calls `POST /agendas/{id}/export?format=pdf` and triggers a file download
- On success for Google Docs: shows a toast with a link to the created Google Doc

---

## 9. Component Reuse

Components from feature 23 (to be fleshed out):
- `RichTextEditor` — may already be fleshed out in feature 27; if so, extend with section support and auto-save
- `Badge` — status badges
- `Card` — agenda cards on the list screen
- `Avatar` — presence indicators, comment author avatars
- `Button` — action bar buttons

Components from feature 26:
- `TagInput` — email recipients in the email send modal (same component)
- `AgendaCard` — agenda list cards (may be shared or re-implemented)

New components introduced by feature 28:
- `AgendaEditorHeader` — short ID, client, dates, status, auto-save indicator
- `AgendaSection` — labeled section wrapper with non-editable header and RichTextEditor
- `CommentsPanel` — collapsible sidebar with comment threads
- `CommentThread` — single comment with replies
- `VersionHistoryPanel` — collapsible version history (similar to feature 27's `VersionHistory` — consider sharing)
- `ActionBar` — finalize, share, email, export controls
- `ShareModal` — displays generated URLs
- `EmailModal` — recipients, subject, preview, send

---

## 10. Error Handling and Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| `GET /agendas/{short_id}` returns 404 | "Agenda not found" error page with back navigation |
| Auto-save PATCH fails | Header indicator shows "Save failed — Retry"; editor remains editable |
| Finalize with `FINALIZE_REQUIRES_EDIT` error | Show inline error: "Please make at least one edit before finalizing." |
| Share called while status is not `finalized` | Button is disabled — this should not be reachable. If called via devtools: API returns error, show toast. |
| Email send fails | Modal shows inline error; modal remains open for retry |
| Export to Google Docs fails | Toast: "Export failed. Please try again." |
| Polling refresh during active typing | New server content arrives but user is mid-edit — do NOT interrupt the active editor; wait until next idle period to apply the refresh |
| Two users finalize simultaneously | API accepts the first and returns error for the second. The second user sees: "This agenda has already been finalized." |
| Agenda has status `shared` and user attempts to edit | Editor is read-only; banner shown: "This agenda is finalized and locked for editing." |

---

## 11. Accessibility Requirements

- The six section headers (`h3`) in the agenda editor must be properly nested in the document hierarchy.
- The comments sidebar toggle must use `aria-expanded` and `aria-controls`.
- The version history panel toggle must use `aria-expanded`.
- Action bar buttons must have descriptive `aria-label` attributes.
- The Share modal and Email modal must trap focus when open.
- The auto-save indicator must use `role="status"` to announce changes to screen readers.
- Presence indicators (collaborative editing avatars) must have `aria-label="Also editing: {names}"`.
