# Task List
## Feature 30: UI Workflow Trigger

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 23 (ui-scaffolding) is complete — `DashboardLayout.tsx`, `ui-tokens` package, and `(dashboard)` route group exist
- [ ] Feature 24 (ui-auth-flow) is complete — auth middleware is in place, `getServerSession()` or equivalent is available
- [ ] Feature 22 (api-client-package) is complete — typed API client is available with methods for `clients.list()`, `clients.submitTranscript()`, `clients.listAgendas()`, `workflows.triggerIntake()`, `workflows.triggerAgenda()`, `workflows.getStatus()`
- [ ] Feature 17 (workflow-orchestration) is deployed — workflow API endpoints are testable
- [ ] Feature 09 (client-management) is deployed — `GET /clients` returns data
- [ ] Coordinate with Feature 27 (ui-task-review) team: confirm `/clients/{id}/tasks` route exists and accepts navigation
- [ ] Coordinate with Feature 28 (ui-agenda-editor) team: confirm `/agendas/{short_id}` route exists and accepts navigation

---

## Phase 1: Route and Page Shell

### Task 1.1 — Create route directory and page shell
**Complexity:** Small
**References:** TR.md Section 2 (File Structure), FRS.md FR-01

Create the App Router directory structure:
```
apps/ui/src/app/(dashboard)/workflows/new/
```

Create `page.tsx` as a minimal async Server Component with:
- Role check: redirect non-`admin`/`account_manager` users to `/`
- Static placeholder content wrapped in `DashboardLayout`
- Page title heading ("Trigger Workflow")
- No interactive form yet

**Verification:** Navigate to `/workflows/new` as account manager → DashboardLayout chrome visible, placeholder content visible. Navigate as team member → redirected to `/`.

---

### Task 1.2 — Add client list pre-fetch to page component
**Complexity:** Small
**References:** TR.md Section 4.1, FRS.md FR-05

In `page.tsx`, add:
```typescript
const clients = await apiClient.clients.list()
```

Pass `clients` as a prop to the (not yet created) `WorkflowTriggerForm`. For now, log the result to confirm the API call works from the server component.

**Verification:** Server console shows client list on page load. No client-side loading flash for the client dropdown.

---

## Phase 2: Workflow Selector

### Task 2.1 — Create `WorkflowSelector` component
**Complexity:** Small
**References:** TR.md Section 5.2, FRS.md FR-04

Create `apps/ui/src/components/WorkflowTrigger/WorkflowSelector/WorkflowSelector.tsx`:
- `'use client'`
- Props: `selected: 'intake' | 'agenda' | null`, `onChange: (type) => void`
- Two card/option elements for "Intake → Tasks" and "Completed Tasks → Agenda"
- Selected option has distinct visual styling (border, background)
- Create `WorkflowSelector.module.scss` using `ui-tokens`
- Export via `index.ts`

**Verification:** Render in isolation — clicking each option toggles selection. Only one active at a time. Unselected state shows no selection.

---

### Task 2.2 — Create `ClientSelector` component
**Complexity:** Small
**References:** FRS.md FR-05

Create `apps/ui/src/components/WorkflowTrigger/ClientSelector/ClientSelector.tsx`:
- `'use client'`
- Props: `clients: Client[]`, `selected: string | null`, `onChange: (clientId: string, clientName: string) => void`
- Searchable dropdown — filter `clients` list as user types
- Placeholder: "Select a client..."
- Renders a custom dropdown (not native `<select>`) using `ui-tokens` styling
- Shows validation error state when `error` prop is provided
- Export via `index.ts`

**Verification:** Render with sample client list — typing filters in real time. Clicking an option fires `onChange`. Clearing input restores full list.

---

## Phase 3: Intake Inputs

### Task 3.1 — Create `TranscriptSourceSelector` component
**Complexity:** Medium
**References:** FRS.md FR-06, TR.md Section 4.4

