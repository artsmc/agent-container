import { describe, it, expect } from 'vitest';
import { truncateTranscript } from '../../src/formatters/transcript-formatter.js';

describe('truncateTranscript', () => {
  it('returns short text unchanged', () => {
    const text = 'Hello, this is a short transcript.';
    expect(truncateTranscript(text)).toBe(text);
  });

  it('returns text at exactly 2000 chars unchanged', () => {
    const text = 'A'.repeat(2000);
    expect(truncateTranscript(text)).toBe(text);
  });

  it('truncates text exceeding 2000 chars with default message', () => {
    const text = 'B'.repeat(3000);
    const result = truncateTranscript(text);

    expect(result).toContain('B'.repeat(2000));
    expect(result).toContain(
      '[Transcript truncated. View the full version in the Web UI]'
    );
    expect(result).not.toContain('B'.repeat(2001));
  });

  it('truncates text with custom UI URL', () => {
    const text = 'C'.repeat(3000);
    const result = truncateTranscript(
      text,
      'https://app.iexcel.com/transcripts/123'
    );

    expect(result).toContain(
      '[Transcript truncated. Full version at https://app.iexcel.com/transcripts/123]'
    );
  });

  it('does not append URL when text is short and URL is provided', () => {
    const text = 'Short text';
    const result = truncateTranscript(
      text,
      'https://app.iexcel.com/transcripts/123'
    );
    expect(result).toBe('Short text');
  });
});
