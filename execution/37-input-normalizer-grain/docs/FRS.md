# Functional Requirement Specification
# Feature 37: Input Normalizer — Grain

## 1. Module Interface Contract

### FR-01: Adapter Function Signature

The Grain normalizer is exported as a single async function:

```typescript
async function normalizeGrainTranscript(input: NormalizeGrainInput): Promise<NormalizedTranscript>
```

Where:

```typescript
interface NormalizeGrainInput {
  grainRecordingId: string;   // The Grain recording ID to fetch
  callType: MeetingType;      // 'client_call' | 'intake' | 'follow_up'
  clientId: string;           // UUID — the client this recording belongs to
}
```

Unlike the text normalizer (Feature 08), this function is **async** because it makes an HTTP call to the Grain API. All other output contract requirements from Feature 08 apply: the function must return a fully populated `NormalizedTranscript` on success and throw a typed `NormalizerError` on failure.

### FR-02: Export Location

The adapter must be exported from:

```
apps/api/src/normalizers/grain/index.ts
```

The directory structure:

```
apps/api/src/normalizers/grain/
├── index.ts              # Public export: normalizeGrainTranscript
├── normalizer.ts         # Top-level orchestration (fetch -> map -> validate)
├── grain-client.ts       # HTTP client for Grain API calls
├── mapper.ts             # Maps Grain API response to NormalizedTranscript
├── segment-parser.ts     # Converts Grain transcript segments to TranscriptSegment[]
└── errors.ts             # GrainNormalizerError class
```

### FR-03: No Side Effects (beyond Grain API call)

The normalizer must not:
- Write to the database.
- Read from the database.
- Emit logs with raw transcript content (PII).
- Mutate the input object.
- Call any service other than the Grain API.

Structured debug logging (recording ID, participant count, segment count, duration) is permitted at `debug` level and must not include transcript text.

### FR-04: Conformance to NormalizedTranscript Interface

The Grain normalizer is a second implementation of the normalizer pattern established by Feature 08. It must produce a `NormalizedTranscript` identical in structure to the text normalizer's output. The interface is defined in `@iexcel/shared-types` and shared between both implementations. The downstream pipeline (Feature 10 storage, Feature 19 Mastra processing) must not need to distinguish between a text-normalized and a Grain-normalized transcript beyond the `source` field.

---

## 2. Input Validation

### FR-10: grainRecordingId Validation

The `grainRecordingId` field must be validated before any API call is attempted:

| Validation | Rule | Error |
|---|---|---|
| Non-empty | Must not be empty or whitespace-only | `VALIDATION_ERROR` with message "grainRecordingId is required" |
| Max length | Must not exceed 500 characters | `VALIDATION_ERROR` with message "grainRecordingId is too long" |
| Format | Must not contain whitespace characters | `VALIDATION_ERROR` with message "grainRecordingId must not contain whitespace" |

### FR-11: callType Validation

`callType` must be one of the three valid `MeetingType` enum values: `client_call`, `intake`, `follow_up`. If not, throw `VALIDATION_ERROR`.

### FR-12: clientId Validation

`clientId` must be a valid UUID format. If not, throw `VALIDATION_ERROR` with message "clientId must be a valid UUID".

---

## 3. Grain API Authentication

### FR-20: API Key Retrieval

The Grain API key must be retrieved at runtime from the secret manager. The key must not be:
- Hard-coded in source.
- Stored in the database.
- Logged at any level.

The secret manager reference key is `GRAIN_API_KEY`. On startup, the adapter may warm up by confirming the key is retrievable. If the key is missing, the adapter must throw `GRAIN_API_ERROR` with message "Grain API key is not configured".

### FR-21: Authorization Header

All requests to the Grain API must include:

```
Authorization: Bearer <grain_api_key>
Content-Type: application/json
```

---

## 4. Grain API Interaction

### FR-30: Get Recording Endpoint

The adapter fetches a recording using the Grain Get Recording endpoint:

```
GET https://api.grain.com/v1/recordings/{grainRecordingId}?include=transcript
```

The `?include=transcript` query parameter instructs Grain to include the full transcript in the response. This avoids a second API call for the transcript body.

The adapter must use the exact endpoint URL format confirmed in the Grain API documentation. If the documented URL changes, only `grain-client.ts` must be updated.

### FR-31: Grain API Response Shape

The expected Grain API response contains recording metadata and a nested transcript object. The adapter must map the following fields:

| Grain Response Field | NormalizedTranscript Field | Notes |
|---|---|---|
| `recording.id` | `sourceId` | Direct copy |
| `recording.created_at` or `recording.started_at` | `meetingDate` | ISO 8601 string; use `started_at` if available, fall back to `created_at` |
| `recording.duration` | `durationSeconds` | Grain may provide this in milliseconds — convert to integer seconds |
| `recording.participants[].name` | `participants[]` | Extracted from Grain's participants array; de-duplicated |
| `recording.transcript.segments[]` | `segments[]` | See FR-40 |

