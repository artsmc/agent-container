# Execution Plan
# Feature 09: Client Management

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/09-client-management
- **planning_folder:** execution/09-client-management/planning
- **task_list_file:** execution/09-client-management/task-list.md

---

## Summary

28 tasks reorganized from 7 phases into 6 waves. Four REST endpoints (`GET /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `GET /clients/:id/status`) with role-based permission scoping, PATCH validation, audit logging, and comprehensive integration tests. Single agent execution — all backend CRUD with shared permission patterns.

---

## Wave 1 — Types, Validation, DB Checks (3 parallel streams)

### Stream A — Database Verification

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.1 | Confirm `client_users` join table exists (create migration if needed) | Small | TR.md 3.2 |
| 1.2 | Confirm required indexes exist (create if missing) | Small | TR.md 4 |

### Stream B — TypeScript Types

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.3 | Define `ClientRecord` type in shared-types | Small | TR.md 2.2, FRS 2.3 |
| 1.4 | Define `EmailRecipient` type | Small | TR.md 2.2 |
| 1.6 | Define `ClientStatusResponse` + `AgendaSummary` types | Small | TR.md 2.4 |

### Stream C — Validation Schema

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.5 | Define PATCH body Zod validation schema | Medium | FRS 3.2, TR.md 2.3 |

**Result:** All types, schemas, and DB structure verified.

---

## Wave 2 — Database Query Layer (6 tasks, parallel)

All functions can be implemented in parallel — they touch different tables/patterns.

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 2.1 | `listClients(userId, role, page, perPage)` — scoped listing + pagination | Medium | TR.md 2.1, FRS 1.2 |
| 2.2 | `getClientById(clientId, userId, role)` — single lookup + access check | Medium | TR.md 2.2, FRS 2 |
| 2.3 | `updateClient(clientId, patchBody)` — partial update + `updated_at` | Medium | TR.md 2.3, FRS 3 |
| 2.4 | `getClientTaskCounts(clientId)` — GROUP BY status aggregation | Small | TR.md 2.4 |
| 2.5 | `getMostRecentAgenda(clientId)` — ORDER BY updated_at DESC LIMIT 1 | Small | TR.md 2.4 |
| 2.6 | `writeAuditLog(entry)` — audit_log insert | Small | TR.md 5 |

**Depends on:** Wave 1 (types).
**Result:** All DB functions ready.

---

## Wave 3 — Route Handlers (4 tasks, parallel)

All handlers can be built in parallel — they use separate DB functions and don't depend on each other.

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 3.1 | `GET /clients` — list with pagination + role scoping | Medium | FRS 1, GS "List Clients", TR.md 2.1 |
| 3.2 | `GET /clients/:id` — detail with access check | Small | FRS 2, GS "Get Client Detail", TR.md 2.2 |
| 3.3 | `PATCH /clients/:id` — update + role check + audit + diff | Large | FRS 3, GS "Update Client Configuration", TR.md 2.3/5 |
| 3.4 | `GET /clients/:id/status` — concurrent task + agenda queries | Medium | FRS 4, GS "Get Client Status", TR.md 2.4 |

**Depends on:** Wave 2 (all DB functions).
**Result:** MILESTONE — All 4 endpoints functional.

---

## Wave 4 — Error Verification + Unit Tests (parallel)

All tasks can run in parallel.

### Error Verification

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 4.1 | Verify standard error format across all handlers | Small | TR.md 6 |
| 4.2 | Verify 404 (not 403) for inaccessible clients | Small | TR.md 7.1 |

### Unit Tests

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 5.1 | PATCH body validation schema tests | Medium | GS "Update" errors, FRS 3.5 |
| 5.2 | `changed_fields` diff logic tests | Small | TR.md 5.3 |
| 5.3 | Task count aggregation tests | Small | TR.md 2.4 |
| 5.4 | `is_ready_to_share` derivation tests | Small | FRS 4.3 |
| 5.5 | UUID validation tests | Small | FRS 2.5, 4.5 |

**Depends on:** Wave 3 (handlers exist).
**Result:** Unit tests + error format verified.

---

## Wave 5 — Integration Tests (seed first, then parallel)

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| 1 | 6.1 | Seed DB: 3 clients, 3 users (1/role), client_users, tasks, agendas | Medium | TR.md 10.3 |
| 2 (parallel) | 6.2 | `GET /clients` integration — role matrix + pagination | Medium | GS "List Clients" |
| 2 (parallel) | 6.3 | `GET /clients/:id` integration — role x access scenarios | Medium | GS "Get Client Detail" |
| 2 (parallel) | 6.4 | `PATCH /clients/:id` integration — full validation + audit | Large | GS "Update Client Configuration" |
| 2 (parallel) | 6.5 | `GET /clients/:id/status` integration — counts + agenda | Medium | GS "Get Client Status" |
| 2 (parallel) | 6.6 | Verify audit log NOT written on failed PATCH | Small | GS "Team Member" scenario |

**Depends on:** Wave 3 (handlers exist).
**Note:** Waves 4 and 5 can run concurrently.
**Result:** Full integration coverage.

---

## Wave 6 — Documentation + Wrap-Up (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 7.1 | Add `/job-queue` to `.gitignore` | Small | — |
| 7.2 | Update feature status to complete | Small | — |
| 7.3 | Resolve open technical questions from TR.md 11 | Small | TR.md 11 |

**Depends on:** Waves 4, 5.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Types + Validation + DB Checks)
  |
  v
Wave 2 (DB Query Layer — 6 functions)
  |
  v
Wave 3 (Route Handlers — 4 endpoints) --- MILESTONE: Working API
  |         |
  v         v
Wave 4    Wave 5
(Unit)    (Integration)
  |         |
  +----+----+
       |
       v
  Wave 6 (Docs + Wrap-Up)
```

---

## Key Decisions

- **Single agent execution:** All backend CRUD with shared permission patterns.
- **No scope changes:** All 28 original tasks preserved.
- **Client-user assignment endpoints excluded:** FRS Section 5 (GET/POST/DELETE /clients/{id}/users) is out of scope per context.md.
- **404 not 403 for inaccessible clients:** Prevents existence leakage (TR.md 7.1).
- **`pending_approval` aliases `draft` in V1:** Per FRS 4.3 and TR.md 2.4.
- **`next_call` always null in V1:** Reserved for future calendar integration.
- **Concurrent queries in status endpoint:** `getClientTaskCounts` and `getMostRecentAgenda` run via `Promise.all` (TR.md 8.2).
