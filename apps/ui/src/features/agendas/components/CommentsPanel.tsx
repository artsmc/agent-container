'use client'

import { useState, useCallback } from 'react'
import Button from '@/components/Button/Button'
import type { AgendaComment } from '../types'
import { CommentThread } from './CommentThread'
import styles from './CommentsPanel.module.scss'

interface CommentsPanelProps {
  comments: AgendaComment[]
  open: boolean
  onToggle: () => void
  onAddComment: (text: string) => void
  onAddReply: (commentId: string, text: string) => void
}

/**
 * Collapsible right sidebar for internal comments.
 * Includes a toggle button with comment count badge,
 * a new comment input, and a list of CommentThread components.
 */
export function CommentsPanel({
  comments,
  open,
  onToggle,
  onAddComment,
  onAddReply,
}: CommentsPanelProps) {
  const [newCommentText, setNewCommentText] = useState('')

  const handleSubmitComment = useCallback(() => {
    if (!newCommentText.trim()) return
    onAddComment(newCommentText.trim())
    setNewCommentText('')
  }, [newCommentText, onAddComment])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmitComment()
      }
    },
    [handleSubmitComment]
  )

  return (
    <aside
      className={`${styles.root} ${open ? styles.open : ''}`}
      aria-label="Internal comments"
    >
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="comments-panel-content"
      >
        Comments
        {comments.length > 0 && (
          <span className={styles.badge}>{comments.length}</span>
        )}
      </button>

      {open && (
        <div id="comments-panel-content" className={styles.content}>
          <div className={styles.newComment}>
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className={styles.input}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={handleSubmitComment}
              disabled={!newCommentText.trim()}
            >
              Add
            </Button>
          </div>

          <div className={styles.list}>
            {comments.length === 0 ? (
              <p className={styles.empty}>No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  onAddReply={onAddReply}
                />
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
