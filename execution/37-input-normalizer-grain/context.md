# Feature 37: Input Normalizer — Grain

## Summary
V2 enhancement — Build the Grain input normalizer that connects to the Grain API to pull transcripts by playlist or call ID. Converts Grain's transcript format to the same `NormalizedTranscript` interface established by feature 08 (text normalizer). Handles pagination and rate limits. Requires Grain Business plan for API access.

## Phase
Phase 9 — V2 Enhancements

## Dependencies
- **Blocked by**: 08 (Input Normalizer Text — establishes the `NormalizedTranscript` interface and normalizer pattern that Grain adapter must match), 10 (Transcript Endpoints — provides the `POST /clients/{id}/transcripts` endpoint that accepts normalized transcripts)
- **Blocks**: None (leaf node)

## Source PRDs
- `api-prd.md` — External Service Adapters (Grain Adapter), Transcript endpoints
- `mastra-prd.md` — System Context (Grain usage, playlists, call recordings)

## Relevant PRD Extracts

### External Service Adapters (api-prd.md)

> - **Grain Adapter** — Pulls transcripts by playlist/call ID. Handles pagination and rate limits.
>
> Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter — nothing else changes.

### Transcript Submission (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/clients/{id}/transcripts` | POST | Submit a new transcript (text or Grain reference) |

### System Context (mastra-prd.md)

- All client and internal calls are recorded via **Grain**, with transcripts available per call.
- Each client has a dedicated Grain "playlist" (folder of calls).
- After each client call, an internal **"intake" call** is held to discuss action items.

### Client Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `grain_playlist_id` | VARCHAR | Reference to the client's Grain playlist |

### Transcript Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `grain_call_id` | VARCHAR | Reference to the Grain recording |

### Workflow A Input (mastra-prd.md)

**Trigger:** Manual (account manager initiates after intake call)

**Input:** Grain call transcript (intake call)

### Open Questions (mastra-prd.md)

> - Does Grain have an API for pulling transcripts programmatically, or is copy-paste the input method?

## Scope

### In Scope
- Grain API adapter module in the API layer that fetches transcripts from Grain
- Fetch transcript by recording/call ID using the Get Recording endpoint (with optional transcript)
- Convert Grain's transcript format to the `NormalizedTranscript` interface:
  - `source` — set to `"grain"`
  - `sourceId` — Grain recording ID
  - `meetingDate` — from Grain recording metadata
  - `client` — from the API route parameter or client config (`grain_playlist_id`)
  - `meetingType` — from user input or inferred from call context
  - `participants` — extracted from Grain's speaker data
  - `durationSeconds` — from Grain recording metadata
  - `segments[]` — array of `{ speaker, timestamp, text }` parsed from Grain's transcript format
  - `summary` — empty/null (populated by Mastra agent later)
  - `highlights` — empty/null (populated by Mastra agent later)
- Pagination handling for large transcript responses
- Rate limit handling and retry logic for Grain API
- Grain API authentication (API key from secret manager)
- Error handling: Grain API errors, missing recordings, access denied

### Out of Scope
- Manual text paste/upload normalizer — that is feature 08 (already implemented)
- Transcript storage in Postgres — that is feature 10
- Transcript processing by Mastra agent — that is feature 19
- Listing recordings by playlist — documented endpoint may not exist (see open questions below)
- Webhook-triggered ingestion via Zapier — may be explored separately
- Grain workspace/account management

## Key Decisions
- **V2 feature, deferred from V1.** V1 uses manual paste/upload only (feature 08). Grain API integration was deferred because the API was newly released (Dec 2025) and requires a Business plan.
- **Grain API released Dec 2025, requires Business plan.** API access is gated behind Grain's Business plan. Must confirm account access before development.
- **Known endpoint: Get Recording.** Fetch a recording by ID with an optional transcript. This is the confirmed available endpoint.
- **NO documented List Recordings or List Playlists endpoint.** As of the latest API documentation, there is no way to list all recordings in a playlist or list all playlists programmatically. This limits the adapter to fetching individual recordings by ID.
- **Webhook triggers available via Zapier.** Grain offers "Recording Added" and "Recording Updated" triggers through Zapier. Direct webhook support is not confirmed.
- **Open questions that affect implementation:**
  - Can you list recordings by playlist ID? (No documented endpoint as of now)
  - When does the "Recording Updated" trigger fire? (After transcript is ready? After edits?)
  - Does Grain support direct webhooks, or is Zapier the only integration path?
- **Input normalizer pattern already established by feature 08.** The Grain adapter must produce the same `NormalizedTranscript` output as the text normalizer. The interface is defined in `packages/shared-types/`. The Grain adapter is a second implementation of the same normalizer interface with `source="grain"`.
- **Adapter lives in the API layer.** Consistent with all other external service adapters (Asana, Google Docs, Email). Mastra does not talk to Grain directly.
