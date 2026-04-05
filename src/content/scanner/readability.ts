/**
 * Readability-style main content extractor.
 * Identifies the primary content region of a page without using AI.
 *
 * Strategy:
 * 1. Try well-known semantic selectors in priority order.
 * 2. Fall back to the element with the highest text-density score.
 */

const MAIN_SELECTORS = [
  'main',
  '[role="main"]',
  'article',
  '#main-content',
  '#main',
  '#content',
  '#article',
  '.main-content',
  '.post-content',
  '.article-body',
  '.entry-content',
  '.page-content',
  '.content',
  '.post',
  '.article',
];

/** Minimum character count to consider a candidate substantial. */
const MIN_TEXT_LENGTH = 200;

/**
 * Locate the primary content region of the page without calling any API.
 * Falls back to the body if no suitable candidate is found.
 */
export function extractMainContent(): Element {
  for (const selector of MAIN_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && hasSubstantialText(el)) return el;
  }

  const densest = findDensestElement();
  if (densest) return densest;

  return document.body;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the element contains enough text to be considered a content region. */
function hasSubstantialText(el: Element): boolean {
  return (el.textContent ?? '').trim().length >= MIN_TEXT_LENGTH;
}

/**
 * Scores every <div>, <section>, and <article> by text-to-link ratio
 * and returns the highest-scoring candidate.
 * Link-heavy elements (nav, footer, sidebars) are naturally penalised.
 */
function findDensestElement(): Element | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('div, section, article'),
  );

  let best: Element | null = null;
  let bestScore = 0;

  for (const el of candidates) {
    const score = textDensityScore(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

/**
 * Score an element by its text-to-link ratio.
 * Higher scores indicate content-dense regions; link-heavy elements score lower.
 */
function textDensityScore(el: HTMLElement): number {
  const textLength = (el.textContent ?? '').trim().length;
  if (textLength < MIN_TEXT_LENGTH) return 0;

  const linkChars = Array.from(el.querySelectorAll('a')).reduce(
    (sum, a) => sum + (a.textContent ?? '').length,
    0,
  );
  const paragraphs = el.querySelectorAll('p').length;

  // Reward paragraph density, penalise link-heavy content
  return textLength - linkChars * 1.5 + paragraphs * 25;
}
