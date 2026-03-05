import sanitizeHtml from 'sanitize-html';
import styles from './RichTextRenderer.module.scss';

/**
 * Sanitization options for rich text content.
 * Only safe formatting tags are allowed. All scripts, styles, and
 * dangerous elements are stripped. Links are restricted to http(s)
 * protocols and get rel="noopener noreferrer".
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'br',
    'h3',
    'h4',
    'a',
    'blockquote',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
  },
  allowedSchemes: ['http', 'https'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
  },
};

interface RichTextRendererProps {
  /** HTML content string to sanitize and render. */
  content: string;
}

/**
 * Server-side rich text renderer with XSS sanitization.
 *
 * Accepts HTML content (produced by TipTap/ProseMirror editor serialization),
 * sanitizes it against an allowlist of safe tags, and renders using
 * dangerouslySetInnerHTML. Sanitization runs server-side in the Server
 * Component before HTML reaches the client.
 */
export function RichTextRenderer({ content }: RichTextRendererProps) {
  const safeHtml = sanitizeHtml(content, SANITIZE_OPTIONS);

  return (
    <div
      className={styles.richText}
      data-testid="rich-text-content"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
