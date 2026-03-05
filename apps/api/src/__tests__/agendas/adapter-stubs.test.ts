import { describe, it, expect } from 'vitest';
import { EmailAdapterStub, getEmailAdapter, setEmailAdapter } from '../../adapters/email-adapter';
import { GoogleDocsAdapterStub, getGoogleDocsAdapter, setGoogleDocsAdapter } from '../../adapters/google-docs-adapter';

// ---------------------------------------------------------------------------
// Email adapter stub
// ---------------------------------------------------------------------------

describe('EmailAdapterStub', () => {
  it('throws NotImplementedError on sendAgenda', async () => {
    const stub = new EmailAdapterStub();
    await expect(
      stub.sendAgenda({
        agenda: { short_id: 'AGD-0001', content: 'test', cycle_start: '2026-03-01', cycle_end: '2026-03-15' },
        client_name: 'Test Client',
        recipients: ['test@example.com'],
      })
    ).rejects.toThrow('not implemented');
  });

  it('getEmailAdapter returns the default stub', () => {
    const adapter = getEmailAdapter();
    expect(adapter).toBeInstanceOf(EmailAdapterStub);
  });

  it('setEmailAdapter replaces the adapter', () => {
    const mockAdapter = {
      sendAgenda: async () => ({ sent_at: new Date().toISOString() }),
    };
    setEmailAdapter(mockAdapter);
    expect(getEmailAdapter()).toBe(mockAdapter);

    // Reset to stub
    setEmailAdapter(new EmailAdapterStub());
  });
});

// ---------------------------------------------------------------------------
// Google Docs adapter stub
// ---------------------------------------------------------------------------

describe('GoogleDocsAdapterStub', () => {
  it('throws NotImplementedError on exportAgenda', async () => {
    const stub = new GoogleDocsAdapterStub();
    await expect(
      stub.exportAgenda({
        agenda: { short_id: 'AGD-0001', content: 'test', cycle_start: '2026-03-01', cycle_end: '2026-03-15' },
        client_name: 'Test Client',
      })
    ).rejects.toThrow('not implemented');
  });

  it('getGoogleDocsAdapter returns the default stub', () => {
    const adapter = getGoogleDocsAdapter();
    expect(adapter).toBeInstanceOf(GoogleDocsAdapterStub);
  });

  it('setGoogleDocsAdapter replaces the adapter', () => {
    const mockAdapter = {
      exportAgenda: async () => ({ google_doc_id: 'mock-doc-id' }),
    };
    setGoogleDocsAdapter(mockAdapter);
    expect(getGoogleDocsAdapter()).toBe(mockAdapter);

    // Reset to stub
    setGoogleDocsAdapter(new GoogleDocsAdapterStub());
  });
});
