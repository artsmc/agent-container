# Task List
## Feature 15: Google Docs Adapter

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 07 (api-scaffolding) is complete — Fastify app, Pino logger, error handling patterns, `p-retry` dependency, Vitest setup are available
- [ ] Feature 14 (agenda-endpoints) is complete or in progress — `POST /agendas/{id}/export` endpoint exists and will call this adapter
- [ ] Feature 09 (client-management) is complete — client config includes `googleDocId` field (or equivalent) for create-vs-append determination
- [ ] Feature 04 (product-database-schema) is complete — `agendas.google_doc_id` column exists
- [ ] `googleapis` npm package is added to `apps/api/package.json` as a runtime dependency
- [ ] Google service account is provisioned and the JSON credential is stored in the cloud secret manager
- [ ] Coordinate with Feature 14 team: confirm the `POST /agendas/{id}/export` handler will provide `AgendaExportInput`, `ClientDocConfig`, and `GoogleServiceAccountCredentials` to the adapter

---

## Phase 1: Types and Error Classes

### Task 1.1 — Define adapter input/output types
**Complexity:** Small
**References:** TR.md Section 2.1, FRS.md FR-01, FR-02, FR-09

Create `apps/api/src/adapters/google-docs/adapter.ts` (initial type definitions):
- `AgendaExportInput` interface: `agendaId`, `shortId`, `content`, `cycleStart`, `cycleEnd`, `clientName`
- `ClientDocConfig` interface: `googleDocId` (string or null), `clientName`
- `GoogleServiceAccountCredentials` interface: standard Google service account JSON fields
- `GoogleDocExportResult` interface: `googleDocId`, `documentUrl`

**Verification:** Types compile without errors.

---

### Task 1.2 — Implement `GoogleDocsAdapterError` class
**Complexity:** Small
**References:** TR.md Section 2.3, FRS.md FR-10

Create `apps/api/src/adapters/google-docs/google-docs-error.ts`:
- `GoogleDocsErrorCode` type: `'GOOGLE_AUTH_FAILED' | 'GOOGLE_DOC_NOT_FOUND' | 'GOOGLE_DOCS_TIMEOUT' | 'GOOGLE_DOCS_UNAVAILABLE'`
- `GoogleDocsAdapterError` class extending `Error` with `code`, `details`, and `name = 'GoogleDocsAdapterError'`

**Verification:** Error class instantiates with each code. `instanceof GoogleDocsAdapterError` works.

---

## Phase 2: Content Parser

### Task 2.1 — Implement `parseAgendaContent` function
**Complexity:** Medium
**References:** TR.md Section 3.1, FRS.md FR-06

Create `apps/api/src/adapters/google-docs/content-parser.ts`:
- `ParsedAgendaContent` interface: 6 string fields (completedTasks, incompleteTasks, relevantDeliverables, recommendations, newIdeas, nextSteps)
- `SECTION_PATTERNS` — regex patterns for detecting each section header (case-insensitive, supports `#`, `##`, `###`)
- `parseAgendaContent(markdown)` function:
  - Scan for section headers using the pattern map
  - Extract text between each header and the next (or end of content)
  - If no recognized sections found, return all sections as empty strings
- Support alternate section names (e.g., `## Deliverables` for `relevantDeliverables`)

**Verification:**
- All 6 sections present in input → all 6 populated in output
- Case-insensitive header detection works
- Missing section → empty string for that section
- No recognized headers → all sections empty
- Alternate section names (e.g., `## Deliverables`) detected correctly

---

### Task 2.2 — Implement `formatCycleHeader` utility
**Complexity:** Small
**References:** TR.md Section 3.2, FRS.md FR-05

In `apps/api/src/adapters/google-docs/content-parser.ts`:
- `formatCycleHeader(cycleStart, cycleEnd)`: formats as `"Running Notes — Feb 17 to Feb 28, 2026"`
- Uses UTC to avoid timezone issues with ISO date strings

**Verification:** `formatCycleHeader('2026-02-17', '2026-02-28')` returns `"Running Notes — Feb 17 to Feb 28, 2026"`.

---

## Phase 3: Document Formatter

### Task 3.1 — Implement `buildDocumentRequests` function
**Complexity:** Medium
**References:** TR.md Section 4, FRS.md FR-05, FR-07

