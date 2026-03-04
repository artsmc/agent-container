# Technical Requirements
# Feature 15: Google Docs Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Implementation Strategy

### 1.1 Approach

The Google Docs adapter is a new module at `apps/api/src/adapters/google-docs/`. It follows the same adapter pattern as the Asana adapter (Feature 12): isolated directory, clean public interface, no direct database access, injectable credentials.

Implementation order:

1. Define `AgendaExportInput`, `ClientDocConfig`, `GoogleDocExportResult`, and `GoogleServiceAccountCredentials` types.
2. Implement `google-docs-error.ts` — `GoogleDocsAdapterError` with typed error codes.
3. Implement `content-parser.ts` — extracts the 6 Running Notes sections from ProseMirror JSON content (parses `heading`, `paragraph`, `bulletList`, `listItem` nodes).
4. Implement `document-formatter.ts` — converts parsed sections to Google Docs API batch update requests.
5. Implement `google-docs-client.ts` — thin wrapper around the Google Docs API with retry logic.
6. Implement `adapter.ts` — main `exportToGoogleDoc` function orchestrating create vs append.
7. Wire the public export in `index.ts`.
8. Write unit tests for `content-parser.ts` and `document-formatter.ts` (pure functions).
9. Write integration tests using a mocked Google Docs HTTP client.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Inherits from `apps/api/tsconfig.json` |
| Runtime | Node.js 22 LTS | Via the API application |
| Google Docs API client | `googleapis` npm package | Official Google APIs Node.js client. The `docs` v1 API. |
| Google Auth | `google-auth-library` | Bundled with `googleapis`. Service account JWT flow. |
| Retry logic | `p-retry` | Same dependency as Feature 12 |
| Logger | Pino | Feature 07 pattern |
| Test framework | Vitest | Feature 07 configuration |
| HTTP mocking | `msw` or `vi.mock('googleapis')` | Mock at the `docs.documents` method level |

### 1.3 Module Directory Structure

```
apps/api/src/adapters/google-docs/
├── index.ts                        # Public export: exportToGoogleDoc
├── adapter.ts                      # Main orchestration: create vs append
├── content-parser.ts               # Parse ProseMirror JSON content into 6 sections
├── document-formatter.ts           # Convert sections to Docs API requests
├── google-docs-client.ts           # googleapis wrapper with retry
└── google-docs-error.ts            # GoogleDocsAdapterError class
```

Co-located tests:

```
apps/api/src/adapters/google-docs/__tests__/
├── content-parser.test.ts
├── document-formatter.test.ts
├── google-docs-client.test.ts
└── adapter.integration.test.ts
```

---

## 2. Data Models

### 2.1 Input and Output Types

```typescript
// apps/api/src/adapters/google-docs/adapter.ts

export interface AgendaExportInput {
  agendaId: string;        // UUID
  shortId: string;         // e.g., "AGD-0015"
  content: ProseMirrorDoc; // ProseMirror JSON document from agendas.content (not markdown)
  cycleStart: string;      // ISO date: "2026-02-17"
  cycleEnd: string;        // ISO date: "2026-02-28"
  clientName: string;      // e.g., "Total Life"
}

// ProseMirror JSON document structure
interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

interface ProseMirrorNode {
  type: string;             // 'heading', 'paragraph', 'bulletList', 'listItem', 'text', etc.
  attrs?: Record<string, unknown>;  // e.g., { level: 2 } for heading nodes
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string }>;  // e.g., [{ type: 'bold' }]
}

export interface ClientDocConfig {
  googleDocId: string | null;  // null = create mode; string = append mode
  clientName: string;
}

export interface GoogleServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  // ... standard Google service account JSON fields
}

export interface GoogleDocExportResult {
  googleDocId: string;
  documentUrl: string;
}
```

### 2.2 ParsedAgendaContent

