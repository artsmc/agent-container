# Functional Requirement Specification
# Feature 20: Workflow B — Agenda Agent

**Feature Name:** workflow-b-agenda-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for the Mastra agenda agent (`agendaAgent`) that implements Workflow B: Pre-Call to Build Agenda. The agent lives at `apps/mastra/src/agents/agenda-agent.ts` and replaces the placeholder installed by Feature 18. It accepts a set of reconciled task data (sourced from the Postgres cache where Asana status is persisted by Feature 13), uses an LLM to generate a six-section Running Notes document in ProseMirror JSON format, and persists a draft agenda via the API layer.

---

## 2. Agent Definition

### FR-01: Agent Identity

The agent must be defined and exported using the Mastra `Agent` class:

```typescript
export const agendaAgent = new Agent({
  id: 'agenda-agent',
  name: 'Agenda Agent',
  instructions: AGENDA_AGENT_INSTRUCTIONS,
  model: env.LLM_MODEL,
  tools: {
    getReconciledTasksTool,
    saveDraftAgendaTool,
    updateWorkflowStatusTool,
  },
});
```

This replaces the placeholder defined in Feature 18 (FR-61 of feature-18/FRS.md). The `id` and `name` must remain identical to the placeholder so `mastra.getAgent('agenda-agent')` continues to resolve correctly.

### FR-02: Agent Registration

The agent must be exported from `src/agents/index.ts` as `agendaAgent`, replacing the placeholder export. The Mastra instance in `src/index.ts` must register this agent.

---

## 3. System Instructions (Prompt)

### FR-10: Instructions Constant

The instructions must be defined as a TypeScript constant `AGENDA_AGENT_INSTRUCTIONS` in `src/prompts/agenda-instructions.ts`. It must not be inline-defined inside the Agent constructor.

### FR-11: Instructions Content Requirements

The system instructions must direct the LLM to:

1. **Role framing:** Act as an experienced iExcel project manager preparing a client-facing Running Notes document ahead of a follow-up call.

2. **Document purpose:** The Running Notes is a client-facing status update that communicates what has been accomplished, what remains outstanding, and what the agenda is for the upcoming call. The tone must be professional and conversational — not a data dump of raw task titles.

3. **Input data:** The LLM receives two data sets:
   - `completedTasks` — array of `ReconciledTask` objects where `asanaStatus === 'completed'`
   - `incompleteTasks` — array of `ReconciledTask` objects where `asanaStatus !== 'completed'`

4. **Completed Tasks section:** Group tasks by theme or project (inferred from task titles and descriptions). For each theme group, write 2–4 sentences of human-readable prose summarizing what was accomplished. Do NOT list task titles as bullet points.

5. **Incomplete Tasks section:** List tasks that are still in progress or not started, with brief context on what they represent and why they may still be pending. Group by theme where applicable.

6. **Relevant Deliverables section:** Identify tangible outputs, artifacts, or deliverables that resulted from the completed work (e.g., "The Q2 campaign brief is now complete and ready for client review"). Bridge the completed tasks to their real-world outputs.

7. **Recommendations section:** Based on the completed work, patterns observed, and what remains incomplete, offer 2–4 specific, actionable recommendations for the client or for the upcoming cycle.

8. **New Ideas section:** Identify 1–3 ideas or opportunities that emerged from the work this cycle. These should be forward-looking, creative, and grounded in the task context — not generic suggestions.

9. **Next Steps section:** Define 3–5 clear next-step action items for the upcoming cycle. These can be continuations of incomplete work or new items suggested by the completed work context.

10. **Output format:** Return a single JSON object with a `content` field containing the full Running Notes document as a ProseMirror JSON structure (compatible with the TipTap editor used in the UI). Do not return markdown or plain text — return a ProseMirror document node. The agent must convert its internal markdown draft to ProseMirror JSON before returning.

11. **No-completed-tasks guard:** If the `completedTasks` array is empty, return a JSON object with `{ error: 'NO_COMPLETED_TASKS', message: 'No completed tasks were found. Cannot generate agenda.' }` instead of a content field.

