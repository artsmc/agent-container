# Feature 10: Transcript Endpoints

## Summary
Implement transcript CRUD endpoints: `POST /clients/{id}/transcripts` (submit new transcript, triggers input normalizer), `GET /clients/{id}/transcripts` (list), and `GET /transcripts/{id}` (detail). Stores both the raw transcript text and the `NormalizedTranscript` output (segments as JSONB).

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 07 (API scaffolding), 08 (input normalizer for text processing), 09 (client management for client-scoped routes)
- **Blocks**: 11 (tasks reference transcripts via `transcript_id`), 19 (Workflow A reads transcripts)

## Source PRDs
- `api-prd.md` — Transcript endpoints
- `database-prd.md` — Transcripts entity schema

## Relevant PRD Extracts

### Transcript Endpoints (api-prd.md)
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | GET | List transcripts for a client |
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |
| `/transcripts/{id}` | GET | Get a specific transcript |

### Transcripts Entity (database-prd.md)
| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| client_id | UUID | FK -> Clients |
| grain_call_id | VARCHAR | Reference to the Grain recording |
| call_type | ENUM | `client_call`, `intake`, `follow_up` |
| call_date | TIMESTAMP | When the call occurred |
| raw_transcript | TEXT | Full transcript text |
| processed_at | TIMESTAMP | When the agent processed this transcript |
| created_at | TIMESTAMP | |

### Indexes (database-prd.md)
- `transcripts(client_id, call_date)` — "Get the latest transcript for Total Life"

### Workflow A Input (mastra-prd.md)
The workflow begins with a transcript. The Mastra agent receives the transcript and parses it for action items. The transcript must be persisted before workflow processing begins.

### Data Scoping (api-prd.md)
- Every query is scoped to the authenticated user's accessible clients.
- A user cannot access transcripts for clients they don't have permissions for.

## Scope

### In Scope
- `POST /clients/{id}/transcripts` — Submit a new transcript:
  - Accepts raw text (manual paste) or file upload
  - Invokes the text input normalizer (feature 08) to produce `NormalizedTranscript`
  - Stores `raw_transcript` (TEXT) and normalized segments (JSONB) in the database
  - Accepts `call_type` (client_call, intake, follow_up) and `call_date` from the request body
  - Returns the created transcript record with ID
- `GET /clients/{id}/transcripts` — List transcripts for a client:
  - Filtered by client permissions
  - Pagination support
  - Optional filters: `call_type`, date range
  - Sorted by `call_date` descending (most recent first)
- `GET /transcripts/{id}` — Get a specific transcript:
  - Returns full transcript detail including raw text, normalized segments, and metadata
  - Permission check that the user has access to the transcript's client
- Request validation for POST body (required fields, valid enum values)
- Client access permission enforcement

### Out of Scope
- Grain API integration for transcript fetching — that is feature 37
- Transcript processing by Mastra agent (AI analysis) — that is feature 19
- Transcript deletion or archival
- Transcript editing after submission (transcripts are immutable source records)
- Workflow triggering from transcript submission (workflow endpoints are feature 17)

## Key Decisions
- Transcripts store both `raw_transcript` (TEXT) and the normalized output (JSONB) in the same row for query simplicity
- The input normalizer (feature 08) is called synchronously during `POST` -- the transcript is normalized before the response is returned
- `grain_call_id` is nullable for V1 since all transcripts are manual text submissions
- `processed_at` is set later when the Mastra agent processes the transcript (not during initial submission)
- Transcripts are immutable after creation -- no PATCH endpoint. Corrections require resubmission.
