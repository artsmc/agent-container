import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunningNotesViewer } from './RunningNotesViewer';
import type { SharedAgendaRunningNotes } from '@iexcel/shared-types';

const FULL_RUNNING_NOTES: SharedAgendaRunningNotes = {
  completed_tasks: '<p>Completed item 1</p>',
  incomplete_tasks: '<p>Incomplete item 1</p>',
  relevant_deliverables: '<p>Deliverable 1</p>',
  recommendations: '<p>Recommendation 1</p>',
  new_ideas: '<p>Idea 1</p>',
  next_steps: '<p>Step 1</p>',
};

const EXPECTED_SECTION_ORDER = [
  'Completed Tasks',
  'Incomplete Tasks',
  'Relevant Deliverables',
  'Recommendations',
  'New Ideas',
  'Next Steps',
];

describe('RunningNotesViewer', () => {
  it('renders all six sections', () => {
    render(<RunningNotesViewer runningNotes={FULL_RUNNING_NOTES} />);
    const sections = screen.getAllByTestId('running-notes-section');
    expect(sections).toHaveLength(6);
  });

  it('renders sections in the correct order', () => {
    render(<RunningNotesViewer runningNotes={FULL_RUNNING_NOTES} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    const headingTexts = headings.map((h) => h.textContent);
    expect(headingTexts).toEqual(EXPECTED_SECTION_ORDER);
  });

  it('renders the viewer container with data-testid', () => {
    render(<RunningNotesViewer runningNotes={FULL_RUNNING_NOTES} />);
    expect(screen.getByTestId('running-notes-viewer')).toBeInTheDocument();
  });

  it('renders content from each section', () => {
    render(<RunningNotesViewer runningNotes={FULL_RUNNING_NOTES} />);
    expect(screen.getByText('Completed item 1')).toBeInTheDocument();
    expect(screen.getByText('Incomplete item 1')).toBeInTheDocument();
    expect(screen.getByText('Deliverable 1')).toBeInTheDocument();
    expect(screen.getByText('Recommendation 1')).toBeInTheDocument();
    expect(screen.getByText('Idea 1')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
  });

  it('shows placeholders for empty sections', () => {
    const emptyNotes: SharedAgendaRunningNotes = {
      completed_tasks: '<p>Has content</p>',
      incomplete_tasks: '',
      relevant_deliverables: '',
      recommendations: '',
      new_ideas: '',
      next_steps: '',
    };
    render(<RunningNotesViewer runningNotes={emptyNotes} />);
    const placeholders = screen.getAllByTestId('empty-placeholder');
    expect(placeholders).toHaveLength(5);
  });
});
