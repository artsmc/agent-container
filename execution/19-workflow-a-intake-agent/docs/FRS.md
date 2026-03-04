# Functional Requirement Specification
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

This document specifies the functional requirements for the Mastra intake agent (`intakeAgent`) that implements Workflow A: Post-Intake to Build Tickets. The agent lives at `apps/mastra/src/agents/intake-agent.ts` and replaces the placeholder installed by Feature 18. It accepts a `NormalizedTranscript` payload, uses an LLM to extract action items and produce structured tasks, and persists draft tasks via the API layer.

---

## 2. Agent Definition

### FR-01: Agent Identity

The agent must be defined and exported using the Mastra `Agent` class:

```typescript
export const intakeAgent = new Agent({
  id: 'intake-agent',
  name: 'Intake Agent',
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: env.LLM_MODEL,
  tools: { saveTasksTool, getTranscriptTool },
});
```

This replaces the placeholder defined in Feature 18 (FR-60 of feature-18/FRS.md). The `id` and `name` must remain identical to the placeholder so `mastra.getAgent('intake-agent')` continues to resolve correctly.

### FR-02: Agent Registration

The agent must be exported from `src/agents/index.ts` as `intakeAgent`, replacing the placeholder export. The Mastra instance in `src/index.ts` must register this agent.

---

## 3. System Instructions (Prompt)

### FR-10: Instructions Constant

The instructions must be defined as a TypeScript constant `INTAKE_AGENT_INSTRUCTIONS` in the agent file (or an imported `prompts/` module). The constant must not be inline-defined inside the Agent constructor to allow independent testing and review.

### FR-11: Instructions Content Requirements

The system instructions must direct the LLM to:

1. **Role framing:** Act as an experienced iExcel project manager reviewing an internal intake call transcript to identify tasks that the iExcel team must execute for the client.

2. **Extraction scope:** Extract only action items assigned to iExcel team members. Do not extract items the client themselves will action, items that are informational only, or items that are already marked as completed in the transcript.

3. **Description format — mandatory structure:** Every task description must follow the three-section template exactly:
   - **TASK CONTEXT** — Conversational prose explaining the reason for the task. Must include transcript quotes (with call date) where relevant. Written as if the reader has no transcript context.
   - **ADDITIONAL CONTEXT** — Any related, external, or historical factors that affect the task. May be brief if not applicable, but must not be empty.
   - **REQUIREMENTS** — Specific tools, steps, and acceptance criteria needed to execute the task. Must be actionable and specific.

4. **Title format:** Task titles must be concise, actionable verb phrases (e.g., "Update client proposal template with Q2 pricing" not "Proposal").

5. **Assignee extraction:** Extract the assignee from the transcript where explicitly named. If the transcript refers to a person ambiguously (e.g., "someone on the team"), set assignee to null. Never invent assignees.

6. **Estimated time:** Provide an estimate in ISO 8601 duration format (e.g., `PT1H30M`). Use transcript-stated estimates if present; otherwise apply industry-standard estimates for the task type. Always provide an estimate — never omit.

7. **Scrum stage:** Always set `scrumStage` to `"Backlog"`.

8. **Output format:** Return a JSON array of task objects conforming to the `CreateTaskRequest` interface. Do not return prose, markdown, or commentary outside the JSON block.

9. **No-task case:** If no action items are found, return an empty array `[]` and include a brief human-readable explanation as a separate `explanation` field in the response envelope.

10. **Data scoping guardrail:** The instructions must explicitly state that the agent must not reference or infer information about any client other than the one identified in the provided context.

### FR-12: Instructions Versioning

The instructions constant must include a version comment at the top:
```typescript
// Intake Agent Instructions v1.0 — Feature 19
// Update this version string when prompt content changes to enable tracing in observability tooling.
```

---

## 4. Input Contract

### FR-20: Workflow Invocation Payload