Create `apps/ui/src/components/WorkflowTrigger/TranscriptSourceSelector/TranscriptSourceSelector.tsx`:
- `'use client'`
- Props: `source: 'paste' | 'upload'`, `onSourceChange`, `transcriptText: string`, `onTextChange`, `fileName: string | null`, `onFileChange`, `error?: string`
- Renders three tabs: "Paste text" (active), "Upload file", "Select from Grain" (disabled)
- Grain tab has tooltip or label: "Coming soon (V2)"
- "Paste text" tab: shows `<textarea>` with placeholder
- "Upload file" tab: shows file input (accept=".txt"), selected filename display, remove button
- File reading logic via `FileReader` (see TR.md Section 4.4)
- Client-side validation: file type (.txt only), file size (≤ 5 MB), empty file
- Create `TranscriptSourceSelector.module.scss`
- Export via `index.ts`

**Verification:**
- Tab switching shows correct input
- Pasting text updates `transcriptText`
- Uploading `.txt` file reads content and shows filename
- Uploading `.pdf` shows error "Only .txt files are supported"
- Uploading file > 5 MB shows error "File is too large (max 5 MB)"
- Grain tab is not interactive

---

### Task 3.2 — Create `IntakeInputs` component
**Complexity:** Small
**References:** FRS.md FR-06, FR-07

Create `apps/ui/src/components/WorkflowTrigger/IntakeInputs/IntakeInputs.tsx`:
- `'use client'`
- Props: transcript source state, transcript text, call date, field errors, onChange handlers
- Composes `TranscriptSourceSelector` and a call date picker (`<input type="date">`)
- Call date default: today's date (set via `useState(() => formatDateISO(new Date()))`)
- Call date max: today (via `max={formatDateISO(new Date())}` attribute)
- Show field error for call date if present
- Create `IntakeInputs.module.scss`
- Export via `index.ts`

**Verification:** Renders `TranscriptSourceSelector` + call date picker. Date picker prevents future date selection. Default date is today.

---

## Phase 4: Agenda Inputs

### Task 4.1 — Create `AgendaInputs` component
**Complexity:** Small
**References:** FRS.md FR-08, FR-09, TR.md Section 4.5

Create `apps/ui/src/components/WorkflowTrigger/AgendaInputs/AgendaInputs.tsx`:
- `'use client'`
- Props: `clientId: string | null`, `cycleStart: string`, `cycleEnd: string`, `onCycleStartChange`, `onCycleEndChange`, `errors: Record<string, string>`
- Two `<input type="date">` fields: Cycle Start, Cycle End
- When `clientId` changes, call `fetchLastAgendaForCycleSuggestion(clientId)` (see TR.md Section 4.5)
- Auto-populated values are shown in the date inputs but are editable
- Show validation errors per field
- "Auto-suggested based on last agenda" note when dates are auto-populated
- Create `AgendaInputs.module.scss`
- Export via `index.ts`

**Verification:**
- Selecting a client with prior agendas pre-fills dates
- Selecting a client with no prior agendas leaves fields empty
- Manual date entry overrides auto-suggestion
- End date before start date triggers validation error on submit (not on blur)

---

## Phase 5: Progress Indicator

### Task 5.1 — Create `useWorkflowPoller` hook
**Complexity:** Medium
**References:** TR.md Section 4.3, FRS.md FR-15

Create `apps/ui/src/lib/workflow/poll.ts`:
- Implement `useWorkflowPoller` hook as specified in TR.md Section 4.3
- Polling interval: 3 seconds (configurable via prop)
- First poll runs immediately (no initial delay)
- Clears interval on unmount via `useEffect` cleanup
- Calls `onStatusUpdate` callback with status response
- Calls `onError` callback on API failure

**Verification:**
- Hook polls at the specified interval
- Hook stops polling when `enabled` is set to `false`
- Interval is cleared on component unmount (no console errors about state updates after unmount)
- Immediate first poll fires before the first interval tick

---

### Task 5.2 — Create `WorkflowProgress` component
**Complexity:** Small
**References:** FRS.md FR-14, FR-15, FR-17, FR-18, TR.md Section 5.3

