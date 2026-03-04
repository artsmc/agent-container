# TR — Technical Requirements
## Feature 28: UI Agenda Editor
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
| Rich text editing | TipTap (same as Feature 27) | Shared `RichTextEditor` component; TipTap reads/writes ProseMirror JSON natively — this is the natural fit for the content format |
| Collaborative sync | Polling (5s interval) for V1 | Swap hook for WebSocket in V2 |
| Focus trapping | Same `focus-trap` pattern as Feature 27 | For modals (Share, Email, Finalize confirm) |

---

## 2. Repository Structure

```
apps/ui/src/app/(dashboard)/
├── clients/[client_id]/agendas/
│   ├── page.tsx                        # Agenda List page
│   └── AgendaListPage.module.scss
└── agendas/[short_id]/
    ├── page.tsx                        # Agenda Editor page
    └── AgendaEditorPage.module.scss

apps/ui/src/features/agendas/
├── components/
│   ├── AgendaListPage.tsx
│   ├── AgendaEditorPage.tsx
│   ├── AgendaEditorHeader.tsx
│   ├── AgendaEditorHeader.module.scss
│   ├── AgendaSection.tsx
│   ├── AgendaSection.module.scss
│   ├── CommentsPanel.tsx
│   ├── CommentsPanel.module.scss
│   ├── CommentThread.tsx
│   ├── CommentThread.module.scss
│   ├── VersionHistoryPanel.tsx
│   ├── VersionHistoryPanel.module.scss
│   ├── ActionBar.tsx
│   ├── ActionBar.module.scss
│   ├── ShareModal.tsx
│   ├── ShareModal.module.scss
│   ├── EmailModal.tsx
│   ├── EmailModal.module.scss
│   └── PresenceIndicator.tsx
├── hooks/
│   ├── useAgendaList.ts               # Fetches GET /clients/{id}/agendas
│   ├── useAgendaDetail.ts             # Fetches GET /agendas/{id}
│   ├── useAgendaMutations.ts          # PATCH, finalize, share, email, export
│   ├── useAgendaSync.ts              # Polling (V1) / WebSocket (V2) sync hook
│   └── useAgendaComments.ts          # Comment CRUD
└── types.ts
```

---

## 3. API Contracts

### GET /clients/{id}/agendas

**Purpose:** Populate the Agenda List screen.

**Response shape:**
```typescript
interface AgendaSummary {
  id: string
  short_id: string               // e.g., "AGD-0015"
  cycle_start: string            // ISO 8601 date ("2026-02-01")
  cycle_end: string              // ISO 8601 date ("2026-02-14")
  status: AgendaStatus
  last_edited_by: {
    name: string                 // "Mastra Agent" if source is agent
    source: 'agent' | 'ui' | 'terminal'
  }
  last_edited_at: string         // ISO 8601
  comment_count: number          // For the Comments badge
}

type AgendaStatus = 'draft' | 'in_review' | 'finalized' | 'shared'
```

---

### GET /agendas/{id}

**Purpose:** Load the full agenda for the editor. Accepts short ID (e.g., `AGD-0015`) or UUID.

**Response shape:**
```typescript
interface Agenda {
  id: string
  short_id: string
  client_id: string
  client_name: string            // Resolved by API
  cycle_start: string
  cycle_end: string
  status: AgendaStatus
  content: AgendaContent
  comments: AgendaComment[]
  version_history: AgendaVersionEntry[]
  version: number                // Monotonically increasing; used for conflict detection
  last_edited_at: string
}

interface AgendaContent {
  completed_tasks: object        // ProseMirror JSON document
  incomplete_tasks: object
  relevant_deliverables: object
  recommendations: object
  new_ideas: object
  next_steps: object
}

interface AgendaComment {
  id: string
  author: { id: string; name: string; initials: string }
  text: string
  created_at: string
  replies: AgendaCommentReply[]
}

interface AgendaCommentReply {
  id: string
  author: { id: string; name: string; initials: string }
  text: string
  created_at: string
}

interface AgendaVersionEntry {
  id: string
  changed_at: string
  changed_by: {
    name: string
    source: 'agent' | 'ui' | 'terminal'
  }
  section: string               // e.g., "recommendations"
  old_content: object           // ProseMirror JSON diff snippet
  new_content: object           // ProseMirror JSON diff snippet
}
```

