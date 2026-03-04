# TR — Technical Requirements
# Feature 25: UI Dashboard (`ui-dashboard`)

**Date:** 2026-03-03
**Framework:** Next.js 16 (App Router), custom SCSS modules, design tokens from `packages/ui-tokens`
**API Client:** `packages/api-client` (feature 22)

---

## 1. File Structure

This feature creates the following files within `apps/ui/src/`:

```
apps/ui/src/
├── app/
│   ├── page.tsx                          # Dashboard Server Component (route /)
│   └── loading.tsx                       # Route-level Suspense fallback for full page
├── components/
│   ├── ClientCard/
│   │   ├── ClientCard.tsx                # Client card component
│   │   ├── ClientCard.module.scss        # Scoped styles
│   │   └── index.ts
│   ├── ClientCardsGrid/
│   │   ├── ClientCardsGrid.tsx           # Grid layout + data fetching Server Component
│   │   ├── ClientCardsGrid.module.scss
│   │   └── index.ts
│   ├── PendingApprovalsPanel/
│   │   ├── PendingApprovalsPanel.tsx     # Panel Server Component
│   │   ├── PendingApprovalRow.tsx        # Single row (Client Component for click nav)
│   │   ├── PendingApprovalsPanel.module.scss
│   │   └── index.ts
│   ├── ActivityFeed/
│   │   ├── ActivityFeed.tsx              # Feed Server Component
│   │   ├── ActivityFeedEntry.tsx         # Single entry (Client Component for tooltip)
│   │   ├── ActivityFeed.module.scss
│   │   └── index.ts
│   └── DashboardSkeleton/
│       ├── ClientCardSkeleton.tsx
│       ├── ApprovalRowSkeleton.tsx
│       ├── ActivityEntrySkeleton.tsx
│       └── DashboardSkeleton.module.scss
└── lib/
    └── dashboard/
        ├── fetchClients.ts               # Wraps api-client GET /clients
        ├── fetchClientStatuses.ts        # Parallel GET /clients/{id}/status calls
        ├── fetchDraftTasks.ts            # Parallel GET /clients/{id}/tasks?status=draft
        └── fetchAuditLog.ts              # Wraps api-client GET /audit
```

---

## 2. Next.js Architecture

### 2.1 App Router and Server Components

The dashboard is implemented primarily as **React Server Components** (RSC), consistent with Next.js App Router best practices. Data is fetched server-side, and only components requiring interactivity (click handlers, hover tooltips) are marked `'use client'`.

**`app/page.tsx`** — Root Server Component for `/`:

```tsx
// app/page.tsx
import { Suspense } from 'react'
import { ClientCardsGrid } from '@/components/ClientCardsGrid'
import { PendingApprovalsPanel } from '@/components/PendingApprovalsPanel'
import { ActivityFeed } from '@/components/ActivityFeed'
import { ClientCardsSkeleton } from '@/components/DashboardSkeleton'
import { ApprovalsPanelSkeleton } from '@/components/DashboardSkeleton'
import { ActivityFeedSkeleton } from '@/components/DashboardSkeleton'
import styles from './dashboard.module.scss'

export default function DashboardPage() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.clientGrid}>
        <Suspense fallback={<ClientCardsSkeleton count={6} />}>
          <ClientCardsGrid />
        </Suspense>
      </section>
      <aside className={styles.panels}>
        <Suspense fallback={<ApprovalsPanelSkeleton count={5} />}>
          <PendingApprovalsPanel />
        </Suspense>
        <Suspense fallback={<ActivityFeedSkeleton count={5} />}>
          <ActivityFeed />
        </Suspense>
      </aside>
    </div>
  )
}
```

Each of the three main components (`ClientCardsGrid`, `PendingApprovalsPanel`, `ActivityFeed`) is wrapped in its own `<Suspense>` boundary so they stream independently. A failure in one component is caught at the Suspense boundary and replaced with its error UI without affecting the others.

### 2.2 Parallel Data Fetching

Within `ClientCardsGrid`, use `Promise.allSettled` to fan out status requests:

