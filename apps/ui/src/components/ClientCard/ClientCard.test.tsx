import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClientCard from './ClientCard';
import type { DashboardClient, DashboardClientStatus } from '@/types/dashboard';

// Mock next/link to render a plain anchor for testing
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const mockClient: DashboardClient = {
  id: 'acme-corp',
  name: 'Acme Corp',
};

const mockStatus: DashboardClientStatus = {
  clientId: 'acme-corp',
  pendingDraftCount: 3,
  agendaStatus: 'in_review',
  nextCallDate: '2026-03-10',
};

describe('ClientCard', () => {
  describe('with full data', () => {
    it('renders the client name', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('renders the pending draft count badge', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders the agenda status badge', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      expect(screen.getByText('in review')).toBeInTheDocument();
    });

    it('renders the formatted next call date', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      expect(screen.getByText('Mar 10')).toBeInTheDocument();
    });

    it('renders View Tasks link with correct href', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      const link = screen.getByText('View Tasks');
      expect(link).toHaveAttribute('href', '/clients/acme-corp/tasks');
    });

    it('renders View Agenda link with correct href', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      const link = screen.getByText('View Agenda');
      expect(link).toHaveAttribute('href', '/clients/acme-corp/agendas');
    });

    it('renders the agenda status badge with aria-label', () => {
      render(<ClientCard client={mockClient} status={mockStatus} />);
      expect(
        screen.getByLabelText('Agenda status: in review')
      ).toBeInTheDocument();
    });
  });

  describe('with status=null (error state)', () => {
    it('renders the client name', () => {
      render(<ClientCard client={mockClient} status={null} />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('renders dashes for next call date', () => {
      render(<ClientCard client={mockClient} status={null} />);
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });

    it('shows "Status unavailable" error indicator', () => {
      render(<ClientCard client={mockClient} status={null} />);
      expect(screen.getByText('Status unavailable')).toBeInTheDocument();
    });

    it('does not render any badges', () => {
      render(<ClientCard client={mockClient} status={null} />);
      expect(screen.queryAllByTestId('badge')).toHaveLength(0);
    });
  });

  describe('with pending_draft_count=0', () => {
    it('does not render the pending count badge', () => {
      const zeroStatus: DashboardClientStatus = {
        ...mockStatus,
        pendingDraftCount: 0,
      };
      render(<ClientCard client={mockClient} status={zeroStatus} />);
      // Only the agenda status badge should render
      const badges = screen.getAllByTestId('badge');
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent('in review');
    });
  });

  describe('with no call scheduled', () => {
    it('renders "No call scheduled"', () => {
      const noCallStatus: DashboardClientStatus = {
        ...mockStatus,
        nextCallDate: null,
      };
      render(<ClientCard client={mockClient} status={noCallStatus} />);
      expect(screen.getByText('No call scheduled')).toBeInTheDocument();
    });
  });
});
