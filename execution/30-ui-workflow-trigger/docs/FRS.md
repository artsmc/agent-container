# FRS — Functional Requirement Specification
## Feature 30: UI Workflow Trigger

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Page Architecture

### FR-01: Route Definition

The workflow trigger page must be registered at the Next.js App Router path `app/(dashboard)/workflows/new/page.tsx`. It must be inside the auth-protected `(dashboard)` route group established by Feature 23/24.

**Acceptance Criteria:**
- Navigating to `/workflows/new` resolves to the workflow trigger page
- Unauthenticated users are redirected to `/login`
- Users with `team_member` role are shown a 403/unauthorized screen or redirected to `/`
- Only `admin` and `account_manager` roles can access and use this page

### FR-02: Layout Wrapper

The page must use `DashboardLayout` (from `apps/ui/src/layouts/DashboardLayout.tsx`). This provides the standard left sidebar navigation, top bar, and authenticated chrome consistent with all other dashboard screens.

**Acceptance Criteria:**
- `DashboardLayout` wraps all page content
- Left sidebar navigation is present and correctly highlights any active workflow-related nav item
- The route is protected by auth middleware (unlike `/shared/*` routes)

### FR-03: Page-Level State

The workflow trigger page has two high-level states that determine what is rendered:

| State | Trigger | UI Shown |
|---|---|---|
| `form` | Initial page load; user has not submitted | Workflow selector + input form |
| `processing` | User has submitted the form and workflow is running | Progress indicator |

The `form` state is the default. Transitioning to `processing` is irreversible within the page session (once triggered, the user waits for completion or failure).

---

## 2. Workflow Selector

### FR-04: Workflow Type Selection

The page must display a workflow selector that allows the user to choose between exactly two workflow types:

| Option | Label | Description |
|---|---|---|
| `intake` | "Intake → Tasks" | Post-intake workflow: submit transcript, generate draft tasks |
| `agenda` | "Completed Tasks → Agenda" | Pre-call workflow: pull completed tasks, generate agenda |

**Interaction:**
- Rendered as a visual toggle, card selector, or segmented control — not a plain dropdown
- Only one workflow type can be selected at a time
- Default: no selection on page load (user must explicitly choose)
- Selecting a workflow type immediately reveals the corresponding input section (FR-06 or FR-08)

**Acceptance Criteria:**
- Both options are visible on page load
- Selecting one option deselects the other
- The input form below the selector updates immediately to show the relevant inputs
- Selection state is visually clear (active/inactive distinction)

### FR-05: Client Selector

Below the workflow selector, a client dropdown must be present regardless of workflow type.

**Data source:** `GET /clients` — returns the list of clients the current user has access to.

**Behavior:**
- Searchable dropdown (supports typing to filter clients)
- Shows client name in options
- Required field — form cannot be submitted without a client selection
- On selection of a client for the **agenda** workflow: the cycle date range is auto-populated (see FR-09)
- Client list is fetched on page load and cached for the duration of the session

**Acceptance Criteria:**
- Client dropdown is populated from `GET /clients`
- Unselected state shows a placeholder ("Select a client...")
- Search/filter narrows the list in real time as user types
- Client selection is required; attempting to submit without one shows a validation error

---

## 3. Intake Workflow Inputs (Workflow A)

Shown when the user selects "Intake → Tasks". Hidden when "Completed Tasks → Agenda" is selected.

### FR-06: Transcript Source Selector

The user must choose how to provide the transcript. Three options are presented:

| Option | Label | V1 Status | Input |
|---|---|---|---|
| `paste` | "Paste text" | Active | Textarea |
| `upload` | "Upload file" | Active | File input (`.txt` only) |
| `grain` | "Select from Grain" | Disabled (V1) | Disabled dropdown |

**Interaction:**
- Rendered as tabs, a segmented control, or radio buttons
- Selecting `paste` shows a textarea
- Selecting `upload` shows a file upload button; when a file is selected, display the filename and a remove button
- The `grain` option is visible but disabled with a tooltip or label indicating "Coming soon" or "V2"
- Default selection: `paste`

**Paste input:**
- Multi-line textarea with minimum 5 rows visible
- Placeholder: "Paste the call transcript here..."
- Required — cannot be empty on submission
- Character count display optional but helpful

**File upload input:**
- Accepts `.txt` files only (`accept=".txt"`)
- On file selection, display filename
- File content is read client-side (using `FileReader`) and submitted as text to the API
- File size limit: 5 MB (enforced client-side before submission)
- Validation: file must not be empty after reading

**Acceptance Criteria:**
- Switching between paste/upload resets the other input
- Grain option is visible but non-interactive in V1
- Attempting to submit with empty textarea or no file shows a validation error
- File over 5 MB shows an error before any API call is made
- Uploaded file content is sent as transcript text (not as a binary file upload)

### FR-07: Call Date Picker

A date picker input for the intake call date.

- Required field
- Default: today's date
- Cannot be in the future (validation rule)
- Displayed as a date input (`type="date"`) styled to match the design system

