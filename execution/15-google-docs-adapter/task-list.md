# Task List
# Feature 15: Google Docs Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Blocked by:** Feature 14 (agenda-endpoints), Feature 09 (client-management)
**Blocks:** None (leaf node)

---

## Prerequisites Checklist

Before starting this feature, confirm:
- [ ] Feature 14 is merged and `POST /agendas/{id}/export` handler exists (stub is acceptable)
- [ ] Confirm with Feature 14 team: is `agendas.content` stored as markdown or ProseMirror JSON? (References: TR.md Section 15 Open Questions). This determines whether `content-parser.ts` parses markdown or JSON.
- [ ] Confirm whether `clients` table has a `google_doc_id` field for the create-vs-append config. If not, determine if Feature 09 or this feature adds it. (References: TR.md Section 15 Open Questions)
- [ ] Confirm service account credential secret name in the cloud secret manager (e.g., `GOOGLE_SERVICE_ACCOUNT_JSON`)
- [ ] Service account must be created in Google Cloud Console with Docs API access enabled

---

## Phase 1: Type Definitions and Error Class

- [ ] **Define `AgendaExportInput` interface** in `apps/api/src/adapters/google-docs/adapter.ts`
  - Fields: agendaId, shortId, content, cycleStart, cycleEnd, clientName
  - References: FRS.md Section FR-01, TR.md Section 2.1

- [ ] **Define `ClientDocConfig` interface**
  - Fields: googleDocId (string | null), clientName
  - References: FRS.md Section FR-02, TR.md Section 2.1

- [ ] **Define `GoogleDocExportResult` interface**
  - Fields: googleDocId, documentUrl
  - References: FRS.md Section FR-09, TR.md Section 2.1

- [ ] **Define `GoogleServiceAccountCredentials` interface**
  - Match standard Google service account JSON key fields
  - References: FRS.md Section FR-08, TR.md Section 2.1

- [ ] **Define `ParsedAgendaContent` interface** in `content-parser.ts`
  - 6 string fields: completedTasks, incompleteTasks, relevantDeliverables, recommendations, newIdeas, nextSteps
  - References: TR.md Section 2.2

- [ ] **Implement `GoogleDocsAdapterError` class** in `google-docs-error.ts`
  - Error codes: `GOOGLE_AUTH_FAILED`, `GOOGLE_DOC_NOT_FOUND`, `GOOGLE_DOCS_TIMEOUT`, `GOOGLE_DOCS_UNAVAILABLE`
  - References: FRS.md Section FR-10, TR.md Section 2.3

---

## Phase 2: Content Parser

- [ ] **Implement `parseAgendaContent` function** in `content-parser.ts`
  - Detect the 6 section headers via regex (case-insensitive)
  - Support alternate names: "Deliverables" for "Relevant Deliverables", "Outstanding Tasks" for "Incomplete Tasks"
  - Extract content between each header and the next
  - Return all 6 fields; absent sections return empty string
  - References: FRS.md Section FR-06, TR.md Section 3.1

- [ ] **Handle no-section fallback** — when no recognized headers are found, return empty strings for all 6 sections (caller inserts raw content)
  - References: FRS.md Section FR-06 (Fallback), GS.md Scenario "Unstructured content"

- [ ] **Implement `formatCycleHeader` function** in `content-parser.ts`
  - Converts ISO date strings to "Running Notes — Feb 17 to Feb 28, 2026" format
  - References: FRS.md Section FR-05, TR.md Section 3.2

---

## Phase 3: Document Formatter

- [ ] **Implement `buildDocumentRequests` function** in `document-formatter.ts`
  - Accepts `ParsedAgendaContent`, `cycleStart`, `cycleEnd`, `startIndex`
  - Builds array of `docs_v1.Schema$Request` objects
  - Inserts cycle header as HEADING_1
  - Inserts each of the 6 section headers as HEADING_2
  - Inserts section body content as NORMAL_TEXT
  - Tracks character index correctly across all insertions
  - References: FRS.md Section FR-05, TR.md Section 4.1

- [ ] **Implement `convertMarkdownToPlainText` helper**
  - Convert `- item` / `* item` to `• item` (V1 simplification — flag as tech debt for V2 native list formatting)
  - Strip `**bold**` markers (text preserved)
  - Strip `*italic*` markers (text preserved)
  - Strip inline `` `code` `` markers
  - References: FRS.md Section FR-07, TR.md Section 4.2

- [ ] **Implement empty section handling** — if section content is empty, insert a blank `\n` to preserve spacing
  - References: FRS.md Section FR-06 (Missing sections), GS.md Scenario "Missing section"

- [ ] **Implement `buildSeparatorRequest` helper** — inserts a visual separator before appended content
  - References: FRS.md Section FR-04 (Separator), GS.md Scenario "Separator is inserted before appended content"

---

## Phase 4: Google Docs HTTP Client

- [ ] **Install `googleapis` npm package** in `apps/api/package.json`
  - References: TR.md Section 9