---

### PATCH /agendas/{id}

**Purpose:** Auto-save content changes from the editor.

**Request body (partial):**
```typescript
interface PatchAgendaBody {
  content?: Partial<AgendaContent>
  version?: number    // Optimistic concurrency — send the client's current version
}
```

**Response:** Updated `Agenda` object (includes new `version` number).

**Error cases:**
- `409 CONFLICT` (version mismatch): API has a newer version — response includes current server content. UI must merge or refresh.
- `423 LOCKED` (agenda is finalized): Show banner "This agenda is locked."
- `5xx`: Show "Save failed — Retry" indicator.

---

### POST /agendas/{id}/finalize

**Request:** Empty body.
**Response:** Updated `Agenda` with `status: 'finalized'`.
**Error:** `{ code: 'FINALIZE_REQUIRES_EDIT' }` — agenda has not been modified since creation.

---

### POST /agendas/{id}/share

**Request:** Empty body.
**Response:**
```typescript
interface ShareResponse {
  client_url: string    // https://app.iexcel.com/shared/{token}
  internal_url: string  // https://app.iexcel.com/agendas/{short_id}
  agenda: Agenda        // Updated agenda (status: 'shared')
}
```

---

### POST /agendas/{id}/email

**Request body:**
```typescript
interface EmailAgendaBody {
  recipients: string[]   // Validated email addresses
  subject: string
}
```

**Response:** `{ sent_to: string[]; message_id: string }`

---

### POST /agendas/{id}/export

**Request:** `?format=google_docs` or `?format=pdf` as query param.

**Response:**
- Google Docs: `{ google_doc_url: string }`
- PDF: A file download response (the API streams the PDF, or returns a signed URL for download)

---

### GET /agendas/{id} (polling)

Used by `useAgendaSync` at 5-second intervals to detect changes from other users.

**Optimisation:** The polling request should include the current `version` as a query param (`?since_version={n}`). The API can return `304 Not Modified` if no changes have occurred, reducing response payload.

---

## 4. State Architecture

### Editor State

```typescript
interface AgendaEditorState {
  agenda: Agenda | null
  loading: boolean
  error: Error | null
  saveStatus: 'saved' | 'saving' | 'failed' | 'unsaved'
  lastSavedAt: Date | null
  isFinalized: boolean     // true if status is 'finalized' or 'shared'
}
```

### Auto-Save Debounce

```typescript
// In AgendaEditorPage.tsx
const AUTOSAVE_DELAY = 1500  // ms

const [pendingContent, setPendingContent] = useState<Partial<AgendaContent>>({})
const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

function handleSectionChange(section: keyof AgendaContent, value: string) {
  // Update local content immediately (optimistic)
  setAgenda(prev => ({ ...prev, content: { ...prev.content, [section]: value } }))

  // Update pending changes
  setPendingContent(prev => ({ ...prev, [section]: value }))

  // Reset debounce timer
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  debounceTimerRef.current = setTimeout(() => {
    triggerAutoSave(pendingContent)
    setPendingContent({})
  }, AUTOSAVE_DELAY)
}
```

### Polling Sync (`useAgendaSync`)

```typescript
// hooks/useAgendaSync.ts
export function useAgendaSync(
  agendaId: string,
  currentVersion: number,
  onRemoteUpdate: (agenda: Agenda) => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(async () => {
      const response = await apiClient.get(
        `/agendas/${agendaId}?since_version=${currentVersion}`
      )
      if (response.status !== 304 && response.version > currentVersion) {
        onRemoteUpdate(response)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [agendaId, currentVersion, enabled])
}
```

The `onRemoteUpdate` callback is called only if the server version is newer. The `AgendaEditorPage` handles merging — if the user is actively typing (debounce timer is active), queue the remote update and apply it after the user's debounce resolves.

---

## 5. Component Implementation Details

### AgendaSection Component

