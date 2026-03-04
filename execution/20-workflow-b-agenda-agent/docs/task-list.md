# Task List
# Feature 20: Workflow B — Agenda Agent

**Feature Name:** workflow-b-agenda-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## Prerequisites

Before starting, confirm the following features are complete or in a state that unblocks this work:

- [ ] Feature 01 (shared-types) — `Agenda`, `AgendaStatus`, `CreateAgendaRequest` are exported from `@iexcel/shared-types`
- [ ] Feature 13 (status-reconciliation) — `ReconciledTask` type is defined; reconciliation runs correctly and Asana status fields are accessible via `GET /clients/{id}/tasks`
- [ ] Feature 14 (agenda-endpoints) — `POST /clients/{id}/agendas` is implemented and returns `{ id, shortId, status: 'draft' }`
- [ ] Feature 17 (workflow-orchestration) — The reconciliation data passthrough decision (Option A/B/C from TR.md Section 7) must be resolved and documented before this feature begins implementation
- [ ] Feature 18 (mastra-runtime-setup) — Placeholder `agendaAgent` exists in `apps/mastra/src/agents/agenda-agent.ts`, placeholder `saveDraftAgendaTool` exists in `src/tools/agenda-tools.ts`
- [ ] Feature 19 (workflow-a-intake-agent) — `updateWorkflowStatusTool` is implemented in `src/tools/workflow-tools.ts` (this feature reuses it)
- [ ] Feature 22 (api-client-package) — `agendas.createDraftAgenda()` and `tasks.listTasksForClient()` methods are available

---

## Blocking Pre-work (Must Complete Before Group 6)

- [ ] **TASK-20-00** [medium] Resolve and document the reconciliation data passthrough decision
  - Feature 17 must decide: does it pass `ReconciledTask[]` inline in the agent invocation context (Option B), or does the agent fetch via `GET /clients/{id}/tasks` with reconciled fields cached (Option A)?
  - Document the decision in Feature 17's implementation notes and confirm the `getReconciledTasksTool` implementation approach with the Feature 17 implementor
  - This task is blocking for TASK-20-08 (tool implementation) and TASK-20-17 (agent implementation)
  - References: TR.md — Section 7 (Relationship to Feature 13 Architecture)

---

## Group 1: Prompt and Instructions

- [ ] **TASK-20-01** [small] Create `src/prompts/agenda-instructions.ts` with `AGENDA_AGENT_INSTRUCTIONS` constant
  - Must include: role framing (experienced PM preparing client-facing document), document purpose explanation, data format description for completedTasks and incompleteTasks arrays, Completed Tasks section instructions (theme-grouped prose — NOT a task list), Incomplete Tasks section instructions, Relevant Deliverables instructions, Recommendations instructions (2–4 specific items), New Ideas instructions (1–3 items), Next Steps instructions (3–5 specific items), output format instructions (single markdown string in `content` field), no-completed-tasks guard instruction (return error object), client scoping guardrail
  - Must include version comment: `// Agenda Agent Instructions v1.0 — Feature 20`
  - Verification: File exports `AGENDA_AGENT_INSTRUCTIONS` as a string constant; all items listed in FRS.md FR-11 are addressed
  - References: FRS.md — FR-10, FR-11, FR-12, FR-13

- [ ] **TASK-20-02** [small] Review and refine prompt against sample reconciled task fixtures
  - Create `apps/mastra/fixtures/sample-reconciled-tasks.json` if not present
  - Fixture should include: 6–10 completed tasks across 2–3 themes, 2–3 incomplete tasks
  - Manually review that instructions would produce correct theme-grouping behavior
  - References: TR.md — Prompt Testing (Manual)

---

## Group 2: Prompt Helper Functions

- [ ] **TASK-20-03** [medium] Implement `buildAgendaPrompt(clientName, cycleStart, cycleEnd, completedTasks, incompleteTasks): string` helper
  - Format completed tasks: `[TSK-NNNN] Title (Assignee: X, Est: Xh) \n  Context: <taskContext truncated to 300 chars>`
  - Format incomplete tasks: same structure
  - Handle empty incompleteTasks with `(None)` placeholder
  - Enforce 50-task limit per input set (30 completed + 20 incomplete max for V1); emit warn log if limit hit
  - Verification: Unit tests pass (TASK-20-09)
  - References: TR.md — Prompt Assembly Strategy; FRS.md — FR-30