- [ ] **Implement `createDocsClient` helper** in `google-docs-client.ts`
  - Initializes `GoogleAuth` with service account credentials
  - Sets scope `https://www.googleapis.com/auth/documents`
  - Returns `docs_v1.Docs` client instance
  - References: FRS.md Section FR-08, TR.md Section 5.1

- [ ] **Implement `createDocument` function** in `google-docs-client.ts`
  - Calls `docs.documents.create` with the title
  - Extracts and returns `documentId`
  - Wrapped in `withRetry`
  - References: FRS.md Section FR-03, TR.md Section 5.2

- [ ] **Implement `getDocumentEndIndex` function** in `google-docs-client.ts`
  - Calls `docs.documents.get`
  - Returns the end index of the last body content element
  - Returns 1 for empty documents
  - Wrapped in `withRetry`
  - References: FRS.md Section FR-04, TR.md Section 5.3

- [ ] **Implement `batchUpdate` function** in `google-docs-client.ts`
  - Calls `docs.documents.batchUpdate` with the requests array
  - Wrapped in `withRetry`
  - References: TR.md Section 5.4

- [ ] **Implement `withRetry` wrapper** in `google-docs-client.ts`
  - Uses `p-retry` with 3 total attempts and exponential back-off
  - Throws `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')` as `AbortError` for 401/403
  - Throws `GoogleDocsAdapterError('GOOGLE_DOC_NOT_FOUND')` as `AbortError` for 404
  - Retries on 429 and 5xx
  - References: FRS.md Section FR-10, TR.md Section 5.5

---

## Phase 5: Main Adapter Orchestration

- [ ] **Implement `exportToGoogleDoc` function** in `adapter.ts`
  - Determine mode (create vs append) from `clientConfig.googleDocId`
  - Parse content using `parseAgendaContent`
  - Create mode: call `createDocument`, set `startIndex = 1`
  - Append mode: call `getDocumentEndIndex`, set `startIndex = endIndex`
  - Build requests using `buildDocumentRequests`
  - Append mode: prepend separator request
  - Execute `batchUpdate`
  - Return `GoogleDocExportResult`
  - References: FRS.md Section FR-03, FR-04, TR.md Section 6.1

- [ ] **Add structured log: Export started** (info, agendaId, shortId, mode)
  - References: FRS.md Section FR-11

- [ ] **Add structured log: Google Doc created** (info, agendaId, googleDocId, documentUrl)
  - References: FRS.md Section FR-11

- [ ] **Add structured log: Content appended** (info, agendaId, googleDocId, documentUrl)
  - References: FRS.md Section FR-11

- [ ] **Add structured log: Export completed** (info, agendaId, googleDocId, durationMs)
  - References: FRS.md Section FR-11

- [ ] **Verify service account credentials are never logged** — confirm no log event in any path includes credential fields
  - References: FRS.md Section FR-11, TR.md Section 12

---

## Phase 6: Export and Integration Wiring

- [ ] **Export `exportToGoogleDoc` and all public types from `index.ts`**
  - References: TR.md Section 7.2

- [ ] **Verify Feature 14's call site compiles** — Feature 14 imports and calls `exportToGoogleDoc` with correct types
  - References: TR.md Section 7.1

---

## Phase 7: Unit Tests

- [ ] **Write unit tests for `content-parser.ts`** (`__tests__/content-parser.test.ts`)
  - Test cases: all sections present, case insensitive matching, missing section returns empty string, no sections fallback, alternate section names, multi-line content, cycle header formatting
  - References: TR.md Section 8.1

- [ ] **Write unit tests for `document-formatter.ts`** (`__tests__/document-formatter.test.ts`)
  - Test cases: all 6 sections produce HEADING_2 + content, empty section produces heading + blank line, bullet conversion, bold stripping, correct index tracking
  - References: TR.md Section 8.2

---

## Phase 8: Integration Tests

- [ ] **Write integration tests** (`__tests__/adapter.integration.test.ts`)
  - Mock `googleapis` at the method level using `vi.mock`
  - Test cases: create mode success, append mode success, 401 abort, 403 abort, 404 abort (no fallback), 429 retry success, 429 exhausted, 503 retry, unstructured content fallback
  - References: TR.md Section 8.3, GS.md all scenarios

- [ ] **Verify no real Google API calls in test suite**

- [ ] **Verify test coverage meets 85% threshold**

---

## Phase 9: Tech Debt Documentation

- [ ] **Add a code comment in `document-formatter.ts`** noting that bullet list formatting uses plain `•` prefix in V1 and should be replaced with `createParagraphBullets` API requests in V2
  - References: TR.md Section 4.1 note, TR.md Section 15 Open Questions

---

## Phase 10: Final Verification

- [ ] **Run full adapter test suite**: `nx run api:test --testPathPattern=adapters/google-docs`
- [ ] **Run type check**: `nx run api:type-check`
- [ ] **Run lint**: `nx run api:lint`
- [ ] **Manual smoke test**: Export one test agenda to a real Google Doc (with real service account credentials in dev environment)
- [ ] **Confirm `agendas.google_doc_id` is updated correctly** in the Feature 14 call site after adapter returns
