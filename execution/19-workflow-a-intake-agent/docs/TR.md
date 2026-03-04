# Technical Requirements
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Technology Stack

### Runtime
- **Mastra** (`mastra`, `@mastra/core`) — agent framework providing the `Agent` class, tool system, and structured output support. Versions established in Feature 18.
- **Node.js** — ESM module system (`"type": "module"` in `apps/mastra/package.json`).
- **TypeScript** — strict mode, as established by workspace `tsconfig.base.json`.

### LLM Provider
- Configured via `LLM_PROVIDER` and `LLM_MODEL` environment variables (Feature 18).
- Supported providers: `openai` (e.g., `gpt-4o`) and `anthropic` (e.g., `claude-opus-4-6`).
- The agent is provider-agnostic at the code level — provider is injected at runtime via the `env` module.

### Schema Validation
- **Zod** — all tool input/output schemas and LLM output schema defined with Zod.

### Logging
- **Pino** — structured JSON logging, via the Mastra PinoLogger configured in Feature 18.

### Observability
- **OpenTelemetry** — trace spans emitted via Mastra's built-in OtelExporter (configured in Feature 18).

### API Communication
- **`@iexcel/api-client`** (Feature 22) — typed HTTP client for all API calls. No raw `fetch` or `axios` calls.
- **`@iexcel/shared-types`** (Feature 01) — all type imports.

---

## 2. File Locations

This feature modifies or creates the following files in the `apps/mastra/` Nx application:

| File | Action | Description |
|---|---|---|
| `src/agents/intake-agent.ts` | Replace placeholder | Full agent implementation |
| `src/agents/index.ts` | No change | Already exports `intakeAgent` |
| `src/tools/task-tools.ts` | Replace placeholder | Full `saveTasksTool` implementation |
| `src/tools/transcript-tools.ts` | Replace placeholder | Full `getTranscriptTool` implementation |
| `src/tools/workflow-tools.ts` | Create new | `updateWorkflowStatusTool` |
| `src/tools/index.ts` | Update | Export `updateWorkflowStatusTool` |
| `src/prompts/intake-instructions.ts` | Create new | `INTAKE_AGENT_INSTRUCTIONS` constant |

No new packages are introduced. No changes to `package.json`, `project.json`, or `tsconfig.json` beyond what Feature 18 established.

---

## 3. Agent Architecture

### Mastra Agent Pattern

```typescript
// apps/mastra/src/agents/intake-agent.ts

import { Agent } from '@mastra/core/agent';
import { INTAKE_AGENT_INSTRUCTIONS } from '../prompts/intake-instructions';
import { env } from '../config/env';
import { saveTasksTool, getTranscriptTool } from '../tools';
import { updateWorkflowStatusTool } from '../tools/workflow-tools';

export const intakeAgent = new Agent({
  id: 'intake-agent',
  name: 'Intake Agent',
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: env.LLM_MODEL,
  tools: {
    saveTasksTool,
    getTranscriptTool,
    updateWorkflowStatusTool,
  },
});
```

### Tool Architecture Principle

Tools are pure functions wrapping api-client calls. The agent does not perform HTTP requests directly — all external communication goes through tools. This ensures:
1. All tool calls are logged and traced by Mastra's runtime.
2. Tool schemas enforce type safety at the LLM boundary.
3. Tools can be independently tested without agent invocation.

---

## 4. LLM Invocation Pattern

### Structured Output

The agent leverages Mastra's `generate()` method with a structured output schema to guarantee parseable responses:

```typescript
const result = await agent.generate(userPrompt, {
  output: outputSchema,  // Zod schema
});
```

If the LLM provider does not natively support structured output (JSON mode), Mastra will enforce schema compliance via post-processing. The agent implementation must handle the retry logic (FR-32) at the application level regardless, as schema compliance is not guaranteed by all providers in all cases.

### Prompt Construction Strategy

The user prompt is constructed by a `buildIntakePrompt(transcript: NormalizedTranscript): string` helper function defined alongside the agent. This separation allows unit testing of prompt construction without an LLM call.

