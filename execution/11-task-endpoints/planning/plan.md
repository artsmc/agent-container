# Execution Plan
# Feature 11: Task Endpoints

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/11-task-endpoints
- **planning_folder:** execution/11-task-endpoints/planning
- **task_list_file:** execution/11-task-endpoints/task-list.md

---

## Summary

32 tasks across 6 original phases (A-F), retained as-is. Nine REST endpoints including CRUD, status transitions (approve/reject/push), and batch operations. Key patterns: short ID resolution (TSK-####), workspace routing cascade, partial-success batch model, and OutputNormalizerService interface stub for Feature 12. Single agent execution.

**Critical sequential chain:** C3 (workspace routing) → C4 (Feature 12 interface stub) → C5 (push endpoint) → D3 (batch push helper) → D4 (batch push route). This chain cannot be parallelized.

---

## Wave 1 — Foundation (Phase A — 3 parallel streams)

### Stream A — Database Verification

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| A1 | Verify all DB prerequisites: tasks table, task_versions table, task_short_id_seq, next_task_short_id(), all 4 indexes, task_status enum, version_source enum | Small | TR.md Section 3 |

### Stream B — Utility Functions

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| A2 | Short ID resolution utility: resolveTaskId(idParam, db) with TSK-\d+ pattern match + UUID validation + unit tests | Small | TR.md Section 4 |
| A3 | Source detection utility: detectSource(request) → 'agent' | 'ui' | 'terminal' + unit tests | Small | TR.md Section 6 |
| A5 | Audit log utility: writeAuditEntry() — confirm reuse from Feature 07/09 or implement new | Small | TR.md Section 7 |

### Stream C — Data Access Layer

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| A4 | Task data access layer: insertTasks, findTaskByShortId, findTaskById, findTasksByClient, updateTask, insertTaskVersion, getLatestVersionNumber, findTaskWithVersions | Medium | TR.md Sections 3.1, 3.3 |

**Result:** All foundation components ready.

---

## Wave 2 — Core Endpoints (Phase B — all parallel)

All 4 handlers use different DB functions and don't depend on each other.

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| B1 | POST /clients/{client_id}/tasks — batch creation with short IDs, version 1, audit | Medium | FRS FR-CRT-01 to FR-CRT-09 |
| B2 | GET /clients/{client_id}/tasks — list with status/transcript filters, pagination | Small | FRS FR-LST-01 to FR-LST-04 |
| B3 | GET /tasks/{id} — detail by UUID or short ID, includes versions array | Small | FRS FR-DET-01 to FR-DET-05 |
| B4 | PATCH /tasks/{id} — edit draft/rejected only, version increment, audit with changed_fields | Medium | FRS FR-EDT-01 to FR-EDT-06 |

**Depends on:** Wave 1 (all foundation components).
**Result:** MILESTONE — 4 core endpoints functional.

---

## Wave 3 — Status Transitions (Phase C — partially sequential)

### Parallel pair

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| C1 | POST /tasks/{id}/approve — draft only, role check (AM/admin), sets approved_by/at | Small | FRS FR-APR-01 to FR-APR-06 |
| C2 | POST /tasks/{id}/reject — draft or approved, clears approval fields, optional reason | Small | FRS FR-REJ-01 to FR-REJ-07 |

### Sequential chain (C3 → C4 → C5)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| C3 | Workspace routing service: resolveWorkspace(task, client) with cascade + unit tests | Small | TR.md Section 5 |
| C4 | Feature 12 interface stub: OutputNormalizerService + NotImplementedError stub + DI wiring | Small | TR.md Section 12 |
| C5 | POST /tasks/{id}/push — approved only, workspace routing, normalizer call, external_ref write | Medium | FRS FR-PSH-01 to FR-PSH-10 |

**Depends on:** Wave 2 (handlers must exist for status transitions to reference task detail pattern).
**Result:** All 3 status transition endpoints functional.

---

## Wave 4 — Batch Operations (Phase D — partially sequential)

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| parallel | D1 | Batch approve helper: batchApprove() with partial-success model | Medium | FRS FR-BAP-01 to FR-BAP-05 |
| after D1 | D2 | POST /clients/{id}/tasks/approve — register BEFORE parameterized routes | Small | TR.md Section 2.8 |
| sequential from C5 | D3 | Batch push helper: batchPush() with partial-success model | Medium | FRS FR-BPS-01 to FR-BPS-04 |
| after D3 | D4 | POST /clients/{id}/tasks/push — register BEFORE parameterized routes | Small | TR.md Section 2.9 |

**Depends on:** Wave 3 (C1 for approve logic, C5 for push logic).
**Note:** D1/D2 can start as soon as C1 is done. D3/D4 must wait for C5.
**Result:** MILESTONE — All 9 endpoints functional.

---

## Wave 5 — Testing (Phase E — parallel after seed)

### Unit Tests (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| E1 | Short ID utility tests: sequence, resolution, errors | Small | GS Feature: Short ID Generation |
| E2 | Workspace routing tests: task override, client default, both null | Small | GS Feature: Push Task |
| E3 | Source detection tests: service account, terminal header, browser | Small | TR.md Section 6 |

### Integration Tests (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| E4 | Create Draft Tasks: happy path, validation errors, access control | Medium | GS Feature: Create Draft Tasks |
| E5 | List Tasks: filters, pagination, sorting, per_page cap | Small | GS Feature: List Tasks |
| E6 | Get Task Detail: short ID, UUID, 404, 403 | Small | GS Feature: Get Task Detail |
| E7 | Edit Task: draft/rejected OK, approved/pushed 422, field validation, audit | Medium | GS Feature: Edit Draft Task |
| E8 | Approve Task: role matrix, status guards, idempotency | Medium | GS Feature: Approve Task |
| E9 | Reject Task: with/without reason, approval clearing, pushed 422 | Medium | GS Feature: Reject Task |
| E10 | Push Task: workspace routing, mock normalizer, error handling | Large | GS Feature: Push Task |
| E11 | Batch Approve: partial failure, 51 items, role check | Medium | GS Feature: Batch Approve |
| E12 | Batch Push: partial failure, normalizer errors | Medium | GS Feature: Batch Push |

**Depends on:** Wave 4 (all endpoints exist).
**Result:** Full test coverage.

---

## Wave 6 — Documentation + Handoff (Phase F — parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| F1 | Update memory bank: short ID pattern, batch partial-success, source detection, external_ref JSONB, routing precedence | Small | — |
| F2 | Notify downstream: Feature 12 (OutputNormalizerService stub ready), Feature 19 (POST schema final), Feature 27 (endpoint contracts available) | Small | — |

**Depends on:** Wave 5.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Foundation: DB + Utilities + DAL)
  |
  v
