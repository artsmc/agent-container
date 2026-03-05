/**
 * Unit tests for MCP tool output formatters.
 * @see Feature 21 — Task 1.7
 */
import { describe, it, expect } from 'vitest';
import {
  formatTaskTable,
  formatClientStatus,
  formatClientList,
  formatAgenda,
  truncateTranscript,
  truncate,
  formatError,
} from '../formatters.js';
import type { NormalizedTask, Agenda, Client } from '@iexcel/shared-types';
import type { ClientStatusResponse } from '@iexcel/api-client';

// Minimal task factory
function makeTask(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    shortId: 'TSK-0042' as any,
    clientId: 'client-1',
    transcriptId: null,
    status: 'draft' as any,
    title: 'Update quarterly report',
    description: { taskContext: '', additionalContext: '', requirements: [] },
    assignee: null,
    priority: 'medium' as any,
    estimatedTime: '1h 30m',
    dueDate: null,
    scrumStage: 'Backlog',
    tags: [],
    externalRef: null,
    approvedBy: null,
    approvedAt: null,
    pushedAt: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

describe('truncate', () => {
  it('returns string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact boundary', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('formatTaskTable', () => {
  it('formats tasks as Markdown table', () => {
    const tasks = [
      makeTask({ shortId: 'TSK-0042' as any, title: 'Update report', estimatedTime: '1h', status: 'draft' as any }),
      makeTask({ shortId: 'TSK-0043' as any, title: 'Review code', estimatedTime: null, status: 'approved' as any }),
    ];

    const result = formatTaskTable(tasks);
    expect(result).toContain('| ID');
    expect(result).toContain('TSK-0042');
    expect(result).toContain('TSK-0043');
    expect(result).toContain('Update report');
    expect(result).toContain('Review code');
    expect(result).toContain('draft');
    expect(result).toContain('approved');
  });

  it('truncates long task titles to 60 chars', () => {
    const longTitle = 'A'.repeat(80);
    const tasks = [makeTask({ title: longTitle })];
    const result = formatTaskTable(tasks);
    expect(result).toContain('A'.repeat(57) + '...');
    expect(result).not.toContain('A'.repeat(80));
  });

  it('handles empty task list', () => {
    const result = formatTaskTable([]);
    // Should have header and divider but no data rows
    const lines = result.split('\n');
    expect(lines.length).toBe(2); // header + divider
  });

  it('shows dash for null estimated time', () => {
    const tasks = [makeTask({ estimatedTime: null })];
    const result = formatTaskTable(tasks);
    expect(result).toContain('-');
  });
});

describe('formatClientStatus', () => {
  it('formats status as key-value lines', () => {
    const status: ClientStatusResponse = {
      clientId: 'abc',
      pendingApprovals: 3,
      agendaReady: false,
      nextCallDate: '2026-03-07',
    };

    const result = formatClientStatus('Total Life', status);
    expect(result).toContain('Client: Total Life');
    expect(result).toContain('Pending Approvals: 3');
    expect(result).toContain('Agenda Ready: No');
    expect(result).toContain('Next Call: 2026-03-07');
  });

  it('shows "Not scheduled" when nextCallDate is null', () => {
    const status: ClientStatusResponse = {
      clientId: 'abc',
      pendingApprovals: 0,
      agendaReady: true,
      nextCallDate: null,
    };

    const result = formatClientStatus('Acme', status);
    expect(result).toContain('Next Call: Not scheduled');
    expect(result).toContain('Agenda Ready: Yes');
  });
});

describe('formatClientList', () => {
  it('formats clients as Markdown table', () => {
    const clients = [
      { id: 'abc-1', name: 'Total Life' },
      { id: 'abc-2', name: 'Acme Corp' },
    ] as Client[];

    const result = formatClientList(clients);
    expect(result).toContain('Total Life');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('| Client Name');
  });

  it('handles empty client list', () => {
    const result = formatClientList([]);
    const lines = result.split('\n');
    expect(lines.length).toBe(2); // header + divider only
  });
});

describe('formatAgenda', () => {
  it('formats agenda with header and content', () => {
    const agenda: Agenda = {
      id: 'a-1',
      shortId: 'AGD-0015' as any,
      clientId: 'c-1',
      status: 'draft' as any,
      content: '# Meeting Notes\n\nItem 1\nItem 2',
      cycleStart: '2026-02-01',
      cycleEnd: '2026-02-28',
      sharedUrlToken: null,
      internalUrlToken: null,
      googleDocId: null,
      finalizedBy: null,
      finalizedAt: null,
      sharedAt: null,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    };

    const result = formatAgenda('Total Life', agenda);
    expect(result).toContain('Agenda AGD-0015 for Total Life');
    expect(result).toContain('Status: draft');
    expect(result).toContain('Cycle: 2026-02-01 to 2026-02-28');
    expect(result).toContain('# Meeting Notes');
  });
});

describe('truncateTranscript', () => {
  it('returns content unchanged if under 2000 chars', () => {
    const short = 'Hello world';
    expect(truncateTranscript(short, 't-1')).toBe(short);
  });

  it('truncates at 2000 chars and appends link', () => {
    const long = 'A'.repeat(3000);
    const result = truncateTranscript(long, 't-1');
    expect(result.length).toBeLessThan(3000);
    expect(result).toContain('[Transcript truncated');
    expect(result).toContain('transcripts/t-1');
  });

  it('includes custom UI base URL in truncation link', () => {
    const long = 'A'.repeat(3000);
    const result = truncateTranscript(long, 't-1', 'https://app.iexcel.com');
    expect(result).toContain('https://app.iexcel.com/transcripts/t-1');
  });

  it('keeps exactly 2000 chars of content before truncation notice', () => {
    const long = 'B'.repeat(5000);
    const result = truncateTranscript(long, 't-1');
    // The first 2000 chars should be 'B's
    expect(result.startsWith('B'.repeat(2000))).toBe(true);
  });
});

describe('formatError', () => {
  it('returns the message string as-is', () => {
    expect(formatError('Something went wrong')).toBe('Something went wrong');
  });
});
