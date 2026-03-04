# Technical Requirements
# Feature 20: Workflow B — Agenda Agent

**Feature Name:** workflow-b-agenda-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Technology Stack

Identical to Feature 19 — the agenda agent runs in the same Mastra runtime:

- **Mastra** (`mastra`, `@mastra/core`) — agent framework
- **Node.js** — ESM module system
- **TypeScript** — strict mode
- **LLM Provider** — configured via `LLM_PROVIDER` / `LLM_MODEL` environment variables
- **Zod** — tool and LLM output schema validation
- **Pino** — structured JSON logging via Mastra PinoLogger
- **OpenTelemetry** — trace spans via Mastra's OtelExporter
- **`@iexcel/api-client`** (Feature 22) — typed HTTP client
- **`@iexcel/shared-types`** (Feature 01) — all shared types

---

## 2. File Locations

| File | Action | Description |
|---|---|---|
| `src/agents/agenda-agent.ts` | Replace placeholder | Full agent implementation |
| `src/agents/index.ts` | No change | Already exports `agendaAgent` |
| `src/tools/agenda-tools.ts` | Replace placeholder | Full `saveDraftAgendaTool` implementation |
| `src/tools/task-tools.ts` | Extend | Add `getReconciledTasksTool` (alongside Feature 19 tools) |
| `src/tools/workflow-tools.ts` | No change (if Feature 19 complete) | `updateWorkflowStatusTool` already defined |
| `src/tools/index.ts` | Update | Export `getReconciledTasksTool`, `saveDraftAgendaTool` |
| `src/prompts/agenda-instructions.ts` | Create new | `AGENDA_AGENT_INSTRUCTIONS` constant |

No new `npm` dependencies. No changes to `package.json`, `project.json`, or `tsconfig.json`.

---

## 3. Agent Architecture

```typescript
// apps/mastra/src/agents/agenda-agent.ts

import { Agent } from '@mastra/core/agent';
import { AGENDA_AGENT_INSTRUCTIONS } from '../prompts/agenda-instructions';
import { env } from '../config/env';
import { getReconciledTasksTool, saveDraftAgendaTool } from '../tools';
import { updateWorkflowStatusTool } from '../tools/workflow-tools';

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

---

## 4. LLM Invocation Pattern

### Structured Output Schema

```typescript
import { z } from 'zod';

const agendaOutputSchema = z.union([
  z.object({
    content: z.string().min(100),
  }),
  z.object({
    error: z.literal('NO_COMPLETED_TASKS'),
    message: z.string(),
  }),
]);
```

### Section Validation

After receiving and parsing LLM output, before accepting it as valid, the agent must verify all six section headers are present using:

```typescript
const REQUIRED_SECTIONS = [
  '## Completed Tasks',
  '## Incomplete Tasks',
  '## Relevant Deliverables',
  '## Recommendations',
  '## New Ideas',
  '## Next Steps',
];

function validateSections(content: string): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_SECTIONS.filter(s => !content.includes(s));
  return { valid: missing.length === 0, missing };
}
```

If any sections are missing, this is treated as a schema violation and triggers a retry.

### Prompt Assembly Strategy

```typescript
function buildAgendaPrompt(
  clientName: string,
  cycleStart: string,
  cycleEnd: string,
  completedTasks: ReconciledTask[],
  incompleteTasks: ReconciledTask[]
): string {
  const formatTask = (t: ReconciledTask): string =>
    `- [${t.shortId}] ${t.title}` +
    (t.assignee ? ` (Assignee: ${t.assignee})` : '') +
    (t.estimatedTime ? ` (Est: ${formatDuration(t.estimatedTime)})` : '') +
    `\n  Context: ${t.description.taskContext.slice(0, 300)}`;

  const cycleRange = `${formatDate(cycleStart)} – ${formatDate(cycleEnd)}`;

  return [
    `Client: ${clientName}`,
    `Cycle: ${cycleRange}`,
    '',
    `COMPLETED TASKS (${completedTasks.length} total):`,
    completedTasks.map(formatTask).join('\n'),
    '',
    `INCOMPLETE TASKS (${incompleteTasks.length} total):`,
    incompleteTasks.length > 0
      ? incompleteTasks.map(formatTask).join('\n')
      : '(None)',
  ].join('\n');
}
```

Task descriptions are truncated to `taskContext` only (300 characters) to manage token budget. The `additionalContext` and `requirements` sections are not included in the agenda generation prompt — they contain implementation details not relevant to the client-facing document.

---

## 5. Data Flow

```
Feature 17 (Workflow Orchestration)
      │
      │  [Feature 13 triggered by Feature 17 BEFORE agent invocation]
      │  [Asana status data cached in Postgres, served by API]
      │
      │  POST to Mastra agent endpoint
      │  { workflowRunId, clientId, cycleStart, cycleEnd, callbackBaseUrl }
      │
      ▼
