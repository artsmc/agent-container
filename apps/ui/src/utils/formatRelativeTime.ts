/**
 * Converts an ISO 8601 datetime string to a human-readable relative time.
 *
 * Examples:
 *   - "just now"       (< 60 seconds ago)
 *   - "2 minutes ago"  (< 60 minutes ago)
 *   - "3 hours ago"    (< 24 hours ago)
 *   - "yesterday"      (< 48 hours ago)
 *   - "Jan 5, 2026"    (>= 48 hours ago)
 *
 * Uses native Date arithmetic -- no external dependency.
 */
export function formatRelativeTime(isoDatetime: string): string {
  const now = Date.now()
  const then = new Date(isoDatetime).getTime()
  const diffMs = now - then
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) {
    return 'just now'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 2) {
    return 'yesterday'
  }

  // For anything older, show absolute date
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoDatetime))
}
