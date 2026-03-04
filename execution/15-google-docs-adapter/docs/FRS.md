# Functional Requirement Specification
# Feature 15: Google Docs Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

The Google Docs adapter is a module within `apps/api/src/adapters/google-docs/`. It exposes a single primary function `exportToGoogleDoc(agendaContent, clientConfig)` that the agenda export endpoint (Feature 14) calls when `POST /agendas/{id}/export` is triggered. The adapter returns the Google Doc ID of the created or updated document.

---

## 2. Functional Requirements

### FR-01: Accept Structured Agenda Content

**Requirement:** The adapter's primary function must accept an `AgendaExportInput` object containing:
- `agendaId` — UUID
- `shortId` — e.g., `AGD-0015`
- `content` — The agenda content as a ProseMirror JSON document object (as stored in `agendas.content` JSONB column). The adapter parses ProseMirror nodes to extract the 6 Running Notes sections.
- `cycleStart` — ISO date string (e.g., `"2026-02-17"`)
- `cycleEnd` — ISO date string (e.g., `"2026-02-28"`)
- `clientName` — string (for document title)

---

### FR-02: Accept Client Configuration

**Requirement:** The adapter must accept a `ClientDocConfig` object containing:
- `googleDocId` — string or null (the existing document to append to, if any)
- `clientName` — string

If `googleDocId` is non-null and non-empty, the adapter operates in **append mode**. If null or empty, the adapter operates in **create mode**.

---

### FR-03: Create Mode — New Google Doc

**Requirement:** When `clientConfig.googleDocId` is null, the adapter MUST:
1. Create a new Google Doc using the Google Docs API (`documents.create`).
2. Set the document title to: `"{clientName} — Running Notes"` (e.g., `"Total Life — Running Notes"`).
3. Populate the document body with the formatted Running Notes structure (see FR-05).
4. Return the new document's `documentId`.

---

### FR-04: Append Mode — Existing Google Doc

**Requirement:** When `clientConfig.googleDocId` is non-null, the adapter MUST:
1. Retrieve the existing document's end index using `documents.get` (to find the insertion point).
2. Append a new cycle entry to the end of the document without modifying existing content.
3. Insert a section separator (horizontal rule or page break equivalent) before the new cycle entry if the document already has content.
4. Populate the appended section with the formatted Running Notes structure (see FR-05).
5. Return the same `googleDocId` (the document ID does not change on append).

---

### FR-05: Running Notes Document Structure

**Requirement:** Every export (create or append) MUST produce the following section structure in the Google Doc:

```
[Cycle Header]            — Heading 1: "Running Notes — {cycleStart} to {cycleEnd}"
                            e.g., "Running Notes — Feb 17 to Feb 28, 2026"

[Completed Tasks]         — Heading 2: "Completed Tasks"
                            Content from the agenda's completed tasks section

[Incomplete Tasks]        — Heading 2: "Incomplete Tasks"
                            Content from the agenda's incomplete tasks section

[Relevant Deliverables]   — Heading 2: "Relevant Deliverables"
                            Content from the agenda's deliverables section

[Recommendations]         — Heading 2: "Recommendations"
                            Content from the agenda's recommendations section

[New Ideas]               — Heading 2: "New Ideas"
                            Content from the agenda's new ideas section

[Next Steps]              — Heading 2: "Next Steps"
                            Content from the agenda's next steps section
```

**Heading styles:**
- Cycle header → Google Docs `HEADING_1`
- Section headers (Completed Tasks, etc.) → Google Docs `HEADING_2`
- Section body content → `NORMAL_TEXT` paragraph style

**Content parsing (see FR-06):** The agenda's `content` field must be parsed to extract the text for each of the 6 sections.

---

### FR-06: ProseMirror JSON Content Parsing

**Requirement:** The adapter must parse the agenda `content` field (stored as ProseMirror JSON) to extract the 6 sections. Parsing strategy:

1. Walk the ProseMirror document's `content` array of nodes.
2. Identify `heading` nodes (with `attrs.level` indicating heading level) whose text content matches the 6 recognized section names (case-insensitive):
   - `Completed Tasks`
   - `Incomplete Tasks`
   - `Relevant Deliverables` (or `Deliverables`)
   - `Recommendations`
   - `New Ideas`
   - `Next Steps`
3. Extract the nodes between each heading and the next heading (or end of document).
4. Convert extracted ProseMirror nodes to Google Docs API structural elements:
   - `heading` node → Google Docs heading (HEADING_1 or HEADING_2 based on level)
   - `paragraph` node → Google Docs NORMAL_TEXT paragraph
   - `bulletList` / `listItem` nodes → Google Docs unordered list items
   - Text nodes with `bold` mark → Google Docs bold text runs

