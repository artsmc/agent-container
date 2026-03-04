# Execution Plan — Feature 25: UI Dashboard (`ui-dashboard`)

**Date:** 2026-03-03
**Agent:** single `ui-dashboard-developer`
**Total Tasks:** 33 (24 small, 9 medium) across 7 active waves + 5 deferred

---

## Strategic Summary

The dashboard page at route `/` has 3 independent sections (Client Cards Grid, Pending Approvals Panel, Activity Feed) each wrapped in `<Suspense>` for streaming. The architecture uses async Server Components for data fetching, `'use client'` components only where interactivity is required, React `cache()` for request deduplication of `fetchClients`, and `Promise.allSettled` for parallel fan-out with graceful partial failure handling.

**Key parallelism:** Phases 3, 4, and 5 (the three sections) are completely independent of each other. All utility functions and skeleton components can be built in parallel in Wave 2.

**Single agent recommended:** All tasks scoped to `apps/ui/`, shared types/patterns across sections, moderate total effort.

---

## Wave 1: Foundation (Sequential)

| Task | Description |
|---|---|
| 1.1 | Define TypeScript types in `apps/ui/src/types/dashboard.ts`: `Client`, `ClientStatus`, `DraftTask`, `AuditEntry` with TODO migration comments |
| 1.2 | Create `apps/ui/src/lib/dashboard/` directory, stub 4 fetch utility files with `NotImplementedError` |

---

## Wave 2: Fetch Utilities + Skeletons + Pure Utilities (Parallel)

| Task | Description |
|---|---|
| 1.3 | Implement `fetchClients.ts` — wraps `apiClient.clients.list()`, wrapped with React `cache()`, `{ cache: 'no-store' }` |
| 1.4 | Implement `fetchClientStatuses.ts` — accepts `clientId[]`, fans out with `Promise.allSettled`, returns `Record<string, ClientStatus \| null>` |
| 1.5 | Implement `fetchDraftTasks.ts` — accepts `clientId[]`, fans out with `Promise.allSettled`, merges flat sorted by `short_id` asc, returns `{ tasks, hadErrors }` |
| 1.6 | Implement `fetchAuditLog.ts` — calls `apiClient.audit.list({ limit: 20, sort: 'desc' })`, returns `AuditEntry[]` |
| 2.1 | `ClientCardSkeleton.tsx` — shimmer card matching real card dimensions |
| 2.2 | `ApprovalRowSkeleton.tsx` — skeleton row matching 4-column layout |
| 2.3 | `ActivityEntrySkeleton.tsx` — skeleton entry with avatar circle + text lines |
| 2.4 | `DashboardSkeleton.module.scss` + `ClientCardsSkeleton`, `ApprovalsPanelSkeleton`, `ActivityFeedSkeleton` wrapper exports from `index.ts` |
| 4.4 | `formatEstimatedTime.ts` — converts minutes to "Xh Ym" display format |
| 5.1 | `formatActionDescription.ts` — switch/case for all 7 action types + unknown fallback |
| 5.4 | `formatRelativeTime.ts` — uses `Intl.RelativeTimeFormat` for human-readable relative timestamps |

---

## Wave 3: Unit Tests + Component Building (Parallel)

| Task | Description |
|---|---|
| 4.5 | Unit tests for `formatEstimatedTime` (null, 0, 30, 60, 90, 120, 150) |
| 5.2 | Unit tests for `formatActionDescription` (all 7 types + unknown fallback) |
| 3.1 | `ClientCard.tsx` — renders client name, pending badge, agenda status badge, next call date, View Tasks/View Agenda links. Handles `status=null` with dashes. |
| 3.2 | `ClientCard.module.scss` — card shell styles, tokens, truncation |
| 4.1 | `PendingApprovalRow.tsx` (`'use client'`) — row with short ID link, title (truncated ~60ch), client name, estimated time. Full row clickable + keyboard accessible. |
| 4.3 | `PendingApprovalsPanel.module.scss` — panel shell, table layout, row hover, scrollable |
| 5.3 | `ActivityFeedEntry.tsx` (`'use client'`) — avatar, actor name, action description, relative timestamp with absolute tooltip |
| 5.6 | `ActivityFeed.module.scss` — feed container, entry layout, row separators |

---

## Wave 4: Section Assembly (Parallel)

| Task | Description |
|---|---|
| 3.3 | `ClientCardsGrid.tsx` — async Server Component, calls `fetchClients()` + `fetchClientStatuses()`, handles error/empty states |
| 3.4 | `ClientCardsGridErrorBanner.tsx` — `'use client'` retry component using `useRouter().refresh()` |
| 3.5 | `ClientCardsGrid.module.scss` — 3→2→1 column responsive grid |
| 4.2 | `PendingApprovalsPanel.tsx` — async Server Component, calls `fetchClients()` (deduplicated) + `fetchDraftTasks()`, handles empty/partial-error/overflow states |
| 5.5 | `ActivityFeed.tsx` — async Server Component, calls `fetchAuditLog()`, handles error/empty states |

---

## Wave 5: Page Assembly + Accessibility (Sequential)

| Task | Description |
|---|---|
| 6.1 | `app/page.tsx` — root dashboard with 3 `<Suspense>` sections + skeleton fallbacks |
| 6.2 | `app/dashboard.module.scss` — two-column grid (main + 380px sidebar), responsive collapse |
| 6.3 | `app/loading.tsx` — route-level loading fallback rendering all 3 skeleton sections |
| 7.1 | Keyboard accessibility audit — focus rings using `tokens.$focus-ring` on all interactive elements |
| 7.2 | ARIA labels — short ID links, badge status, skeleton containers (`aria-busy="true"`) |

---

## Wave 6: Integration Testing (Parallel)

| Task | Description |
|---|---|
| 8.1 | Component tests for `ClientCard` — full data, `status=null`, `pending_draft_count=0` |
| 8.2 | Component tests for `PendingApprovalsPanel` — >20 overflow, empty, partial errors |
| 8.3 | Component tests for `ActivityFeed` — all 7 action types, unknown, empty, error |

---

## Wave 7: Finalization

| Task | Description |
|---|---|
| 9.3 | Cross-check all GS.md Gherkin scenarios against implementation |
| 9.5 | Update `execution/job-queue/index.md` status from `pending` to `complete` |

---

## DEFERRED

| Task | Reason |
|---|---|
| 8.4 | E2E test Workflow A — requires running app with auth + API backend |
| 8.5 | E2E test Workflow B — requires running app with auth + API backend |
| 9.1 | Suspense streaming verification — requires running dev server with network throttling |
| 9.2 | `cache()` dedup verification — requires server logs inspection |
| 9.4 | Resolve open questions in TR.md §12 — depends on features 07, 09, 27 teams |

---

## Key Technical Notes

1. **React `cache()`**: `fetchClients` is wrapped so both `ClientCardsGrid` and `PendingApprovalsPanel` call it independently but only one HTTP request is made per render pass.
2. **`Promise.allSettled`**: Used in `fetchClientStatuses` and `fetchDraftTasks` to gracefully handle individual client failures without failing the entire section.
3. **Server vs Client Components**: Only `PendingApprovalRow` (click navigation), `ActivityFeedEntry` (tooltip interaction), and `ClientCardsGridErrorBanner` (retry button) are Client Components. Everything else is Server Components.
4. **Skeleton counts**: Client cards skeleton = 6, approval rows skeleton = 5, activity entries skeleton = 5 (per spec).
5. **Badge variant mapping**: draft→neutral, in_review→warning, finalized→success, shared→info.
6. **Open questions** marked with TODO comments: client_id format, audit response envelope shape, overflow link destination.
