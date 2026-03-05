/**
 * Formats a cycle date range from two ISO 8601 date strings.
 *
 * Output format: "Feb 1, 2026 -> Feb 14, 2026"
 * The arrow is a Unicode right arrow (U+2192).
 */
export function formatCycleDates(cycleStart: string, cycleEnd: string): string {
  const fmt = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const startStr = fmt.format(new Date(cycleStart))
  const endStr = fmt.format(new Date(cycleEnd))

  return `${startStr} \u2192 ${endStr}`
}
