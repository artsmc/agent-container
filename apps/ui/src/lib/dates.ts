/**
 * Date formatting utilities for the shared agenda view.
 * All formatting uses the Intl.DateTimeFormat API for locale-aware output.
 */

const DATE_LOCALE = 'en-US';

/**
 * Format a single date string into a human-readable format.
 * Example: "2026-02-28T14:30:00Z" -> "February 28, 2026"
 *
 * @param isoString - ISO 8601 date or datetime string
 * @returns Formatted date string (e.g., "February 28, 2026")
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(DATE_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format a date range into a human-readable string.
 * If both dates are in the same year, the year is only shown once at the end.
 *
 * Examples:
 *   ("2026-02-01", "2026-02-28") -> "February 1 - February 28, 2026"
 *   ("2025-12-15", "2026-01-15") -> "December 15, 2025 - January 15, 2026"
 *
 * @param startIso - ISO 8601 date string for cycle start
 * @param endIso - ISO 8601 date string for cycle end
 * @returns Formatted date range string
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (startYear === endYear) {
    const startStr = start.toLocaleDateString(DATE_LOCALE, {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const endStr = end.toLocaleDateString(DATE_LOCALE, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return `${startStr} \u2013 ${endStr}`;
  }

  const startStr = formatDate(startIso);
  const endStr = formatDate(endIso);
  return `${startStr} \u2013 ${endStr}`;
}
