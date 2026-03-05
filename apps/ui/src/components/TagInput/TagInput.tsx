'use client'

/**
 * TagInput -- An input that manages an array of string values as tag chips.
 *
 * Tags are added on Enter key press and removed on x-button click.
 * An optional `validate` function can prevent invalid entries.
 * Fully keyboard accessible.
 */

import { useState, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import styles from './TagInput.module.scss'

export interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  validate?: (value: string) => string | null
  placeholder?: string
  className?: string
}

export default function TagInput({
  values,
  onChange,
  validate,
  placeholder = 'Type and press Enter',
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag() {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    // Prevent duplicates
    if (values.includes(trimmed)) {
      setError('Already added')
      return
    }

    // Run validation if provided
    if (validate) {
      const validationError = validate(trimmed)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setError(null)
    onChange([...values, trimmed])
    setInputValue('')
  }

  function removeTag(index: number) {
    onChange(values.filter((_, i) => i !== index))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && inputValue === '' && values.length > 0) {
      removeTag(values.length - 1)
    }
  }

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      <div
        className={styles.inputArea}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value, index) => (
          <span key={value} className={styles.tag}>
            <span className={styles.tagText}>{value}</span>
            <button
              type="button"
              className={styles.tagRemove}
              onClick={(e) => {
                e.stopPropagation()
                removeTag(index)
              }}
              aria-label={`Remove ${value}`}
            >
              &times;
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className={styles.input}
          aria-label={placeholder}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'tag-input-error' : undefined}
        />
      </div>

      {error && (
        <p id="tag-input-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
