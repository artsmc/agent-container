/**
 * Google Docs API Client
 *
 * Thin wrapper around the googleapis `docs_v1` client. Provides
 * `createDocument`, `getDocumentEndIndex`, and `batchUpdate` functions
 * with automatic retry logic for transient errors.
 *
 * Authentication uses Google service account JWT credentials.
 */

import { google, Auth, type docs_v1 } from 'googleapis';
import pRetry, { AbortError } from 'p-retry';
import { GoogleDocsAdapterError } from './google-docs-error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2; // 3 total attempts (initial + 2 retries)

// ---------------------------------------------------------------------------
// Auth & client initialization
// ---------------------------------------------------------------------------

export function createDocsClient(
  credentials: GoogleServiceAccountCredentials,
): docs_v1.Docs {
  const auth = new Auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/documents'],
  });
  return google.docs({ version: 'v1', auth });
}

// ---------------------------------------------------------------------------
// Create document
// ---------------------------------------------------------------------------

export async function createDocument(
  title: string,
  credentials: GoogleServiceAccountCredentials,
): Promise<string> {
  const docs = createDocsClient(credentials);

  return withRetry(async () => {
    const response = await docs.documents.create({
      requestBody: { title },
    });
    const docId = response.data.documentId;
    if (!docId) {
      throw new GoogleDocsAdapterError(
        'GOOGLE_DOCS_UNAVAILABLE',
        'Created document has no documentId',
      );
    }
    return docId;
  });
}

// ---------------------------------------------------------------------------
// Get document end index
// ---------------------------------------------------------------------------

export async function getDocumentEndIndex(
  documentId: string,
  credentials: GoogleServiceAccountCredentials,
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

// ---------------------------------------------------------------------------
// Batch update
// ---------------------------------------------------------------------------

export async function batchUpdate(
  documentId: string,
  requests: docs_v1.Schema$Request[],
  credentials: GoogleServiceAccountCredentials,
): Promise<void> {
  const docs = createDocsClient(credentials);

  await withRetry(async () => {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  });
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (err: unknown) {
        const status = getGoogleApiErrorStatus(err);

        if (status === 401 || status === 403) {
          throw new AbortError(
            new GoogleDocsAdapterError(
              'GOOGLE_AUTH_FAILED',
              `Google Docs API returned ${status}`,
              { status },
            ),
          );
        }
        if (status === 404) {
          throw new AbortError(
            new GoogleDocsAdapterError(
              'GOOGLE_DOC_NOT_FOUND',
              'Google Doc not found',
              { status },
            ),
          );
        }

        // 429 and 5xx are retryable — re-throw to trigger p-retry
        throw err;
      }
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      randomize: true,
    },
  ).catch((error: unknown) => {
    // AbortError wraps our typed errors — unwrap them
    if (error instanceof AbortError) {
      const cause = error.cause;
      if (cause instanceof GoogleDocsAdapterError) throw cause;
    }
    // Already a GoogleDocsAdapterError — rethrow as-is
    if (error instanceof GoogleDocsAdapterError) throw error;
    // Retries exhausted — wrap in GOOGLE_DOCS_UNAVAILABLE
    throw new GoogleDocsAdapterError(
      'GOOGLE_DOCS_UNAVAILABLE',
      'Google Docs API call failed after maximum retries',
    );
  });
}

// ---------------------------------------------------------------------------
// Error status extractor
// ---------------------------------------------------------------------------

function getGoogleApiErrorStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    // googleapis GaxiosError has a `status` or `code` field
    if ('status' in err && typeof (err as Record<string, unknown>)['status'] === 'number') {
      return (err as Record<string, unknown>)['status'] as number;
    }
    if ('code' in err && typeof (err as Record<string, unknown>)['code'] === 'number') {
      return (err as Record<string, unknown>)['code'] as number;
    }
    // Some Google API errors nest the status under response
    if ('response' in err) {
      const response = (err as { response: unknown }).response;
      if (response && typeof response === 'object' && 'status' in response) {
        return (response as { status: number }).status ?? null;
      }
    }
  }
  return null;
}
