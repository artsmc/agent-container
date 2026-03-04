# Task List
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## Prerequisites

Before starting, confirm the following features are complete or in a state that unblocks this work:

- [ ] Feature 01 (shared-types) — `NormalizedTranscript`, `NormalizedTask`, `TaskDescription`, `CreateTaskRequest`, `MeetingType` are exported from `@iexcel/shared-types`
- [ ] Feature 18 (mastra-runtime-setup) — Placeholder `intakeAgent` exists in `apps/mastra/src/agents/intake-agent.ts`, placeholder tools exist in `src/tools/`, `ServiceTokenManager` is operational
- [ ] Feature 22 (api-client-package) — `@iexcel/api-client` is available as a workspace dependency with `tasks.createDraftTask()`, `transcripts.getTranscript()`, and `workflows.updateStatus()` methods

---

## Group 1: Prompt and Instructions

*Work that can be done independently of runtime wiring. Start here.*

- [ ] **TASK-19-01** [small] Create `src/prompts/` directory in `apps/mastra/`
  - Verification: Directory exists at `apps/mastra/src/prompts/`
  - References: TR.md — File Locations

- [ ] **TASK-19-02** [medium] Create `src/prompts/intake-instructions.ts` with `INTAKE_AGENT_INSTRUCTIONS` constant
  - Must include: role framing, extraction scope guardrail, three-section description format (TASK CONTEXT, ADDITIONAL CONTEXT, REQUIREMENTS), title format rules, assignee extraction rules, estimated time rules with ISO 8601 format, scrum stage default, JSON output format requirement, no-task-case instruction, client scoping guardrail
  - Must include version comment: `// Intake Agent Instructions v1.0 — Feature 19`
  - Verification: File exports `INTAKE_AGENT_INSTRUCTIONS` as a string constant; content addresses all items listed in FRS.md FR-11
  - References: FRS.md — FR-10, FR-11, FR-12

- [ ] **TASK-19-03** [small] Review and refine prompt against sample transcript fixtures
  - Load a sample intake transcript fixture (create in `apps/mastra/fixtures/sample-intake-transcript.json` if not present)
  - Verify the prompt structure produces logically correct extraction behavior when manually reviewed
  - References: TR.md — Prompt Testing (Manual)

---

## Group 2: Prompt Helper Functions

*Helper utilities for prompt assembly and data conversion. No API dependencies.*

- [ ] **TASK-19-04** [small] Implement `buildIntakePrompt(transcript: NormalizedTranscript): string` helper
  - Location: alongside `intake-agent.ts` or in a `src/utils/prompt-helpers.ts` module
  - Must format: meeting date (human-readable), participants (comma-separated), duration (Xh Ym), summary (if present), highlights (bulleted if present), segments (formatted as `[HH:MM:SS] Speaker: text`)
  - Verification: Unit tests pass (see TASK-19-11)
  - References: FRS.md — FR-30; TR.md — Prompt Construction Strategy

- [ ] **TASK-19-05** [small] Implement `formatTimestamp(seconds: number): string` utility (`"00:14:32"` format)
  - Verification: `formatTimestamp(872) === '00:14:32'`, `formatTimestamp(3661) === '01:01:01'`

- [ ] **TASK-19-06** [small] Implement `formatDuration(seconds: number): string` utility (`"1h 27m"` format)
  - Verification: `formatDuration(5220) === '1h 27m'`, `formatDuration(1800) === '30m'`

- [ ] **TASK-19-07** [small] Implement `convertEstimatedTimeToDuration(input: string | null): string | null` utility
  - Converts LLM output (ISO 8601 from prompt) to API-expected ISO 8601 duration
  - Must handle: `'PT2H30M'` → `'PT2H30M'` (pass-through), null → null
  - Handles edge cases: `'PT0H30M'` → `'PT30M'` (normalize zero-hours)
  - Verification: Unit tests (see TASK-19-11)

---

## Group 3: Tool Implementations

*Replace Feature 18 placeholders with real implementations. Requires api-client (Feature 22).*

- [ ] **TASK-19-08** [medium] Implement `saveTasksTool` in `src/tools/task-tools.ts`
  - Replace the placeholder `execute` function with a real implementation calling `apiClient.tasks.createDraftTask(clientId, payload)`
  - Input schema: `clientId`, `transcriptId`, `title`, `description` (object with three fields), `assignee` (nullable), `estimatedTime` (nullable ISO 8601), `scrumStage` (default `'Backlog'`), `tags` (default `[]`), `priority` (default `'medium'`)
  - Output schema: `{ shortId: string, id: string, status: 'draft' }`
  - Verification: Unit test passes (TASK-19-12); tool throws properly typed error on API failure
  - References: FRS.md — FR-50; TR.md — API Contracts Used

