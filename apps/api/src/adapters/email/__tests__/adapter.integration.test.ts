import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgendaEmailInput, EmailProviderCredentials } from '../adapter';
import { EmailAdapterError } from '../email-adapter-error';

// ---------------------------------------------------------------------------
// Mock the Resend SDK
// ---------------------------------------------------------------------------

const mockResendSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend };
  },
}));

// ---------------------------------------------------------------------------
// Mock global fetch for SendGrid provider
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { sendAgendaEmail, hashEmail } = await import('../adapter');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<AgendaEmailInput>): AgendaEmailInput {
  return {
    agendaId: '11111111-1111-1111-1111-111111111111',
    shortId: 'AGD-0015',
    content: [
      '## Completed Tasks',
      '- Task A done',
      '',
      '## Incomplete Tasks',
      '- Task B pending',
      '',
      '## Relevant Deliverables',
      '- Doc v2',
      '',
      '## Recommendations',
      '- Upgrade runtime',
      '',
      '## New Ideas',
      '- AI routing',
      '',
      '## Next Steps',
      '- Stakeholder review',
    ].join('\n'),
    cycleStart: '2026-02-17',
    cycleEnd: '2026-02-28',
    clientName: 'Total Life',
    ...overrides,
  };
}

const resendCredentials: EmailProviderCredentials = {
  provider: 'resend',
  apiKey: 're_test_1234567890',
  fromEmail: 'noreply@iexcel.app',
  fromName: 'iExcel Automation',
};

const sendgridCredentials: EmailProviderCredentials = {
  provider: 'sendgrid',
  apiKey: 'SG.test_1234567890',
  fromEmail: 'noreply@iexcel.app',
  fromName: 'iExcel Automation',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console output during tests
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Resend — Happy Path
// ---------------------------------------------------------------------------

describe('Resend provider — happy path', () => {
  it('sends to a single recipient and returns delivery status', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_abc123' },
      error: null,
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['mark@totallife.com'],
      resendCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('sent');
    expect(statuses[0].email).toBe('mark@totallife.com');
    expect(statuses[0].providerMessageId).toBe('msg_abc123');
    expect(statuses[0].error).toBeNull();
  });

  it('sends to multiple recipients', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_multi' },
      error: null,
    });

    const recipients = [
      'ceo@totallife.com',
      'mark@totallife.com',
      'ops@totallife.com',
    ];
    const statuses = await sendAgendaEmail(
      makeInput(),
      recipients,
      resendCredentials,
    );

    expect(statuses).toHaveLength(3);
    expect(statuses.every((s) => s.status === 'sent')).toBe(true);
    expect(statuses.every((s) => s.providerMessageId === 'msg_multi')).toBe(
      true,
    );
  });

  it('passes correct subject and from fields to Resend SDK', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_check' },
      error: null,
    });

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    expect(mockResendSend).toHaveBeenCalledOnce();
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toBe('iExcel Automation <noreply@iexcel.app>');
    expect(callArgs.subject).toContain('Running Notes');
    expect(callArgs.subject).toContain('Total Life');
    expect(callArgs.html).toContain('<!DOCTYPE html>');
  });
});

// ---------------------------------------------------------------------------
// Empty recipients
// ---------------------------------------------------------------------------

describe('empty recipients', () => {
  it('throws EmailAdapterError with code NO_RECIPIENTS before any SDK call', async () => {
    await expect(
      sendAgendaEmail(makeInput(), [], resendCredentials),
    ).rejects.toThrow(EmailAdapterError);

    await expect(
      sendAgendaEmail(makeInput(), [], resendCredentials),
    ).rejects.toMatchObject({ code: 'NO_RECIPIENTS' });

    // No SDK calls should have been made
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Resend — Auth failures
// ---------------------------------------------------------------------------

describe('Resend provider — auth failures', () => {
  it('throws EMAIL_AUTH_FAILED on 401', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 401, message: 'Unauthorized', name: 'unauthorized' },
    });

    await expect(
      sendAgendaEmail(makeInput(), ['test@example.com'], resendCredentials),
    ).rejects.toMatchObject({ code: 'EMAIL_AUTH_FAILED' });
  });

  it('throws EMAIL_AUTH_FAILED on 403', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 403, message: 'Forbidden', name: 'forbidden' },
    });

    await expect(
      sendAgendaEmail(makeInput(), ['test@example.com'], resendCredentials),
    ).rejects.toMatchObject({ code: 'EMAIL_AUTH_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// Resend — Retry scenarios
// ---------------------------------------------------------------------------

describe('Resend provider — retry scenarios', () => {
  it('retries on 429 and succeeds on second attempt', async () => {
    // First call: 429
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 429, message: 'Rate limited', name: 'rate_limit' },
    });
    // Second call: success
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_retry_ok' },
      error: null,
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('sent');
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds on second attempt', async () => {
    // First call: 500
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: 500,
        message: 'Internal Server Error',
        name: 'server_error',
      },
    });
    // Second call: success
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_retry_500' },
      error: null,
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('sent');
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries exhausted on repeated 429', async () => {
    // All 3 attempts return 429
    for (let i = 0; i < 3; i++) {
      mockResendSend.mockResolvedValueOnce({
        data: null,
        error: {
          statusCode: 429,
          message: 'Rate limited',
          name: 'rate_limit',
        },
      });
    }

    await expect(
      sendAgendaEmail(makeInput(), ['test@example.com'], resendCredentials),
    ).rejects.toThrow();

    expect(mockResendSend).toHaveBeenCalledTimes(3);
  });

  it('returns failed status for non-retryable provider errors', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: 422,
        message: 'Invalid email address',
        name: 'validation_error',
      },
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['bad-email'],
      resendCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('failed');
    expect(statuses[0].error).toBe('Invalid email address');
  });
});

