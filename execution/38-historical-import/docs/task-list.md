# Task List
# Feature 38: Historical Import

## Prerequisite Verification

- [ ] **Confirm Feature 04 migration scope** — Check whether the `is_imported`, `imported_at`, and `import_source` columns already exist on the `transcripts`, `tasks`, and `agendas` tables from Feature 04's product database schema migration. Also check whether `import_jobs` and `import_job_errors` tables were pre-created. This determines whether Feature 38 needs a new migration. *(Small — discovery task)*

- [ ] **Confirm Feature 37 Grain adapter is merged** — The Grain adapter (`normalizeGrainTranscript`) must be available in `apps/api/src/normalizers/grain/` before the transcript import phase can be implemented. Verify the Feature 37 branch is merged or coordinate with the Feature 37 developer. *(Small — dependency check)*

- [ ] **Confirm job queue infrastructure from Feature 17** — Identify which async job execution mechanism (BullMQ, pg-boss, or in-process) was established in Feature 17. Feature 38's job runner must use the same pattern. *(Small — discovery task)*

- [ ] **Confirm Grain playlist listing capability** — Clarify with the Grain API (from Feature 37 research) whether a "List Recordings by Playlist" endpoint exists. This determines whether the import can accept a playlist ID alone or requires individual recording IDs. *(Small — discovery task)*

---

## Phase 1: Shared Types and Error Codes

- [ ] **Add `IMPORT_RECORD_READ_ONLY` to `ApiErrorCode`** — Add the new error code to `packages/shared-types/src/errors.ts`. Rebuild the shared-types package and confirm it is available in the API layer. *(Small — References: TR.md §7.3)*

- [ ] **Add `IMPORT_IN_PROGRESS` and `IMPORT_JOB_NOT_FOUND` to `ApiErrorCode`** — Add these two additional error codes needed by the import endpoints. *(Small — References: FRS.md §1.6)*

---

## Phase 2: Database Migration

- [ ] **Create database migration for `import_jobs` table** — Write and apply a SQL migration that creates the `import_jobs` table with all columns and indexes as specified in FRS.md FR-80. Include the partial index on `status IN ('pending', 'in_progress')`. *(Medium — References: FRS.md FR-80, TR.md §3.1)*

- [ ] **Create database migration for `import_job_errors` table** — Write and apply the migration for `import_job_errors` table with the job_id index. *(Small — References: FRS.md FR-81)*

- [ ] **Create database migration for import flag columns (if not already in Feature 04)** — If `is_imported`, `imported_at`, and `import_source` are not already on `transcripts`, `tasks`, and `agendas`, add ALTER TABLE statements in a new migration. Run pre-migration check first. *(Medium — References: TR.md §3.2)*

- [ ] **Create indexes for idempotency queries** — Add the expression index on `tasks ((external_ref->>'taskId'), client_id) WHERE is_imported = true` and the partial index on `transcripts (client_id, grain_call_id) WHERE is_imported = true`. *(Small — References: TR.md §3.3)*

---

## Phase 3: Import Jobs Repository

- [ ] **Implement `import-jobs-repository.ts`** — Create the database access layer for `import_jobs` and `import_job_errors`. Methods required: `createJob`, `getJobById`, `getMostRecentJobForClient`, `updateJobStatus`, `incrementTranscriptsImported`, `incrementTasksImported`, `addJobError`, `isJobInProgress`. All counter increments must be atomic (`UPDATE ... SET transcripts_imported = transcripts_imported + 1`). *(Medium — References: FRS.md §8, TR.md §5)*

- [ ] **Write unit tests for `import-jobs-repository.ts`** — Cover: job creation, status transitions, counter increments, error record insertion, most-recent-job query. *(Small — References: TR.md §10.1)*

---

## Phase 4: Import Job Service

- [ ] **Implement `import-job-service.ts`** — Business logic layer: validate source references, resolve Asana workspace (task-level override vs. client default), check for in-progress job concurrency (using SELECT FOR UPDATE), create import job record, and enqueue the job runner. *(Medium — References: FRS.md §1.3, TR.md §4.1)*

