# TR — Technical Requirements
# Feature 10: Transcript Endpoints

## 1. Technical Context

This feature registers three route handlers onto the HTTP server scaffolded in Feature 07. It reads from the `clients` table (via the access-check function from Feature 09), writes to the `transcripts` table (established in Feature 04), and calls the `normalizeTextTranscript()` function from Feature 08.

Authentication middleware (token validation, user resolution) is provided by Feature 07 and must not be re-implemented here. The access-check pattern (`getClientById(clientId, userId, role)`) returns `null` for inaccessible or non-existent clients and must be called on every request.

The tech stack (Node.js/Fastify vs Python/FastAPI) is an open question in the PRD. This document is written in a framework-agnostic style. TypeScript types are used for schema documentation; adapt to Pydantic models if Python is chosen.

---

## 2. API Contracts

### 2.1 POST /clients/{id}/transcripts

**Route:** `POST /clients/:clientId/transcripts`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution (`auth_user_id` → product `user_id`, `role`)
- Multipart plugin (if file upload path is taken)

**Handler Responsibilities:**
1. Validate `clientId` is a valid UUID. Return `400 INVALID_ID` if not.
2. Check role: if `role === 'team_member'` → return `403 FORBIDDEN` immediately.
3. Resolve client access: call `getClientById(clientId, userId, role)`. Return `404 CLIENT_NOT_FOUND` if null.
4. Detect content type:
   - If `application/json`: extract `raw_transcript`, `call_type`, `call_date` from JSON body.
   - If `multipart/form-data`: extract `file`, `call_type`, `call_date` from multipart fields.
   - If both `raw_transcript` and `file` fields are present → `400 INVALID_BODY`.
   - If neither is present → `400 INVALID_BODY`.
5. Validate `call_type` is one of `['client_call', 'intake', 'follow_up']`. Return `400 INVALID_BODY` if not.
6. Validate `call_date` matches ISO 8601 datetime format (`/^\d{4}-\d{2}-\d{2}T/` and `Date.parse()` is not NaN). Return `400 INVALID_BODY` if not.
7. If file upload: validate MIME type is `text/plain` or filename extension is `.txt`. Return `400 UNSUPPORTED_FILE_TYPE` if not. Validate file size <= 5,242,880 bytes (5 MB). Return `400 FILE_TOO_LARGE` if exceeded. Decode file buffer as UTF-8 to obtain `rawText`.
8. Call `normalizeTextTranscript({ rawText, callType: call_type, callDate: call_date, clientId })`.
   - If `NormalizerError` is thrown → return `400 INVALID_BODY` with the error's message and field.
   - If any other error is thrown → return `500 INTERNAL_ERROR`.
9. Insert one row into `transcripts` (see Section 3.1). Return the inserted row.
10. Write audit log entry (see Section 5). Audit failure is non-blocking.
11. Return `201 Created` with the full `TranscriptRecord`.

**Request Body (JSON path):**
```typescript
interface PostTranscriptJsonBody {
  raw_transcript: string;  // required, min trimmed length 50
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;       // ISO 8601 datetime
}
```

**Response Shape (201 Created):**
```typescript
interface TranscriptRecord {
  id: string;                                    // UUID
  client_id: string;                             // UUID
  grain_call_id: string | null;                  // Always null in V1
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;                             // ISO 8601 datetime
  raw_transcript: string;
  normalized_segments: NormalizedTranscript;     // Full JSONB object
  processed_at: string | null;                   // Always null at submission time
  created_at: string;                            // ISO 8601 datetime
}
```

---

### 2.2 GET /clients/{id}/transcripts

**Route:** `GET /clients/:clientId/transcripts`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `clientId` is a valid UUID. Return `400 INVALID_ID` if not.
2. Resolve client access. Return `404 CLIENT_NOT_FOUND` if null.
3. Parse and validate query parameters (defaults and limits as specified).
4. Build the query: `WHERE client_id = :clientId` plus optional `call_type` and date filters.
5. Execute data query and parallel COUNT query.
6. Return `ListTranscriptsResponse`.