```typescript
interface AgendaSectionProps {
  label: string                           // e.g., "Completed Tasks"
  sectionKey: keyof AgendaContent
  value: object                           // ProseMirror JSON document
  onChange: (value: string) => void
  readOnly: boolean
  className?: string
}
```

Renders:
1. Non-editable `<h3>` with the section label
2. `<RichTextEditor value={value} onChange={onChange} readOnly={readOnly} onCommit={...} />`

The six section instances are created from a constant:

```typescript
const AGENDA_SECTIONS: { label: string; key: keyof AgendaContent }[] = [
  { label: 'Completed Tasks', key: 'completed_tasks' },
  { label: 'Incomplete Tasks', key: 'incomplete_tasks' },
  { label: 'Relevant Deliverables', key: 'relevant_deliverables' },
  { label: 'Recommendations', key: 'recommendations' },
  { label: 'New Ideas', key: 'new_ideas' },
  { label: 'Next Steps', key: 'next_steps' },
]
```

### CommentsPanel Component

The comments panel is a right-side collapsible panel (not a `SlideOver` — it doesn't cover the editor; it pushes the editor's width). It uses CSS transitions on `width` to expand and collapse.

```scss
/* CommentsPanel.module.scss */
.panel {
  width: 0;
  overflow: hidden;
  transition: width tokens.$duration-normal tokens.$ease-out;

  &.open {
    width: 320px;
  }
}
```

### ShareModal and EmailModal

Both modals use the `Modal` component from feature 23 (to be fleshed out). They render inside React portals and trap focus.

**ShareModal** — simple: two rows with URL and Copy button each.

**EmailModal** — uses `TagInput` (from feature 26) for the recipients field, a standard text input for subject, and a read-only preview pane showing the agenda content.

### ActionBar Component

The action bar is a `position: sticky; bottom: 0` bar within the editor layout:

```typescript
interface ActionBarProps {
  agenda: Agenda
  userRole: UserRole
  onFinalize: () => void
  onShare: () => void
  onEmail: () => void
  onExport: (format: 'google_docs' | 'pdf') => void
  saving: boolean
}
```

---

## 6. SCSS Architecture

### New SCSS Modules

| File | Purpose |
|---|---|
| `AgendaListPage.module.scss` | Card list/grid layout, empty state |
| `AgendaEditorPage.module.scss` | Main editor layout: header, sections, action bar, sidebars |
| `AgendaEditorHeader.module.scss` | Short ID + status row, cycle dates, auto-save indicator |
| `AgendaSection.module.scss` | Section header, editor area borders/spacing |
| `CommentsPanel.module.scss` | Collapsible right sidebar, comment thread spacing |
| `CommentThread.module.scss` | Comment bubble, author, timestamp, reply indent |
| `VersionHistoryPanel.module.scss` | Version entry list, diff view (red/green), source badge |
| `ActionBar.module.scss` | Sticky bottom bar, button grouping, export dropdown |
| `ShareModal.module.scss` | URL rows, copy button |
| `EmailModal.module.scss` | Form layout, preview pane |

### Editor Layout Strategy

The Agenda Editor uses a CSS Grid layout for its three-column structure (when fully expanded):

```scss
/* AgendaEditorPage.module.scss */
.editorLayout {
  display: grid;
  grid-template-columns: 1fr 0fr 0fr;  // [content] [comments] [history]
  grid-template-rows: auto 1fr auto;    // [header] [content] [action-bar]
  min-height: 100vh;
  transition: grid-template-columns tokens.$duration-normal tokens.$ease-out;

  &.commentsOpen {
    grid-template-columns: 1fr 320px 0fr;
  }

  &.historyOpen {
    grid-template-columns: 1fr 0fr 320px;
  }

  &.bothOpen {
    grid-template-columns: 1fr 280px 280px;
  }
}
```

This avoids the `width: 0` overflow trick and makes the layout declarative.

---

## 7. Presence Indicators

Presence is implemented as a lightweight layer on top of the polling:

```typescript
// Piggyback on the PATCH request headers:
// X-Active-User: {user_id}
// The API tracks active users per agenda and returns them in GET /agendas/{id}

interface Agenda {
  // ... existing fields
  active_users?: { id: string; name: string; initials: string }[]
}
```

