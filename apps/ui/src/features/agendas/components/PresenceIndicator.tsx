'use client'

import Avatar from '@/components/Avatar/Avatar'
import type { ActiveUser } from '../types'
import styles from './PresenceIndicator.module.scss'

interface PresenceIndicatorProps {
  users: ActiveUser[]
  currentUserId: string
}

/**
 * Displays avatar chips for other users currently editing the agenda.
 * Excludes the current user from the list.
 */
export function PresenceIndicator({
  users,
  currentUserId,
}: PresenceIndicatorProps) {
  const otherUsers = users.filter((u) => u.id !== currentUserId)

  if (otherUsers.length === 0) return null

  const names = otherUsers.map((u) => u.name).join(', ')

  return (
    <div
      className={styles.root}
      aria-label={`Also editing: ${names}`}
    >
      {otherUsers.map((user) => (
        <div key={user.id} className={styles.chip} title={user.name}>
          <Avatar name={user.name} size="sm" />
        </div>
      ))}
    </div>
  )
}
