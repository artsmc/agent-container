# Task List — Feature 28: UI Agenda Editor
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Last Updated:** 2026-03-03

---

## Prerequisites

Before starting this feature, verify the following are complete:
- [ ] Feature 23 (ui-scaffolding) is merged — `RichTextEditor`, `Card`, `Badge`, `Button`, `Modal`, `Avatar` stubs exist
- [ ] Feature 24 (ui-auth-flow) is merged — user role is available from auth context
- [ ] Feature 22 (api-client-package) is merged — `@iexcel/api-client` resolves in the workspace
- [ ] Feature 25 (ui-dashboard) is merged — app router, DashboardLayout, and navigation confirmed functional
- [ ] Confirm with Feature 27 team: is `RichTextEditor` (TipTap) already fully implemented? If yes, skip Task 4.1 and reuse the existing component.
- [ ] Confirm with Feature 26 team: is `TagInput` component available? If yes, it can be reused in the EmailModal.

---

## Phase 1: Agenda List Screen

### Task 1.1 — Create the agenda list route [small]
Create `apps/ui/src/app/(dashboard)/clients/[client_id]/agendas/page.tsx` as a placeholder that renders `null`.

References: FRS.md REQ-28-LIST-ROUTE-01

Verification: `nx run ui:build` passes. Navigating to `/clients/{id}/agendas` renders without 404.

---

### Task 1.2 — Implement `useAgendaList` hook [small]
Create `apps/ui/src/features/agendas/hooks/useAgendaList.ts`:
- Parameters: `clientId: string`
- Fetches `GET /clients/{clientId}/agendas` on mount
- Returns `{ agendas, loading, error, retry }`

References: TR.md §3 (GET /clients/{id}/agendas)

Verification: Hook fetches and returns data. Loading and error states work.

---

### Task 1.3 — Build `AgendaListPage` component [medium]
Create `apps/ui/src/features/agendas/components/AgendaListPage.tsx`:
- Calls `useAgendaList(clientId)`
- Loading skeleton (card skeleton)
- Error state with Retry button
- Empty state: "No agendas have been created for this client yet. Agendas are created automatically by the intake workflow."
- No "New Agenda" button
- Renders a list of `AgendaCard` components (from Feature 26 or re-implemented here)

References: FRS.md REQ-28-LIST-01 through REQ-28-LIST-07

Verification: List renders with correct order. Empty and error states shown correctly.

---

### Task 1.4 — Build or reuse `AgendaCard` component [medium]
If Feature 26 has already built `AgendaCard`, import it. If not, build it here:
- Short ID (monospace)
- Cycle dates (`formatCycleDates` utility)
- Status `Badge`
- Last edited by + relative time (`formatRelativeTime` utility)
- Quick action buttons: Edit, Finalize, Share, Email (role-aware and status-aware)

References: FRS.md REQ-28-LIST-03, REQ-28-LIST-04

Verification: Card renders all fields. Edit navigates to `/agendas/{short_id}`. Finalize shows confirmation dialog. Share only shows for finalized agendas. Role-based visibility correct.

---

### Task 1.5 — Implement Finalize from list (confirmation dialog) [medium]
On the `AgendaCard`, wire the "Finalize" button:
- On click: show a browser `confirm()` or a `Modal` component confirmation
- On confirm: call `POST /agendas/{id}/finalize` via api-client
- On success: update the card's status badge to `finalized`
- On `FINALIZE_REQUIRES_EDIT` error: show inline error on the card

References: FRS.md REQ-28-LIST-04, FRS.md REQ-28-ACTION-02

Verification: Confirmation dialog appears. Finalize fires API call. Status badge updates. Error shown for requires-edit case.

---

### Task 1.6 — Implement Share from list (modal with URLs) [medium]
On the `AgendaCard`, wire the "Share" button:
- On click: call `POST /agendas/{id}/share`
- On success: open a modal showing the two URLs (client-facing and internal) with Copy buttons
- Update the card's status badge to `shared`

References: FRS.md REQ-28-LIST-04, FRS.md REQ-28-ACTION-03

Verification: Share calls API. Modal shows two URLs with copy functionality. Status updates to `shared`.

---

### Task 1.7 — Add `AgendaListPage.module.scss` [small]
Styles: card list vertical spacing, card hover state, empty state centred text.

---

## Phase 2: Agenda Editor Route and Shell

