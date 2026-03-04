# Task List — Feature 27: UI Task Review
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Last Updated:** 2026-03-03

---

## Prerequisites

Before starting this feature, verify the following are complete:
- [ ] Feature 23 (ui-scaffolding) is merged — `Table`, `TableRow`, `SlideOver`, `InlineEdit`, `Badge`, `Button`, `Avatar` stubs exist in `apps/ui/src/components/`
- [ ] Feature 24 (ui-auth-flow) is merged — user role is available from auth context
- [ ] Feature 22 (api-client-package) is merged — `@iexcel/api-client` resolves in the workspace
- [ ] Feature 25 (ui-dashboard) is merged — Dashboard exists; confirms app router and DashboardLayout work end-to-end
- [ ] Confirm Scrum Stage enum values with shared-types (feature 01) before building Scrum Stage dropdowns

---

## Phase 1: Route and Page Shell

### Task 1.1 — Create the task review route directory [small]
Create `apps/ui/src/app/(dashboard)/clients/[client_id]/tasks/page.tsx` as a placeholder that renders `null`.

References: TR.md §2 (Repository Structure), FRS.md REQ-27-ROUTE-01

Verification: `nx run ui:build` passes with the new route. Navigating to `/clients/{id}/tasks` renders without 404.

---

### Task 1.2 — Implement `TaskReviewPage` component [medium]
Create `TaskReviewPage.tsx` as a client component that:
- Reads `client_id` from route params and filter values from `useSearchParams`
- Calls `useTaskList(clientId, filters)` hook (to be built in Phase 2)
- Renders `FilterBar`, `BatchActionBar` (conditional), `TaskTable`, and pagination controls
- Manages `selectedIds` state and `activeTaskId` state (for slide-over)
- Renders `TaskDetailPanel` when `activeTaskId` is set

References: TR.md §4 (State Architecture), FRS.md REQ-27-ROUTE-04

Verification: Page renders with loading skeleton, then task table. Slide-over activates on Short ID click.

---

### Task 1.3 — Add `TaskReviewPage.module.scss` [small]
Page layout styles: max-width container, spacing between filter bar, batch bar, table, and pagination.

---

## Phase 2: Data Hooks

### Task 2.1 — Implement `useTaskList` hook [medium]
Create `apps/ui/src/features/tasks/hooks/useTaskList.ts`:
- Parameters: `clientId: string`, `filters: TaskFilters`, `pagination: { page, limit }`
- Fetches `GET /clients/{clientId}/tasks` with filter and pagination params
- Returns `{ tasks, total, loading, error, retry }`
- Re-fetches when filters or pagination change
- Exposes `updateTask(id, partialTask)` for optimistic updates

References: TR.md §3 (GET /clients/{id}/tasks), TR.md §4 (Task List State)

Verification: Hook fires on mount. Filter change triggers re-fetch. `updateTask` updates local state without refetch.

---

### Task 2.2 — Implement `useTaskDetail` hook [small]
Create `apps/ui/src/features/tasks/hooks/useTaskDetail.ts`:
- Parameters: `taskId: string | null`
- Fetches `GET /tasks/{taskId}` only when `taskId` is non-null
- Returns `{ task, loading, error, retry }`

References: TR.md §3 (GET /tasks/{id})

Verification: Hook fetches when `taskId` is set, does nothing when null. Returns version history in `task`.

---

### Task 2.3 — Implement `useTaskMutations` hook [medium]
Create `apps/ui/src/features/tasks/hooks/useTaskMutations.ts`:
- Exposes: `editTask`, `approveTask`, `rejectTask`, `pushTask`, `batchApprove`
- Each mutation follows the optimistic update pattern (TR.md §4)
- Returns `{ saving, error }` state per mutation

References: TR.md §4 (Optimistic Update Pattern), TR.md §3 (PATCH, approve, reject, push endpoints)

Verification: Optimistic update applies immediately; reverts on API error. Error message exposed to consumer.

---

