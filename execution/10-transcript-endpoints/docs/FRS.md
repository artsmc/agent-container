# FRS — Functional Requirement Specification
# Feature 10: Transcript Endpoints

## 1. POST /clients/{id}/transcripts — Submit Transcript

### 1.1 Purpose

Allow an authenticated user to submit a call transcript for a given client. The endpoint normalizes the raw text via the Feature 08 normalizer and persists both the raw text and normalized segments in a single atomic operation. Returns the created transcript record.

### 1.2 Request

**Method:** POST
**Path:** `/clients/{id}/transcripts`
**Content-Type:** `application/json` OR `multipart/form-data` (for file uploads)

**Path Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | The client UUID. Must resolve to a client the authenticated user can access. |

**JSON Body Fields (application/json):**

| Field | Type | Required | Description |
|---|---|---|---|
| `raw_transcript` | string | Yes (if no file) | The full raw transcript text. Mutually exclusive with file upload. |
| `call_type` | string (enum) | Yes | One of: `client_call`, `intake`, `follow_up`. |
| `call_date` | string (ISO 8601) | Yes | When the call occurred. Must include date and time (e.g., `2026-03-03T14:00:00Z`). |

**Multipart Body Fields (multipart/form-data):**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file | Yes (if no raw_transcript) | A `.txt` plain-text file containing the transcript. Max size: 5 MB. |
| `call_type` | string (enum) | Yes | Same as JSON body. |
| `call_date` | string (ISO 8601) | Yes | Same as JSON body. |

**Input Mutual Exclusion Rule:** A request must provide exactly one of `raw_transcript` (JSON) or `file` (multipart). If both are provided, or neither is provided, the request is rejected with `400 INVALID_BODY`.

### 1.3 Processing Steps (in order)

1. Validate Bearer token and resolve the calling user (middleware — Feature 07).
2. Validate `id` path parameter is a valid UUID format. Return `400 INVALID_ID` if not.
3. Resolve client access via `getClientById(id, userId, role)`. Return `404 CLIENT_NOT_FOUND` if not accessible.
4. Parse request body (JSON or multipart). Extract `call_type`, `call_date`, and raw text.
5. Validate `call_type` is one of the three valid enum values. Return `400 INVALID_BODY` if not.
6. Validate `call_date` is a valid ISO 8601 datetime string. Return `400 INVALID_BODY` if not.
7. Validate raw text is present and non-empty (length >= 50 characters after trim). Return `400 INVALID_BODY` if not.
8. If file upload: validate MIME type is `text/plain` or extension is `.txt`. Return `400 UNSUPPORTED_FILE_TYPE` if not. Validate file size <= 5 MB. Return `400 FILE_TOO_LARGE` if exceeded. Decode file buffer as UTF-8 to obtain raw text string.
9. Call `normalizeTextTranscript({ rawText, callType: call_type, callDate: call_date, clientId: id })` (Feature 08). If normalizer throws `NormalizerError`, return `400 INVALID_BODY` with the normalizer's message. Any unexpected normalizer error → `500 INTERNAL_ERROR`.
10. Insert one row into the `transcripts` table: `client_id`, `call_type`, `call_date`, `raw_transcript`, `normalized_segments` (the `NormalizedTranscript` result serialized as JSONB), `created_at = NOW()`. `grain_call_id` and `processed_at` are left NULL.
11. Write audit log entry: `action = 'transcript.created'`, `entity_type = 'transcript'`, `entity_id = <new transcript UUID>`.
12. Return `201 Created` with the created `TranscriptRecord`.

### 1.4 Response (201 Created)

```typescript
interface TranscriptRecord {
  id: string;                   // UUID
  client_id: string;            // UUID
  grain_call_id: string | null; // Always null for V1 manual submissions
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;            // ISO 8601 datetime
  raw_transcript: string;       // Full raw text
  normalized_segments: NormalizedTranscript; // Structured output from Feature 08
  processed_at: string | null;  // Always null at submission time; set by Mastra (Feature 19)
  created_at: string;           // ISO 8601 datetime
}
```

### 1.5 Validation Rules