**Missing sections:** If a section is absent from the agenda content, include the section heading in the Google Doc but leave the body empty (do not skip the section).

**Fallback:** If no recognized section headings are found in the ProseMirror nodes (unstructured content), serialize all nodes as plain text and insert as a single `NORMAL_TEXT` block under the cycle header.

---

### FR-07: ProseMirror Node Conversion

**Requirement:** The adapter must convert ProseMirror nodes to Google Docs API requests:
- `bulletList` containing `listItem` nodes → Google Docs unordered list items using `createParagraphBullets` or equivalent batch update request.
- Text nodes with `bold` mark → Google Docs bold text runs.
- Text nodes with `italic` mark → Google Docs italic text runs.
- `paragraph` nodes → Google Docs NORMAL_TEXT paragraphs.
- All other node types are serialized as plain text.

---

### FR-08: Google Docs API Authentication

**Requirement:** The adapter authenticates to the Google Docs API using a Google service account. The service account credentials (JSON key file contents) are retrieved from the cloud secret manager at adapter initialization time. The adapter MUST NOT hardcode credentials or store them in Postgres.

Authentication flow:
1. Read credential JSON from the injected secret (string, parsed to object).
2. Create a Google Auth client using the service account with scope `https://www.googleapis.com/auth/documents`.
3. Pass the auth client to the Google Docs API client.

---

### FR-09: Return Google Doc ID

**Requirement:** On success, the adapter MUST return an object containing:
- `googleDocId` — the document ID string (new ID for create mode, existing ID for append mode)
- `documentUrl` — the full Google Docs URL (`https://docs.google.com/document/d/{id}/edit`)

The calling endpoint (Feature 14) uses `googleDocId` to update `agendas.google_doc_id`.

---

### FR-10: Error Handling

**Requirement:** The adapter MUST handle Google Docs API errors as follows:

| Error | Behavior |
|---|---|
| `401 / 403` (auth failure) | Throw `GoogleDocsAdapterError` with code `GOOGLE_AUTH_FAILED` |
| `404` (document not found in append mode) | Throw `GoogleDocsAdapterError` with code `GOOGLE_DOC_NOT_FOUND` — do NOT fall back to create mode silently |
| `429` (rate limit) | Retry up to 3 times with exponential back-off |
| `5xx` | Retry up to 3 times with exponential back-off |
| Network timeout (>30s) | Throw `GoogleDocsAdapterError` with code `GOOGLE_DOCS_TIMEOUT` |
| All retries exhausted | Throw `GoogleDocsAdapterError` with code `GOOGLE_DOCS_UNAVAILABLE` |

**On error:** The Google Doc (if partially created) is left in its partial state. No rollback is attempted. The `agendas.google_doc_id` field is NOT updated.

---

### FR-11: Logging

**Requirement:** The adapter MUST emit structured Pino log events at:

| Event | Level | Fields |
|---|---|---|
| Export started | `info` | `agendaId`, `shortId`, `mode` (`create` or `append`) |
| Google Doc created | `info` | `agendaId`, `googleDocId`, `documentUrl` |
| Content appended | `info` | `agendaId`, `googleDocId`, `documentUrl` |
| Google API retry | `warn` | `agendaId`, `attempt`, `statusCode` |
| Export completed | `info` | `agendaId`, `googleDocId`, `durationMs` |

Agenda content MUST NOT be logged. Google service account credentials MUST NOT be logged.

---

## 3. Caller Interface

The adapter exposes a clean interface called by Feature 14's export endpoint:

```typescript
async function exportToGoogleDoc(
  input: AgendaExportInput,
  clientConfig: ClientDocConfig,
  credentials: GoogleServiceAccountCredentials,
  logger: Logger
): Promise<GoogleDocExportResult>
```

The adapter does not fetch agenda content or client config from the database itself — those are provided by the calling endpoint. This keeps the adapter pure and independently testable.

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Idempotency | Not guaranteed. Calling export twice produces two append entries in the same document (or two separate documents in create mode). The calling endpoint controls whether to re-export. |
| Timeout budget | Total export operation must complete within 30 seconds |
| Adapter isolation | The adapter must be swappable. No Google Docs API types should leak into the calling endpoint's type signature. |
| Credential lifecycle | Credentials are passed in per-call — the adapter does not cache them. Auth client objects are created per-call in V1. |
