# Feature Requirements Document
# Feature 37: Input Normalizer — Grain

## 1. Overview

### 1.1 Feature Summary

Feature 37 delivers the Grain input normalizer — a V2 enhancement to the iExcel automation system's transcript ingestion pipeline. It introduces a dedicated adapter that connects to the Grain API, fetches call recordings by ID, and converts Grain's native transcript format into the same `NormalizedTranscript` interface established by Feature 08 (text normalizer). This eliminates the manual copy-paste step that account managers currently perform when submitting intake call transcripts.

### 1.2 Business Objective

In V1, account managers must manually copy transcript text from Grain and paste it into the transcript submission interface. This is a friction point that adds time to the post-intake workflow and introduces the risk of copy errors, partial transcripts, or transcripts being submitted for the wrong call. The Grain adapter removes this friction entirely: the account manager provides a Grain recording ID, and the system fetches and normalizes the transcript automatically.

### 1.3 Target Users

| User | Interaction |
|---|---|
| Account Manager | Provides a Grain recording ID when triggering a workflow or submitting a transcript via the API or terminal client |
| System (Mastra Workflow A) | May pass a Grain recording reference when invoking the transcript submission endpoint |

### 1.4 Value Proposition

- **Eliminates manual transcript copy-paste.** Reduces the post-intake call workflow from multiple manual steps to a single API call.
- **Improves data fidelity.** Pulls the authoritative transcript directly from Grain rather than relying on user-copied text.
- **Consistent output.** The Grain adapter produces the identical `NormalizedTranscript` structure as the text normalizer — the rest of the pipeline (Feature 10 storage, Feature 19 Mastra processing) requires no changes.
- **Foundation for automation.** Establishing the Grain adapter enables future webhook-triggered ingestion (e.g., Zapier "Recording Added" trigger → auto-submit) without additional normalizer work.

### 1.5 Success Metrics

| Metric | Target |
|---|---|
| Transcript ingestion time (Grain recording → stored NormalizedTranscript) | < 10 seconds end-to-end |
| Adapter error rate on valid Grain recording IDs | < 1% |
| Zero copy-paste submission failures caused by truncated or malformed pasted text | Baseline improvement |

---

## 2. Phase and Dependencies

### 2.1 Phase

Phase 9 — V2 Enhancements

### 2.2 Upstream Dependencies

| Feature | Why Required |
|---|---|
| **Feature 08** (Input Normalizer Text) | Establishes the `NormalizedTranscript` interface and `NormalizerError` class. The Grain adapter is a second implementation of the same normalizer pattern. The `@iexcel/shared-types` package exports the shared interface. |
| **Feature 10** (Transcript Endpoints) | Provides the `POST /clients/{id}/transcripts` endpoint. Feature 37 extends the Grain submission path on this endpoint, which currently only accepts raw text (Feature 08). |

### 2.3 Downstream Dependents

Feature 37 is a leaf node. No features are blocked by it. Feature 38 (Historical Import) reuses the Grain adapter at runtime but was designed in parallel and does not depend on Feature 37 completing first; the adapter interface contract is already defined in `@iexcel/shared-types`.

---

## 3. Context: V1 vs V2 Transcript Submission

### 3.1 V1 Approach (Feature 08)

The account manager copies the transcript text from Grain's web interface and submits it to `POST /clients/{id}/transcripts` as a raw text body or `.txt` file upload. The Feature 08 text normalizer parses this text into a `NormalizedTranscript` with `source = "manual"`.

### 3.2 V2 Approach (Feature 37)

The account manager submits a Grain recording ID to `POST /clients/{id}/transcripts`. The API handler recognizes the Grain submission mode, calls the Grain adapter to fetch and normalize the transcript, and stores the result with `source = "grain"` and `sourceId = <grain_recording_id>`. The account manager never touches the transcript text directly.

### 3.3 Grain API Context

Grain released its API in December 2025. API access requires a Grain Business plan. The confirmed available endpoint for this feature is the **Get Recording** endpoint, which returns recording metadata and optionally an inline transcript. There is no documented "List Recordings by Playlist" endpoint — the adapter is therefore fetch-by-ID only. Webhook-triggered ingestion via Zapier exists as a future path but is out of scope for this feature.

---

## 4. Business Constraints

| Constraint | Impact |
|---|---|
| Grain API requires Business plan | Must confirm Grain account tier before deploying. API key provisioning is a prerequisite. |
| No list-by-playlist endpoint | The adapter fetches individual recordings by ID. The UI/terminal must surface the recording ID to the account manager. Bulk playlist ingestion is not supported in this feature. |
| Grain API was newly released (Dec 2025) | API surface may evolve. The adapter must be isolated (isolated module, single responsibility) so that Grain API changes require only adapter changes, not pipeline changes. |
| API key in secret manager | Grain API key must not be stored in the database or committed to the repository. It is retrieved at runtime from the secret manager (same pattern as Asana access tokens in Feature 12). |

---

## 5. Scope

### 5.1 In Scope

- Grain API adapter module in `apps/api/src/normalizers/grain/`
- Fetch a Grain recording by ID using the Grain Get Recording endpoint (with transcript included)
- Convert Grain's transcript data to the `NormalizedTranscript` interface:
  - `source = "grain"`
  - `sourceId` = Grain recording ID
  - All other fields mapped from Grain's response (see FRS.md)
- Pagination handling for Grain API responses that paginate transcript segments
- Rate limit handling and retry logic (exponential back-off)
- Grain API authentication via API key retrieved from secret manager
- Error types: `GRAIN_RECORDING_NOT_FOUND`, `GRAIN_ACCESS_DENIED`, `GRAIN_API_ERROR`, `GRAIN_TRANSCRIPT_UNAVAILABLE`
- Extending `POST /clients/{id}/transcripts` to accept a Grain recording ID as an alternative to raw text

### 5.2 Out of Scope

- Manual text paste/upload normalizer (Feature 08, already implemented)
- Transcript storage in Postgres (Feature 10, already implemented)
- Transcript processing by Mastra agent (Feature 19)
- Listing recordings by playlist (no documented Grain API endpoint)
- Webhook-triggered ingestion via Zapier
- Grain workspace or account management
- Historical transcript import (Feature 38, separate feature)

---

## 6. Open Questions

| Question | Impact if Unresolved |
|---|---|
| Can Grain recordings be listed by playlist ID? | If resolved as Yes, a future enhancement could support bulk playlist ingestion |
| When does the "Recording Updated" Zapier trigger fire? | Determines viability of auto-submission after transcript becomes available |
| Does Grain support direct webhooks, or is Zapier the only integration path? | Affects design of a future real-time ingestion feature |
| What is the exact shape of Grain's transcript segments in the API response? | Must be confirmed against Grain API docs during implementation |
