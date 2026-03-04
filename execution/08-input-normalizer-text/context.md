# Feature 08: Input Normalizer — Text

## Summary
Build the text input normalizer in the API layer that accepts raw transcript text (manual paste or file upload) and converts it to a `NormalizedTranscript` format. Parses speaker labels, timestamps, and segments. Sets `source="manual"`. This is V1 only -- no Grain API integration.

## Phase
Phase 2 — Core API & Data Pipeline

## Dependencies
- **Blocked by**: 07 (API scaffolding)
- **Blocks**: 10 (transcript endpoints depend on normalizer for POST), 19 (Workflow A intake agent consumes normalized transcripts)

## Source PRDs
- `api-prd.md` — Transcript submission endpoint (`POST /clients/{id}/transcripts`)
- `mastra-prd.md` — Workflow A input (transcript parsing and action item extraction)

## Relevant PRD Extracts

### Transcript Submission (api-prd.md)
| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |

### Workflow A Input (mastra-prd.md)
**Trigger:** Manual (account manager initiates after intake call)

**Input:** Grain call transcript (intake call)

**Process:**
1. Parse transcript for action items assigned to iExcel team members.
2. Generate structured Asana tasks with description formatted as Task Context, Additional Context, Requirements.

### System Context (mastra-prd.md)
- Every single call, both internally and per client, is recorded via Grain.
- These calls provide clear text details from all parties, including the client and the vendor.
- After each client-facing call, there is often a private, internal "intake" call where the team discusses details.

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

## Scope

### In Scope
- Text input normalizer module in the API layer that converts raw transcript text to `NormalizedTranscript` format
- Parsing logic for:
  - Speaker label extraction (e.g., "Mark:", "Speaker 1:")
  - Timestamp parsing (various formats from Grain and manual input)
  - Segment splitting (speaker turns with text content)
- `NormalizedTranscript` interface output:
  - `source` — "manual" for V1
  - `sourceId` — generated identifier
  - `meetingDate` — extracted or user-provided
  - `client` — from the API route parameter or user input
  - `meetingType` — from user triggering the workflow (e.g., "intake", "client_call")
  - `participants` — extracted from speaker labels
  - `durationSeconds` — calculated from timestamps if available
  - `segments[]` — array of `{ speaker, timestamp, text }`
  - `summary` — empty/null at this stage (populated by Mastra agent later)
  - `highlights` — empty/null at this stage
- Manual paste input (plain text body)
- File upload input (text file)
- Validation of input (minimum content length, parseable format)

### Out of Scope
- Grain API integration — that is feature 37 (V2)
- Transcript processing/analysis by Mastra agent — that is feature 19
- Storage of the normalized transcript — that is feature 10
- Any AI/LLM-based parsing — this is purely structural/mechanical parsing

## Key Decisions
- **NormalizedTranscript interface** includes: `source`, `sourceId`, `meetingDate`, `client`, `meetingType`, `participants`, `durationSeconds`, `segments[]{speaker, timestamp, text}`, `summary`, `highlights`
- **V1 is manual paste/upload only.** Grain API integration is V2 (feature 37). The normalizer must be designed so the Grain adapter can produce the same `NormalizedTranscript` output.
- **Input normalizer lives in the API layer**, not a separate service. It is a module/function called during transcript submission.
- **`meetingType` and `client` come from the user triggering the workflow**, not extracted from the transcript text itself.
- **`source` field** is set to `"manual"` for all V1 transcripts. Future Grain integration will set `source="grain"`.
