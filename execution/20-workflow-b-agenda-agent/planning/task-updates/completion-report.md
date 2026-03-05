# Feature 20: Workflow B -- Agenda Agent -- Completion Report

**Date:** 2026-03-05
**Status:** Implementation Complete (Groups 1-7)

---

## Reconciliation Decision

**TASK-20-00: Option A (Postgres cache)** -- The agent fetches reconciled tasks via `GET /clients/{clientId}/tasks` with `status=pushed` filter. Feature 13 writes reconciled Asana status to denormalized columns on the tasks table. Feature 17 ensures a fresh reconciliation is triggered before each agent invocation.

---

## Tasks Completed

### Group 1: Prompt and Instructions
- [x] **TASK-20-01**: Created `src/prompts/agenda-instructions.ts` with `AGENDA_AGENT_INSTRUCTIONS` constant. Includes role framing, document purpose, data format description, all six section instructions, output format, no-completed-tasks guard, and client scoping guardrail. Version comment included.
- [x] **TASK-20-02**: Created `fixtures/sample-reconciled-tasks.json` with 8 completed tasks across 3 themes (Sales Collateral, Analytics, Marketing) and 2 incomplete tasks (1 incomplete, 1 not_found).

### Group 2: Prompt Helper Functions
- [x] **TASK-20-03**: Implemented `buildAgendaPrompt()` in `src/utils/agenda-prompt-helpers.ts`. Formats completed/incomplete tasks with short ID, title, assignee, estimate, and truncated context (300 chars). Handles empty incomplete tasks with `(None)` placeholder. Enforces 50-task limit (30 completed + 20 incomplete). Sorts completed tasks by `asanaCompletedAt` descending before truncation.
- [x] **TASK-20-04**: Implemented `formatDate()` -- converts ISO date to "February 1, 2026" format.
- [x] **TASK-20-05**: Implemented `formatCycleRange()` -- handles same-month ("February 1 -- 28, 2026"), cross-month ("January 15 -- February 14, 2026"), and cross-year ranges.
- [x] **TASK-20-06**: Implemented `validateSections()` -- checks for all six required section headers, returns `{ valid, missing }`.

### Group 3: Tool Implementations
- [x] **TASK-20-07**: Replaced placeholder `saveDraftAgendaTool` in `src/tools/agenda-tools.ts`. Calls `apiClient.createAgenda(clientId, { content, cycleStart, cycleEnd })`. Returns `{ id, shortId, status: 'draft' }`.
- [x] **TASK-20-08**: Implemented `getReconciledTasksTool` in `src/tools/task-tools.ts`. Option A implementation with pagination loop. Fetches pushed tasks and maps to reconciled task shape with `asanaStatus`, `asanaCompleted`, `asanaCompletedAt` fields.
- [x] **TASK-20-09 (verify)**: `updateWorkflowStatusTool` was already created by Feature 19 in `src/tools/workflow-tools.ts`. Updated result schema from intake-specific to generic `z.record(z.unknown())` to support both intake and agenda workflow result shapes.
- [x] Updated `src/tools/index.ts` with all new exports.

### Group 4: Unit Tests
- [x] **TASK-20-09**: 24 unit tests for prompt helper functions in `src/utils/agenda-prompt-helpers.test.ts`:
  - `formatDate`: 6 tests (first/last of month, Feb, Dec, Jan, single-digit day)
  - `formatCycleRange`: 4 tests (same-month, cross-month, same-day, cross-year)
  - `validateSections`: 4 tests (all present, one missing, multiple missing, all missing)
  - `buildAgendaPrompt`: 10 tests (client name/cycle, task formatting, context truncation, empty incomplete, incomplete present, task counts, 30-task limit, 20-task limit, sort order, null assignee/estimate)

### Group 5: LLM Output Schema
- [x] **TASK-20-14**: Defined `agendaOutputSchema` Zod schema in `src/schemas/agenda-output.ts`. Union type: content (min 100 chars) OR NO_COMPLETED_TASKS error. 7 unit tests in `src/schemas/agenda-output.test.ts`.

### Group 6: Agent Implementation
- [x] **TASK-20-15**: Replaced placeholder `agendaAgent` in `src/agents/agenda-agent.ts`. Full agent definition with `AGENDA_AGENT_INSTRUCTIONS`, model config, and three tools.
- [x] **TASK-20-16**: Implemented agent invocation handler in `src/agents/agenda-handler.ts`. Full orchestration: fetch tasks -> classify -> guard -> update running -> build prompt -> LLM call -> validate sections -> save agenda -> update completed.
- [x] **TASK-20-17**: LLM retry loop with 3 total attempts. Schema violations and missing section failures share a single retry counter. Clarifying instruction appended on retries.
- [x] **TASK-20-18**: 50-task limit guard (30 completed + 20 incomplete). Sort by `asanaCompletedAt` descending before truncation. Warn log emitted with original/truncated counts.