**Query Parameters:**
```typescript
interface ListTranscriptsQuery {
  page?: number;       // default: 1, min: 1
  per_page?: number;   // default: 20, min: 1, max: 100
  call_type?: 'client_call' | 'intake' | 'follow_up';
  from_date?: string;  // YYYY-MM-DD
  to_date?: string;    // YYYY-MM-DD
}
```

**Response Shape (200 OK):**
```typescript
interface ListTranscriptsResponse {
  data: TranscriptSummary[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

// Note: raw_transcript and normalized_segments are EXCLUDED from list response
interface TranscriptSummary {
  id: string;
  client_id: string;
  grain_call_id: string | null;
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;
  processed_at: string | null;
  created_at: string;
}
```

**SQL Query Pattern:**
```sql
-- Data query
SELECT id, client_id, grain_call_id, call_type, call_date, processed_at, created_at
FROM transcripts
WHERE client_id = $1
  AND ($2::text IS NULL OR call_type = $2)
  AND ($3::date IS NULL OR call_date >= $3)
  AND ($4::date IS NULL OR call_date <= $4 + INTERVAL '1 day')
ORDER BY call_date DESC
LIMIT $5 OFFSET $6;

-- Parallel COUNT query
SELECT COUNT(*)
FROM transcripts
WHERE client_id = $1
  AND ($2::text IS NULL OR call_type = $2)
  AND ($3::date IS NULL OR call_date >= $3)
  AND ($4::date IS NULL OR call_date <= $4 + INTERVAL '1 day');
```

Note: The `to_date` filter adds one day so that a `call_date` of `2026-02-28T23:59:59Z` is included when `to_date=2026-02-28`.

---

### 2.3 GET /transcripts/{id}

**Route:** `GET /transcripts/:transcriptId`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `transcriptId` is a valid UUID. Return `400 INVALID_ID` if not.
2. Query `transcripts` by `id`. If no row → `404 TRANSCRIPT_NOT_FOUND`.
3. Resolve client access for the transcript's `client_id`. If `getClientById(transcript.client_id, userId, role)` returns null → `404 TRANSCRIPT_NOT_FOUND` (do not reveal existence via `403`).
4. Return full `TranscriptRecord` including `raw_transcript` and `normalized_segments`.

**SQL Query Pattern:**
```sql
SELECT id, client_id, grain_call_id, call_type, call_date,
       raw_transcript, normalized_segments, processed_at, created_at
FROM transcripts
WHERE id = $1;
```

---

## 3. Data Models

### 3.1 Transcripts Table

This feature introduces the `transcripts` table. The migration must be created as part of this feature if Feature 04 does not already define it.

```sql
CREATE TYPE call_type_enum AS ENUM ('client_call', 'intake', 'follow_up');

CREATE TABLE transcripts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  grain_call_id       VARCHAR(500),                    -- Nullable in V1; populated by Feature 37
  call_type           call_type_enum NOT NULL,
  call_date           TIMESTAMP WITH TIME ZONE NOT NULL,
  raw_transcript      TEXT NOT NULL,
  normalized_segments JSONB NOT NULL,                  -- NormalizedTranscript from Feature 08
  processed_at        TIMESTAMP WITH TIME ZONE,        -- Set by Mastra (Feature 19); NULL at submission
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Historical import fields (defined in database-prd.md; included here for completeness)
  is_imported         BOOLEAN NOT NULL DEFAULT false,
  imported_at         TIMESTAMP WITH TIME ZONE,
  import_source       VARCHAR(500)
);
```

**Design decisions:**
- `normalized_segments` is `JSONB NOT NULL` — it is always populated at insert time; there is no partial-normalization state.
- `processed_at` is nullable and always NULL at submission time. It is set by Feature 19 (Workflow A) when the Mastra agent completes processing.
- `grain_call_id` is nullable; all V1 submissions are manual and have no Grain reference.
- `ON DELETE RESTRICT` on `client_id` prevents accidental client deletion when transcripts exist.