```typescript
// apps/api/src/adapters/google-docs/content-parser.ts

export interface ParsedAgendaContent {
  completedTasks: ProseMirrorNode[];
  incompleteTasks: ProseMirrorNode[];
  relevantDeliverables: ProseMirrorNode[];
  recommendations: ProseMirrorNode[];
  newIdeas: ProseMirrorNode[];
  nextSteps: ProseMirrorNode[];
}
```

### 2.3 GoogleDocsAdapterError

```typescript
// apps/api/src/adapters/google-docs/google-docs-error.ts

export type GoogleDocsErrorCode =
  | 'GOOGLE_AUTH_FAILED'
  | 'GOOGLE_DOC_NOT_FOUND'
  | 'GOOGLE_DOCS_TIMEOUT'
  | 'GOOGLE_DOCS_UNAVAILABLE';

export class GoogleDocsAdapterError extends Error {
  readonly code: GoogleDocsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GoogleDocsErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GoogleDocsAdapterError';
    this.code = code;
    this.details = details;
  }
}
```

---

## 3. Content Parser Implementation

### 3.1 ProseMirror Section Detection

```typescript
// apps/api/src/adapters/google-docs/content-parser.ts

const SECTION_NAMES: Record<keyof ParsedAgendaContent, string[]> = {
  completedTasks: ['completed tasks', 'completed task'],
  incompleteTasks: ['incomplete tasks', 'incomplete task', 'outstanding tasks'],
  relevantDeliverables: ['relevant deliverables', 'deliverables'],
  recommendations: ['recommendations', 'recommendation'],
  newIdeas: ['new ideas', 'new idea'],
  nextSteps: ['next steps', 'next step'],
};

/**
 * Extract text content from a ProseMirror node tree (recursive).
 */
function extractText(node: ProseMirrorNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

/**
 * Parse ProseMirror JSON document into 6 agenda sections.
 * Walks the top-level nodes, identifies heading nodes by text match,
 * and collects the nodes between each heading.
 */
export function parseAgendaContent(doc: ProseMirrorDoc): ParsedAgendaContent {
  const nodes = doc.content ?? [];

  // Find heading nodes that match section names
  const sectionStarts: Array<{ key: keyof ParsedAgendaContent; nodeIndex: number }> = [];

  nodes.forEach((node, idx) => {
    if (node.type === 'heading') {
      const headingText = extractText(node).trim().toLowerCase();
      for (const [key, names] of Object.entries(SECTION_NAMES)) {
        if (names.some(name => headingText === name)) {
          sectionStarts.push({ key: key as keyof ParsedAgendaContent, nodeIndex: idx });
          break;
        }
      }
    }
  });

  const result: ParsedAgendaContent = {
    completedTasks: [],
    incompleteTasks: [],
    relevantDeliverables: [],
    recommendations: [],
    newIdeas: [],
    nextSteps: [],
  };

  if (sectionStarts.length === 0) return result;

  sectionStarts.sort((a, b) => a.nodeIndex - b.nodeIndex);

  for (let i = 0; i < sectionStarts.length; i++) {
    const { key, nodeIndex } = sectionStarts[i];
    const nextSectionIndex = sectionStarts[i + 1]?.nodeIndex ?? nodes.length;
    // Collect ProseMirror nodes between this heading and the next
    result[key] = nodes.slice(nodeIndex + 1, nextSectionIndex);
  }

  return result;
}
```
```

### 3.2 Cycle Date Formatter

```typescript
export function formatCycleHeader(cycleStart: string, cycleEnd: string): string {
  const start = new Date(cycleStart + 'T00:00:00Z');
  const end = new Date(cycleEnd + 'T00:00:00Z');

  const startFormatted = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endFormatted = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `Running Notes — ${startFormatted} to ${endFormatted}`;
  // e.g., "Running Notes — Feb 17 to Feb 28, 2026"
}
```

---

## 4. Document Formatter Implementation

### 4.1 Google Docs Batch Update Request Builder

The Google Docs API uses an `insertText` + `updateParagraphStyle` + `updateTextStyle` approach in a `batchUpdate` request. Because the API works on character index ranges, and the document is built by inserting content sequentially, all insertions must track the current end index.

For a new document (create mode), the document starts with an implicit empty paragraph at index 1.

```typescript
// apps/api/src/adapters/google-docs/document-formatter.ts

