/**
 * Unit tests for the Agenda Agent prompt helper functions.
 *
 * @see Feature 20 — Task 20-09
 */
import { describe, it, expect, vi } from 'vitest';
import {
  formatDate,
  formatCycleRange,
  validateSections,
  buildAgendaPrompt,
  REQUIRED_SECTIONS,
  type PromptTask,
} from './agenda-prompt-helpers';

// ── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats first of month correctly', () => {
    expect(formatDate('2026-02-01')).toBe('February 1, 2026');
  });

  it('formats last of month correctly', () => {
    expect(formatDate('2026-02-28')).toBe('February 28, 2026');
  });

  it('formats February correctly', () => {
    expect(formatDate('2026-02-15')).toBe('February 15, 2026');
  });

  it('formats December correctly', () => {
    expect(formatDate('2026-12-25')).toBe('December 25, 2026');
  });

  it('formats January correctly', () => {
    expect(formatDate('2026-01-01')).toBe('January 1, 2026');
  });

  it('formats single-digit day without leading zero', () => {
    expect(formatDate('2026-03-5')).toBe('March 5, 2026');
  });
});

// ── formatCycleRange ────────────────────────────────────────────────────────

describe('formatCycleRange', () => {
  it('formats same-month range', () => {
    expect(formatCycleRange('2026-02-01', '2026-02-28')).toBe(
      'February 1 \u2013 28, 2026'
    );
  });

  it('formats cross-month range', () => {
    expect(formatCycleRange('2026-01-15', '2026-02-14')).toBe(
      'January 15 \u2013 February 14, 2026'
    );
  });

  it('formats same-day range (edge case)', () => {
    expect(formatCycleRange('2026-03-01', '2026-03-01')).toBe(
      'March 1 \u2013 1, 2026'
    );
  });

  it('formats cross-year range', () => {
    expect(formatCycleRange('2025-12-15', '2026-01-14')).toBe(
      'December 15, 2025 \u2013 January 14, 2026'
    );
  });
});

// ── validateSections ────────────────────────────────────────────────────────

