import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingApprovalRow } from './PendingApprovalRow';
import type { DashboardDraftTask } from '@/types/dashboard';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
  }),
}));

const mockTask: DashboardDraftTask = {
  shortId: 'TSK-0042',
  clientId: 'acme-corp',
  clientName: 'Acme Corp',
  title: 'Set up onboarding automation for Q2',
  estimatedMinutes: 150,
};

function renderRow(task: DashboardDraftTask = mockTask) {
  return render(
    <table>
      <tbody>
        <PendingApprovalRow task={task} />
      </tbody>
    </table>
  );
}

describe('PendingApprovalRow', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders the short ID', () => {
    renderRow();
    expect(screen.getByText('TSK-0042')).toBeInTheDocument();
  });

  it('renders the task title', () => {
    renderRow();
    expect(
      screen.getByText('Set up onboarding automation for Q2')
    ).toBeInTheDocument();
  });

  it('renders the client name', () => {
    renderRow();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the formatted estimated time', () => {
    renderRow();
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });

  it('renders "\u2014" when estimatedMinutes is null', () => {
    renderRow({ ...mockTask, estimatedMinutes: null });
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('navigates on row click', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith(
      '/clients/acme-corp/tasks?task=TSK-0042'
    );
  });

  it('navigates on Enter key press', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith(
      '/clients/acme-corp/tasks?task=TSK-0042'
    );
  });

  it('does not navigate on other key press', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    fireEvent.keyDown(row, { key: 'Space' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('truncates titles longer than 60 characters', () => {
    const longTitle =
      'This is a very long task title that exceeds the sixty character truncation limit by quite a bit';
    renderRow({ ...mockTask, title: longTitle });
    const truncated = screen.getByText(/This is a very long task title/);
    expect(truncated.textContent).toHaveLength(63); // 60 chars + "..."
  });

  it('has aria-label for accessibility', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    expect(row).toHaveAttribute('aria-label', 'Review task TSK-0042');
  });

  it('has role="link" for accessibility', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    expect(row).toHaveAttribute('role', 'link');
  });

  it('is focusable via tabIndex', () => {
    renderRow();
    const row = screen.getByTestId('approval-row');
    expect(row).toHaveAttribute('tabindex', '0');
  });
});
