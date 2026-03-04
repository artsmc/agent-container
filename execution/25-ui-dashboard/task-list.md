# Task List — Feature 25: UI Dashboard (`ui-dashboard`)

**Route:** `/`
**Date:** 2026-03-03
**Depends on:** Feature 22 (api-client), Feature 23 (ui-scaffolding), Feature 24 (ui-auth-flow)

All tasks are scoped to `apps/ui/` within the Nx monorepo unless stated otherwise.

---

## Phase 1: Foundation and Types

- [ ] **1.1** Define local TypeScript types for dashboard data in `apps/ui/src/types/dashboard.ts`: `Client`, `ClientStatus`, `DraftTask`, `AuditEntry`. Note: these are candidates for migration to `packages/shared-types` (feature 01) — mark with a TODO comment. (References: TR.md §10)
  - Size: small

- [ ] **1.2** Create `apps/ui/src/lib/dashboard/` directory and stub out four fetch utility files: `fetchClients.ts`, `fetchClientStatuses.ts`, `fetchDraftTasks.ts`, `fetchAuditLog.ts`. Each file exports a typed async function that throws a `NotImplementedError` initially. (References: TR.md §2.2, §3)
  - Size: small

- [ ] **1.3** Implement `fetchClients.ts` — wraps `apiClient.clients.list()`, returns `Client[]`. Wrap with React `cache()` for request deduplication. Add `{ cache: 'no-store' }` to the underlying fetch call. (References: TR.md §2.2, §3.1)
  - Size: small

- [ ] **1.4** Implement `fetchClientStatuses.ts` — accepts `clientId[]`, fans out `apiClient.clients.getStatus(id)` using `Promise.allSettled`, returns `Record<string, ClientStatus | null>`. (References: TR.md §2.2, §3.2)
  - Size: small

- [ ] **1.5** Implement `fetchDraftTasks.ts` — accepts `clientId[]`, fans out `apiClient.clients.getTasks(id, { status: 'draft' })` using `Promise.allSettled`, merges results into a flat `DraftTask[]` sorted by `short_id` ascending, returns `{ tasks: DraftTask[], hadErrors: boolean }`. (References: TR.md §2.2, §3.3, FRS.md §3.4)
  - Size: small

- [ ] **1.6** Implement `fetchAuditLog.ts` — calls `apiClient.audit.list({ limit: 20, sort: 'desc' })`, returns `AuditEntry[]`. (References: TR.md §3.4)
  - Size: small

---

## Phase 2: Skeleton Components

- [ ] **2.1** Create `apps/ui/src/components/DashboardSkeleton/` directory. Implement `ClientCardSkeleton.tsx` — renders a single animated shimmer card at the same dimensions as a real `ClientCard`. Uses the shimmer keyframe from `globals.scss` (feature 23). (References: TR.md §5.4, FRS.md §2.4)
  - Size: small

- [ ] **2.2** Implement `ApprovalRowSkeleton.tsx` — renders a single skeleton row matching the four-column layout of a pending approval row. (References: FRS.md §3.6)
  - Size: small

- [ ] **2.3** Implement `ActivityEntrySkeleton.tsx` — renders a single skeleton entry with avatar circle and two text lines. (References: FRS.md §4.4)
  - Size: small

- [ ] **2.4** Create `DashboardSkeleton.module.scss` with the shimmer animation and skeleton element base styles. Export `ClientCardsSkeleton`, `ApprovalsPanelSkeleton`, and `ActivityFeedSkeleton` wrapper components from `index.ts` (each accepts a `count` prop and renders N skeleton items). (References: TR.md §5.4)
  - Size: small

---

## Phase 3: Client Cards Grid

- [ ] **3.1** Create `apps/ui/src/components/ClientCard/` directory. Implement `ClientCard.tsx` — accepts `{ client: Client, status: ClientStatus | null }`. Renders: client name, pending draft count badge (hidden when 0), agenda status badge using `Badge` component with variant mapping from TR.md §5.3, next call date formatted via `Intl.DateTimeFormat`, "View Tasks" `<Link>` to `/clients/{id}/tasks`, "View Agenda" `<Link>` to `/clients/{id}/agendas`. When `status` is `null`, render dashes and an error indicator. (References: TR.md §4.1, FRS.md §2.2, §2.5)
  - Size: medium

