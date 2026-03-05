import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Mock googleapis at module level
// ---------------------------------------------------------------------------

const mockDocumentsCreate = vi.fn();
const mockDocumentsGet = vi.fn();
const mockDocumentsBatchUpdate = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    docs: vi.fn(() => ({
      documents: {
        create: mockDocumentsCreate,
        get: mockDocumentsGet,
        batchUpdate: mockDocumentsBatchUpdate,
      },
    })),
  },
  Auth: {
    GoogleAuth: vi.fn().mockImplementation(() => ({})),
  },
}));

// Mock p-retry to eliminate real delays in tests
vi.mock('p-retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('p-retry')>();
  return {
    ...actual,
    default: (fn: () => Promise<unknown>, options?: { retries?: number; onFailedAttempt?: (e: unknown) => void }) => {
      return actual.default(fn, {
        ...options,
        minTimeout: 1,
        maxTimeout: 1,
        factor: 1,
        randomize: false,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { exportToGoogleDoc } from '../adapter';
import type {
  AgendaExportInput,
  ClientDocConfig,
  GoogleDocExportResult,
} from '../adapter';
import type { GoogleServiceAccountCredentials } from '../google-docs-client';
import { GoogleDocsAdapterError } from '../google-docs-error';
import type { ProseMirrorDoc, ProseMirrorNode } from '../content-parser';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_CREDENTIALS: GoogleServiceAccountCredentials = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test.iam.gserviceaccount.com',
  client_id: '12345',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

function heading(text: string, level = 2): ProseMirrorNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function paragraph(text: string): ProseMirrorNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function makeDoc(...nodes: ProseMirrorNode[]): ProseMirrorDoc {
  return { type: 'doc', content: nodes };
}

function makeFullAgendaDoc(): ProseMirrorDoc {
  return makeDoc(
    heading('Completed Tasks'),
    paragraph('Task A done'),
    heading('Incomplete Tasks'),
    paragraph('Task B pending'),
    heading('Relevant Deliverables'),
    paragraph('Deliverable X'),
    heading('Recommendations'),
    paragraph('Recommend Y'),
    heading('New Ideas'),
    paragraph('Idea Z'),
    heading('Next Steps'),
    paragraph('Step 1'),
  );
}

function makeInput(overrides?: Partial<AgendaExportInput>): AgendaExportInput {
  return {
    agendaId: 'agenda-uuid-123',
    shortId: 'AGD-0015',
    content: makeFullAgendaDoc(),
    cycleStart: '2026-02-17',
    cycleEnd: '2026-02-28',
    clientName: 'Total Life',
    ...overrides,
  };
}

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as Logger;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Create Mode
// ---------------------------------------------------------------------------

describe('Create mode', () => {
  const clientConfig: ClientDocConfig = {
    googleDocId: null,
    clientName: 'Total Life',
  };

  it('creates a new Google Doc and returns the docId', async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      data: { documentId: 'new-doc-id-456' },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    const result = await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(result.googleDocId).toBe('new-doc-id-456');
    expect(result.documentUrl).toBe(
      'https://docs.google.com/document/d/new-doc-id-456/edit',
    );
    expect(mockDocumentsCreate).toHaveBeenCalledTimes(1);
    expect(mockDocumentsBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockDocumentsGet).not.toHaveBeenCalled();
  });

  it('sets the document title to "{clientName} - Running Notes"', async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      data: { documentId: 'new-doc-id' },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(mockDocumentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { title: 'Total Life \u2014 Running Notes' },
      }),
    );
  });

  it('emits structured logs for create mode', async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      data: { documentId: 'doc-id' },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    const infoMock = mockLogger.info as Mock;

    // Export started
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'agenda-uuid-123',
        shortId: 'AGD-0015',
        mode: 'create',
      }),
      'Export started',
    );

    // Google Doc created
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'agenda-uuid-123',
        googleDocId: 'doc-id',
        documentUrl: expect.stringContaining('doc-id'),
      }),
      'Google Doc created',
    );

    // Export completed
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'agenda-uuid-123',
        googleDocId: 'doc-id',
        durationMs: expect.any(Number),
      }),
      'Export completed',
    );
  });
});

// ---------------------------------------------------------------------------
// Append Mode
// ---------------------------------------------------------------------------

