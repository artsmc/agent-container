/**
 * ProseMirror JSON Content Parser
 *
 * Parses the ProseMirror JSON document stored in `agendas.content`
 * into 6 structured sections matching the Running Notes format.
 *
 * Also provides the cycle header date formatter.
 */

// ---------------------------------------------------------------------------
// ProseMirror types
// ---------------------------------------------------------------------------

export interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

// ---------------------------------------------------------------------------
// Parsed output
// ---------------------------------------------------------------------------

export interface ParsedAgendaContent {
  completedTasks: ProseMirrorNode[];
  incompleteTasks: ProseMirrorNode[];
  relevantDeliverables: ProseMirrorNode[];
  recommendations: ProseMirrorNode[];
  newIdeas: ProseMirrorNode[];
  nextSteps: ProseMirrorNode[];
}

// ---------------------------------------------------------------------------
// Section name lookup
// ---------------------------------------------------------------------------

const SECTION_NAMES: Record<keyof ParsedAgendaContent, string[]> = {
  completedTasks: ['completed tasks', 'completed task'],
  incompleteTasks: ['incomplete tasks', 'incomplete task', 'outstanding tasks'],
  relevantDeliverables: ['relevant deliverables', 'deliverables'],
  recommendations: ['recommendations', 'recommendation'],
  newIdeas: ['new ideas', 'new idea'],
  nextSteps: ['next steps', 'next step'],
};

// ---------------------------------------------------------------------------
// Text extraction helper
// ---------------------------------------------------------------------------

/**
 * Recursively extract plain text content from a ProseMirror node tree.
 */
export function extractText(node: ProseMirrorNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a ProseMirror JSON document into 6 agenda sections.
 *
 * Walks the top-level nodes, identifies heading nodes whose text matches
 * one of the 6 recognized section names (case-insensitive), and collects
 * the nodes between each heading and the next.
 *
 * If no recognized sections are found, all fields return empty arrays.
 * The caller (adapter) handles the unstructured-content fallback.
 */
export function parseAgendaContent(doc: ProseMirrorDoc): ParsedAgendaContent {
  const nodes = doc.content ?? [];

  const sectionStarts: Array<{
    key: keyof ParsedAgendaContent;
    nodeIndex: number;
  }> = [];

  nodes.forEach((node, idx) => {
    if (node.type === 'heading') {
      const headingText = extractText(node).trim().toLowerCase();
      for (const [key, names] of Object.entries(SECTION_NAMES)) {
        if (names.some((name) => headingText === name)) {
          sectionStarts.push({
            key: key as keyof ParsedAgendaContent,
            nodeIndex: idx,
          });
          break;
        }
      }
    }
  });

  const result: ParsedAgendaContent = {
    completedTasks: [],
    incompleteTasks: [],
    relevantDeliverables: [],
    recommendations: [],
    newIdeas: [],
    nextSteps: [],
  };

  if (sectionStarts.length === 0) return result;

  sectionStarts.sort((a, b) => a.nodeIndex - b.nodeIndex);

  for (let i = 0; i < sectionStarts.length; i++) {
    const { key, nodeIndex } = sectionStarts[i];
    const nextSectionIndex =
      sectionStarts[i + 1]?.nodeIndex ?? nodes.length;
    result[key] = nodes.slice(nodeIndex + 1, nextSectionIndex);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cycle date formatter
// ---------------------------------------------------------------------------

/**
 * Format cycle start/end dates into the Running Notes heading string.
 *
 * @example formatCycleHeader('2026-02-17', '2026-02-28')
 * // => "Running Notes — Feb 17 to Feb 28, 2026"
 */
export function formatCycleHeader(
  cycleStart: string,
  cycleEnd: string,
): string {
  const start = new Date(cycleStart + 'T00:00:00Z');
  const end = new Date(cycleEnd + 'T00:00:00Z');

  const startFormatted = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endFormatted = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `Running Notes \u2014 ${startFormatted} to ${endFormatted}`;
}
