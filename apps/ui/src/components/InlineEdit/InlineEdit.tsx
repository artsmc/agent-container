/**
 * InlineEdit -- An element that shows read-only text and switches to an input on click.
 *
 * Used for editable fields in task detail, agenda items.
 *
 * Full implementation: Feature 26 (task-review-screen).
 */

import styles from './InlineEdit.module.scss'

export interface InlineEditProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function InlineEdit({
  value,
  onChange,
  placeholder,
  className,
}: InlineEditProps) {
  return (
    <div
      data-testid="inline-edit"
      className={`${styles.root} ${className ?? ''}`}
    >
      <span className={styles.display}>
        {value || placeholder || 'Click to edit'}
      </span>
    </div>
  )
}