- [ ] **TASK-20-04** [small] Implement `formatDate(isoDate: string): string` utility (`"February 1, 2026"` format)
  - Verification: `formatDate('2026-02-01') === 'February 1, 2026'`, `formatDate('2026-02-28') === 'February 28, 2026'`

- [ ] **TASK-20-05** [small] Implement `formatCycleRange(cycleStart: string, cycleEnd: string): string` utility
  - Output format: `"February 1 – February 28, 2026"` (en-dash between dates)
  - Handles same-month ranges: `"February 1 – 28, 2026"`
  - Handles cross-month ranges: `"January 15 – February 14, 2026"`
  - Verification: Unit tests (TASK-20-09)

- [ ] **TASK-20-06** [small] Implement `validateSections(content: string): { valid: boolean; missing: string[] }` utility
  - Checks for all six section headers: `## Completed Tasks`, `## Incomplete Tasks`, `## Relevant Deliverables`, `## Recommendations`, `## New Ideas`, `## Next Steps`
  - Returns `{ valid: true, missing: [] }` if all present
  - Returns `{ valid: false, missing: ['## New Ideas'] }` if any absent
  - Verification: Unit tests (TASK-20-09)
  - References: TR.md — Section Validation; FRS.md — FR-33

---

## Group 3: Tool Implementations

- [ ] **TASK-20-07** [medium] Implement `saveDraftAgendaTool` in `src/tools/agenda-tools.ts`
  - Replace the Feature 18 placeholder `execute` function
  - Calls `apiClient.agendas.createDraftAgenda(clientId, { content, cycleStart, cycleEnd })`
  - Input schema: `clientId` (UUID), `content` (string min 1), `cycleStart` (string), `cycleEnd` (string)
  - Output schema: `{ id: string, shortId: string, status: 'draft' }`
  - Verification: Unit test passes (TASK-20-10); tool throws properly typed error on API failure
  - References: FRS.md — FR-51; TR.md — API Contracts Used