Create `apps/api/src/adapters/google-docs/document-formatter.ts`:
- `buildDocumentRequests(parsed, cycleStart, cycleEnd, startIndex)` function:
  - Builds Google Docs API `batchUpdate` request array
  - Inserts cycle header as `HEADING_1`
  - Inserts 6 section headings as `HEADING_2` with section body as `NORMAL_TEXT`
  - Empty sections still produce the heading followed by a blank line
  - Tracks `currentIndex` throughout all insertions
- `convertMarkdownToPlainText(markdown)` helper:
  - `- item` / `* item` → `bullet item`
  - `**bold**` → `bold` (markers stripped for V1)
  - `` `code` `` → `code`
  - Trim whitespace

**Verification:**
- All 6 sections produce heading + content insertion requests
- Empty section produces heading + empty line
- Bullet list markers are converted to bullet prefix
- Bold markers are stripped
- Index tracking: second section starts at correct character position

---

### Task 3.2 — Implement separator request builder
**Complexity:** Small
**References:** FRS.md FR-04

In `document-formatter.ts`:
- `buildSeparatorRequest(insertIndex)` — builds a request to insert a horizontal rule (or double newline with line) before appended content in append mode

**Verification:** Separator request inserts at the correct index.

---

## Phase 4: Google Docs API Client

### Task 4.1 — Implement Google Docs client wrapper
**Complexity:** Medium
**References:** TR.md Section 5, FRS.md FR-08

Create `apps/api/src/adapters/google-docs/google-docs-client.ts`:
- `createDocsClient(credentials)` — initializes `GoogleAuth` with service account credentials and scope `https://www.googleapis.com/auth/documents`, returns `docs_v1.Docs` instance
- `createDocument(title, credentials)` — calls `documents.create`, returns `documentId`
- `getDocumentEndIndex(documentId, credentials)` — calls `documents.get`, calculates insertion point from last content element
- `batchUpdate(documentId, requests, credentials)` — calls `documents.batchUpdate`
- `withRetry(fn)` — retry wrapper using `p-retry`:
  - `401/403`: non-retryable, throw `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')`
  - `404`: non-retryable, throw `GoogleDocsAdapterError('GOOGLE_DOC_NOT_FOUND')`
  - `429/5xx`: retryable with exponential back-off (max 2 retries)
- `getGoogleApiErrorStatus(err)` — extracts HTTP status from Google API error objects

**Verification:**
- `createDocument` returns a document ID string
- `getDocumentEndIndex` returns correct index for empty and non-empty documents
- 401/403 throws `GOOGLE_AUTH_FAILED` immediately
- 404 throws `GOOGLE_DOC_NOT_FOUND` immediately
- 429 retries and succeeds on next attempt

---

## Phase 5: Main Adapter Orchestration

### Task 5.1 — Implement `exportToGoogleDoc` function
**Complexity:** Large
**References:** TR.md Section 6, FRS.md FR-03, FR-04

Implement the main orchestration function in `apps/api/src/adapters/google-docs/adapter.ts`:

1. Determine mode: `create` if `clientConfig.googleDocId` is null, `append` otherwise
2. Log export started with `agendaId`, `shortId`, `mode`
3. Parse agenda content into 6 sections (Task 2.1)
4. Create mode:
   - Create new document with title `"{clientName} — Running Notes"` (Task 4.1)
   - `startIndex = 1`
   - Log document created
5. Append mode:
   - Get existing document's end index (Task 4.1)
   - `startIndex = endIndex`
6. Build batch update requests (Task 3.1)
7. In append mode: prepend separator request (Task 3.2)
8. Execute batch update
9. Log completion with `durationMs`
10. Return `{ googleDocId, documentUrl }`

**Verification:**
- Create mode: new doc created, content inserted, correct `googleDocId` returned
- Append mode: existing doc fetched, content appended at end, same `googleDocId` returned
- Separator inserted only in append mode
- All logs emitted at correct points
- Error propagation from Google Docs client works correctly

---

### Task 5.2 — Wire public export in `index.ts`
**Complexity:** Small
**References:** TR.md Section 7.2