- [ ] **3.2** Write `ClientCard.module.scss` with card shell styles using design tokens. Apply `tokens.$radius-md`, `tokens.$shadow-sm`, appropriate padding and min-height. Ensure client name truncates with ellipsis when too long. (References: TR.md §5, ui-prd.md Design Direction)
  - Size: small

- [ ] **3.3** Create `apps/ui/src/components/ClientCardsGrid/` directory. Implement `ClientCardsGrid.tsx` as an async Server Component. Calls `fetchClients()` and `fetchClientStatuses()`. Handles the client list error state (error banner + retry). Renders `ClientCard` for each client. (References: TR.md §2.1, §2.2, FRS.md §2.3, §2.6)
  - Size: medium

- [ ] **3.4** Implement the retry behaviour for the client list error state. Since this is a Server Component, the retry button must be a Client Component that triggers a page reload or router refresh using `useRouter().refresh()`. Create `ClientCardsGridErrorBanner.tsx` as a `'use client'` component. (References: FRS.md §2.6)
  - Size: small

- [ ] **3.5** Write `ClientCardsGrid.module.scss` with the 3-column responsive grid layout (3 cols → 2 cols → 1 col at breakpoints). (References: TR.md §5.2)
  - Size: small

---

## Phase 4: Pending Approvals Panel

- [ ] **4.1** Create `apps/ui/src/components/PendingApprovalsPanel/` directory. Implement `PendingApprovalRow.tsx` as a `'use client'` component. Accepts `{ task: DraftTask }`. Renders: short ID as a monospace styled link, title (truncated at ~60 chars with `title` tooltip for full text), client name, estimated time formatted as "Xh Ym" or "—". Row is click-navigable to `/clients/{client_id}/tasks?task={short_id}` using `useRouter`. Keyboard accessible (Enter key triggers navigation). (References: TR.md §4.2, FRS.md §3.2, §3.3)
  - Size: medium

- [ ] **4.2** Implement `PendingApprovalsPanel.tsx` as an async Server Component. Calls `fetchClients()` (deduplicated via `cache()`) and `fetchDraftTasks()`. Handles: loading (via Suspense at page level), partial errors (hadErrors warning banner), empty state, and >20 task truncation with "View all N pending tasks" footer link. Renders `PendingApprovalRow` for each task up to 20. (References: TR.md §2.2, FRS.md §3.5–3.8)
  - Size: medium

- [ ] **4.3** Write `PendingApprovalsPanel.module.scss` with panel shell styles (border, background, rounded corners using design tokens), table/list layout, row hover state, and scrollable container for overflow. (References: TR.md §5, ui-prd.md Design Direction)
  - Size: small

- [ ] **4.4** Implement `formatEstimatedTime(minutes: number | null): string` utility in `apps/ui/src/lib/dashboard/formatEstimatedTime.ts`. Converts minutes to "Xh Ym" display format. Returns "—" for null. Handles edge cases: 0 minutes → "—", 60 → "1h", 90 → "1h 30m". (References: FRS.md §3.2)
  - Size: small

- [ ] **4.5** Write unit tests for `formatEstimatedTime` covering: null, 0, 30, 60, 90, 120, 150 minutes. (References: TR.md §11, GS.md Pending Approvals scenarios)
  - Size: small

---

## Phase 5: Activity Feed

- [ ] **5.1** Implement `formatActionDescription(entry: AuditEntry): string` utility in `apps/ui/src/lib/dashboard/formatActionDescription.ts`. Implements the switch/case mapping for all known action types plus the unknown fallback. (References: TR.md §4.3, FRS.md §4.3)
  - Size: small

- [ ] **5.2** Write unit tests for `formatActionDescription` covering all 7 known action types and the unknown fallback. (References: TR.md §11, GS.md Activity Feed scenarios)
  - Size: small

- [ ] **5.3** Create `apps/ui/src/components/ActivityFeed/` directory. Implement `ActivityFeedEntry.tsx` as a `'use client'` component. Accepts `{ entry: AuditEntry }`. Renders: actor avatar (using `Avatar` component from feature 23 — initials fallback when `avatar_url` is null), actor name, action description from `formatActionDescription`, relative timestamp using `Intl.RelativeTimeFormat` with absolute datetime in a `title` attribute tooltip. (References: TR.md §4.3, FRS.md §4.2)
  - Size: medium

- [ ] **5.4** Implement relative time formatting utility in `apps/ui/src/lib/dashboard/formatRelativeTime.ts`. Uses `Intl.RelativeTimeFormat` to compute the correct unit (seconds/minutes/hours/days) and produce a human-readable string. (References: FRS.md §4.2)
  - Size: small

