/**
 * Formats a NormalizedTask description into plain-text Asana notes
 * using the 3-section template.
 *
 * If all three section headers are present, the output is structured
 * plain text with section headings (no Markdown bold markers).
 *
 * If any section header is missing, the entire description is returned
 * with all `**` markers stripped. This is a degraded but valid fallback.
 */

const SECTION_HEADERS = {
  taskContext: '**TASK CONTEXT**',
  additionalContext: '**ADDITIONAL CONTEXT**',
  requirements: '**REQUIREMENTS**',
} as const;

interface ParsedSections {
  taskContext: string;
  additionalContext: string;
  requirements: string;
}

/**
 * Attempts to extract the three expected sections from the description.
 * Returns null if any section header is missing.
 */
function parseSections(description: string): ParsedSections | null {
  const tcIdx = description.indexOf(SECTION_HEADERS.taskContext);
  const acIdx = description.indexOf(SECTION_HEADERS.additionalContext);
  const reqIdx = description.indexOf(SECTION_HEADERS.requirements);

  if (tcIdx === -1 || acIdx === -1 || reqIdx === -1) return null;

  const taskContext = description
    .slice(tcIdx + SECTION_HEADERS.taskContext.length, acIdx)
    .trim();
  const additionalContext = description
    .slice(acIdx + SECTION_HEADERS.additionalContext.length, reqIdx)
    .trim();
  const requirements = description
    .slice(reqIdx + SECTION_HEADERS.requirements.length)
    .trim();

  return { taskContext, additionalContext, requirements };
}

/**
 * Formats a task description for the Asana `notes` field.
 *
 * When all three section markers are found, produces structured
 * plain-text output with section headers. Otherwise falls back
 * to returning the full text with `**` markers stripped.
 */
export function formatDescriptionForAsana(description: string): string {
  if (!description) return '';

  const sections = parseSections(description);

  if (!sections) {
    // Fallback: strip all ** markers and return as-is
    return description.replace(/\*\*/g, '').trim();
  }

  return [
    'TASK CONTEXT',
    sections.taskContext,
    '',
    'ADDITIONAL CONTEXT',
    sections.additionalContext,
    '',
    'REQUIREMENTS',
    sections.requirements,
  ].join('\n');
}