export interface FormattedDocRequests {
  requests: docs_v1.Schema$Request[];
}

export function buildDocumentRequests(
  parsed: ParsedAgendaContent,
  cycleStart: string,
  cycleEnd: string,
  startIndex: number   // 1 for new docs, end-of-doc index for append
): FormattedDocRequests {
  const requests: docs_v1.Schema$Request[] = [];
  let currentIndex = startIndex;

  // Helper: insert a text segment and return the new end index
  function insertText(text: string): void {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text,
      },
    });
    currentIndex += text.length;
  }

  function applyHeadingStyle(startIdx: number, endIdx: number, style: 'HEADING_1' | 'HEADING_2'): void {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: startIdx, endIndex: endIdx },
        paragraphStyle: { namedStyleType: style },
        fields: 'namedStyleType',
      },
    });
  }

  // --- Cycle Header (Heading 1) ---
  const cycleHeaderText = formatCycleHeader(cycleStart, cycleEnd) + '\n';
  const cycleHeaderStart = currentIndex;
  insertText(cycleHeaderText);
  applyHeadingStyle(cycleHeaderStart, cycleHeaderStart + cycleHeaderText.length, 'HEADING_1');

  // --- 6 Sections (Heading 2 + body) ---
  const sections: Array<{ label: string; content: string }> = [
    { label: 'Completed Tasks', content: parsed.completedTasks },
    { label: 'Incomplete Tasks', content: parsed.incompleteTasks },
    { label: 'Relevant Deliverables', content: parsed.relevantDeliverables },
    { label: 'Recommendations', content: parsed.recommendations },
    { label: 'New Ideas', content: parsed.newIdeas },
    { label: 'Next Steps', content: parsed.nextSteps },
  ];

  for (const section of sections) {
    // Section heading
    const headingText = section.label + '\n';
    const headingStart = currentIndex;
    insertText(headingText);
    applyHeadingStyle(headingStart, headingStart + headingText.length, 'HEADING_2');

    // Section body — convert ProseMirror nodes to text
    if (section.content.length > 0) {
      const bodyText = convertProseMirrorNodesToText(section.content) + '\n';
      insertText(bodyText);
    } else {
      insertText('\n'); // Empty line to separate sections
    }
  }

  return { requests };
}
```

**Note on list formatting:** For V1, bulleted lists from ProseMirror `bulletList`/`listItem` nodes are converted to plain text with the `•` character prefix. Full Google Docs bullet style (`createParagraphBullets`) requires tracking the exact character range of each list item, which significantly increases request complexity. V2 can implement proper list formatting.

### 4.2 ProseMirror Node to Plain Text Converter

```typescript
/**
 * Convert ProseMirror nodes to plain text for Google Docs insertion.
 * Handles paragraph, bulletList, listItem, and text nodes with marks.
 */
function convertProseMirrorNodesToText(nodes: ProseMirrorNode[]): string {
  return nodes.map(node => convertNode(node)).join('\n').trim();
}

function convertNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return (node.content ?? []).map(convertNode).join('');
    case 'bulletList':
      return (node.content ?? [])
        .map(item => '• ' + (item.content ?? []).map(convertNode).join(''))
        .join('\n');
    case 'listItem':
      return (node.content ?? []).map(convertNode).join('');
    case 'text':
      return node.text ?? '';
    case 'heading':
      return (node.content ?? []).map(convertNode).join('');
    default:
      return (node.content ?? []).map(convertNode).join('');
  }
}
```

---

## 5. Google Docs Client Implementation

### 5.1 Authentication and Client Initialization

```typescript
// apps/api/src/adapters/google-docs/google-docs-client.ts