Create `apps/ui/src/components/WorkflowTrigger/WorkflowProgress/WorkflowProgress.tsx`:
- `'use client'`
- Props: `workflowType: 'intake' | 'agenda'`, `clientName: string`, `workflowRunId: string`, `onRetry: () => void`
- Uses `useWorkflowPoller` internally
- Displays:
  - Spinner while status is `pending` or `processing`
  - Status text mapped from API status (see FRS.md FR-15)
  - Success state when `complete` (brief before navigation)
  - Error state when `failed` — with "Try Again" and "Return to Dashboard" buttons
- On `complete`: calls `router.push()` to navigate to results screen (see FRS.md FR-17)
- `aria-live="polite"` on the status text element for accessibility
- Create `WorkflowProgress.module.scss` with spinner animation
- Export via `index.ts`

**Verification:**
- Spinner visible while polling returns `pending`/`processing`
- Status text updates as polling progresses
- On `complete` (mocked): brief success message, then navigation fires
- On `failed` (mocked): error state with both action buttons visible
- "Try Again" calls `onRetry` prop
- "Return to Dashboard" navigates to `/`

---

## Phase 6: Form Orchestration

### Task 6.1 — Create `WorkflowTriggerForm` orchestrator
**Complexity:** Large
**References:** FRS.md FR-03 to FR-18, TR.md Section 4.2

Create `apps/ui/src/components/WorkflowTrigger/WorkflowTriggerForm/WorkflowTriggerForm.tsx`:
- `'use client'`
- Props: `clients: Client[]`
- Manages all form state using `useState` or `useReducer`
- Renders either the form or `WorkflowProgress` based on `pageState`
- Composes: `WorkflowSelector`, `ClientSelector`, `IntakeInputs` (conditional), `AgendaInputs` (conditional)
- Submit button: disabled when no workflow selected; label changes based on selection
- Implements `validateForm()` pure function (TR.md Section 6.1)
- On submit:
  - Run validation → show field errors if invalid
  - Show submit button loading state
  - Execute intake or agenda submission sequence (TR.md Section 4.6)
  - On success: set `workflowRunId`, transition to `processing` page state
  - On failure: show `submitError` inline above the submit button
- "Try Again" handler: resets `pageState` to `form`, preserves all previous inputs
- No completed tasks warning: shown inline, does not transition to processing
- Create `WorkflowTriggerForm.module.scss`

**Verification:**
- No workflow selected → submit button disabled
- Workflow selected → button enabled and labeled correctly
- Invalid submit → all field errors shown, no API calls
- Valid intake submit → transcript POST, then workflow POST, then processing state
- Valid agenda submit → workflow POST, then processing state
- Step 1 failure → error shown, stays on form
- Step 2 failure → specific message about transcript saved
- No tasks warning → stays on form, warning visible, dates still editable
- "Try Again" from error state → form restored with prior values

---

### Task 6.2 — Wire form into page component
**Complexity:** Small
**References:** TR.md Section 4.1

In `app/(dashboard)/workflows/new/page.tsx`:
- Import and render `WorkflowTriggerForm` with the pre-fetched `clients` prop
- Remove placeholder content

**Verification:** Full page renders with client list loaded, workflow selector, and form in initial state. No loading spinner for client list.

---

## Phase 7: Validation and Edge Cases

### Task 7.1 — Implement and test `validateForm` utility
**Complexity:** Small
**References:** TR.md Section 6.1, FRS.md FR-11

Extract `validateForm` into `apps/ui/src/lib/workflow/validate.ts`.

Write unit tests covering all validation rules:
- Missing workflow type
- Missing client
- Empty paste transcript
- No file uploaded
- File too large (edge: exactly 5 MB is valid, 5 MB + 1 byte is not)
- Missing call date
- Future call date (edge: today is valid, tomorrow is not)
- Missing cycle start date
- Missing cycle end date
- End date equals start date (invalid — must be strictly after)
- End date before start date
- All valid (returns `valid: true`, empty `errors`)

**Verification:** All test cases pass.

---