```tsx
// components/ClientCardsGrid/ClientCardsGrid.tsx
import { fetchClients } from '@/lib/dashboard/fetchClients'
import { fetchClientStatuses } from '@/lib/dashboard/fetchClientStatuses'

export default async function ClientCardsGrid() {
  // 1. Fetch client list
  const clients = await fetchClients()

  // 2. Fan out status requests in parallel
  const statusResults = await fetchClientStatuses(clients.map(c => c.id))
  // statusResults is Record<clientId, ClientStatus | Error>

  return (
    <div className={styles.grid}>
      {clients.map(client => (
        <ClientCard
          key={client.id}
          client={client}
          status={statusResults[client.id]}
        />
      ))}
    </div>
  )
}
```

`fetchClientStatuses` implementation:

```ts
// lib/dashboard/fetchClientStatuses.ts
import { apiClient } from '@api-client/index'

export async function fetchClientStatuses(
  clientIds: string[]
): Promise<Record<string, ClientStatus | null>> {
  const results = await Promise.allSettled(
    clientIds.map(id => apiClient.clients.getStatus(id))
  )
  return Object.fromEntries(
    clientIds.map((id, i) => [
      id,
      results[i].status === 'fulfilled' ? results[i].value : null,
    ])
  )
}
```

Similarly in `PendingApprovalsPanel`, draft task fetches are fanned out across all clients in parallel:

```ts
// lib/dashboard/fetchDraftTasks.ts
export async function fetchAllDraftTasks(
  clientIds: string[]
): Promise<{ tasks: DraftTask[]; hadErrors: boolean }> {
  const results = await Promise.allSettled(
    clientIds.map(id => apiClient.clients.getTasks(id, { status: 'draft' }))
  )
  const tasks = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<DraftTask[]>).value)
  const hadErrors = results.some(r => r.status === 'rejected')
  return { tasks, hadErrors }
}
```

The client list resolved in `ClientCardsGrid` must not require a second `GET /clients` call in `PendingApprovalsPanel`. The recommended pattern is to hoist the client fetch to the page level and pass client IDs as props, or to use React's `cache()` to deduplicate the request within a single render pass:

```ts
// lib/dashboard/fetchClients.ts
import { cache } from 'react'
import { apiClient } from '@api-client/index'

export const fetchClients = cache(async () => {
  return apiClient.clients.list()
})
```

With `cache()`, both `ClientCardsGrid` and `PendingApprovalsPanel` can call `fetchClients()` independently and the network request is only made once per render pass.

---

## 3. API Contracts

### 3.1 `GET /clients`

Returns clients accessible to the authenticated user.

**Response schema (TypeScript):**
```ts
type Client = {
  id: string          // UUID or slug used in URLs
  name: string
}

type GetClientsResponse = Client[]
```

### 3.2 `GET /clients/{id}/status`

Returns cycle overview for a single client.

**Response schema:**
```ts
type ClientStatus = {
  client_id: string
  pending_draft_count: number         // Count of tasks with status='draft'
  agenda_status: 'draft' | 'in_review' | 'finalized' | 'shared' | null
  next_call_date: string | null       // ISO 8601 date string, e.g. "2026-03-10"
}
```

### 3.3 `GET /clients/{id}/tasks?status=draft`

Returns draft tasks for a specific client.

**Query params:**
- `status=draft` (required for dashboard use case)

**Response schema:**
```ts
type DraftTask = {
  short_id: string       // "TSK-0042"
  client_id: string
  client_name: string
  title: string
  estimated_minutes: number | null
}

type GetDraftTasksResponse = DraftTask[]
```

### 3.4 `GET /audit`

Returns audit log entries.

**Query params used by dashboard:**
- `limit=20`
- `sort=desc` (newest first)

**Response schema:**
```ts
type AuditEntry = {
  id: string
  action_type: string          // e.g. "task.approved"
  actor: {
    id: string
    name: string
    avatar_url: string | null
  }
  entity_type: string          // e.g. "task", "agenda", "workflow"
  entity_id: string            // e.g. "TSK-0042", "AGD-0005"
  entity_label: string | null  // e.g. "AGD-0005" + client name for agendas
  client_id: string | null
  client_name: string | null
  workflow_name: string | null
  created_at: string           // ISO 8601 datetime
}

type GetAuditResponse = {
  entries: AuditEntry[]
  total: number
}
```

---

## 4. Component Specifications

### 4.1 `ClientCard`

**Props:**
```ts
type ClientCardProps = {
  client: Client
  status: ClientStatus | null   // null = status fetch failed
}
```