12. **Data scoping guardrail:** The instructions must explicitly state that the agent must not reference or infer information about any client other than the one identified in the provided context.

### FR-12: Instructions Versioning

```typescript
// Agenda Agent Instructions v1.0 — Feature 20
// Update this version string when prompt content changes.
```

### FR-13: ProseMirror JSON Format for Content

The Running Notes document must be output as a ProseMirror JSON document structure (compatible with TipTap). The document must contain the following sections as heading nodes and content nodes:

1. **H1 heading:** `Running Notes — [Client Name] — [Cycle Date Range]`
2. **H2 heading:** `Completed Tasks` — followed by paragraph nodes with theme-grouped prose summaries
3. **H2 heading:** `Incomplete Tasks` — followed by paragraph nodes with context-aware content
4. **H2 heading:** `Relevant Deliverables` — followed by bullet list or paragraph nodes
5. **H2 heading:** `Recommendations` — followed by numbered list or paragraph nodes (2-4 items)
6. **H2 heading:** `New Ideas` — followed by numbered list or paragraph nodes (1-3 items)
7. **H2 heading:** `Next Steps` — followed by numbered list or paragraph nodes (3-5 items)

The client name and cycle date range are injected into the prompt header by the agent's prompt assembly logic (not by the LLM).

The agent internally generates the content as markdown via the LLM, then converts it to ProseMirror JSON using a markdown-to-ProseMirror conversion utility before saving.

---

## 4. Input Contract

### FR-20: Workflow Invocation Payload