### Task 2.4 — Implement `useAsanaWorkspaces` hook (if not already built in Feature 26) [small]
If not already implemented by Feature 26, create `apps/ui/src/features/tasks/hooks/useAsanaWorkspaces.ts`.

References: TR.md §3 (GET /asana/workspaces)

Verification: Workspace list available for dropdown population.

---

## Phase 3: Filter Bar

### Task 3.1 — Build `FilterBar` component [medium]
Create `apps/ui/src/features/tasks/components/FilterBar.tsx` with:
- Status filter dropdown (All + status options)
- Transcript filter dropdown (populated from `GET /clients/{id}/transcripts`)
- Assignee filter dropdown (unique assignees from current task list)
- "Clear filters" link (visible when any filter is active)
- URL param sync (reads/writes via `onFilterChange` prop)

References: FRS.md REQ-27-FILTER-01 through REQ-27-FILTER-05, TR.md §6 (URL State Management)

Verification: Selecting a filter updates the URL and re-fetches the task list. "Clear filters" resets all.

---

### Task 3.2 — Add `FilterBar.module.scss` [small]
Horizontal flex row, dropdown widths, spacing, "Clear filters" link style.

---

## Phase 4: Batch Action Bar

### Task 4.1 — Build `BatchActionBar` component [medium]
Create `apps/ui/src/features/tasks/components/BatchActionBar.tsx` with:
- Hidden when `selectedIds.size === 0`, visible otherwise
- Selection count display
- Select all / Deselect all toggle
- Approve button (hidden for `team_member` role)
- Reject button (hidden for `team_member` role)
- Assign Workspace dropdown (populated from `GET /asana/workspaces`)
- Loading state during batch operations

References: FRS.md REQ-27-BATCH-01 through REQ-27-BATCH-07

Verification: Bar appears/disappears with selection. Approve fires batch API call. Role-based buttons hidden correctly.

---

### Task 4.2 — Add `BatchActionBar.module.scss` [small]
Sticky bar styles (appears at top of table on selection), action grouping, count text.

---

## Phase 5: InlineEdit and SlideOver (Full Implementations)

### Task 5.1 — Implement `SlideOver` component fully [large]
Replace the stub in `apps/ui/src/components/SlideOver/SlideOver.tsx` with the full implementation:
- `createPortal` to `document.body`
- Overlay backdrop with click-to-close
- Slide-in/out CSS transition (`transform: translateX`)
- Focus trap when `open=true`
- Escape key listener
- Width variants: `sm` (380px), `md` (560px), `lg` (720px)

References: TR.md §5 (SlideOver Component), FRS.md REQ-27-DETAIL-09, GS.md (Slide-over scenarios)

Verification: Panel slides in/out. Focus trapped inside. Escape closes panel. Backdrop click closes panel. No layout reflow on table behind panel.

---

### Task 5.2 — Implement `InlineEdit` component fully [medium]
Replace the stub in `apps/ui/src/components/InlineEdit/InlineEdit.tsx` with the full implementation:
- Display mode: `<span role="button" tabIndex={0}>` showing current value
- Edit mode: `<input>` focused on activation
- Enter/blur commits; Escape reverts
- `validate` function called before commit
- `saving` prop shows a spinner/checkmark
- `error` prop shows error state on the cell

References: TR.md §5 (InlineEdit Component), FRS.md REQ-27-TABLE-02 through REQ-27-TABLE-07

Verification: Click activates edit mode. Enter commits and shows success flash. Escape reverts. Validation blocks invalid input.

---

