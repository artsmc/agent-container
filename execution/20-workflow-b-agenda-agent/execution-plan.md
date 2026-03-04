# Execution Plan
# Feature 20: Workflow B — Agenda Agent

**Feature Name:** workflow-b-agenda-agent
**Total Tasks:** 29 across 9 groups + 1 blocking pre-work (TASK-20-00)
**Planned By:** planner-6
**Date:** 2026-03-03

---

## Strategic Analysis

### Complexity Review

- 29 tasks across 9 groups, plus TASK-20-00 (critical blocker)
- Structure mirrors Feature 19 but with key differences:
  - ProseMirror JSON conversion (markdownToProseMirror) — not in task list but required by FRS FR-31/FR-33
  - Section validation (6 required sections) adds post-LLM validation step
  - Task classification (completed vs incomplete based on asanaStatus) requires reconciliation data
- TASK-20-00 (reconciliation passthrough decision) is a blocking pre-work item requiring coordination with Feature 17 team

### Identified Issues

1. **Missing task**: markdownToProseMirror conversion utility is referenced in FRS FR-31 and TR.md Section 4 but has no corresponding task in the task list. Must be added.
2. **TASK-20-09 ID collision**: Same ID used for two different tasks (tool verify in Group 3 and helper tests in Group 4). Must be disambiguated.
3. **TASK-20-00 blocker**: Requires decision from Feature 17 team on reconciliation data approach (Postgres cache vs inline payload). TR.md Section 7 confirms Postgres cache approach — TASK-20-00 should validate this.

### Dependency Analysis

**External dependencies:**
- Feature 18 (Mastra Runtime Setup) — agent framework
- Feature 13 (Reconciliation) — provides reconciled task data via Postgres cache
- Feature 14 (Agenda endpoints) — saveDraftAgendaTool calls agenda creation API

### Parallelism Opportunities

- Groups 1, 3, 5 independent (prompt, tools, schema) — same pattern as Feature 19
- Groups 7, 8, 9 independent (observability, integration, docs)
- markdownToProseMirror utility can be built in parallel with prompt work

### Risk Flags

- TASK-20-00 blocks all work — must be resolved first via Feature 17 coordination
- ProseMirror conversion may require a third-party library (e.g., tiptap) or custom implementation
- 50-task hard limit (30 completed + 20 incomplete) needs explicit enforcement code
- Section validation retry adds complexity to agent flow

---

## Execution Waves

### Wave A — Blocker Resolution + Foundation (Parallel after TASK-20-00)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Pre-work | TASK-20-00 | Reconciliation passthrough decision (coordinate with Feature 17) |
| Sub-agent 1 | Group 1 | Prompt/instructions (AGENDA_AGENT_INSTRUCTIONS, 6-section template) |
| Sub-agent 2 | Group 3 | Tool implementations (getReconciledTasksTool, saveDraftAgendaTool) |
| Sub-agent 3 | Group 5 + NEW | LLM output schema + markdownToProseMirror utility |

### Wave B — Helpers and Tests (Parallel, 2 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Group 2 | Prompt helpers (buildAgendaPrompt, formatDate, formatDuration, validateSections) |
| Sub-agent 2 | Group 4 | Unit tests for Groups 1-3 and helpers |

### Wave C — Agent Assembly (Sequential, 1 sub-agent)

| Task | Group | Description |
|------|-------|-------------|
| Group 6 tasks | Group 6 | Full agent implementation — classification, guard, prompt, LLM, validation, conversion, save |

### Wave D — Verification (Parallel, 3 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Group 7 | Observability (structured logging, OTel spans) |
| Sub-agent 2 | Group 8 | Integration verification (type-check, lint, build) |
| Sub-agent 3 | Group 9 | Documentation and prompt test script |

### Wave E — Manual Verification (Sequential, 1 sub-agent)

| Task | Description |
|------|-------------|
| Prompt test script | Run scripts/test-agenda-agent.ts with fixture data, verify 6-section output |

---

## Sub-Agent Summary

| Wave | Sub-Agents | Parallelism |
|------|-----------|-------------|
| Wave A | 3 (after pre-work) | Full parallel |
| Wave B | 2 | Full parallel |
| Wave C | 1 | Sequential |
| Wave D | 3 | Full parallel |
| Wave E | 1 | Sequential |
| **Total** | **10** | |

---

## Action Items for Execution Lead

1. Add missing task for markdownToProseMirror conversion utility (assign to Wave A, Sub-agent 3)
2. Resolve TASK-20-09 ID collision before assigning tasks
3. Coordinate TASK-20-00 with Feature 17 team before starting Wave A
