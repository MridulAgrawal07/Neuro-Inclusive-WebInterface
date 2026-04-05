/**
 * Extracts the main readable text from the current page DOM
 * using Mozilla's Readability.js library.
 *
 * Strips ads, nav, sidebars, and all non-article junk automatically.
 * Truncates to 15,000 characters to minimize token usage.
 */

import { Readability } from '@mozilla/readability';
import { deduplicateBlocks } from '@/shared/scoring';

const MAX_CHARS = 15_000;

export interface PageArticle {
  /** Sanitized HTML from Readability — safe to inject as innerHTML */
  content: string;
  /** Plain-text version for AI summarization */
  textContent: string;
  title: string;
}

/**
 * Parse the page with Readability and return both the cleaned HTML and plain text.
 * Returns null if Readability could not extract an article.
 */
export function extractPageArticle(): PageArticle | null {
  const clone = document.cloneNode(true) as Document;
  const article = new Readability(clone).parse();
  if (!article) return null;
  return {
    content: article.content ?? '',
    textContent: article.textContent ?? '',
    title: article.title || document.title || 'Untitled page',
  };
}

/**
 * Extract de-duplicated, whitespace-normalized plain text from the page,
 * truncated to MAX_CHARS to stay within AI token budgets.
 *
 * Truncation prefers a clean paragraph boundary, then a sentence boundary,
 * and only falls back to a hard character cut as a last resort.
 *
 * Returns an empty string if Readability cannot parse the page.
 */
export function extractPageText(): string {
  // Readability mutates the DOM, so we must clone first
  const clone = document.cloneNode(true) as Document;
  const article = new Readability(clone).parse();

  if (!article?.textContent) {
    return '';
  }

  // Collapse whitespace runs and trim
  const raw = article.textContent
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Deduplicate repeated paragraphs (e.g. boilerplate repeated in article body)
  const paragraphs = raw.split('\n\n');
  const cleaned = deduplicateBlocks(paragraphs).join('\n\n');

  // Truncate to MAX_CHARS (cut at last paragraph/sentence boundary)
  if (cleaned.length <= MAX_CHARS) return cleaned;

  const truncated = cleaned.slice(0, MAX_CHARS);
  const lastBreak = truncated.lastIndexOf('\n\n');
  if (lastBreak > MAX_CHARS * 0.7) return truncated.slice(0, lastBreak).trim();

  const lastPeriod = truncated.lastIndexOf('. ');
  if (lastPeriod > MAX_CHARS * 0.7) return truncated.slice(0, lastPeriod + 1).trim();

  return truncated.trim();
}
