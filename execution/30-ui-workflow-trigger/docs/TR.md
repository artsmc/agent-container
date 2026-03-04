# TR — Technical Requirements
## Feature 30: UI Workflow Trigger

**Version:** 1.0
**Date:** 2026-03-03
**Next.js Version:** 16.1.6

---

## 1. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.1.6, App Router | Inside `(dashboard)` route group |
| Language | TypeScript | Strict mode |
| Styling | SCSS Modules + `ui-tokens` package | No Tailwind, no shadcn |
| API access | `api-client` package (Feature 22) | All API calls go through typed client |
| Form state | React `useState` + `useReducer` | No external form library; custom validation |
| Polling | `setInterval` inside `useEffect` | Cleared on unmount and on terminal state |
| File reading | Native `FileReader` API | No external file library needed |
| Navigation | `useRouter` from `next/navigation` | `router.push()` for post-completion navigation |
| Rendering | Client Component (form is interactive) | Page shell may be Server Component for initial client list fetch |

---

## 2. File Structure

```
apps/ui/
└── src/
    ├── app/
    │   └── (dashboard)/
    │       └── workflows/
    │           └── new/
    │               └── page.tsx                              # Route entry — Server Component shell
    ├── components/
    │   └── WorkflowTrigger/
    │       ├── WorkflowTriggerForm/
    │       │   ├── WorkflowTriggerForm.tsx                   # "use client" — main form orchestrator
    │       │   ├── WorkflowTriggerForm.module.scss
    │       │   └── index.ts
    │       ├── WorkflowSelector/
    │       │   ├── WorkflowSelector.tsx                      # "use client" — intake/agenda toggle
    │       │   ├── WorkflowSelector.module.scss
    │       │   └── index.ts
    │       ├── ClientSelector/
    │       │   ├── ClientSelector.tsx                        # "use client" — searchable client dropdown
    │       │   ├── ClientSelector.module.scss
    │       │   └── index.ts
    │       ├── IntakeInputs/
    │       │   ├── IntakeInputs.tsx                          # "use client" — transcript + call date
    │       │   ├── IntakeInputs.module.scss
    │       │   └── index.ts
    │       ├── TranscriptSourceSelector/
    │       │   ├── TranscriptSourceSelector.tsx              # "use client" — paste/upload/grain tabs
    │       │   ├── TranscriptSourceSelector.module.scss
    │       │   └── index.ts
    │       ├── AgendaInputs/
    │       │   ├── AgendaInputs.tsx                          # "use client" — cycle date range
    │       │   ├── AgendaInputs.module.scss
    │       │   └── index.ts
    │       └── WorkflowProgress/
    │           ├── WorkflowProgress.tsx                      # "use client" — polling progress indicator
    │           ├── WorkflowProgress.module.scss
    │           └── index.ts
    └── lib/
        └── workflow/
            └── poll.ts                                       # Polling utility (useWorkflowPoller hook)
```

---

## 3. API Contracts

### 3.1 Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /clients` | GET | Populate client selector on page load |
| `GET /clients/{id}/agendas` | GET | Fetch last agenda for cycle date auto-suggestion |
| `POST /clients/{id}/transcripts` | POST | Submit transcript text (Step 1 of intake) |
| `POST /workflows/intake` | POST | Trigger Workflow A (Step 2 of intake) |
| `POST /workflows/agenda` | POST | Trigger Workflow B (agenda) |
| `GET /workflows/{id}/status` | GET | Poll workflow run status |

### 3.2 Request / Response Shapes

#### `GET /clients`
```typescript
interface Client {
  id: string           // UUID
  name: string
  // ... other fields
}
type GetClientsResponse = Client[]
```

#### `GET /clients/{id}/agendas?limit=1&sort=cycle_end:desc`
```typescript
interface AgendaSummary {
  id: string
  short_id: string     // "AGD-0042"
  cycle_start: string  // ISO date "2026-02-01"
  cycle_end: string    // ISO date "2026-02-28"
  status: string
}
type GetClientAgendasResponse = AgendaSummary[]
```

#### `POST /clients/{id}/transcripts`
```typescript
// Request
interface SubmitTranscriptRequest {
  text: string         // Full transcript content
  call_date: string    // ISO date "2026-03-01"
}
// Response
interface SubmitTranscriptResponse {
  transcript_id: string  // UUID — used in next call
  client_id: string
}
```

#### `POST /workflows/intake`
```typescript
// Request
interface TriggerIntakeRequest {
  client_id: string      // UUID
  transcript_id: string  // UUID from POST /transcripts
}
// Response
interface TriggerWorkflowResponse {
  workflow_run_id: string  // UUID
  status: 'pending'
}
```