```typescript
function buildIntakePrompt(transcript: NormalizedTranscript): string {
  const segments = transcript.segments
    .map(s => `[${formatTimestamp(s.timestamp)}] ${s.speaker}: ${s.text}`)
    .join('\n');

  return [
    `Meeting Date: ${formatDate(transcript.meetingDate)}`,
    `Participants: ${transcript.participants.join(', ')}`,
    `Duration: ${formatDuration(transcript.durationSeconds)}`,
    transcript.summary ? `Summary:\n${transcript.summary}` : null,
    transcript.highlights?.length
      ? `Highlights:\n${transcript.highlights.map(h => `- ${h}`).join('\n')}`
      : null,
    `\nFull Transcript:\n${segments || '(No segmented transcript available — use summary above)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
```

---

## 5. Data Flow

```
Feature 17 (Workflow Orchestration)
      │
      │  POST to Mastra agent endpoint
      │  { workflowRunId, clientId, transcriptId, callbackBaseUrl }
      │
      ▼
intake-agent.ts
      │
      ├─► getTranscriptTool
      │       │
      │       └─► GET /transcripts/{transcriptId}   (via api-client)
      │               │
      │               └─► NormalizedTranscript returned
      │
      ├─► updateWorkflowStatusTool (status: 'running')
      │       │
      │       └─► PATCH /workflows/{workflowRunId}/status
      │
      ├─► LLM (via Mastra agent.generate())
      │       │
      │       └─► NormalizedTranscript → LLM prompt → tasks[] JSON
      │
      ├─► saveTasksTool (called N times, once per task)
      │       │
      │       └─► POST /clients/{clientId}/tasks   (via api-client)
      │               │
      │               └─► { id, shortId, status: 'draft' }
      │
      └─► updateWorkflowStatusTool (status: 'completed' | 'failed')
              │
              └─► PATCH /workflows/{workflowRunId}/status
                      │
                      └─► { task_short_ids, tasks_attempted, tasks_created, tasks_failed }
```

---

## 6. API Contracts Used

### GET /transcripts/{id}

The `getTranscriptTool` calls this endpoint.

**Response shape (from `@iexcel/shared-types` `GetTranscriptResponse`):**
```typescript
{
  id: string;
  clientId: string;
  grainCallId: string | null;
  callType: MeetingType;
  callDate: string;
  rawTranscript: string;
  processedAt: string | null;
  createdAt: string;
  // NOTE: The NormalizedTranscript is returned within the processed transcript object.
  // The exact shape depends on Feature 08 (input-normalizer-text) implementation.
}
```

The feature depends on the transcript API returning a `NormalizedTranscript`-compatible object. If Feature 08 stores the normalized form separately, the tool must call the appropriate endpoint to retrieve the normalized representation.

### POST /clients/{clientId}/tasks

The `saveTasksTool` calls this endpoint.

**Request body (from `@iexcel/shared-types` `CreateTaskRequest`):**
```typescript
{
  clientId: string;
  transcriptId?: string;
  title: string;
  description: TaskDescription;  // { taskContext, additionalContext, requirements }
  assignee?: string;
  priority?: TaskPriority;
  estimatedTime?: string;        // ISO 8601 duration
  dueDate?: string;
  scrumStage?: string;
  tags?: string[];
}
```

**Success response:** `{ id: string, shortId: ShortId, status: 'draft' }` (HTTP 201)

### PATCH /workflows/{workflowRunId}/status

The `updateWorkflowStatusTool` calls this endpoint. Requires Mastra service token (not user token).

**Request body:**
```typescript
{
  status: 'running' | 'completed' | 'failed';
  result?: {
    task_short_ids: string[];
    tasks_attempted: number;
    tasks_created: number;
    tasks_failed: number;
    explanation?: string;  // present when tasks is empty
  } | null;
  error?: {
    code: string;
    message: string;
  } | null;
}
```

---

## 7. Dependencies

| Dependency | Version | Source | Purpose |
|---|---|---|---|
| `@mastra/core` | As per Feature 18 | npm | Agent class, Tool system |
| `mastra` | As per Feature 18 | npm | Runtime and build tooling |
| `zod` | As per Feature 18 | npm | Schema definitions for tools and LLM output |
| `@iexcel/shared-types` | workspace | Feature 01 | `NormalizedTranscript`, `NormalizedTask`, `TaskDescription`, `CreateTaskRequest`, `MeetingType` |
| `@iexcel/api-client` | workspace | Feature 22 | Typed HTTP client for API calls |
| `@iexcel/auth-client` | workspace | Feature 03 | Token management (via Feature 18's ServiceTokenManager) |

No new `npm` dependencies are introduced by this feature. All dependencies must already be declared in `apps/mastra/package.json` by Feature 18.

---

## 8. Performance Requirements

| Requirement | Target |
|---|---|
| Total agent execution time (typical transcript) | Under 60 seconds |
| Total agent execution time (large transcript, 1 hour call) | Under 120 seconds |
| LLM call timeout | 30 seconds per attempt |
| Task save API call timeout | 10 seconds per request |
| Workflow status update timeout | 10 seconds per request |

These targets inform the workflow-level timeout of 5 minutes established in Feature 17 (FR under Section 7). The agent must complete well within that budget.

---

## 9. Testing Strategy

### Unit Tests

**File:** `apps/mastra/src/agents/intake-agent.test.ts`

| Test Case | Approach |
|---|---|
| `buildIntakePrompt` produces correct string structure | Unit test with sample `NormalizedTranscript` |
| `buildIntakePrompt` handles empty segments (summary-only) | Unit test |
| `buildIntakePrompt` handles null summary and empty segments | Unit test — verify it returns summary-only or empty marker |
| LLM output schema validation accepts valid task array | Unit test with Zod `outputSchema.parse()` |
| LLM output schema validation rejects missing sections | Unit test with Zod — expect schema violation |
| ISO 8601 duration conversion from LLM `hh:mm` format | Unit test `convertDuration('02:30') === 'PT2H30M'` etc. |
| `clientId` mismatch detected correctly | Unit test with transcript carrying wrong `clientId` |

**File:** `apps/mastra/src/tools/task-tools.test.ts`

| Test Case | Approach |
|---|---|
| `saveTasksTool` calls correct API endpoint | Mock api-client, verify call args |
| `saveTasksTool` returns shortId and id from API response | Mock api-client response |
| `saveTasksTool` propagates API error | Mock api-client to throw, verify error bubbles |

**File:** `apps/mastra/src/tools/transcript-tools.test.ts`

| Test Case | Approach |
|---|---|
| `getTranscriptTool` calls correct endpoint | Mock api-client |
| `getTranscriptTool` returns NormalizedTranscript shape | Mock and verify output schema |

### Integration Tests

Integration tests are out of scope for this feature. End-to-end workflow testing is covered by Feature 17's test suite, which invokes the full workflow stack including this agent.

### Prompt Testing (Manual)

A test script `scripts/test-intake-agent.ts` should be created (not included in the production build) that:
1. Loads a sample transcript fixture from `fixtures/sample-intake-transcript.json`.
2. Invokes the intake agent directly against a local Mastra server.
3. Prints the resulting task objects for manual review.

This script is not an automated test — it is a development aid for prompt iteration.

---

## 10. Configuration

No new environment variables are introduced by this feature. All required configuration was established by Feature 18:

| Variable | Used By |
|---|---|
| `LLM_MODEL` | `intakeAgent` model field |
| `LLM_API_KEY` / `LLM_PROVIDER` | Provider API key injection |
| `API_BASE_URL` | api-client base URL |
| `MASTRA_CLIENT_ID` / `MASTRA_CLIENT_SECRET` | ServiceTokenManager for API callbacks |
| `AUTH_ISSUER_URL` | OIDC token validation |

---

## 11. Nx Build Integration

### Affected Targets

This feature modifies files within `apps/mastra/src/`. The following Nx targets are affected and must pass after implementation:

| Target | Command |
|---|---|
| Type check | `nx run mastra:type-check` |
| Lint | `nx run mastra:lint` |
| Build | `nx run mastra:build` |

### Dependency Graph Impact

This feature introduces no new Nx library dependencies. The existing implicit dependencies declared in `apps/mastra/project.json` (Feature 18) cover all requirements:
- `shared-types`
- `auth-client`
- `api-client`

---

## 12. Security Considerations

| Concern | Mitigation |
|---|---|
| LLM prompt injection via transcript content | System instructions explicitly scope the agent to the provided client only. Transcript segments are treated as data, not instructions. |
| Sensitive transcript content in logs | Log entries must not include task description text. Only metadata (counts, durations, short IDs) is logged. |
| API token exposure | Service token is managed by `ServiceTokenManager` (Feature 18). Never passed directly to LLM or logged. |
| Cross-client data leakage | `clientId` in invocation payload is the authoritative scope. Agent verifies transcript `clientId` matches before proceeding. API layer enforces authorization independently. |

---

## 13. Rollout Notes

- This feature replaces placeholder agent code installed by Feature 18. The placeholder must be fully removed — no fallback to "not yet implemented" errors.
- Feature 17 (Workflow Orchestration) must be deployed before this feature is callable end-to-end. However, the agent code can be deployed independently since it is only invoked by Feature 17.
- Feature 22 (api-client package) must be complete before this feature can make live API calls. Unit tests should mock the api-client.
- Prompt changes after initial deployment require a version bump in the `INTAKE_AGENT_INSTRUCTIONS` version comment and a new deployment.