The agent is invoked by the API layer (via Mastra's agent trigger mechanism) with the following context object assembled by Feature 17:

```typescript
interface AgendaAgentInput {
  workflowRunId: string;    // UUID of the workflow_run record
  clientId: string;         // UUID of the client
  cycleStart: string;       // ISO 8601 date (e.g., '2026-02-01')
  cycleEnd: string;         // ISO 8601 date (e.g., '2026-02-28')
  callbackBaseUrl: string;  // Base URL for API callbacks
}
```

### FR-21: Reconciled Task Retrieval

The agent must retrieve reconciled tasks by calling `GET /clients/{clientId}/tasks` with a filter for `status = 'pushed'` and the cycle date range. The API returns tasks with their cached Asana reconciliation status fields.

**Data source — Postgres cache:** Feature 13 writes reconciled Asana status data to denormalized columns on the tasks table in Postgres (e.g., `asana_status`, `asana_completed_at`). Feature 17 triggers Feature 13's reconciliation before invoking this agent, ensuring the cached data is fresh. The `GET /clients/{clientId}/tasks` endpoint serves these cached values directly — no live Asana call is made at query time.

The agent uses `getReconciledTasksTool` for this fetch:

```typescript
const tasks = await getReconciledTasksTool.execute({
  clientId,
  cycleStart,
  cycleEnd,
});
// Returns: ReconciledTask[]
```

### FR-22: Task Classification

After retrieving reconciled tasks, the agent must classify them:

```typescript
const completedTasks = tasks.filter(t => t.asanaStatus === 'completed');
const incompleteTasks = tasks.filter(t => t.asanaStatus !== 'completed');
// 'incomplete' and 'not_found' statuses both go into incompleteTasks
```

### FR-23: Empty Completed Tasks Guard

Before invoking the LLM, the agent must verify that `completedTasks.length > 0`. If it is empty:
1. Log a `warn`-level entry: `workflowRunId`, `clientId`, `pushedTaskCount`, reason.
2. Update the workflow run to `failed` with error code `NO_COMPLETED_TASKS` and message `"No completed tasks found for this client in the specified cycle window. Cannot generate agenda."`.
3. Return without calling the LLM or saving an agenda.

This is a defensive guard. The primary enforcement is in Feature 17's precondition check (Section 3.3 of feature-17/FRS.md). The agent's guard handles edge cases where completed status changes between Feature 17's check and agent execution.

---

## 5. LLM Processing

### FR-30: Prompt Assembly

The agent assembles the LLM prompt by combining:
1. The system instructions (`AGENDA_AGENT_INSTRUCTIONS`).
2. A user message constructed from the input data:
   - Client ID (and client name if available from a `getClientTool` lookup — optional enhancement)
   - Cycle date range: `"Cycle: February 1, 2026 – February 28, 2026"`
   - Completed tasks formatted as:
     ```
     COMPLETED TASKS (N total):
     - [TSK-0042] Update proposal with Q2 pricing (Assignee: Mark, Est: 2h)
       Description: [taskContext only — not full description]
     ...
     ```
   - Incomplete tasks formatted similarly.

Task descriptions must be truncated to `taskContext` only (the first section) to keep the prompt concise. Full descriptions including Requirements are not needed for agenda generation.

### FR-31: LLM Output Schema

The LLM produces markdown internally. The agent then converts the markdown to ProseMirror JSON before saving:

```typescript
// LLM output schema (internal — markdown from LLM)
const llmOutputSchema = z.union([
  z.object({
    content: z.string().min(100), // Markdown Running Notes from LLM
  }),
  z.object({
    error: z.literal('NO_COMPLETED_TASKS'),
    message: z.string(),
  }),
]);

// After LLM output is validated, convert to ProseMirror JSON:
// const proseMirrorDoc = markdownToProseMirror(llmOutput.content);
// The saved agenda content is the ProseMirror JSON structure.
```

### FR-32: LLM Retry on Schema Violation

Same retry logic as Feature 19:
1. Log `warn` on each failure with validation error.
2. Retry up to 3 total attempts with clarifying instruction.
3. After 3 failures, update workflow run to `failed` with `LLM_OUTPUT_INVALID`.

### FR-33: Content Validation

After receiving a valid LLM response (markdown), the agent must verify the content field before converting to ProseMirror JSON:
- Minimum length: 100 characters (catches degenerate responses).
- Must contain all six section headers in markdown form: `## Completed Tasks`, `## Incomplete Tasks`, `## Relevant Deliverables`, `## Recommendations`, `## New Ideas`, `## Next Steps`.
- If any section header is missing, treat as a schema violation and retry (counting toward the 3 retry limit).
- After validation passes, convert the markdown to ProseMirror JSON. If the conversion fails, treat as a schema violation and retry.

---

## 6. Agenda Persistence

### FR-40: Workflow Status Update to Running

Before making any API call to save the agenda, the agent must update the workflow run status to `running`:
```
PATCH /workflows/{workflowRunId}/status  { status: 'running' }
```

### FR-41: Save Draft Agenda

The agent calls `saveDraftAgendaTool` to persist the agenda:

```typescript
const agenda = await saveDraftAgendaTool.execute({
  clientId,
  content,     // ProseMirror JSON document (converted from LLM markdown output)
  cycleStart,
  cycleEnd,
});
// Returns: { id: string, shortId: AgendaShortId, status: 'draft' }
```

The tool calls `POST /clients/{clientId}/agendas` with:
```typescript
{
  clientId: string;
  content: object;   // ProseMirror JSON document structure
  cycleStart: string; // ISO 8601 date
  cycleEnd: string;   // ISO 8601 date
}
```

### FR-42: Workflow Completion Callback

**On success:**
```typescript
PATCH /workflows/{workflowRunId}/status
{
  status: 'completed',
  result: {
    agenda_short_id: 'AGD-0015',
    tasks_analyzed: 12,
    tasks_completed: 8,
    tasks_incomplete: 4
  }
}
```

**On failure:**
```typescript
PATCH /workflows/{workflowRunId}/status
{
  status: 'failed',
  error: {
    code: 'AGENDA_SAVE_FAILED' | 'LLM_OUTPUT_INVALID' | 'NO_COMPLETED_TASKS' | 'TASK_RETRIEVAL_FAILED',
    message: '<human-readable message>'
  }
}
```

---

## 7. Tool Definitions

### FR-50: getReconciledTasksTool

Defined in `src/tools/task-tools.ts` (alongside or after the Feature 19 tools):

```typescript
const getReconciledTasksTool = createTool({
  id: 'getReconciledTasksTool',
  description: 'Retrieve reconciled tasks for a client within a cycle date range. Returns tasks with live Asana completion status.',
  inputSchema: z.object({
    clientId: z.string().uuid(),
    cycleStart: z.string(),   // ISO 8601 date
    cycleEnd: z.string(),     // ISO 8601 date
  }),
  outputSchema: z.object({
    tasks: z.array(z.object({
      id: z.string(),
      shortId: z.string(),
      title: z.string(),
      description: z.object({
        taskContext: z.string(),
        additionalContext: z.string(),
        requirements: z.string(),
      }),
      assignee: z.string().nullable(),
      estimatedTime: z.string().nullable(),
      scrumStage: z.string(),
      asanaStatus: z.enum(['completed', 'incomplete', 'not_found']),
      asanaCompleted: z.boolean().nullable(),
      asanaCompletedAt: z.string().nullable(),
    })),
  }),
  execute: async ({ context }) => {
    const response = await apiClient.tasks.listTasksForClient(context.clientId, {
      status: 'pushed',
      cycleStart: context.cycleStart,
      cycleEnd: context.cycleEnd,
    });
    return { tasks: response.data };
  },
});
```

### FR-51: saveDraftAgendaTool

Defined in `src/tools/agenda-tools.ts`, replacing the Feature 18 placeholder:

```typescript
const saveDraftAgendaTool = createTool({
  id: 'saveDraftAgendaTool',
  description: 'Save the generated Running Notes document as a draft agenda for a client.',
  inputSchema: z.object({
    clientId: z.string().uuid(),
    content: z.record(z.unknown()),  // ProseMirror JSON document structure
    cycleStart: z.string(),
    cycleEnd: z.string(),
  }),
  outputSchema: z.object({
    id: z.string().uuid(),
    shortId: z.string(),
    status: z.literal('draft'),
  }),
  execute: async ({ context }) => {
    const response = await apiClient.agendas.createDraftAgenda(context.clientId, {
      content: context.content,
      cycleStart: context.cycleStart,
      cycleEnd: context.cycleEnd,
    });
    return { id: response.id, shortId: response.shortId, status: response.status };
  },
});
```

### FR-52: updateWorkflowStatusTool (Shared — Feature 18)

This is the shared `updateWorkflowStatusTool` defined in `src/tools/workflow-tools.ts` as part of the Feature 18 tool infrastructure. Both Feature 19 and Feature 20 import and use this same tool instance. No additional definition is required.

---

## 8. Data Shapes

### FR-60: ReconciledTask (Input)

The agent's input data corresponds to the `ReconciledTask` type established in Feature 13's FRS.md. Key fields used by the agent:

| Field | Type | Used For |
|---|---|---|
| `shortId` | string | Task reference in prompts |
| `title` | string | Task summary in prompts |
| `description.taskContext` | string | Context for agenda generation (truncated) |
| `assignee` | string / null | Attribution in summaries |
| `estimatedTime` | string / null | Work volume context |
| `scrumStage` | string | Task classification context |
| `asanaStatus` | `'completed' \| 'incomplete' \| 'not_found'` | Primary classification signal |
| `asanaCompletedAt` | string / null | Timing context for deliverables |

Tasks with `asanaStatus = 'not_found'` are classified as incomplete (not completed). They are included in the Incomplete Tasks section.

### FR-61: Agenda Content (Output)

The `content` field saved to the agenda record is a ProseMirror JSON document structure (compatible with TipTap). It must:
- Begin with an H1 heading node: `Running Notes — [Client] — [Cycle]`.
- Contain all six H2-level section heading nodes.
- Be a valid ProseMirror document (type: `'doc'` with valid child nodes).
- Not contain internal system identifiers like UUIDs or `TSK-NNNN` short IDs in the client-visible sections (those are for internal tracking, not client display).

### FR-62: Cycle Date Formatting for Document Header

The agent's prompt assembly logic formats the cycle date range as:
- `cycleStart: '2026-02-01'` → `'February 1, 2026'`
- `cycleEnd: '2026-02-28'` → `'February 28, 2026'`
- Combined: `'February 1 – February 28, 2026'`

---

## 9. Observability

### FR-70: Structured Log Events

| Event | Level | Fields |
|---|---|---|
| Agent invoked | `info` | `workflowRunId`, `clientId`, `cycleStart`, `cycleEnd` |
| Tasks retrieved | `debug` | `workflowRunId`, `clientId`, `totalTasks`, `completedCount`, `incompleteCount` |
| Empty completed tasks guard triggered | `warn` | `workflowRunId`, `clientId`, `pushedTaskCount` |
| LLM called | `debug` | `workflowRunId`, `attempt`, `completedTaskCount`, `incompleteTaskCount` |
| LLM output received | `debug` | `workflowRunId`, `contentLength`, `attempt` |
| Section validation passed | `debug` | `workflowRunId`, `sectionsFound` (array) |
| LLM retry triggered | `warn` | `workflowRunId`, `attempt`, `validationError` |
| Agenda saved | `info` | `workflowRunId`, `agendaShortId` |
| Agent completed | `info` | `workflowRunId`, `agendaShortId`, `tasksAnalyzed`, `durationMs` |
| Agent failed | `error` | `workflowRunId`, `errorCode`, `errorMessage`, `durationMs` |

Agenda content must NOT be logged. Task description text must NOT be logged.

### FR-71: OpenTelemetry Trace Span

Trace span named `agenda-agent.run` with attributes:
- `workflow.run_id`
- `workflow.client_id`
- `workflow.cycle_start`
- `workflow.cycle_end`
- `agent.tasks_analyzed`
- `agent.tasks_completed`
- `agent.tasks_incomplete`
- `agent.agenda_short_id`

---

## 10. Error Handling Summary

| Error Condition | Behavior | Workflow Run Status |
|---|---|---|
| Task retrieval fails (API error) | Log error, abort | `failed` (TASK_RETRIEVAL_FAILED) |
| Zero completed tasks after retrieval | Log warn, abort | `failed` (NO_COMPLETED_TASKS) |
| LLM returns invalid schema (3 retries exhausted) | Log error, abort | `failed` (LLM_OUTPUT_INVALID) |
| LLM returns NO_COMPLETED_TASKS in response | Log warn, abort | `failed` (NO_COMPLETED_TASKS) |
| Agenda content missing required sections (3 retries exhausted) | Log error, abort | `failed` (LLM_OUTPUT_INVALID) |
| Agenda save fails (API error) | Log error, abort | `failed` (AGENDA_SAVE_FAILED) |
| Workflow status update fails | Log error, continue (non-blocking) | Status may be stale — observable via timeout |

---

## 11. Security

### FR-80: Service Token Usage

The agent uses the Mastra service token for all API calls. No user tokens in V1 Workflow B invocations.

### FR-81: No Credential or Content Logging

API tokens and agenda content must never appear in log output.

### FR-82: Client Isolation

The agent fetches tasks scoped to the `clientId` from the invocation payload. It must not attempt to retrieve or reference tasks for any other client.

---

## 12. Relationship to Feature 13 (Status Reconciliation)

Feature 13 reconciles Postgres task metadata with live Asana status and writes the reconciled data back to Postgres as cached denormalized columns (`asana_status`, `asana_completed_at`, etc.) on the tasks table. Feature 17 invokes Feature 13 before triggering this agent, ensuring the cache is fresh. The `GET /clients/{clientId}/tasks` endpoint serves these cached values directly.

**Key constraint:** The agent does not call Feature 13 directly. It trusts that Feature 17 has already triggered reconciliation and that the Postgres cache reflects up-to-date Asana status data.

**Implication for completeness:** Tasks with `asanaStatus = 'not_found'` indicate a data integrity issue (task pushed to Asana but GID not found in the project). These tasks appear in the Incomplete Tasks section of the Running Notes with a note that their Asana status could not be verified.
