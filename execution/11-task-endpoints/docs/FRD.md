# FRD — Feature Requirement Document
## Feature 11: Task Endpoints

**Feature Name:** task-endpoints
**Phase:** Phase 2 — Core API & Data Pipeline (Wave 4 of spec generation)
**Date:** 2026-03-03
**Status:** Specification

---

## 1. Business Objectives

### 1.1 Overview

The iExcel automation system exists to eliminate the manual, error-prone process of creating Asana tasks after every client intake call. Currently, account managers spend significant time after each call building tickets by hand — or by pasting transcripts into ChatGPT and massaging CSV exports into Asana.

Feature 11 delivers the core task management API that sits at the center of this automation. It is the bridge between the AI agent that generates tasks from transcripts (Feature 19) and the external Asana system that executes them (Feature 12). Every task in the system — whether created by a Mastra agent, a human via the UI, or an operator via the terminal — flows through these endpoints.

### 1.2 Business Value

| Objective | Current State | Target State |
|---|---|---|
| Task creation speed | 20–40 minutes per intake call, manual | Near-zero manual effort; agent generates drafts automatically |
| Approval accountability | No formal approval step; tasks go directly to Asana | Enforced approval gate; only `account_manager`/`admin` can approve |
| Audit trail | None — no record of who created, edited, or approved a task | Full audit log for every status transition |
| Task traceability | Tasks lose connection to their source call | Every task is linked to its source transcript |
| Partial success handling | Manual retries required | Batch operations return per-task results; partial success is handled gracefully |

### 1.3 Strategic Context

This feature is on the **critical path** of the entire system:

```
00 → 01 → 04 → 07 → [11] → 12 → 13 → 14 → 17 → 19/20 → 21 → 33
```

Feature 11 directly blocks:
- **Feature 12** (output normalizer / Asana push) — the push endpoint in this feature calls Feature 12
- **Feature 17** (workflow orchestration) — workflow status depends on task state
- **Feature 19** (Workflow A intake agent) — the agent POSTs draft tasks to the endpoint built here

Nothing in the product moves tasks to Asana without this feature.

---

## 2. Target Users

### 2.1 Primary Users

| User Type | Role | Interaction |
|---|---|---|
| Account Manager | Reviews, edits, approves, and pushes tasks | Web UI (Feature 27) and possibly terminal |
| Admin | All account manager capabilities plus system config | Web UI |
| Mastra Agent (Workflow A) | Creates draft tasks via POST after transcript processing | Service-to-service (OIDC client credentials) |

### 2.2 Secondary Users

| User Type | Role | Interaction |
|---|---|---|
| Team Member | Read-only access to tasks for their assigned clients | Web UI |
| Terminal Operator | Edit tasks, trigger batch operations via MCP tools | Terminal / Claude (Feature 33) |

### 2.3 User Journeys

**Journey A — Automated Draft Creation (Mastra)**
1. Account manager submits a transcript via `/workflows/intake`.
2. Workflow A agent processes the transcript and calls `POST /clients/{id}/tasks` with an array of draft tasks.
3. Draft tasks appear in the UI for review.

**Journey B — Human Review and Approval**
1. Account manager opens the task review screen (Feature 27).
2. Reviews each draft task; edits title, description, assignee, or estimated time as needed.
3. Approves tasks individually or in batch.
4. Pushes approved tasks to Asana individually or in batch.

**Journey C — Rejection and Re-edit**
1. Account manager rejects a task that needs rework.
2. Task returns to an editable state (`rejected` allows edits).
3. Account manager edits and re-approves.

---

## 3. Success Metrics and KPIs

| Metric | Target |
|---|---|
| Task creation latency (POST) | < 500ms for a batch of 10 tasks |
| Short ID lookup latency (GET /tasks/{TSK-####}) | < 100ms (indexed) |
| Batch approve endpoint | Handles up to 50 tasks per batch |
| Batch push endpoint | Handles up to 50 tasks per batch; partial failure reported per-task |
| Approval enforcement accuracy | 100% — zero tasks pushed without `status = approved` |
| Audit log completeness | 100% of status transitions captured |
| Short ID uniqueness | Zero collisions guaranteed by database sequence |

---

## 4. Business Constraints and Rules

### 4.1 Approval Gate
No task may be pushed to an external system unless its status is `approved`. This is a hard business rule, not a convenience check. It exists to prevent unreviewed AI-generated content from reaching clients.

### 4.2 Role-Based Approval
Only users with the `account_manager` or `admin` role may approve tasks. Team members have read-only access to tasks. This enforces accountability — every approval is attributed to a named human.

### 4.3 Short IDs are Permanent
Once a short ID (`TSK-0042`) is assigned, it is globally unique and immutable. It is never reused, even if a task is rejected or deleted. This allows safe referencing across conversations, emails, and Asana comments.

### 4.4 Version History is Immutable
Every edit to a task's content creates a new Task Version row. Version rows are never updated or deleted. The original agent-generated content (version 1) is always recoverable.

### 4.5 External System is Abstracted
The push endpoint does not directly call Asana. It calls Feature 12 (output normalizer), which owns the Asana API integration. This feature stores the result as an `external_ref` JSONB object, not a raw Asana task ID, ensuring future compatibility with other PM tools (Jira, Linear).

### 4.6 Workspace Routing is Deterministic
The workspace a task routes to is determined by a fixed cascade:
1. Task-level override (`asana_workspace_id` on the task record).
2. Client default (`default_asana_workspace_id` on the client record).
3. If neither is configured: reject the push with `WORKSPACE_NOT_CONFIGURED`.

There is no ambiguity and no silent fallback.

---

## 5. Dependencies

### 5.1 Upstream (Blocked By)

| Feature | Dependency |
|---|---|
| Feature 07 (API Scaffolding) | Express/Fastify app, middleware stack, auth token validation, error handling |
| Feature 09 (Client Management) | Client records must exist; `default_asana_workspace_id` read from here |
| Feature 04 (Product Database Schema) | Tasks and Task Versions tables, indexes, and short ID sequence must exist |

### 5.2 Downstream (Blocks)

| Feature | What It Needs From This Feature |
|---|---|
| Feature 12 (Output Normalizer) | The push endpoint calls Feature 12's service to perform the actual Asana API call |
| Feature 17 (Workflow Orchestration) | Workflow status depends on task creation and state |
| Feature 19 (Workflow A Intake Agent) | Agent POSTs draft tasks to `POST /clients/{id}/tasks` |
| Feature 27 (UI Task Review) | Consumes all task endpoints for the review screen |
| Feature 33 (Terminal MCP Tools) | Terminal tools invoke these endpoints for task operations |

---

## 6. Out of Scope

| Excluded | Reason |
|---|---|
| Actual Asana API call (creating task in Asana) | Feature 12 (output normalizer) |
| Mastra agent logic that generates tasks from transcripts | Feature 19 (Workflow A) |
| Task completion status syncing from Asana | Feature 13 (status reconciliation) |
| Agenda-related task queries | Feature 14 (agenda endpoints) |
| `completed` task status | Owned by Asana; Feature 13 handles reconciliation |
| Soft delete / hard delete for rejected tasks | Open question deferred to Feature 04 schema decisions |
