/**
 * Document Formatter
 *
 * Converts parsed agenda sections (ProseMirror node arrays) into
 * Google Docs API `batchUpdate` request objects. Tracks character
 * indices for correct insertion positioning.
 *
 * NOTE (V1 Tech Debt): Bulleted lists from ProseMirror `bulletList`/`listItem`
 * nodes are converted to plain text with the Unicode bullet character prefix
 * ("  item"). In V2, this should be replaced with the `createParagraphBullets`
 * API request to produce native Google Docs list formatting with proper
 * indentation and bullet styles.
 */

import type { docs_v1 } from 'googleapis';
import type { ParsedAgendaContent, ProseMirrorNode } from './content-parser';
import { formatCycleHeader } from './content-parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FormattedDocRequests {
  requests: docs_v1.Schema$Request[];
  /** The character index after all insertions. */
  endIndex: number;
}

// ---------------------------------------------------------------------------
// ProseMirror node to plain text
// ---------------------------------------------------------------------------

/**
 * Convert an array of ProseMirror nodes to plain text for insertion.
 *
 * Handles: paragraph, bulletList, listItem, heading, text nodes.
 * Strips bold/italic/code marks but preserves text content.
 */
export function convertProseMirrorNodesToText(
  nodes: ProseMirrorNode[],
): string {
  return nodes
    .map((node) => convertNode(node))
    .join('\n')
    .trim();
}

function convertNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return (node.content ?? []).map(convertNode).join('');
    case 'bulletList':
      return (node.content ?? [])
        .map(
          (item) =>
            '\u2022 ' + (item.content ?? []).map(convertNode).join(''),
        )
        .join('\n');
    case 'orderedList':
      return (node.content ?? [])
        .map(
          (item, i) =>
            `${i + 1}. ` + (item.content ?? []).map(convertNode).join(''),
        )
        .join('\n');
    case 'listItem':
      return (node.content ?? []).map(convertNode).join('');
    case 'text':
      return node.text ?? '';
    case 'heading':
      return (node.content ?? []).map(convertNode).join('');
    case 'hardBreak':
      return '\n';
    default:
      return (node.content ?? []).map(convertNode).join('');
  }
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

/**
 * Build the array of Google Docs API batch update requests for a single
 * cycle export (create or append).
 *
 * @param parsed      - The 6 parsed agenda sections
 * @param cycleStart  - ISO date string (e.g., "2026-02-17")
 * @param cycleEnd    - ISO date string (e.g., "2026-02-28")
 * @param startIndex  - Character index to begin insertion (1 for new docs)
 */
export function buildDocumentRequests(
  parsed: ParsedAgendaContent,
  cycleStart: string,
  cycleEnd: string,
  startIndex: number,
): FormattedDocRequests {
  const requests: docs_v1.Schema$Request[] = [];
  let currentIndex = startIndex;

  function insertText(text: string): void {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text,
      },
    });
    currentIndex += text.length;
  }

  function applyHeadingStyle(
    startIdx: number,
    endIdx: number,
    style: 'HEADING_1' | 'HEADING_2',
  ): void {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: startIdx, endIndex: endIdx },
        paragraphStyle: { namedStyleType: style },
        fields: 'namedStyleType',
      },
    });
  }

  // --- Cycle Header (Heading 1) ---
  const cycleHeaderText = formatCycleHeader(cycleStart, cycleEnd) + '\n';
  const cycleHeaderStart = currentIndex;
  insertText(cycleHeaderText);
  applyHeadingStyle(
    cycleHeaderStart,
    cycleHeaderStart + cycleHeaderText.length,
    'HEADING_1',
  );

  // --- 6 Sections (Heading 2 + body) ---
  const sections: Array<{
    label: string;
    content: ProseMirrorNode[];
  }> = [
    { label: 'Completed Tasks', content: parsed.completedTasks },
    { label: 'Incomplete Tasks', content: parsed.incompleteTasks },
    { label: 'Relevant Deliverables', content: parsed.relevantDeliverables },
    { label: 'Recommendations', content: parsed.recommendations },
    { label: 'New Ideas', content: parsed.newIdeas },
    { label: 'Next Steps', content: parsed.nextSteps },
  ];

  for (const section of sections) {
    // Section heading
    const headingText = section.label + '\n';
    const headingStart = currentIndex;
    insertText(headingText);
    applyHeadingStyle(
      headingStart,
      headingStart + headingText.length,
      'HEADING_2',
    );

    // Section body
    if (section.content.length > 0) {
      const bodyText =
        convertProseMirrorNodesToText(section.content) + '\n';
      insertText(bodyText);
    } else {
      insertText('\n'); // Empty line to preserve spacing
    }
  }

  return { requests, endIndex: currentIndex };
}

// ---------------------------------------------------------------------------
// Separator request
// ---------------------------------------------------------------------------

/**
 * Build a separator request to visually divide appended content from
 * existing document content. Uses a horizontal rule (three underscores)
 * followed by a newline.
 */
export function buildSeparatorRequest(
  insertionIndex: number,
): docs_v1.Schema$Request[] {
  const separatorText = '\n___\n\n';
  return [
    {
      insertText: {
        location: { index: insertionIndex },
        text: separatorText,
      },
    },
  ];
}

/**
 * Returns the character length of the separator text so the caller
 * can offset the start index for subsequent content insertion.
 */
export function getSeparatorLength(): number {
  return '\n___\n\n'.length;
}

// ---------------------------------------------------------------------------
// Unstructured content fallback
// ---------------------------------------------------------------------------

/**
 * Build requests for unstructured content (no recognized section headings).
 * Inserts the cycle header as HEADING_1, then all nodes as a single
 * NORMAL_TEXT block.
 */
export function buildUnstructuredDocRequests(
  allNodes: ProseMirrorNode[],
  cycleStart: string,
  cycleEnd: string,
  startIndex: number,
): FormattedDocRequests {
  const requests: docs_v1.Schema$Request[] = [];
  let currentIndex = startIndex;

  function insertText(text: string): void {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text,
      },
    });
    currentIndex += text.length;
  }

  // Cycle header
  const cycleHeaderText = formatCycleHeader(cycleStart, cycleEnd) + '\n';
  const cycleHeaderStart = currentIndex;
  insertText(cycleHeaderText);
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: cycleHeaderStart,
        endIndex: cycleHeaderStart + cycleHeaderText.length,
      },
      paragraphStyle: { namedStyleType: 'HEADING_1' },
      fields: 'namedStyleType',
    },
  });

  // All content as plain text
  const bodyText = convertProseMirrorNodesToText(allNodes);
  if (bodyText.length > 0) {
    insertText(bodyText + '\n');
  }

  return { requests, endIndex: currentIndex };
}
