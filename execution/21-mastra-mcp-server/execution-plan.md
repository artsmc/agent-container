# Execution Plan
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Total Tasks:** 24 across 6 groups
**Planned By:** planner-6
**Date:** 2026-03-03

---

## Strategic Analysis

### Complexity Review

- 24 tasks across 6 groups. All Small except Tasks 4.1 (edit_task) and 4.3 (approve_tasks) which are Medium.
- Task 1.1 (Research) is a critical unblock — determines MCP registration pattern and token passthrough mechanism. All subsequent work depends on findings.
- 10 tool implementations (Groups 2-4) follow an identical structural pattern: extract token, resolve client, call API, format output, handle errors. Once the first tool is implemented, the rest are mechanical.
- approve_tasks (Task 4.3) is the most complex tool: handles single vs batch input normalization, multi-step API resolution, and mixed success/failure reporting.

### Dependency Analysis

**External dependencies:**
- Features 18, 22, 23 — required for Group 1
- Features 17, 19, 20 — required for Group 3 (workflow triggers)
- Feature 11 — required for Group 4 (task management)

**Internal dependencies:**
- Task 1.1 unblocks everything (determines MCP registration pattern)
- Task 1.2 depends on 1.1 (enables MCP server)
- Task 1.3 depends on 1.2 (directory structure)
- Tasks 1.4-1.8 depend on 1.3 (helpers/formatters need directory to exist)
- Groups 2, 3, 4 all depend on Group 1 (infrastructure + helpers)
- Group 5 depends on Groups 2-4 (all tools must exist for registration + observability)
- Group 6 depends on Group 5

### Parallelism Opportunities

1. **Within Group 1**: Tasks 1.4, 1.5, 1.6, 1.7, 1.8 are all independent — 5-way parallel after 1.3
2. **Groups 2, 3, 4**: Fully independent of each other — 3-way parallel
3. **Within Group 2**: All 5 read-only tools (2.1-2.5) are independent — 5-way parallel
4. **Within Group 3**: Both workflow triggers (3.1, 3.2) are independent — 2-way parallel
5. **Within Group 4**: All 3 task management tools (4.1-4.3) are independent — 3-way parallel
6. **Tasks 5.2 and 5.3**: Logging and OTel spans are independent, both depend on 5.1

### Risk Flags

1. Task 1.1 is a spike — findings may require adjusting token passthrough approach (potential rework of 1.4/1.5)
2. Wave D has 10 parallel tasks — batched into 3 sub-agents by functional domain for efficiency
3. Group 3 has runtime dependencies on Features 19 and 20 — tools can be coded and unit-tested without these features, but smoke testing (6.2) requires them deployed

---

## Execution Waves

### Wave A — Research Spike (Sequential, 1 sub-agent)

| Task | Description | Depends On |
|------|-------------|------------|
| 1.1 | Research Mastra MCP registration API | External: Feature 18 |

### Wave B — Server Bootstrap (Sequential, 1 sub-agent)

| Task | Description | Depends On |
|------|-------------|------------|
| 1.2 | Enable MCP server on Mastra instance | 1.1 |
| 1.3 | Create mcp-tools/ directory structure | 1.2 |

### Wave C — Shared Infrastructure (Parallel, 3 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | 1.4 + 1.5 | Token extraction helper + user API client factory |
| Sub-agent 2 | 1.6 | resolveClient shared helper |
| Sub-agent 3 | 1.7 + 1.8 | Output formatters + API error handler |

### Wave D — All Tool Implementations (Parallel, 3 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | 2.1-2.5 | 5 read-only tools (list_clients, get_client_status, get_agenda, get_tasks, get_transcript) |
| Sub-agent 2 | 3.1-3.2 | 2 workflow trigger tools (trigger_intake, trigger_agenda) |
| Sub-agent 3 | 4.1-4.3 | 3 task management tools (edit_task, reject_task, approve_tasks) |

### Wave E — Integration, Observability, and Handoff (2 sub-agents)

| Sub-Agent | Tasks | Description |
|-----------|-------|-------------|
| Sub-agent 1 | 5.1, 5.2, 5.3 | Register all tools, structured logging, OTel spans (5.2/5.3 parallel after 5.1) |
| Sub-agent 2 | 6.1, 6.2, 6.3 | README docs, smoke test, notify Feature 33 (sequential; 6.2 waits for Sub-agent 1) |

---

## Sub-Agent Summary

| Wave | Sub-Agents | Parallelism |
|------|-----------|-------------|
| Wave A | 1 | Sequential (spike) |
| Wave B | 1 | Sequential |
| Wave C | 3 | Full parallel |
| Wave D | 3 | Full parallel |
| Wave E | 2 | Partial parallel |
| **Total** | **10** | |
