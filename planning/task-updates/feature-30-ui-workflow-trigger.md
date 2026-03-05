# Feature 30: UI Workflow Trigger - Task Update

**Date:** 2026-03-05
**Status:** Implementation Complete (Phases 1-7)

## Summary

Implemented the UI Workflow Trigger feature, which provides a self-service screen for account managers to trigger iExcel's intake and agenda workflows from the browser.

## Completed Tasks

### Phase 1: Route and Page Shell (Tasks 1.1, 1.2)
- Created `/workflows/new` route inside `(dashboard)` route group
- Server Component page with role-based access control (admin/account_manager only)
- Pre-fetches client list server-side to avoid client-side loading state

### Phase 2: Workflow Selector (Tasks 2.1, 2.2)
- `WorkflowSelector` -- card-style toggle for intake vs agenda selection
- `ClientSelector` -- searchable dropdown with keyboard support, clear button, type-ahead filtering

### Phase 3: Intake Inputs (Tasks 3.1, 3.2)
- `TranscriptSourceSelector` -- tabbed interface (Paste/Upload/Grain)
- File upload with .txt-only validation, 5 MB size limit, empty file detection
- Grain tab visible but disabled with "V2" badge
- `IntakeInputs` -- composes transcript selector + call date picker (defaults to today, max today)

### Phase 4: Agenda Inputs (Task 4.1)
- `AgendaInputs` -- cycle start/end date range with auto-suggestion from last agenda
- Auto-suggest note shown when dates are pre-populated

### Phase 5: Progress Indicator (Tasks 5.1, 5.2)
- `useWorkflowPoller` hook -- polls at configurable interval, immediate first poll, cleanup on unmount
- `WorkflowProgress` -- spinner/success/error states, auto-navigation on completion, retry/dashboard buttons on failure

### Phase 6: Form Orchestration (Tasks 6.1, 6.2)
- `WorkflowTriggerForm` -- main orchestrator using useReducer for predictable state
- Intake two-step submission (transcript POST then workflow POST)
- Agenda single-step submission with no-completed-tasks warning handling
- All form inputs preserved on retry from error state

### Phase 7: Validation (Task 7.1)
- Pure `validateForm` function extracted to `lib/workflow/validate.ts`
- 15 unit tests covering all validation rules (all passing)

## Architecture Decisions

1. **State management**: Used `useReducer` with a typed action union for predictable state transitions across all form interactions. The reducer and types are extracted to `lib/workflow/types.ts`.

2. **Submission logic extraction**: Submission handlers extracted to `lib/workflow/submit.ts` to keep the form component under the 350-line limit.

3. **API type adaptation**: The UI uses shared-types (`WorkflowStatusResponse`, `SubmitTranscriptRequest`) directly. The workflow status `'running'`/`'completed'` values from the API are mapped to user-friendly text in the progress component.

4. **Browser API client**: Created via `createApiClient` with empty token provider since cookies are sent automatically in browser context through the API proxy.

## Files Created (27 files)

### Route
- `apps/ui/src/app/(dashboard)/workflows/new/page.tsx`
- `apps/ui/src/app/(dashboard)/workflows/new/page.module.scss`

### Components (7 component directories, 21 files)
- `apps/ui/src/components/WorkflowTrigger/WorkflowSelector/`
- `apps/ui/src/components/WorkflowTrigger/ClientSelector/`
- `apps/ui/src/components/WorkflowTrigger/TranscriptSourceSelector/`
- `apps/ui/src/components/WorkflowTrigger/IntakeInputs/`
- `apps/ui/src/components/WorkflowTrigger/AgendaInputs/`
- `apps/ui/src/components/WorkflowTrigger/WorkflowProgress/`
- `apps/ui/src/components/WorkflowTrigger/WorkflowTriggerForm/`

### Library
- `apps/ui/src/lib/workflow/types.ts`
- `apps/ui/src/lib/workflow/validate.ts`
- `apps/ui/src/lib/workflow/validate.test.ts`
- `apps/ui/src/lib/workflow/poll.ts`
- `apps/ui/src/lib/workflow/submit.ts`

## Reviewer Notes

- The `WorkflowStatusResponse` from `@iexcel/shared-types` does not currently include a `result` field with `agenda_short_id`. The progress component navigates to `/clients/{id}/agendas` as a fallback. Once the API response is extended, this can be updated to navigate to the specific agenda.
- The Grain transcript source tab is visible but disabled with a "V2" badge per spec.
- All SCSS modules use the auto-injected `tokens.*` namespace from `next.config.ts`.
- No external dependencies were added. All functionality uses native browser APIs and existing packages.
