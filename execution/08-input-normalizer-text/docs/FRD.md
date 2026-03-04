# Feature Requirement Document
# Feature 08: input-normalizer-text

## 1. Business Objective

The iExcel automation system processes call transcripts to generate structured Asana tasks and client-facing agendas. Before any agent can interpret a transcript, that transcript must exist in a predictable, uniform shape regardless of how it was submitted.

This feature delivers the **text input normalizer** — a module inside the API layer that accepts raw transcript text (either pasted inline or uploaded as a file) and converts it into a `NormalizedTranscript` object. That object is the single contract between the ingestion layer and the Mastra intake agent (Workflow A).

Without this normalizer:
- The Mastra agent would receive inconsistently structured text and need to handle format variations itself, mixing parsing logic into AI reasoning.
- Speaker attribution would be ambiguous or missing.
- Timestamps would be raw strings with no uniform representation.
- Adding Grain API support in V2 (feature 37) would require touching agent code rather than swapping one adapter.

The normalizer enforces a clean boundary: anything upstream deals with raw text; anything downstream deals only with `NormalizedTranscript`.

---

## 2. Target Users

| User | Role | Interaction |
|---|---|---|
| Account Manager | Primary user | Pastes or uploads transcript text when triggering the intake workflow |
| API layer (internal) | Consumer | Calls the normalizer during `POST /clients/{id}/transcripts` processing |
| Mastra intake agent | Downstream consumer | Receives `NormalizedTranscript`; never sees raw text |
| Feature 37 (Grain adapter) | Future adapter | Will produce the same `NormalizedTranscript` shape from Grain API responses |

---

## 3. User Problems Solved

**Problem 1 — Inconsistent transcript formats:**
Grain transcripts, manual copy-pastes, and uploaded `.txt` files all look different. Speaker labels, timestamps, and paragraph breaks vary by source. The normalizer absorbs these differences so that downstream consumers see a uniform structure.

**Problem 2 — Coupling agent logic to input format:**
Without a normalizer, the Mastra agent would need to handle "is this labeled by speaker name or just 'Speaker 1'?" inside its reasoning loop. This contaminates the agent's purpose and makes it fragile. The normalizer strips this concern out entirely.

**Problem 3 — V2 adapter compatibility:**
The Grain API integration (feature 37) must produce an output indistinguishable from the manual text normalizer. By defining the `NormalizedTranscript` contract now and implementing against it, feature 37 has a clear target and zero risk of diverging.

**Problem 4 — No standardized participant or duration data:**
Raw transcripts lack structured metadata. The normalizer extracts participants from speaker labels and derives `durationSeconds` from first and last timestamps, giving downstream consumers reliable metadata without re-parsing raw text.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Parse success rate for well-formed transcripts | 100% — all structured inputs produce a valid `NormalizedTranscript` |
| Participant extraction accuracy | All unique speaker labels in the transcript appear in the `participants` array |
| Duration calculation accuracy | `durationSeconds` matches the diff between first and last timestamp in the source text, within 1 second |
| Segment count fidelity | Every speaker turn in the raw text maps to exactly one `TranscriptSegment` |
| Graceful handling of unstructured text | Transcripts with no speaker labels or no timestamps still produce a valid `NormalizedTranscript` (single segment, empty participants, `durationSeconds: 0`) |
| Zero regression on downstream contract | `NormalizedTranscript` shape exactly matches the type defined in `@iexcel/shared-types` (feature 01) |

---

## 5. Business Constraints

- **V1 is text-only.** Grain API integration is strictly out of scope (feature 37). The normalizer must be designed so that feature 37 can produce the same `NormalizedTranscript` output via a parallel adapter without modifying this module.
- **No AI/LLM parsing.** The normalizer uses only deterministic, regex-based string processing. AI interpretation of transcript content is the Mastra agent's job (feature 19).
- **No persistence.** The normalizer is a pure function — it takes text, returns `NormalizedTranscript`. Saving to the database is feature 10's responsibility.
- **Module boundary.** The normalizer lives inside `apps/api/` as a module, not a separate service. It is called synchronously during the transcript submission handler.
- **`source` field is always `"manual"` in V1.** The normalizer hard-codes this value. Feature 37 will set `source: "grain"`.

---

## 6. Integration With Product Roadmap

| Position | Feature | Relationship |
|---|---|---|
| Prerequisite | 01 (shared-types-package) | Defines `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, and `TranscriptSource` types consumed by this feature |
| Prerequisite | 07 (api-scaffolding) | Provides the Express/Fastify application, middleware chain, and error handling patterns this module plugs into |
| Blocks | 10 (transcript-endpoints) | The `POST /clients/{id}/transcripts` handler calls this normalizer; feature 10 cannot be completed without it |
| Blocks | 37 (input-normalizer-grain) | Feature 37 implements the Grain adapter using the same `NormalizedTranscript` output contract established here |
| Downstream consumer | 19 (workflow-a-intake-agent) | The Mastra intake agent receives the `NormalizedTranscript` and performs AI interpretation on its segments |
