/**
 * Google Docs Adapter
 *
 * Main orchestration module for exporting agenda content to Google Docs.
 * Implements the `GoogleDocsAdapterService` interface from Feature 14
 * (apps/api/src/adapters/google-docs-adapter.ts).
 *
 * Supports two modes:
 * - Create mode: creates a new Google Doc with formatted Running Notes
 * - Append mode: appends a new cycle entry to an existing Google Doc
 */

import type { ProseMirrorDoc } from './content-parser';
import { parseAgendaContent, extractText } from './content-parser';
import {
  buildDocumentRequests,
  buildSeparatorRequest,
  buildUnstructuredDocRequests,
  getSeparatorLength,
} from './document-formatter';
import {
  createDocument,
  getDocumentEndIndex,
  batchUpdate,
  type GoogleServiceAccountCredentials,
} from './google-docs-client';
import type { GoogleDocsAdapterService } from '../google-docs-adapter';

// ---------------------------------------------------------------------------
// Logger interface (lightweight, avoids direct pino dependency)
// ---------------------------------------------------------------------------

export interface AdapterLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgendaExportInput {
  agendaId: string;
  shortId: string;
  content: ProseMirrorDoc;
  cycleStart: string;
  cycleEnd: string;
  clientName: string;
}

export interface ClientDocConfig {
  googleDocId: string | null;
  clientName: string;
}

export interface GoogleDocExportResult {
  googleDocId: string;
  documentUrl: string;
}

// Re-export credential type for convenience
export type { GoogleServiceAccountCredentials } from './google-docs-client';

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildDocUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

// ---------------------------------------------------------------------------
// Helper: check if parsed content has any sections
// ---------------------------------------------------------------------------

function hasAnySections(parsed: ReturnType<typeof parseAgendaContent>): boolean {
  return (
    parsed.completedTasks.length > 0 ||
    parsed.incompleteTasks.length > 0 ||
    parsed.relevantDeliverables.length > 0 ||
    parsed.recommendations.length > 0 ||
    parsed.newIdeas.length > 0 ||
    parsed.nextSteps.length > 0
  );
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Export an agenda to Google Docs.
 *
 * - If `clientConfig.googleDocId` is null/empty, creates a new document.
 * - If `clientConfig.googleDocId` is non-null, appends to the existing document.
 *
 * Credentials are passed per-call — the adapter does not cache them.
 */
export async function exportToGoogleDoc(
  input: AgendaExportInput,
  clientConfig: ClientDocConfig,
  credentials: GoogleServiceAccountCredentials,
  logger: AdapterLogger,
): Promise<GoogleDocExportResult> {
  const startMs = Date.now();
  const mode = clientConfig.googleDocId ? 'append' : 'create';

  logger.info(
    { agendaId: input.agendaId, shortId: input.shortId, mode },
    'Export started',
  );

  // Step 1: Parse ProseMirror JSON content into 6 sections
  const parsedContent = parseAgendaContent(input.content);

  let googleDocId: string;
  let startIndex: number;

  if (mode === 'create') {
    // Step 2a: Create a new document
    const docTitle = `${input.clientName} \u2014 Running Notes`;
    googleDocId = await createDocument(docTitle, credentials);
    startIndex = 1; // New document starts at index 1

    logger.info(
      {
        agendaId: input.agendaId,
        googleDocId,
        documentUrl: buildDocUrl(googleDocId),
      },
      'Google Doc created',
    );
  } else {
    // Step 2b: Get end index of existing document for append
    googleDocId = clientConfig.googleDocId!;
    const endIndex = await getDocumentEndIndex(googleDocId, credentials);
    startIndex = endIndex;
  }

  // Step 3: Build batch update requests
  let requests: ReturnType<typeof buildDocumentRequests>['requests'];

  // Check if content has recognized sections or is unstructured
  const isStructured = hasAnySections(parsedContent);

  if (isStructured) {
    const result = buildDocumentRequests(
      parsedContent,
      input.cycleStart,
      input.cycleEnd,
      mode === 'append' ? startIndex + getSeparatorLength() : startIndex,
    );
    requests = result.requests;
  } else {
    // Unstructured fallback: serialize all nodes as plain text
    const allNodes = input.content.content ?? [];
    const result = buildUnstructuredDocRequests(
      allNodes,
      input.cycleStart,
      input.cycleEnd,
      mode === 'append' ? startIndex + getSeparatorLength() : startIndex,
    );
    requests = result.requests;
  }

  // Step 4: Insert separator before appended content (append mode only)
  if (mode === 'append') {
    const separatorRequests = buildSeparatorRequest(startIndex);
    requests = [...separatorRequests, ...requests];
  }

  // Step 5: Execute batch update
  await batchUpdate(googleDocId, requests, credentials);

  if (mode === 'append') {
    logger.info(
      {
        agendaId: input.agendaId,
        googleDocId,
        documentUrl: buildDocUrl(googleDocId),
      },
      'Content appended',
    );
  }

  const durationMs = Date.now() - startMs;
  logger.info(
    { agendaId: input.agendaId, googleDocId, durationMs },
    'Export completed',
  );

  return {
    googleDocId,
    documentUrl: buildDocUrl(googleDocId),
  };
}

// ---------------------------------------------------------------------------
// GoogleDocsAdapterService implementation (class wrapper)
// ---------------------------------------------------------------------------

/**
 * Class-based adapter implementing the `GoogleDocsAdapterService` interface
 * from Feature 14. This is what gets registered via `setGoogleDocsAdapter()`.
 *
 * Credentials are read from the GOOGLE_SERVICE_ACCOUNT_JSON environment
 * variable. If not set, the adapter throws on invocation.
 */
export class GoogleDocsAdapter implements GoogleDocsAdapterService {
  private readonly logger: AdapterLogger;

  constructor(logger: AdapterLogger) {
    this.logger = logger;
  }

  async exportAgenda(params: {
    agenda: {
      short_id: string;
      content: unknown;
      cycle_start: string | null;
      cycle_end: string | null;
    };
    client_name: string;
    existing_doc_id?: string | null;
  }): Promise<{ google_doc_id: string }> {
    const credentialJson = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
    if (!credentialJson) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set',
      );
    }

    const credentials = JSON.parse(credentialJson) as GoogleServiceAccountCredentials;

    const input: AgendaExportInput = {
      agendaId: '', // not available from the stub interface
      shortId: params.agenda.short_id,
      content: params.agenda.content as ProseMirrorDoc,
      cycleStart: params.agenda.cycle_start ?? '',
      cycleEnd: params.agenda.cycle_end ?? '',
      clientName: params.client_name,
    };

    const clientConfig: ClientDocConfig = {
      googleDocId: params.existing_doc_id ?? null,
      clientName: params.client_name,
    };

    const result = await exportToGoogleDoc(
      input,
      clientConfig,
      credentials,
      this.logger,
    );

    return { google_doc_id: result.googleDocId };
  }
}