### Task 2.1 — Create the agenda editor route [small]
Create `apps/ui/src/app/(dashboard)/agendas/[short_id]/page.tsx` as a server component that:
- Reads `params.short_id`
- Calls `GET /agendas/{short_id}` server-side
- Passes the agenda data to `<AgendaEditorPage>` client component
- Handles 404

References: TR.md §2 (Repository Structure), FRS.md REQ-28-EDIT-ROUTE-01, REQ-28-EDIT-ROUTE-02

Verification: Navigating to `/agendas/AGD-0015` renders the editor with agenda data. `/agendas/AGD-9999` shows "Agenda not found".

---

### Task 2.2 — Implement `useAgendaDetail` hook [small]
Create `apps/ui/src/features/agendas/hooks/useAgendaDetail.ts`:
- Fetches `GET /agendas/{id}` when `agendaId` is provided
- Returns `{ agenda, loading, error, retry }`

References: TR.md §3 (GET /agendas/{id})

Verification: Hook fetches and returns full agenda including content, comments, and version history.

---

### Task 2.3 — Build `AgendaEditorPage` component shell [medium]
Create `apps/ui/src/features/agendas/components/AgendaEditorPage.tsx` as a `'use client'` component:
- Accepts `agenda: Agenda` prop
- Manages editor state (see TR.md §4 State Architecture)
- Manages `showComments` and `showHistory` toggle state
- Renders: `AgendaEditorHeader`, six `AgendaSection` components, `CommentsPanel`, `VersionHistoryPanel`, `ActionBar`
- Uses CSS Grid layout from `AgendaEditorPage.module.scss`

References: TR.md §4 (Editor State), TR.md §6 (Editor Layout Strategy)

Verification: Editor renders all components. Comment/history toggles expand the respective panels.

---

### Task 2.4 — Add `AgendaEditorPage.module.scss` [medium]
Three-column CSS Grid layout (content + optional comments panel + optional history panel), editor header row, action bar sticky at bottom.

References: TR.md §6 (Editor Layout Strategy)

Verification: Layout shifts correctly when comments and history panels are toggled.

---

## Phase 3: Editor Header

### Task 3.1 — Build `AgendaEditorHeader` component [medium]
Create `apps/ui/src/features/agendas/components/AgendaEditorHeader.tsx`:
- Props: `agenda: Agenda`, `saveStatus: SaveStatus`, `lastSavedAt: Date | null`
- Renders: short ID (monospace), client name, cycle dates, status badge
- Auto-save indicator: "Saved · {time}" | "Saving..." | "Save failed — Retry"
- Retry button (visible only when `saveStatus === 'failed'`) triggers manual re-save

References: FRS.md REQ-28-EDIT-HDR-01, REQ-28-EDIT-HDR-02, FRS.md §11 (Accessibility)

Verification: Header shows all fields. Auto-save states cycle correctly.

---

### Task 3.2 — Add `AgendaEditorHeader.module.scss` [small]
Header flex row, short ID typography, status badge, auto-save indicator styles (color-coded by status).

---

## Phase 4: Rich Text Editor Sections

### Task 4.1 — Confirm or implement `RichTextEditor` with section support [medium]
If Feature 27 has already built `RichTextEditor` with TipTap:
- Verify it supports `readOnly` prop and `onCommit` callback
- Extend if needed: ensure section-level `readOnly` works correctly

If Feature 27 has NOT been built yet:
- Implement `RichTextEditor` following TR.md §5 from Feature 27
- Ensure TipTap dependencies are added to `apps/ui/package.json`

References: Feature 27 TR.md §5 (RichTextEditor), FRS.md REQ-28-EDIT-RTE-02

Verification: Rich text editor renders with toolbar. `readOnly` hides toolbar and prevents editing. `onCommit` fires on blur.

---

### Task 4.2 — Build `AgendaSection` component [medium]
Create `apps/ui/src/features/agendas/components/AgendaSection.tsx`:
- Props: `label: string`, `sectionKey: keyof AgendaContent`, `value: string`, `onChange: (value: string) => void`, `readOnly: boolean`
- Renders a non-editable `<h3>` with the section label
- Renders `<RichTextEditor value onChange readOnly onCommit>` below the header
- `onCommit` triggers the parent's auto-save debounce

References: FRS.md REQ-28-EDIT-RTE-01, TR.md §5 (AgendaSection)

Verification: Six sections render with non-editable h3 headers. Editing a section calls `onChange`. Read-only mode disables editor.

---