Wave 2 (Core: POST, GET list, GET detail, PATCH)  --- MILESTONE: 4 endpoints
  |
  v
Wave 3 (Approve, Reject parallel | Push sequential chain)
  |
  v
Wave 4 (Batch Approve, Batch Push)  --- MILESTONE: All 9 endpoints
  |
  v
Wave 5 (Unit + Integration Tests)
  |
  v
Wave 6 (Docs + Handoff)
```

---

## Key Decisions

- **Original Phase A-F structure retained:** The 6-phase grouping is already well-organized with clear dependencies.
- **Critical path identified:** C3 → C4 → C5 → D3 → D4 is the longest sequential chain and determines minimum completion time for implementation phases.
- **Routing precedence:** Batch routes (`/tasks/approve`, `/tasks/push`) MUST be registered BEFORE parameterized routes (`/tasks/:taskId`) to avoid routing conflicts.
- **OutputNormalizerService stub:** Feature 12 replaces this stub; the interface contract (TR.md Section 12) must be stable before Feature 12 begins.
- **external_ref JSONB:** Replaces `asana_task_id VARCHAR` — the JSONB shape supports future adapter systems (Jira, Linear).
- **Partial-success batch model:** Batch operations always return 200 with per-item results; individual failures don't abort the batch.
- **No scope changes:** All 32 original tasks preserved.
