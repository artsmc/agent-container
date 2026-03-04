# TR — Technical Requirements
## Feature 26: UI Client Detail
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
| State management | React `useState` + `useReducer` for local state; no global state manager | |
| Routing | Next.js App Router | `useRouter`, `useSearchParams` for tab state |

**Explicit exclusions:** No Tailwind. No shadcn. No Radix UI. No global state manager (Redux, Zustand) for this feature.

---

## 2. Repository Structure

```
apps/ui/src/app/(dashboard)/clients/[client_id]/
├── page.tsx                          # Client detail page — server or client component
├── ClientDetailPage.tsx              # Main client component (if using client component pattern)
└── ClientDetailPage.module.scss      # Page-level styles

apps/ui/src/components/
├── ClientHeader/
│   ├── ClientHeader.tsx
│   ├── ClientHeader.module.scss
│   └── index.ts
├── TabNav/
│   ├── TabNav.tsx
│   ├── TabPanel.tsx
│   ├── TabNav.module.scss
│   └── index.ts
├── TagInput/
│   ├── TagInput.tsx
│   ├── TagInput.module.scss
│   └── index.ts
└── [existing stubs from feature 23 — Badge, Card, Avatar, Button, Table, TableRow]

apps/ui/src/features/clients/
├── hooks/
│   ├── useClient.ts                  # Fetches GET /clients/{id}
│   ├── useClientTasks.ts             # Fetches GET /clients/{id}/tasks
│   ├── useClientAgendas.ts           # Fetches GET /clients/{id}/agendas
│   ├── useClientTranscripts.ts       # Fetches GET /clients/{id}/transcripts
│   └── useClientImportStatus.ts     # Fetches GET /clients/{id}/import/status
├── components/
│   ├── TasksSummaryTab.tsx
│   ├── AgendasTab.tsx
│   ├── TranscriptsTab.tsx
│   ├── SettingsTab.tsx
│   └── HistoryTab.tsx
└── types.ts                          # Local type extensions if needed
```

---

## 3. API Contracts

All requests are made via `@iexcel/api-client`. The UI does not call the API directly.

### GET /clients/{id}

**Purpose:** Load the client entity for the header and settings form pre-fill.

**Response shape:**
```typescript
interface Client {
  id: string                         // UUID
  name: string
  grain_playlist_id: string | null
  default_asana_workspace_id: string | null
  default_asana_workspace_name: string | null  // Resolved by API
  default_asana_project_id: string | null
  email_recipients: string[]         // Parsed from JSONB
  routing_rules: Record<string, unknown> | null
}
```

**Error cases:**
- `404` → "Client not found" page state
- `401` → Auth redirect (handled by DashboardLayout / feature 24)
- `5xx` → Generic error state with retry

---

### GET /clients/{id}/tasks

**Purpose:** Populate the Tasks summary tab.

**Query params used:** `limit=10&sort=created_at:desc`

**Response shape:**
```typescript
interface TaskSummary {
  id: string
  short_id: string               // e.g., "TSK-0042"
  title: string
  status: 'draft' | 'approved' | 'rejected' | 'pushed' | 'completed'
  assignee: { id: string; name: string; initials: string } | null
  created_at: string             // ISO 8601
}

interface TasksResponse {
  tasks: TaskSummary[]
  total: number                  // Used to show "View all" link if total > 10
}
```

---

### GET /clients/{id}/agendas

**Purpose:** Populate the Agendas tab.

**Response shape:**
```typescript
interface AgendaSummary {
  id: string
  short_id: string               // e.g., "AGD-0015"
  cycle_start: string            // ISO 8601 date
  cycle_end: string              // ISO 8601 date
  status: 'draft' | 'in_review' | 'finalized' | 'shared'
  last_edited_by: { name: string; source: 'ui' | 'agent' | 'terminal' }
  last_edited_at: string         // ISO 8601
}
```

---

### GET /clients/{id}/transcripts

**Purpose:** Populate the Transcripts tab.

**Response shape:**
```typescript
interface TranscriptSummary {
  id: string
  call_date: string              // ISO 8601 date
  call_type: string              // e.g., "Intake Call", "Follow-up Call"
  status: 'processed' | 'pending'
}
```

---

### PATCH /clients/{id}

**Purpose:** Save Settings tab changes.

**Request body (partial — only changed fields):**
```typescript
interface PatchClientBody {
  default_asana_workspace_id?: string | null
  default_asana_project_id?: string | null
  email_recipients?: string[]
  routing_rules?: Record<string, unknown>
}
```

**Response:** Updated `Client` object (same shape as GET response).