### Task 4.3 — Wire auto-save debounce in `AgendaEditorPage` [medium]
Implement the debounced auto-save logic in `AgendaEditorPage.tsx`:
- 1500ms debounce from last change
- Accumulates changes across multiple sections into a single PATCH
- Updates `saveStatus` as changes flow through (unsaved → saving → saved/failed)
- Sends `PATCH /agendas/{id}` with `{ content: pendingContent, version: currentVersion }`
- On `409 CONFLICT`: refresh content from server and notify user
- On `423 LOCKED`: show locked banner, switch editor to read-only

References: TR.md §4 (Auto-Save Debounce), FRS.md REQ-28-EDIT-RTE-03

Verification: Single PATCH fired 1500ms after last keystroke (confirmed in Network tab). Multiple rapid changes produce one request. `saveStatus` updates correctly.

---

### Task 4.4 — Add `AgendaSection.module.scss` [small]
Section header styles (font size, weight, bottom border separator), editor area top padding.

---

## Phase 5: Collaborative Sync

### Task 5.1 — Implement `useAgendaSync` hook [medium]
Create `apps/ui/src/features/agendas/hooks/useAgendaSync.ts`:
- Polls `GET /agendas/{id}?since_version={version}` every 5 seconds
- Only active when `enabled=true` (disabled for finalized/shared agendas)
- Calls `onRemoteUpdate(agenda)` when server version is newer than local version
- Returns `activeUsers: ActiveUser[]` from the polling response

References: TR.md §4 (Polling Sync), TR.md §7 (Presence Indicators), FRS.md REQ-28-COLLAB-02, REQ-28-COLLAB-03

Verification: Hook polls at 5s. Stops when `enabled=false`. Calls `onRemoteUpdate` only when version changes. Does not poll for finalized agendas.

---

### Task 5.2 — Wire `useAgendaSync` into `AgendaEditorPage` [medium]
In `AgendaEditorPage.tsx`:
- Pass `enabled={!isFinalized}` to `useAgendaSync`
- On `onRemoteUpdate`: if user is actively editing (debounce timer active), queue the update; otherwise apply immediately
- Show notification toast when remote update is applied: "Updated by {user}"
- Render `PresenceIndicator` with `activeUsers` from the hook

References: TR.md §4 (Polling Sync), FRS.md REQ-28-COLLAB-01, REQ-28-COLLAB-02

Verification: Two browser sessions editing the same agenda: changes from session A appear in session B after ≤5s. Notification shows. Active typing is not interrupted.

---

### Task 5.3 — Build `PresenceIndicator` component [small]
Create `apps/ui/src/features/agendas/components/PresenceIndicator.tsx`:
- Props: `users: ActiveUser[]`, `currentUserId: string`
- Renders `Avatar` chips for each user (excluding the current user)
- Tooltip on hover shows the user's name

References: FRS.md REQ-28-COLLAB-01, TR.md §7 (Presence Indicators)

Verification: When a second user is editing, their avatar appears in the presence indicator.

---

## Phase 6: Internal Comments

### Task 6.1 — Implement `useAgendaComments` hook [small]
Create `apps/ui/src/features/agendas/hooks/useAgendaComments.ts`:
- Manages local state for comments (initialized from `agenda.comments`)
- Exposes: `addComment(text)`, `addReply(commentId, text)`
- Calls the API and updates local state optimistically

References: FRS.md REQ-28-COMMENT-03, REQ-28-COMMENT-04

Verification: Adding a comment updates the local state immediately. API call fires.

---

### Task 6.2 — Build `CommentThread` component [medium]
Create `apps/ui/src/features/agendas/components/CommentThread.tsx`:
- Props: `comment: AgendaComment`
- Renders: author avatar + name, comment text, relative timestamp
- "Reply" button expands an inline reply input
- Threaded replies rendered below, indented

References: FRS.md REQ-28-COMMENT-02, REQ-28-COMMENT-04

Verification: Comment renders with author, text, timestamp. Reply button expands input. Reply appears below comment.

---

### Task 6.3 — Build `CommentsPanel` component [medium]
Create `apps/ui/src/features/agendas/components/CommentsPanel.tsx`:
- Props: `comments: AgendaComment[]`, `open: boolean`, `onToggle: () => void`, `onAddComment: (text) => void`, `onAddReply: (id, text) => void`
- Toggle button with `aria-expanded` and comment count badge
- Collapsible panel (CSS width transition)
- "New comment" text input + Submit button at top
- List of `CommentThread` components