| Rule | Error Code | HTTP Status |
|---|---|---|
| `id` path param is not a valid UUID | `INVALID_ID` | 400 |
| Client not found or not accessible | `CLIENT_NOT_FOUND` | 404 |
| Neither `raw_transcript` nor `file` provided | `INVALID_BODY` | 400 |
| Both `raw_transcript` and `file` provided | `INVALID_BODY` | 400 |
| `call_type` missing or not a valid enum value | `INVALID_BODY` | 400 |
| `call_date` missing or not a valid ISO 8601 datetime | `INVALID_BODY` | 400 |
| Raw text is empty or fewer than 50 characters (trimmed) | `INVALID_BODY` | 400 |
| File upload MIME type is not `text/plain` | `UNSUPPORTED_FILE_TYPE` | 400 |
| File upload exceeds 5 MB | `FILE_TOO_LARGE` | 400 |
| Normalizer rejects input (`NormalizerError`) | `INVALID_BODY` | 400 |
| Team Member role submitting a transcript | `FORBIDDEN` | 403 |

**Note on Team Member access:** Team Members have read-only access to transcripts. Only Account Managers and Admins may submit new transcripts.

### 1.6 Atomicity

The database insert and the audit log write must succeed together. If the audit log write fails after a successful insert, the insert is not rolled back (audit log failure is non-fatal and logged server-side). If the insert fails, no audit log is written. The normalizer is called before the transaction begins — it is not within the database transaction.

---

## 2. GET /clients/{id}/transcripts — List Transcripts

### 2.1 Purpose

Return a paginated list of transcripts for a given client, ordered by `call_date` descending (most recent first). Supports optional filtering by `call_type` and date range.

### 2.2 Request

**Method:** GET
**Path:** `/clients/{id}/transcripts`

**Path Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Client UUID. Must be accessible to the authenticated user. |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | 1 | Page number (1-indexed). Must be >= 1. |
| `per_page` | integer | No | 20 | Records per page. Must be between 1 and 100. |
| `call_type` | string (enum) | No | — | Filter by call type: `client_call`, `intake`, or `follow_up`. |
| `from_date` | string (date) | No | — | Filter: only transcripts with `call_date >= from_date`. Format: `YYYY-MM-DD`. |
| `to_date` | string (date) | No | — | Filter: only transcripts with `call_date <= to_date`. Format: `YYYY-MM-DD`. |

### 2.3 Processing Steps

1. Validate Bearer token and resolve calling user (middleware).
2. Validate `id` is a valid UUID. Return `400 INVALID_ID` if not.
3. Resolve client access. Return `404 CLIENT_NOT_FOUND` if not accessible.
4. Parse and validate query parameters. Return `400 INVALID_PAGINATION` if `page` or `per_page` are out of range. Return `400 INVALID_FILTER` if `call_type` is not a valid enum value or date strings are not valid `YYYY-MM-DD` format.
5. Query `transcripts` table with `WHERE client_id = :id` plus any active filters, ordered by `call_date DESC`, with `LIMIT per_page OFFSET (page-1)*per_page`.
6. Run a parallel COUNT query for pagination totals using the same WHERE clause.
7. Return the list response.

### 2.4 Response Shape (200 OK)

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

