# Feature 15: Google Docs Adapter

## Summary
Build the Google Docs adapter within the API layer that converts agenda content into a Google Doc. Creates a new document or appends to an existing one based on client configuration. Handles formatting for the Running Notes structure including Completed Tasks, Incomplete Tasks, Deliverables, Recommendations, New Ideas, and Next Steps sections.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 14 (Agenda Endpoints — provides the export endpoint that triggers this adapter and the agenda data to convert), 09 (Client Management — client config determines create-vs-append behavior)
- **Blocks**: None directly (this is a leaf adapter consumed by the agenda export endpoint)

## Source PRDs
- api-prd.md (External Service Adapters — Google Docs Adapter, POST /agendas/{id}/export endpoint)
- asana-call-agenda.md (Running Notes format and section structure)

## Relevant PRD Extracts

### External Service Adapters (api-prd.md)

> - **Google Docs Adapter** — Converts agenda content to a Google Doc. Creates or appends based on client config.
>
> Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter — nothing else changes.

### Agenda Export Endpoint (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/agendas/{id}/export` | POST | Export to Google Docs |

### Running Notes Format (asana-call-agenda.md)

This note document is meant to provide a client-facing status update that explains:

- Completed Tasks
- Incomplete Tasks
- Relevant Deliverables
- Recommendations
- New Ideas
- "Next Steps"

### Automation Request (asana-call-agenda.md)

> 1. The completed tasks from Asana, for the respective client, are compiled in a summary-like way (not a data dump of raw tasks completed).
> 2. These summaries should be based around "themes" (most likely, the project that the task is related to).
> 3. Build a system that allows for these summaries to be "normalized" into a Google Doc (or, via API).

### Agendas Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `google_doc_id` | VARCHAR | Google Doc ID after export (nullable) |

### Clients Entity (database-prd.md)

The client record provides configuration context for the adapter (default workspace, project references, etc.).

## Scope

### In Scope
- Convert agenda content (markdown or rich text from Postgres) into Google Docs API format
- Format the Running Notes structure with proper headings and sections: Completed Tasks, Incomplete Tasks, Relevant Deliverables, Recommendations, New Ideas, Next Steps
- Create a new Google Doc when no existing document is configured for the client
- Append to an existing Google Doc when the client config specifies a target document
- Include cycle date range (cycle_start / cycle_end) in the document header
- Return the Google Doc ID to the calling endpoint for storage in the `google_doc_id` field on the agenda
- Handle Google Docs API authentication (service account credentials)
- Handle Google Docs API errors (rate limits, permission errors, quota limits)
- Adapter isolation — expose a clean interface so the adapter can be swapped without affecting callers

### Out of Scope
- Agenda content generation (that is feature 20 — Workflow B Agenda Agent)
- Agenda lifecycle management (that is feature 14 — Agenda Endpoints)
- Real-time collaborative editing in Google Docs
- Reading data back from Google Docs into the system
- Google Drive folder organization or permission management beyond document creation

## Key Decisions
- The adapter is isolated within the API layer following the adapter pattern described in api-prd.md. It exposes a clean interface (e.g., `exportToGoogleDoc(agendaContent, clientConfig)`) that the agenda export endpoint calls.
- Create-vs-append behavior is determined by client configuration. If a client has an existing Google Doc reference, the adapter appends a new cycle's Running Notes. Otherwise, it creates a new document.
- The adapter handles the translation from the system's internal content format (markdown or rich text) to Google Docs API requests (document elements, paragraphs, headings, lists).
- The resulting Google Doc ID is returned to the caller so it can be stored on the agenda record (`google_doc_id` field).
- Google Docs API credentials are stored in the cloud secret manager and injected at runtime per the infra-prd.md secret management pattern.
