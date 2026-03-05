/**
 * RichTextEditor -- A rich text editing area using ProseMirror JSON format.
 *
 * The stub renders a contentEditable div placeholder. Full implementation
 * will integrate a ProseMirror-based editor.
 *
 * Full implementation: Feature 28 (agenda-builder-screen).
 */

import styles from './RichTextEditor.module.scss'

export interface RichTextEditorProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
  className,
  readOnly = false,
}: RichTextEditorProps) {
  return (
    <div
      data-testid="rich-text-editor"
      data-readonly={readOnly}
      className={`${styles.root} ${className ?? ''}`}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-placeholder={placeholder}
      aria-readonly={readOnly}
    >
      {value || (!readOnly ? placeholder : '')}
    </div>
  )
}
