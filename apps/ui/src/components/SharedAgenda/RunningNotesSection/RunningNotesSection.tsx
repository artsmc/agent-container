import { RichTextRenderer } from '@/components/SharedAgenda/RichTextRenderer';
import styles from './RunningNotesSection.module.scss';

const EMPTY_PLACEHOLDER = 'Nothing to report for this period.';

interface RunningNotesSectionProps {
  heading: string;
  content: string | null | undefined;
}

export function RunningNotesSection({
  heading,
  content,
}: RunningNotesSectionProps) {
  const isEmpty = !content || content.trim() === '';

  return (
    <section className={styles.section} data-testid="running-notes-section">
      <h2 className={styles.sectionHeading}>{heading}</h2>
      <div className={styles.sectionContent}>
        {isEmpty ? (
          <p className={styles.emptyPlaceholder} data-testid="empty-placeholder">
            {EMPTY_PLACEHOLDER}
          </p>
        ) : (
          <RichTextRenderer content={content} />
        )}
      </div>
    </section>
  );
}
