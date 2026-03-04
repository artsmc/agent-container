# Technical Requirements
# Feature 37: Input Normalizer — Grain

## 1. Architecture Position

The Grain input normalizer lives in the API layer, co-located with the text normalizer from Feature 08. It does not live in Mastra. Mastra never calls Grain directly — all external service adapters are owned by the API layer.

```
POST /clients/{id}/transcripts
        │
        ├─── (raw_transcript or file)  ──► Feature 08: normalizeTextTranscript()
        │
        └─── (grain_recording_id) ──────► Feature 37: normalizeGrainTranscript()
                                                     │
                                                     ▼
                                              Grain API
                                          (GET /recordings/{id})
```

The transcript submission handler in Feature 10 is extended to support the Grain submission mode. The handler calls the correct normalizer based on which input mode is detected. The returned `NormalizedTranscript` is stored identically regardless of which normalizer produced it.

---

## 2. Module Location and File Structure

```
apps/api/src/normalizers/
├── text/                         # Feature 08 (existing)
│   ├── index.ts
│   ├── normalizer.ts
│   ├── speaker-parser.ts
│   ├── timestamp-parser.ts
│   ├── segment-builder.ts
│   └── errors.ts
└── grain/                        # Feature 37 (new)
    ├── index.ts                  # Public export: normalizeGrainTranscript
    ├── normalizer.ts             # Top-level orchestration
    ├── grain-client.ts           # HTTP client (Grain API calls)
    ├── mapper.ts                 # Maps Grain response → NormalizedTranscript
    ├── segment-parser.ts         # Maps Grain segments → TranscriptSegment[]
    └── errors.ts                 # GrainNormalizerError class
```

The normalizer module is intentionally isolated. All Grain-specific knowledge (API URL, request shape, response shape) is contained within `apps/api/src/normalizers/grain/`. No other module imports from this directory except the transcript submission handler.

---

## 3. Shared Types

Feature 37 consumes and extends types from `packages/shared-types/`. No new shared types are required if the `NormalizedTranscript` interface already includes `source: 'manual' | 'grain'`. Confirm the following types are already exported from `@iexcel/shared-types`:

| Type | Expected location | Notes |
|---|---|---|
| `NormalizedTranscript` | `@iexcel/shared-types` | `source` field must include `'grain'` as a valid value |
| `TranscriptSegment` | `@iexcel/shared-types` | Used unchanged |
| `MeetingType` | `@iexcel/shared-types` | Enum: `client_call`, `intake`, `follow_up` |
| `NormalizerError` | `apps/api/src/normalizers/` or `@iexcel/shared-types` | Base class for `GrainNormalizerError` |
| `ApiErrorCode` | `@iexcel/shared-types` | Must include new Grain error codes (see below) |

**New `ApiErrorCode` values to add:**

```typescript
// In packages/shared-types/src/errors.ts (or equivalent)
GRAIN_RECORDING_NOT_FOUND = 'GRAIN_RECORDING_NOT_FOUND',
GRAIN_ACCESS_DENIED = 'GRAIN_ACCESS_DENIED',
GRAIN_TRANSCRIPT_UNAVAILABLE = 'GRAIN_TRANSCRIPT_UNAVAILABLE',
GRAIN_API_ERROR = 'GRAIN_API_ERROR',
```

---

## 4. Grain API HTTP Client

### 4.1 Base URL

```
https://api.grain.com/v1
```

The base URL must be stored as an environment variable (`GRAIN_API_BASE_URL`) so it can be overridden in test environments pointing at a mock server.

### 4.2 Endpoint

```
GET {GRAIN_API_BASE_URL}/recordings/{grainRecordingId}?include=transcript
```

### 4.3 HTTP Client Implementation

Use the same HTTP client pattern as other adapters in the API layer (e.g., the Asana adapter in Feature 12). Do not use native `fetch` directly — wrap in a client class (`GrainApiClient`) to enable dependency injection in tests. The client class must be injectable into `normalizer.ts` to allow unit tests to mock Grain API responses without making real network calls.

### 4.4 Request Headers

```
Authorization: Bearer ${GRAIN_API_KEY}
Content-Type: application/json
Accept: application/json
```

### 4.5 Timeout

15 seconds per request. Implemented via `AbortController` timeout or equivalent.

### 4.6 Retry Logic

- Conditions: HTTP 429, HTTP 500, HTTP 503.
- Max attempts: 3 (1 initial + 2 retries).
- Back-off: exponential with jitter. Base wait: 2000ms. Multiplier: 2x per retry. Jitter: ±20%.
- On 429: honor `Retry-After` header (in seconds) as the minimum wait before first retry.
- Non-retryable: 400, 401, 403, 404, other 4xx.

---

## 5. Secret Manager Integration

### 5.1 Secret Reference

| Secret | Environment Variable | Description |
|---|---|---|
| Grain API key | `GRAIN_API_KEY` | Bearer token for all Grain API calls |

### 5.2 Retrieval Pattern

The Grain API key must be retrieved using the same secret manager pattern as the Asana access token in Feature 12. The key is not cached in memory across requests — it is fetched fresh per adapter initialization (or per module load if the module is long-lived). The exact secret manager client is determined by the API's existing infrastructure (AWS Secrets Manager, GCP Secret Manager, or equivalent as established in Feature 02).

### 5.3 Missing Key Behavior

If `GRAIN_API_KEY` is not set in the environment or secret manager, the adapter throws `GRAIN_API_ERROR` with message "Grain API key is not configured" immediately on the first call attempt. The API returns `502 GRAIN_API_ERROR`.

---

## 6. Extending Feature 10's Transcript Endpoint

### 6.1 Request Body Change

The `POST /clients/{id}/transcripts` request body validation in Feature 10's handler must be extended to accept a third mutually exclusive input mode:

```typescript
// Existing modes (Feature 08/10):
type TranscriptInput =
  | { mode: 'text';   raw_transcript: string;       call_type: MeetingType; call_date: string; }
  | { mode: 'file';   file: Buffer;                  call_type: MeetingType; call_date: string; }
// New mode (Feature 37):
  | { mode: 'grain';  grain_recording_id: string;    call_type: MeetingType; call_date?: string; }
```

### 6.2 Handler Logic Extension

The transcript submission handler must be modified to detect the mode:

```typescript
if (body.grain_recording_id) {
  normalizedTranscript = await normalizeGrainTranscript({
    grainRecordingId: body.grain_recording_id,
    callType: body.call_type,
    clientId: clientId,
  });
  resolvedCallDate = body.call_date ?? normalizedTranscript.meetingDate;
} else {
  // existing text/file normalization path (Feature 08)
}
```

### 6.3 grain_call_id Column

The `transcripts` table already has a `grain_call_id VARCHAR` column (Feature 10). For Grain submissions, this column must be populated with `grain_recording_id`. For text/file submissions it remains `NULL`.

---

## 7. Data Model

No new database tables or migrations are required for this feature. The existing `transcripts` table schema already supports the Grain recording ID via `grain_call_id`. The `normalized_segments` JSONB column stores the `NormalizedTranscript` output from either normalizer.

Confirm that the `normalized_segments` column JSONB schema accepts `source = "grain"`. If the column was seeded with only `source = "manual"` values during Feature 10 development, no migration is needed — JSONB is schema-free, the column accepts any shape.

---

## 8. Environment Configuration

| Variable | Required | Description |
|---|---|---|
| `GRAIN_API_KEY` | Yes | Grain API bearer token. Retrieved from secret manager. |
| `GRAIN_API_BASE_URL` | No | Defaults to `https://api.grain.com/v1`. Overridable for test environments. |

---

## 9. Testing Strategy

### 9.1 Unit Tests — Grain Normalizer

Location: `apps/api/src/normalizers/grain/__tests__/`

Test coverage required:

| Test area | Scenarios |
|---|---|
| `mapper.ts` | All field mappings from Grain response to NormalizedTranscript |
| `segment-parser.ts` | Timestamp conversion (ms to s), speaker normalization, empty segment filtering |
| `grain-client.ts` | Auth header set correctly, pagination loop, retry logic (mock HTTP responses), timeout |
| `normalizer.ts` | Integration: feed a mock Grain response → assert full NormalizedTranscript output |
| Error handling | GRAIN_RECORDING_NOT_FOUND, GRAIN_ACCESS_DENIED, GRAIN_TRANSCRIPT_UNAVAILABLE, GRAIN_API_ERROR |

The `GrainApiClient` must be injectable so unit tests can provide a mock client without real network calls.

### 9.2 Integration Tests — POST /clients/{id}/transcripts (Grain mode)

Location: `apps/api/src/__tests__/transcripts/`

Test coverage required:

| Test area | Scenarios |
|---|---|
| Grain submission mode end-to-end | Valid recording ID → 201 Created → TranscriptRecord with correct fields |
| `grain_call_id` stored | Assert `grain_call_id` column is populated on DB insert |
| call_date derivation | Omitted vs. explicit call_date |
| Mutual exclusion | grain_recording_id + raw_transcript → 400 |
| Error propagation | Grain errors map to correct HTTP status codes |
| Permission enforcement | Team Member → 403; Account Manager for unassigned client → 404 |

### 9.3 Mock Grain API

For CI/CD environments, a mock Grain API server must be provided (using a tool like `msw` or a lightweight Express mock). The mock must simulate:
- Successful recording response with transcript
- 404 for unknown recording IDs
- 401/403 for invalid auth
- 429 with Retry-After header
- Response without transcript (GRAIN_TRANSCRIPT_UNAVAILABLE case)
- Paginated responses

---

## 10. Performance Requirements

| Requirement | Target |
|---|---|
| End-to-end latency (Grain fetch + normalization + DB insert) | < 10 seconds for recordings up to 2 hours |
| Grain API call timeout | 15 seconds per page request |
| Memory usage for large transcripts | Pagination ensures segments are processed page-by-page, not all in memory simultaneously (stream or page-level processing preferred) |

---

## 11. Security Requirements

| Requirement | Implementation |
|---|---|
| Grain API key never logged | GrainApiClient must mask the Authorization header in all structured log output |
| Grain API key not in source code | Retrieved from secret manager via environment variable only |
| Transcript text not logged | Segments array must never appear in log output |
| Client scoping enforced before Grain call | The API handler must confirm client access before invoking the Grain adapter — the adapter itself is not responsible for client authorization |

---

## 12. Deployment Considerations

- The `GRAIN_API_KEY` secret must be provisioned in the secret manager before Feature 37 is deployed to any environment where Grain submissions will be tested or used.
- CI/CD pipelines must use a mock Grain API (per section 9.3) — never real Grain API keys in automated tests.
- The feature can be deployed behind a feature flag (`GRAIN_ADAPTER_ENABLED=true`) to allow staged rollout without impacting Feature 10's existing text submission path.

---

## 13. Alternatives Considered

| Alternative | Reason not chosen |
|---|---|
| Copy-paste text normalizer (V1 approach) | This is what Feature 37 replaces. Still supported for non-Grain scenarios. |
| Grain webhook (Zapier) triggering ingestion | Out of scope for this feature; Zapier integration path is a future enhancement. |
| Listing recordings by playlist and bulk-importing | No documented Grain API endpoint for playlist listing as of March 2026. |
| Having Mastra call Grain directly | Violates architecture principle: external service adapters belong in the API layer only. |
