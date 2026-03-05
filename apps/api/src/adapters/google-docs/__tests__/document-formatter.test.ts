import { describe, it, expect } from 'vitest';
import {
  buildDocumentRequests,
  buildSeparatorRequest,
  buildUnstructuredDocRequests,
  convertProseMirrorNodesToText,
  getSeparatorLength,
} from '../document-formatter';
import type { ParsedAgendaContent, ProseMirrorNode } from '../content-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paragraph(text: string): ProseMirrorNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function bulletList(items: string[]): ProseMirrorNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function textWithMark(text: string, markType: string): ProseMirrorNode {
  return {
    type: 'text',
    text,
    marks: [{ type: markType }],
  };
}

function emptyParsed(): ParsedAgendaContent {
  return {
    completedTasks: [],
    incompleteTasks: [],
    relevantDeliverables: [],
    recommendations: [],
    newIdeas: [],
    nextSteps: [],
  };
}

// ---------------------------------------------------------------------------
// convertProseMirrorNodesToText
// ---------------------------------------------------------------------------

describe('convertProseMirrorNodesToText', () => {
  it('converts paragraphs to text', () => {
    const nodes = [paragraph('Line 1'), paragraph('Line 2')];
    expect(convertProseMirrorNodesToText(nodes)).toBe('Line 1\nLine 2');
  });

  it('converts bullet lists to bullet-prefixed text', () => {
    const nodes = [bulletList(['Item A', 'Item B', 'Item C'])];
    const result = convertProseMirrorNodesToText(nodes);
    expect(result).toBe('\u2022 Item A\n\u2022 Item B\n\u2022 Item C');
  });

  it('preserves text from bold-marked nodes (strips mark)', () => {
    const nodes: ProseMirrorNode[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Normal ' },
          textWithMark('Bold Text', 'bold'),
        ],
      },
    ];
    expect(convertProseMirrorNodesToText(nodes)).toBe('Normal Bold Text');
  });

  it('preserves text from italic-marked nodes (strips mark)', () => {
    const nodes: ProseMirrorNode[] = [
      {
        type: 'paragraph',
        content: [textWithMark('Italic Text', 'italic')],
      },
    ];
    expect(convertProseMirrorNodesToText(nodes)).toBe('Italic Text');
  });

  it('handles empty node array', () => {
    expect(convertProseMirrorNodesToText([])).toBe('');
  });

  it('handles nested heading nodes', () => {
    const nodes: ProseMirrorNode[] = [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Sub heading' }],
      },
    ];
    expect(convertProseMirrorNodesToText(nodes)).toBe('Sub heading');
  });

  it('handles hardBreak nodes', () => {
    const nodes: ProseMirrorNode[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Line A' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Line B' },
        ],
      },
    ];
    expect(convertProseMirrorNodesToText(nodes)).toBe('Line A\nLine B');
  });
});

// ---------------------------------------------------------------------------
// buildDocumentRequests
// ---------------------------------------------------------------------------

