import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextRenderer } from './RichTextRenderer';

describe('RichTextRenderer', () => {
  it('renders safe HTML content', () => {
    render(<RichTextRenderer content="<p>Hello <strong>world</strong></p>" />);
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).toContain('<p>');
    expect(el.innerHTML).toContain('<strong>world</strong>');
  });

  it('renders bullet lists', () => {
    render(
      <RichTextRenderer content="<ul><li>Item 1</li><li>Item 2</li></ul>" />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).toContain('<ul>');
    expect(el.innerHTML).toContain('<li>');
    expect(el.textContent).toContain('Item 1');
    expect(el.textContent).toContain('Item 2');
  });

  it('renders ordered lists', () => {
    render(
      <RichTextRenderer content="<ol><li>First</li><li>Second</li></ol>" />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).toContain('<ol>');
  });

  it('sanitizes script tags (XSS prevention)', () => {
    render(
      <RichTextRenderer content='<p>Safe</p><script>alert("xss")</script>' />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).not.toContain('alert');
    expect(el.textContent).toContain('Safe');
  });

  it('sanitizes style tags', () => {
    render(
      <RichTextRenderer content="<p>Content</p><style>body{display:none}</style>" />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).not.toContain('<style>');
  });

  it('sanitizes iframe tags', () => {
    render(
      <RichTextRenderer content='<p>Content</p><iframe src="https://evil.com"></iframe>' />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).not.toContain('<iframe>');
  });

  it('strips onclick attributes', () => {
    render(
      <RichTextRenderer content='<p onclick="alert(1)">Click me</p>' />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).not.toContain('onclick');
  });

  it('adds rel="noopener noreferrer" to links', () => {
    render(
      <RichTextRenderer content='<a href="https://example.com">Link</a>' />
    );
    const el = screen.getByTestId('rich-text-content');
    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  it('strips links with javascript: protocol', () => {
    render(
      <RichTextRenderer content='<a href="javascript:alert(1)">Bad Link</a>' />
    );
    const el = screen.getByTestId('rich-text-content');
    // sanitize-html strips the entire anchor tag or removes the dangerous href
    // Either the link is gone entirely, or its href is removed/empty
    const link = el.querySelector('a');
    if (link) {
      const href = link.getAttribute('href');
      expect(href === null || !href.startsWith('javascript:')).toBe(true);
    }
    // The text content should still be present regardless
    expect(el.textContent).toContain('Bad Link');
  });

  it('preserves emphasis and strong formatting', () => {
    render(
      <RichTextRenderer content="<p><em>italic</em> and <strong>bold</strong></p>" />
    );
    const el = screen.getByTestId('rich-text-content');
    expect(el.innerHTML).toContain('<em>italic</em>');
    expect(el.innerHTML).toContain('<strong>bold</strong>');
  });
});