### Task 5.3 — Add rich text editor dependency [small]
Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` to `apps/ui/package.json`.
Add `dompurify` and `@types/dompurify` for HTML sanitization.

Run `npm install` (or equivalent) in `apps/ui/`.

References: TR.md §1 (Technology Stack), TR.md §11 (Infrastructure Requirements)

Verification: `nx run ui:build` passes with TipTap dependencies resolved. No peer dependency warnings.

---

### Task 5.4 — Implement `RichTextEditor` component fully [large]
Replace the stub in `apps/ui/src/components/RichTextEditor/RichTextEditor.tsx`:
- TipTap editor with `StarterKit`, `Placeholder`
- Toolbar: Bold, Italic, Bullet List, Ordered List
- `sections` prop: renders labeled section headers (Task Context, Additional Context, Requirements) as non-editable h3 elements preceding each section's content area
- `onCommit` called on editor blur
- `readOnly` prop disables editing and hides toolbar
- HTML output passed to `onChange`

References: TR.md §5 (RichTextEditor Component), FRS.md REQ-27-DETAIL-04

Verification: Editor renders with toolbar. Bold/italic/list formatting works. Section headers visible. `readOnly` hides toolbar. `onCommit` fires on blur.

---

## Phase 6: Task Table

### Task 6.1 — Build `TaskTable` component [large]
Create `apps/ui/src/features/tasks/components/TaskTable.tsx`:
- `<table>` with `<thead>` column headers (checkbox, Short ID, Title, Assignee, Est. Time, Scrum Stage, Workspace, Status, Actions)
- Renders `<TaskRow>` per task
- Column header checkboxes for select-all
- Loading skeleton (multiple skeleton rows)
- Empty state: "No tasks match the current filters."
- Pagination controls below the table

References: FRS.md REQ-27-TABLE-01 through REQ-27-TABLE-13, TR.md §7 (Column Width Strategy)

Verification: Table renders all 9 columns. Skeleton shows on load. Empty state on empty list.

---

### Task 6.2 — Build `TaskRow` component [large]
Create `apps/ui/src/features/tasks/components/TaskRow.tsx`:
- Checkbox cell with `aria-label="Select task {short_id}"`
- Short ID: monospace text, `role="button"`, `onClick` triggers slide-over
- Title: `InlineEdit` text input
- Assignee: `InlineEdit` custom dropdown (team member names)
- Estimated Time: `InlineEdit` time input (formatted as `hh mm`, stored as minutes)
- Scrum Stage: `InlineEdit` custom dropdown
- Asana Workspace: `InlineEdit` custom dropdown; client default shown as hint when no override
- Status: `Badge` (non-editable)
- Actions: contextual buttons based on status and role

References: FRS.md REQ-27-TABLE-01 through REQ-27-TABLE-13, TR.md §4 (Optimistic Update Pattern)

Verification: All inline edits work. Status badge updates after action. Role-based buttons hidden. Workspace hint shown when no override.

---

### Task 6.3 — Add `TaskTable.module.scss` and `TaskRow.module.scss` [medium]
- `TaskTable.module.scss`: table layout, header styles, pagination row
- `TaskRow.module.scss`: CSS grid column layout (see TR.md §7), cell padding, hover row highlight, action button group visibility on hover, inline-edit overlay styles

References: TR.md §7 (SCSS Architecture, Column Width Strategy)

Verification: Table is visually correct — columns align between header and rows. Actions visible on row hover.

---

## Phase 7: Task Detail Slide-Over Panel

### Task 7.1 — Build `TaskDetailPanel` component [large]
Create `apps/ui/src/features/tasks/components/TaskDetailPanel.tsx`:
- Uses `SlideOver` component
- Header: Short ID, status badge, client name, Close button
- Title: `InlineEdit` text
- Description: `RichTextEditor` with three sections (Task Context, Additional Context, Requirements)
- Custom fields section: Assignee, Estimated Time, Scrum Stage, Workspace, Project (all inline-editable)
- Version history sidebar: collapsible via "History" toggle button, renders `VersionHistory` component
- Source transcript link (if `transcript_id` present on task)
- Action buttons: Approve, Reject, Push (role-aware)
- All edits call `useTaskMutations.editTask`; all actions call their respective mutation functions

References: FRS.md REQ-27-DETAIL-01 through REQ-27-DETAIL-09, TR.md §5 (Panel State)

Verification: Panel opens/closes correctly. All fields editable. Version history expands. Actions update both panel and table row.

---

### Task 7.2 — Build `VersionHistory` component [medium]
Create `apps/ui/src/features/tasks/components/VersionHistory.tsx`:
- Props: `entries: VersionEntry[]`
- Renders a list of version entries ordered newest-first
- Each entry: editor name, source badge (`agent` / `ui` / `terminal`), field changed, old → new value, relative timestamp

References: FRS.md REQ-27-DETAIL-06, TR.md §3 (GET /tasks/{id} — VersionEntry)

Verification: Version history renders with all fields. Agent entries show "agent" badge. UI entries show "ui" badge.

---

### Task 7.3 — Add `TaskDetailPanel.module.scss` [medium]
- Panel header layout (Short ID + badge + close button)
- Section groupings (title, description, custom fields, action bar)
- Version history sidebar: collapsible panel, diff styles, source badge colors
- Source transcript link style

---

## Phase 8: Integration

### Task 8.1 — Wire all components into `TaskReviewPage` [medium]
Finalize `TaskReviewPage.tsx`:
- Pass `filters` state and `updateFilters` to `FilterBar`
- Pass `selectedIds`, callbacks, and role to `BatchActionBar`
- Pass `tasks`, `selectedIds`, mutation handlers, and role to `TaskTable`
- Pass `activeTaskId`, mutations, and client data to `TaskDetailPanel`
- Implement pagination controls with `page`/`limit` state synced to URL

References: TR.md §4 (State Architecture), TR.md §6 (URL State Management)

Verification: Full round-trip: filter tasks, select, batch approve, open detail, edit, approve from panel — all work end-to-end.

---

### Task 8.2 — Smoke test full workflow [small]
Manual verification:
1. Navigate to `/clients/{id}/tasks` — table loads with filters
2. Apply status filter — table refilters, URL updates
3. Select tasks — batch bar appears with count
4. Batch approve — status badges update, selection cleared
5. Click Short ID — slide-over opens with correct task data
6. Edit title inline in table — PATCH fires, cell updates
7. Edit description in panel — PATCH fires on blur
8. Expand version history — entries visible with source badges
9. Push task with no workspace — `WORKSPACE_NOT_CONFIGURED` error shown on row
10. Login as team_member — Approve/Reject/Push buttons hidden

---

### Task 8.3 — TypeScript type-check [small]
Run `nx run ui:type-check`. Zero TypeScript errors.

---

### Task 8.4 — Update execution/job-queue/index.md [small]
Update Spec Status for feature 27 from `pending` to `complete`.

---

## Completion Checklist

Before marking feature 27 as complete, verify all of the following:

- [ ] Route `app/(dashboard)/clients/[client_id]/tasks/page.tsx` registered and functional
- [ ] Filter bar: status, transcript, and assignee filters work and update URL
- [ ] "Clear filters" resets all filters
- [ ] Batch action bar: hidden when no selection, shows count, select all works
- [ ] Batch approve/reject fires correct API requests
- [ ] Batch action buttons hidden for `team_member` role
- [ ] Task table renders all 9 columns with correct content
- [ ] Inline editing: title, assignee, time, scrum stage, workspace — all save via PATCH
- [ ] Optimistic updates apply immediately; revert on API error
- [ ] Row actions: Approve/Reject/Push contextual and role-aware
- [ ] Push fails with `WORKSPACE_NOT_CONFIGURED` shown inline on row
- [ ] Task detail slide-over opens on Short ID click
- [ ] Panel: title, description (3 sections), custom fields all editable
- [ ] Panel: version history collapsible, shows source badges
- [ ] Panel: source transcript link present for agent-generated tasks
- [ ] Panel: actions update both panel status and table row status
- [ ] SlideOver: focus trapped, Escape closes, backdrop closes
- [ ] RichTextEditor: toolbar works, sections rendered, `readOnly` mode works
- [ ] Pagination controls work and sync with URL
- [ ] `nx run ui:build` passes
- [ ] `nx run ui:type-check` passes
- [ ] Spec status in `execution/job-queue/index.md` updated to `complete`