- [ ] **TASK-20-08** [medium] Implement `getReconciledTasksTool` in `src/tools/task-tools.ts`
  - **Blocked by TASK-20-00** (reconciliation passthrough decision)
  - Input schema: `clientId` (UUID), `cycleStart` (string), `cycleEnd` (string)
  - Output schema: `{ tasks: ReconciledTask[] }` (array matching Feature 13's output shape)
  - Implementation depends on decision from TASK-20-00:
    - If Option B (inline): reads from invocation context, no API call
    - If Option A (Postgres cache): calls `GET /clients/{clientId}/tasks?status=pushed&cycleStart=...&cycleEnd=...` with pagination
  - If Option A: implement pagination loop (fetch pages while `hasMore === true`)
  - Export from `src/tools/index.ts`
  - Verification: Unit tests pass (TASK-20-11)
  - References: FRS.md — FR-50; TR.md — API Contracts Used

- [ ] **TASK-20-09** (verify) `updateWorkflowStatusTool` from Feature 19 is already available
  - If Feature 19 is complete, no work needed — tool exists in `src/tools/workflow-tools.ts`
  - If Feature 19 is not yet complete, implement `updateWorkflowStatusTool` following Feature 19's TASK-19-10 specification
  - References: FRS.md — FR-52

---

## Group 4: Unit Tests

- [ ] **TASK-20-09** [medium] Write unit tests for prompt helper functions
  - File: `apps/mastra/src/utils/agenda-prompt-helpers.test.ts` (or co-located)
  - Test: `buildAgendaPrompt` with full data set, empty incomplete tasks, truncation at 300 chars
  - Test: `buildAgendaPrompt` 50-task limit enforcement
  - Test: `formatDate` — first of month, last of month, February, December
  - Test: `formatCycleRange` — same-month, cross-month, same-day (edge case)
  - Test: `validateSections` — all present, one missing, multiple missing, none missing
  - Verification: `nx run mastra:test` passes for all helper tests

- [ ] **TASK-20-10** [small] Write unit tests for `saveDraftAgendaTool`
  - Mock `apiClient.agendas.createDraftAgenda` — success case
  - Mock failure case (422) — verify error propagates
  - Verify output schema is correct
  - Verification: Tests pass

- [ ] **TASK-20-11** [medium] Write unit tests for `getReconciledTasksTool`
  - Mock API response — success case returns `ReconciledTask[]`
  - Test pagination: first call returns `hasMore: true`, second returns `hasMore: false`
  - Test empty result
  - Verification: Tests pass

- [ ] **TASK-20-12** [medium] Write unit tests for task classification logic
  - Test: `asanaStatus === 'completed'` → completedTasks
  - Test: `asanaStatus === 'incomplete'` → incompleteTasks
  - Test: `asanaStatus === 'not_found'` → incompleteTasks (not silently dropped)
  - Test: mixed array produces correct classification counts
  - Verification: Tests pass

- [ ] **TASK-20-13** [medium] Write unit tests for agenda agent pre-LLM validation logic
  - Test: empty completed tasks triggers NO_COMPLETED_TASKS guard
  - Test: empty tasks array triggers NO_COMPLETED_TASKS guard
  - Test: all-incomplete tasks triggers NO_COMPLETED_TASKS guard
  - Test: at least 1 completed task passes the guard
  - Verification: Tests pass

---

## Group 5: LLM Output Schema

- [ ] **TASK-20-14** [small] Define `agendaOutputSchema` Zod schema
  - Union type: `{ content: z.string().min(100) }` OR `{ error: z.literal('NO_COMPLETED_TASKS'), message: z.string() }`
  - Verification: Schema accepts valid content response, accepts NO_COMPLETED_TASKS error response, rejects empty string, rejects missing fields
  - References: FRS.md — FR-31

---

## Group 6: Agent Implementation

- [ ] **TASK-20-15** [large] Implement the full `agendaAgent` in `src/agents/agenda-agent.ts`
  - Replace Feature 18 placeholder entirely
  - Import and register: `AGENDA_AGENT_INSTRUCTIONS`, `env.LLM_MODEL`, `getReconciledTasksTool`, `saveDraftAgendaTool`, `updateWorkflowStatusTool`
  - Agent id must remain `'agenda-agent'`
  - References: FRS.md — FR-01, FR-02; TR.md — Agent Architecture

- [ ] **TASK-20-16** [large] Implement agent invocation handler (orchestration logic)
  - Handler receives `AgendaAgentInput` and orchestrates in this order:
    1. Retrieve reconciled tasks via `getReconciledTasksTool`
    2. Classify into completedTasks / incompleteTasks
    3. Validate: if `completedTasks.length === 0`, update workflow to `failed` (NO_COMPLETED_TASKS) and return
    4. Update workflow run to `running` via `updateWorkflowStatusTool`
    5. Assemble prompt via `buildAgendaPrompt`
    6. Call LLM with `agendaOutputSchema` structured output (with retry loop)
    7. If LLM returns NO_COMPLETED_TASKS error object, update workflow to `failed` and return
    8. Validate sections via `validateSections` (retry if invalid — counting toward 3-attempt limit)
    9. Call `saveDraftAgendaTool`
    10. Update workflow run to `completed` via `updateWorkflowStatusTool`
  - References: FRS.md — FR-20 through FR-42; TR.md — Data Flow

- [ ] **TASK-20-17** [medium] Implement LLM retry loop with section validation
  - On schema violation or missing sections: log warn, append clarifying instruction, retry
  - Treat both schema failures and missing section failures as a single retry counter (3 total attempts across both)
  - After 3 failures: update workflow to `failed` with `LLM_OUTPUT_INVALID`
  - References: FRS.md — FR-32, FR-33

- [ ] **TASK-20-18** [small] Implement the 50-task limit guard in agent pre-processing
  - If `completedTasks.length > 30` OR `incompleteTasks.length > 20`, truncate to limit
  - Emit a `warn` log: `workflowRunId`, `clientId`, `originalCompleted`, `originalIncomplete`, `truncatedCompleted`, `truncatedIncomplete`
  - Take the most recently completed tasks first (sort by `asanaCompletedAt` descending before truncating)
  - References: TR.md — Token Budget Considerations

---

## Group 7: Observability and Logging

- [ ] **TASK-20-19** [medium] Add structured log events to the agent handler
  - Emit all log events defined in FRS.md FR-70
  - Verify no agenda content or task description text appears in any log statement
  - References: FRS.md — FR-70, FR-71

- [ ] **TASK-20-20** [small] Verify OTel trace span `agenda-agent.run` is emitted
  - Run agent against local Mastra dev server with OTEL configured
  - Confirm span appears with correct attributes including `agent.agenda_short_id`
  - References: FRS.md — FR-71

---

## Group 8: Integration Verification

- [ ] **TASK-20-21** [medium] Create `scripts/test-agenda-agent.ts` manual test script
  - Loads `fixtures/sample-reconciled-tasks.json`
  - Invokes the agenda agent against a local Mastra server
  - Prints the generated Running Notes document to stdout
  - Checks all six sections are present and logs pass/fail
  - Not included in production build

- [ ] **TASK-20-22** [medium] End-to-end smoke test: trigger Workflow B and verify draft agenda
  - Requires Feature 17, Feature 13, and Feature 14 to be deployed
  - Trigger `POST /workflows/agenda` for a test client with known pushed tasks
  - Poll `GET /workflows/{id}/status` until completed
  - Verify the returned `agenda_short_id` retrieves a valid draft agenda with all six sections
  - Verify cycle dates match the request parameters

- [ ] **TASK-20-23** [medium] Run full Nx build and type-check pass
  - `nx run mastra:type-check` — zero errors
  - `nx run mastra:lint` — zero lint violations
  - `nx run mastra:build` — successful build artifact
  - References: TR.md — Nx Build Integration

- [ ] **TASK-20-24** [small] Verify `mastra.getAgent('agenda-agent')` returns the real agent
  - Start local Mastra dev server
  - Confirm agent is reachable with correct name and tool list
  - References: FRS.md — FR-01

---

## Group 9: Documentation and Handoff

- [ ] **TASK-20-25** [small] Update `apps/mastra/src/agents/agenda-agent.ts` — remove placeholder comment
  - Remove: `// Full implementation in feature 20 (workflow-b-agenda-agent)` placeholder note
  - Add: JSDoc comment documenting the agent's purpose, input contract, output contract, and Running Notes section structure

- [ ] **TASK-20-26** [small] Confirm no regression in Feature 18's health endpoint and Feature 19's agent
  - `GET /health` still returns `200 OK`
  - `mastra.getAgent('intake-agent')` still resolves correctly (addition of agenda agent must not affect intake agent)

- [ ] **TASK-20-27** [small] Document the resolved reconciliation passthrough decision in Feature 17 docs
  - Ensure the implementation choice (Option A, B, or C from TR.md Section 7) is reflected in Feature 17's implementation notes and in a brief comment in `getReconciledTasksTool`

---

## Summary

| Group | Tasks | Complexity |
|---|---|---|
| Pre-work (blocking) | 1 task | Medium |
| 1 — Prompt and Instructions | 2 tasks | Small–Medium |
| 2 — Prompt Helper Functions | 4 tasks | Small–Medium |
| 3 — Tool Implementations | 3 tasks | Small–Medium |
| 4 — Unit Tests | 5 tasks | Small–Medium |
| 5 — LLM Output Schema | 1 task | Small |
| 6 — Agent Implementation | 4 tasks | Medium–Large |
| 7 — Observability and Logging | 2 tasks | Small–Medium |
| 8 — Integration Verification | 4 tasks | Small–Medium |
| 9 — Documentation and Handoff | 3 tasks | Small |
| **Total** | **29 tasks** | |

**Critical Path:** TASK-20-00 (blocking) → Group 1 → Group 2 → Group 5 → Group 6 → Group 8

Groups 3 and 4 can proceed in parallel with Groups 2 and 5 (except TASK-20-08 which is blocked by TASK-20-00).

**Dependency on Feature 19:** TASK-20-09 (verify) depends on Feature 19 having implemented `updateWorkflowStatusTool`. If Feature 19 has not been implemented, TASK-20-09 becomes a full implementation task equivalent to Feature 19's TASK-19-10.
