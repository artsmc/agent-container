'use client'

import { useState, useCallback } from 'react'
import Avatar from '@/components/Avatar/Avatar'
import Button from '@/components/Button/Button'
import type { AgendaComment } from '../types'
import { formatRelativeTime } from '../utils'
import styles from './CommentThread.module.scss'

interface CommentThreadProps {
  comment: AgendaComment
  onAddReply: (commentId: string, text: string) => void
}

/**
 * A single comment thread with author info, text, timestamp,
 * and expandable reply input.
 */
export function CommentThread({ comment, onAddReply }: CommentThreadProps) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')

  const handleSubmitReply = useCallback(() => {
    if (!replyText.trim()) return
    onAddReply(comment.id, replyText.trim())
    setReplyText('')
    setShowReplyInput(false)
  }, [comment.id, replyText, onAddReply])

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmitReply()
      }
      if (e.key === 'Escape') {
        setShowReplyInput(false)
        setReplyText('')
      }
    },
    [handleSubmitReply]
  )

  return (
    <div className={styles.root}>
      <div className={styles.commentBody}>
        <div className={styles.authorRow}>
          <Avatar
            name={comment.author.name}
            size="sm"
          />
          <span className={styles.authorName}>{comment.author.name}</span>
          <span className={styles.timestamp}>
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className={styles.text}>{comment.text}</p>
        <button
          type="button"
          className={styles.replyToggle}
          onClick={() => setShowReplyInput(!showReplyInput)}
        >
          Reply
        </button>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className={styles.replies}>
          {comment.replies.map((reply) => (
            <div key={reply.id} className={styles.reply}>
              <div className={styles.authorRow}>
                <Avatar
                  name={reply.author.name}
                  size="sm"
                />
                <span className={styles.authorName}>{reply.author.name}</span>
                <span className={styles.timestamp}>
                  {formatRelativeTime(reply.created_at)}
                </span>
              </div>
              <p className={styles.text}>{reply.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <div className={styles.replyInput}>
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleReplyKeyDown}
            placeholder="Write a reply..."
            className={styles.input}
            autoFocus
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleSubmitReply}
            disabled={!replyText.trim()}
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  )
}