### 3.2 NormalizedTranscript JSONB Schema

The `normalized_segments` column stores the `NormalizedTranscript` object returned by `normalizeTextTranscript()`. The shape at storage time:

```json
{
  "source": "manual",
  "sourceId": "manual-{clientId}-{YYYY-MM-DD}",
  "meetingDate": "2026-03-03T14:00:00Z",
  "clientId": "a1b2c3d4-...",
  "meetingType": "client_call",
  "participants": ["Mark", "Sarah"],
  "durationSeconds": 3540,
  "segments": [
    { "speaker": "Mark", "timestamp": 0, "text": "Hello, let's get started." },
    { "speaker": "Sarah", "timestamp": 12, "text": "Sounds good, I have a few updates..." }
  ],
  "summary": null,
  "highlights": null
}
```

Keys are camelCase (TypeScript serialization convention). Consumers reading this JSONB column receive the object as parsed JSON.

---

## 4. Indexes

This feature creates the following indexes. If Feature 04 defines this table and index, verify they match; create a migration if they differ.

```sql
-- Primary use case: "Get all transcripts for Total Life, sorted by date"
CREATE INDEX transcripts_client_call_date_idx
  ON transcripts (client_id, call_date DESC);

-- Used by GET /transcripts/{id} (primary key handles this, but explicit for clarity)
-- Primary key covers: transcripts(id)

-- Used by task endpoints (Feature 11) to link tasks back to their source transcript
-- (No additional index needed; the FK reference to transcript_id on tasks will carry its own index)
```

The `(client_id, call_date DESC)` composite index satisfies the primary list query pattern from the database PRD: "Get the latest transcript for Total Life."

---

## 5. Audit Logging

### 5.1 Trigger Point

Only `POST /clients/{id}/transcripts` generates an audit log entry. Both GET endpoints do not log.

### 5.2 Log Entry Structure

```sql
INSERT INTO audit_log (
  user_id,
  action,
  entity_type,
  entity_id,
  metadata,
  source,
  created_at
) VALUES (
  :user_id,              -- product UUID from middleware; NULL for Mastra service account
  'transcript.created',
  'transcript',
  :transcript_id,        -- UUID of the newly inserted row
  :metadata,             -- JSONB (see 5.3)
  :source,               -- 'ui' | 'terminal' | 'agent' from request context
  NOW()
);
```

### 5.3 Metadata Content

```typescript
interface TranscriptAuditMetadata {
  call_type: string;
  call_date: string;
  participant_count: number;        // normalized_segments.participants.length
  segment_count: number;            // normalized_segments.segments.length
  raw_transcript_length: number;    // rawText.length (character count, not bytes)
  submission_method: 'json' | 'file_upload';
}
```

PII rule: raw transcript text must NOT appear in audit log metadata (see Section 9.1).

### 5.4 Audit Write Behavior

The audit write executes after the transcript insert. If the audit write fails, the response still returns `201 Created`. The audit failure is logged to the server's structured logging system at `warn` level with the transcript ID and error message.

---

## 6. Error Response Format

All error responses follow the standard format established in the API PRD:

```json
{
  "error": {
    "code": "TRANSCRIPT_NOT_FOUND",
    "message": "The requested transcript does not exist or you do not have access to it.",
    "details": {
      "transcript_id": "00000000-0000-0000-0000-000000000000"
    }
  }
}
```

### 6.1 Error Code Registry (this feature)