**Note:** The exact field names in Grain's API response must be confirmed against live API documentation during implementation. If Grain's field names differ from those documented here, `mapper.ts` must be updated without changing any other files.

### FR-32: Pagination Handling

If the Grain API returns a paginated transcript (i.e., a `next_page_token` or equivalent cursor field is present in the response), the adapter must:

1. Collect the segments from the first page.
2. Follow the pagination cursor to fetch subsequent pages.
3. Concatenate all segment arrays in order.
4. Return the complete, ordered set of segments to the mapper.

The maximum number of pages the adapter will follow is 50. If pagination exceeds this limit, the adapter must log a warning and return the segments collected so far (truncation is preferable to failure for very long recordings).

### FR-33: Rate Limit Handling

If the Grain API returns HTTP 429 (Too Many Requests):

1. Read the `Retry-After` response header if present. Use its value as the minimum wait in seconds before the first retry.
2. If no `Retry-After` header is present, wait 2 seconds before the first retry.
3. Retry up to 3 times (initial attempt + 2 retries) with exponential back-off: ~2s, ~4s, ~8s (with ±20% jitter).
4. After exhausting retries, throw `GRAIN_API_ERROR` with message "Grain API rate limit exceeded after retries".

### FR-34: Request Timeout

Each HTTP call to the Grain API must time out after 15 seconds. On timeout, throw `GRAIN_API_ERROR` with message "Grain API request timed out".

---

## 5. Transcript Segment Mapping

### FR-40: Segment Conversion

Each element of Grain's `transcript.segments` array must be converted to a `TranscriptSegment`:

```typescript
interface TranscriptSegment {
  speaker: string;    // Normalized speaker name
  timestamp: number;  // Seconds from recording start (integer)
  text: string;       // Spoken content, whitespace normalized
}
```

Grain's segment fields are expected to include a speaker name, a start time offset, and the spoken text. Exact field names must be confirmed from Grain's API docs.

### FR-41: Speaker Name Normalization

