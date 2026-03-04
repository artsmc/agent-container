# TR — Technical Requirements
## Feature 27: UI Task Review
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Technology Stack

| Concern | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.x (App Router) | Inherited from feature 23 |
| Language | TypeScript 5.1+ | Inherited from feature 23 |
| Styling | SCSS Modules + `@iexcel/ui-tokens` | No Tailwind, no shadcn |
| Data fetching | `@iexcel/api-client` | From feature 22 |
| Rich text editing | TipTap (open source ProseMirror-based) | Or a custom `contentEditable` implementation if bundle size is a concern |
| Focus trapping | Custom hook or `focus-trap` library | For `SlideOver` panel accessibility |

**Note on rich text editor choice:** TipTap is the recommended library for the `RichTextEditor` component because it has no Tailwind dependency and its extensions are composable. If TipTap is rejected, the fallback is a custom `contentEditable` implementation. This decision must be made before Task 5.2 (RichTextEditor full implementation).

---

## 2. Repository Structure

```
apps/ui/src/app/(dashboard)/clients/[client_id]/tasks/
├── page.tsx                          # Task Review page (client component)
└── TaskReviewPage.module.scss

apps/ui/src/features/tasks/
├── components/
│   ├── FilterBar.tsx
│   ├── FilterBar.module.scss
│   ├── BatchActionBar.tsx
│   ├── BatchActionBar.module.scss
│   ├── TaskTable.tsx
│   ├── TaskTable.module.scss
│   ├── TaskRow.tsx
│   ├── TaskRow.module.scss
│   ├── TaskDetailPanel.tsx
│   ├── TaskDetailPanel.module.scss
│   └── VersionHistory.tsx
├── hooks/
│   ├── useTaskList.ts                # Fetches GET /clients/{id}/tasks with filters
│   ├── useTaskDetail.ts              # Fetches GET /tasks/{id}
│   ├── useTaskMutations.ts           # PATCH, approve, reject, push actions
│   └── useInlineEdit.ts             # Generic inline edit state management
└── types.ts

apps/ui/src/components/
├── SlideOver/                        # Flesh out existing stub
│   ├── SlideOver.tsx
│   ├── SlideOver.module.scss
│   └── index.ts
├── InlineEdit/                       # Flesh out existing stub
│   ├── InlineEdit.tsx
│   ├── InlineEdit.module.scss
│   └── index.ts
└── RichTextEditor/                   # Flesh out existing stub
    ├── RichTextEditor.tsx
    ├── RichTextEditor.module.scss
    └── index.ts
```

---

## 3. API Contracts

### GET /clients/{id}/tasks

**Purpose:** Populate the task table with filter and pagination support.

**Query params:**
```
status?:      'draft' | 'approved' | 'rejected' | 'pushed' | 'completed'
transcript_id?: string
assignee_id?:  string
limit:         number (default: 25)
offset:        number (default: 0)
```

**Response shape:**
```typescript
interface Task {
  id: string
  short_id: string                    // e.g., "TSK-0042"
  title: string
  description: TaskDescription | null
  status: TaskStatus
  assignee: Assignee | null
  estimated_minutes: number | null    // Stored as total minutes
  scrum_stage: ScrumStage | null
  asana_workspace_id: string | null   // Task-level override
  asana_workspace_name: string | null // Resolved by API
  asana_project_id: string | null
  asana_project_name: string | null
  transcript_id: string | null
  client_id: string
  created_at: string
  updated_at: string
}

interface TasksResponse {
  tasks: Task[]
  total: number
  limit: number
  offset: number
}

type TaskStatus = 'draft' | 'approved' | 'rejected' | 'pushed' | 'completed'
type ScrumStage = 'backlog' | 'to_do' | 'in_progress' | 'in_review' | 'done'  // Confirm values from shared-types

interface TaskDescription {
  task_context: string        // Rich text HTML or markdown
  additional_context: string
  requirements: string
}

interface Assignee {
  id: string
  name: string
  initials: string
}
```

---

### GET /tasks/{id}

**Purpose:** Load full task detail for the slide-over panel, including version history.

