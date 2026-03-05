import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AsanaWorkspacesTab } from './AsanaWorkspacesTab';
import type { SettingsAsanaWorkspace } from '../../types';

// Mock the <dialog> element methods since jsdom does not support them
beforeEach(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
});

const MOCK_WORKSPACES: SettingsAsanaWorkspace[] = [
  {
    id: 'ws-1',
    name: 'Acme Workspace',
    createdAt: '2026-01-15T00:00:00Z',
    tokenSuffix: 'abcd',
    tokenConfigured: true,
  },
  {
    id: 'ws-2',
    name: 'Test Workspace',
    createdAt: '2026-02-20T00:00:00Z',
    tokenSuffix: 'efgh',
    tokenConfigured: true,
  },
];

// Mock API functions
const mockFetchAsanaWorkspaces = vi.fn<() => Promise<SettingsAsanaWorkspace[]>>();
const mockAddAsanaWorkspace = vi.fn<() => Promise<SettingsAsanaWorkspace>>();
const mockDeleteAsanaWorkspace = vi.fn<() => Promise<void>>();
const mockTestAsanaConnection = vi.fn<() => Promise<{ ok: boolean }>>();

vi.mock('../../hooks/use-settings-api', () => ({
  fetchAsanaWorkspaces: (...args: unknown[]) =>
    mockFetchAsanaWorkspaces(...(args as [])),
  addAsanaWorkspace: (...args: unknown[]) =>
    mockAddAsanaWorkspace(...(args as [])),
  deleteAsanaWorkspace: (...args: unknown[]) =>
    mockDeleteAsanaWorkspace(...(args as [])),
  testAsanaConnection: (...args: unknown[]) =>
    mockTestAsanaConnection(...(args as [])),
}));

describe('AsanaWorkspacesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads workspace list on mount', async () => {
    mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
    render(<AsanaWorkspacesTab />);

    expect(screen.getByTestId('workspaces-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
    });

    expect(screen.getByText('Acme Workspace')).toBeInTheDocument();
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
  });

  it('shows empty state when API returns empty array', async () => {
    mockFetchAsanaWorkspaces.mockResolvedValueOnce([]);
    render(<AsanaWorkspacesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('workspaces-empty')).toBeInTheDocument();
    });

    expect(
      screen.getByText('No workspaces configured. Add one below to get started.')
    ).toBeInTheDocument();
  });

  it('shows error state when API returns 500', async () => {
    mockFetchAsanaWorkspaces.mockRejectedValueOnce(
      new Error('API error 500: Internal Server Error')
    );
    render(<AsanaWorkspacesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('workspaces-error')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Failed to load workspaces. Please try again.')
    ).toBeInTheDocument();
  });

  describe('add workspace form', () => {
    beforeEach(() => {
      mockFetchAsanaWorkspaces.mockResolvedValueOnce([]);
    });

    it('shows validation error when name is empty', async () => {
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspaces-empty')).toBeInTheDocument();
      });

      const tokenInput = screen.getByLabelText('API Token');
      fireEvent.change(tokenInput, { target: { value: 'some-token' } });
      fireEvent.click(screen.getByTestId('add-workspace-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toHaveTextContent(
          'Workspace name is required.'
        );
      });
    });

    it('shows validation error when token is empty', async () => {
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspaces-empty')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Workspace Name');
      fireEvent.change(nameInput, { target: { value: 'My Workspace' } });
      fireEvent.click(screen.getByTestId('add-workspace-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toHaveTextContent(
          'API token is required.'
        );
      });
    });

    it('adds workspace on successful submit and clears form', async () => {
      const newWorkspace: SettingsAsanaWorkspace = {
        id: 'ws-new',
        name: 'New Workspace',
        createdAt: '2026-03-05T00:00:00Z',
        tokenSuffix: 'wxyz',
        tokenConfigured: true,
      };

      mockAddAsanaWorkspace.mockResolvedValueOnce(newWorkspace);
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspaces-empty')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Workspace Name');
      const tokenInput = screen.getByLabelText('API Token');

      fireEvent.change(nameInput, { target: { value: 'New Workspace' } });
      fireEvent.change(tokenInput, { target: { value: 'my-secret-token' } });
      fireEvent.click(screen.getByTestId('add-workspace-submit'));

      await waitFor(() => {
        expect(screen.getByText('New Workspace')).toBeInTheDocument();
      });

      // POST was called
      expect(mockAddAsanaWorkspace).toHaveBeenCalledOnce();

      // Form was cleared
      expect(nameInput).toHaveValue('');
      expect(tokenInput).toHaveValue('');
    });
  });

  describe('test connection', () => {
    it('shows success state after successful test', async () => {
      mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
      mockTestAsanaConnection.mockResolvedValueOnce({ ok: true });
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
      });

      const testButton = screen.getByTestId('test-connection-ws-1');
      fireEvent.click(testButton);

      // Should transition to success state
      await waitFor(() => {
        expect(testButton).toHaveTextContent('Connection OK');
      });
    });

    it('auto-resets success state after 3 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
      mockTestAsanaConnection.mockResolvedValueOnce({ ok: true });
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
      });

      const testButton = screen.getByTestId('test-connection-ws-1');

      await act(async () => {
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(testButton).toHaveTextContent('Connection OK');
      });

      // Advance time past 3s auto-reset
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });

      await waitFor(() => {
        expect(testButton).toHaveTextContent('Test Connection');
      });

      vi.useRealTimers();
    });

    it('shows failure state on test connection error', async () => {
      mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
      mockTestAsanaConnection.mockRejectedValueOnce(
        new Error('Connection refused')
      );
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('test-connection-ws-1'));

      await waitFor(() => {
        expect(screen.getByTestId('test-connection-ws-1')).toHaveTextContent(
          'Connection Failed'
        );
      });
    });
  });

  describe('remove workspace', () => {
    it('opens confirmation dialog and cancelling keeps workspace', async () => {
      mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('remove-workspace-ws-1'));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Remove Workspace')).toBeInTheDocument();

      // Cancel the dialog
      fireEvent.click(screen.getByTestId('confirmation-cancel'));

      // Workspace should still be in the list
      expect(screen.getByText('Acme Workspace')).toBeInTheDocument();
      expect(mockDeleteAsanaWorkspace).not.toHaveBeenCalled();
    });

    it('confirms deletion, DELETEs and removes from list', async () => {
      mockFetchAsanaWorkspaces.mockResolvedValueOnce(MOCK_WORKSPACES);
      mockDeleteAsanaWorkspace.mockResolvedValueOnce(undefined);
      render(<AsanaWorkspacesTab />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('remove-workspace-ws-1'));

      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirmation-confirm'));

      await waitFor(() => {
        expect(
          screen.queryByText('Acme Workspace')
        ).not.toBeInTheDocument();
      });

      expect(mockDeleteAsanaWorkspace).toHaveBeenCalledWith('ws-1');
      // Second workspace should still be there
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });
  });
});
