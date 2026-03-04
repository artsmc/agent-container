# Feature 30: UI Workflow Trigger

## Summary
Build Screen 8 (Workflow Trigger) at route `/workflows/new`. Includes a workflow selector (Intake->Tasks or Tasks->Agenda), client selector, intake inputs (transcript paste/upload/Grain select, call date), agenda inputs (cycle date range), progress indicator during Mastra processing, and transition to results screen when complete.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding), 24 (UI auth flow), 22 (api-client), 17 (workflow orchestration API endpoints)
- **Blocks**: None (leaf feature — triggers workflows and transitions to task review or agenda editor)

## Source PRDs
- `ui-prd.md` — Screen 8: Workflow Trigger

## Relevant PRD Extracts

### Screen 8: Workflow Trigger (ui-prd.md)

**Route:** `/workflows/new`

Screen for manually triggering a workflow.

**Layout:**
- **Workflow selector** — Choose "Intake -> Tasks" or "Completed Tasks -> Agenda".
- **Client selector** — Choose which client this workflow is for.
- **Intake workflow inputs:**
  - Transcript source: paste text, upload file, or select from Grain.
  - Call date.
- **Agenda workflow inputs:**
  - Cycle date range (auto-suggested based on last agenda).
- **Progress indicator** — After triggering, show real-time status as the Mastra agent processes. Transition to the task review or agenda editor screen when complete.

### Workflow A: Post-Intake -> Build Tickets (mastra-prd.md)

**Trigger:** Manual (account manager initiates after intake call)

**Input:** Grain call transcript (intake call)

**Process:**
1. Parse transcript for action items assigned to iExcel team members.
2. Generate structured Asana tasks with description formatted as Task Context, Additional Context, Requirements.
3. Custom Fields: Client, Scrum Stage (`Backlog`), Estimated Time (`hh mm`).

**Output:** Draft tasks created for the respective client.

### Workflow B: Pre-Call -> Build Agenda (mastra-prd.md)

**Trigger:** Manual or scheduled (before the next client follow-up call)

**Prerequisite:** Completed tasks must exist for the client since the last cycle. If no completed tasks are found, warn the user.

**Input:** Completed tasks for the respective client.

**Process:**
1. Pull completed tasks, filtered by client.
2. Group and summarize tasks by theme/project.
3. Compile into Running Notes format.

**Output:** Draft agenda/Running Notes document.

### Workflow API Endpoints (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/workflows/intake` | POST | Trigger Workflow A: submit transcript, invoke Mastra agent, return draft tasks |
| `/workflows/agenda` | POST | Trigger Workflow B: pull completed tasks, invoke Mastra agent, return draft agenda |
| `/workflows/{id}/status` | GET | Check status of a running workflow |

**Workflow execution flow:**
1. Consumer calls `/workflows/intake` with `client_id` and `transcript_id`.
2. API validates the request, persists a workflow run record.
3. API invokes the Mastra agent (async).
4. Mastra agent processes the transcript and calls back to `/clients/{id}/tasks` (POST) to save draft tasks.
5. Consumer polls `/workflows/{id}/status` or receives a webhook/event when complete.

### Transcript Submission (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |

### Permission Model
- Only **Account Managers** and **Admins** can trigger workflows.

## Scope

### In Scope
- Workflow trigger page at route `/workflows/new` within DashboardLayout
- Workflow selector component:
  - "Intake -> Tasks" (Workflow A)
  - "Completed Tasks -> Agenda" (Workflow B)
- Client selector dropdown (populated from `GET /clients`)
- Intake workflow input form:
  - Transcript source selector:
    - Paste text (textarea)
    - Upload file (file input accepting .txt)
    - Select from Grain (dropdown/search of available transcripts — if Grain integration is available)
  - Call date picker
- Agenda workflow input form:
  - Cycle date range picker (start date, end date)
  - Auto-suggested dates based on last agenda for the selected client
- Form validation (required fields, valid dates, non-empty transcript)
- Submit action:
  - For intake: submit transcript via `POST /clients/{id}/transcripts`, then trigger workflow via `POST /workflows/intake`
  - For agenda: trigger workflow via `POST /workflows/agenda`
- Progress indicator:
  - Poll `GET /workflows/{id}/status` after triggering
  - Display real-time status updates (pending, processing, complete, failed)
- Transition on completion:
  - Intake workflow -> navigate to task review screen (`/clients/{client_id}/tasks`)
  - Agenda workflow -> navigate to agenda editor (`/agendas/{short_id}`)
- Error handling for workflow failures

### Out of Scope
- Mastra agent implementation (features 19, 20)
- Workflow orchestration API implementation (feature 17)
- Grain API integration for transcript pulling (feature 37 — V2; Grain select may be a placeholder)
- Scheduled/automatic workflow triggering
- Workflow history/log page

## Key Decisions
- Workflow triggering is always manual from the UI — the account manager explicitly chooses which workflow to run and for which client.
- The intake workflow requires two API calls: first submit the transcript (`POST /clients/{id}/transcripts`), then trigger the workflow (`POST /workflows/intake` with `client_id` and `transcript_id`).
- The progress indicator uses polling (`GET /workflows/{id}/status`) rather than WebSockets. The PRD mentions polling as the primary mechanism, with webhook/event as an alternative.
- The Grain transcript selector depends on feature 37 (Grain API integration, V2). In V1, only paste text and file upload are functional. The Grain option can be shown but disabled or hidden.
- Cycle date range for agenda workflow should auto-suggest dates based on the last agenda's cycle end date for the selected client, reducing manual input.
- On workflow completion, the UI navigates directly to the results — task review for intake workflows, agenda editor for agenda workflows. This provides immediate context for the next step in the human review process.
