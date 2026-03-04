# Feature 17: Workflow Orchestration

## Summary
Implement workflow trigger endpoints and orchestration logic within the API layer. POST /workflows/intake triggers Workflow A (transcript to tasks), POST /workflows/agenda triggers Workflow B (reconciled tasks to agenda), and GET /workflows/{id}/status returns workflow run status. The API creates workflow run records, invokes Mastra agents asynchronously, and handles status tracking through completion.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 07 (API Scaffolding — routing, middleware, auth validation), 04 (Product Database Schema — workflow run records need a table or use audit log), 10 (Transcript Endpoints — Workflow A requires transcript data), 11 (Task Endpoints — Mastra calls back to save draft tasks), 14 (Agenda Endpoints — Mastra calls back to save draft agendas)
- **Blocks**: 19 (Workflow A Intake Agent — Mastra agent invoked by this orchestration), 20 (Workflow B Agenda Agent — Mastra agent invoked by this orchestration), 30 (UI Workflow Trigger)

## Source PRDs
- api-prd.md (Workflow endpoints, Workflow execution flow)
- mastra-prd.md (Workflows section, How Mastra Interacts with the System)

## Relevant PRD Extracts

### Workflow Endpoints (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/workflows/intake` | POST | Trigger Workflow A: submit transcript, invoke Mastra agent, return draft tasks |
| `/workflows/agenda` | POST | Trigger Workflow B: pull completed tasks, invoke Mastra agent, return draft agenda |
| `/workflows/{id}/status` | GET | Check status of a running workflow |

### Workflow Execution Flow (api-prd.md)

> 1. Consumer calls `/workflows/intake` with `client_id` and `transcript_id`.
> 2. API validates the request, persists a workflow run record.
> 3. API invokes the Mastra agent (async).
> 4. Mastra agent processes the transcript and calls back to `/clients/{id}/tasks` (POST) to save draft tasks.
> 5. Consumer polls `/workflows/{id}/status` or receives a webhook/event when complete.

### How Mastra Interacts with the System (mastra-prd.md)

> Mastra agents are invoked by the API layer when a workflow is triggered. The agent does its LLM work (parsing, summarizing) and writes results back to the API:
>
> ```
> Consumer triggers workflow -> API layer -> invokes Mastra agent
> Mastra agent processes transcript -> calls API to save draft tasks
> Mastra agent builds agenda -> calls API to save draft agenda
> ```

### Workflow A: Post-Intake (mastra-prd.md)

> **Trigger:** Manual (account manager initiates after intake call)
> **Input:** Grain call transcript (intake call)

### Workflow B: Pre-Call (mastra-prd.md)

> **Trigger:** Manual or scheduled (before the next client follow-up call)
> **Prerequisite:** Completed tasks must exist in Asana for the client since the last cycle. If no completed tasks are found, the system should warn the user rather than generate an empty agenda.

### Service-to-Service Auth (api-prd.md)

> - Mastra authenticates using the OIDC client credentials flow with its own `client_id` and `client_secret` registered in the auth service.
> - The API validates Mastra's access token the same way it validates user tokens.

## Scope

### In Scope
- POST /workflows/intake — validate request (client_id, transcript_id), create workflow run record, invoke Mastra Workflow A agent asynchronously, return workflow run ID
- POST /workflows/agenda — validate request (client_id), trigger status reconciliation (feature 13) to get merged task data, create workflow run record, invoke Mastra Workflow B agent asynchronously, return workflow run ID
- GET /workflows/{id}/status — return current status of a workflow run (pending, running, completed, failed) with timestamps and result references (e.g., list of created task short IDs or agenda short ID)
- Workflow run record persistence (workflow type, client_id, status, started_at, completed_at, result metadata)
- Asynchronous invocation of Mastra agents — the API does not block waiting for LLM processing
- Status updates — mechanism for Mastra to update workflow run status (callback or polling-based)
- Error handling — capture and surface Mastra failures, timeout handling
- Authorization checks — ensure the triggering user has permission for the specified client
- Audit log entries for workflow triggers and completions

### Out of Scope
- The Mastra agent logic itself (that is features 19 and 20)
- The Mastra runtime setup (that is feature 18)
- Status reconciliation logic (that is feature 13 — but this feature invokes it as part of Workflow B)
- WebSocket real-time updates (open question in api-prd.md)
- Scheduled/cron-based workflow triggers (V1 is manual only)

## Key Decisions
- Workflow execution is asynchronous. The API returns a workflow run ID immediately and the consumer polls `/workflows/{id}/status` for completion. This prevents HTTP timeouts during LLM processing.
- The API layer owns the workflow run lifecycle. It creates the run record, invokes Mastra, and tracks status. Mastra is a worker that processes and calls back.
- For Workflow B, the API triggers status reconciliation (feature 13) before invoking Mastra, so the agent receives already-reconciled data (Postgres metadata + Asana live status merged).
- Mastra authenticates back to the API using OIDC client credentials flow. When saving draft tasks or agendas, Mastra's API calls go through the same auth/authz pipeline as any other consumer.
- Workflow B validates that completed tasks exist before invoking Mastra. If none are found, it returns a warning rather than creating an empty workflow run.