interface TranscriptSummary {
  id: string;                   // UUID
  client_id: string;            // UUID
  grain_call_id: string | null;
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;            // ISO 8601 datetime
  processed_at: string | null;  // null if not yet processed by Mastra
  created_at: string;           // ISO 8601 datetime
}
```

**Note:** `TranscriptSummary` intentionally omits `raw_transcript` and `normalized_segments` — these are large fields returned only on the detail endpoint. The list endpoint returns metadata only.

### 2.5 Validation Rules

| Rule | Error Code | HTTP Status |
|---|---|---|
| `id` path param is not a valid UUID | `INVALID_ID` | 400 |
| Client not found or not accessible | `CLIENT_NOT_FOUND` | 404 |
| `page` < 1 or non-integer | `INVALID_PAGINATION` | 400 |
| `per_page` < 1 or > 100 or non-integer | `INVALID_PAGINATION` | 400 |
| `call_type` filter is not a valid enum value | `INVALID_FILTER` | 400 |
| `from_date` or `to_date` is not a valid YYYY-MM-DD date | `INVALID_FILTER` | 400 |
| `from_date` > `to_date` (when both supplied) | `INVALID_FILTER` | 400 |

---

## 3. GET /transcripts/{id} — Get Transcript Detail

### 3.1 Purpose

Return the full transcript record for a given transcript UUID, including raw text and normalized segments. Validates that the requesting user has access to the transcript's client.

### 3.2 Request

**Method:** GET
**Path:** `/transcripts/{id}`

**Path Parameter:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | The transcript UUID. |

### 3.3 Processing Steps

1. Validate Bearer token and resolve calling user (middleware).
2. Validate `id` is a valid UUID. Return `400 INVALID_ID` if not.
3. Query `transcripts` table for the record: `SELECT * FROM transcripts WHERE id = :id`.
4. If no row is found → `404 TRANSCRIPT_NOT_FOUND`.
5. Resolve client access for the transcript's `client_id` using `getClientById(transcript.client_id, userId, role)`. If client is not accessible → `404 TRANSCRIPT_NOT_FOUND` (do not reveal existence).
6. Return the full `TranscriptRecord`.

### 3.4 Response Shape (200 OK)

```typescript
// Full TranscriptRecord — same shape as POST response
interface TranscriptRecord {
  id: string;
  client_id: string;
  grain_call_id: string | null;
  call_type: 'client_call' | 'intake' | 'follow_up';
  call_date: string;
  raw_transcript: string;
  normalized_segments: NormalizedTranscript;
  processed_at: string | null;
  created_at: string;
}
```

### 3.5 Validation Rules

| Rule | Error Code | HTTP Status |
|---|---|---|
| `id` path param is not a valid UUID | `INVALID_ID` | 400 |
| Transcript not found in database | `TRANSCRIPT_NOT_FOUND` | 404 |
| Transcript exists but user cannot access its client | `TRANSCRIPT_NOT_FOUND` | 404 |

**Note on existence hiding:** When a transcript exists but the user cannot access its client, the response must be `404 TRANSCRIPT_NOT_FOUND` — not `403 FORBIDDEN`. This is consistent with the client management pattern established in Feature 09 and prevents ID enumeration.

---

## 4. Roles and Permissions Matrix

| Action | Admin | Account Manager | Team Member |
|---|---|---|---|
| `POST /clients/{id}/transcripts` | Allowed | Allowed (assigned clients only) | Forbidden (403) |
| `GET /clients/{id}/transcripts` | Allowed (all clients) | Allowed (assigned clients only) | Allowed (assigned clients only) |
| `GET /transcripts/{id}` | Allowed (all clients) | Allowed (assigned clients only) | Allowed (assigned clients only) |

---

## 5. Normalized Segments Storage

### 5.1 What Is Stored

The `normalized_segments` column stores the full `NormalizedTranscript` object produced by `normalizeTextTranscript()` from Feature 08. The structure is:

```typescript
interface NormalizedTranscript {
  source: 'manual' | 'grain';
  sourceId: string;
  meetingDate: string;
  clientId: string;
  meetingType: 'client_call' | 'intake' | 'follow_up';
  participants: string[];
  durationSeconds: number;
  segments: TranscriptSegment[];
  summary: string | null;
  highlights: string[] | null;
}

interface TranscriptSegment {
  speaker: string;
  timestamp: number;    // seconds from start
  text: string;
}
```

### 5.2 Storage Format

The `normalized_segments` column type is `JSONB`. The `NormalizedTranscript` object is serialized to JSON (camelCase keys, as TypeScript produces) before storage. Consumers reading this column receive the JSON object deserialized — not a raw string.

### 5.3 Immutability

`normalized_segments` is set at insert time and never updated. If a transcript needs to be re-normalized, a new transcript record must be submitted.

---

## 6. Audit Logging

Only the `POST` endpoint generates an audit log entry. Read endpoints do not log.

| Action | `action` value | `entity_type` | Notes |
|---|---|---|---|
| Transcript submitted | `transcript.created` | `transcript` | `metadata` includes `call_type`, `call_date`, and `participant_count` from normalized output |

Audit log entries are non-blocking: if the audit write fails, the response still returns `201 Created`. The failure is logged server-side.