- [ ] **TASK-19-09** [medium] Implement `getTranscriptTool` in `src/tools/transcript-tools.ts`
  - Replace the placeholder `execute` with a real call to `apiClient.transcripts.getTranscript(transcriptId)`
  - Output schema matches `NormalizedTranscript` shape
  - Verification: Unit test passes (TASK-19-13)
  - References: FRS.md — FR-51; TR.md — API Contracts Used

- [ ] **TASK-19-10** [medium] Create `src/tools/workflow-tools.ts` with `updateWorkflowStatusTool`
  - New file (not a placeholder replacement)
  - Calls `apiClient.workflows.updateStatus(workflowRunId, { status, result, error })`
  - Input schema: `workflowRunId` (UUID), `status` (`'running' | 'completed' | 'failed'`), `result` (nullable object), `error` (nullable `{ code, message }`)
  - Output schema: `{ updated: boolean }`
  - Export from `src/tools/index.ts`
  - Verification: Tool file exists and is exported; unit test passes
  - References: FRS.md — FR-52; TR.md — File Locations

---

## Group 4: Unit Tests

*Write tests before or alongside implementation (TDD preferred).*

- [ ] **TASK-19-11** [medium] Write unit tests for prompt helper functions
  - File: `apps/mastra/src/utils/prompt-helpers.test.ts` (or co-located test)
  - Test: `buildIntakePrompt` with full transcript (all fields), segments-only, summary-only, empty
  - Test: `formatTimestamp` edge cases (0, 59, 3661, 86399)
  - Test: `formatDuration` edge cases (0, 60, 3600, 5220)
  - Test: `convertEstimatedTimeToDuration` — valid strings, null, malformed input
  - Verification: `nx run mastra:test` passes for all helper tests

- [ ] **TASK-19-12** [small] Write unit tests for `saveTasksTool`
  - Mock `apiClient.tasks.createDraftTask` — success case returns `{ id, shortId, status: 'draft' }`
  - Mock failure case — verify error propagates
  - Verification: Tests pass

- [ ] **TASK-19-13** [small] Write unit tests for `getTranscriptTool`
  - Mock `apiClient.transcripts.getTranscript` — success returns `NormalizedTranscript` shape
  - Verify output schema validation works
  - Verification: Tests pass

- [ ] **TASK-19-14** [small] Write unit tests for `updateWorkflowStatusTool`
  - Mock `apiClient.workflows.updateStatus` — success returns `{ updated: true }`
  - Test all three status values: `'running'`, `'completed'`, `'failed'`
  - Verification: Tests pass

- [ ] **TASK-19-15** [medium] Write unit tests for intake agent validation logic
  - Test `clientId` mismatch detection
  - Test empty transcript detection (no segments + null summary)
  - Test transcript with segments but no action items
  - These tests mock the LLM call and test the agent's pre/post processing logic
  - Verification: Tests pass

---

## Group 5: LLM Output Schema

*Define and test the Zod schema used for structured LLM output.*

- [ ] **TASK-19-16** [small] Define `intakeOutputSchema` Zod schema in `intake-agent.ts` or a co-located `schemas/` module
  - Schema fields: `tasks` (array of task objects), `explanation` (optional string)
  - Each task: `title` (string, max 255), `description` (object with three required string fields), `assignee` (string nullable), `estimatedTime` (ISO 8601 regex nullable), `scrumStage` (literal `'Backlog'`), `tags` (array of strings)
  - Verification: Schema correctly accepts valid LLM outputs and rejects malformed ones (unit tested in TASK-19-15)
  - References: FRS.md — FR-31

---

## Group 6: Agent Implementation

*Wire everything together into the final agent. Requires Groups 1–5.*

- [ ] **TASK-19-17** [large] Implement the full `intakeAgent` in `src/agents/intake-agent.ts`
  - Replace Feature 18 placeholder entirely
  - Import and register: `INTAKE_AGENT_INSTRUCTIONS`, `env.LLM_MODEL`, `saveTasksTool`, `getTranscriptTool`, `updateWorkflowStatusTool`
  - Agent id must remain `'intake-agent'`
  - References: FRS.md — FR-01, FR-02; TR.md — Agent Architecture

