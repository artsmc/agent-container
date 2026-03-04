# Execution Plan
# Feature 10: Transcript Endpoints

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/10-transcript-endpoints
- **planning_folder:** execution/10-transcript-endpoints/planning
- **task_list_file:** execution/10-transcript-endpoints/task-list.md

---

## Summary

30 tasks across 9 original phases, reorganized into 7 waves. Three REST endpoints (POST submit transcript, GET list transcripts, GET transcript detail) with file upload support, text normalization pipeline, audit logging, and comprehensive test coverage. Single agent execution.

**Critical pre-work:** Task 9.3 (resolve open technical questions from TR.md Section 12) is moved to Wave 1 as the FIRST task, since answers to Q1 (does Feature 04 define `transcripts` table?), Q2 (API framework?), and Q5 (is `getClientById()` exported?) directly affect implementation of all subsequent waves.

---

## Wave 1 — Resolve Open Questions + Database Migration (sequential then parallel)

### Stream A — Open Questions (FIRST)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 9.3 | Resolve the five open technical questions from TR.md Section 12. Key: Q1 (transcripts table existence), Q2 (API framework), Q5 (getClientById export). Document decisions inline. | Small | TR.md Section 12 |

### Stream B — Database (after 9.3)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.1 | Confirm/create `transcripts` table and `call_type_enum` per TR.md Section 3.1 | Medium | TR.md Section 3.1 |
| 1.2 | Confirm/create `transcripts(client_id, call_date DESC)` composite index | Small | TR.md Section 4 |

**Result:** Open questions resolved, database schema ready.

---

## Wave 2 — Shared Types + Validation Schemas (all parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 2.1 | Verify `NormalizedTranscript` and `TranscriptSegment` types in `@iexcel/shared-types` | Small | TR.md Section 9.1 |
| 2.2 | Define `TranscriptRecord` and `TranscriptSummary` types | Small | TR.md Sections 2.1, 2.2 |
| 2.3 | Define `PostTranscriptJsonBody` Zod validation schema | Small | FRS Section 1.2 |
| 2.4 | Define `ListTranscriptsQuery` validation schema | Small | FRS Section 2.2 |

**Depends on:** Wave 1 (need to know framework for schema choice).
**Result:** All types and validation schemas defined.

---

## Wave 3 — Repository Layer (all parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 3.1 | Implement `insertTranscript(params)` — INSERT RETURNING * | Small | TR.md Section 2.1 |
| 3.2 | Implement `listTranscripts(params)` — summary query + COUNT concurrent | Medium | TR.md Section 2.2 |
| 3.3 | Implement `getTranscriptById(transcriptId)` — full row SELECT | Small | TR.md Section 2.3 |

**Depends on:** Wave 2 (types must exist).
**Result:** All database query functions ready.

---

## Wave 4 — Route Handlers + Audit Integration (mostly parallel)

### Stream A — Audit Setup

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 5.1 | Confirm/implement `writeAuditLog(entry)` utility | Small | TR.md Section 5 |

### Stream B — Handlers (parallel, after 5.1 for POST handler)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 4.1 | POST /clients/:clientId/transcripts — full handler with file upload, normalization, audit | Large | FRS Section 1.3, TR.md Section 2.1 |
| 4.2 | GET /clients/:clientId/transcripts — list with pagination and filtering | Medium | FRS Section 2, TR.md Section 2.2 |
| 4.3 | GET /transcripts/:transcriptId — detail with existence hiding | Small | FRS Section 3, TR.md Section 2.3 |
| 4.4 | Register all routes in transcripts/index.ts | Small | TR.md Section 11 |
| 5.2 | Integrate audit log into POST handler with metadata assembly | Small | TR.md Section 5.3 |

**Depends on:** Wave 3 (repository layer).
**Result:** MILESTONE — All 3 endpoints functional with audit logging.

---

## Wave 5 — Error Verification + Unit Tests (all parallel)

### Error Verification

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 6.1 | Verify standard error format across all handlers | Small | TR.md Section 6 |
| 6.2 | Verify 404 (not 403) for inaccessible resources | Small | TR.md Section 7.2 |

### Unit Tests

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 7.1 | UUID format validation tests | Small | TR.md Section 10.1 |
| 7.2 | call_type enum validation tests | Small | TR.md Section 10.1 |
| 7.3 | call_date ISO 8601 validation tests | Small | TR.md Section 10.1 |
| 7.4 | File type detection tests | Small | TR.md Section 10.1 |
| 7.5 | File size limit tests (5 MB boundary) | Small | TR.md Section 10.1 |
| 7.6 | Audit metadata assembly tests | Small | TR.md Sections 5.3, 7.1 |
| 7.7 | to_date boundary logic tests | Small | TR.md Section 2.2 |

**Depends on:** Wave 4 (handlers exist).
**Result:** Unit tests + error format verified.

---

## Wave 6 — Integration Tests (seed first, then parallel)

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| 1 | 8.1 | Seed DB: 2 clients, 4 users, client_users, 5+ transcripts | Medium | TR.md Section 10.3 |
| 2 (parallel) | 8.2 | POST integration tests (16 scenarios) | Large | GS "Submit Transcript" |
| 2 (parallel) | 8.3 | GET list integration tests (12 scenarios) | Large | GS "List Transcripts" |
| 2 (parallel) | 8.4 | GET detail integration tests (9 scenarios) | Large | GS "Get Transcript Detail" |
| 2 (parallel) | 8.5 | Audit log NOT written on failed POST | Small | FRS Section 6 |

**Depends on:** Wave 4 (handlers exist).
**Note:** Waves 5 and 6 can run concurrently.
**Result:** Full integration coverage.

---

## Wave 7 — Documentation + Wrap-Up (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 9.1 | Confirm `/job-queue` in .gitignore | Small | — |
| 9.2 | Update execution/job-queue/index.md — Feature 10 status to complete | Small | — |

**Depends on:** Waves 5, 6.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Open Questions → DB Migration)
  |
  v
Wave 2 (Types + Validation Schemas)
  |
  v
Wave 3 (Repository Layer — 3 functions)
  |
  v
Wave 4 (Route Handlers + Audit) --- MILESTONE: Working API
  |         |
  v         v
Wave 5    Wave 6
(Unit)    (Integration)
  |         |
  +----+----+
       |
       v
  Wave 7 (Docs + Wrap-Up)
```

---

## Key Decisions

- **Task 9.3 moved to Wave 1:** Open technical questions (especially Q1, Q2, Q5) must be resolved before any implementation begins. Their answers determine migration needs, framework choice, and service function availability.
- **Single agent execution:** All work is backend CRUD + file upload handling with no UI component.
- **No scope changes:** All 30 original tasks preserved; only reordered.
- **Existence hiding:** Both client-scoped and transcript-scoped endpoints return 404 (not 403) for inaccessible resources.
- **File upload constraints:** text/plain only, 5 MB max, UTF-8 decode, mutual exclusion with raw_transcript JSON field.
- **Waves 5 and 6 run concurrently:** Unit tests and integration tests have no dependency on each other.