**Behaviour:**
- If `status` is `null`, render dashes in place of all status fields and add a subtle error indicator (e.g. a small icon with tooltip "Status unavailable").
- `pending_draft_count` of 0: do not render badge (or render a visually subdued "0" per design decision).
- `next_call_date`: format using `Intl.DateTimeFormat` with `{ month: 'short', day: 'numeric' }`.
- Buttons are Next.js `<Link>` components, not `<button>` elements, for proper prefetching.

### 4.2 `PendingApprovalRow`

**Props:**
```ts
type PendingApprovalRowProps = {
  task: DraftTask
}
```

**This is a Client Component** (`'use client'`) because it needs a click handler for full-row navigation (the row as a whole is clickable, not just the short ID).

```tsx
'use client'
import { useRouter } from 'next/navigation'

export function PendingApprovalRow({ task }: PendingApprovalRowProps) {
  const router = useRouter()
  const href = `/clients/${task.client_id}/tasks?task=${task.short_id}`

  return (
    <tr
      className={styles.row}
      onClick={() => router.push(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      aria-label={`Review task ${task.short_id}`}
    >
      ...
    </tr>
  )
}
```

### 4.3 `ActivityFeedEntry`

**This is a Client Component** because it renders a tooltip on timestamp hover.

**Props:**
```ts
type ActivityFeedEntryProps = {
  entry: AuditEntry
}
```

**Action description rendering** — pure function, no API call:

```ts
function formatActionDescription(entry: AuditEntry): string {
  switch (entry.action_type) {
    case 'task.approved':   return `Approved task ${entry.entity_id}`
    case 'task.rejected':   return `Rejected task ${entry.entity_id}`
    case 'task.pushed':     return `Pushed task ${entry.entity_id} to Asana`
    case 'agenda.shared':   return `Shared agenda ${entry.entity_id} with client ${entry.client_name}`
    case 'agenda.finalized': return `Finalized agenda ${entry.entity_id}`
    case 'email.sent':      return `Sent email for agenda ${entry.entity_id}`
    case 'workflow.triggered': return `Triggered ${entry.workflow_name} for ${entry.client_name}`
    default:                return `Performed action on ${entry.entity_type} ${entry.entity_id}`
  }
}
```

**Timestamp rendering:**
- Relative time (e.g. "2 hours ago") rendered via a small utility using `Intl.RelativeTimeFormat`.
- Absolute time in tooltip via `title` attribute or a CSS tooltip pattern from the design system.

---

## 5. Styling

All styles use **SCSS modules** co-located with components. Design tokens from `packages/ui-tokens` are imported via SCSS.

### 5.1 Dashboard Layout (page-level)

```scss
// app/dashboard.module.scss
@use 'packages/ui-tokens' as tokens;

.dashboard {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: tokens.$spacing-6;
  padding: tokens.$spacing-6;

  @media (max-width: tokens.$breakpoint-lg) {
    grid-template-columns: 1fr;
  }
}

.clientGrid {
  min-width: 0; // prevent grid blowout
}

.panels {
  display: flex;
  flex-direction: column;
  gap: tokens.$spacing-4;
}
```

### 5.2 Client Cards Grid

```scss
// components/ClientCardsGrid/ClientCardsGrid.module.scss
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: tokens.$spacing-4;

  @media (max-width: tokens.$breakpoint-xl) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: tokens.$breakpoint-md) {
    grid-template-columns: 1fr;
  }
}
```

### 5.3 Agenda Status Badge Token Mapping

The `Badge` component (from feature 23) accepts a `variant` prop. Map agenda status to variant:

| API Value | Badge Variant | Color |
|---|---|---|
| `draft` | `neutral` | Grey |
| `in_review` | `warning` | Amber |
| `finalized` | `success` | Green |
| `shared` | `info` | Blue |

### 5.4 Skeleton States

Skeleton components use a CSS shimmer animation defined in `globals.scss` (from feature 23). Skeleton elements are `div` placeholders with `background: tokens.$color-skeleton` and the shimmer keyframe applied.

---

## 6. Error Handling Strategy

| Scenario | Handling |
|---|---|
| `GET /clients` 4xx/5xx | Replace grid with error banner + retry button |
| `GET /clients/{id}/status` failure for one client | That card still renders; status fields show "—" |
| `GET /clients/{id}/tasks` failure for one client | Tasks from that client are excluded; partial-results warning shown |
| `GET /audit` failure | Feed section shows "Activity feed unavailable." |
| 401 on any endpoint | Global auth middleware handles redirect to login |
| Network timeout | Treat as fetch failure — same handling as 5xx |

