'use client'

import { RichTextEditor } from '@/components/RichTextEditor'
import type { AgendaContent, ProseMirrorDoc } from '../types'
import styles from './AgendaSection.module.scss'

interface AgendaSectionProps {
  label: string
  sectionKey: keyof AgendaContent
  value: ProseMirrorDoc
  onChange: (value: ProseMirrorDoc) => void
  readOnly: boolean
  onCommit?: () => void
  className?: string
}

/**
 * A single Running Notes section with a non-editable h3 header
 * and a RichTextEditor below it.
 */
export function AgendaSection({
  label,
  value,
  onChange,
  readOnly,
  onCommit,
  className,
}: AgendaSectionProps) {
  return (
    <section className={`${styles.root} ${className ?? ''}`}>
      <h3 className={styles.sectionHeader}>{label}</h3>
      <RichTextEditor
        value={value}
        onChange={(v) => onChange(v as ProseMirrorDoc)}
        readOnly={readOnly}
        onCommit={onCommit}
        placeholder={`Add ${label.toLowerCase()}...`}
      />
    </section>
  )
}