describe('buildDocumentRequests', () => {
  it('produces HEADING_1 cycle header + 6 HEADING_2 sections', () => {
    const parsed: ParsedAgendaContent = {
      completedTasks: [paragraph('Done')],
      incompleteTasks: [paragraph('Pending')],
      relevantDeliverables: [paragraph('Deliverable')],
      recommendations: [paragraph('Recommend')],
      newIdeas: [paragraph('Idea')],
      nextSteps: [paragraph('Step')],
    };

    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    // Count heading style applications
    const headingStyles = requests.filter(
      (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType,
    );

    const h1Count = headingStyles.filter(
      (r) =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1',
    ).length;
    const h2Count = headingStyles.filter(
      (r) =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2',
    ).length;

    expect(h1Count).toBe(1); // Cycle header
    expect(h2Count).toBe(6); // 6 section headers
  });

  it('inserts correct cycle header text', () => {
    const parsed = emptyParsed();
    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const firstInsert = requests.find((r) => r.insertText);
    expect(firstInsert?.insertText?.text).toContain(
      'Running Notes \u2014 Feb 17 to Feb 28, 2026',
    );
  });

  it('inserts all 6 section heading labels', () => {
    const parsed = emptyParsed();
    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text!);

    const allText = insertTexts.join('');
    expect(allText).toContain('Completed Tasks');
    expect(allText).toContain('Incomplete Tasks');
    expect(allText).toContain('Relevant Deliverables');
    expect(allText).toContain('Recommendations');
    expect(allText).toContain('New Ideas');
    expect(allText).toContain('Next Steps');
  });

  it('produces empty line for sections with no content', () => {
    const parsed = emptyParsed();
    parsed.completedTasks = []; // empty

    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    // After the "Completed Tasks\n" heading insert, the next insert should be "\n"
    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text!);

    // Find index of "Completed Tasks\n"
    const headingIdx = insertTexts.findIndex((t) =>
      t.startsWith('Completed Tasks'),
    );
    expect(headingIdx).toBeGreaterThan(-1);
    // Next insert should be an empty line
    expect(insertTexts[headingIdx + 1]).toBe('\n');
  });

  it('inserts body text for populated sections', () => {
    const parsed = emptyParsed();
    parsed.completedTasks = [paragraph('Task A completed')];

    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text!);

    const bodyInsert = insertTexts.find((t) =>
      t.includes('Task A completed'),
    );
    expect(bodyInsert).toBeDefined();
  });

  it('tracks character indices correctly across insertions', () => {
    const parsed = emptyParsed();
    parsed.completedTasks = [paragraph('abc')]; // 3 chars

    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    // Verify all insertText locations are non-decreasing
    const insertLocations = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.location!.index!);

    for (let i = 1; i < insertLocations.length; i++) {
      expect(insertLocations[i]).toBeGreaterThanOrEqual(
        insertLocations[i - 1],
      );
    }
  });

  it('uses startIndex correctly for append mode', () => {
    const parsed = emptyParsed();
    const startIndex = 500;

    const { requests } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      startIndex,
    );

    const firstInsert = requests.find((r) => r.insertText);
    expect(firstInsert?.insertText?.location?.index).toBe(startIndex);
  });

  it('returns endIndex greater than startIndex', () => {
    const parsed = emptyParsed();
    const { endIndex } = buildDocumentRequests(
      parsed,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    expect(endIndex).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// buildSeparatorRequest
// ---------------------------------------------------------------------------

describe('buildSeparatorRequest', () => {
  it('returns insertText requests at the given index', () => {
    const requests = buildSeparatorRequest(100);
    expect(requests).toHaveLength(1);
    expect(requests[0].insertText?.location?.index).toBe(100);
    expect(requests[0].insertText?.text).toBeDefined();
  });

  it('separator text contains visual separator characters', () => {
    const requests = buildSeparatorRequest(1);
    expect(requests[0].insertText?.text).toContain('___');
  });
});

// ---------------------------------------------------------------------------
// getSeparatorLength
// ---------------------------------------------------------------------------

describe('getSeparatorLength', () => {
  it('returns the character length of the separator text', () => {
    const len = getSeparatorLength();
    expect(len).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildUnstructuredDocRequests
// ---------------------------------------------------------------------------

describe('buildUnstructuredDocRequests', () => {
  it('produces a HEADING_1 cycle header', () => {
    const nodes = [paragraph('Some content')];
    const { requests } = buildUnstructuredDocRequests(
      nodes,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const headingStyles = requests.filter(
      (r) =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1',
    );
    expect(headingStyles).toHaveLength(1);
  });

  it('includes all content as plain text', () => {
    const nodes = [paragraph('Paragraph one'), paragraph('Paragraph two')];
    const { requests } = buildUnstructuredDocRequests(
      nodes,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text!)
      .join('');

    expect(insertTexts).toContain('Paragraph one');
    expect(insertTexts).toContain('Paragraph two');
  });

  it('does not produce HEADING_2 sections', () => {
    const nodes = [paragraph('Content')];
    const { requests } = buildUnstructuredDocRequests(
      nodes,
      '2026-02-17',
      '2026-02-28',
      1,
    );

    const h2Styles = requests.filter(
      (r) =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2',
    );
    expect(h2Styles).toHaveLength(0);
  });

  it('handles empty node array', () => {
    const { requests } = buildUnstructuredDocRequests(
      [],
      '2026-02-17',
      '2026-02-28',
      1,
    );

    // Should still have cycle header
    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text!)
      .join('');

    expect(insertTexts).toContain('Running Notes');
  });
});