**Response shape:** Same as `Task` above, plus:
```typescript
interface TaskDetail extends Task {
  version_history: VersionEntry[]
  source_transcript_quote: string | null  // Relevant quote from the transcript
}

interface VersionEntry {
  id: string
  changed_at: string             // ISO 8601
  changed_by: {
    name: string
    source: 'agent' | 'ui' | 'terminal'
  }
  field: string                  // e.g., "title", "assignee", "status"
  old_value: string | null
  new_value: string | null
}
```

---

### PATCH /tasks/{id}

**Purpose:** Inline edit saves (any field) and description edits from the panel.

**Request body (partial):**
```typescript
interface PatchTaskBody {
  title?: string
  description?: TaskDescription
  assignee_id?: string | null
  estimated_minutes?: number | null
  scrum_stage?: ScrumStage | null
  asana_workspace_id?: string | null
  asana_project_id?: string | null
}
```

**Response:** Updated `Task` object.

**Error cases:**
- `400` → Validation error; show field-level inline error
- `409` → Conflict (concurrent edit); show conflict error with current value
- `5xx` → Revert cell; show row error indicator

---

### POST /tasks/{id}/approve

**Request:** Empty body.
**Response:** Updated `Task` with `status: 'approved'`.

---

### POST /tasks/{id}/reject

**Request:** Empty body (no reason required in V1).
**Response:** Updated `Task` with `status: 'rejected'`.

---

### POST /tasks/{id}/push

**Request:** Empty body.
**Response:** Updated `Task` with `status: 'pushed'`.

**Error:** `{ code: 'WORKSPACE_NOT_CONFIGURED' }` → Display workspace error on the row.

---

### POST /clients/{id}/tasks/approve (batch)

**Request body:**
```typescript
interface BatchApproveBody {
  task_ids: string[]    // UUIDs or short IDs
}
```
**Response:**
```typescript
interface BatchApproveResponse {
  succeeded: string[]
  failed: { id: string; error: string }[]
}
```

---

### GET /clients/{id}/transcripts (filter dropdown)

**Purpose:** Populate the transcript filter dropdown.
Same shape as Feature 26's transcript summary.

---

### GET /asana/workspaces

**Purpose:** Populate workspace dropdowns (filter bar, inline edit, task panel).
Same shape as Feature 26.

---

### GET /asana/workspaces/{id}/projects

**Purpose:** Populate the Asana Project dropdown in the task detail panel.
Same shape as Feature 26.

---

## 4. State Architecture

### Task List State

The task list state is managed by the `useTaskList` hook:

```typescript
interface TaskListState {
  tasks: Task[]
  total: number
  loading: boolean
  error: Error | null
  filters: {
    status: TaskStatus | null
    transcript_id: string | null
    assignee_id: string | null
  }
  pagination: {
    page: number
    limit: number
  }
}
```

Filters and pagination are synced bidirectionally with the URL search params.

### Selection State

```typescript
interface SelectionState {
  selectedIds: Set<string>    // Task UUIDs
}
```

Selection is cleared when:
- Filters change (task list re-fetches, different rows may be visible)
- A batch action completes

### Optimistic Update Pattern

For inline edits and row actions:

```typescript
// 1. Capture original value
const original = task.title

// 2. Apply optimistic update to local state
updateTask(taskId, { title: newValue })

// 3. Fire API call
const result = await apiClient.patch(`/tasks/${taskId}`, { title: newValue })
  .catch(error => {
    // 4a. On error: revert
    updateTask(taskId, { title: original })
    setRowError(taskId, error.message)
    return null
  })

// 4b. On success: sync with server response
if (result) updateTask(taskId, result)
```

### Panel State

The slide-over panel manages its own task detail state separately from the list state. When an action (approve/reject/push) is performed in the panel, the list state is also updated by matching on task ID.

---

## 5. Component Implementation Details

### SlideOver Component (full implementation)

The `SlideOver` stub from feature 23 must be fleshed out with:

```typescript
interface SlideOverProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  width?: 'sm' | 'md' | 'lg'   // default: 'md'
}
```

Implementation requirements:
- Renders as a fixed-position panel from the right edge of the viewport
- Overlay backdrop (semi-transparent) covers the rest of the page; clicking it calls `onClose`
- Focus trap: when `open=true`, Tab key cycles within the panel only
- Keyboard: Escape key calls `onClose`
- Enter/exit animation: slide in from right on open, slide out to right on close — using CSS transitions (not JS animation libraries)
- Panel renders in a React `createPortal` targeting `document.body` to avoid stacking context issues

