/**
 * HTML Formatter for Agenda Emails
 *
 * Converts agenda content (markdown) into a styled HTML email body.
 * Also builds the email subject line with formatted cycle dates.
 *
 * Security: All user-supplied strings are escaped via `escapeHtml()`
 * before insertion into the HTML template to prevent injection.
 */

import type { AgendaEmailInput } from './adapter';

// ---------------------------------------------------------------------------
// Section parser
// ---------------------------------------------------------------------------

interface ParsedAgendaSections {
  completedTasks: string;
  incompleteTasks: string;
  relevantDeliverables: string;
  recommendations: string;
  newIdeas: string;
  nextSteps: string;
}

const SECTION_HEADERS: Array<{
  key: keyof ParsedAgendaSections;
  pattern: RegExp;
}> = [
  { key: 'completedTasks', pattern: /^#+\s*completed\s+tasks?\s*$/i },
  { key: 'incompleteTasks', pattern: /^#+\s*incomplete\s+tasks?\s*$/i },
  { key: 'relevantDeliverables', pattern: /^#+\s*relevant\s+deliverables?\s*$/i },
  { key: 'recommendations', pattern: /^#+\s*recommendations?\s*$/i },
  { key: 'newIdeas', pattern: /^#+\s*new\s+ideas?\s*$/i },
  { key: 'nextSteps', pattern: /^#+\s*next\s+steps?\s*$/i },
];

function parseAgendaSections(content: string): ParsedAgendaSections {
  const result: ParsedAgendaSections = {
    completedTasks: '',
    incompleteTasks: '',
    relevantDeliverables: '',
    recommendations: '',
    newIdeas: '',
    nextSteps: '',
  };

  if (!content || typeof content !== 'string') {
    return result;
  }

  const lines = content.split('\n');
  let currentKey: keyof ParsedAgendaSections | null = null;
  const sectionLines: Record<keyof ParsedAgendaSections, string[]> = {
    completedTasks: [],
    incompleteTasks: [],
    relevantDeliverables: [],
    recommendations: [],
    newIdeas: [],
    nextSteps: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line is a section header
    let matchedKey: keyof ParsedAgendaSections | null = null;
    for (const { key, pattern } of SECTION_HEADERS) {
      if (pattern.test(trimmed)) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      currentKey = matchedKey;
      continue;
    }

    // If we have a current section, accumulate lines
    if (currentKey) {
      sectionLines[currentKey].push(line);
    }
  }

  // Join accumulated lines, trimming leading/trailing whitespace
  for (const key of Object.keys(sectionLines) as Array<keyof ParsedAgendaSections>) {
    result[key] = sectionLines[key].join('\n').trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Date formatters
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string to short form, e.g., "Feb 17".
 * Appends T00:00:00Z to ensure UTC-safe parsing.
 */
export function formatDateShort(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format an ISO date string to long form, e.g., "Feb 28, 2026".
 */
export function formatDateLong(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------
// Subject line
// ---------------------------------------------------------------------------

/**
 * Builds the email subject line.
 * Format: "Running Notes — {clientName} | {start} to {end}"
 */
export function buildEmailSubject(
  clientName: string,
  cycleStart: string,
  cycleEnd: string,
): string {
  const start = formatDateShort(cycleStart);
  const end = formatDateLong(cycleEnd);
  return `Running Notes \u2014 ${clientName} | ${start} to ${end}`;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent injection.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Markdown to HTML converter
// ---------------------------------------------------------------------------

/**
 * Applies inline formatting: bold, italic, code.
 * Operates on already-escaped content when used inside list items /
 * paragraphs where the content was not user-controlled (section body).
 */
function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Converts simple markdown to HTML:
 * - `- item` / `* item` -> `<ul><li>...</li></ul>`
 * - plain lines -> `<p>...</p>`
 * - inline: `**bold**` -> `<strong>`, `*italic*` -> `<em>`, `` `code` `` -> `<code>`
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      const content = applyInlineFormatting(line.replace(/^[-*]\s+/, ''));
      htmlLines.push(`  <li>${content}</li>`);
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<p>${applyInlineFormatting(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML body builder
// ---------------------------------------------------------------------------

/**
 * Builds the full HTML email body from an AgendaEmailInput.
 */
export function buildEmailHtml(input: AgendaEmailInput): string {
  const cycleLabel = `${formatDateShort(input.cycleStart)} to ${formatDateLong(input.cycleEnd)}`;
  const contentStr = typeof input.content === 'string' ? input.content : '';
  const sections = parseAgendaSections(contentStr);

  const sectionDefs: Array<{ label: string; content: string }> = [
    { label: 'Completed Tasks', content: sections.completedTasks },
    { label: 'Incomplete Tasks', content: sections.incompleteTasks },
    { label: 'Relevant Deliverables', content: sections.relevantDeliverables },
    { label: 'Recommendations', content: sections.recommendations },
    { label: 'New Ideas', content: sections.newIdeas },
    { label: 'Next Steps', content: sections.nextSteps },
  ];

  const sectionsHtml = sectionDefs
    .map(({ label, content }) => {
      const bodyHtml = content.trim()
        ? markdownToHtml(content)
        : '<p><em>(No items this cycle)</em></p>';
      return `
      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px;">${escapeHtml(label)}</h3>
      ${bodyHtml}
    `;
    })
    .join('\n');

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Running Notes \u2014 ${escapeHtml(input.clientName)}</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #222;">
  <h1 style="color: #111;">${escapeHtml(input.clientName)}</h1>
  <h2 style="color: #555; font-weight: normal;">${escapeHtml(cycleLabel)}</h2>
  <hr style="border: none; border-top: 2px solid #333; margin: 24px 0;" />

  ${sectionsHtml}

  <hr style="border: none; border-top: 1px solid #ccc; margin: 40px 0 16px;" />
  <p style="color: #999; font-size: 12px;">Sent by iExcel Automation | ${today}</p>
</body>
</html>`;
}