describe('Append mode', () => {
  const clientConfig: ClientDocConfig = {
    googleDocId: 'existing-doc-id-123',
    clientName: 'Total Life',
  };

  it('appends to an existing Google Doc and returns the same docId', async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      data: {
        body: {
          content: [
            { startIndex: 0, endIndex: 1 },
            { startIndex: 1, endIndex: 150 },
          ],
        },
      },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    const result = await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(result.googleDocId).toBe('existing-doc-id-123');
    expect(mockDocumentsGet).toHaveBeenCalledTimes(1);
    expect(mockDocumentsBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockDocumentsCreate).not.toHaveBeenCalled();
  });

  it('emits "Content appended" log for append mode', async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      data: { body: { content: [{ endIndex: 100 }] } },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    const infoMock = mockLogger.info as Mock;
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'agenda-uuid-123',
        googleDocId: 'existing-doc-id-123',
      }),
      'Content appended',
    );
  });

  it('includes separator requests in append mode batch update', async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      data: { body: { content: [{ endIndex: 100 }] } },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    await exportToGoogleDoc(
      makeInput(),
      clientConfig,
      FAKE_CREDENTIALS,
      mockLogger,
    );

    // The batch update should include separator text
    const batchUpdateCall = mockDocumentsBatchUpdate.mock.calls[0][0];
    const allTexts = batchUpdateCall.requestBody.requests
      .filter((r: Record<string, unknown>) => r.insertText)
      .map(
        (r: { insertText: { text: string } }) => r.insertText.text,
      )
      .join('');

    expect(allTexts).toContain('___');
  });
});

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('throws GOOGLE_AUTH_FAILED on 401', async () => {
    const error = new Error('Unauthorized') as Error & { status: number };
    error.status = 401;
    mockDocumentsCreate.mockRejectedValue(error);

    try {
      await exportToGoogleDoc(
        makeInput(),
        { googleDocId: null, clientName: 'Test' },
        FAKE_CREDENTIALS,
        mockLogger,
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GoogleDocsAdapterError);
      expect((e as GoogleDocsAdapterError).code).toBe('GOOGLE_AUTH_FAILED');
    }
  });

  it('throws GOOGLE_AUTH_FAILED on 403', async () => {
    const error = new Error('Forbidden') as Error & { status: number };
    error.status = 403;
    mockDocumentsCreate.mockRejectedValue(error);

    try {
      await exportToGoogleDoc(
        makeInput(),
        { googleDocId: null, clientName: 'Test' },
        FAKE_CREDENTIALS,
        mockLogger,
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GoogleDocsAdapterError);
      expect((e as GoogleDocsAdapterError).code).toBe('GOOGLE_AUTH_FAILED');
    }
  });

  it('throws GOOGLE_DOC_NOT_FOUND on 404 in append mode (no fallback to create)', async () => {
    const error = new Error('Not Found') as Error & { status: number };
    error.status = 404;
    mockDocumentsGet.mockRejectedValue(error);

    try {
      await exportToGoogleDoc(
        makeInput(),
        { googleDocId: 'nonexistent-doc', clientName: 'Test' },
        FAKE_CREDENTIALS,
        mockLogger,
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GoogleDocsAdapterError);
      expect((e as GoogleDocsAdapterError).code).toBe('GOOGLE_DOC_NOT_FOUND');
      // Verify no fallback to create
      expect(mockDocumentsCreate).not.toHaveBeenCalled();
    }
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const error429 = new Error('Rate limited') as Error & { status: number };
    error429.status = 429;

    mockDocumentsCreate
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({ data: { documentId: 'retry-doc-id' } });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    const result = await exportToGoogleDoc(
      makeInput(),
      { googleDocId: null, clientName: 'Test' },
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(result.googleDocId).toBe('retry-doc-id');
    expect(mockDocumentsCreate).toHaveBeenCalledTimes(2);
  });

  it('throws GOOGLE_DOCS_UNAVAILABLE when all retries exhausted on 429', async () => {
    const error429 = new Error('Rate limited') as Error & { status: number };
    error429.status = 429;

    mockDocumentsCreate.mockRejectedValue(error429);

    try {
      await exportToGoogleDoc(
        makeInput(),
        { googleDocId: null, clientName: 'Test' },
        FAKE_CREDENTIALS,
        mockLogger,
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GoogleDocsAdapterError);
      expect((e as GoogleDocsAdapterError).code).toBe(
        'GOOGLE_DOCS_UNAVAILABLE',
      );
    }
  }, 15000);

  it('retries on 503 and succeeds on second attempt', async () => {
    const error503 = new Error('Service Unavailable') as Error & {
      status: number;
    };
    error503.status = 503;

    mockDocumentsCreate
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce({ data: { documentId: 'retry-503-doc' } });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    const result = await exportToGoogleDoc(
      makeInput(),
      { googleDocId: null, clientName: 'Test' },
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(result.googleDocId).toBe('retry-503-doc');
  }, 15000);
});

// ---------------------------------------------------------------------------
// Unstructured Content Fallback
// ---------------------------------------------------------------------------

describe('Unstructured content fallback', () => {
  it('handles content with no recognized section headings', async () => {
    const unstructuredDoc = makeDoc(
      paragraph('Some free-form text'),
      paragraph('More unstructured content'),
    );

    mockDocumentsCreate.mockResolvedValueOnce({
      data: { documentId: 'unstructured-doc-id' },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    const result = await exportToGoogleDoc(
      makeInput({ content: unstructuredDoc }),
      { googleDocId: null, clientName: 'Test' },
      FAKE_CREDENTIALS,
      mockLogger,
    );

    expect(result.googleDocId).toBe('unstructured-doc-id');

    // Verify batch update was called with content
    const batchUpdateCall = mockDocumentsBatchUpdate.mock.calls[0][0];
    const allTexts = batchUpdateCall.requestBody.requests
      .filter((r: Record<string, unknown>) => r.insertText)
      .map(
        (r: { insertText: { text: string } }) => r.insertText.text,
      )
      .join('');

    // Cycle header should still be present
    expect(allTexts).toContain('Running Notes');
    // Content should be present
    expect(allTexts).toContain('Some free-form text');
    // Should NOT have section headings
    expect(allTexts).not.toContain('Completed Tasks');
  });
});

// ---------------------------------------------------------------------------
// Credential safety
// ---------------------------------------------------------------------------

describe('Credential safety', () => {
  it('does not log credential values', async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      data: { documentId: 'safe-doc' },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({});

    await exportToGoogleDoc(
      makeInput(),
      { googleDocId: null, clientName: 'Test' },
      FAKE_CREDENTIALS,
      mockLogger,
    );

    // Check all logger calls do not contain private key or credential fields
    const allLogCalls = [
      ...(mockLogger.info as Mock).mock.calls,
      ...(mockLogger.warn as Mock).mock.calls,
      ...(mockLogger.debug as Mock).mock.calls,
    ];

    for (const call of allLogCalls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(callStr).not.toContain('private_key');
      expect(callStr).not.toContain('client_email');
    }
  });
});