| Code | HTTP Status | Trigger |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired Bearer token |
| `FORBIDDEN` | 403 | Team Member attempting `POST` |
| `CLIENT_NOT_FOUND` | 404 | Client does not exist, or user cannot access it |
| `TRANSCRIPT_NOT_FOUND` | 404 | Transcript does not exist, or user cannot access its client |
| `INVALID_ID` | 400 | Path parameter `id` or `clientId` is not a valid UUID |
| `INVALID_BODY` | 400 | Body fails validation (missing fields, invalid enum, bad date, text too short, normalizer rejection, both/neither input methods) |
| `UNSUPPORTED_FILE_TYPE` | 400 | Uploaded file is not `.txt` / `text/plain` |
| `FILE_TOO_LARGE` | 400 | Uploaded file exceeds 5 MB |
| `INVALID_PAGINATION` | 400 | `page` or `per_page` out of allowed range |
| `INVALID_FILTER` | 400 | `call_type` filter not a valid enum, or date strings malformed, or `from_date > to_date` |
| `INTERNAL_ERROR` | 500 | Unexpected normalizer error or database failure |

---

## 7. Security Requirements

### 7.1 PII Handling — Transcript Content

Transcripts contain verbatim business conversations and may include personal information. The following rules apply:

- Raw transcript text must never appear in structured application logs at any log level.
- `normalized_segments` content (segment text) must not appear in logs.
- Metadata-only logging is permitted: `{ transcriptId, clientId, segmentCount, participantCount, callType }`.
- The `raw_transcript` field is returned in API responses only to authenticated, authorized users — it must not appear in error responses or audit log metadata.

### 7.2 Existence Hiding