**Acceptance Criteria:**
- Default value is today's date
- Future dates are rejected with a validation error on submit
- Required — cannot be empty

---

## 4. Agenda Workflow Inputs (Workflow B)

Shown when the user selects "Completed Tasks → Agenda". Hidden when "Intake → Tasks" is selected.

### FR-08: Cycle Date Range Picker

Two date inputs: cycle start date and cycle end date.

- Both are required
- End date must be after start date (validation rule)
- Both are `type="date"` styled inputs
- Auto-populated when client is selected (see FR-09)

**Acceptance Criteria:**
- Both inputs are required; submitting with either empty shows a validation error
- End date before start date shows a validation error
- Date range can be manually overridden after auto-population

### FR-09: Auto-Suggested Cycle Dates

When a client is selected for the **agenda** workflow, the cycle date range should be automatically pre-filled based on the client's last agenda cycle end date.

**Logic:**
- On client selection, call `GET /clients/{id}/agendas?limit=1&sort=cycle_end:desc` (or equivalent) to get the most recent agenda
- If a previous agenda exists: pre-fill cycle start = previous agenda's `cycle_end + 1 day`, cycle end = previous agenda's `cycle_end + 30 days` (or configurable default period)
- If no previous agenda: pre-fill both as empty (user must enter manually)
- Auto-suggestion is a convenience — user can override both dates freely

**Acceptance Criteria:**
- When a client with prior agendas is selected, start/end dates are pre-filled
- When a client with no prior agendas is selected, fields remain empty
- Pre-filled dates can be manually changed without error
- Auto-population does not happen for the intake workflow (intake uses a single call date)

---

## 5. Form Submission

### FR-10: Submit Button

A primary submit button labeled according to the selected workflow:

| Workflow | Button Label |
|---|---|
| Intake | "Trigger Intake Workflow" |
| Agenda | "Trigger Agenda Workflow" |
| No selection | "Select a workflow to continue" (disabled) |

**Acceptance Criteria:**
- Button is disabled when no workflow type is selected
- Button label reflects the selected workflow type
- Clicking the button triggers form validation before any API call
- If validation fails, the button does not trigger API calls and validation errors are shown inline

### FR-11: Form Validation

All validation occurs client-side before API calls are made.

**Validation rules:**

| Field | Rule | Error Message |
|---|---|---|
| Workflow type | Must be selected | "Please select a workflow type" |
| Client | Must be selected | "Please select a client" |
| Transcript (paste) | Must not be empty | "Please paste the transcript text" |
| Transcript (upload) | File must be selected and non-empty | "Please upload a transcript file" |
| File size | Must be ≤ 5 MB | "File is too large (max 5 MB)" |
| File type | Must be `.txt` | "Only .txt files are supported" |
| Call date | Must be provided and not in the future | "Call date is required" / "Call date cannot be in the future" |
| Cycle start date | Required for agenda workflow | "Cycle start date is required" |
| Cycle end date | Required for agenda workflow | "Cycle end date is required" |
| Date range | End date must be after start date | "End date must be after start date" |

**Behavior:**
- Errors are shown inline below each field, not in a single summary banner
- Validation runs on submit; individual field errors may also clear as the user corrects them
- The submit button does not become a loading state until all validation passes

### FR-12: Intake Submission Sequence

When the intake workflow is submitted with valid inputs:

**Step 1: Submit Transcript**
```
POST /clients/{client_id}/transcripts
Body: { text: string, call_date: string }
Response: { transcript_id: UUID, ... }
```

**Step 2: Trigger Workflow**
```
POST /workflows/intake
Body: { client_id: UUID, transcript_id: UUID }
Response: { workflow_run_id: UUID, status: "pending" }
```

**Error handling:**
- If Step 1 fails: show error message, stay on form (do not trigger Step 2)
- If Step 2 fails: show error message, inform user the transcript was saved but workflow failed to start

The UI transitions to the `processing` state after receiving a successful `workflow_run_id` from Step 2.

### FR-13: Agenda Submission Sequence

When the agenda workflow is submitted with valid inputs:

```
POST /workflows/agenda
Body: { client_id: UUID, cycle_start: string, cycle_end: string }
Response: { workflow_run_id: UUID, status: "pending" }
```

**Error handling:**
- If the API returns a specific error indicating no completed tasks were found: display a warning (see FR-16)
- Other errors: show error message and allow retry

The UI transitions to the `processing` state after receiving a successful `workflow_run_id`.

---

## 6. Progress Indicator

### FR-14: Processing State Layout

After a workflow is triggered, the form is replaced by a progress indicator. The layout shows:

- **Workflow type label:** "Intake Workflow" or "Agenda Workflow"
- **Client name:** The name of the selected client
- **Status indicator:** Visual state (spinner, progress bar, or step indicator)
- **Status text:** Human-readable status message
- **Cancel/Back option:** A link or button to return to the dashboard (but not to restart the workflow)

**Acceptance Criteria:**
- Form is no longer visible once processing begins
- Progress indicator is visible immediately after form submission (before first poll response)
- Client name and workflow type are displayed for context

