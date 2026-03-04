# Feature 19: Workflow A — Intake Agent

## Summary
Build the Mastra agent for Workflow A (Post-Intake to Build Tickets). The agent receives a NormalizedTranscript, parses it for action items assigned to iExcel team members, and generates structured NormalizedTask objects. Each task includes a description formatted with Task Context, Additional Context, and Requirements sections, plus custom fields (client, scrum stage, estimated time) and assignee. The agent calls the API to save draft tasks.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 18 (Mastra Runtime Setup — agent runs on this runtime), 08 (Input Normalizer Text — produces the NormalizedTranscript the agent consumes), 11 (Task Endpoints — agent calls POST /clients/{id}/tasks to save draft tasks)
- **Blocks**: None directly (this is invoked by feature 17 — Workflow Orchestration)

## Source PRDs
- mastra-prd.md (Workflow A: Post-Intake to Build Tickets, Guardrails)
- api-prd.md (Task creation endpoints)

## Relevant PRD Extracts

### Workflow A: Post-Intake — Build Tickets (mastra-prd.md)

> **Trigger:** Manual (account manager initiates after intake call)
>
> **Input:** Grain call transcript (intake call)
>
> **Process:**
> 1. Parse transcript for action items assigned to iExcel team members.
> 2. Generate structured Asana tasks with:
>    - **Description** formatted as:
>      - Task Context — conversational summary with transcript quotes and call dates
>      - Additional Context — related, external, or historical factors
>      - Requirements — tools, steps, and specifics needed to execute
>    - **Custom Fields:**
>      - Client (e.g., `Total Life`)
>      - Scrum Stage (`Backlog`)
>      - Estimated Time (`hh mm` format, based on industry best practices)
> 3. Output tasks via Asana API (or CSV export as fallback).
>
> **Output:** Asana tasks created for the respective client project.

### Guardrails (mastra-prd.md)

> - **Intake vs. Follow-up disambiguation:** Workflow A is always manually triggered.
> - **Data scoping:** All queries are scoped to a specific client. No cross-client data leakage.
> - **Prompt structure:** Task descriptions use a defined template to ensure consistency regardless of which account manager triggers the workflow.

### Task Creation Endpoint (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/tasks` | POST | Create draft tasks (called by Mastra after transcript processing). Short IDs are auto-assigned. |

### Tasks Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `title` | VARCHAR | Task title |
| `description` | TEXT | Full structured description (Task Context, Additional Context, Requirements) |
| `assignee` | VARCHAR | iExcel team member |
| `estimated_time` | INTERVAL | Estimated time in hh:mm |
| `scrum_stage` | VARCHAR | Default: `Backlog` |
| `transcript_id` | UUID | FK to Transcripts (source transcript) |
| `client_id` | UUID | FK to Clients |
| `status` | ENUM | Created as `draft` |

### System Context (mastra-prd.md)

> - Every single call, both internally and per client, is recorded via Grain, with transcripts available per call.
> - After each client-facing call, there is often (if not always) a private, internal "intake" call where our team discusses the details of the prior call.
> - During this "intake" call, the iExcel account manager builds specific tickets manually.

## Scope

### In Scope
- Mastra agent definition for Workflow A (intake transcript processing)
- LLM prompt design for parsing action items from NormalizedTranscript format
- Output structured NormalizedTask objects with:
  - Title (concise, actionable)
  - Description with three sections: Task Context (conversational summary with transcript quotes and call dates), Additional Context (related/external/historical factors), Requirements (tools, steps, specifics needed)
  - Assignee (iExcel team member extracted from transcript)
  - Estimated Time (hh:mm format, based on industry best practices when transcript doesn't specify)
  - Scrum Stage (default: Backlog)
  - Client reference (client_id from the workflow trigger)
  - Transcript reference (transcript_id from the workflow trigger)
- Call API to save draft tasks via POST /clients/{id}/tasks (using api-client package with Mastra's service token)
- Handle edge cases: no action items found, ambiguous assignees, unclear time estimates
- Return created task references (short IDs) to the workflow orchestration layer

### Out of Scope
- Grain API integration or transcript fetching (the agent receives a NormalizedTranscript, not raw Grain data)
- Asana push logic (tasks are saved as drafts in Postgres; pushing to Asana is a separate approval-gated step)
- Task approval or editing (that happens through the API endpoints and UI)
- Workflow triggering and orchestration (that is feature 17)
- Mastra runtime setup (that is feature 18)

## Key Decisions
- **Agent consumes NormalizedTranscript format, not Grain-specific data.** The input normalizer (feature 08) handles conversion from raw transcript text to the normalized format. The agent is transcript-source-agnostic.
- **Output is NormalizedTask format saved via API.** The agent calls POST /clients/{id}/tasks through the api-client package. Tasks are created with `status = draft` and must go through human review before being pushed to Asana.
- **V1: manual transcript input, no Grain automation.** The account manager manually triggers the workflow after an intake call. Automated Grain polling is not in scope for V1 (see feature 37 for future Grain integration).
- **Description template is enforced by the prompt.** Every task description follows the three-section template (Task Context, Additional Context, Requirements) regardless of which account manager triggers the workflow or what the transcript content is. This ensures consistency.
- **Estimated time uses industry best practices as a baseline.** When the transcript doesn't specify a time estimate, the agent estimates based on the nature of the task and industry norms. The estimate is always editable during the human review step.
- **Scrum stage defaults to Backlog.** All agent-generated tasks start in Backlog. Account managers can change this during review if needed.
