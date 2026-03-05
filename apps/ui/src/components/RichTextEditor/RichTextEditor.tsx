'use client'

/**
 * RichTextEditor -- A rich text editing component using TipTap/ProseMirror.
 *
 * Supports bold, italic, underline, bullet/ordered lists, headings (h4),
 * inline code, and hyperlinks. Reads and writes ProseMirror JSON natively.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { useEffect, useCallback } from 'react'
import styles from './RichTextEditor.module.scss'

export interface RichTextEditorProps {
  /** ProseMirror JSON document object */
  value?: Record<string, unknown>
  /** Called on every content change with the updated ProseMirror JSON */
  onChange?: (value: Record<string, unknown>) => void
  /** Called on blur -- use this for triggering auto-save */
  onCommit?: () => void
  placeholder?: string
  className?: string
  readOnly?: boolean
}

function EditorToolbar({
  editor,
}: {
  editor: ReturnType<typeof useEditor>
}) {
  if (!editor) return null

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Text formatting">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Underline"
        aria-pressed={editor.isActive('underline')}
      >
        U
      </button>
      <span className={styles.toolbarDivider} />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Bullet list"
        aria-pressed={editor.isActive('bulletList')}
      >
        &bull;
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Numbered list"
        aria-pressed={editor.isActive('orderedList')}
      >
        1.
      </button>
      <span className={styles.toolbarDivider} />
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 4 }).run()
        }
        className={
          editor.isActive('heading', { level: 4 })
            ? styles.toolbarBtnActive
            : styles.toolbarBtn
        }
        aria-label="Heading"
        aria-pressed={editor.isActive('heading', { level: 4 })}
      >
        H4
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={editor.isActive('code') ? styles.toolbarBtnActive : styles.toolbarBtn}
        aria-label="Inline code"
        aria-pressed={editor.isActive('code')}
      >
        {'</>'}
      </button>
    </div>
  )
}

export default function RichTextEditor({
  value,
  onChange,
  onCommit,
  placeholder = 'Start typing...',
  className,
  readOnly = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [4],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
    ],
    content: value ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getJSON() as Record<string, unknown>)
    },
    onBlur: () => {
      onCommit?.()
    },
  })

  // Sync readOnly prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [editor, readOnly])

  // Sync external value changes (for collaborative editing)
  const updateContent = useCallback(
    (newValue: Record<string, unknown>) => {
      if (!editor) return
      // Only update if content actually differs to avoid cursor jump
      const currentJSON = JSON.stringify(editor.getJSON())
      const newJSON = JSON.stringify(newValue)
      if (currentJSON !== newJSON) {
        editor.commands.setContent(newValue)
      }
    },
    [editor]
  )

  useEffect(() => {
    if (value && editor && !editor.isFocused) {
      updateContent(value)
    }
  }, [value, editor, updateContent])

  return (
    <div
      data-testid="rich-text-editor"
      data-readonly={readOnly}
      className={`${styles.root} ${className ?? ''}`}
    >
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className={styles.editorContent}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        aria-readonly={readOnly}
      />
    </div>
  )
}
