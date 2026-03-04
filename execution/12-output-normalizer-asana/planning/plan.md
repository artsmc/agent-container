# Execution Plan
# Feature 12: Output Normalizer — Asana Adapter

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/12-output-normalizer-asana
- **planning_folder:** execution/12-output-normalizer-asana/planning
- **task_list_file:** execution/12-output-normalizer-asana/task-list.md

---

## Summary

~45 tasks across 14 original phases, reorganized into 7 waves. Implements the Asana OutputAdapter — a pluggable adapter that transforms NormalizedTask data into Asana API payloads and pushes tasks to Asana with retry logic. Contains 7 self-contained sub-modules: description formatter, estimated time formatter, workspace router, assignee resolver, custom field resolver, Asana HTTP client, and adapter orchestrator. Single agent execution.

**Biggest parallelism opportunity:** Wave 3 contains 4 fully independent sub-modules (description formatter, estimated time formatter, assignee resolver, custom field resolver) that can be built simultaneously.

---

## Wave 1 — Shared Types + Database Migration (parallel)

### Stream A — Shared Types

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.1 | Confirm/add shared types to @iexcel/shared-types: NormalizedTask, OutputAdapter, ExternalRef, AsanaExternalRef, CustomFieldGidConfig, ApiErrorCode | Small | FRS FR-01, FR-60; TR.md Section 2.2, 2.3 |
| 1.2 | Verify TypeScript compiles: `nx run shared-types:build` | Small | — |

### Stream B — Database Migration

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 2.1 | Confirm/create tasks.external_ref JSONB migration (coordinate with Feature 11) | Small | TR.md Section 11.2 |
| 2.2 | Create asana_workspaces.custom_field_config JSONB migration | Small | TR.md Section 11.1, FRS FR-30 |
| 2.3 | Run migrations against dev DB | Small | — |
| 2.4 | Verify schema changes in psql | Small | — |

**Result:** Types and DB schema ready.

---

## Wave 2 — Module Directory + Error Infrastructure + Workspace Router (parallel)

### Stream A — Infrastructure

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 3.1 | Create adapter module directory: apps/api/src/adapters/asana/ and __tests__/ | Small | TR.md Section 1.3 |
| 3.2 | Create AdapterError class in errors.ts | Small | FRS FR-70; TR.md Section 2.4 |
| 3.3 | Verify AdapterError compiles | Small | — |

### Stream B — Workspace Router (can start once 3.2 exists for AdapterError)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 5.1 | Create workspace-router.ts | Small | TR.md Section 5 |
| 5.2 | Define ResolvedRouting interface | Small | — |
| 5.3 | Implement resolveRouting(task, db) with cascade: task override → client default → error | Medium | FRS FR-10 to FR-12, FR-32 |
| 5.4 | Unit tests for workspace router (4 scenarios) | Small | TR.md Section 12.3 |
| 5.5 | Verify tests pass | Small | — |

**Depends on:** Wave 1 (types + DB ready).
**Result:** Error infrastructure and workspace routing ready.

---

## Wave 3 — Four Independent Sub-Modules (all parallel)

All 4 sub-modules are pure functions or isolated HTTP clients with no dependencies on each other.

### Sub-Module A — Description Formatter

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 4.1 | Implement parseSections() and formatDescriptionForAsana() | Small | FRS FR-21; TR.md Section 3 |
| 4.2 | Unit tests (4 scenarios) | Small | TR.md Section 12.1 |
| 4.3 | Verify tests pass | Small | — |

### Sub-Module B — Estimated Time Formatter

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 4.4 | Implement formatEstimatedTime(interval, format) | Small | FRS FR-25; TR.md Section 4 |
| 4.5 | Unit tests (6 scenarios) | Small | TR.md Section 12.2 |
| 4.6 | Verify tests pass | Small | — |

### Sub-Module C — Assignee Resolver

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 6.1 | Create assignee-resolver.ts | Small | TR.md Section 7 |
| 6.2 | Implement in-memory member cache with 15-minute TTL | Small | — |
| 6.3 | Implement getWorkspaceMembers() with cache | Small | — |
| 6.4 | Implement resolveAssigneeGid() with 3-tier matching (exact, case-insensitive, email) | Medium | FRS FR-22, FR-40 |
| 6.5 | Unit tests (7 scenarios including cache TTL) | Medium | TR.md Section 12.4 |
| 6.6 | Verify tests pass | Small | — |

### Sub-Module D — Custom Field Resolver

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 7.1 | Create custom-field-resolver.ts | Small | TR.md Section 8 |
| 7.2 | Implement in-memory enum option cache with 5-minute TTL | Small | — |
| 7.3 | Implement getEnumOptions() with cache | Small | — |
| 7.4 | Implement resolveEnumOptionGid() with case-insensitive matching | Small | FRS FR-23, FR-24, FR-31 |
| 7.5 | Unit tests (5 scenarios including cache TTL) | Small | TR.md Section 12.5 |
| 7.6 | Verify tests pass | Small | — |

**Depends on:** Wave 2 (directory + AdapterError exist).
**Result:** All 4 helper sub-modules complete with tests.

---

