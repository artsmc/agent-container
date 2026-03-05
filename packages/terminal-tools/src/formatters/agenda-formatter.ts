/**
 * Formats Agenda objects as structured text for conversational
 * terminal display.
 */

import type { Agenda } from '@iexcel/shared-types';

const SECTION_MAX_LENGTH = 500;

/**
 * Truncates a section to maxLength characters, appending a UI
 * fallback note if truncated.
 */
function truncateSection(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return (
    text.slice(0, maxLength - 3) +
    '...\n[... See full agenda with `get_agenda` or in the Web UI]'
  );
}

/**
 * Splits Markdown content into labelled sections by looking for
 * Markdown headings (## Heading). Returns an array of { heading, body } pairs.
 * Content before the first heading is returned under the heading "Overview".
 */
function parseSections(
  content: string
): Array<{ heading: string; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = 'Overview';
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      // Flush previous section
      const body = currentBody.join('\n').trim();
      if (body.length > 0 || sections.length > 0) {
        sections.push({ heading: currentHeading, body });
      }
      currentHeading = headingMatch[1]!;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Flush final section
  const body = currentBody.join('\n').trim();
  if (body.length > 0 || sections.length > 0) {
    sections.push({ heading: currentHeading, body });
  }

  return sections;
}

/**
 * Formats an Agenda object as structured text with section headings.
 *
 * Each section is truncated at 500 characters with a UI fallback note.
 * Returns an empty-state message when content is empty.
 */
export function formatAgenda(agenda: Agenda): string {
  const header = [
    `Agenda for ${agenda.shortId} (${agenda.status})`,
    `Cycle: ${agenda.cycleStart} to ${agenda.cycleEnd}`,
    '',
  ].join('\n');

  if (!agenda.content || agenda.content.trim().length === 0) {
    return header + 'No content yet.';
  }

  const sections = parseSections(agenda.content);

  if (sections.length === 0) {
    // Raw content with no headings — treat as single section
    return header + truncateSection(agenda.content.trim(), SECTION_MAX_LENGTH);
  }

  const formatted = sections.map(({ heading, body }) => {
    const sectionTitle = heading.toUpperCase();
    const sectionBody = truncateSection(body, SECTION_MAX_LENGTH);
    return `${sectionTitle}\n${sectionBody}`;
  });

  return header + formatted.join('\n\n');
}
