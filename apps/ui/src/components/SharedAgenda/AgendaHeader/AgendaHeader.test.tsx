import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgendaHeader } from './AgendaHeader';

const SAMPLE_AGENDA = {
  short_id: 'AGD-0015',
  client_name: 'Acme Corp',
  cycle_start: '2026-02-01',
  cycle_end: '2026-02-28',
  finalized_at: '2026-02-28T14:30:00Z',
};

describe('AgendaHeader', () => {
  it('renders the short ID', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    expect(screen.getByTestId('agenda-short-id')).toHaveTextContent('AGD-0015');
  });

  it('renders the client name', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    expect(screen.getByTestId('agenda-client-name')).toHaveTextContent(
      'Acme Corp'
    );
  });

  it('renders the client name as an h1 element', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    const heading = screen.getByTestId('agenda-client-name');
    expect(heading.tagName).toBe('H1');
  });

  it('renders a formatted date range (not raw ISO strings)', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    const period = screen.getByTestId('agenda-cycle-period');
    expect(period.textContent).toContain('February');
    expect(period.textContent).toContain('2026');
    // Must not show raw ISO format
    expect(period.textContent).not.toContain('2026-02');
  });

  it('renders the finalized date with "Finalized on" prefix', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    const finalized = screen.getByTestId('agenda-finalized-at');
    expect(finalized.textContent).toContain('Finalized on');
    expect(finalized.textContent).toContain('February 28, 2026');
  });

  it('renders the header element with data-testid', () => {
    render(<AgendaHeader agenda={SAMPLE_AGENDA} />);
    expect(screen.getByTestId('agenda-header')).toBeInTheDocument();
  });
});
