# Task List
# Feature 37: Input Normalizer — Grain

## Prerequisite Verification

- [ ] **Confirm Grain API access** — Verify the iExcel Grain account is on the Business plan and the API key is obtainable. Confirm the exact shape of the Get Recording response (field names, timestamp units, segment structure) against live Grain API documentation before beginning implementation. *(Small — discovery task)*

- [ ] **Confirm shared-types readiness** — Verify that `NormalizedTranscript` in `@iexcel/shared-types` already includes `source: 'manual' | 'grain'`. If not, add `'grain'` to the union type. Confirm `NormalizerError` base class is exported and accessible. *(Small)*

---

## Phase 1: Shared Types and Error Codes

- [ ] **Add Grain error codes to `@iexcel/shared-types`** — Add `GRAIN_RECORDING_NOT_FOUND`, `GRAIN_ACCESS_DENIED`, `GRAIN_TRANSCRIPT_UNAVAILABLE`, `GRAIN_API_ERROR` to the `ApiErrorCode` enum in `packages/shared-types/src/errors.ts` (or equivalent). Rebuild the shared-types package. *(Small — References: TR.md §3)*

---

## Phase 2: Grain API HTTP Client

- [ ] **Create `GrainApiClient` class in `grain-client.ts`** — Implement a class that wraps HTTP calls to the Grain API. Must support: Authorization header injection, configurable base URL, 15-second request timeout via `AbortController`, and a clean interface for dependency injection in tests. *(Medium — References: TR.md §4)*

- [ ] **Implement retry logic in `GrainApiClient`** — Add exponential back-off retry for HTTP 429, 500, and 503 responses. Max 3 attempts. Honor `Retry-After` header on 429. Apply ±20% jitter. *(Medium — References: FRS.md FR-33, TR.md §4.6)*

- [ ] **Implement error mapping in `GrainApiClient`** — Map Grain HTTP status codes to the correct `GrainNormalizerError` instances per the error mapping table in FRS.md FR-72. *(Small — References: FRS.md FR-72)*

- [ ] **Implement pagination loop in `GrainApiClient`** — Detect `next_page_token` (or equivalent) in Grain responses. Follow pagination up to 50 pages. Concatenate segment arrays. Log a warning if truncation occurs. *(Medium — References: FRS.md FR-32)*

- [ ] **Write unit tests for `GrainApiClient`** — Cover: successful fetch, 404 mapping, 401/403 mapping, 429 retry with Retry-After, retry exhaustion, timeout, pagination (multi-page), pagination truncation at 50 pages. Use mock HTTP responses (no real Grain API calls in tests). *(Medium — References: TR.md §9.1)*

---

## Phase 3: Grain Normalizer Core

- [ ] **Create `GrainNormalizerError` class in `errors.ts`** — Extend `NormalizerError` (from Feature 08). Include `code: ApiErrorCode`, `httpStatus: number`, and optional `details`. *(Small — References: FRS.md FR-70, TR.md §3)*

- [ ] **Implement `segment-parser.ts`** — Convert each Grain transcript segment to a `TranscriptSegment`. Handle timestamp unit detection (ms vs s) and conversion to integer seconds. Normalize speaker names (strip whitespace, remove parentheticals, convert all-caps to title case). Filter out empty text segments. *(Medium — References: FRS.md FR-40 through FR-44)*

- [ ] **Write unit tests for `segment-parser.ts`** — Cover: timestamp in ms converted to seconds, all-caps speaker name normalized, empty segment filtered, speaker de-duplication in participants array, segments preserved in order. *(Small — References: GS.md scenarios "Grain recording has multiple speakers", "timestamps are converted")*

- [ ] **Implement `mapper.ts`** — Map the complete Grain API response object to a `NormalizedTranscript`. Set `source = "grain"`, `sourceId` from recording ID, `meetingDate` from `started_at`/`created_at`, `durationSeconds` from recording metadata (convert from ms if needed), `participants` from segment data, `segments` from `segment-parser.ts`, `summary = null`, `highlights = null`. *(Medium — References: FRS.md FR-50 through FR-59)*

- [ ] **Write unit tests for `mapper.ts`** — Cover: all field mappings, fallback from `started_at` to `created_at`, duration conversion from ms to s, null summary and highlights, empty participants when no speakers. *(Small — References: TR.md §9.1)*