- [ ] **Implement concurrency guard** — Inside the service, use a database-level lock (advisory lock or `SELECT ... FOR UPDATE` on the `import_jobs` row) to prevent two simultaneous POST requests from both passing the "no active job" check for the same client. *(Medium — References: FRS.md FR-33)*

- [ ] **Write unit tests for `import-job-service.ts`** — Cover: successful job creation, concurrency detection (second call returns 409), missing source validation (400), workspace resolution fallback, Team Member rejection (403). *(Medium — References: TR.md §10.1, GS.md)*

---

## Phase 5: Import Job Runner — Transcript Phase

- [ ] **Implement `fetchGrainRecordingIds` function in job runner** — Isolated function that accepts a `grain_playlist_id` and returns an array of recording IDs. If Grain has a list endpoint, call it with pagination (max 500 recordings). If not, fall back to accepting `grain_recording_ids` from the job record. Must be easily swappable when Grain's API evolves. *(Medium — References: TR.md §8)*

- [ ] **Implement transcript idempotency check** — Before importing each recording, query `transcripts` for an existing row with matching `client_id + grain_call_id + is_imported=true`. Skip if found. *(Small — References: TR.md §6.1, FRS.md FR-31)*

- [ ] **Implement transcript import loop** — For each recording ID: call `normalizeGrainTranscript()`, construct the transcript DB row (with `is_imported=true`, `imported_at`, `import_source`), insert into `transcripts`, increment `transcripts_imported` counter. Handle per-record errors: catch, log to `import_job_errors`, continue. *(Large — References: FRS.md FR-40 through FR-43)*

- [ ] **Write unit tests for transcript import phase** — Cover: successful import, idempotency skip, Grain 404 per-record error (job continues), Grain 401 catastrophic failure (job fails), call_type_override applied, progress counter incremented per record. *(Medium — References: GS.md transcript import scenarios)*

---

## Phase 6: Import Job Runner — Task Phase

- [ ] **Implement `fetchAsanaTasks` function in job runner** — Fetch all tasks from the specified Asana project using paginated `GET /projects/{gid}/tasks`. Follow pagination cursor to completion. Request the fields: `gid`, `name`, `notes`, `assignee.name`, `completed`, `completed_at`, `created_at`, `permalink_url`. *(Medium — References: TR.md §9)*

- [ ] **Implement Asana status mapping** — Map Asana `completed=true` → internal `completed`, `completed=false` → `pushed`. *(Small — References: FRS.md FR-52, TR.md §9.2)*

- [ ] **Implement task idempotency check** — Before importing each Asana task, query `tasks` for an existing row with matching `client_id + external_ref->>'taskId' + is_imported=true`. Skip if found. *(Small — References: TR.md §6.2)*

- [ ] **Implement task import loop** — For each Asana task: check idempotency → construct task DB row (with `is_imported=true`, `imported_at`, `import_source`, `external_ref` JSONB per Feature 12 shape, `short_id` auto-assigned) → insert → increment `tasks_imported`. Handle per-record errors per FR-32. *(Large — References: FRS.md FR-50 through FR-54)*

- [ ] **Write unit tests for task import phase** — Cover: completed task imported as `completed`, incomplete task imported as `pushed`, idempotency skip, Asana error per-record (job continues), `external_ref` JSONB shape matches Feature 12 contract, short_id auto-assigned. *(Medium — References: GS.md task import scenarios)*

---

## Phase 7: Optional Mastra Reprocessing Phase

- [ ] **Implement reprocessing phase in job runner** — If `reprocess_transcripts = true`, iterate over transcripts imported in this job run. For each: call `POST /workflows/intake`, wait for completion (or poll), then UPDATE the resulting task records to set `is_imported=true`, `imported_at`, `import_source`. Per-failure: log to `import_job_errors` and continue. *(Large — References: FRS.md FR-70 through FR-73)*

- [ ] **Write unit tests for reprocessing phase** — Cover: reprocessing invoked when flag is true, skipped when false, Workflow A failure logs error and continues, resulting tasks flagged as imported. *(Medium — References: GS.md reprocessing scenarios)*

---

## Phase 8: API Route Handlers