## Wave 4 — Asana HTTP Client (sequential)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 8.1 | Create asana-client.ts | Small | TR.md Section 6 |
| 8.2 | Implement fetchWithTimeout() using AbortController | Small | FRS FR-45 |
| 8.3 | Add p-retry to apps/api/package.json (if not present) | Small | — |
| 8.4 | Implement createTaskWithRetry() with retry logic: non-retryable 4xx (except 429), retryable 429/5xx, Retry-After header | Medium | FRS FR-43, FR-44 |
| 8.5 | Export createTaskWithRetry and AsanaCreateTaskPayload | Small | — |
| 8.6 | Unit tests (8 scenarios: success, auth errors, retry, exhaustion, timeout) | Medium | TR.md Section 12.6 |
| 8.7 | Verify tests pass | Small | — |

**Depends on:** Wave 2 (AdapterError exists).
**Note:** Can run in parallel with Wave 3 sub-modules.
**Result:** Asana HTTP client ready with retry logic.

---

## Wave 5 — Adapter Orchestration + Public Export (sequential)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 9.1 | Create adapter.ts | Small | TR.md Section 9 |
| 9.2 | Implement AsanaOutputAdapter class with push() method orchestrating all sub-modules | Large | FRS FR-20 to FR-26, FR-80 |
| 9.3 | Title validation at push() entry point | Small | FRS FR-20 |
| 9.4 | Verify no shared mutable state (thread-safe for concurrent calls) | Small | FRS FR-50 |
| 10.1 | Create index.ts — export AsanaOutputAdapter and AdapterError only | Small | TR.md Section 1.3 |

**Depends on:** Waves 3 and 4 (all sub-modules + HTTP client).
**Result:** MILESTONE — Adapter fully functional.

---

## Wave 6 — Integration Tests + API Wiring (parallel)

### Stream A — Integration Tests

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 11.1 | Set up HTTP mocking (msw or nock) | Small | — |
| 11.2 | Create adapter.integration.test.ts with mock DatabaseService | Medium | TR.md Section 12.6 |
| 11.3 | Happy path tests (full push, null assignee, unknown client name) | Medium | — |
| 11.4 | Workspace routing integration tests (task override, client default, not configured) | Medium | FRS FR-10, FR-11 |
| 11.5 | Error handling tests (401, 403, 404, 400) | Medium | FRS FR-43 |
| 11.6 | Retry tests (429 retry, 503 exhausted, timeout) | Medium | FRS FR-44, FR-45 |
| 11.7 | Concurrent push isolation test | Small | FRS FR-51 |
| 11.8 | Verify all integration tests pass | Small | — |

### Stream B — API Handler Wiring

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 12.1 | Register AsanaOutputAdapter in DI container | Small | TR.md Section 10.2 |
| 12.2 | Replace Feature 11's push handler stub with real adapter call | Small | FRS FR-60, FR-61 |

**Depends on:** Wave 5 (adapter exists).
**Result:** Full integration test coverage + adapter wired into API.

---

## Wave 7 — Security Verification + Final Checks (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 13.1 | Review: no access tokens in any log output | Small | TR.md Section 14.1 |
| 13.2 | Review: no task content in log output (only structural metadata) | Small | FRS FR-80 |
| 13.3 | Review: PUSH_FAILED details don't contain tokens or descriptions | Small | TR.md Section 14.1, 14.2 |
| 14.1 | Run full API test suite: `nx run api:test` | Small | — |
| 14.2 | Run TypeScript type check: `nx run api:type-check` | Small | — |
| 14.3 | Verify AsanaOutputAdapter satisfies OutputAdapter interface | Small | — |
| 14.4 | Verify ExternalRef matches AsanaExternalRef shape | Small | — |
| 14.5 | Verify push() never writes to DB directly | Small | — |
| 14.6 | Verify workspace routing cascade order | Small | — |
| 14.7 | Verify all 3 custom fields in happy path payload | Small | — |
| 14.8 | Verify scrumStage defaults to "Backlog" when null | Small | — |
| 14.9 | Verify notes field has no ** bold markers | Small | — |
| 14.10 | Verify DB migrations included and non-conflicting | Small | — |

**Depends on:** Wave 6.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Types + DB Migration)
  |
  v
Wave 2 (Directory + Errors + Workspace Router)
  |
  +---+---+---+---+
  |   |   |   |   |
  v   v   v   v   |
Wave 3A 3B 3C 3D  |    (4 independent sub-modules)
  |   |   |   |   |
  +---+---+---+   |
       |          |
       |    Wave 4 (Asana HTTP Client — parallel with Wave 3)
       |          |
       +----+-----+
            |
            v
      Wave 5 (Adapter Orchestration)  --- MILESTONE: Adapter complete
            |
            v
      Wave 6 (Integration Tests + API Wiring)
            |
            v
      Wave 7 (Security + Final Verification)
```

---

## Key Decisions

- **Single agent execution:** All 7 sub-modules are backend TypeScript with no UI component.
- **Biggest parallelism in Wave 3:** 4 independent sub-modules (description formatter, estimated time formatter, assignee resolver, custom field resolver) can be built simultaneously, significantly reducing wall-clock time.
- **Wave 4 parallel with Wave 3:** The Asana HTTP client only depends on AdapterError from Wave 2, not on Wave 3 sub-modules.
- **No scope changes:** All ~45 original tasks preserved.
- **Adapter never writes to DB:** push() returns ExternalRef; database write is Feature 11's responsibility.
- **Cache TTLs:** Member cache = 15 minutes, enum option cache = 5 minutes (both in-memory Maps).
- **p-retry for retries:** Exponential back-off with Retry-After header support for 429 responses.
- **Custom field omission:** If enum GID resolution fails, the field is omitted from the payload (not set to null).
