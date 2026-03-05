import { describe, it, expect } from 'vitest';
import { formatTaskTable } from '../../src/formatters/task-formatter.js';
import type { NormalizedTask } from '@iexcel/shared-types';
import { TaskStatus, TaskPriority } from '@iexcel/shared-types';

function makeTask(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: 'uuid-1',
    shortId: 'TSK-0042' as NormalizedTask['shortId'],
    clientId: 'client-1',
    transcriptId: null,
    status: TaskStatus.Draft,
    title: 'Set up GA4 tracking for landing pages',
    description: {
      taskContext: 'Context',
      additionalContext: 'Additional',
      requirements: ['Req 1'],
    },
    assignee: null,
    priority: TaskPriority.Medium,
    estimatedTime: 'PT1H30M',
    dueDate: null,
    scrumStage: 'backlog',
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

describe('formatTaskTable', () => {
  it('returns empty message when no tasks', () => {
    const result = formatTaskTable([]);
    expect(result).toBe('No tasks found.');
  });

  it('returns custom empty message when provided', () => {
    const result = formatTaskTable([], 'No draft tasks for this client.');
    expect(result).toBe('No draft tasks for this client.');
  });

  it('formats a single task as a Markdown table', () => {
    const tasks = [makeTask()];
    const result = formatTaskTable(tasks);

    expect(result).toContain('| ID');
    expect(result).toContain('| Description');
    expect(result).toContain('| Time');
    expect(result).toContain('| Status');
    expect(result).toContain('TSK-0042');
    expect(result).toContain('Set up GA4 tracking for landing pages');
    expect(result).toContain('1h 30m');
    expect(result).toContain('draft');
  });

  it('formats multiple tasks', () => {
    const tasks = [
      makeTask({ shortId: 'TSK-0042' as NormalizedTask['shortId'] }),
      makeTask({
        shortId: 'TSK-0043' as NormalizedTask['shortId'],
        title: 'Update DNS records',
        estimatedTime: 'PT0H45M',
        status: TaskStatus.Approved,
      }),
    ];
    const result = formatTaskTable(tasks);
    const lines = result.split('\n');

    // Header + separator + 2 data rows
    expect(lines).toHaveLength(4);
    expect(result).toContain('TSK-0042');
    expect(result).toContain('TSK-0043');
  });

  it('truncates descriptions at 60 characters', () => {
    const longTitle =
      'This is a very long task description that exceeds sixty characters and should be truncated';
    const tasks = [makeTask({ title: longTitle })];
    const result = formatTaskTable(tasks);

    // 60 chars total: 57 content + "..."
    expect(result).not.toContain(longTitle);
    expect(result).toContain('...');
  });

  it('does not truncate descriptions at or under 60 characters', () => {
    const exactTitle = 'A'.repeat(60);
    const tasks = [makeTask({ title: exactTitle })];
    const result = formatTaskTable(tasks);

    expect(result).toContain(exactTitle);
    expect(result).not.toContain('...');
  });

  it('handles null estimatedTime gracefully', () => {
    const tasks = [makeTask({ estimatedTime: null })];
    const result = formatTaskTable(tasks);

    expect(result).toContain('-');
  });

  it('handles non-standard duration strings', () => {
    const tasks = [makeTask({ estimatedTime: '2 hours' })];
    const result = formatTaskTable(tasks);

    // Falls back to raw string
    expect(result).toContain('2 hours');
  });

  it('formats hours-only duration', () => {
    const tasks = [makeTask({ estimatedTime: 'PT2H' })];
    const result = formatTaskTable(tasks);

    expect(result).toContain('2h 00m');
  });

  it('formats minutes-only duration', () => {
    const tasks = [makeTask({ estimatedTime: 'PT45M' })];
    const result = formatTaskTable(tasks);

    expect(result).toContain('0h 45m');
  });
});