- [ ] **Implement `POST /clients/{id}/import` route handler** — Wire up route in `apps/api/src/routes/import.ts`. Apply auth middleware, call `import-job-service`, return 202 with job ID. Handle all error codes from FRS.md §1.6. *(Medium — References: FRS.md §1, TR.md §4.1)*

- [ ] **Implement `GET /clients/{id}/import/status` route handler** — Fetch from `import-jobs-repository`, populate `ImportStatusResponse` (including `error_details` from `import_job_errors`). Limit error_details to 100 records. Return 200. *(Medium — References: FRS.md §2, TR.md §4.2)*

- [ ] **Register import routes in the API router** — Add `POST /clients/:id/import` and `GET /clients/:id/import/status` to the main API router. *(Small)*

---

## Phase 9: Read-Only Enforcement on Existing Endpoints

- [ ] **Add `is_imported` check to `PATCH /tasks/:id`** — After fetching the task, before applying changes, check `task.is_imported`. Return `422 IMPORT_RECORD_READ_ONLY` if true. *(Small — References: FRS.md FR-60, TR.md §7)*

- [ ] **Add `is_imported` check to `POST /tasks/:id/approve`** — Same pattern as PATCH. *(Small)*

- [ ] **Add `is_imported` check to `POST /tasks/:id/reject`** — Same pattern. *(Small)*

- [ ] **Add `is_imported` check to `POST /tasks/:id/push`** — Same pattern. Ensure the check occurs before the Asana adapter is called. *(Small)*

- [ ] **Add `is_imported` check to `PATCH /agendas/:id`** — Same pattern for agendas. *(Small)*

- [ ] **Add `is_imported` check to `POST /agendas/:id/finalize`** — Same pattern. *(Small)*

- [ ] **Add `is_imported` check to `POST /agendas/:id/share`** — Same pattern. *(Small)*

- [ ] **Include `is_imported` in GET response bodies** — Confirm `is_imported`, `imported_at`, and `import_source` are included in the response shapes for `GET /tasks/{id}`, `GET /clients/{id}/tasks`, `GET /transcripts/{id}`, and `GET /clients/{id}/transcripts`. *(Small)*

---

## Phase 10: Integration Tests

- [ ] **Write integration tests for `POST /clients/{id}/import`** — Cover: successful creation, 409 concurrent import, 400 no sources, 422 no workspace, 403 Team Member, 404 unassigned client. *(Medium — References: TR.md §10.2, GS.md)*

- [ ] **Write integration tests for `GET /clients/{id}/import/status`** — Cover: in-progress status with progress counts, completed status, failed status with error summary, most-recent-job default, job_id override, no jobs returns 404. *(Medium)*

- [ ] **Write end-to-end integration test for full import flow** — POST → job created → job runner executes (using mocked Grain and Asana APIs) → poll status → completed → verify imported records in DB with correct flags. *(Large — References: TR.md §10.2)*

- [ ] **Write integration tests for read-only enforcement** — For each blocked operation (PATCH task, approve, reject, push, PATCH agenda, finalize, share): create an imported record, attempt the operation, assert 422 IMPORT_RECORD_READ_ONLY. *(Medium)*

- [ ] **Write integration test for partial recovery** — Simulate a job that fails at record 5 of 10. Trigger a new import. Assert only records 6-10 are imported (1-5 are skipped as already imported). *(Medium — References: GS.md "Restarting a failed import")*

---

## Phase 11: Monitoring and Deployment Preparation

- [ ] **Add stuck job detection** — Implement a cleanup routine (cron or periodic check) that marks import jobs older than 30 minutes with no progress update as `failed` with error_summary "Import job timed out". *(Small — References: TR.md §13)*

- [ ] **Add `HISTORICAL_IMPORT_ENABLED` feature flag** — Gate the two import endpoint registrations behind the flag. Default to `true` in development and staging. *(Small — References: TR.md §13)*

- [ ] **Update API documentation** — Document `POST /clients/{id}/import` and `GET /clients/{id}/import/status` endpoints. Document `is_imported` flag in task, transcript, and agenda response shapes. Document `IMPORT_RECORD_READ_ONLY` error code in the error reference. *(Small)*
