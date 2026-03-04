# Task List — Feature 10: Transcript Endpoints

## Prerequisites

Before starting any task in this list, confirm the following are complete:

- [ ] Feature 07 (api-scaffolding) is merged: the API server is running, middleware chain exists, `req.user` is populated by token validation, and the multipart plugin is configured.
- [ ] Feature 08 (input-normalizer-text) is merged: `normalizeTextTranscript()` is exported and tested.
- [ ] Feature 09 (client-management) is merged: `getClientById(clientId, userId, role)` is available as an internal service function.
- [ ] Feature 04 (product-database-schema) is merged: `clients`, `users`, `client_users`, and `audit_log` tables exist.
- [ ] Feature 01 (shared-types-package) is merged (or in progress): `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, `TranscriptSource` types are available.

---

## Phase 1: Database Migration

- [ ] **1.1** Confirm whether Feature 04 defines the `transcripts` table and `call_type_enum`. If not, write and apply a migration that creates them per TR.md Section 3.1:
  - `CREATE TYPE call_type_enum AS ENUM ('client_call', 'intake', 'follow_up')`
  - `CREATE TABLE transcripts (id, client_id, grain_call_id, call_type, call_date, raw_transcript, normalized_segments JSONB NOT NULL, processed_at, created_at, is_imported, imported_at, import_source)`
  - FK: `client_id REFERENCES clients(id) ON DELETE RESTRICT`
  - References: TR.md — Section 3.1
  - Size: Medium

- [ ] **1.2** Confirm that the `transcripts(client_id, call_date DESC)` composite index exists. If not, create a migration to add it.
  - References: TR.md — Section 4
  - Size: Small

---

## Phase 2: Shared Types

- [ ] **2.1** Verify that `NormalizedTranscript` and `TranscriptSegment` types are exported from `@iexcel/shared-types` (Feature 01). If they are not yet defined, add them with the shape documented in TR.md Section 3.2.
  - References: TR.md — Section 9.1, Feature 08 TR.md Section 2.2
  - Size: Small (coordinate with Feature 01/08 implementer)

- [ ] **2.2** Define the `TranscriptRecord` TypeScript type (full response shape) and the `TranscriptSummary` type (list response shape — excludes `raw_transcript` and `normalized_segments`) in the shared-types package or within `apps/api/src/routes/transcripts/`.
  - References: TR.md — Sections 2.1, 2.2, FRS Sections 1.4, 2.4
  - Size: Small

- [ ] **2.3** Define the `PostTranscriptJsonBody` validation schema using Zod (if Node.js/Fastify) or a Pydantic model (if Python/FastAPI). Cover: `raw_transcript` (optional string), `call_type` (enum, required), `call_date` (ISO 8601 string, required). Mutual exclusion between `raw_transcript` and file upload is enforced in the handler, not the schema.
  - References: FRS Section 1.2, TR.md Section 2.1
  - Size: Small

- [ ] **2.4** Define the `ListTranscriptsQuery` validation schema covering `page`, `per_page`, `call_type`, `from_date`, `to_date` with their defaults and constraints.
  - References: FRS Section 2.2, TR.md Section 2.2
  - Size: Small

---

## Phase 3: Repository Layer

- [ ] **3.1** Implement `insertTranscript(params)` in `transcript-repository.ts`:
  - Accepts: `{ clientId, callType, callDate, rawTranscript, normalizedSegments }`.
  - Executes: `INSERT INTO transcripts (...) VALUES (...) RETURNING *`.
  - Returns the full inserted row as a `TranscriptRecord`.
  - References: TR.md — Section 2.1, FRS Section 1.3 (step 9)
  - Size: Small

- [ ] **3.2** Implement `listTranscripts(params)` in `transcript-repository.ts`:
  - Accepts: `{ clientId, callType?, fromDate?, toDate?, page, perPage }`.
  - Executes data query (SELECT summary fields only, no `raw_transcript` or `normalized_segments`) and COUNT query concurrently.
  - Returns `{ rows: TranscriptSummary[], total: number }`.
  - References: TR.md — Section 2.2 (SQL Query Pattern)
  - Size: Medium

- [ ] **3.3** Implement `getTranscriptById(transcriptId)` in `transcript-repository.ts`:
  - Accepts: `transcriptId` UUID string.
  - Executes: `SELECT * FROM transcripts WHERE id = $1` (includes all columns including `raw_transcript` and `normalized_segments`).
  - Returns `TranscriptRecord | null`.
  - References: TR.md — Section 2.3 (SQL Query Pattern)
  - Size: Small

---

## Phase 4: Route Handlers

- [ ] **4.1** Implement `POST /clients/:clientId/transcripts` route handler in `post-transcript.ts`:
  - Validate `clientId` UUID format → `400 INVALID_ID`.
  - Check `role === 'team_member'` → `403 FORBIDDEN`.
  - Call `getClientById()` → `404 CLIENT_NOT_FOUND` if null.
  - Detect content type (JSON vs multipart). Validate mutual exclusion of `raw_transcript` and `file`.
  - Validate `call_type` enum, `call_date` ISO 8601 format.
  - If file upload: validate MIME type (`.txt`/`text/plain`), validate size (<= 5 MB), decode UTF-8.
  - Call `normalizeTextTranscript()` — catch `NormalizerError` → `400 INVALID_BODY`.
  - Call `insertTranscript()`.
  - Call `writeAuditLog()` (non-blocking).
  - Return `201 Created` with `TranscriptRecord`.
  - References: FRS Section 1.3, TR.md Sections 2.1, 5, 6, 7
  - Size: Large

- [ ] **4.2** Implement `GET /clients/:clientId/transcripts` route handler in `list-transcripts.ts`:
  - Validate `clientId` UUID format → `400 INVALID_ID`.
  - Call `getClientById()` → `404 CLIENT_NOT_FOUND` if null.
  - Parse and validate query parameters. Return `400 INVALID_PAGINATION` or `400 INVALID_FILTER` as appropriate.
  - Validate `from_date <= to_date` when both supplied → `400 INVALID_FILTER`.
  - Call `listTranscripts()` concurrently for data and count.
  - Return `200 OK` with `ListTranscriptsResponse` (data + pagination).
  - References: FRS Section 2, TR.md Section 2.2, GS — "List Transcripts" scenarios
  - Size: Medium

- [ ] **4.3** Implement `GET /transcripts/:transcriptId` route handler in `get-transcript.ts`:
  - Validate `transcriptId` UUID format → `400 INVALID_ID`.
  - Call `getTranscriptById()` → `404 TRANSCRIPT_NOT_FOUND` if null.
  - Call `getClientById(transcript.client_id, userId, role)` → `404 TRANSCRIPT_NOT_FOUND` if null (existence hiding).
  - Return `200 OK` with full `TranscriptRecord`.
  - References: FRS Section 3, TR.md Section 2.3, GS — "Get Transcript Detail" scenarios
  - Size: Small

- [ ] **4.4** Register all three routes in `apps/api/src/routes/transcripts/index.ts` and wire them into the API server's route registration (following the pattern established in Features 07/09).
  - References: TR.md — Section 11
  - Size: Small

---

## Phase 5: Audit Logging

- [ ] **5.1** Confirm that a `writeAuditLog(entry)` utility function is available from Feature 07 or Feature 09 scaffolding. If not, implement it: accepts `{ userId, action, entityType, entityId, metadata, source }` and inserts into `audit_log`.
  - References: TR.md — Section 5, Feature 09 TR.md Section 5
  - Size: Small (if not already exists)

- [ ] **5.2** Integrate the audit log call into the `POST` handler (Task 4.1). Build the metadata object per TR.md Section 5.3: `{ call_type, call_date, participant_count, segment_count, raw_transcript_length, submission_method }`. Confirm raw transcript text is NOT included in metadata.
  - References: TR.md — Sections 5.3, 7.1, FRS Section 6
  - Size: Small

---

## Phase 6: Error Handling

- [ ] **6.1** Verify all error responses from this feature's handlers match the standard API error format (`{ error: { code, message, details } }`) consistent with Feature 07 and Feature 09 patterns.
  - References: TR.md — Section 6, api-prd.md — Error Handling
  - Size: Small (review/test task)

- [ ] **6.2** Verify that `404 TRANSCRIPT_NOT_FOUND` is returned (not `403`) for transcripts that exist but whose client the user cannot access. Confirm `404 CLIENT_NOT_FOUND` is returned (not `403`) for inaccessible clients on the client-scoped endpoints.
  - References: TR.md — Section 7.2, FRS Sections 1.5, 3.5
  - Size: Small (review/test task)

---

## Phase 7: Unit Tests

- [ ] **7.1** Unit test: UUID format validation function — valid v4 UUIDs, empty string, non-UUID strings, UUID-like strings with wrong format.
  - References: TR.md — Section 10.1
  - Size: Small

- [ ] **7.2** Unit test: `call_type` enum validation — all three valid values pass; invalid strings, null, and undefined fail with correct error.
  - References: TR.md — Section 10.1
  - Size: Small

- [ ] **7.3** Unit test: `call_date` ISO 8601 validation — valid datetime strings pass; date-only strings (no time component), non-date strings, and empty strings fail.
  - References: TR.md — Section 10.1
  - Size: Small

- [ ] **7.4** Unit test: file type detection — `text/plain` MIME passes, `.txt` extension passes, `.pdf` extension fails with `UNSUPPORTED_FILE_TYPE`, no extension fails.
  - References: TR.md — Section 10.1
  - Size: Small

- [ ] **7.5** Unit test: file size limit — 5,242,880 bytes (5 MB exactly) passes, 5,242,881 bytes fails with `FILE_TOO_LARGE`.
  - References: TR.md — Section 10.1, FRS Section 1.2
  - Size: Small

- [ ] **7.6** Unit test: audit metadata assembly — given a `NormalizedTranscript` with 2 participants and 5 segments, verify `participant_count = 2`, `segment_count = 5`, and `raw_transcript` text is absent from the metadata object.
  - References: TR.md — Section 5.3, 7.1
  - Size: Small

- [ ] **7.7** Unit test: `to_date` boundary logic — transcript with `call_date = YYYY-MM-DDT23:59:00Z` is included when `to_date = YYYY-MM-DD` (same date).
  - References: TR.md — Section 2.2 (SQL Query Pattern note)
  - Size: Small

---

## Phase 8: Integration Tests

- [ ] **8.1** Seed the integration test database with the data requirements from TR.md Section 10.3: 2 clients (Total Life, HealthFirst), 4 users (Admin, AM-TotalLife, TM-TotalLife, AM-HealthFirst), `client_users` records, 5+ transcripts for Total Life with varied `call_type` / `call_date` / `processed_at` values.
  - References: TR.md — Section 10.3
  - Size: Medium

- [ ] **8.2** Integration test suite for `POST /clients/{id}/transcripts`:
  - Account Manager (assigned client) + JSON body → 201, DB row created, `normalized_segments` is non-null JSONB, audit log entry exists.
  - Account Manager (assigned client) + file upload (.txt) → 201.
  - Team Member → 403, no DB row, no audit log.
  - Account Manager (unassigned client) → 404 CLIENT_NOT_FOUND.
  - Non-existent client → 404 CLIENT_NOT_FOUND.
  - Invalid UUID in path → 400 INVALID_ID.
  - Missing `call_type` → 400 INVALID_BODY.
  - Invalid `call_type` value → 400 INVALID_BODY.
  - Missing `call_date` → 400 INVALID_BODY.
  - Non-ISO `call_date` → 400 INVALID_BODY.
  - Empty `raw_transcript` → 400 INVALID_BODY.
  - `raw_transcript` < 50 chars → 400 INVALID_BODY.
  - File upload with .pdf extension → 400 UNSUPPORTED_FILE_TYPE.
  - File upload > 5 MB → 400 FILE_TOO_LARGE.
  - Both `raw_transcript` and `file` provided → 400 INVALID_BODY.
  - No auth token → 401 UNAUTHORIZED.
  - References: GS — "Submit Transcript" scenarios, TR.md Section 10.2
  - Size: Large

- [ ] **8.3** Integration test suite for `GET /clients/{id}/transcripts`:
  - Admin on any client → 200, all transcripts returned in `call_date DESC` order.
  - Account Manager on assigned client → 200, summaries present, `raw_transcript` and `normalized_segments` absent from each item.
  - Account Manager on unassigned client → 404 CLIENT_NOT_FOUND.
  - Team Member on assigned client → 200.
  - Filter by `call_type=intake` → only intake records returned.
  - Filter by `from_date` and `to_date` → correct date-bounded results including boundary day.
  - `page=2&per_page=2` → correct slice and pagination totals.
  - `per_page=200` → 400 INVALID_PAGINATION.
  - Invalid `call_type` filter → 400 INVALID_FILTER.
  - `from_date > to_date` → 400 INVALID_FILTER.
  - Client with no transcripts → 200, empty data array, total: 0.
  - No auth token → 401 UNAUTHORIZED.
  - References: GS — "List Transcripts" scenarios, TR.md Section 10.2
  - Size: Large

- [ ] **8.4** Integration test suite for `GET /transcripts/{id}`:
  - Account Manager retrieves transcript from assigned client → 200, full record with `raw_transcript` and `normalized_segments`.
  - Account Manager retrieves transcript from unassigned client → 404 TRANSCRIPT_NOT_FOUND (existence hidden).
  - Admin retrieves transcript from any client → 200.
  - Team Member retrieves transcript from assigned client → 200.
  - Non-existent transcript ID → 404 TRANSCRIPT_NOT_FOUND.
  - Invalid UUID in path → 400 INVALID_ID.
  - `processed_at` is null for newly submitted transcript.
  - `processed_at` is set correctly for a transcript that has been processed (manually updated in test DB).
  - No auth token → 401 UNAUTHORIZED.
  - References: GS — "Get Transcript Detail" scenarios, TR.md Section 10.2
  - Size: Large

- [ ] **8.5** Integration test: Audit log is NOT written when POST fails at any validation stage (403, 404, 400).
  - References: FRS Section 6, TR.md Section 5.4
  - Size: Small

---

## Phase 9: Documentation and Wrap-Up

- [ ] **9.1** Confirm that `/job-queue` is present in the repository root `.gitignore`. (Already verified as present — mark complete.)
  - Size: Small

- [ ] **9.2** Update `execution/job-queue/index.md` — set Feature 10 `Spec Status` to `complete`.
  - Size: Small

- [ ] **9.3** Resolve the five open technical questions from TR.md Section 12 and document the decisions inline in TR.md (or in a decision log attached to the feature). Key questions to resolve before implementation starts:
  - Q1: Does Feature 04 already define the `transcripts` table?
  - Q2: What is the API framework (Node.js/Fastify vs Python/FastAPI)?
  - Q5: Is `getClientById()` exported as a shared service function from Feature 09?
  - Size: Small