### Group 7: Observability and Logging
- [x] **TASK-20-19**: All structured log events from FR-70 implemented in `agenda-handler.ts`. No agenda content or task descriptions in logs. Events: agent invoked, tasks retrieved, empty completed guard, LLM called, LLM output received, section validation passed, LLM retry triggered, agenda saved, agent completed, agent failed.

---

## Files Created

| File | Description |
|------|-------------|
| `apps/mastra/src/prompts/agenda-instructions.ts` | AGENDA_AGENT_INSTRUCTIONS constant |
| `apps/mastra/src/utils/agenda-prompt-helpers.ts` | buildAgendaPrompt, formatDate, formatCycleRange, validateSections |
| `apps/mastra/src/utils/agenda-prompt-helpers.test.ts` | 24 unit tests for helpers |
| `apps/mastra/src/schemas/agenda-output.ts` | agendaOutputSchema Zod schema |
| `apps/mastra/src/schemas/agenda-output.test.ts` | 7 unit tests for schema |
| `apps/mastra/src/agents/agenda-handler.ts` | runAgendaAgent orchestration handler |
| `apps/mastra/fixtures/sample-reconciled-tasks.json` | Sample reconciled task fixture |

## Files Modified

| File | Changes |
|------|---------|
| `apps/mastra/src/agents/agenda-agent.ts` | Replaced placeholder with full agent definition |
| `apps/mastra/src/tools/agenda-tools.ts` | Replaced placeholder with saveDraftAgendaTool + getAgenda implementations |
| `apps/mastra/src/tools/task-tools.ts` | Added getReconciledTasksTool; fixed execute param patterns for existing tools |
| `apps/mastra/src/tools/workflow-tools.ts` | Updated result schema to generic record for both workflows; fixed execute param |
| `apps/mastra/src/tools/index.ts` | Updated exports (saveDraftAgendaTool, getReconciledTasksTool) |
| `apps/mastra/src/tools/transcript-tools.ts` | Fixed execute param pattern (pre-existing Feature 19 bug) |
| `apps/mastra/src/agents/intake-agent.ts` | Fixed structuredOutput API call and priority type (pre-existing Feature 19 bugs) |

---

## Verification Results

### Type Check
```
npx nx run mastra:type-check
> tsc --noEmit -p apps/mastra/tsconfig.json
NX   Successfully ran target type-check for project mastra
```
**Result: PASS -- zero errors**

### Unit Tests
```
vitest run src/utils/agenda-prompt-helpers.test.ts src/schemas/agenda-output.test.ts
Test Files  2 passed (2)
Tests       31 passed (31)
```
**Result: PASS -- 31/31 tests**

---

## Additional Notes

### Pre-existing Bug Fixes
While implementing Feature 20, I discovered and fixed pre-existing type errors in Feature 19 files:
1. **Tool execute signatures**: All Feature 19 tools used `({ context })` destructuring which doesn't match Mastra's `createTool` TypeScript types. Changed to `(input)` parameter.
2. **Intake agent `generate` options**: Used `{ output: schema }` instead of the correct `{ structuredOutput: { schema } }` API.
3. **TaskPriority type mismatch**: String literal `'medium'` not assignable to enum `TaskPriority`.

### Groups Not Implemented (Require Runtime Environment)
- **TASK-20-20**: OTel trace span verification (requires running Mastra server with OTEL)
- **TASK-20-21**: Manual test script (requires local Mastra dev server)
- **TASK-20-22**: E2E smoke test (requires Features 13, 14, 17 deployed)
- **TASK-20-23**: Full Nx build (build target requires Mastra CLI)
- **TASK-20-24**: Agent resolution verification (requires running server)
- **TASK-20-25-27**: Documentation updates (covered by JSDoc in agent file)

### Agent ID Preserved
The agent ID remains `'agenda-agent'` as required, ensuring `mastra.getAgent('agenda-agent')` continues to resolve correctly.

### Agent Registration Verified
`src/agents/index.ts` continues to export both `intakeAgent` and `agendaAgent`. The Mastra instance in `src/index.ts` registers both agents.