References: FRS.md REQ-28-COMMENT-01 through REQ-28-COMMENT-06, TR.md §5 (CommentsPanel)

Verification: Panel collapses and expands. Comment count badge correct. New comment adds to list. Panel never shows in shared view.

---

### Task 6.4 — Add `CommentsPanel.module.scss` and `CommentThread.module.scss` [small]
CommentsPanel: collapsible width transition, header/toggle styles.
CommentThread: bubble style, author line, reply indent.

---

## Phase 7: Version History

### Task 7.1 — Build `VersionHistoryPanel` component [medium]
Create `apps/ui/src/features/agendas/components/VersionHistoryPanel.tsx`:
- Props: `entries: AgendaVersionEntry[]`, `open: boolean`, `onToggle: () => void`
- Toggle button with `aria-expanded`
- Collapsible panel
- Each entry: changed_by name, source badge (`agent`/`ui`/`terminal`), section name, diff view, relative timestamp
- Diff view: old content struck through (red), new content highlighted (green)

References: FRS.md REQ-28-VER-01 through REQ-28-VER-04

Verification: Panel renders version entries with correct source badges. Diff view shows changes. Panel collapses and expands.

---

### Task 7.2 — Add `VersionHistoryPanel.module.scss` [small]
Entry list styles, source badge color variants, diff view (red strikethrough, green highlight).

---

## Phase 8: Action Bar

### Task 8.1 — Flesh out `Modal` component stub [medium]
Update `apps/ui/src/components/Modal/Modal.tsx`:
- Portal rendering (`createPortal` to `document.body`)
- Overlay backdrop with click-to-close
- Focus trap when open
- Escape key closes
- Header with title and close (X) button
- Configurable footer (accept/cancel buttons)
- Width variants: `sm`, `md`, `lg`

References: FRS.md REQ-28-ACTION-02 (confirmation modal), REQ-28-ACTION-03 (share modal), REQ-28-ACTION-04 (email modal), feature 23 stub contract

Verification: Modal opens/closes. Focus trapped. Escape closes. Backdrop click closes. Confirmation modal renders with Confirm/Cancel buttons.

---

### Task 8.2 — Build `ShareModal` component [medium]
Create `apps/ui/src/features/agendas/components/ShareModal.tsx`:
- Props: `open: boolean`, `onClose: () => void`, `clientUrl: string`, `internalUrl: string`
- Uses `Modal` component
- Two URL rows (client-facing + internal), each with a URL display and "Copy" button
- "Copy" button uses `navigator.clipboard.writeText` and shows "Copied!" feedback

References: FRS.md REQ-28-ACTION-03, GS.md (Share scenarios)

Verification: Modal shows two URLs with working Copy buttons.

---

### Task 8.3 — Build `EmailModal` component [large]
Create `apps/ui/src/features/agendas/components/EmailModal.tsx`:
- Props: `open: boolean`, `onClose: () => void`, `agenda: Agenda`, `defaultRecipients: string[]`, `onSend: (recipients, subject) => Promise<void>`
- Uses `Modal` and `TagInput`
- Pre-fills recipients from `defaultRecipients`
- Pre-fills subject from `"Running Notes — {client_name} — {cycle_dates}"`
- Read-only agenda content preview
- "Send" button calls `onSend`, shows loading state, closes on success
- Inline error if send fails

References: FRS.md REQ-28-ACTION-04, GS.md (Email scenarios)

Verification: Modal pre-fills correctly. Recipients editable. Subject editable. Send fires API call. Toast shows on success.

---

### Task 8.4 — Build `ActionBar` component [large]
Create `apps/ui/src/features/agendas/components/ActionBar.tsx`:
- Props: `agenda: Agenda`, `userRole: UserRole`, `onFinalize`, `onShare`, `onEmail`, `onExport`, `saving: boolean`
- Finalize button (role-aware, status-aware, disabled states)
- Share button (disabled unless finalized, role-aware)
- Email button (disabled unless finalized, role-aware)
- Export button (dropdown: Google Docs / PDF)
- All buttons have `aria-label` attributes

References: FRS.md REQ-28-ACTION-01 through REQ-28-ACTION-05, FRS.md §11 (Accessibility)

Verification: Finalize button hidden for team_member. Share and Email disabled on non-finalized agendas. Export dropdown shows two options.

---

