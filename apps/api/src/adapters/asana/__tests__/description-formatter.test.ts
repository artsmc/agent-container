import { describe, it, expect } from 'vitest';
import { formatDescriptionForAsana } from '../description-formatter';

describe('formatDescriptionForAsana', () => {
  it('formats a 3-section description into plain-text output with all headers', () => {
    const input = [
      '**TASK CONTEXT**',
      '- The client requested an update to their onboarding checklist.',
      '',
      '**ADDITIONAL CONTEXT**',
      '- The checklist was last updated in November 2025.',
      '',
      '**REQUIREMENTS**',
      '- Review the existing checklist and update items 3, 5, and 7.',
    ].join('\n');

    const result = formatDescriptionForAsana(input);

    expect(result).toBe(
      [
        'TASK CONTEXT',
        '- The client requested an update to their onboarding checklist.',
        '',
        'ADDITIONAL CONTEXT',
        '- The checklist was last updated in November 2025.',
        '',
        'REQUIREMENTS',
        '- Review the existing checklist and update items 3, 5, and 7.',
      ].join('\n'),
    );
    // No bold markers
    expect(result).not.toContain('**');
  });

  it('returns text with ** stripped when no section markers are present', () => {
    const input = 'Follow up on the **contract renewal** discussion.';
    const result = formatDescriptionForAsana(input);

    expect(result).toBe('Follow up on the contract renewal discussion.');
    expect(result).not.toContain('**');
  });

  it('returns empty string for empty description', () => {
    expect(formatDescriptionForAsana('')).toBe('');
  });

  it('handles section markers present with empty bodies', () => {
    const input = [
      '**TASK CONTEXT**',
      '**ADDITIONAL CONTEXT**',
      '**REQUIREMENTS**',
    ].join('\n');

    const result = formatDescriptionForAsana(input);

    expect(result).toContain('TASK CONTEXT');
    expect(result).toContain('ADDITIONAL CONTEXT');
    expect(result).toContain('REQUIREMENTS');
    expect(result).not.toContain('**');
  });

  it('strips ** when only some markers are present (fallback path)', () => {
    const input = '**TASK CONTEXT**\nSome content but no other sections.';
    const result = formatDescriptionForAsana(input);

    expect(result).toBe('TASK CONTEXT\nSome content but no other sections.');
    expect(result).not.toContain('**');
  });
});