**Error cases:**
- `400` → Validation error — display field-level error messages
- `409` → Conflict — display conflict message
- `5xx` → Generic inline error

---

### GET /clients/{id}/import/status

**Purpose:** Populate the History tab.

**Response shape:**
```typescript
interface ImportedRecord {
  id: string
  record_type: 'task' | 'agenda' | 'transcript'
  short_id: string | null
  title: string | null
  imported_at: string            // ISO 8601
  source_description: string     // e.g., "Historical import — Jan 2025 batch"
  is_imported: true              // Always true for records returned by this endpoint
}

interface ImportStatusResponse {
  records: ImportedRecord[]
  import_date: string | null     // Date of last import batch
  status: 'complete' | 'in_progress' | 'none'
}
```

---

### GET /asana/workspaces

**Purpose:** Populate the workspace dropdown in the Settings tab.

**Response shape:**
```typescript
interface AsanaWorkspace {
  id: string
  name: string
}
type AsanaWorkspacesResponse = AsanaWorkspace[]
```

---

### GET /asana/workspaces/{workspace_id}/projects

**Purpose:** Populate the project dropdown in the Settings tab (filtered by selected workspace).

**Response shape:**
```typescript
interface AsanaProject {
  id: string
  name: string
}
type AsanaProjectsResponse = AsanaProject[]
```

---

## 4. Component Architecture

### Page Component Strategy

The page at `app/(dashboard)/clients/[client_id]/page.tsx` is a **Server Component** that:
1. Reads the `client_id` from params
2. Calls `GET /clients/{client_id}` server-side (using the api-client with the server-side auth token)
3. Passes the client data as props to the `ClientDetailPage` Client Component

The `ClientDetailPage` Client Component handles:
- Tab state via `useSearchParams` + `useRouter`
- Lazy-loading of tab data
- All interactive state (Settings form, dirty detection)

This hybrid approach gives fast initial render of the header (server) while keeping tab interactions client-side.

### Tab State Management

```typescript
// Tab state driven by URL search param
const TABS = ['tasks', 'agendas', 'transcripts', 'settings', 'history'] as const
type TabId = typeof TABS[number]

// In ClientDetailPage.tsx:
const searchParams = useSearchParams()
const router = useRouter()
const activeTab: TabId = (searchParams.get('tab') as TabId) ?? 'tasks'

function setActiveTab(tab: TabId) {
  const params = new URLSearchParams(searchParams)
  params.set('tab', tab)
  router.replace(`?${params.toString()}`, { scroll: false })
}
```

### Lazy Loading Pattern

Each tab uses a mounted flag to avoid fetching until first activated:

```typescript
const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(new Set(['tasks']))

function handleTabChange(tab: TabId) {
  if (hasDirtySettings && activeTab === 'settings') {
    if (!confirm('You have unsaved settings changes. Leave without saving?')) return
  }
  setMountedTabs(prev => new Set(prev).add(tab))
  setActiveTab(tab)
}
```

Once a tab is in `mountedTabs`, its component renders and its data hook fires. The component is hidden (CSS `display: none`) when not active — not unmounted — so cached data is preserved.

### Data Hooks Pattern

Each tab has a dedicated hook following the pattern:

```typescript
// hooks/useClientTasks.ts
export function useClientTasks(clientId: string, enabled: boolean) {
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    apiClient.get(`/clients/${clientId}/tasks?limit=10&sort=created_at:desc`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [clientId, enabled])

  return { data, loading, error, retry: () => { /* re-trigger */ } }
}
```

The `enabled` parameter is `mountedTabs.has('tasks')` — it becomes true when the tab is first activated.

---

## 5. Settings Tab Technical Details

### Form State

The Settings form uses uncontrolled React state (not a form library):

```typescript
interface SettingsFormState {
  workspaceId: string | null
  projectId: string | null
  emailRecipients: string[]
  routingRules: string           // JSON string — validated on save
}
```

### Dirty State Detection

```typescript
const [savedSettings, setSavedSettings] = useState<SettingsFormState>(initialSettings)
const [formState, setFormState] = useState<SettingsFormState>(initialSettings)
const isDirty = JSON.stringify(formState) !== JSON.stringify(savedSettings)
```

On successful save, `savedSettings` is updated to match `formState`.

### TagInput Component

The `TagInput` component manages an array of string values:

```typescript
interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  validate?: (value: string) => string | null  // Returns error message or null
  placeholder?: string
  className?: string
}
```

Email validation uses a simple regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

---

## 6. SCSS Architecture

### New SCSS Modules

