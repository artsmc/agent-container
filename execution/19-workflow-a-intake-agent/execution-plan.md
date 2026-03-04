# Execution Plan
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Total Tasks:** 27 across 9 groups
**Planned By:** planner-6
**Date:** 2026-03-03

---

## Strategic Analysis

### Complexity Review

- 27 tasks across 9 groups
- Groups 1-5 (prompt, helpers, tools, tests, schema) are foundational — mostly Small tasks
- Group 6 (agent implementation) is the integration point — combines all prior work
- Groups 7-9 (observability, integration verification, documentation) are verification/polish
- Key complexity: LLM output schema enforcement with 3-retry mechanism (FR-32)
- Tool implementations (Group 3) follow api-client patterns established in Feature 18

### Dependency Analysis

**External dependencies:**
- Feature 18 (Mastra Runtime Setup) — agent framework, env config, service token
- Feature 08 (Transcript endpoints) — getTranscriptTool calls transcript API
- Feature 11 (Task endpoints) — saveTasksTool calls task creation API

### Parallelism Opportunities

- Groups 1, 3, 5 are independent (prompt content, tool implementations, output schema)
- Groups 7, 8, 9 are independent (observability, integration, docs)
- Group 2 (helpers) depends on Group 1 (prompt defines format requirements)
- Group 4 (tests) depends on Groups 2 and 3
- Group 6 (agent) depends on Groups 1-5

### Risk Flags

- LLM output quality is non-deterministic — prompt engineering (Group 1) may need iteration
- saveTasksTool batch endpoint (FR-41) depends on Feature 11's batch API being available
- Transcript retrieval depends on Feature 08 — can unit test with mocks but integration testing needs the endpoint

---

## Execution Waves

### Wave A — Foundation (Parallel, 3 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Group 1 | Prompt/instructions (INTAKE_AGENT_INSTRUCTIONS constant, version comment) |
| Sub-agent 2 | Group 3 | Tool implementations (saveTasksTool, getTranscriptTool — replace placeholders) |
| Sub-agent 3 | Group 5 | LLM output schema (Zod schema, retry logic, validation) |

### Wave B — Helpers and Tests (Parallel, 2 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Group 2 | Prompt helpers (formatTranscript, buildUserMessage, time conversion) |
| Sub-agent 2 | Group 4 | Unit tests for Groups 1-3 (tool mocks, schema validation tests) |

### Wave C — Agent Assembly (Sequential, 1 sub-agent)

| Task | Group | Description |
|------|-------|-------------|
| Group 6 tasks | Group 6 | Full agent implementation — wire prompt, tools, schema, retry logic |

### Wave D — Verification (Parallel, 3 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Group 7 | Observability (structured logging, OTel spans) |
| Sub-agent 2 | Group 8 | Integration verification (type-check, lint, build, agent registration) |
| Sub-agent 3 | Group 9 | Documentation (README updates, prompt changelog) |

---

## Sub-Agent Summary

| Wave | Sub-Agents | Parallelism |
|------|-----------|-------------|
| Wave A | 3 | Full parallel |
| Wave B | 2 | Full parallel |
| Wave C | 1 | Sequential |
| Wave D | 3 | Full parallel |
| **Total** | **9** | |
