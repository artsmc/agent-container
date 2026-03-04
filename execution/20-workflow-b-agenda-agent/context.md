# Feature 20: Workflow B — Agenda Agent

## Summary
Build the Mastra agent for Workflow B (Pre-Call to Build Agenda). The agent receives reconciled task data (merged Postgres metadata and Asana live status from feature 13) and generates a Running Notes document. It groups and summarizes tasks by theme/project, then produces sections for Completed Tasks, Incomplete Tasks, Relevant Deliverables, Recommendations, New Ideas, and Next Steps. The agent calls the API to save the draft agenda.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 18 (Mastra Runtime Setup — agent runs on this runtime), 13 (Status Reconciliation — provides the reconciled task data with Asana live status), 14 (Agenda Endpoints — agent calls POST /clients/{id}/agendas to save draft agendas)
- **Blocks**: None directly (this is invoked by feature 17 — Workflow Orchestration)

## Source PRDs
- mastra-prd.md (Workflow B: Pre-Call to Build Agenda, Guardrails)
- api-prd.md (Agenda creation endpoint)
- asana-call-agenda.md (Running Notes format and section structure)

## Relevant PRD Extracts

### Workflow B: Pre-Call — Build Agenda (mastra-prd.md)

> **Trigger:** Manual or scheduled (before the next client follow-up call)
>
> **Prerequisite:** Completed tasks must exist in Asana for the client since the last cycle. If no completed tasks are found, the system should warn the user rather than generate an empty agenda.
>
> **Input:** Completed Asana tasks for the respective client.
>
> **Process:**
> 1. Pull completed tasks from Asana, filtered by client.
> 2. Group and summarize tasks by **theme/project** (not a raw data dump).
> 3. Compile into the Running Notes format:
>    - Completed Tasks
>    - Incomplete Tasks
>    - Relevant Deliverables
>    - Recommendations
>    - New Ideas
>    - Next Steps
> 4. Output to Google Docs via API.
>
> **Output:** Running Notes document ready for the client follow-up call.

### Guardrails (mastra-prd.md)

> - **Intake vs. Follow-up disambiguation:** Workflow B validates that completed tasks exist before generating output. If none exist, it surfaces a warning instead of producing an empty document.
> - **Data scoping:** All queries are scoped to a specific client. No cross-client data leakage.
> - **Prompt structure:** Task descriptions use a defined template to ensure consistency regardless of which account manager triggers the workflow.

### Running Notes Format (asana-call-agenda.md)

> This note document is meant to provide a client-facing status update that explains:
>
> - Completed Tasks
> - Incomplete Tasks
> - Relevant Deliverables
> - Recommendations
> - New Ideas
> - "Next Steps"

### Automation Request (asana-call-agenda.md)

> 1. The completed tasks from Asana, for the respective client, are compiled in a summary-like way (not a data dump of raw tasks completed).
> 2. These summaries should be based around "themes" (most likely, the project that the task is related to).
> 3. Build a system that allows for these summaries to be "normalized" into a Google Doc (or, via API).

### Agenda Creation Endpoint (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/agendas` | POST | Create a draft agenda (called by Mastra after summarization). Short ID auto-assigned. |

### Agendas Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `content` | TEXT | The agenda/Running Notes content (markdown or rich text) |
| `cycle_start` | DATE | Start of the task cycle this agenda covers |
| `cycle_end` | DATE | End of the task cycle |
| `status` | ENUM | Created as `draft` |

## Scope

### In Scope
- Mastra agent definition for Workflow B (agenda/Running Notes generation)
- Accept reconciled task data as input — this is the merged dataset from feature 13 containing internal metadata (short_id, title, description, estimated_time, scrum_stage, assignee) combined with Asana live status (completed, completed_at, in-progress)
- Classify tasks as completed or incomplete based on Asana live status
- Group and summarize tasks by theme/project (not a raw data dump of individual tasks)
- LLM prompt design to generate the Running Notes document with all six sections:
  - **Completed Tasks** — summarized by theme/project, based on tasks marked completed in Asana
  - **Incomplete Tasks** — tasks that are still in-progress or not started
  - **Relevant Deliverables** — deliverables associated with completed work
  - **Recommendations** — agent-generated recommendations based on task patterns and context
  - **New Ideas** — suggestions that emerged from the task context
  - **Next Steps** — forward-looking action items for the upcoming cycle
- Call API to save the draft agenda via POST /clients/{id}/agendas (using api-client package with Mastra's service token)
- Include cycle date range (cycle_start, cycle_end) in the saved agenda
- Handle edge case: warn if no completed tasks exist (per guardrails — do not generate an empty agenda)
- Return created agenda reference (short ID) to the workflow orchestration layer

### Out of Scope
- Status reconciliation with Asana (that is feature 13 — this agent receives already-reconciled data)
- Agenda lifecycle management, finalization, sharing, emailing (that is feature 14)
- Google Docs export (that is feature 15 — triggered separately after agenda review)
- Asana API calls (the agent works with pre-fetched reconciled data)
- Workflow triggering and orchestration (that is feature 17)
- Mastra runtime setup (that is feature 18)

## Key Decisions
- **Uses reconciled data from feature 13 (status reconciliation).** The agent does not call Asana directly. It receives a pre-merged dataset where each task has both Postgres metadata and Asana's live status. The workflow orchestration layer (feature 17) triggers reconciliation before invoking this agent.
- **Depends on feature 13 for complete/incomplete task classification.** The Asana `completed` field from the reconciled data is the authoritative source for whether a task is done. Postgres `status = pushed` alone is not sufficient — the task may have been pushed but not yet completed in Asana.
- **Summaries are theme-based, not a data dump.** The LLM groups related tasks by project/theme and writes human-readable summaries. This is explicitly called out in asana-call-agenda.md: "compiled in a summary-like way (not a data dump of raw tasks completed)" and "based around themes (most likely, the project that the task is related to)."
- **The agent generates all six Running Notes sections.** Completed Tasks and Incomplete Tasks are data-driven (from reconciled task data). Recommendations, New Ideas, and Next Steps are agent-generated based on context and patterns. Relevant Deliverables bridges both — it references completed work and its outputs.
- **Draft output requires human review.** The agent saves the agenda as `status = draft`. It must go through human review (edit, finalize) before it can be shared or emailed. This prevents accidental distribution of raw agent output.