The `PresenceIndicator` component renders the `active_users` list as avatar chips:

```typescript
interface PresenceIndicatorProps {
  users: { id: string; name: string; initials: string }[]
  currentUserId: string  // To exclude the current user from their own presence list
}
```

In V1, active users are derived from the polling response. In V2 (WebSocket), presence updates in real-time.

---

## 8. Performance Considerations

- **Debounced auto-save** (1500ms) prevents excessive PATCH requests while typing.
- **Polling at 5s** is a reasonable V1 cadence — at most 12 requests/minute per active session. This is acceptable for a small team (< 20 simultaneous editors per agenda is unrealistic in practice).
- **Version-based polling**: Sending `?since_version={n}` allows the API to return `304 Not Modified` for unchanged agendas, reducing response size.
- **`useAgendaSync` disabled when finalized**: No polling needed for finalized/shared agendas — they are read-only.
- **Comment count badge**: The `comment_count` field on the `AgendaSummary` avoids fetching full comment lists on the Agenda List screen.
- **RichTextEditor lazy init**: TipTap editor initialization is deferred until the section is first scrolled into view (Intersection Observer) if there are performance concerns with 6 simultaneous editor instances.

---

## 9. Security Considerations

- **Finalize role enforcement**: The `POST /agendas/{id}/finalize` endpoint enforces `account_manager` or `admin` role server-side. The UI hides the button for `team_member` as a UX improvement only.
- **Comment isolation**: The API must ensure internal comments are never included in the `GET /shared/{token}` response used by feature 29. This is API-side security; feature 28 does not need additional client-side filtering.
- **Share token confidentiality**: The client-facing URL contains an opaque token. The UI must not log or expose this token in error messages, analytics events, or local storage beyond the immediate session.
- **PATCH version field**: Including the `version` field in PATCH requests provides basic optimistic concurrency protection. The API can detect concurrent edits and return a 409 conflict. This is not cryptographic — it prevents innocent accidents, not malicious overwrites.
- **Email recipients validation**: Client-side validation of email format in the EmailModal's `TagInput` component (same pattern as Feature 26's SettingsTab). Server-side validation is authoritative.

---

## 10. Testing Strategy

Unit tests:

| Test Target | Test Cases |
|---|---|
| `useAgendaSync` | Does not poll when `enabled=false`; calls `onRemoteUpdate` when version is newer; does not call when version is same |
| `useAgendaMutations.finalize` | Calls POST finalize, handles `FINALIZE_REQUIRES_EDIT`, updates status on success |
| `useAgendaMutations.share` | Calls POST share, returns two URLs, updates status to `shared` |
| `AgendaSection` | Renders section label as non-editable h3; calls `onChange` on content change; read-only mode hides toolbar |
| `CommentsPanel` | Renders collapsed by default; expands on toggle; displays comment count badge |
| `ActionBar` | Finalize hidden for `team_member`; Share disabled for non-finalized; Email disabled for non-finalized |
| Auto-save debounce | Confirm single PATCH fired after 1500ms of typing, not on every keypress |

Integration test (manual):
1. Open an agenda, edit each section, wait for auto-save — confirm PATCH fires, indicator updates.
2. Finalize — confirm confirmation modal appears, editor locks on success.
3. Share — confirm modal with two URLs appears, status updates to `shared`.
4. Email — confirm modal pre-fills recipients, send fires POST, toast appears.
5. Open two sessions, edit different sections — confirm polling picks up changes in session B after 5s.

---

## 11. Infrastructure Requirements

| Requirement | Detail |
|---|---|
| **Routes** | `app/(dashboard)/clients/[client_id]/agendas/page.tsx` and `app/(dashboard)/agendas/[short_id]/page.tsx` — no new infrastructure |
| **WebSocket (V2)** | When upgrading `useAgendaSync` to WebSocket, will require Render WebSocket support (feature 36) or a separate connection service. Feature 28 does NOT need this for V1. |
| **TipTap** | Already added as a dependency if Feature 27 was built first. If not, add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` to `apps/ui/package.json`. |
| **No new Nx projects** | All new files land in `apps/ui/` |
