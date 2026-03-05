import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunningNotesSection } from './RunningNotesSection';

describe('RunningNotesSection', () => {
  it('renders the section heading', () => {
    render(<RunningNotesSection heading="Completed Tasks" content="<p>Done</p>" />);
    expect(screen.getByText('Completed Tasks')).toBeInTheDocument();
    expect(screen.getByText('Completed Tasks').tagName).toBe('H2');
  });

  it('renders rich text content when present', () => {
    render(
      <RunningNotesSection
        heading="Tasks"
        content="<p>Task list items here</p>"
      />
    );
    expect(screen.getByTestId('rich-text-content')).toBeInTheDocument();
    expect(screen.getByText('Task list items here')).toBeInTheDocument();
  });

  it('renders placeholder when content is empty string', () => {
    render(<RunningNotesSection heading="Tasks" content="" />);
    expect(screen.getByTestId('empty-placeholder')).toHaveTextContent(
      'Nothing to report for this period.'
    );
  });

  it('renders placeholder when content is null', () => {
    render(<RunningNotesSection heading="Tasks" content={null} />);
    expect(screen.getByTestId('empty-placeholder')).toHaveTextContent(
      'Nothing to report for this period.'
    );
  });

  it('renders placeholder when content is undefined', () => {
    render(<RunningNotesSection heading="Tasks" content={undefined} />);
    expect(screen.getByTestId('empty-placeholder')).toHaveTextContent(
      'Nothing to report for this period.'
    );
  });

  it('renders placeholder when content is whitespace only', () => {
    render(<RunningNotesSection heading="Tasks" content="   " />);
    expect(screen.getByTestId('empty-placeholder')).toHaveTextContent(
      'Nothing to report for this period.'
    );
  });

  it('renders the section with data-testid', () => {
    render(<RunningNotesSection heading="Tasks" content="<p>content</p>" />);
    expect(screen.getByTestId('running-notes-section')).toBeInTheDocument();
  });
});