agenda-agent.ts
      │
      ├─► getReconciledTasksTool
      │       │
      │       └─► GET /clients/{clientId}/tasks?status=pushed&cycleStart=...&cycleEnd=...
      │               │
      │               └─► ReconciledTask[] (with asanaStatus, asanaCompleted fields)
      │
      ├─► Task classification
      │       │
      │       ├─► completedTasks = tasks.filter(t => t.asanaStatus === 'completed')
      │       └─► incompleteTasks = tasks.filter(t => t.asanaStatus !== 'completed')
      │
      ├─► Guard: completedTasks.length === 0 → fail workflow
      │
      ├─► updateWorkflowStatusTool (status: 'running')
      │
      ├─► buildAgendaPrompt(clientName, cycleStart, cycleEnd, completedTasks, incompleteTasks)
      │
      ├─► LLM (via agent.generate() with llmOutputSchema)
      │       │
      │       └─► { content: string } — markdown Running Notes from LLM
      │
      ├─► validateSections(content) → retry up to 3 times if sections missing
      │
      ├─► markdownToProseMirror(content) → ProseMirror JSON document
      │
      ├─► saveDraftAgendaTool
      │       │
      │       └─► POST /clients/{clientId}/agendas (content as ProseMirror JSON)
      │               │
      │               └─► { id, shortId: 'AGD-0015', status: 'draft' }
      │
      └─► updateWorkflowStatusTool (status: 'completed')
              │
              └─► { agenda_short_id, tasks_analyzed, tasks_completed, tasks_incomplete }
