# Task Update: Feature 25 -- UI Dashboard

**Date:** 2026-03-05
**Status:** Complete (tasks 1.1-8.3, 7.1-7.2, skipping 8.4-8.5, 9.1-9.4)

## Summary

Implemented the main dashboard page for the iExcel Automation platform. The dashboard is the first screen users see after login and is composed of three independent sections that stream via Suspense:

1. **Client Cards Grid** -- Responsive 3/2/1-column grid showing client cards with pending draft count badges, agenda status badges, next call dates, and navigation links.

2. **Pending Approvals Panel** -- Aggregated list of draft tasks across all clients. Clickable rows with keyboard navigation (Enter key), short ID, title (truncated at 60 chars), client name, and estimated time formatting.

3. **Activity Feed** -- Chronological log of recent audit entries with actor avatars (initials fallback), action descriptions for 7 known types + fallback, and relative timestamps with absolute tooltips.

## Key Architecture Decisions

- **Server Components + Suspense streaming**: Each section is an async Server Component wrapped in its own `<Suspense>` boundary with skeleton fallbacks. Sections load and fail independently.
- **React `cache()` deduplication**: `fetchClients()` is wrapped with React's `cache()` so both ClientCardsGrid and PendingApprovalsPanel call it but only one HTTP request is made per render pass.
- **SCSS Modules with design tokens**: All styles use SCSS modules with auto-injected `tokens.*` from `packages/ui-tokens`. The mixins from `@/styles/mixins` are used for `truncate`, `focus-ring`, and `respond-to`.
- **Client Components only where needed**: `PendingApprovalRow` (click navigation via `useRouter`), `ActivityFeedEntry` (tooltip via title attr), and `ClientCardsGridErrorBanner` (retry via `router.refresh()`).

## Files Created/Modified

### New Files (31 files)
- `apps/ui/src/types/dashboard.ts` -- Local dashboard types (TODO: migrate to shared-types)
- `apps/ui/src/lib/dashboard/` -- 9 files (fetch utilities, formatters, API client factory, barrel export)
- `apps/ui/src/components/DashboardSkeleton/` -- 5 files (3 skeleton components, SCSS, barrel)
- `apps/ui/src/components/ClientCard/` -- 4 files (component, SCSS, index, test)
- `apps/ui/src/components/ClientCardsGrid/` -- 4 files (component, error banner, SCSS, index)
- `apps/ui/src/components/PendingApprovalsPanel/` -- 5 files (panel, row, SCSS, index, test)
- `apps/ui/src/components/ActivityFeed/` -- 5 files (feed, entry, SCSS, index, test)
- `apps/ui/src/app/(dashboard)/dashboard.module.scss` -- Page layout
- `apps/ui/src/app/(dashboard)/loading.tsx` -- Route-level loading fallback

### Modified Files (4 files)
- `apps/ui/src/app/(dashboard)/page.tsx` -- Replaced stub with full dashboard
- `apps/ui/src/components/Badge/Badge.tsx` -- Added `aria-label` prop
- `apps/ui/src/components/Badge/Badge.module.scss` -- Added variant color styles
- `apps/ui/src/components/Card/Card.module.scss` -- Added elevation variant styles

## Test Coverage

- **112 tests pass** across 12 test files
- Unit tests: `formatEstimatedTime` (9), `formatActionDescription` (10), `parseIsoDuration` (9)
- Component tests: `ClientCard` (13), `PendingApprovalRow` (12), `ActivityFeedEntry` (13)
- All tests use Vitest + React Testing Library

## Notes for Reviewer

1. **API type impedance**: The api-client's `ClientStatusResponse` has `agendaReady: boolean` instead of the full `agendaStatus` enum. A temporary `mapAgendaStatus()` adapter handles this with a TODO for when the API is updated.
2. **Audit entry mapping**: The api-client's `AuditEntry` lacks `actor.name`/`actor.avatar_url`. The fetch utility uses `unknown` casting to access potential extra fields from the runtime response, with a TODO marker.
3. **Skipped tasks**: E2E tests (8.4-8.5) skipped per instructions (no browser). Verification tasks (9.1-9.4) skipped per instructions.
4. **Accessibility**: Focus rings, aria-labels on badges, aria-busy on skeletons, keyboard navigation (Enter key), role="link" on approval rows, and descriptive aria-labels on short ID links.
