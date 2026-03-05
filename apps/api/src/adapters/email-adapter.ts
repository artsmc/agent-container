import { NotImplementedError } from '../errors/api-errors';

/**
 * Service contract for sending agenda emails.
 * Feature 16 will provide the real implementation.
 */
export interface EmailAdapterService {
  sendAgenda(params: {
    agenda: {
      short_id: string;
      content: unknown;
      cycle_start: string | null;
      cycle_end: string | null;
    };
    client_name: string;
    recipients: string[];
  }): Promise<{ sent_at: string }>;
}

/**
 * Stub implementation that throws NotImplementedError.
 * To be replaced by Feature 16.
 */
export class EmailAdapterStub implements EmailAdapterService {
  async sendAgenda(
    _params: Parameters<EmailAdapterService['sendAgenda']>[0]
  ): Promise<{ sent_at: string }> {
    throw new NotImplementedError('EmailAdapter not implemented — Feature 16 pending');
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (can be replaced at runtime for testing or Feature 16)
// ---------------------------------------------------------------------------

let _emailAdapter: EmailAdapterService = new EmailAdapterStub();

export function getEmailAdapter(): EmailAdapterService {
  return _emailAdapter;
}

export function setEmailAdapter(adapter: EmailAdapterService): void {
  _emailAdapter = adapter;
}