describe('validateSections', () => {
  const fullContent = [
    '## Completed Tasks',
    'Some completed work.',
    '## Incomplete Tasks',
    'Some incomplete work.',
    '## Relevant Deliverables',
    'Some deliverables.',
    '## Recommendations',
    'Some recommendations.',
    '## New Ideas',
    'Some ideas.',
    '## Next Steps',
    'Some next steps.',
  ].join('\n');

  it('returns valid when all sections present', () => {
    const result = validateSections(fullContent);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('detects one missing section', () => {
    const content = fullContent.replace('## New Ideas', '## Ideas');
    const result = validateSections(content);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['## New Ideas']);
  });

  it('detects multiple missing sections', () => {
    const content = fullContent
      .replace('## Recommendations', '## Recs')
      .replace('## New Ideas', '## Ideas')
      .replace('## Next Steps', '## Steps');
    const result = validateSections(content);
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain('## Recommendations');
    expect(result.missing).toContain('## New Ideas');
    expect(result.missing).toContain('## Next Steps');
  });

  it('detects all sections missing from empty string', () => {
    const result = validateSections('');
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(6);
  });
});

// ── buildAgendaPrompt ───────────────────────────────────────────────────────

describe('buildAgendaPrompt', () => {
  const makeTask = (overrides: Partial<PromptTask> = {}): PromptTask => ({
    shortId: 'TSK-0001',
    title: 'Test task',
    description: {
      taskContext: 'Test context for this task',
      additionalContext: 'Additional info',
      requirements: ['Req 1'],
    },
    assignee: 'John',
    estimatedTime: 'PT2H',
    scrumStage: 'done',
    asanaStatus: 'completed',
    asanaCompleted: true,
    asanaCompletedAt: '2026-02-15T10:00:00Z',
    ...overrides,
  });

  it('includes client name and cycle range', () => {
    const result = buildAgendaPrompt(
      'Total Life',
      '2026-02-01',
      '2026-02-28',
      [makeTask()],
      [],
    );
    expect(result).toContain('Client: Total Life');
    expect(result).toContain('February 1');
    expect(result).toContain('28, 2026');
  });

  it('formats completed tasks with short ID, title, assignee, and estimate', () => {
    const task = makeTask({
      shortId: 'TSK-0042',
      title: 'Update proposal',
      assignee: 'Mark',
      estimatedTime: 'PT2H',
    });
    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', [task], []);
    expect(result).toContain('[TSK-0042] Update proposal');
    expect(result).toContain('(Assignee: Mark)');
    expect(result).toContain('(Est: PT2H)');
  });

  it('formats task context and truncates at 300 chars', () => {
    const longContext = 'A'.repeat(500);
    const task = makeTask({
      description: {
        taskContext: longContext,
        additionalContext: '',
        requirements: [],
      },
    });
    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', [task], []);
    expect(result).toContain('Context: ' + 'A'.repeat(300));
    expect(result).not.toContain('A'.repeat(301));
  });

  it('shows (None) for empty incomplete tasks', () => {
    const result = buildAgendaPrompt(
      'Client',
      '2026-02-01',
      '2026-02-28',
      [makeTask()],
      [],
    );
    expect(result).toContain('(None)');
  });

  it('includes incomplete tasks when present', () => {
    const incompleteTask = makeTask({
      shortId: 'TSK-0050',
      title: 'Pending task',
      asanaStatus: 'incomplete',
    });
    const result = buildAgendaPrompt(
      'Client',
      '2026-02-01',
      '2026-02-28',
      [makeTask()],
      [incompleteTask],
    );
    expect(result).toContain('[TSK-0050] Pending task');
    expect(result).toContain('INCOMPLETE TASKS (1 total)');
  });

  it('includes task counts in section headers', () => {
    const completed = [makeTask(), makeTask({ shortId: 'TSK-0002' })];
    const incomplete = [makeTask({ shortId: 'TSK-0003', asanaStatus: 'incomplete' })];
    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', completed, incomplete);
    expect(result).toContain('COMPLETED TASKS (2 total)');
    expect(result).toContain('INCOMPLETE TASKS (1 total)');
  });

  it('enforces 30 completed task limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tasks = Array.from({ length: 35 }, (_, i) =>
      makeTask({
        shortId: `TSK-${String(i).padStart(4, '0')}`,
        asanaCompletedAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }),
    );

    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', tasks, []);
    expect(result).toContain('COMPLETED TASKS (30 total)');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('enforces 20 incomplete task limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const completedTasks = [makeTask()];
    const incompleteTasks = Array.from({ length: 25 }, (_, i) =>
      makeTask({
        shortId: `TSK-${String(i + 100).padStart(4, '0')}`,
        asanaStatus: 'incomplete',
      }),
    );

    const result = buildAgendaPrompt(
      'Client',
      '2026-02-01',
      '2026-02-28',
      completedTasks,
      incompleteTasks,
    );
    expect(result).toContain('INCOMPLETE TASKS (20 total)');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('sorts completed tasks by asanaCompletedAt descending', () => {
    const tasks = [
      makeTask({ shortId: 'TSK-0001', asanaCompletedAt: '2026-02-10T10:00:00Z' }),
      makeTask({ shortId: 'TSK-0002', asanaCompletedAt: '2026-02-20T10:00:00Z' }),
      makeTask({ shortId: 'TSK-0003', asanaCompletedAt: '2026-02-15T10:00:00Z' }),
    ];

    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', tasks, []);
    const idx1 = result.indexOf('TSK-0002');
    const idx2 = result.indexOf('TSK-0003');
    const idx3 = result.indexOf('TSK-0001');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('handles tasks without assignee or estimatedTime', () => {
    const task = makeTask({
      assignee: null,
      estimatedTime: null,
    });
    const result = buildAgendaPrompt('Client', '2026-02-01', '2026-02-28', [task], []);
    expect(result).not.toContain('Assignee:');
    expect(result).not.toContain('Est:');
  });
});