For any transcript that exists in the database but the requesting user cannot access (because they cannot access the transcript's client), all endpoints must return `404 TRANSCRIPT_NOT_FOUND` — not `403 FORBIDDEN`. This prevents enumeration of transcript IDs by unauthorized users.

Similarly, for `GET /clients/{id}/transcripts` and `POST /clients/{id}/transcripts`, an inaccessible client must return `404 CLIENT_NOT_FOUND`, not `403`.

### 7.3 SQL Injection Prevention

All database queries must use parameterized queries (prepared statements). String interpolation into SQL is not permitted. The `normalized_segments` JSONB is inserted as a serialized string parameter, not interpolated.

### 7.4 File Upload Security

- Maximum file size: 5 MB (5,242,880 bytes). This limit is enforced by the multipart plugin from Feature 07 before the handler runs — the handler should not receive files exceeding this limit if the plugin is correctly configured. The handler validates the size again as a defense-in-depth measure.
- Accepted file types: `text/plain` MIME type or `.txt` extension. Both checks are applied (MIME type can be spoofed; extension is a secondary check).
- File content is read as a UTF-8 string buffer. If UTF-8 decoding fails (binary or non-text content), return `400 INVALID_BODY`.

### 7.5 Token Validation

Token validation is fully delegated to Feature 07 middleware. This feature must not implement its own token parsing or user resolution.

---

## 8. Performance Requirements

### 8.1 Response Time Targets

| Endpoint | Target P95 Response Time |
|---|---|
| `POST /clients/{id}/transcripts` (JSON body) | < 500ms (includes normalization + DB insert) |
| `POST /clients/{id}/transcripts` (file upload) | < 600ms (includes file read + normalization + DB insert) |
| `GET /clients/{id}/transcripts` | < 200ms |
| `GET /transcripts/{id}` | < 150ms |

### 8.2 Normalization Latency Budget

Feature 08's normalization must complete in under 50ms for a transcript up to 50,000 characters (a 2-hour call). This is specified in Feature 08's TR.md Section 9. Feature 10's POST handler inherits this budget — if normalization takes longer, it is a Feature 08 performance regression, not a Feature 10 issue.

### 8.3 List Query Strategy

The data query and COUNT query in `GET /clients/{id}/transcripts` must execute concurrently (e.g., `Promise.all` in Node.js). Sequential execution is not acceptable given the P95 target. The `(client_id, call_date DESC)` index makes both queries efficient.

### 8.4 Large Transcript Storage

The `raw_transcript` column is `TEXT` (unbounded in Postgres). For a 2-hour call at 150 words per minute with average 5 characters per word, raw transcript size is approximately 90,000 characters (~90 KB). The `normalized_segments` JSONB is larger: segments array with timestamps and speaker labels may reach 200-300 KB for the same call. These are within normal Postgres TEXT/JSONB handling range. No chunking or external storage is required in V1.

---

## 9. Dependencies

### 9.1 Internal Dependencies

| Dependency | Feature | What Is Required |
|---|---|---|
| API framework and routing | 07 (api-scaffolding) | Route registration, middleware chain, `req.user`, multipart plugin, body size limits |
| Token validation middleware | 07 (api-scaffolding) | `req.user` populated with `user_id`, `role`, `auth_user_id` |
| `getClientById()` access-check | 09 (client-management) | Client permission resolution function; must accept `(clientId, userId, role)` and return `ClientRecord | null` |
| `normalizeTextTranscript()` | 08 (input-normalizer-text) | Pure function accepting `NormalizeTextInput`, returning `NormalizedTranscript`. Must throw `NormalizerError` for validation failures. |
| `transcripts` table | 04 (product-database-schema) | Table must exist with correct schema; see Section 3.1 for expected DDL |
| `clients` table | 04 (product-database-schema) | Required for FK reference on `transcripts.client_id` |
| `audit_log` table | 04 (product-database-schema) | Used for POST audit writes |
| Shared TypeScript types | 01 (shared-types-package) | `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, `TranscriptSource` |

### 9.2 External Dependencies

None. This feature has no external service calls. The normalizer is an in-process function call.

### 9.3 Downstream Dependents

| Feature | Dependency Type |
|---|---|
| 11 (task-endpoints) | `transcripts.id` is a FK target from `tasks.transcript_id` |
| 17 (workflow-orchestration) | Workflow A accepts `transcript_id`; reads transcript via `GET /transcripts/{id}` |
| 19 (workflow-a-intake-agent) | Sets `processed_at` on the transcript row after processing |
| 37 (input-normalizer-grain) | Will insert transcript rows using the same table and JSONB schema |
| 38 (historical-import) | Bulk-inserts historical transcript rows using the same table |

---

## 10. Testing Requirements

### 10.1 Unit Tests

- UUID format validation function (valid UUIDs, empty string, non-UUID strings).
- `call_type` enum validation (all valid values, invalid values, null, undefined).
- `call_date` ISO 8601 validation (valid datetime strings, date-only strings, non-date strings, empty string).
- File type detection (text/plain MIME, .txt extension, .pdf extension, no extension).
- File size limit enforcement (4.9 MB passes, 5.0 MB exact is boundary, 5.1 MB fails).
- Audit metadata assembly (given a `NormalizedTranscript`, verify `participant_count` and `segment_count` are derived correctly).
- `to_date` range logic (transcript with `call_date = 2026-02-28T23:59:00Z` is included when `to_date = 2026-02-28`).

### 10.2 Integration Tests

Full request/response cycle using a test database and a real (not mocked) normalizer call:

- `POST` — Account Manager on assigned client with JSON body: verify 201, transcript row created, `normalized_segments` is non-null JSONB, audit log entry created.
- `POST` — Account Manager on assigned client with file upload (.txt): verify 201.
- `POST` — Team Member blocked: verify 403, no DB row, no audit log.
- `POST` — Account Manager on unassigned client: verify 404 CLIENT_NOT_FOUND.
- `POST` — Non-existent client: verify 404 CLIENT_NOT_FOUND.
- `POST` — Invalid UUID in path: verify 400 INVALID_ID.
- `POST` — Missing `call_type`: verify 400 INVALID_BODY.
- `POST` — Invalid `call_type`: verify 400 INVALID_BODY.
- `POST` — Missing `call_date`: verify 400 INVALID_BODY.
- `POST` — Non-ISO `call_date`: verify 400 INVALID_BODY.
- `POST` — Empty transcript text: verify 400 INVALID_BODY.
- `POST` — Transcript text < 50 characters: verify 400 INVALID_BODY.
- `POST` — File upload with .pdf extension: verify 400 UNSUPPORTED_FILE_TYPE.
- `POST` — File upload with size exactly at 5 MB + 1 byte: verify 400 FILE_TOO_LARGE.
- `POST` — Both `raw_transcript` and `file` provided: verify 400 INVALID_BODY.
- `GET /clients/{id}/transcripts` — Returns 3 records ordered by `call_date DESC`.
- `GET /clients/{id}/transcripts` — Summary fields present, `raw_transcript` and `normalized_segments` absent.
- `GET /clients/{id}/transcripts?call_type=intake` — Returns only intake transcripts.
- `GET /clients/{id}/transcripts?from_date=&to_date=` — Date range filter works correctly.
- `GET /clients/{id}/transcripts?page=2&per_page=2` — Correct pagination slice and totals.
- `GET /clients/{id}/transcripts?per_page=200` — 400 INVALID_PAGINATION.
- `GET /clients/{id}/transcripts` — Account Manager on unassigned client: 404.
- `GET /clients/{id}/transcripts` — Team Member on assigned client: 200.
- `GET /transcripts/{id}` — Full record returned including `raw_transcript` and `normalized_segments`.
- `GET /transcripts/{id}` — Account Manager on transcript from unassigned client: 404 TRANSCRIPT_NOT_FOUND.
- `GET /transcripts/{id}` — Non-existent transcript ID: 404 TRANSCRIPT_NOT_FOUND.
- `GET /transcripts/{id}` — Invalid UUID: 400 INVALID_ID.
- `GET /transcripts/{id}` — `processed_at` is null for newly submitted transcript.
- Unauthenticated requests to all three endpoints: 401.

### 10.3 Test Data Requirements

Integration tests must seed:
- At least 2 client records (`Total Life`, `HealthFirst`).
- At least 3 user records (one per role): Admin, Account Manager (assigned to Total Life), Team Member (assigned to Total Life). A second Account Manager assigned to HealthFirst.
- `client_users` records scoping users to their clients.
- At least 5 transcript records for `Total Life` with varied `call_type`, `call_date`, and `processed_at` values (some null, some set).

---

## 11. Module Structure

Following the pattern established in Features 08 and 09, transcript endpoint logic lives within `apps/api/`:

```
apps/api/src/
├── routes/
│   └── transcripts/
│       ├── post-transcript.ts       # POST /clients/:clientId/transcripts handler
│       ├── list-transcripts.ts      # GET /clients/:clientId/transcripts handler
│       ├── get-transcript.ts        # GET /transcripts/:transcriptId handler
│       └── index.ts                 # Route registration
├── repositories/
│   └── transcript-repository.ts    # DB queries: insertTranscript, listTranscripts, getTranscriptById
└── __tests__/
    └── transcripts/
        ├── post-transcript.test.ts
        ├── list-transcripts.test.ts
        └── get-transcript.test.ts
```

The repository layer owns all SQL. Route handlers call the repository and the normalizer; they do not contain SQL.

---

## 12. Open Technical Questions

| # | Question | Impact |
|---|---|---|
| 1 | Does Feature 04 define the `transcripts` table and `call_type_enum`, or must this feature create the migration? | Determines whether a migration file is needed here or if the table already exists. |
| 2 | What is the API framework? (Node.js/Fastify, Python/FastAPI) | Affects multipart plugin, body parsing API, concurrent query syntax, and Zod vs Pydantic for validation schemas. |
| 3 | Should `normalized_segments` be returned in the list endpoint for certain consumers (e.g., Mastra via the list endpoint)? | Current spec excludes it from list for performance. If Mastra needs it, add an optional `?include_segments=true` query param. |
| 4 | Should the `POST` endpoint accept a `grain_call_id` field even in V1 (to allow pre-population before Feature 37)? | Currently excluded. If account managers need to record the Grain call ID manually for reference, it could be accepted as an optional field without triggering any Grain API call. |
| 5 | Is `getClientById()` from Feature 09 exposed as a shared service function, or does Feature 10 need to re-implement the client access-check query? | Feature 09 likely exports this as an internal service function. Confirm before implementing. |