| File | Purpose |
|---|---|
| `ClientHeader.module.scss` | Header layout, name typography, workspace/link row |
| `TabNav.module.scss` | Horizontal tab bar, active indicator, tab panel wrapper |
| `TagInput.module.scss` | Tag chip styles, input field integration |
| `ClientDetailPage.module.scss` | Page-level layout constraints |
| `TasksSummaryTab.module.scss` | Summary table styles |
| `AgendasTab.module.scss` | Agenda card grid/list styles |
| `TranscriptsTab.module.scss` | Transcript table styles |
| `SettingsTab.module.scss` | Form layout, field groupings |
| `HistoryTab.module.scss` | History table styles |

### Design Tokens Applied

| Token Category | Usage |
|---|---|
| `$color-primary` | Active tab indicator, primary action buttons |
| `$color-surface-elevated` | Card backgrounds (Agenda cards) |
| `$color-border-default` | Tab bar bottom border, table row dividers, card borders |
| `$color-text-secondary` | Muted metadata (last edited info, "No default workspace") |
| `$color-success`, `$color-warning`, `$color-danger` | Badge variants |
| `$space-*` | All padding, margin, gap values |
| `$radius-md`, `$radius-lg` | Card and tag chip border radius |
| `$transition-default` | Tab switch fade, button hover, save feedback fade-out |

---

## 7. Performance Considerations

- **Server-side initial fetch:** `GET /clients/{id}` runs server-side. The client header renders without a client-side loading flash.
- **Lazy tab loading:** Only the active tab fetches data. A client with 200 tasks does not pre-load them when the user is on the Settings tab.
- **No tab unmounting:** Tabs are hidden with CSS, not unmounted. React state (including fetched data) is preserved when switching tabs.
- **Debounced workspace cascade:** When the workspace dropdown changes, the project dropdown fetch is triggered immediately (no debounce needed — it's a user-initiated action, not a keypress event).
- **Image-free header:** The client header uses text and SVG only. No image assets to fetch.

---

## 8. Security Considerations

- **Auth guard:** The `(dashboard)` route group layout enforces authentication (feature 24). Feature 26 has no additional auth logic.
- **Client ID from URL:** The `client_id` is a UUID from the URL. The API validates access rights — if the authenticated user does not have access to this client, the API returns `403`. The UI must render a "You do not have access to this client" error state for `403` responses.
- **PATCH request hygiene:** The Settings form only sends changed fields (partial update). It does not send fields that were not modified, reducing the risk of accidental overwrites.
- **Email validation:** Client-side email validation in `TagInput` prevents obviously invalid entries but is not a security control — the API validates recipients server-side.
- **External link safety:** The Grain playlist link uses `rel="noopener noreferrer"` to prevent tab-napping.

---

## 9. Testing Strategy

Unit tests (to be written alongside implementation):

| Test Target | Test Cases |
|---|---|
| `useClientTasks` hook | Fetches on enable, returns data, handles error, does not re-fetch on tab switch |
| `useClientAgendas` hook | Same pattern as above |
| `SettingsTab` | Pre-fills with client data, dirty detection fires, PATCH sent on save, error shown on failure |
| `TagInput` | Add tag on Enter, reject invalid email, remove tag on x-click |
| Tab URL sync | Active tab reflects URL param, invalid param falls back to tasks |
| `ClientHeader` | Renders name, workspace, Grain link present/absent based on data |

Integration test (manual or E2E):
- Load the page, activate each tab, verify data loads and correct empty/error states show.
- Save Settings, verify PATCH fires and success message appears.
- Navigate away with dirty Settings, verify confirmation prompt.

---

## 10. Infrastructure Requirements

| Requirement | Detail |
|---|---|
| **Route** | `app/(dashboard)/clients/[client_id]/page.tsx` — no new infrastructure |
| **Environment variables** | `NEXT_PUBLIC_API_BASE_URL` (from feature 24) — already present |
| **No new API routes** | All data fetching goes through `@iexcel/api-client` to the existing API layer |
| **No new Nx projects** | New files land in `apps/ui/` — no new packages |

---

## 11. Migration and Adoption Notes

- The `Badge`, `Card`, `Avatar`, `Button`, `Table`, `TableRow` component stubs from feature 23 must be fleshed out with full styling when used here. Full implementations should replace the stub implementations in the existing stub files — do not create parallel component files.
- New components `ClientHeader`, `TabNav`, `TagInput` are net-new for this feature and will be reused by features 27 and 28 (peer screens in the same Nx app).
- The `useClient` hook pattern established here (enabled flag, retry function, loading/error state) must be the standard pattern for all subsequent feature data hooks in `apps/ui/`.