### Task 7.2 — QA the no-completed-tasks warning flow
**Complexity:** Small
**References:** FRS.md FR-16, GS.md Scenario Group 8

With a mock API returning a no-tasks error response:
- Submit the agenda workflow form
- Verify the warning message appears inline with the correct client name and date range
- Verify the form fields remain editable
- Verify the warning disappears when the user modifies the cycle date range

**Verification:** Warning displays correctly, does not block interaction.

---

## Phase 8: Testing

### Task 8.1 — Unit tests for `WorkflowSelector`
**Complexity:** Small
**References:** GS.md Scenario Group 2

Test cases:
- Renders both options
- Clicking an option fires `onChange` with correct value
- Selected option has active styling
- Neither selected by default

---

### Task 8.2 — Unit tests for `TranscriptSourceSelector`
**Complexity:** Small
**References:** GS.md Scenario Group 4

Test cases:
- Default tab is "Paste text"
- Switching to "Upload file" shows file input
- Grain tab is disabled and non-interactive
- File type validation rejects non-.txt
- File size validation rejects > 5 MB
- Valid .txt file reads content and updates callback

---

### Task 8.3 — Unit tests for `useWorkflowPoller`
**Complexity:** Small
**References:** TR.md Section 10.1

Test cases:
- Does not poll when `enabled: false`
- Polls immediately on mount when `enabled: true`
- Polls at the configured interval
- Stops polling when `enabled` changes to `false`
- Clears interval on unmount

---

### Task 8.4 — Integration tests for full submission flows
**Complexity:** Medium
**References:** TR.md Section 10.2

Using mocked `apiClient`:
- Intake flow: all inputs valid → transcript POST → workflow POST → polling to `complete` → navigation to `/clients/{id}/tasks`
- Agenda flow: all inputs valid → workflow POST → polling to `complete` → navigation to `/agendas/{short_id}`
- Intake transcript POST failure → error on form, no workflow POST called
- Workflow POST failure → error on form
- Poll returns `failed` → error state with retry/dashboard buttons
- "Try Again" from failed state → form with original inputs

---

### Task 8.5 — Accessibility audit
**Complexity:** Small
**References:** TR.md Section 10.4

Run `axe-core` against:
- Form view (workflow selected, all inputs visible)
- Progress view (polling in mock `processing` status)
- Error state

Confirm:
- All form inputs have associated labels
- Error messages linked to fields via `aria-describedby`
- Progress status has `role="status"` or `aria-live="polite"`
- Keyboard navigation reaches all interactive elements

---

## Phase 9: Final Verification

### Task 9.1 — E2E test against staging
**Complexity:** Small

With staging environment running:
- Full intake workflow: select → client → paste transcript → date → submit → progress → task review navigation
- Full agenda workflow: select → client → auto-dates → submit → progress → agenda editor navigation
- Team member redirect: log in as team member → navigate to `/workflows/new` → redirected

---

### Task 9.2 — Cross-browser smoke test
**Complexity:** Small

Verify form interactions in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)

Pay attention to: date picker rendering, file input behavior, `FileReader` API availability.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Route and Page Shell | 1.1, 1.2 | Small, Small |
| 2: Workflow Selector | 2.1, 2.2 | Small, Small |
| 3: Intake Inputs | 3.1, 3.2 | Medium, Small |
| 4: Agenda Inputs | 4.1 | Small |
| 5: Progress Indicator | 5.1, 5.2 | Medium, Small |
| 6: Form Orchestration | 6.1, 6.2 | Large, Small |
| 7: Validation and Edge Cases | 7.1, 7.2 | Small, Small |
| 8: Testing | 8.1–8.5 | Small/Medium mix |
| 9: Final Verification | 9.1, 9.2 | Small, Small |

**Total estimated complexity:** 1 Large task (Form Orchestration), 2 Medium tasks (TranscriptSourceSelector, useWorkflowPoller), remainder Small.

**Critical path:** Task 1.1 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 5.1 → 5.2 → 6.1 → 6.2. The form orchestrator (Task 6.1) is the highest-risk task and should be scheduled with adequate time for the full submission sequence testing.