Error boundaries are implemented via Next.js `error.tsx` files at the component level where needed, or via try/catch within async Server Components with conditional render logic.

---

## 7. Performance Considerations

- **Parallel fetching**: All independent API calls are initiated in parallel using `Promise.allSettled`. The dashboard never makes sequential calls where parallel is possible.
- **Request deduplication**: `fetchClients` is wrapped with React `cache()` so multiple Server Components calling it in the same render pass result in a single HTTP request.
- **Streaming**: Each of the three dashboard sections is wrapped in its own `<Suspense>` boundary. Sections stream to the client as they resolve rather than waiting for all three.
- **No `cache: 'force-cache'`**: Dashboard data is dynamic (task counts, agenda status change frequently). All `fetch` calls use `{ cache: 'no-store' }` to opt into dynamic rendering.
- **Prefetching**: Client card action buttons (`View Tasks`, `View Agenda`) use Next.js `<Link>` components which prefetch on hover by default.
- **Target**: Dashboard fully interactive (all three sections rendered) in under 2 seconds at P95 on a fast connection with 10 clients.

---

## 8. Security

- The dashboard page is protected by Next.js middleware (established in feature 24) that verifies the OIDC session token before allowing access to any route under the authenticated layout.
- The api-client (feature 22) attaches the Bearer token from the session to all API requests.
- No data from the API is rendered as raw HTML. All user-supplied strings (client names, task titles, actor names) are rendered as React text nodes, not `dangerouslySetInnerHTML`.
- Short IDs and entity IDs used in navigation URLs are taken from API responses, not from user input — no URL injection risk at this layer.

---

## 9. Dependencies

| Package / Feature | Usage |
|---|---|
| `packages/api-client` (feature 22) | All HTTP calls to the API layer |
| `packages/ui-tokens` (feature 23) | SCSS design tokens for colours, spacing, typography, shadows |
| `apps/ui/src/components/Badge` (feature 23) | Agenda status badges, pending count badges |
| `apps/ui/src/components/Avatar` (feature 23) | Actor avatars in activity feed |
| `apps/ui/src/components/Card` (feature 23) | Card shell for client cards |
| `apps/ui/src/layouts/DashboardLayout` (feature 23) | Page layout shell (sidebar nav, header) |
| `apps/ui/src/middleware.ts` (feature 24) | Auth guard — protects the `/` route |
| `next` | v16 — App Router, Server Components, `loading.tsx`, `Suspense` |
| `react` | `cache()` for request deduplication |

---

## 10. TypeScript Shared Types

The following types should live in `packages/shared-types` (feature 01) if they are shared across API and UI. If not yet present, define them locally in `apps/ui/src/types/dashboard.ts` and plan migration.

- `Client`
- `ClientStatus`
- `DraftTask`
- `AuditEntry`

---

## 11. Testing Considerations

- Unit tests for `formatActionDescription` — all known action types plus unknown fallback.
- Unit tests for `formatEstimatedTime` — minutes to "Xh Ym" display string.
- Unit tests for `fetchClientStatuses` — mock `Promise.allSettled` with mixed fulfilled/rejected.
- Component tests (React Testing Library) for:
  - `ClientCard` with full data, with `status=null`, with `pending_draft_count=0`
  - `PendingApprovalRow` click navigation
  - `PendingApprovalsPanel` with overflow (>20 tasks), empty, and partial-error states
  - `ActivityFeed` with each action type, empty, and error states
- Integration / E2E tests (Playwright or Cypress) for full dashboard render and navigation flows — these are defined in GS.md as the acceptance scenarios.

---

## 12. Open Questions

| Question | Impact | Owner |
|---|---|---|
| What is the exact `client_id` format used in route paths — UUID or slug? | Affects URL construction in navigation | Feature 09 (client-management) |
| Does `GET /clients/{id}/status` return the most recent agenda status, or the "active cycle" status? | Determines what status badge shows when multiple agendas exist | Feature 14 (agenda-endpoints) |
| Should the pending approvals panel "View all N pending tasks" link go to a cross-client task view (not yet defined) or filter the existing task review screen? | Affects link destination | Feature 27 (ui-task-review) |
| What is the exact shape of the `GET /audit` response — flat array or paginated envelope? | Affects `fetchAuditLog` implementation | Feature 07 (api-scaffolding) |