#### `POST /workflows/agenda`
```typescript
// Request
interface TriggerAgendaRequest {
  client_id: string    // UUID
  cycle_start: string  // ISO date
  cycle_end: string    // ISO date
}
// Response (success)
interface TriggerWorkflowResponse {
  workflow_run_id: string
  status: 'pending'
}
// Response (no completed tasks — treat as a specific error)
// API returns 422 or a business error code indicating no completed tasks
```

#### `GET /workflows/{id}/status`
```typescript
type WorkflowStatus = 'pending' | 'processing' | 'complete' | 'failed'

interface WorkflowStatusResponse {
  workflow_run_id: string
  status: WorkflowStatus
  message?: string         // Optional human-readable status detail
  result?: {
    // Intake workflow result
    task_count?: number
    // Agenda workflow result
    agenda_short_id?: string   // e.g. "AGD-0042"
  }
  error?: string             // Present when status === 'failed'
}
```

---

## 4. Component Specifications

### 4.1 Page Component (`app/(dashboard)/workflows/new/page.tsx`)

The page component is a Server Component that pre-fetches the client list and passes it to the Client Component form.

```typescript
// Server Component — no "use client"
export default async function WorkflowTriggerPage() {
  // Pre-fetch client list server-side for fast initial render
  const clients = await apiClient.clients.list()

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Trigger Workflow</h1>
        <WorkflowTriggerForm clients={clients} />
      </div>
    </DashboardLayout>
  )
}
```

**Key decisions:**
- Clients are fetched server-side to avoid a client-side loading state for the selector
- All interactive form logic lives in `WorkflowTriggerForm` (Client Component)
- `params` is not used — this is a static route (`/workflows/new`), no dynamic segments

### 4.2 Form State Model

`WorkflowTriggerForm` manages all form state using `useReducer` for predictable state transitions.

```typescript
'use client'

type WorkflowType = 'intake' | 'agenda'
type TranscriptSource = 'paste' | 'upload' | 'grain'
type PageState = 'form' | 'processing'
type ProcessingStatus = 'pending' | 'processing' | 'complete' | 'failed'

interface FormState {
  pageState: PageState
  workflowType: WorkflowType | null
  clientId: string | null
  clientName: string | null
  // Intake inputs
  transcriptSource: TranscriptSource
  transcriptText: string
  callDate: string                     // "YYYY-MM-DD"
  // Agenda inputs
  cycleStart: string                   // "YYYY-MM-DD"
  cycleEnd: string                     // "YYYY-MM-DD"
  // Processing state
  workflowRunId: string | null
  processingStatus: ProcessingStatus | null
  processingMessage: string | null
  resultAgendaShortId: string | null
  // Error
  submitError: string | null
  noTasksWarning: string | null
  fieldErrors: Record<string, string>
}
```

### 4.3 Polling Hook (`lib/workflow/poll.ts`)

```typescript
'use client'

import { useEffect, useRef } from 'react'

interface UseWorkflowPollerOptions {
  workflowRunId: string | null
  enabled: boolean
  intervalMs?: number
  onStatusUpdate: (status: WorkflowStatusResponse) => void
  onError: (error: Error) => void
}

export function useWorkflowPoller({
  workflowRunId,
  enabled,
  intervalMs = 3000,
  onStatusUpdate,
  onError,
}: UseWorkflowPollerOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled || !workflowRunId) return

    const poll = async () => {
      try {
        const status = await apiClient.workflows.getStatus(workflowRunId)
        onStatusUpdate(status)
        // Caller is responsible for stopping polling based on terminal status
      } catch (err) {
        onError(err as Error)
      }
    }

    // Immediate first poll
    poll()
    intervalRef.current = setInterval(poll, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [workflowRunId, enabled, intervalMs])
}
```

**Key decisions:**
- Hook is responsible for the polling loop; the caller handles stopping (by setting `enabled: false` when a terminal status is reached)
- Interval is cleared on component unmount via `useEffect` cleanup
- First poll is immediate (no initial delay)

### 4.4 `TranscriptSourceSelector` — File Reading

```typescript
// Inside TranscriptSourceSelector.tsx — "use client"

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  // Type validation
  if (!file.name.endsWith('.txt')) {
    setFieldError('File must be a .txt file')
    return
  }

  // Size validation (5 MB = 5 * 1024 * 1024 bytes)
  if (file.size > 5 * 1024 * 1024) {
    setFieldError('File is too large (max 5 MB)')
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    const text = event.target?.result as string
    if (!text || text.trim() === '') {
      setFieldError('The uploaded file is empty')
      return
    }
    onTranscriptTextChange(text)
    setFileName(file.name)
    setFieldError(null)
  }
  reader.onerror = () => {
    setFieldError('Failed to read the file. Please try again.')
  }
  reader.readAsText(file)
}
```

### 4.5 Auto-Suggested Cycle Dates