Create `apps/api/src/adapters/google-docs/index.ts`:
- Export `exportToGoogleDoc` from `adapter.ts`
- Export types: `AgendaExportInput`, `ClientDocConfig`, `GoogleDocExportResult`, `GoogleServiceAccountCredentials`
- Export `GoogleDocsAdapterError` from `google-docs-error.ts`

**Verification:** Downstream consumers (Feature 14) can import all exported symbols.

---

## Phase 6: Testing

### Task 6.1 — Unit tests for `content-parser.ts`
**Complexity:** Small
**References:** TR.md Section 8.1

Create `apps/api/src/adapters/google-docs/__tests__/content-parser.test.ts`:

Test cases:
- All 6 sections present → all populated
- Section header case insensitive (`## COMPLETED TASKS`)
- Missing section → `newIdeas: ''`
- No recognized sections → all empty strings
- Alternate section names (`## Deliverables` → `relevantDeliverables`)
- Multi-line section content extracted correctly
- Cycle header formatting: `"2026-02-17"` + `"2026-02-28"` → `"Running Notes — Feb 17 to Feb 28, 2026"`

**Verification:** All tests pass.

---

### Task 6.2 — Unit tests for `document-formatter.ts`
**Complexity:** Small
**References:** TR.md Section 8.2

Create `apps/api/src/adapters/google-docs/__tests__/document-formatter.test.ts`:

Test cases:
- All sections generate HEADING_2 + content insertions (6 headings + 6 bodies)
- Empty section generates heading + empty line
- Bullet list `- item` converted to `bullet item` prefix
- Bold markers `**bold**` stripped → `bold`
- Correct index tracking (second section starts at correct character index)

**Verification:** All tests pass.

---

### Task 6.3 — Integration tests for adapter orchestration
**Complexity:** Medium
**References:** TR.md Section 8.3, GS.md

Create `apps/api/src/adapters/google-docs/__tests__/adapter.integration.test.ts`:

Mock `googleapis` client at the method level using `vi.mock`.

Test suites:
- Create mode happy path: new doc created, batch update applied, correct `googleDocId` returned
- Append mode happy path: existing doc fetched, content inserted at end index, same `googleDocId` returned
- 401 auth failure: throws `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')`
- 403 permission failure: throws `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')`
- 404 doc not found (append mode): throws `GoogleDocsAdapterError('GOOGLE_DOC_NOT_FOUND')`, no fallback to create
- 429 → 200 retry: succeeds on second attempt
- 429 exhausted: throws `GoogleDocsAdapterError('GOOGLE_DOCS_UNAVAILABLE')`
- 503 → 200 retry: succeeds on second attempt
- No sections in content: fallback to unstructured content insertion (cycle header only + full content as NORMAL_TEXT)

**Verification:** All integration test suites pass.

---

### Task 6.4 — Verify adapter isolation
**Complexity:** Small
**References:** FRS.md Section 4, GS.md adapter isolation scenarios

Add a test that verifies:
- No Drizzle or SQL queries are executed inside the adapter
- All data is sourced from function parameters
- No Google Docs API types leak into the `GoogleDocExportResult` return type

**Verification:** Adapter operates purely from inputs; no database dependency.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Types and Error Classes | 1.1, 1.2 | Small, Small |
| 2: Content Parser | 2.1, 2.2 | Medium, Small |
| 3: Document Formatter | 3.1, 3.2 | Medium, Small |
| 4: Google Docs API Client | 4.1 | Medium |
| 5: Main Adapter Orchestration | 5.1, 5.2 | Large, Small |
| 6: Testing | 6.1, 6.2, 6.3, 6.4 | Small, Small, Medium, Small |

**Total estimated complexity:** 1 Large task (main orchestration), 3 Medium tasks (content parser, document formatter, Google Docs client), remainder Small.

**Critical path:** Task 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 5.1 → 5.2 → 6.1 → 6.2 → 6.3. The main adapter orchestration (Task 5.1) is the highest-risk task as it composes all sub-modules and must handle both create and append modes correctly.

**Known V1 simplification:** Markdown bold text is stripped rather than converted to Google Docs bold formatting. Bullet lists use the `bullet` character prefix rather than native Google Docs `createParagraphBullets` requests. Both are flagged for V2 iteration.