import { google, docs_v1 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import type { GoogleServiceAccountCredentials } from './adapter.js';

function createDocsClient(credentials: GoogleServiceAccountCredentials): docs_v1.Docs {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/documents'],
  });
  return google.docs({ version: 'v1', auth });
}
```

### 5.2 Create Document

```typescript
export async function createDocument(
  title: string,
  credentials: GoogleServiceAccountCredentials
): Promise<string> {
  const docs = createDocsClient(credentials);

  return withRetry(async () => {
    const response = await docs.documents.create({ requestBody: { title } });
    const docId = response.data.documentId;
    if (!docId) throw new GoogleDocsAdapterError('GOOGLE_DOCS_UNAVAILABLE', 'Created document has no documentId');
    return docId;
  });
}
```

### 5.3 Get Document End Index

```typescript
export async function getDocumentEndIndex(
  documentId: string,
  credentials: GoogleServiceAccountCredentials
): Promise<number> {
  const docs = createDocsClient(credentials);

  return withRetry(async () => {
    const response = await docs.documents.get({ documentId });

    if (!response.data.body?.content) {
      return 1; // Empty document
    }

    const content = response.data.body.content;
    const lastElement = content[content.length - 1];
    // The end index of the last element minus 1 is the safe insertion point
    return (lastElement.endIndex ?? 1) - 1;
  });
}
```

### 5.4 Batch Update (Insert Content)

```typescript
export async function batchUpdate(
  documentId: string,
  requests: docs_v1.Schema$Request[],
  credentials: GoogleServiceAccountCredentials
): Promise<void> {
  const docs = createDocsClient(credentials);

  await withRetry(async () => {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  });
}
```

### 5.5 Retry Wrapper

```typescript
import pRetry, { AbortError } from 'p-retry';

const MAX_RETRIES = 2; // 3 total attempts

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (err: unknown) {
        const status = getGoogleApiErrorStatus(err);

        if (status === 401 || status === 403) {
          throw new AbortError(
            new GoogleDocsAdapterError('GOOGLE_AUTH_FAILED', `Google Docs API returned ${status}`)
          );
        }
        if (status === 404) {
          throw new AbortError(
            new GoogleDocsAdapterError('GOOGLE_DOC_NOT_FOUND', 'Google Doc not found')
          );
        }

        // 429 and 5xx are retryable
        throw err;
      }
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      randomize: true,
    }
  );
}

function getGoogleApiErrorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status ?? null;
  }
  return null;
}
```

---

## 6. Main Adapter Orchestration

### 6.1 exportToGoogleDoc Function

```typescript
// apps/api/src/adapters/google-docs/adapter.ts

export async function exportToGoogleDoc(
  input: AgendaExportInput,
  clientConfig: ClientDocConfig,
  credentials: GoogleServiceAccountCredentials,
  logger: Logger
): Promise<GoogleDocExportResult> {
  const startMs = Date.now();
  const mode = clientConfig.googleDocId ? 'append' : 'create';

  logger.info({ agendaId: input.agendaId, shortId: input.shortId, mode }, 'Export started');

  // Step 1: Parse ProseMirror JSON content into 6 sections
  const parsedContent = parseAgendaContent(input.content);

  let googleDocId: string;
  let startIndex: number;

  if (mode === 'create') {
    // Step 2a: Create a new document
    const docTitle = `${input.clientName} — Running Notes`;
    googleDocId = await createDocument(docTitle, credentials);
    startIndex = 1; // New document starts at index 1

    logger.info(
      { agendaId: input.agendaId, googleDocId, documentUrl: buildDocUrl(googleDocId) },
      'Google Doc created'
    );
  } else {
    // Step 2b: Get end index of existing document for append
    googleDocId = clientConfig.googleDocId!;
    const endIndex = await getDocumentEndIndex(googleDocId, credentials);
    startIndex = endIndex;
  }

  // Step 3: Build batch update requests
  const { requests } = buildDocumentRequests(
    parsedContent,
    input.cycleStart,
    input.cycleEnd,
    startIndex
  );

  // Step 4: Insert separator before appended content (append mode only)
  if (mode === 'append') {
    // Prepend a horizontal rule request before the section content
    requests.unshift(buildSeparatorRequest(startIndex));
  }

  // Step 5: Execute batch update
  await batchUpdate(googleDocId, requests, credentials);

  if (mode === 'append') {
    logger.info(
      { agendaId: input.agendaId, googleDocId, documentUrl: buildDocUrl(googleDocId) },
      'Content appended'
    );
  }

  const durationMs = Date.now() - startMs;
  logger.info({ agendaId: input.agendaId, googleDocId, durationMs }, 'Export completed');

  return {
    googleDocId,
    documentUrl: buildDocUrl(googleDocId),
  };
}

function buildDocUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}
```

---

## 7. API Layer Integration

### 7.1 Call Site (Feature 14 — Agenda Export Endpoint)

Feature 14 owns the `POST /agendas/{id}/export` handler. It calls this adapter after confirming the agenda is finalized and loading the client config.

```typescript
// Pseudocode — Feature 14 owns this handler
import { exportToGoogleDoc } from '../adapters/google-docs/index.js';

// Inside POST /agendas/{id}/export handler:
const credentials = await secretManager.get('GOOGLE_SERVICE_ACCOUNT_JSON');
const result = await exportToGoogleDoc(
  {
    agendaId: agenda.id,
    shortId: agenda.shortId,
    content: agenda.content,
    cycleStart: agenda.cycleStart,
    cycleEnd: agenda.cycleEnd,
    clientName: client.name,
  },
  { googleDocId: client.googleDocId ?? null, clientName: client.name },
  JSON.parse(credentials),
  req.log
);

// Persist the Google Doc ID
await db.update(agendas).set({ googleDocId: result.googleDocId }).where(eq(agendas.id, agenda.id));

// Audit log
await db.insert(auditLog).values({
  userId: req.user.id,
  action: 'agenda.exported',
  entityType: 'agenda',
  entityId: agenda.id,
  metadata: { googleDocId: result.googleDocId, documentUrl: result.documentUrl },
  source: 'ui',
});
```

### 7.2 Export from Adapter Index

```typescript
// apps/api/src/adapters/google-docs/index.ts

export { exportToGoogleDoc } from './adapter.js';
export type {
  AgendaExportInput,
  ClientDocConfig,
  GoogleDocExportResult,
  GoogleServiceAccountCredentials,
} from './adapter.js';
export { GoogleDocsAdapterError } from './google-docs-error.js';
```

---

## 8. Testing Strategy

### 8.1 Unit Tests — content-parser.ts

| Test Case | Input | Expected Output |
|---|---|---|
| All 6 sections present | ProseMirror doc with all 6 heading nodes | All 6 sections populated with node arrays |
| Section header case insensitive | Heading node with text "COMPLETED TASKS" | `completedTasks` populated |
| Missing section | No "New Ideas" heading node | `newIdeas: []` (empty array) |
| No recognized sections | ProseMirror doc with no recognized headings | All sections empty arrays |
| Alternate section names | Heading node "Deliverables" | `relevantDeliverables` populated |
| Section content spans multiple nodes | Multiple paragraph/list nodes between headings | Full node array extracted |
| Cycle header formatting | `cycleStart: "2026-02-17"`, `cycleEnd: "2026-02-28"` | `"Running Notes — Feb 17 to Feb 28, 2026"` |

### 8.2 Unit Tests — document-formatter.ts

| Test Case | Scenario |
|---|---|
| All sections generate heading + content | 6 HEADING_2 insertions + 6 body insertions |
| Empty section generates heading + empty line | Section with empty content still produces heading |
| Bullet list converted to • prefix | ProseMirror `bulletList` node → `• item` text |
| Bold text extracted | Text node with `bold` mark → plain text (V1) |
| Correct index tracking | Second section starts at correct character index |

### 8.3 Integration Tests — adapter.integration.test.ts

All integration tests mock the `googleapis` client at the method level using `vi.mock`.

| Test Suite | Scenarios |
|---|---|
| Create mode happy path | New doc created, batch update applied, correct docId returned |
| Append mode happy path | Existing doc fetched, content inserted at end index, same docId returned |
| 401 auth failure | Throws `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')` |
| 403 permission failure | Throws `GoogleDocsAdapterError('GOOGLE_AUTH_FAILED')` |
| 404 doc not found (append) | Throws `GoogleDocsAdapterError('GOOGLE_DOC_NOT_FOUND')`, no fallback to create |
| 429 → 200 retry | Succeeds on second attempt |
| 429 exhausted | Throws `GoogleDocsAdapterError('GOOGLE_DOCS_UNAVAILABLE')` |
| 503 → 200 retry | Succeeds on second attempt |
| No sections in content | Fallback to unstructured content insertion |