Speaker names extracted from Grain segments must be normalized using the same rules as Feature 08 (FR-11 in Feature 08's FRS):

- Leading and trailing whitespace stripped.
- Parenthetical content removed.
- All-caps names converted to title case.
- De-duplicated in the `participants` array (case-insensitive).

### FR-42: Timestamp Conversion

Grain's timestamps may be in milliseconds or fractional seconds. The adapter must:

1. Detect the unit (milliseconds if the value exceeds the recording's total seconds by orders of magnitude).
2. Convert to integer seconds.
3. Ensure `timestamp` is non-negative.

### FR-43: Empty Segment Filtering

Segments with empty or whitespace-only `text` must be omitted from the output `segments` array (consistent with Feature 08 FR-33).

### FR-44: Fallback for Missing Transcript

If the Grain API response does not include a transcript (e.g., the transcript is not yet generated for a newly created recording), the adapter must throw `GRAIN_TRANSCRIPT_UNAVAILABLE` with message "Grain transcript is not yet available for this recording".

This is not a retryable error within the request — the caller should try again later once Grain has processed the recording.

### FR-45: Duration Calculation

`durationSeconds` is taken from Grain's recording metadata field (e.g., `recording.duration`). If Grain provides the duration in milliseconds, divide by 1000 and round to the nearest integer. If Grain does not provide a duration field, calculate it as the difference between the last segment's `end_timestamp` and the first segment's `start_timestamp`.

---

## 6. NormalizedTranscript Output Fields

### FR-50: source

Always set to `"grain"`. This field distinguishes Grain-sourced transcripts from manually submitted ones (`"manual"` from Feature 08).

### FR-51: sourceId

Set to the `grainRecordingId` from the input. This is the raw Grain recording ID and serves as the correlation identifier linking the `NormalizedTranscript` to the original Grain recording.

This value is also stored in the `grain_call_id` column of the `transcripts` table by Feature 10's submission handler.

### FR-52: meetingDate

Set from Grain's recording metadata (`started_at` or `created_at`). Must be stored as an ISO 8601 string (UTC). If Grain returns a non-UTC timestamp, it must be converted to UTC before storage.

### FR-53: clientId

Set from the `clientId` parameter passed in by the API handler. Not extracted from the Grain response.

### FR-54: meetingType

Set from the `callType` parameter passed in by the API handler. Mapped to the `MeetingType` enum from `@iexcel/shared-types`. Not extracted from the Grain response.

### FR-55: participants

Array of unique, normalized speaker names derived from Grain's segment data (via FR-41). If no speakers are present in the Grain transcript, returns `[]`.

### FR-56: durationSeconds

Non-negative integer, derived per FR-45.

### FR-57: segments

Ordered array of `TranscriptSegment` objects derived per FR-40 through FR-44. Preserves Grain's original ordering. Must not be empty — if no segments exist, the adapter must throw `GRAIN_TRANSCRIPT_UNAVAILABLE`.

### FR-58: summary

Always `null`. The Mastra agent (Feature 19) populates this field after the transcript is stored. The Grain adapter must not attempt to generate a summary.

### FR-59: highlights

Always `null`. Same reasoning as `summary`.

---

## 7. API Layer Integration: POST /clients/{id}/transcripts Extension

### FR-60: New Submission Mode — grain_recording_id

Feature 10's `POST /clients/{id}/transcripts` endpoint currently accepts `raw_transcript` (inline text) or `file` (multipart). Feature 37 adds a third mode: `grain_recording_id`.

**Extended JSON body fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `grain_recording_id` | string | Yes (in Grain mode) | The Grain recording ID to fetch and normalize |
| `call_type` | string (enum) | Yes | Same as existing text mode |
| `call_date` | string (ISO 8601) | No (optional in Grain mode) | If omitted, `call_date` is derived from Grain recording metadata |

**Input mutual exclusion rule (extended):** A request must provide exactly one of: `raw_transcript`, `file`, or `grain_recording_id`. Providing more than one, or none, returns `400 INVALID_BODY`.

### FR-61: Grain Submission Processing Steps (extension to Feature 10)

When `grain_recording_id` is present:

1. Steps 1–4 from Feature 10 (token validation, client resolution) apply unchanged.
2. Validate `grain_recording_id` is non-empty. Return `400 INVALID_BODY` if not.
3. Call `normalizeGrainTranscript({ grainRecordingId, callType, clientId })`.
4. If normalizer throws `GRAIN_RECORDING_NOT_FOUND` → return `404 GRAIN_RECORDING_NOT_FOUND`.
5. If normalizer throws `GRAIN_ACCESS_DENIED` → return `403 GRAIN_ACCESS_DENIED`.
6. If normalizer throws `GRAIN_TRANSCRIPT_UNAVAILABLE` → return `422 GRAIN_TRANSCRIPT_UNAVAILABLE`.
7. If normalizer throws `GRAIN_API_ERROR` → return `502 GRAIN_API_ERROR`.
8. On success: use `meetingDate` from the `NormalizedTranscript` as `call_date` if not provided in the request body.
9. Persist to `transcripts` table. Set `grain_call_id = grain_recording_id`. Remainder of Feature 10 insertion logic applies.

### FR-62: call_date Derivation for Grain Mode

If `call_date` is omitted from the request body in Grain mode, the `meetingDate` field from the returned `NormalizedTranscript` is used as the `call_date` for the database record. The account manager may optionally override this by providing an explicit `call_date` in the request body.

If `call_date` is provided explicitly, it overrides the Grain-derived date. The `NormalizedTranscript.meetingDate` always reflects the Grain recording's actual start time regardless.

---

## 8. Error Handling

### FR-70: Error Class

The Grain normalizer must throw instances of `GrainNormalizerError` (not generic `Error`). The class extends `NormalizerError` from Feature 08:

```typescript
class GrainNormalizerError extends NormalizerError {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
}
```

### FR-71: Error Codes

| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `grainRecordingId` is empty, malformed, or `callType`/`clientId` invalid |
| `GRAIN_RECORDING_NOT_FOUND` | 404 | Grain API returned 404 for the recording ID |
| `GRAIN_ACCESS_DENIED` | 403 | Grain API returned 401 or 403 (invalid API key or insufficient permissions) |
| `GRAIN_TRANSCRIPT_UNAVAILABLE` | 422 | Grain API returned success but transcript is not yet available |
| `GRAIN_API_ERROR` | 502 | Grain API returned an unexpected error, timed out, or retries exhausted |

### FR-72: Error Mapping from Grain HTTP Responses

| Grain HTTP Status | Thrown Error |
|---|---|
| 404 | `GRAIN_RECORDING_NOT_FOUND` |
| 401 | `GRAIN_ACCESS_DENIED` |
| 403 | `GRAIN_ACCESS_DENIED` |
| 429 | Retry per FR-33; if exhausted, `GRAIN_API_ERROR` |
| 500 / 503 | Retry per FR-33; if exhausted, `GRAIN_API_ERROR` |
| Other 4xx | `GRAIN_API_ERROR` with Grain error body in `details` |
| Timeout | `GRAIN_API_ERROR` with message "Grain API request timed out" |

---

## 9. Logging

### FR-80: Structured Log Events

| Event | Level | Fields |
|---|---|---|
| Fetch attempt started | `info` | `grainRecordingId`, `clientId` |
| Grain API call made | `debug` | `grainRecordingId`, `endpoint`, `hasTranscript=true` |
| Grain API call succeeded | `info` | `grainRecordingId`, `participantCount`, `segmentCount`, `durationSeconds` |
| Pagination page fetched | `debug` | `grainRecordingId`, `pageNumber`, `segmentsOnPage` |
| Retry triggered | `warn` | `grainRecordingId`, `attempt`, `waitMs`, `grainStatus` |
| Fetch failed | `error` | `grainRecordingId`, `errorCode`, `grainStatus` |
| Transcript unavailable | `warn` | `grainRecordingId`, `reason` |

Transcript text and speaker content must never appear in log output at any level.
