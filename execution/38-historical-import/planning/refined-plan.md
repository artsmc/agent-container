# Refined Plan
# Feature 38: Historical Import

**Status:** Approved
**Complexity:** High (37 tasks, 11 phases + 4 prerequisite gates)
**Sub-Agent Delegation:** Yes (2 sub-agents for transcript vs. task import phases in Wave 3)

---

## Pre-Condition Gates (all discovery, resolve in parallel)

| Gate | Status | Impact |
|---|---|---|
| Feature 04 migration scope | Unknown | Determines whether Phase 2 includes ALTER TABLE for is_imported columns or just new tables |
| Feature 37 Grain adapter merged | Unknown | Blocks transcript import phase entirely |
| Feature 17 job queue infrastructure | Unknown | Determines async execution pattern (BullMQ, pg-boss, or in-process) |
| Grain playlist listing capability | Unknown | Determines whether fetchGrainRecordingIds uses API or fallback recording ID array |

---

## Dependencies

- **Blocked by:** Features 09, 10, 12 (client management, transcript endpoints, Asana adapter)
- **Blocks:** Nothing (leaf node)

---

## Wave Structure

### Wave 0 -- Prerequisites (4 tasks, all parallel)

Resolve all 4 discovery gates simultaneously. No code changes, just fact-finding:
1. Check Feature 04 for existing is_imported columns
2. Verify Feature 37 Grain adapter availability
3. Identify Feature 17 job queue mechanism
4. Clarify Grain playlist listing API capability

---

### Wave 1 -- Foundation (6 tasks, sequential)

**Phase 1: Shared Types (2 tasks)**
- Add `IMPORT_RECORD_READ_ONLY` to `ApiErrorCode` in `packages/shared-types/`
- Add `IMPORT_IN_PROGRESS` and `IMPORT_JOB_NOT_FOUND` to `ApiErrorCode`

**Phase 2: Database Migration (4 tasks)**
- Create `import_jobs` table (FR-80 schema + indexes)
- Create `import_job_errors` table (FR-81 schema + index)
- Conditional ALTER TABLE for `is_imported`, `imported_at`, `import_source` on transcripts/tasks/agendas (if not in Feature 04)
- Create idempotency indexes (partial indexes on transcripts + expression index on tasks)

---

### Wave 2 -- Data Layer + Service (5 tasks, sequential)

**Phase 3: Repository (2 tasks)**
- Implement `import-jobs-repository.ts` with atomic counter increments
- Unit tests for repository

**Phase 4: Service (3 tasks)**
- Implement `import-job-service.ts` (validation, workspace resolution, job creation)
- Implement concurrency guard (SELECT FOR UPDATE)
- Unit tests for service

---

### Wave 3 -- Job Runner Phases (PARALLEL OPPORTUNITY, 9 tasks)

**Sub-agent delegation recommended:**

**Stream A -- Transcript Import Phase (4 tasks):**
- `fetchGrainRecordingIds` function (isolated, swappable)
- Transcript idempotency check (`client_id + grain_call_id + is_imported`)
- Transcript import loop (normalize, insert, increment counter, per-record error handling)
- Unit tests for transcript phase

**Stream B -- Task Import Phase (5 tasks):**
- `fetchAsanaTasks` function (paginated Asana API)
- Asana status mapping (`completed=true` -> `completed`, `completed=false` -> `pushed`)
- Task idempotency check (`client_id + external_ref->>'externalId' + is_imported`)
- Task import loop (construct external_ref JSONB, insert, increment counter)
- Unit tests for task phase

**These are independent:** Different tables, different adapters, different sections of the runner file.

---

### Wave 4 -- Reprocessing + Routes (5 tasks, 2 parallel streams)

**Stream A -- Mastra Reprocessing (2 tasks):**
- Implement reprocessing phase (POST /workflows/intake per transcript, flag resulting tasks)
- Unit tests

**Stream B -- API Routes (3 tasks):**
- `POST /clients/{id}/import` handler (202 Accepted, auth middleware, error codes)
- `GET /clients/{id}/import/status` handler (progress from import_jobs, error_details from import_job_errors, limit 100)
- Register routes in API router

---

### Wave 5 -- Read-Only Enforcement (8 tasks, single stream)

All follow identical pattern: `if (record.is_imported) throw ApiError('IMPORT_RECORD_READ_ONLY', 422)`

- `PATCH /tasks/:id`
- `POST /tasks/:id/approve`
- `POST /tasks/:id/reject`
- `POST /tasks/:id/push`
- `PATCH /agendas/:id`
- `POST /agendas/:id/finalize`
- `POST /agendas/:id/share`
- Include `is_imported` in GET response bodies

**All Small tasks, repetitive pattern.** Single agent can handle efficiently.

---

### Wave 6 -- Integration Tests + Deployment (7 tasks)

**Integration Tests (5 tasks):**
- POST /import endpoint tests (202, 409, 400, 422, 403, 404)
- GET /import/status tests (progress, completed, failed, most-recent default, job_id override)
- Full import flow E2E (POST -> runner executes -> status shows completed -> verify DB records)
- Read-only enforcement tests (all 7 endpoints return 422 for imported records)
- Partial recovery test (fail at record 5, restart, only 6-10 imported)

**Deployment Preparation (2 tasks):**
- Stuck job detection (mark jobs > 30 min with no progress as failed)
- `HISTORICAL_IMPORT_ENABLED` feature flag

---

## Incremental Build Strategy

| After Wave | Working State |
|---|---|
| Wave 0 | All gates resolved, no unknowns |
| Wave 1 | DB schema ready, error codes available |
| Wave 2 | Can create/query import jobs, concurrency guard works |
| Wave 3 | Job runner can import transcripts OR tasks end-to-end |
| Wave 4 | Full API endpoints functional, reprocessing works |
| Wave 5 | Imported records are properly read-only |
| Wave 6 | Integration tests pass, monitoring in place |

---

## Key Technical Risks

1. **Job queue mechanism unknown** -- If Feature 17 used BullMQ, runner integration is straightforward. If in-process, needs careful crash handling.
2. **Grain playlist API may not exist** -- Forces fallback to explicit recording IDs, changing POST endpoint UX.
3. **Feature 37 not merged** -- Blocks transcript phase. Task phase can proceed independently.
4. **Cross-feature read-only enforcement** -- Modifying 7 existing endpoint handlers from Features 09/10/11. Must not break existing tests.

---

## Key Technical Notes

1. **Async job model** -- POST returns 202 immediately, job runs in background, client polls GET for status.
2. **Idempotency via DB queries** -- Skip records already imported (grain_call_id for transcripts, external_ref->>'externalId' for tasks).
3. **Per-record vs. catastrophic failure** -- Per-record errors logged and import continues. Catastrophic (e.g., API key invalid) marks job as `failed`.
4. **Atomic counter updates** -- `SET transcripts_imported = transcripts_imported + 1` after each record, not batched.
5. **Concurrency guard** -- `SELECT FOR UPDATE` prevents two simultaneous imports for same client.
6. **external_ref JSONB** follows Feature 01/12 naming convention: `system`, `externalId`, `externalUrl`.

---

## Path Management

- task_list_file: `execution/38-historical-import/docs/task-list.md`
- input_folder: `execution/38-historical-import`
- planning_folder: `execution/38-historical-import/planning`
