import { describe, it, expect } from 'vitest';
import {
  buildEmailSubject,
  buildEmailHtml,
  escapeHtml,
  markdownToHtml,
  formatDateShort,
  formatDateLong,
} from '../html-formatter';
import type { AgendaEmailInput } from '../adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<AgendaEmailInput>): AgendaEmailInput {
  return {
    agendaId: '00000000-0000-0000-0000-000000000001',
    shortId: 'AGD-0015',
    content: [
      '## Completed Tasks',
      '- Finished CI pipeline setup',
      '- Deployed staging environment',
      '',
      '## Incomplete Tasks',
      '- API rate limiting not yet configured',
      '',
      '## Relevant Deliverables',
      '- **CRM Integration** document v2',
      '',
      '## Recommendations',
      '- Upgrade Node.js to v22 LTS',
      '',
      '## New Ideas',
      '- Explore AI-powered task routing',
      '',
      '## Next Steps',
      '- Schedule stakeholder review',
    ].join('\n'),
    cycleStart: '2026-02-17',
    cycleEnd: '2026-02-28',
    clientName: 'Total Life',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Date formatters
// ---------------------------------------------------------------------------

describe('formatDateShort', () => {
  it('formats ISO date to short form (e.g., Feb 17)', () => {
    expect(formatDateShort('2026-02-17')).toBe('Feb 17');
  });

  it('handles month boundaries correctly', () => {
    expect(formatDateShort('2026-01-01')).toBe('Jan 1');
    expect(formatDateShort('2026-12-31')).toBe('Dec 31');
  });
});

describe('formatDateLong', () => {
  it('formats ISO date to long form (e.g., Feb 28, 2026)', () => {
    expect(formatDateLong('2026-02-28')).toBe('Feb 28, 2026');
  });
});

// ---------------------------------------------------------------------------
// Subject line
// ---------------------------------------------------------------------------

describe('buildEmailSubject', () => {
  it('produces the correct subject line format', () => {
    const subject = buildEmailSubject('Total Life', '2026-02-17', '2026-02-28');
    expect(subject).toBe(
      'Running Notes \u2014 Total Life | Feb 17 to Feb 28, 2026',
    );
  });

  it('uses the exact client name provided', () => {
    const subject = buildEmailSubject(
      'Acme Corp',
      '2026-03-01',
      '2026-03-15',
    );
    expect(subject).toContain('Acme Corp');
    expect(subject).toContain('Mar 1 to Mar 15, 2026');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('returns unchanged string when no special chars', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// markdownToHtml
// ---------------------------------------------------------------------------

describe('markdownToHtml', () => {
  it('converts bullet list (dash) to <ul><li>', () => {
    const html = markdownToHtml('- item one\n- item two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('<li>item two</li>');
    expect(html).toContain('</ul>');
  });

  it('converts bullet list (asterisk) to <ul><li>', () => {
    const html = markdownToHtml('* item one\n* item two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('</ul>');
  });

  it('converts **bold** to <strong>', () => {
    const html = markdownToHtml('This is **bold** text');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('converts *italic* to <em>', () => {
    const html = markdownToHtml('This is *italic* text');
    expect(html).toContain('<em>italic</em>');
  });

  it('converts `code` to <code>', () => {
    const html = markdownToHtml('Use `npm install` command');
    expect(html).toContain('<code>npm install</code>');
  });

  it('wraps plain text in <p> tags', () => {
    const html = markdownToHtml('Hello world');
    expect(html).toBe('<p>Hello world</p>');
  });

  it('closes list on empty line', () => {
    const html = markdownToHtml('- a\n- b\n\nParagraph');
    expect(html).toContain('</ul>');
    expect(html).toContain('<p>Paragraph</p>');
  });

  it('closes list at end of input', () => {
    const html = markdownToHtml('- last item');
    expect(html).toContain('<ul>');
    expect(html).toContain('</ul>');
  });
});

// ---------------------------------------------------------------------------
// buildEmailHtml
// ---------------------------------------------------------------------------

describe('buildEmailHtml', () => {
  it('contains client name as H1', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('<h1');
    expect(html).toContain('Total Life</h1>');
  });

  it('contains cycle date range in H2', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('Feb 17 to Feb 28, 2026');
    expect(html).toContain('<h2');
  });

  it('contains all 6 section headings as H3', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('Completed Tasks</h3>');
    expect(html).toContain('Incomplete Tasks</h3>');
    expect(html).toContain('Relevant Deliverables</h3>');
    expect(html).toContain('Recommendations</h3>');
    expect(html).toContain('New Ideas</h3>');
    expect(html).toContain('Next Steps</h3>');
  });

  it('renders bullet items as <ul><li>', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Finished CI pipeline setup</li>');
    expect(html).toContain('<li>Deployed staging environment</li>');
  });

  it('renders bold markers as <strong>', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('<strong>CRM Integration</strong>');
  });

  it('does not contain raw markdown bullet markers', () => {
    const html = buildEmailHtml(makeInput());
    // Should not have unprocessed "- " at line start inside the HTML body
    const bodyStart = html.indexOf('<body');
    const bodyContent = html.slice(bodyStart);
    // Filter out HR elements and style attributes that may have dashes
    const lines = bodyContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip HTML tags that naturally contain dashes
      if (trimmed.startsWith('<hr') || trimmed.startsWith('<meta')) continue;
      if (/^- \w/.test(trimmed)) {
        throw new Error(`Raw markdown bullet found: ${trimmed}`);
      }
    }
  });

  it('shows placeholder for missing sections', () => {
    const html = buildEmailHtml(
      makeInput({
        content: [
          '## Completed Tasks',
          '- Done something',
          // Other sections omitted
        ].join('\n'),
      }),
    );
    // Should still have all 6 headings
    expect(html).toContain('New Ideas</h3>');
    expect(html).toContain('(No items this cycle)');
  });

  it('escapes HTML special characters in client name', () => {
    const html = buildEmailHtml(
      makeInput({ clientName: '<script>alert("xss")</script>' }),
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('contains footer with "Sent by iExcel Automation"', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('Sent by iExcel Automation');
  });

  it('is a complete HTML document', () => {
    const html = buildEmailHtml(makeInput());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  it('handles empty content gracefully', () => {
    const html = buildEmailHtml(makeInput({ content: '' }));
    // All sections should show the placeholder
    const placeholderCount = (
      html.match(/\(No items this cycle\)/g) || []
    ).length;
    expect(placeholderCount).toBe(6);
  });
});
