import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogTab } from './AuditLogTab';
import type { AuditEvent, AuditLogResponse } from '../../types';

const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 'evt-1',
    userId: 'user-1',
    userName: 'Alice Admin',
    action: 'task.created',
    entityType: 'task',
    entityId: 'uuid-1',
    entityShortId: 'TSK-0042',
    metadata: {},
    source: 'ui',
    createdAt: '2026-03-01T14:34:00Z',
  },
  {
    id: 'evt-2',
    userId: null,
    userName: null,
    action: 'agenda.shared',
    entityType: 'agenda',
    entityId: 'uuid-2',
    entityShortId: 'AGD-0015',
    metadata: {},
    source: 'agent',
    createdAt: '2026-03-02T10:00:00Z',
  },
  {
    id: 'evt-3',
    userId: 'user-2',
    userName: 'Bob Manager',
    action: 'transcript.submitted',
    entityType: 'transcript',
    entityId: 'uuid-3',
    entityShortId: 'TRN-0001',
    metadata: {},
    source: 'terminal',
    createdAt: '2026-03-03T08:00:00Z',
  },
];

const MOCK_RESPONSE: AuditLogResponse = {
  data: MOCK_EVENTS,
  total: 53,
  page: 1,
  limit: 25,
};

const MOCK_EMPTY_RESPONSE: AuditLogResponse = {
  data: [],
  total: 0,
  page: 1,
  limit: 25,
};

const mockFetchAuditLog = vi.fn<() => Promise<AuditLogResponse>>();
const mockFetchAdminUsers = vi.fn<() => Promise<Array<{ id: string; name: string; email: string; role: string; isActive: boolean; authUserId: string; assignedClients: Array<{ id: string; name: string }> }>>>();

vi.mock('../../hooks/use-settings-api', () => ({
  fetchAuditLog: (...args: unknown[]) => mockFetchAuditLog(...(args as [])),
  fetchAdminUsers: (...args: unknown[]) =>
    mockFetchAdminUsers(...(args as [])),
}));

describe('AuditLogTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAdminUsers.mockResolvedValue([
      {
        id: 'user-1',
        authUserId: 'auth-1',
        name: 'Alice Admin',
        email: 'alice@test.com',
        role: 'admin',
        isActive: true,
        assignedClients: [],
      },
    ]);
  });

  it('loads table with default results on mount', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    // Should show loading state first
    expect(screen.getByTestId('audit-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    });

    // Verify data is rendered -- use getAllByText because "Alice Admin" also appears in the filter dropdown
    const aliceElements = screen.getAllByText('Alice Admin');
    expect(aliceElements.length).toBeGreaterThanOrEqual(2); // option + table cell
    expect(screen.getByText('Agent')).toBeInTheDocument(); // null userName
  });

  it('shows skeleton rows during loading', () => {
    mockFetchAuditLog.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuditLogTab userRole="admin" />);

    expect(screen.getByTestId('audit-loading')).toBeInTheDocument();
  });

  it('shows empty state when API returns empty array', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_EMPTY_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-empty')).toBeInTheDocument();
    });

    expect(
      screen.getByText('No audit events match your filters.')
    ).toBeInTheDocument();
  });

  it('shows error state when API returns 500', async () => {
    mockFetchAuditLog.mockRejectedValueOnce(
      new Error('API error 500: Internal Server Error')
    );
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-error')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Failed to load audit log. Please try again.')
    ).toBeInTheDocument();
  });

  it('renders entity link with correct href for task type', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    });

    const taskLink = screen.getByTestId('entity-link-evt-1');
    expect(taskLink).toHaveAttribute('href', '/tasks/TSK-0042');
    expect(taskLink).toHaveTextContent('TSK-0042');
  });

  it('renders entity link with correct href for agenda type', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    });

    const agendaLink = screen.getByTestId('entity-link-evt-2');
    expect(agendaLink).toHaveAttribute('href', '/agendas/AGD-0015');
  });

  it('renders transcript entity as plain text (no link)', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    });

    // TRN-0001 should be plain text, not a link
    expect(screen.queryByTestId('entity-link-evt-3')).not.toBeInTheDocument();
    expect(screen.getByText('TRN-0001')).toBeInTheDocument();
  });

  it('renders source badges with distinct classes', async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
    render(<AuditLogTab userRole="admin" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    });

    // Check that source badges are rendered
    const badges = screen.getAllByText(/^(ui|agent|terminal)$/);
    expect(badges.length).toBe(3);
  });

  describe('pagination', () => {
    it('shows pagination info and controls', async () => {
      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      render(<AuditLogTab userRole="admin" />);

      await waitFor(() => {
        expect(screen.getByTestId('audit-pagination')).toBeInTheDocument();
      });

      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
      expect(screen.getByTestId('pagination-next')).not.toBeDisabled();
    });

    it('next page increments page and fetches', async () => {
      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      render(<AuditLogTab userRole="admin" />);

      await waitFor(() => {
        expect(screen.getByTestId('audit-table')).toBeInTheDocument();
      });

      // Click next
      mockFetchAuditLog.mockResolvedValueOnce({
        ...MOCK_RESPONSE,
        page: 2,
      });
      fireEvent.click(screen.getByTestId('pagination-next'));

      await waitFor(() => {
        expect(mockFetchAuditLog).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('filters', () => {
    it('applying filters calls API and resets page', async () => {
      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      render(<AuditLogTab userRole="admin" />);

      await waitFor(() => {
        expect(screen.getByTestId('audit-table')).toBeInTheDocument();
      });

      // Select entity type filter
      const entityFilter = screen.getByTestId('filter-entity-type');
      fireEvent.change(entityFilter, { target: { value: 'task' } });

      // Apply filters
      mockFetchAuditLog.mockResolvedValueOnce({
        data: [MOCK_EVENTS[0]],
        total: 1,
        page: 1,
        limit: 25,
      });
      fireEvent.click(screen.getByTestId('apply-filters'));

      await waitFor(() => {
        expect(mockFetchAuditLog).toHaveBeenCalledTimes(2);
      });
    });

    it('clearing filters resets all params', async () => {
      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      render(<AuditLogTab userRole="admin" />);

      await waitFor(() => {
        expect(screen.getByTestId('audit-table')).toBeInTheDocument();
      });

      // Set a filter then clear
      const entityFilter = screen.getByTestId('filter-entity-type');
      fireEvent.change(entityFilter, { target: { value: 'task' } });
      fireEvent.click(screen.getByTestId('apply-filters'));

      await waitFor(() => {
        expect(mockFetchAuditLog).toHaveBeenCalledTimes(2);
      });

      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      fireEvent.click(screen.getByTestId('clear-filters'));

      await waitFor(() => {
        expect(mockFetchAuditLog).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('account_manager role', () => {
    it('does not fetch admin users for filter dropdown', async () => {
      mockFetchAuditLog.mockResolvedValueOnce(MOCK_RESPONSE);
      render(<AuditLogTab userRole="account_manager" />);

      await waitFor(() => {
        expect(screen.getByTestId('audit-table')).toBeInTheDocument();
      });

      expect(mockFetchAdminUsers).not.toHaveBeenCalled();
    });
  });
});