```scss
/* SlideOver.module.scss */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 200;
}

.panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 560px;   // md width
  background: tokens.$color-surface-default;
  box-shadow: tokens.$shadow-xl;
  transform: translateX(100%);
  transition: transform tokens.$duration-normal tokens.$ease-out;
  z-index: 201;
  overflow-y: auto;

  &.open {
    transform: translateX(0);
  }
}
```

### InlineEdit Component (full implementation)

The `InlineEdit` stub must be fleshed out:

```typescript
interface InlineEditProps {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void    // Called on Enter or blur — triggers save
  onRevert?: () => void                // Called on Escape — reverts without saving
  placeholder?: string
  type?: 'text' | 'time'
  validate?: (value: string) => string | null  // Returns error message or null
  saving?: boolean                     // Shows saving indicator
  error?: string                       // Shows error state
  className?: string
  displayClassName?: string            // Styles for the read-only display mode
}
```

Behaviour:
- **Display mode**: renders a `<span>` or `<div>` with `role="button"` and `tabIndex={0}`; clicking or pressing Enter enters edit mode
- **Edit mode**: renders an `<input>` (or `<textarea>` for `type="multiline"`) focused immediately
- **Commit**: Enter key or blur triggers `onCommit` after calling `validate`; if validation fails, show error and keep in edit mode
- **Revert**: Escape key triggers `onRevert` and returns to display mode with the original value

### RichTextEditor Component (full implementation)

Using TipTap:

```typescript
interface RichTextEditorProps {
  value: string           // HTML string
  onChange: (value: string) => void
  onCommit?: () => void   // Called when editor loses focus (auto-save trigger)
  sections?: { label: string; key: string }[]  // Optional section headers
  readOnly?: boolean
  placeholder?: string
  className?: string
}
```

TipTap extensions to enable:
- `StarterKit` (bold, italic, heading, bullet list, ordered list, code)
- `Placeholder`
- Custom `Section` node for the three structural sections (Task Context, Additional Context, Requirements)

The editor renders each section as a labeled block with a ProseMirror node. The section structure is preserved in the HTML output.

### TaskTable Component

```typescript
interface TaskTableProps {
  tasks: Task[]
  loading: boolean
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onTaskClick: (taskId: string) => void   // Opens slide-over
  onInlineEdit: (taskId: string, field: string, value: unknown) => void
  clientDefaultWorkspaceId: string | null
  clientDefaultWorkspaceName: string | null
  userRole: UserRole
  workspaces: AsanaWorkspace[]
  teamMembers: TeamMember[]
}
```

### FilterBar Component

```typescript
interface FilterBarProps {
  filters: TaskFilters
  onFilterChange: (filters: Partial<TaskFilters>) => void
  transcripts: TranscriptSummary[]
  teamMembers: TeamMember[]
  loading?: boolean
}
```

---

## 6. URL State Management

Filter state is fully encoded in the URL to support shareable, bookmarkable views:

```
/clients/{id}/tasks?status=draft&assignee_id=user-123&page=2
```

Pattern:
```typescript
// Read filters from URL on mount
const searchParams = useSearchParams()
const filters = {
  status: searchParams.get('status') as TaskStatus | null,
  transcript_id: searchParams.get('transcript_id'),
  assignee_id: searchParams.get('assignee_id'),
}
const page = parseInt(searchParams.get('page') ?? '1', 10)

// Update URL when filters change (replace, not push, to avoid polluting history)
function updateFilters(newFilters: Partial<TaskFilters>) {
  const params = new URLSearchParams(searchParams)
  Object.entries(newFilters).forEach(([key, value]) => {
    if (value) params.set(key, String(value))
    else params.delete(key)
  })
  params.set('page', '1')  // Reset to page 1 on filter change
  router.replace(`?${params.toString()}`, { scroll: false })
}
```

---

## 7. SCSS Architecture

### New SCSS Modules

