'use client'

import { useState, useCallback } from 'react'
import type { AgendaComment, AgendaCommentReply } from '../types'

interface UseAgendaCommentsReturn {
  comments: AgendaComment[]
  addComment: (text: string) => void
  addReply: (commentId: string, text: string) => void
}

/**
 * Hook for managing internal comments on an agenda.
 *
 * Manages local state optimistically. In a full implementation,
 * the add/reply operations would also call the API.
 */
export function useAgendaComments(
  initialComments: AgendaComment[],
  currentUserName: string
): UseAgendaCommentsReturn {
  const [comments, setComments] = useState<AgendaComment[]>(initialComments)

  const addComment = useCallback(
    (text: string) => {
      const newComment: AgendaComment = {
        id: `comment-${Date.now()}`,
        author: {
          id: 'current-user',
          name: currentUserName,
          initials: currentUserName
            .split(' ')
            .map((p) => p[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
        },
        text,
        created_at: new Date().toISOString(),
        replies: [],
      }
      setComments((prev) => [newComment, ...prev])
    },
    [currentUserName]
  )

  const addReply = useCallback(
    (commentId: string, text: string) => {
      const newReply: AgendaCommentReply = {
        id: `reply-${Date.now()}`,
        author: {
          id: 'current-user',
          name: currentUserName,
          initials: currentUserName
            .split(' ')
            .map((p) => p[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
        },
        text,
        created_at: new Date().toISOString(),
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, replies: [...c.replies, newReply] }
            : c
        )
      )
    },
    [currentUserName]
  )

  return { comments, addComment, addReply }
}