```typescript
// Inside AgendaInputs.tsx or WorkflowTriggerForm.tsx

const fetchLastAgendaForCycleSuggestion = async (clientId: string) => {
  try {
    const agendas = await apiClient.clients.listAgendas(clientId, {
      limit: 1,
      sort: 'cycle_end:desc',
    })
    if (agendas.length > 0) {
      const lastCycleEnd = new Date(agendas[0].cycle_end)
      const nextStart = new Date(lastCycleEnd)
      nextStart.setDate(nextStart.getDate() + 1)
      const nextEnd = new Date(nextStart)
      nextEnd.setDate(nextEnd.getDate() + 30)
      setCycleStart(formatDateISO(nextStart))
      setCycleEnd(formatDateISO(nextEnd))
    } else {
      // No previous agendas — leave fields empty
      setCycleStart('')
      setCycleEnd('')
    }
  } catch {
    // Non-fatal — just leave fields empty
    setCycleStart('')
    setCycleEnd('')
  }
}
```

### 4.6 Intake Submission Sequence

```typescript
const handleIntakeSubmit = async (formData: IntakeFormData) => {
  setSubmitLoading(true)
  setSubmitError(null)

  // Step 1: Submit transcript
  let transcriptId: string
  try {
    const transcriptResult = await apiClient.clients.submitTranscript(
      formData.clientId,
      {
        text: formData.transcriptText,
        call_date: formData.callDate,
      }
    )
    transcriptId = transcriptResult.transcript_id
  } catch (err) {
    setSubmitError('Failed to submit transcript. Please try again.')
    setSubmitLoading(false)
    return
  }

  // Step 2: Trigger workflow
  try {
    const workflowResult = await apiClient.workflows.triggerIntake({
      client_id: formData.clientId,
      transcript_id: transcriptId,
    })
    setWorkflowRunId(workflowResult.workflow_run_id)
    setPageState('processing')
  } catch (err) {
    setSubmitError(
      'The transcript was saved, but the workflow could not be started. Please try again.'
    )
    setSubmitLoading(false)
  }
}
```

---

## 5. SCSS Module Architecture

### 5.1 Token Imports

All SCSS modules import from the `ui-tokens` package:

```scss
@use '@iexcel/ui-tokens' as tokens;
```

### 5.2 WorkflowSelector Styles

```scss
// WorkflowSelector.module.scss
.selectorContainer {
  display: flex;
  gap: tokens.$spacing-4;
  margin-bottom: tokens.$spacing-6;
}

.option {
  flex: 1;
  padding: tokens.$spacing-5 tokens.$spacing-4;
  border: 2px solid tokens.$color-border-default;
  border-radius: tokens.$radius-lg;
  cursor: pointer;
  transition: border-color tokens.$transition-fast,
              background-color tokens.$transition-fast;

  &:hover {
    border-color: tokens.$color-brand-primary;
  }

  &.selected {
    border-color: tokens.$color-brand-primary;
    background-color: tokens.$color-brand-tint;
  }
}

.optionLabel {
  font-size: tokens.$font-size-base;
  font-weight: tokens.$font-weight-semibold;
  color: tokens.$color-text-primary;
}

.optionDescription {
  font-size: tokens.$font-size-sm;
  color: tokens.$color-text-secondary;
  margin-top: tokens.$spacing-1;
}
```

### 5.3 Progress Indicator Styles

```scss
// WorkflowProgress.module.scss
.progressContainer {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: tokens.$spacing-12 tokens.$spacing-6;
  text-align: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid tokens.$color-border-default;
  border-top-color: tokens.$color-brand-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: tokens.$spacing-6;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.statusText {
  font-size: tokens.$font-size-lg;
  color: tokens.$color-text-primary;
  margin-bottom: tokens.$spacing-2;
}

.statusDetail {
  font-size: tokens.$font-size-sm;
  color: tokens.$color-text-secondary;
}
```

---

## 6. Form Validation Strategy

### 6.1 Validation Function

A pure validation function (no side effects) runs before any submission:

```typescript
interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

function validateForm(state: FormState): ValidationResult {
  const errors: Record<string, string> = {}

  if (!state.workflowType) {
    errors.workflowType = 'Please select a workflow type'
  }

  if (!state.clientId) {
    errors.clientId = 'Please select a client'
  }

  if (state.workflowType === 'intake') {
    if (!state.transcriptText || state.transcriptText.trim() === '') {
      errors.transcript = state.transcriptSource === 'paste'
        ? 'Please paste the transcript text'
        : 'Please upload a transcript file'
    }
    if (!state.callDate) {
      errors.callDate = 'Call date is required'
    } else {
      const callDate = new Date(state.callDate)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (callDate > today) {
        errors.callDate = 'Call date cannot be in the future'
      }
    }
  }

  if (state.workflowType === 'agenda') {
    if (!state.cycleStart) errors.cycleStart = 'Cycle start date is required'
    if (!state.cycleEnd) errors.cycleEnd = 'Cycle end date is required'
    if (state.cycleStart && state.cycleEnd && state.cycleEnd <= state.cycleStart) {
      errors.cycleEnd = 'End date must be after start date'
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
```

