import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFeedEntry } from './ActivityFeedEntry';
import type { DashboardAuditEntry } from '@/types/dashboard';

// Mock next/navigation for client component
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
  }),
}));

function makeEntry(
  overrides: Partial<DashboardAuditEntry> = {}
): DashboardAuditEntry {
  return {
    id: 'entry-1',
    actionType: 'task.approved',
    actor: { id: 'user-1', name: 'Alice', avatarUrl: null },
    entityType: 'task',
    entityId: 'TSK-0042',
    entityLabel: null,
    clientId: null,
    clientName: null,
    workflowName: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    ...overrides,
  };
}

describe('ActivityFeedEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the actor name', () => {
    render(<ActivityFeedEntry entry={makeEntry()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders action description for task.approved', () => {
    render(<ActivityFeedEntry entry={makeEntry({ actionType: 'task.approved' })} />);
    expect(screen.getByText(/Approved task TSK-0042/)).toBeInTheDocument();
  });

  it('renders action description for task.rejected', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({ actionType: 'task.rejected', entityId: 'TSK-0010' })}
      />
    );
    expect(screen.getByText(/Rejected task TSK-0010/)).toBeInTheDocument();
  });

  it('renders action description for task.pushed', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({ actionType: 'task.pushed', entityId: 'TSK-0010' })}
      />
    );
    expect(screen.getByText(/Pushed task TSK-0010 to Asana/)).toBeInTheDocument();
  });

  it('renders action description for agenda.shared', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({
          actionType: 'agenda.shared',
          entityId: 'AGD-0005',
          clientName: 'Acme Corp',
        })}
      />
    );
    expect(
      screen.getByText(/Shared agenda AGD-0005 with client Acme Corp/)
    ).toBeInTheDocument();
  });

  it('renders action description for agenda.finalized', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({ actionType: 'agenda.finalized', entityId: 'AGD-0005' })}
      />
    );
    expect(screen.getByText(/Finalized agenda AGD-0005/)).toBeInTheDocument();
  });

  it('renders action description for email.sent', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({ actionType: 'email.sent', entityId: 'AGD-0005' })}
      />
    );
    expect(screen.getByText(/Sent email for agenda AGD-0005/)).toBeInTheDocument();
  });

  it('renders action description for workflow.triggered', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({
          actionType: 'workflow.triggered',
          workflowName: 'Intake',
          clientName: 'Globex Corp',
        })}
      />
    );
    expect(
      screen.getByText(/Triggered Intake for Globex Corp/)
    ).toBeInTheDocument();
  });

  it('renders fallback description for unknown action', () => {
    render(
      <ActivityFeedEntry
        entry={makeEntry({
          actionType: 'unknown.thing',
          entityType: 'task',
          entityId: 'TSK-0099',
        })}
      />
    );
    expect(
      screen.getByText(/Performed action on task TSK-0099/)
    ).toBeInTheDocument();
  });

  it('renders a relative timestamp', () => {
    render(<ActivityFeedEntry entry={makeEntry({ createdAt: '2026-03-03T14:00:00Z' })} />);
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
  });

  it('renders absolute time in a title attribute', () => {
    render(<ActivityFeedEntry entry={makeEntry({ createdAt: '2026-03-03T14:00:00Z' })} />);
    const timeEl = screen.getByText(/2 hours ago/);
    expect(timeEl).toHaveAttribute('title');
    // The title should contain the month and year
    expect(timeEl.getAttribute('title')).toContain('2026');
  });

  it('renders avatar with initials when no avatar_url', () => {
    render(<ActivityFeedEntry entry={makeEntry()} />);
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toBeInTheDocument();
    // Initials for "Alice" = "A"
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('has data-testid for the entry', () => {
    render(<ActivityFeedEntry entry={makeEntry()} />);
    expect(screen.getByTestId('activity-feed-entry')).toBeInTheDocument();
  });
});
