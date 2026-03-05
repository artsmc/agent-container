import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsTabs } from './SettingsTabs';

// Mock child tab components to avoid their side effects
vi.mock('../AsanaWorkspacesTab', () => ({
  AsanaWorkspacesTab: () => (
    <div data-testid="mock-asana-tab">AsanaWorkspacesTab</div>
  ),
}));

vi.mock('../UsersRolesTab', () => ({
  UsersRolesTab: ({ currentUserId }: { currentUserId: string }) => (
    <div data-testid="mock-users-tab">UsersRolesTab: {currentUserId}</div>
  ),
}));

vi.mock('../EmailConfigTab', () => ({
  EmailConfigTab: () => (
    <div data-testid="mock-email-tab">EmailConfigTab</div>
  ),
}));

vi.mock('../AuditLogTab', () => ({
  AuditLogTab: ({
    userRole,
  }: {
    userRole: 'admin' | 'account_manager';
  }) => <div data-testid="mock-audit-tab">AuditLogTab: {userRole}</div>,
}));

describe('SettingsTabs', () => {
  describe('admin user', () => {
    it('renders all 4 tabs', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('tab-asana')).toBeInTheDocument();
      expect(screen.getByTestId('tab-users')).toBeInTheDocument();
      expect(screen.getByTestId('tab-email')).toBeInTheDocument();
      expect(screen.getByTestId('tab-audit')).toBeInTheDocument();
    });

    it('shows correct tab labels', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('tab-asana')).toHaveTextContent(
        'Asana Workspaces'
      );
      expect(screen.getByTestId('tab-users')).toHaveTextContent(
        'Users & Roles'
      );
      expect(screen.getByTestId('tab-email')).toHaveTextContent(
        'Email Config'
      );
      expect(screen.getByTestId('tab-audit')).toHaveTextContent('Audit Log');
    });

    it('defaults to the first tab (asana) being active', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('tab-asana')).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByTestId('panel-asana')).toBeInTheDocument();
    });

    it('switches tabs on click', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      fireEvent.click(screen.getByTestId('tab-users'));
      expect(screen.getByTestId('tab-users')).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByTestId('tab-asana')).toHaveAttribute(
        'aria-selected',
        'false'
      );
      expect(screen.getByTestId('panel-users')).toBeInTheDocument();
      expect(screen.queryByTestId('panel-asana')).not.toBeInTheDocument();
    });

    it('only renders the active tab panel (conditional rendering)', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('mock-asana-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-users-tab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-email-tab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-audit-tab')).not.toBeInTheDocument();
    });
  });

  describe('account_manager user', () => {
    it('renders only 1 tab (Audit Log)', () => {
      render(
        <SettingsTabs userRole="account_manager" userId="user-456" />
      );
      expect(screen.getByTestId('tab-audit')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-asana')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-users')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-email')).not.toBeInTheDocument();
    });

    it('shows the Audit Log panel by default', () => {
      render(
        <SettingsTabs userRole="account_manager" userId="user-456" />
      );
      expect(screen.getByTestId('panel-audit')).toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    it('has role="tablist" on the nav element', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      const nav = screen
        .getByTestId('settings-tabs')
        .querySelector('[role="tablist"]');
      expect(nav).toBeInTheDocument();
    });

    it('each tab button has role="tab"', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);
    });

    it('active tab has aria-selected="true"', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      const asanaTab = screen.getByTestId('tab-asana');
      expect(asanaTab).toHaveAttribute('aria-selected', 'true');
    });

    it('inactive tabs have aria-selected="false"', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('tab-users')).toHaveAttribute(
        'aria-selected',
        'false'
      );
      expect(screen.getByTestId('tab-email')).toHaveAttribute(
        'aria-selected',
        'false'
      );
      expect(screen.getByTestId('tab-audit')).toHaveAttribute(
        'aria-selected',
        'false'
      );
    });

    it('tab buttons have aria-controls pointing to panel IDs', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      expect(screen.getByTestId('tab-asana')).toHaveAttribute(
        'aria-controls',
        'panel-asana'
      );
    });

    it('tab panels have role="tabpanel" and correct aria-labelledby', () => {
      render(<SettingsTabs userRole="admin" userId="user-123" />);
      const panel = screen.getByTestId('panel-asana');
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', 'tab-asana');
    });
  });
});
