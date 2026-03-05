import { describe, it, expect } from 'vitest';
import { formatAgenda } from '../../src/formatters/agenda-formatter.js';
import type { Agenda } from '@iexcel/shared-types';
import { AgendaStatus } from '@iexcel/shared-types';

function makeAgenda(overrides: Partial<Agenda> = {}): Agenda {
  return {
    id: 'uuid-1',
    shortId: 'AGD-0015' as Agenda['shortId'],
    clientId: 'client-1',
    status: AgendaStatus.Draft,
    content: '',
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
    ...overrides,
  };
}

describe('formatAgenda', () => {
  it('shows empty content message for empty agenda', () => {
    const agenda = makeAgenda({ content: '' });
    const result = formatAgenda(agenda);

    expect(result).toContain('AGD-0015');
    expect(result).toContain('draft');
    expect(result).toContain('No content yet.');
  });

  it('includes header with short ID and status', () => {
    const agenda = makeAgenda({
      content: '## Completed Tasks\n- Task A\n- Task B',
    });
    const result = formatAgenda(agenda);

    expect(result).toContain('Agenda for AGD-0015 (draft)');
    expect(result).toContain('Cycle: 2026-02-01 to 2026-02-28');
  });

  it('parses Markdown headings into uppercase sections', () => {
    const content = [
      '## Completed Tasks',
      '- Set up GA4 tracking',
      '- Updated DNS records',
      '',
      '## Incomplete Tasks',
      '- Design email template (in progress)',
      '',
      '## Recommendations',
      'Consider reviewing the Q2 campaign strategy.',
    ].join('\n');

    const agenda = makeAgenda({ content });
    const result = formatAgenda(agenda);

    expect(result).toContain('COMPLETED TASKS');
    expect(result).toContain('INCOMPLETE TASKS');
    expect(result).toContain('RECOMMENDATIONS');
    expect(result).toContain('Set up GA4 tracking');
    expect(result).toContain('Design email template (in progress)');
  });

  it('truncates sections exceeding 500 characters', () => {
    const longContent = '## Long Section\n' + 'A'.repeat(600);
    const agenda = makeAgenda({ content: longContent });
    const result = formatAgenda(agenda);

    expect(result).toContain('[... See full agenda');
    // The full 600-char string should not appear
    expect(result).not.toContain('A'.repeat(600));
  });

  it('does not truncate sections at or under 500 characters', () => {
    const exactContent = '## Exact Section\n' + 'B'.repeat(500);
    const agenda = makeAgenda({ content: exactContent });
    const result = formatAgenda(agenda);

    expect(result).toContain('B'.repeat(500));
    expect(result).not.toContain('[... See full agenda');
  });

  it('handles content without headings as a single section', () => {
    const content = 'This is plain text without any headings.';
    const agenda = makeAgenda({ content });
    const result = formatAgenda(agenda);

    expect(result).toContain('This is plain text without any headings.');
  });
});