---

## 9. New npm Dependencies

| Package | Type | Purpose |
|---|---|---|
| `googleapis` | Runtime | Official Google Docs API client (includes `docs_v1` types) |
| `google-auth-library` | Runtime | Service account JWT authentication (bundled with googleapis, may not need separate install) |

---

## 10. Environment Variables

| Variable | Description | Source |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON credential string | Cloud secret manager (injected at runtime) |

The calling endpoint (Feature 14) is responsible for fetching this secret and passing it to the adapter. The adapter itself does not read environment variables.

---

## 11. Performance Requirements

| Metric | Requirement |
|---|---|
| Total export latency | Under 10 seconds for typical agenda content (under 5,000 words) |
| Google API timeout | 30 seconds per individual API call |
| Create mode API calls | 2 calls (documents.create + documents.batchUpdate) |
| Append mode API calls | 3 calls (documents.get + documents.batchUpdate; separator handled in same batch) |

---

## 12. Security Considerations

| Concern | Requirement |
|---|---|
| Service account private key logging | MUST NOT appear in any log output |
| Agenda content logging | MUST NOT be logged at any level |
| Credential passing | Credentials are passed as function parameter only — never stored in the adapter's module scope |
| Google Doc permissions | The service account must be granted Editor access to existing client documents in append mode. This is a configuration requirement, not enforced in code. |

---

## 13. Dependencies

### 13.1 Feature Dependencies

| Feature | What Is Needed |
|---|---|
| 07 (api-scaffolding) | Fastify, Pino logger, error handling patterns, `p-retry` (or re-install if not yet present) |
| 14 (agenda-endpoints) | Provides the `POST /agendas/{id}/export` endpoint that calls this adapter; owns the `agendas.google_doc_id` update |
| 09 (client-management) | Client config provides `googleDocId` for create-vs-append determination |
| 04 (product-database-schema) | `agendas.google_doc_id` column |

### 13.2 Downstream Dependents

None (leaf node). This adapter is called by Feature 14's export endpoint only.

---

## 14. Nx Integration

```bash
# Test
nx run api:test --testPathPattern=adapters/google-docs

# Type check
nx run api:type-check

# Lint
nx run api:lint
```

---

## 15. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| **Resolved:** Agenda content is stored as ProseMirror JSON. | `content-parser.ts` parses ProseMirror `heading`, `paragraph`, `bulletList`, and `listItem` nodes to extract the 6 sections. | N/A — resolved. |
| Should Google Docs bullet lists use native `createParagraphBullets` API requests (V1 simplification: plain • text)? | Affects visual quality of the output document | V1: plain bullet prefix (`•`). V2 iteration adds proper Google Docs list formatting. Flag as tech debt in task list. |
| Who is responsible for granting the service account Editor access to existing client Google Docs? | If the service account lacks permission, append mode always fails with 403 | Document as an operational requirement. The account manager or admin must share the existing document with the service account email. |
| Should `google_doc_id` be stored on the `clients` table (for default document per client) or derived from the most recent agenda export? | Affects how Feature 14 determines create-vs-append | This spec assumes `clients.google_doc_id` as a per-client config field. If that field does not exist in the database schema, it must be added as part of this feature (or Feature 09's PATCH endpoint). |
