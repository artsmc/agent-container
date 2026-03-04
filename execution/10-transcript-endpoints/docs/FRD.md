# FRD — Feature Requirement Document
# Feature 10: Transcript Endpoints

## 1. Overview

### 1.1 Feature Summary

Transcript Endpoints expose three REST endpoints that allow API consumers to submit, list, and retrieve call transcripts for a given client. Submitting a transcript (`POST /clients/{id}/transcripts`) invokes the text input normalizer (Feature 08) synchronously, then persists both the raw transcript text and the normalizer's structured output (as JSONB) in a single database row. The two read endpoints — `GET /clients/{id}/transcripts` (list) and `GET /transcripts/{id}` (detail) — return transcript records with permission scoping enforced on every request.

### 1.2 Business Context

The iExcel automation system processes client call recordings to extract action items. Before any AI processing can occur, the transcript must be durably stored and normalized into a consistent segment structure. Feature 10 is the entry point for that pipeline: it accepts raw text from the user, runs it through the normalizer, and stores both the original and structured forms so that downstream consumers (the Mastra Workflow A agent, historical analysis, audit purposes) always have access to the source material.

This feature is part of **Phase 3: API Core** and sits in **Wave 4** of the spec generation roadmap. It depends on API scaffolding (07), the text input normalizer (08), and client management (09), and is a direct prerequisite for task endpoints (11), workflow orchestration (17), Grain normalizer (37), and historical import (38).

### 1.3 Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| Account Manager | Can paste or upload a call transcript immediately after a client call; the system normalizes and stores it in one step, ready for AI processing. |
| Mastra Workflow A Agent | Has a durable, consistently structured transcript to read from; does not need to re-parse raw text at workflow time. |
| Web UI | Can display a client's transcript history (list) and the full detail of any transcript (raw + structured segments) without additional backend processing. |
| Terminal / Claude Client | Can submit transcripts programmatically and retrieve them for agent context building. |
| Audit / Compliance | Every transcript submission is a permanent, immutable record with full provenance (client, call type, call date, submission time). |

### 1.4 Success Metrics

- `POST /clients/{id}/transcripts` successfully normalizes and persists a transcript in a single round-trip, returning the created record with its UUID.
- The normalized `segments` JSONB column is populated on every successful submission; it is never NULL for submitted transcripts.
- `GET /clients/{id}/transcripts` returns only transcripts belonging to the specified client and accessible to the authenticated user, correctly paginated and sorted by `call_date` descending.
- `GET /transcripts/{id}` returns the full transcript record — including raw text and normalized segments — and enforces that the requesting user has access to the transcript's client.
- All three endpoints return `404` (not `403`) for resources that exist but the requesting user cannot access, preventing client or transcript ID enumeration.
- Zero transcript data leakage across client permission boundaries, verified by integration tests covering all three roles.

---

## 2. Target Users

### 2.1 Account Manager

Authenticated human user assigned to one or more clients. Primary submitter of transcripts. Pastes or uploads raw text from a call recording. Expects an immediate response confirming the transcript was saved and normalized. Also uses the list endpoint to review historical transcripts for a client.

### 2.2 Team Member

Read-only access to assigned clients' transcripts. Can list and retrieve transcripts to review call history, but cannot submit new transcripts.

### 2.3 Admin

Full system access. Can list and retrieve transcripts across all clients. Can submit transcripts on behalf of any client. Primary use case: administrative oversight and data correction.

### 2.4 Mastra Workflow A Agent (Service Account)

Authenticated via OIDC client credentials. The workflow receives a `transcript_id` at invocation time and calls `GET /transcripts/{id}` to retrieve the full normalized transcript before beginning AI processing. The agent does not submit transcripts — it reads ones already submitted by human users.

---

## 3. Business Constraints and Dependencies

### 3.1 Blocked By

- **Feature 07 (API Scaffolding)**: The API framework, auth middleware, route registration, and multipart upload handling must exist before transcript route handlers can be added.
- **Feature 08 (Input Normalizer — Text)**: `normalizeTextTranscript()` must be implemented and tested before the POST handler can call it. The normalizer is invoked synchronously inside the POST handler.
- **Feature 09 (Client Management)**: The `getClientById()` access-check function and the `clients` table must exist to validate `client_id` path parameters and enforce per-client permissions.

### 3.2 Blocks

- **Feature 11 (Task Endpoints)**: Tasks reference `transcript_id` (FK to `transcripts.id`). The transcripts table must exist and be populated before tasks can be linked.
- **Feature 17 (Workflow Orchestration)**: Workflow A accepts a `transcript_id` as its primary input. The transcript must already be persisted before the workflow is triggered.
- **Feature 37 (Input Normalizer — Grain)**: The Grain normalizer produces the same `NormalizedTranscript` structure and will persist records via the same transcript persistence layer introduced here.
- **Feature 38 (Historical Import)**: The bulk import pipeline writes directly to the `transcripts` table using the schema and persistence patterns established in this feature.

### 3.3 Out of Scope

The following are explicitly excluded from this feature:

- **Grain API integration** — Pulling transcripts automatically from Grain by playlist or call ID. Deferred to Feature 37.
- **Transcript processing by Mastra** — The AI analysis of transcript content for task extraction. Deferred to Feature 19 (Workflow A).
- **Workflow triggering from transcript submission** — The POST endpoint persists and normalizes; it does not invoke any workflow. Workflow triggering is Feature 17.
- **Transcript deletion or archival** — Transcripts are immutable source records. No DELETE or PATCH endpoint.
- **Transcript editing after submission** — Immutable. Corrections require a new submission.
- **`processed_at` population** — This timestamp is set later when the Mastra agent processes the transcript (Feature 19), not during initial submission.
- **`grain_call_id` population** — Nullable in V1. Only populated when Feature 37 is implemented.

---

## 4. Integration with Product Roadmap

Transcript Endpoints sit at the boundary between human data entry and machine processing. Every downstream AI workflow begins with a transcript that was submitted through this feature.

```
[Feature 10: Transcript Endpoints]
         |
         |---> [11: Task Endpoints] (transcript_id FK on tasks)
         |---> [17: Workflow Orchestration] (Workflow A input: transcript_id)
         |         |
         |         |---> [19: Workflow A — Intake Agent]
         |
         |---> [37: Input Normalizer — Grain] (reuses persistence layer)
         |---> [38: Historical Import] (bulk writes to transcripts table)
```

The `normalized_segments` JSONB column introduced here is the primary data structure consumed by Workflow A. Getting this schema right in Feature 10 directly affects AI quality in Features 17 and 19.