| File | Purpose |
|---|---|
| `FilterBar.module.scss` | Horizontal filter row, dropdown widths |
| `BatchActionBar.module.scss` | Sticky bar appearance, action button grouping |
| `TaskTable.module.scss` | Table layout, column widths, row hover states |
| `TaskRow.module.scss` | Cell styles, inline-edit overlay, row action button group |
| `TaskDetailPanel.module.scss` | Panel sections, description editor area, fields grid |
| `SlideOver.module.scss` | Full panel animation, overlay, portal styles |
| `InlineEdit.module.scss` | Display mode / edit mode toggle, error state |
| `RichTextEditor.module.scss` | Editor toolbar, section headers, content area |
| `VersionHistory.module.scss` | History entry list, source badge, diff display |

### Column Width Strategy

The task table uses CSS Grid (not flexbox or `<table>` with fixed widths) within a `<table>` structure — using `grid-template-columns` on `<tr>` elements for precise column control:

```scss
.row {
  display: grid;
  grid-template-columns:
    40px      // checkbox
    90px      // short ID
    1fr       // title (flex)
    120px     // assignee
    80px      // estimated time
    120px     // scrum stage
    160px     // workspace
    100px     // status badge
    140px;    // actions
  align-items: center;
}
```

---

## 8. Performance Considerations

- **Optimistic updates** prevent perceived lag on inline edits — the UI responds immediately without waiting for the API round-trip.
- **Pagination** (25 tasks/page) ensures the table never renders hundreds of rows simultaneously.
- **Virtual scrolling** is NOT required for 25-row pages. If future analysis shows pages > 100 rows are needed, reconsider.
- **SlideOver portal**: Rendering in `document.body` prevents the panel from being clipped by overflow-hidden ancestors and avoids layout reflow of the table behind it.
- **`useTaskDetail` lazy fetch**: The task detail (including version history) is only fetched when the slide-over is opened — not pre-fetched for all visible tasks.
- **Debounced filter changes**: Filter dropdown changes immediately re-fetch (no debounce needed — they are selection changes, not keystrokes).
- **Workspace dropdown caching**: `GET /asana/workspaces` is fetched once on page mount and shared between the filter bar, inline-edit workspace column, and the task detail panel.

---

## 9. Security Considerations

- **Role enforcement**: Role-based control visibility is implemented client-side as a UX improvement only. The API must enforce role-based authorization on all approve/reject/push endpoints server-side. A `403` response from the API must be handled gracefully (show a permission error toast).
- **Optimistic update rollback**: If an optimistic update is applied and the API returns `403` (unauthorized), the rollback path must restore the original value AND show a permission error — not just a generic error.
- **No sensitive data in URL**: Task IDs in the URL are UUID-based or short-ID-based. No personally identifiable information is encoded in the URL.
- **Rich text sanitization**: If the `RichTextEditor` outputs HTML, the HTML must be sanitized before rendering in non-editor contexts (e.g., source transcript quotes). Use `DOMPurify` or TipTap's built-in sanitization.

---

## 10. Testing Strategy

Unit tests:

| Test Target | Test Cases |
|---|---|
| `useTaskList` | Filter params applied, pagination correct, re-fetches on filter change |
| `useInlineEdit` | Commit calls onCommit, Escape reverts, validation blocks commit |
| `TaskRow` inline edit | Title edit saves, assignee change fires PATCH, workspace hint shown when no override |
| `SlideOver` | Opens on trigger, Escape closes, focus trapped inside, backdrop click closes |
| `BatchActionBar` | Hidden when no selection, shows count, select-all selects all visible, batch approve fires correct request |
| Role-based visibility | Approve/reject/push hidden for `team_member`, visible for `account_manager` |

Integration test (manual):
- Full workflow: load tasks, filter by status, select tasks, batch approve, verify status updates.
- Open task detail, edit description, verify PATCH fires, check version history entry added.
- Push to Asana with no workspace configured — verify `WORKSPACE_NOT_CONFIGURED` error shown inline.

---

## 11. Infrastructure Requirements

| Requirement | Detail |
|---|---|
| **Route** | `app/(dashboard)/clients/[client_id]/tasks/page.tsx` — no new infrastructure |
| **New npm dependency** | `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` (if TipTap is approved) |
| **DOMPurify** | `dompurify`, `@types/dompurify` — for sanitizing rich text HTML output |
| **No new Nx projects** | All new files land in `apps/ui/` |
