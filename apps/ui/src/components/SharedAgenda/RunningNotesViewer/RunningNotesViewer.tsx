import type { SharedAgendaRunningNotes } from '@iexcel/shared-types';
import { RunningNotesSection } from '@/components/SharedAgenda/RunningNotesSection';
import styles from './RunningNotesViewer.module.scss';

/**
 * Fixed order of Running Notes sections.
 * This order matches the business requirement and must not be altered dynamically.
 */
const SECTIONS: Array<{
  key: keyof SharedAgendaRunningNotes;
  label: string;
}> = [
  { key: 'completed_tasks', label: 'Completed Tasks' },
  { key: 'incomplete_tasks', label: 'Incomplete Tasks' },
  { key: 'relevant_deliverables', label: 'Relevant Deliverables' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'new_ideas', label: 'New Ideas' },
  { key: 'next_steps', label: 'Next Steps' },
];

interface RunningNotesViewerProps {
  runningNotes: SharedAgendaRunningNotes;
}

export function RunningNotesViewer({ runningNotes }: RunningNotesViewerProps) {
  return (
    <div className={styles.viewer} data-testid="running-notes-viewer">
      {SECTIONS.map(({ key, label }) => (
        <RunningNotesSection
          key={key}
          heading={label}
          content={runningNotes[key]}
        />
      ))}
    </div>
  );
}