- [ ] **5.5** Implement `ActivityFeed.tsx` as an async Server Component. Calls `fetchAuditLog()`. Handles: error state ("Activity feed unavailable."), empty state ("No recent activity."), and renders up to 20 `ActivityFeedEntry` components. (References: FRS.md §4.1–4.6)
  - Size: small

- [ ] **5.6** Write `ActivityFeed.module.scss` with feed container styles, entry layout (avatar + text + timestamp), and row separator styles using design tokens. (References: TR.md §5, ui-prd.md Design Direction)
  - Size: small

---

## Phase 6: Dashboard Page Assembly

- [ ] **6.1** Create `apps/ui/src/app/page.tsx` — the root dashboard Server Component. Imports and renders `ClientCardsGrid`, `PendingApprovalsPanel`, and `ActivityFeed`, each wrapped in their own `<Suspense>` with the corresponding skeleton fallback. (References: TR.md §2.1, FRS.md §1)
  - Size: small

- [ ] **6.2** Create `apps/ui/src/app/dashboard.module.scss` with the page-level two-column grid layout (main content + right sidebar panel) and responsive collapse to single column. (References: TR.md §5.1)
  - Size: small

- [ ] **6.3** Create `apps/ui/src/app/loading.tsx` — route-level loading fallback for full-page navigation. Renders all three skeleton sections together. This provides an instant visual response on initial navigation before any Suspense boundaries resolve. (References: TR.md §2.1, Next.js docs — `loading.js`)
  - Size: small

---

## Phase 7: Accessibility Pass

- [ ] **7.1** Audit all interactive elements for keyboard accessibility: client card buttons, pending approval rows, activity feed entries. Ensure all have visible focus rings using `tokens.$focus-ring` (from design tokens). (References: FRS.md §8)
  - Size: small

- [ ] **7.2** Add `aria-label` attributes to: all short ID links in `PendingApprovalRow`, all `Badge` status instances on `ClientCard`, all skeleton containers (`aria-busy="true"` + `aria-label`). (References: FRS.md §8)
  - Size: small

---

## Phase 8: Integration Testing

- [ ] **8.1** Write React Testing Library component tests for `ClientCard`: full data, `status=null` (error state), `pending_draft_count=0` (no badge). (References: TR.md §11, GS.md Client Cards scenarios)
  - Size: medium

- [ ] **8.2** Write React Testing Library component tests for `PendingApprovalsPanel`: >20 tasks (overflow footer), 0 tasks (empty state), partial errors (`hadErrors=true` warning). (References: TR.md §11, GS.md Pending Approvals scenarios)
  - Size: medium

- [ ] **8.3** Write React Testing Library component tests for `ActivityFeed`: each of the 7 action types, unknown action type fallback, empty state, error state. (References: TR.md §11, GS.md Activity Feed scenarios)
  - Size: medium

- [ ] **8.4** Write E2E test (Playwright or Cypress) for Workflow A: login → dashboard → click pending approval row → assert navigation to correct task review URL. (References: FRS.md §9, GS.md Pending Approvals)
  - Size: medium

- [ ] **8.5** Write E2E test for Workflow B: login → dashboard → click "View Agenda" on client card → assert navigation to `/clients/{id}/agendas`. (References: FRS.md §9)
  - Size: small

---

## Phase 9: Verification and Handoff

- [ ] **9.1** Verify all three dashboard sections render independently via Suspense streaming — confirm using Network DevTools that sections appear progressively on slow network simulation (network throttle to "Slow 3G" in DevTools).
  - Size: small

- [ ] **9.2** Verify the `fetchClients` `cache()` deduplication — confirm via server logs or Next.js dev logging that `GET /clients` is called exactly once per page render even though multiple components call `fetchClients()`. (References: TR.md §7)
  - Size: small

- [ ] **9.3** Cross-check all GS.md Gherkin scenarios against the implementation. Each scenario should have a corresponding test or be manually verified and documented. (References: GS.md)
  - Size: medium

- [ ] **9.4** Resolve open questions in TR.md §12: confirm `client_id` URL format with feature 09 team, confirm `GET /audit` response envelope shape with feature 07 team, confirm pending approvals overflow link destination with feature 27 team.
  - Size: small

- [ ] **9.5** Update `execution/job-queue/index.md` Spec Status for feature 25 from `pending` to `complete`.
  - Size: small
