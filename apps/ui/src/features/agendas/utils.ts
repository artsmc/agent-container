import { AgendaStatus } from './types'
import type { BadgeProps } from '@/components/Badge'

/**
 * Format cycle dates as "MMM D, YYYY -> MMM D, YYYY".
 */
export function formatCycleDates(cycleStart: string, cycleEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
  const start = new Date(cycleStart).toLocaleDateString('en-US', opts)
  const end = new Date(cycleEnd).toLocaleDateString('en-US', opts)
  return `${start} \u2192 ${end}`
}

/**
 * Format a date string as a relative time (e.g., "3 hours ago").
 */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`

  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Map an AgendaStatus to a Badge variant.
 */
export function getStatusBadgeVariant(
  status: AgendaStatus
): BadgeProps['variant'] {
  switch (status) {
    case AgendaStatus.Draft:
      return 'default'
    case AgendaStatus.InReview:
      return 'info'
    case AgendaStatus.Finalized:
      return 'success'
    case AgendaStatus.Shared:
      return 'info'
    default:
      return 'default'
  }
}

/**
 * Format an AgendaStatus to a human-readable label.
 */
export function formatStatus(status: AgendaStatus): string {
  switch (status) {
    case AgendaStatus.Draft:
      return 'Draft'
    case AgendaStatus.InReview:
      return 'In Review'
    case AgendaStatus.Finalized:
      return 'Finalized'
    case AgendaStatus.Shared:
      return 'Shared'
    default:
      return String(status)
  }
}

/**
 * Check if an agenda is in a read-only state (finalized or shared).
 */
export function isAgendaReadOnly(status: AgendaStatus): boolean {
  return (
    status === AgendaStatus.Finalized || status === AgendaStatus.Shared
  )
}

/**
 * Check if the user role can finalize/share/email agendas.
 */
export function canManageAgenda(
  role: 'admin' | 'account_manager' | 'team_member'
): boolean {
  return role === 'admin' || role === 'account_manager'
}

/**
 * Generate an empty ProseMirror doc.
 */
export function emptyProseMirrorDoc(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/**
 * Render ProseMirror JSON content as plain text (for previews).
 */
export function proseMirrorToPlainText(doc: Record<string, unknown>): string {
  if (!doc || !doc.content) return ''
  const content = doc.content as Array<Record<string, unknown>>
  return content
    .map((node) => {
      if (node.type === 'paragraph' || node.type === 'heading') {
        const textContent = node.content as
          | Array<Record<string, unknown>>
          | undefined
        if (!textContent) return ''
        return textContent
          .map((child) => (child.text as string) ?? '')
          .join('')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}