### FR-15: Status Polling

The UI must poll `GET /workflows/{id}/status` to retrieve workflow progress.

**Polling behavior:**
- Poll interval: every 3 seconds
- Polling begins immediately after receiving the `workflow_run_id`
- Polling stops when a terminal status is reached: `complete` or `failed`
- Polling stops if the user navigates away from the page

**Status mapping:**

| API Status | UI Display |
|---|---|
| `pending` | "Preparing..." with spinner |
| `processing` | "Processing transcript..." (intake) or "Building agenda..." (agenda) with spinner |
| `complete` | "Complete!" with success indicator — then auto-navigate (see FR-17) |
| `failed` | "Something went wrong" — show error state (see FR-18) |

**Acceptance Criteria:**
- First status message appears within 1 second of form submission
- Status updates reflect the latest poll response within 5 seconds
- Poll stops when `complete` or `failed` is received
- No memory leaks — intervals are cleared on component unmount

### FR-16: No Completed Tasks Warning (Agenda Workflow)

If the POST to `/workflows/agenda` returns an error indicating no completed tasks were found for the client in the specified date range:

- Do not transition to the processing state
- Stay on the form view
- Show a warning message inline: "No completed tasks were found for [Client Name] between [start date] and [end date]. Please adjust the date range or verify tasks are marked as completed in Asana."
- Allow the user to modify the date range and retry

**Acceptance Criteria:**
- Warning is shown inline, not as a modal
- The form fields remain editable after the warning
- Warning is cleared when the user modifies the date range

---

## 7. Completion and Navigation

### FR-17: Auto-Navigation on Success

When the workflow status reaches `complete`:

| Workflow | Navigate to | Route |
|---|---|---|
| Intake (Workflow A) | Task review screen for the client | `/clients/{client_id}/tasks` |
| Agenda (Workflow B) | Agenda editor for the generated agenda | `/agendas/{short_id}` |

**The `short_id` for the agenda** is retrieved from the workflow status response when `complete`:
```typescript
GET /workflows/{id}/status
Response (complete): {
  status: "complete",
  result: {
    // For intake:
    task_count: number
    // For agenda:
    agenda_short_id: string   // e.g. "AGD-0042"
  }
}
```

**Navigation behavior:**
- A brief success message ("Complete! Redirecting...") is shown for 1–2 seconds before navigation
- Navigation uses `router.push()` — adds to browser history so users can return to the dashboard
- No user action required — navigation is automatic

**Acceptance Criteria:**
- Intake workflow navigates to `/clients/{client_id}/tasks`
- Agenda workflow navigates to `/agendas/{agenda_short_id}` (short_id from status response)
- Navigation happens automatically within 2 seconds of `complete` status
- User can see a success message briefly before navigation

### FR-18: Error State

When the workflow status reaches `failed`:

- Polling stops
- Error state replaces the spinner
- Display: "The workflow could not be completed."
- Show a secondary message with any error detail returned by the API (sanitized — no stack traces)
- Provide two action buttons:
  - "Try Again" — returns to the form view with the previous inputs pre-filled
  - "Return to Dashboard" — navigates to `/`

**Acceptance Criteria:**
- Error state is shown for `failed` status
- "Try Again" restores the form with previous inputs intact
- "Return to Dashboard" navigates to `/`
- No technical error details (stack traces, raw API errors) shown to the user

---

## 8. Component Breakdown

### FR-19: New Components Required

| Component | Location | Type | Purpose |
|---|---|---|---|
| `WorkflowTriggerPage` | `app/(dashboard)/workflows/new/page.tsx` | Server Component (shell) | Route entry; loads client list server-side |
| `WorkflowTriggerForm` | `components/WorkflowTrigger/WorkflowTriggerForm.tsx` | Client Component | All form interaction, validation, submission |
| `WorkflowSelector` | `components/WorkflowTrigger/WorkflowSelector.tsx` | Client Component | Intake/Agenda toggle |
| `ClientSelector` | `components/WorkflowTrigger/ClientSelector.tsx` | Client Component | Searchable client dropdown |
| `IntakeInputs` | `components/WorkflowTrigger/IntakeInputs.tsx` | Client Component | Transcript source + call date |
| `TranscriptSourceSelector` | `components/WorkflowTrigger/TranscriptSourceSelector.tsx` | Client Component | Paste/Upload/Grain tabs |
| `AgendaInputs` | `components/WorkflowTrigger/AgendaInputs.tsx` | Client Component | Cycle date range with auto-suggest |
| `WorkflowProgress` | `components/WorkflowTrigger/WorkflowProgress.tsx` | Client Component | Progress indicator during processing |

### FR-20: Existing Components to Reuse

| Asset | Source Feature | Usage |
|---|---|---|
| `DashboardLayout.tsx` | Feature 23 (ui-scaffolding) | Page layout wrapper |
| `ui-tokens` package | Feature 23 (ui-scaffolding) | All SCSS design tokens |
| `api-client` package | Feature 22 (api-client-package) | All API calls |