- [ ] **Implement `normalizer.ts` (orchestration)** — Validate inputs (FR-10 through FR-12), call `GrainApiClient.fetchRecording()`, pass response to `mapper.ts`, return `NormalizedTranscript`. Throw `GRAIN_TRANSCRIPT_UNAVAILABLE` if transcript is absent in the response. Emit structured log events per FR-80. *(Medium — References: FRS.md FR-01, FR-44, FR-80)*

- [ ] **Create `index.ts` export** — Export `normalizeGrainTranscript` as the single public function from the `grain/` module. *(Small — References: FRS.md FR-02)*

- [ ] **Write integration unit tests for `normalizer.ts`** — Feed a complete mock Grain API response through the full normalizer and assert the returned `NormalizedTranscript`. Cover success path and all error paths. *(Medium — References: TR.md §9.1)*

---

## Phase 4: API Layer Integration

- [ ] **Extend `POST /clients/{id}/transcripts` handler to detect Grain mode** — Modify the transcript submission handler (Feature 10) to detect the presence of `grain_recording_id` in the request body and route to `normalizeGrainTranscript`. Enforce mutual exclusion with `raw_transcript` and `file` modes. *(Medium — References: FRS.md FR-60, TR.md §6.2)*

- [ ] **Handle optional `call_date` in Grain mode** — When `call_date` is omitted in a Grain submission, derive it from `NormalizedTranscript.meetingDate`. When provided, use the explicit value. *(Small — References: FRS.md FR-62)*

- [ ] **Populate `grain_call_id` column on insert** — Ensure the database insert sets `grain_call_id = grain_recording_id` for Grain submissions. Verify existing Feature 10 insert logic does not overwrite or ignore this field. *(Small — References: TR.md §6.3)*

- [ ] **Map Grain normalizer errors to HTTP responses** — Add error handling in the transcript submission handler for the four Grain error codes: `GRAIN_RECORDING_NOT_FOUND → 404`, `GRAIN_ACCESS_DENIED → 403`, `GRAIN_TRANSCRIPT_UNAVAILABLE → 422`, `GRAIN_API_ERROR → 502`. *(Small — References: FRS.md FR-61)*

---

## Phase 5: Secret Manager and Configuration

- [ ] **Provision `GRAIN_API_KEY` in secret manager** — Add the Grain API key to the secret manager for the development environment. Document the secret name (`GRAIN_API_KEY`) in the deployment runbook. *(Small — References: TR.md §5)*

- [ ] **Add `GRAIN_API_BASE_URL` environment variable** — Add `GRAIN_API_BASE_URL` to the API's environment configuration with a default of `https://api.grain.com/v1`. Ensure it is included in `.env.example` with a comment indicating it is overridable for test environments. *(Small — References: TR.md §8)*

---

## Phase 6: Integration Tests and Mock Server

- [ ] **Create mock Grain API server for integration tests** — Implement a lightweight mock server (using `msw` or Express) that simulates the Grain Get Recording endpoint. Must support: success with transcript, 404, 401, 429 with Retry-After, response without transcript, and multi-page pagination. *(Medium — References: TR.md §9.3)*

- [ ] **Write integration tests for Grain submission path** — Test the full request path: `POST /clients/{id}/transcripts` with `grain_recording_id` against the mock server. Cover all scenarios in GS.md including permissions, error mapping, `grain_call_id` stored correctly, `call_date` derivation. *(Large — References: TR.md §9.2, GS.md)*

---

## Phase 7: Feature Flag and Deployment

- [ ] **Add `GRAIN_ADAPTER_ENABLED` feature flag** — Gate the Grain submission code path behind a feature flag so it can be enabled per environment without affecting Feature 10's existing text path. *(Small — References: TR.md §12)*

- [ ] **Verify no logging of transcript content or API key** — Manual review of all new log statements in `grain-client.ts`, `normalizer.ts`, and the submission handler. Confirm the Grain API key is masked in the Authorization header log and that no segment text appears in any log output. *(Small — References: TR.md §11)*

- [ ] **Update API documentation** — Add `grain_recording_id` field to the `POST /clients/{id}/transcripts` endpoint documentation. Document the three submission modes (text, file, grain), the optional `call_date` behavior in Grain mode, and the new error codes. *(Small)*