---

## 7. Performance Requirements

| Metric | Target | Approach |
|---|---|---|
| Initial page load | < 500ms to interactive | Client list pre-fetched server-side; no client-side loading state for selector |
| Form interaction | Immediate response | All form state is local React state — no debounced API calls during interaction |
| Polling latency | Status reflects reality within 5s | 3-second poll interval |
| Navigation after complete | < 2 seconds | Auto-navigation triggered immediately on terminal status |
| No memory leaks | Polling interval always cleared | `useEffect` cleanup + check for terminal status before next poll |

---

## 8. Security Considerations

### 8.1 Role-Based Access

The route must be inside the `(dashboard)` route group to ensure auth middleware applies. Additionally, the page component must check the user's role:

```typescript
// In page.tsx (Server Component)
import { getServerSession } from '@/lib/auth'

export default async function WorkflowTriggerPage() {
  const session = await getServerSession()
  if (!session || !['admin', 'account_manager'].includes(session.user.role)) {
    redirect('/')
  }
  // ... rest of page
}
```

### 8.2 File Content Handling

File content is read client-side as plain text and sent as a string in the request body. No binary file upload to the API. The `FileReader.readAsText()` approach is safe for `.txt` files and avoids multipart/form-data complexity.

### 8.3 Input Sanitization

Transcript text is user-provided content that will be processed by Mastra agents. The API layer is responsible for sanitizing and normalizing transcript input. The UI submits raw text without modification.

### 8.4 No Sensitive Data in URLs

Workflow run IDs are UUIDs and are not exposed in the URL during processing. The progress state is managed in component state, not in the URL.

---

## 9. Dependencies

### 9.1 Internal Dependencies

| Dependency | Feature | What is needed |
|---|---|---|
| `DashboardLayout` | Feature 23 (ui-scaffolding) | Page layout |
| `ui-tokens` package | Feature 23 (ui-scaffolding) | SCSS design tokens |
| `api-client` package | Feature 22 (api-client-package) | All API calls |
| Auth middleware / session | Feature 24 (ui-auth-flow) | Role check on page |
| `GET /clients` | Feature 09 (client-management) | Client list |
| `POST /clients/{id}/transcripts` | Feature 10 (transcript-endpoints) | Transcript submission |
| `POST /workflows/intake` | Feature 17 (workflow-orchestration) | Intake trigger |
| `POST /workflows/agenda` | Feature 17 (workflow-orchestration) | Agenda trigger |
| `GET /workflows/{id}/status` | Feature 17 (workflow-orchestration) | Status polling |
| `GET /clients/{id}/agendas` | Feature 14 (agenda-endpoints) | Cycle date auto-suggestion |

### 9.2 External/NPM Dependencies

No new npm dependencies are required. All needed browser APIs (`FileReader`, `setInterval`) are native.

---

## 10. Testing Requirements

### 10.1 Unit Tests

- `validateForm`: all rules produce correct errors for invalid inputs; returns `valid: true` for fully valid form
- `useWorkflowPoller`: polling starts on mount, stops on terminal status, clears interval on unmount
- `TranscriptSourceSelector`: file type validation, file size validation, FileReader read
- Date formatting utilities used in cycle date auto-suggestion
- `AgendaInputs`: date range validation (end before start)

### 10.2 Integration Tests

- `WorkflowTriggerForm` with mock API: full intake submission sequence (transcript POST → workflow POST → poll to complete → navigation)
- `WorkflowTriggerForm` with mock API: agenda submission sequence (workflow POST → poll to complete → navigation)
- `WorkflowTriggerForm` with mock API: Step 1 failure (transcript POST fails, stays on form)
- `WorkflowTriggerForm` with mock API: workflow failed status renders error state
- `WorkflowTriggerForm` with mock API: no completed tasks response shows warning

### 10.3 E2E Tests

- Navigate to `/workflows/new` as account manager → form visible
- Navigate to `/workflows/new` as team member → redirected
- Full intake workflow: select workflow, client, paste transcript, set date, submit → progress indicator → mock complete → navigate to task review
- Full agenda workflow: select workflow, client, auto-populated dates → submit → navigate to agenda editor
- Error scenario: trigger intake with server error → error state → "Try Again" restores form

### 10.4 Accessibility Tests

- Workflow selector is keyboard-navigable (arrow keys or Tab)
- Form fields have associated labels
- Error messages are associated with their fields via `aria-describedby`
- Submit button `aria-disabled` when in invalid state
- Progress indicator has appropriate `role="status"` or `aria-live` region for screen reader announcements