The agent is invoked by the API layer (via Mastra's agent trigger mechanism) with the following context object. This payload is assembled by Feature 17 (Workflow Orchestration) and passed to the agent:

```typescript
interface IntakeAgentInput {
  workflowRunId: string;       // UUID of the workflow_run record
  clientId: string;            // UUID of the client
  transcriptId: string;        // UUID of the transcript record
  callbackBaseUrl: string;     // Base URL for API callbacks (e.g., 'https://api.iexcel.com')
}
```

### FR-21: Transcript Retrieval

Upon receiving the invocation payload, the agent must retrieve the full `NormalizedTranscript` using the `getTranscriptTool`:

```typescript
const transcript = await getTranscriptTool.execute({ transcriptId });
// Returns NormalizedTranscript from GET /transcripts/{id}
```

The agent must not assume the transcript is already in memory — it must fetch it via the tool to ensure the api-client's authorization headers are applied.

### FR-22: Input Validation

Before invoking the LLM:
1. Verify `transcript.clientId === clientId`. If they do not match, update the workflow run to `failed` with error code `CLIENT_MISMATCH` and return. Do not proceed.
2. Verify `transcript.meetingType === MeetingType.Intake`. Log a warning if the meeting type is not `intake` but still proceed — the orchestration layer (Feature 17) is responsible for type validation, but the agent should flag this in observability.
3. Verify `transcript.segments.length > 0` OR `transcript.summary !== null`. If both are empty, the transcript has no processable content. Update the workflow run to `failed` with error code `EMPTY_TRANSCRIPT` and return.

---

## 5. LLM Processing

### FR-30: Prompt Assembly

The agent must assemble the LLM prompt by combining:
1. The system instructions (`INTAKE_AGENT_INSTRUCTIONS`).
2. A user message constructed from the `NormalizedTranscript`:
   - Meeting date (formatted as human-readable string, e.g., `"February 15, 2026"`)
   - Participants list (comma-separated)
   - Duration (formatted as `"Xh Ym"`)
   - Summary (if present)
   - Highlights (if present, as a bulleted list)
   - Full transcript segments formatted as `[HH:MM:SS] SpeakerName: text`

### FR-31: LLM Output Schema

The LLM must be prompted to return a structured JSON response. The agent must use Mastra's structured output feature (or a Zod schema) to enforce the response shape:

```typescript
const outputSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(255),
    description: z.object({
      taskContext: z.string().min(1),
      additionalContext: z.string().min(1),
      requirements: z.string().min(1),
    }),
    assignee: z.string().nullable(),
    estimatedTime: z.string().regex(/^PT(\d+H)?(\d+M)?$/).nullable(),
    scrumStage: z.literal('Backlog'),
    tags: z.array(z.string()).default([]),
  })),
  explanation: z.string().optional(), // Present when tasks array is empty
});
```

### FR-32: LLM Retry on Schema Violation

If the LLM returns output that fails schema validation:
1. Log a `warn`-level entry with the validation error and raw LLM output (truncated to 500 chars).
2. Retry the LLM call up to 2 additional times (3 total attempts) with a clarifying instruction appended: "Your previous response did not conform to the required JSON schema. Please return only the JSON object as specified."
3. If all 3 attempts fail schema validation, update the workflow run to `failed` with error code `LLM_OUTPUT_INVALID` and return.

---

## 6. Task Persistence

### FR-40: Workflow Status Update to Running

Before making any API calls to save tasks, the agent must update the workflow run status to `running` by calling `PATCH /workflows/{workflowRunId}/status` with `{ status: 'running' }`. This uses the service token (not a user token).

### FR-41: Task Batch Creation

For each task in the validated LLM output array, the agent must call the `saveTasksTool` to persist the task:

```typescript
interface CreateTaskPayload {
  clientId: string;        // from IntakeAgentInput
  transcriptId: string;    // from IntakeAgentInput
  title: string;
  description: TaskDescription;
  assignee: string | null;
  estimatedTime: string | null;
  scrumStage: string;      // always 'Backlog'
  tags: string[];
  priority: TaskPriority;  // default: TaskPriority.Medium
}
```

Tasks are saved via the batch endpoint `POST /tasks` (Feature 11), which accepts an array of `CreateTaskPayload` objects. The agent sends all extracted tasks in a single batch request. The batch endpoint returns per-task results, so partial success is possible (some tasks saved even if others fail). See Feature 11's FRS for the batch endpoint contract.

### FR-42: Task Creation Error Handling

If saving a task fails:
1. Log a `warn`-level entry with the task title, the error code, and the HTTP status from the API response.
2. Continue processing the remaining tasks — do not abort the entire run.
3. Track which tasks succeeded and which failed.

### FR-43: Empty Task List Handling

If the LLM returns an empty `tasks` array:
1. Do NOT call `POST /clients/{clientId}/tasks`.
2. Update workflow run status to `completed` with result `{ task_short_ids: [], explanation: <agent explanation> }`.
3. Log an `info`-level entry noting that no action items were found.

### FR-44: Workflow Completion Callback

After processing all tasks (or handling the empty case), the agent must update the workflow run:

**On success (one or more tasks created):**
```typescript
PATCH /workflows/{workflowRunId}/status
{
  status: 'completed',
  result: {
    task_short_ids: ['TSK-0001', 'TSK-0002'],  // short IDs from API responses
    tasks_attempted: 3,
    tasks_created: 2,
    tasks_failed: 1
  }
}
```

**On partial failure (some tasks failed to save):**
Same as success — status is `completed` with the partial result. The caller can inspect `tasks_failed` count.

**On total failure (no tasks could be saved, and LLM did not return empty):**
```typescript
PATCH /workflows/{workflowRunId}/status
{
  status: 'failed',
  error: {
    code: 'TASK_CREATION_FAILED',
    message: 'All task creation requests failed. Check API and database connectivity.'
  }
}
```

---

## 7. Tool Definitions

### FR-50: saveTasksTool

Must be defined in `src/tools/task-tools.ts`, replacing the placeholder from Feature 18:

```typescript
const saveTasksTool = createTool({
  id: 'saveTasksTool',
  description: 'Save a single draft task for a client via the API. Call this once per task extracted from the transcript.',
  inputSchema: z.object({
    clientId: z.string().uuid(),
    transcriptId: z.string().uuid(),
    title: z.string(),
    description: z.object({
      taskContext: z.string(),
      additionalContext: z.string(),
      requirements: z.string(),
    }),
    assignee: z.string().nullable(),
    estimatedTime: z.string().nullable(),
    scrumStage: z.string().default('Backlog'),
    tags: z.array(z.string()).default([]),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  }),
  outputSchema: z.object({
    shortId: z.string(),
    id: z.string().uuid(),
    status: z.literal('draft'),
  }),
  execute: async ({ context }) => {
    const response = await apiClient.tasks.createDraftTask(context.clientId, context);
    return { shortId: response.shortId, id: response.id, status: response.status };
  },
});
```

### FR-51: getTranscriptTool

Must be defined in `src/tools/transcript-tools.ts`, replacing the placeholder from Feature 18:

```typescript
const getTranscriptTool = createTool({
  id: 'getTranscriptTool',
  description: 'Retrieve a normalized transcript by its ID.',
  inputSchema: z.object({
    transcriptId: z.string().uuid(),
  }),
  outputSchema: z.object({
    // Full NormalizedTranscript shape
    source: z.string(),
    sourceId: z.string(),
    meetingDate: z.string(),
    clientId: z.string(),
    meetingType: z.string(),
    participants: z.array(z.string()),
    durationSeconds: z.number(),
    segments: z.array(z.object({
      speaker: z.string(),
      timestamp: z.number(),
      text: z.string(),
    })),
    summary: z.string().nullable(),
    highlights: z.array(z.string()).nullable(),
  }),
  execute: async ({ context }) => {
    return await apiClient.transcripts.getTranscript(context.transcriptId);
  },
});
```

### FR-52: updateWorkflowStatusTool (Shared — Feature 18)

This tool is the shared `updateWorkflowStatusTool` defined in `src/tools/workflow-tools.ts` as part of the Feature 18 tool infrastructure. Feature 19 imports it — it does not define its own copy. The tool signature is:

```typescript
import { updateWorkflowStatusTool } from '../tools/workflow-tools';
```

The tool accepts `workflowRunId`, `status` (`'running' | 'completed' | 'failed'`), optional `result` (record), and optional `error` (`{ code, message }`). See Feature 18's tool placeholder definitions for the full schema. Both Feature 19 and Feature 20 share this single tool instance.

---

## 8. Data Shapes

### FR-60: Task Description Format Reference

The `TaskDescription` interface (from `@iexcel/shared-types`) is the authoritative type. The agent's LLM output maps to it as follows:

```typescript
interface TaskDescription {
  taskContext: string;       // TASK CONTEXT section from the prompt template
  additionalContext: string; // ADDITIONAL CONTEXT section
  requirements: string;      // REQUIREMENTS section
}
```

All three fields are required. The API layer rejects tasks with any field missing or empty.

### FR-61: EstimatedTime Format

The `estimatedTime` field must be an ISO 8601 duration string. Conversion from the LLM's `hh:mm` output:

| LLM Output | ISO 8601 Duration |
|---|---|
| `02:30` | `PT2H30M` |
| `00:45` | `PT45M` |
| `01:00` | `PT1H` |
| `04:00` | `PT4H` |

The agent must include a conversion step between LLM output parsing and API submission.

### FR-62: Scrum Stage Default

The `scrumStage` field must always be set to the string `"Backlog"` for all agent-generated tasks. This is enforced both in the prompt instructions and in the tool's Zod schema default.

---

## 9. Observability

### FR-70: Structured Log Events

The agent must emit structured log events at the following points:

| Event | Level | Fields |
|---|---|---|
| Agent invoked | `info` | `workflowRunId`, `clientId`, `transcriptId` |
| Transcript retrieved | `debug` | `workflowRunId`, `transcriptId`, `segmentCount`, `durationSeconds` |
| LLM called | `debug` | `workflowRunId`, `attempt` |
| LLM output received | `debug` | `workflowRunId`, `tasksExtracted`, `attempt` |
| LLM retry triggered | `warn` | `workflowRunId`, `attempt`, `validationError` |
| Task creation started | `debug` | `workflowRunId`, `taskCount` |
| Task saved | `debug` | `workflowRunId`, `shortId`, `title` (truncated to 60 chars) |
| Task save failed | `warn` | `workflowRunId`, `taskTitle`, `error` |
| Agent completed | `info` | `workflowRunId`, `tasksCreated`, `tasksFailed`, `durationMs` |
| Agent failed | `error` | `workflowRunId`, `errorCode`, `errorMessage`, `durationMs` |

Task description content (full text) must NOT be logged. No LLM prompts must be logged at `info` or above.

### FR-71: OpenTelemetry Trace Span

The agent invocation must produce a trace span named `intake-agent.run` with the following attributes:
- `workflow.run_id`
- `workflow.client_id`
- `workflow.transcript_id`
- `agent.tasks_created`
- `agent.tasks_failed`

---

## 10. Error Handling Summary

| Error Condition | Behavior | Workflow Run Status |
|---|---|---|
| Transcript not retrievable (API 404) | Log error, abort | `failed` (TRANSCRIPT_RETRIEVAL_FAILED) |
| clientId mismatch in transcript | Log error, abort | `failed` (CLIENT_MISMATCH) |
| Empty transcript (no segments, no summary) | Log warning, abort | `failed` (EMPTY_TRANSCRIPT) |
| LLM returns invalid schema (3 retries exhausted) | Log error, abort | `failed` (LLM_OUTPUT_INVALID) |
| All task saves failed | Log error, abort | `failed` (TASK_CREATION_FAILED) |
| Some task saves failed | Log warnings, continue | `completed` (partial result) |
| No tasks found in transcript | Log info, no tasks saved | `completed` (empty result with explanation) |
| Workflow status update fails | Log error, continue (non-blocking) | Status may be stale — observable via timeout |

---

## 11. Security

### FR-80: Service Token Usage

The agent always uses the Mastra service token (obtained via `ServiceTokenManager` from Feature 18) for all API calls. It never uses a user's personal token unless invoked via MCP (which is not a supported invocation path for Workflow A in V1).

### FR-81: No Credential Logging

The API base URL and auth tokens must never appear in log output. The `env` module (Feature 18) controls this — the agent must not log `env.*` values.

### FR-82: Client Isolation

The agent must only create tasks for the `clientId` received in the invocation payload. Cross-client operations are not supported and must not be attempted.
