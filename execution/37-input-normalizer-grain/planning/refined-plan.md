# Refined Plan
# Feature 37: Input Normalizer -- Grain

**Status:** Approved
**Complexity:** Medium (21 tasks, 7 phases + 2 prerequisites)
**Sub-Agent Delegation:** Yes (HTTP Client stream || Normalizer Core stream in Wave 2)

---

## Pre-Condition Gates

| Gate | Status | Impact |
|---|---|---|
| Feature 08 (NormalizedTranscript interface) merged | Required | Grain adapter must implement this shared interface |
| Feature 10 (Transcript endpoints) merged | Required | Import route calls the normalizer |
| Grain API stability | Unknown | API released Dec 2025, may have breaking changes |

---

## Wave Structure

### Wave 1 -- Foundation (3 tasks, sequential)

- Define Grain-specific types in `packages/shared-types/`
- Create module directory structure (`apps/api/src/normalizers/grain/`)
- Configure Grain API key in GCP Secret Manager reference

---

### Wave 2 -- Core Implementation (2 parallel streams)

**Sub-agent delegation recommended:**

**Stream A -- HTTP Client (3 tasks):**
- Implement Grain HTTP client (`grain-client.ts`)
- Pagination handling for recording lists
- Rate limiting and retry logic
- Unit tests

**Stream B -- Normalizer Core (3 tasks):**
- Implement `normalizeGrainTranscript()` pure function
- Segment mapping (Grain format -> NormalizedTranscript segments)
- Speaker identification and timestamp normalization
- Unit tests

**These are independent:** HTTP client fetches raw data, normalizer transforms it. No shared state.

---

### Wave 3 -- Integration (2 tasks, sequential)

- Wire HTTP client + normalizer into the submission handler
- Implement `POST /transcripts/grain` endpoint (or integrate into existing transcript creation flow)

---

### Wave 4 -- Error Handling (2 tasks)

- Grain API error mapping (401, 403, 404, 429, 500 -> internal error codes)
- Input validation (recording ID format, playlist ID validation)

---

### Wave 5 -- Integration Tests (3 tasks)

- Mock Grain API server for testing
- End-to-end: submit Grain recording -> normalized transcript in DB
- Edge cases: empty transcript, missing speakers, pagination

---

### Wave 6 -- Feature Flag + API Integration (2 tasks)

- Feature flag for Grain adapter (`GRAIN_ADAPTER_ENABLED`)
- Register Grain normalizer in the adapter registry

---

### Wave 7 -- Validation (2 tasks)

- Verify NormalizedTranscript output matches Feature 08 interface exactly
- Performance: normalize 100 recordings within acceptable time

---

## Incremental Build Strategy

| After Wave | Working State |
|---|---|
| Wave 1 | Types defined, directory structure ready |
| Wave 2 | HTTP client fetches from Grain; normalizer transforms data (independently testable) |
| Wave 3 | End-to-end: Grain recording -> normalized transcript stored |
| Wave 4 | Robust error handling for all Grain API failure modes |
| Wave 5 | Full test coverage with mocked Grain API |
| Wave 6 | Feature-flagged for safe deployment |
| Wave 7 | All validations pass |

---

## Key Technical Notes

1. **Follows established normalizer pattern** from Feature 08. The Grain adapter is a new implementation of the same interface.
2. **Pure function core** -- `normalizeGrainTranscript()` is a stateless transform, easy to test.
3. **HTTP client is reusable** -- Feature 38 (Historical Import) will call the same Grain client.
4. **Grain API released Dec 2025** -- requires Business plan. API stability unknown.
5. **Tests co-located with implementation** rather than deferred to a separate phase.
6. **Secret management** -- Grain API key stored in GCP Secret Manager, injected at runtime.

---

## Path Management

- task_list_file: `execution/37-input-normalizer-grain/docs/task-list.md`
- input_folder: `execution/37-input-normalizer-grain`
- planning_folder: `execution/37-input-normalizer-grain/planning`
