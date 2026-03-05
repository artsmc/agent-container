# Task Update: Feature 26 -- UI Client Detail Page

**Date:** 2026-03-05
**Status:** Complete

## Summary

Implemented the full Client Detail page at route `/clients/{client_id}` with
5 tabbed sections: Tasks, Agendas, Transcripts, Settings, and History.

## Files Created

### Route & Page Shell
- `apps/ui/src/app/(dashboard)/clients/[client_id]/page.tsx` -- Server Component that fetches client data via api-client
- `apps/ui/src/app/(dashboard)/clients/[client_id]/ClientDetailPage.tsx` -- Client component shell with tab state management
- `apps/ui/src/app/(dashboard)/clients/[client_id]/ClientDetailPage.module.scss` -- Page layout styles
- `apps/ui/src/app/(dashboard)/clients/[client_id]/not-found.tsx` -- 404 page for invalid client IDs

### New Reusable Components
- `apps/ui/src/components/ClientHeader/` -- Header with client name, workspace, Grain link, skeleton state
- `apps/ui/src/components/TabNav/` -- TabNav (horizontal tab bar) and TabPanel (CSS-hidden panels)
- `apps/ui/src/components/TagInput/` -- Multi-value tag input with validation and keyboard support

### Tab Components
- `apps/ui/src/features/clients/components/TasksSummaryTab.tsx` -- Summary table with 10-row limit
- `apps/ui/src/features/clients/components/AgendasTab.tsx` -- Agenda card list
- `apps/ui/src/features/clients/components/AgendaCard.tsx` -- Individual agenda card
- `apps/ui/src/features/clients/components/TranscriptsTab.tsx` -- Read-only transcript table
- `apps/ui/src/features/clients/components/SettingsTab.tsx` -- Editable form with dirty guard
- `apps/ui/src/features/clients/components/HistoryTab.tsx` -- Read-only import history

### Data Hooks
- `apps/ui/src/features/clients/hooks/useClientTasks.ts`
- `apps/ui/src/features/clients/hooks/useClientAgendas.ts`
- `apps/ui/src/features/clients/hooks/useClientTranscripts.ts`
- `apps/ui/src/features/clients/hooks/useClientImportStatus.ts`
- `apps/ui/src/features/clients/hooks/useAsanaWorkspaces.ts`
- `apps/ui/src/features/clients/hooks/useAsanaProjects.ts`

### Utilities & Infrastructure
- `apps/ui/src/utils/formatRelativeTime.ts` -- Human-readable relative time formatting
- `apps/ui/src/utils/formatCycleDates.ts` -- Cycle date range formatting
- `apps/ui/src/lib/api-client-browser.ts` -- Browser-side ApiClient factory
- `apps/ui/src/lib/get-token-action.ts` -- Server action for reading httpOnly cookie token
- `apps/ui/src/features/clients/types.ts` -- View model types

## Files Modified

- `apps/ui/src/components/Badge/Badge.tsx` -- Added 'primary' variant and 'sm'/'md' size prop
- `apps/ui/src/components/Badge/Badge.module.scss` -- Added primary variant and size styles
- `apps/ui/src/components/Avatar/Avatar.tsx` -- Added deterministic name-based color hash
- `apps/ui/src/components/Avatar/Avatar.module.scss` -- Updated sizes (sm=24px, md=32px, lg=40px)
- `apps/ui/src/components/Card/Card.module.scss` -- Updated background to $color-surface-elevated, floating shadow to $shadow-md

## Architecture Decisions

1. **Browser-side API client**: Created a browser-compatible ApiClient that uses a server action to read the httpOnly access token cookie. Token is cached in memory for session duration.

2. **Data hook pattern**: All tab hooks follow a consistent pattern with enabled flag, cancellation, and retry via fetchCount increment. This is the standard pattern for all future UI data hooks.

3. **Tab lazy loading**: Tabs are tracked in a `mountedTabs` Set. Once activated, tab components remain mounted but hidden via CSS `display:none` to preserve cached state.

4. **Dirty guard**: Settings tab exposes isDirty state to parent via callback. Tab switch from Settings with unsaved changes triggers a confirmation dialog.

## Review Notes

- Pre-existing build failures exist (PendingApprovalsPanel SCSS, auth-client module resolution) -- not caused by this feature
- Pre-existing type error in `src/features/tasks/hooks/useApiClient.ts` (JSX in .ts file) -- not from this feature
- All Feature 26 files pass TypeScript type-checking with zero errors
- No file exceeds 350 lines (largest: SettingsTab.tsx at 256 lines)
- Skipped Task 10.2 (manual smoke test) and Task 10.4 (index.md update) per instructions