```

---

## 6. API Contracts Used

### GET /clients/{clientId}/tasks

The `getReconciledTasksTool` calls this endpoint with query parameters.

**Query parameters:**
- `status=pushed` — only tasks that have been pushed to Asana
- `cycleStart=<ISO date>` — filter tasks pushed on or after this date
- `cycleEnd=<ISO date>` — filter tasks pushed on or before this date

**Response:** `PaginatedResponse<ReconciledTask>` — the endpoint returns tasks with Asana reconciliation fields served from the Postgres cache (populated by Feature 13's last execution).

**Pagination:** The tool must handle pagination. If `hasMore === true`, the tool must fetch subsequent pages until all tasks are retrieved for the cycle window.

### POST /clients/{clientId}/agendas

The `saveDraftAgendaTool` calls this endpoint.

**Request body (from `@iexcel/shared-types` `CreateAgendaRequest`):**
```typescript
{
  clientId: string;
  content: object;    // ProseMirror JSON document structure
  cycleStart: string; // ISO 8601 date
  cycleEnd: string;   // ISO 8601 date
}
```

**Success response:** `{ id: string, shortId: AgendaShortId, status: 'draft' }` (HTTP 201)

### PATCH /workflows/{workflowRunId}/status

Same contract as Feature 19. See Feature 19's TR.md Section 6 for details. Result fields differ:

```typescript
result: {
  agenda_short_id: string;   // e.g., 'AGD-0015'
  tasks_analyzed: number;
  tasks_completed: number;
  tasks_incomplete: number;
}
```

---

## 7. Relationship to Feature 13 Architecture

Feature 13 (`reconcileTasksForClient`) is called internally within the API layer. The integration pattern is:

1. Feature 17 (`POST /workflows/agenda`) invokes Feature 13 synchronously as a precondition step before creating the workflow run record.
2. Feature 13 reads from Postgres (`tasks` with `status = 'pushed'`) and Asana (per-project batch fetch).
3. Feature 13 writes the reconciled Asana status back to Postgres as cached denormalized columns (`asana_status`, `asana_completed_at`, etc.) on the tasks table.
4. After Feature 13 runs, the `GET /clients/{clientId}/tasks` endpoint serves the cached reconciliation data directly from Postgres.

**Decided approach — Postgres cache:** Feature 13 persists reconciled Asana status to denormalized columns on the tasks table. The agent reads this data via `GET /clients/{clientId}/tasks`, which serves the cached values. This introduces eventual consistency (the cache reflects the state at the time Feature 13 last ran), but Feature 17 ensures a fresh reconciliation is triggered before each agent invocation, keeping the cache current for the workflow's purposes.

---

## 8. Token Budget Considerations

Agenda generation involves sending task data to the LLM. Token budget management is important:

| Input Component | Estimated Tokens |
|---|---|
| System instructions | ~600 tokens |
| Client and cycle context header | ~50 tokens |
| Per completed task (title + truncated context) | ~80 tokens |
| Per incomplete task (title + truncated context) | ~80 tokens |
| **Total for 20 tasks** | ~2,250 tokens |
| **Total for 50 tasks** | ~4,650 tokens |

For clients with more than 50 pushed tasks in a cycle, the agent must apply additional truncation or summarization before sending to the LLM to stay within context limits. For V1, a hard limit of 50 tasks (30 completed + 20 incomplete) should be enforced, with a warn log if the limit is hit.

This limit does not affect correctness — it is a safeguard against excessive API costs and latency for unusually large clients.

---

## 9. Performance Requirements

| Requirement | Target |
|---|---|
| Total agent execution time (typical: 10–20 tasks) | Under 60 seconds |
| Total agent execution time (large: 40–50 tasks) | Under 120 seconds |
| Task retrieval (including pagination) | Under 15 seconds |
| LLM call timeout | 45 seconds per attempt (longer than Feature 19 due to longer output) |
| Agenda save API call timeout | 10 seconds |
| Workflow status update timeout | 10 seconds |

---

## 10. Testing Strategy

### Unit Tests

**File:** `apps/mastra/src/agents/agenda-agent.test.ts`

| Test Case | Approach |
|---|---|
| `buildAgendaPrompt` produces correct structure | Unit test with sample `ReconciledTask[]` |
| `buildAgendaPrompt` handles empty incompleteTasks | Unit test — verify `(None)` placeholder |
| `validateSections` accepts complete document | Unit test with all 6 sections present |
| `validateSections` rejects document missing one section | Unit test — verify `missing` array contains section name |
| `validateSections` returns all missing sections | Unit test with 3 sections missing |
| Task classification: completed vs incomplete | Unit test filter logic for all `asanaStatus` values |
| Empty completed tasks guard | Unit test with all-incomplete task set |
| `formatDate` converts ISO date to human-readable | Unit test `formatDate('2026-02-01') === 'February 1, 2026'` |

**File:** `apps/mastra/src/tools/agenda-tools.test.ts`

| Test Case | Approach |
|---|---|
| `saveDraftAgendaTool` calls correct API endpoint | Mock api-client |
| `saveDraftAgendaTool` returns shortId and status | Mock api-client response |
| `saveDraftAgendaTool` propagates API error | Mock api-client to throw |

**File:** `apps/mastra/src/tools/task-tools.test.ts` (extended for agenda use case)

| Test Case | Approach |
|---|---|
| `getReconciledTasksTool` calls correct endpoint with filters | Mock api-client, verify query params |
| `getReconciledTasksTool` handles pagination | Mock paginated response (hasMore: true then false) |
| `getReconciledTasksTool` returns ReconciledTask array | Mock and verify output schema |

### Prompt Testing (Manual)

A test script `scripts/test-agenda-agent.ts` should be created:
1. Loads `fixtures/sample-reconciled-tasks.json` with mixed completed/incomplete tasks.
2. Invokes the agenda agent against a local Mastra server.
3. Prints the generated Running Notes document for manual review.
4. Checks that all six sections are present.

---

## 11. Dependencies

| Dependency | Version | Source | Purpose |
|---|---|---|---|
| `@mastra/core` | As per Feature 18 | npm | Agent class, Tool system |
| `mastra` | As per Feature 18 | npm | Runtime and build tooling |
| `zod` | As per Feature 18 | npm | Schema validation |
| `@iexcel/shared-types` | workspace | Feature 01 | `Agenda`, `AgendaStatus`, `CreateAgendaRequest` |
| `@iexcel/api-client` | workspace | Feature 22 | Typed HTTP client |
| Feature 13 output | runtime data | Feature 13 | Reconciled task data (via API or inline payload) |

---

## 12. Configuration

No new environment variables introduced. All configuration inherited from Feature 18.

---

## 13. Nx Build Integration

Same as Feature 19 — all changes are within `apps/mastra/src/`. The following Nx targets must pass:

| Target | Command |
|---|---|
| Type check | `nx run mastra:type-check` |
| Lint | `nx run mastra:lint` |
| Build | `nx run mastra:build` |

---

## 14. Security Considerations

| Concern | Mitigation |
|---|---|
| LLM prompt injection via task content | Instructions scope the agent to provided data only. Task content is treated as data, not instructions. |
| Client data in logs | Agenda content and task descriptions must never appear in log output. Only metadata is logged. |
| API token exposure | Managed by `ServiceTokenManager` — never passed to LLM or logged. |
| Cross-client data leak | `clientId` from invocation context is authoritative. All API calls use this ID. API layer enforces authorization independently. |
| Excessive token consumption | 50-task hard limit on LLM prompt input. Warn log if limit is hit. |

---

## 15. Rollout Notes

- Feature 17 must ensure Feature 13 writes reconciled data to the Postgres cache before invoking the agenda agent (see Section 7 — Postgres cache approach).
- Feature 13 must be deployed and functional before Feature 20 produces accurate output (though the agent code can be deployed independently).
- Feature 14 (agenda endpoints) must be deployed before the agent can save agendas.
- This feature replaces the Feature 18 placeholder for `agendaAgent`. The placeholder must be fully removed.
- Prompt changes require a version bump in `AGENDA_AGENT_INSTRUCTIONS` version comment.