// ---------------------------------------------------------------------------
// SendGrid — Happy Path
// ---------------------------------------------------------------------------

describe('SendGrid provider — happy path', () => {
  it('sends to a single recipient and returns delivery status', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 202,
      headers: new Headers({ 'x-message-id': 'sg_msg_001' }),
      text: async () => '',
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['mark@totallife.com'],
      sendgridCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('sent');
    expect(statuses[0].providerMessageId).toBe('sg_msg_001');
  });

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 202,
      headers: new Headers({ 'x-message-id': 'sg_msg_002' }),
      text: async () => '',
    });

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      sendgridCredentials,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBe(
      `Bearer ${sendgridCredentials.apiKey}`,
    );
  });
});

// ---------------------------------------------------------------------------
// SendGrid — Auth failures
// ---------------------------------------------------------------------------

describe('SendGrid provider — auth failures', () => {
  it('throws EMAIL_AUTH_FAILED on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers(),
      text: async () => 'Unauthorized',
    });

    await expect(
      sendAgendaEmail(makeInput(), ['test@example.com'], sendgridCredentials),
    ).rejects.toMatchObject({ code: 'EMAIL_AUTH_FAILED' });
  });

  it('throws EMAIL_AUTH_FAILED on 403', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 403,
      headers: new Headers(),
      text: async () => 'Forbidden',
    });

    await expect(
      sendAgendaEmail(makeInput(), ['test@example.com'], sendgridCredentials),
    ).rejects.toMatchObject({ code: 'EMAIL_AUTH_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// SendGrid — Retry scenarios
// ---------------------------------------------------------------------------

describe('SendGrid provider — retry scenarios', () => {
  it('retries on 429 and succeeds on second attempt', async () => {
    // First call: 429
    mockFetch.mockResolvedValueOnce({
      status: 429,
      headers: new Headers(),
      text: async () => 'Rate limited',
    });
    // Second call: success
    mockFetch.mockResolvedValueOnce({
      status: 202,
      headers: new Headers({ 'x-message-id': 'sg_retry_ok' }),
      text: async () => '',
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      sendgridCredentials,
    );

    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 503,
      headers: new Headers(),
      text: async () => 'Service Unavailable',
    });
    mockFetch.mockResolvedValueOnce({
      status: 202,
      headers: new Headers({ 'x-message-id': 'sg_retry_503' }),
      text: async () => '',
    });

    const statuses = await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      sendgridCredentials,
    );

    expect(statuses[0].status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Email hashing
// ---------------------------------------------------------------------------

describe('hashEmail', () => {
  it('returns a 12-character hex string', () => {
    const hashed = hashEmail('test@example.com');
    expect(hashed).toHaveLength(12);
    expect(hashed).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is case-insensitive', () => {
    expect(hashEmail('Test@Example.COM')).toBe(hashEmail('test@example.com'));
  });

  it('produces different hashes for different emails', () => {
    expect(hashEmail('alice@example.com')).not.toBe(
      hashEmail('bob@example.com'),
    );
  });
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

describe('structured logging', () => {
  it('emits "Send started" info log', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_log' },
      error: null,
    });

    const consoleSpy = vi.spyOn(console, 'info');

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Send started'))).toBe(true);
  });

  it('emits "Delivery status received" info log', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_log2' },
      error: null,
    });

    const consoleSpy = vi.spyOn(console, 'info');

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Delivery status received'))).toBe(
      true,
    );
  });

  it('emits "Send completed" info log with durationMs', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_log3' },
      error: null,
    });

    const consoleSpy = vi.spyOn(console, 'info');

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const completedLog = calls.find((c) => c.includes('Send completed'));
    expect(completedLog).toBeDefined();
    expect(completedLog).toContain('durationMs');
  });

  it('does not log the API key', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: 'msg_nokey' },
      error: null,
    });

    const allLogs: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((...args) => {
      allLogs.push(String(args[0]));
    });
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      allLogs.push(String(args[0]));
    });
    vi.spyOn(console, 'debug').mockImplementation((...args) => {
      allLogs.push(String(args[0]));
    });

    await sendAgendaEmail(
      makeInput(),
      ['test@example.com'],
      resendCredentials,
    );

    for (const log of allLogs) {
      expect(log).not.toContain(resendCredentials.apiKey);
    }
  });

  it('hashes email addresses in failure logs', async () => {
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: 422,
        message: 'Invalid address',
        name: 'validation_error',
      },
    });

    const warnLogs: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnLogs.push(String(args[0]));
    });

    await sendAgendaEmail(
      makeInput(),
      ['plaintext@example.com'],
      resendCredentials,
    );

    const failureLog = warnLogs.find((l) =>
      l.includes('Individual recipient failure'),
    );
    if (failureLog) {
      expect(failureLog).not.toContain('plaintext@example.com');
      // Should contain the hash instead
      expect(failureLog).toContain(hashEmail('plaintext@example.com'));
    }
  });
});