### Task 8.5 — Implement `useAgendaMutations` hook [large]
Create `apps/ui/src/features/agendas/hooks/useAgendaMutations.ts`:
- `finalize(agendaId)` — POST /agendas/{id}/finalize, handles `FINALIZE_REQUIRES_EDIT`
- `share(agendaId)` — POST /agendas/{id}/share, returns `ShareResponse`
- `email(agendaId, body)` — POST /agendas/{id}/email
- `export(agendaId, format)` — POST /agendas/{id}/export?format={format}
- Each returns loading, error, and result state

References: TR.md §3 (finalize, share, email, export endpoints)

Verification: Each mutation calls the correct endpoint. Error responses handled and surfaced.

---

### Task 8.6 — Add `ActionBar.module.scss` [small]
Sticky bottom bar, padding, button group layout, export dropdown positioning.

---

## Phase 9: Integration

### Task 9.1 — Wire ActionBar into `AgendaEditorPage` [medium]
In `AgendaEditorPage.tsx`:
- Wire `onFinalize` → show confirmation `Modal` → call `useAgendaMutations.finalize` on confirm → update agenda state → switch editor to read-only → show locked banner
- Wire `onShare` → call `useAgendaMutations.share` → open `ShareModal` with returned URLs
- Wire `onEmail` → open `EmailModal` → on send, call `useAgendaMutations.email`
- Wire `onExport` → call `useAgendaMutations.export` → handle Google Docs (show toast with link) and PDF (trigger download)

References: FRS.md §8 (Action Bar), GS.md (Finalize, Share, Email, Export scenarios)

Verification: Each action works end-to-end. Status updates propagate to header badge. Locked banner appears after finalization.

---

### Task 9.2 — Smoke test full agenda editor workflow [small]
Manual verification:
1. Navigate to `/clients/{id}/agendas` — list renders with correct card data
2. Click Edit on a draft agenda — editor opens with six sections
3. Edit a section — auto-save fires after 1.5s, indicator shows "Saved"
4. Expand Comments — add a comment, reply to it
5. Expand Version History — verify entries with source labels
6. Click Finalize — confirm modal appears, confirm → editor locks, status → finalized
7. Click Share — modal shows two URLs with copy buttons
8. Click Email — modal pre-fills recipients and subject, send fires API
9. Test with `team_member` role — Finalize/Share/Email buttons hidden
10. Open two sessions — edit one, verify other picks up changes within 5s

---

### Task 9.3 — TypeScript type-check [small]
Run `nx run ui:type-check`. Zero TypeScript errors.

---

### Task 9.4 — Update execution/job-queue/index.md [small]
Update Spec Status for feature 28 from `pending` to `complete`.

---

## Completion Checklist

Before marking feature 28 as complete, verify all of the following:

- [ ] Agenda List at `/clients/{id}/agendas` renders cards ordered by cycle date descending
- [ ] Agenda card: short ID, cycle dates, status badge, last-edited info, quick actions
- [ ] Finalize from list: confirmation dialog, FINALIZE_REQUIRES_EDIT handled, status badge updates
- [ ] Share from list: modal with two URLs, copy buttons, status updates to `shared`
- [ ] Agenda Editor at `/agendas/{short_id}` loads and renders six sections
- [ ] Editor header: short ID, client name, cycle dates, status badge, auto-save indicator
- [ ] Six Running Notes sections rendered in correct order with non-editable h3 headers
- [ ] Auto-save debounce: single PATCH fires 1500ms after last keypress
- [ ] Finalized/shared agenda is read-only with locked banner
- [ ] Polling sync: changes from another session appear within 5 seconds
- [ ] Presence indicators: other active users shown as avatar chips
- [ ] Internal comments: add, reply, count badge, panel collapses/expands
- [ ] Version history: entries with source badges, diff view
- [ ] Action bar: Finalize, Share, Email, Export — role-aware and status-aware
- [ ] Finalize confirmation modal works; `FINALIZE_REQUIRES_EDIT` error shown inline
- [ ] Share modal shows two URLs with copy functionality
- [ ] Email modal pre-fills recipients/subject; send fires API; toast on success
- [ ] Export: Google Docs fires API + shows toast with link; PDF triggers download
- [ ] `Modal` component stub fleshed out with portal, focus trap, Escape key
- [ ] `RichTextEditor` fleshed out with TipTap (or confirmed reused from Feature 27)
- [ ] `nx run ui:build` passes
- [ ] `nx run ui:type-check` passes
- [ ] Spec status in `execution/job-queue/index.md` updated to `complete`