- [ ] **TASK-19-18** [large] Implement the agent invocation handler logic
  - The handler receives `IntakeAgentInput` and orchestrates the following steps in order:
    1. Retrieve transcript via `getTranscriptTool`
    2. Validate clientId match and transcript content (FR-22)
    3. Update workflow run to `running` via `updateWorkflowStatusTool`
    4. Assemble LLM prompt via `buildIntakePrompt`
    5. Call LLM with `intakeOutputSchema` structured output (with retry loop — 3 attempts)
    6. For each task in LLM output, call `saveTasksTool`
    7. Update workflow run to `completed` or `failed` via `updateWorkflowStatusTool`
  - References: FRS.md — FR-30 through FR-44; TR.md — Data Flow

- [ ] **TASK-19-19** [medium] Implement LLM retry loop (3 attempts on schema validation failure)
  - On schema violation, append clarification message and retry
  - After 3 failures, transition workflow to `failed` with `LLM_OUTPUT_INVALID`
  - References: FRS.md — FR-32

- [ ] **TASK-19-20** [medium] Implement per-task error handling in save loop
  - Catch API errors per task, log as `warn`, continue with remaining tasks
  - Track `tasksAttempted`, `tasksCreated`, `tasksFailed` counters
  - Determine final status: `completed` if any tasks saved or no tasks found; `failed` only if LLM returned tasks and all failed to save
  - References: FRS.md — FR-42, FR-43, FR-44

---

## Group 7: Observability and Logging

- [ ] **TASK-19-21** [medium] Add structured log events to the agent handler
  - Emit all log events defined in FRS.md FR-70
  - Verify no task description text appears in any log statement
  - References: FRS.md — FR-70, FR-71; TR.md — Observability

- [ ] **TASK-19-22** [small] Verify OTel trace span `intake-agent.run` is emitted
  - Run agent against local Mastra dev server
  - Confirm span appears in OTEL output with correct attributes
  - References: FRS.md — FR-71

---

## Group 8: Integration Verification

- [ ] **TASK-19-23** [medium] Create `scripts/test-intake-agent.ts` manual test script
  - Loads `fixtures/sample-intake-transcript.json`
  - Invokes the intake agent against a local Mastra server
  - Prints resulting task objects to stdout for manual review
  - Not included in production build (exclude from `tsconfig.lib.json`)
  - References: TR.md — Prompt Testing (Manual)

- [ ] **TASK-19-24** [medium] Run full Nx build and type-check pass
  - `nx run mastra:type-check` — must pass with zero errors
  - `nx run mastra:lint` — must pass with zero lint violations
  - `nx run mastra:build` — must produce a build artifact
  - References: TR.md — Nx Build Integration

- [ ] **TASK-19-25** [small] Verify `mastra.getAgent('intake-agent')` returns the real agent (not the placeholder)
  - Start local Mastra dev server
  - Confirm agent is reachable and responds with its name and tool list
  - References: FRS.md — FR-01

---

## Group 9: Documentation and Handoff

- [ ] **TASK-19-26** [small] Update `apps/mastra/src/agents/intake-agent.ts` to remove the placeholder comment from Feature 18
  - Remove: `// Full implementation in feature 19 (workflow-a-intake-agent)` placeholder note (now replaced)
  - Add: appropriate JSDoc comment documenting the agent's purpose, input contract, and output contract

- [ ] **TASK-19-27** [small] Confirm no regression in Feature 18's health endpoint
  - `GET /health` still returns `200 OK` with correct body after this feature's changes
  - References: Feature 18 FRS — FR-90

---

## Summary

| Group | Tasks | Complexity |
|---|---|---|
| 1 — Prompt and Instructions | 3 tasks | Small–Medium |
| 2 — Prompt Helper Functions | 4 tasks | Small |
| 3 — Tool Implementations | 3 tasks | Medium |
| 4 — Unit Tests | 5 tasks | Small–Medium |
| 5 — LLM Output Schema | 1 task | Small |
| 6 — Agent Implementation | 4 tasks | Medium–Large |
| 7 — Observability and Logging | 2 tasks | Small–Medium |
| 8 — Integration Verification | 3 tasks | Small–Medium |
| 9 — Documentation and Handoff | 2 tasks | Small |
| **Total** | **27 tasks** | |

**Critical Path:** Group 1 → Group 2 → Group 5 → Group 6 → Group 8

Groups 3 and 4 can proceed in parallel with Group 2 and 5.
