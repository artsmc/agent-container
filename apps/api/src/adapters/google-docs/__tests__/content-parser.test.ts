import { describe, it, expect } from 'vitest';
import {
  parseAgendaContent,
  formatCycleHeader,
  extractText,
  type ProseMirrorDoc,
  type ProseMirrorNode,
} from '../content-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heading(text: string, level = 2): ProseMirrorNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

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

function doc(...nodes: ProseMirrorNode[]): ProseMirrorDoc {
  return { type: 'doc', content: nodes };
}

// ---------------------------------------------------------------------------
// parseAgendaContent
// ---------------------------------------------------------------------------

describe('parseAgendaContent', () => {
  it('extracts all 6 sections when present', () => {
    const input = doc(
      heading('Completed Tasks'),
      paragraph('Task A done'),
      heading('Incomplete Tasks'),
      paragraph('Task B pending'),
      heading('Relevant Deliverables'),
      paragraph('Deliverable X'),
      heading('Recommendations'),
      paragraph('Recommend Y'),
      heading('New Ideas'),
      paragraph('Idea Z'),
      heading('Next Steps'),
      paragraph('Step 1'),
    );

    const result = parseAgendaContent(input);

    expect(result.completedTasks).toHaveLength(1);
    expect(extractText(result.completedTasks[0])).toBe('Task A done');

    expect(result.incompleteTasks).toHaveLength(1);
    expect(extractText(result.incompleteTasks[0])).toBe('Task B pending');

    expect(result.relevantDeliverables).toHaveLength(1);
    expect(extractText(result.relevantDeliverables[0])).toBe('Deliverable X');

    expect(result.recommendations).toHaveLength(1);
    expect(extractText(result.recommendations[0])).toBe('Recommend Y');

    expect(result.newIdeas).toHaveLength(1);
    expect(extractText(result.newIdeas[0])).toBe('Idea Z');

    expect(result.nextSteps).toHaveLength(1);
    expect(extractText(result.nextSteps[0])).toBe('Step 1');
  });

  it('handles case-insensitive section headers', () => {
    const input = doc(
      heading('COMPLETED TASKS'),
      paragraph('Done'),
      heading('incomplete tasks'),
      paragraph('Pending'),
    );

    const result = parseAgendaContent(input);
    expect(result.completedTasks).toHaveLength(1);
    expect(result.incompleteTasks).toHaveLength(1);
  });

  it('returns empty arrays for missing sections', () => {
    const input = doc(
      heading('Completed Tasks'),
      paragraph('Done'),
      heading('Next Steps'),
      paragraph('Step 1'),
    );

    const result = parseAgendaContent(input);

    expect(result.completedTasks).toHaveLength(1);
    expect(result.nextSteps).toHaveLength(1);
    expect(result.incompleteTasks).toEqual([]);
    expect(result.relevantDeliverables).toEqual([]);
    expect(result.recommendations).toEqual([]);
    expect(result.newIdeas).toEqual([]);
  });

  it('returns all empty arrays when no sections are recognized', () => {
    const input = doc(
      paragraph('Some random content'),
      paragraph('More content'),
    );

    const result = parseAgendaContent(input);

    expect(result.completedTasks).toEqual([]);
    expect(result.incompleteTasks).toEqual([]);
    expect(result.relevantDeliverables).toEqual([]);
    expect(result.recommendations).toEqual([]);
    expect(result.newIdeas).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });

  it('recognizes alternate section names', () => {
    const input = doc(
      heading('Deliverables'),
      paragraph('Deliverable item'),
      heading('Outstanding Tasks'),
      paragraph('Outstanding item'),
    );

    const result = parseAgendaContent(input);

    expect(result.relevantDeliverables).toHaveLength(1);
    expect(extractText(result.relevantDeliverables[0])).toBe(
      'Deliverable item',
    );

    expect(result.incompleteTasks).toHaveLength(1);
    expect(extractText(result.incompleteTasks[0])).toBe('Outstanding item');
  });

  it('captures multi-node content between sections', () => {
    const input = doc(
      heading('Completed Tasks'),
      paragraph('Task 1'),
      paragraph('Task 2'),
      bulletList(['Bullet A', 'Bullet B']),
      heading('Next Steps'),
      paragraph('Step'),
    );

    const result = parseAgendaContent(input);

    // 3 nodes: 2 paragraphs + 1 bulletList
    expect(result.completedTasks).toHaveLength(3);
    expect(result.nextSteps).toHaveLength(1);
  });

  it('handles empty document content', () => {
    const input: ProseMirrorDoc = { type: 'doc', content: [] };
    const result = parseAgendaContent(input);

    expect(result.completedTasks).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });

  it('handles document with headings but no body nodes between them', () => {
    const input = doc(
      heading('Completed Tasks'),
      heading('Incomplete Tasks'),
      heading('Next Steps'),
    );

    const result = parseAgendaContent(input);

    expect(result.completedTasks).toEqual([]);
    expect(result.incompleteTasks).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });

  it('ignores unrecognized headings', () => {
    const input = doc(
      heading('Random Heading'),
      paragraph('random content'),
      heading('Completed Tasks'),
      paragraph('task A'),
    );

    const result = parseAgendaContent(input);
    expect(result.completedTasks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// formatCycleHeader
// ---------------------------------------------------------------------------

describe('formatCycleHeader', () => {
  it('formats cycle dates into Running Notes heading', () => {
    const result = formatCycleHeader('2026-02-17', '2026-02-28');
    expect(result).toBe('Running Notes \u2014 Feb 17 to Feb 28, 2026');
  });

  it('handles month boundaries', () => {
    const result = formatCycleHeader('2026-03-03', '2026-03-14');
    expect(result).toBe('Running Notes \u2014 Mar 3 to Mar 14, 2026');
  });

  it('handles cross-month cycles', () => {
    const result = formatCycleHeader('2026-01-26', '2026-02-06');
    expect(result).toBe('Running Notes \u2014 Jan 26 to Feb 6, 2026');
  });

  it('handles year boundary', () => {
    const result = formatCycleHeader('2025-12-22', '2026-01-02');
    expect(result).toBe('Running Notes \u2014 Dec 22 to Jan 2, 2026');
  });
});

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe('extractText', () => {
  it('extracts text from a simple text node', () => {
    expect(extractText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('extracts text from nested nodes', () => {
    const node: ProseMirrorNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ],
    };
    expect(extractText(node)).toBe('Hello World');
  });

  it('returns empty string for node with no text or content', () => {
    expect(extractText({ type: 'hardBreak' })).toBe('');
  });
});
