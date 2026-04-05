/**
 * Layout Simplifier Agent
 *
 * Two-pass classification:
 *   Pass 1 (heuristic, synchronous):
 *     score >= 0.7  → "hide"   (definite noise)
 *     score 0.4–0.69 → borderline (sent to AI in Phase 4)
 *     score < 0.4   → "keep"
 *
 *   Pass 2 (AI, async, Phase 4):
 *     Borderline elements are sent to the background worker via
 *     CLASSIFY_ELEMENTS → Claude API → CLASSIFICATION_RESULT.
 *     Results are applied on top of the heuristic pass.
 *
 * Heuristic signals (CLAUDE.md §4.1):
 *   - position: fixed/sticky outside main content
 *   - ARIA roles: dialog, alertdialog, banner (non-header context)
 *   - Class/ID name patterns matching noise keywords
 *   - z-index > 1000
 *   - Element covers > 30% of viewport area
 */

import type { ElementMetadata, ElementAction } from '@/shared/types';
import { NOISE_SCORE_THRESHOLD, NOISE_SCORE_BORDERLINE } from '@/shared/constants';

const NOISE_PATTERN =
  /\b(ad|ads|advert|advertisement|sponsored|promo|promotion|popup|pop-up|modal|overlay|lightbox|sidebar|cookie|gdpr|consent|banner|sticky|toast|notification|alert-bar|newsletter|subscribe|interstitial|takeover|paywall|survey|chat-widget|livechat|drift|intercom)\b/i;

const NOISY_ROLES = new Set(['dialog', 'alertdialog']);
const CONTEXTUAL_ROLES = new Set(['alert', 'banner', 'complementary']);

// ---------------------------------------------------------------------------
// Phase 2-compatible synchronous entry point (heuristic only)
// ---------------------------------------------------------------------------

/** Returns definite actions; borderline elements are kept (no AI). */
export function classifyElements(
  elements: ElementMetadata[],
  mainContent: Element,
): ElementAction[] {
  const { definite, borderline } = classifyElementsHeuristic(elements, mainContent);
  // Borderline → keep (Phase 4 upgrades this via classifyWithAI)
  const borderlineActions: ElementAction[] = borderline.map(el => ({
    selector: el.selector,
    action: 'keep',
  }));
  return [...definite, ...borderlineActions];
}

// ---------------------------------------------------------------------------
// Phase 4: split into heuristic + AI pass
// ---------------------------------------------------------------------------

export interface HeuristicResult {
  definite: ElementAction[];
  borderline: ElementMetadata[];
}

/**
 * Synchronous heuristic pass.
 * Definite noise/keep decisions are returned immediately.
 * Borderline elements are returned for the caller to send to AI.
 */
export function classifyElementsHeuristic(
  elements: ElementMetadata[],
  mainContent: Element,
): HeuristicResult {
  const definite: ElementAction[] = [];
  const borderline: ElementMetadata[] = [];

  for (const el of elements) {
    const score = computeNoiseScore(el, mainContent);

    if (score >= NOISE_SCORE_THRESHOLD) {
      definite.push({ selector: el.selector, action: 'hide' });
    } else if (score >= NOISE_SCORE_BORDERLINE) {
      borderline.push(el);
    } else {
      definite.push({ selector: el.selector, action: 'keep' });
    }
  }

  return { definite, borderline };
}

/**
 * Send borderline elements to the background worker for AI classification.
 * Returns ElementAction[] (same length as input, preserving order).
 * On error, all elements default to 'keep'.
 */
export async function classifyBorderlineWithAI(
  borderline: ElementMetadata[],
): Promise<ElementAction[]> {
  if (borderline.length === 0) return [];

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLASSIFY_ELEMENTS',
      payload: borderline,
    }) as { type: string; payload: ElementAction[] };

    if (response?.type === 'CLASSIFICATION_RESULT') {
      return response.payload;
    }
  } catch (err) {
    console.warn('[NI LayoutSimplifier] AI classification failed:', err);
  }

  // Fallback: keep everything
  return borderline.map(el => ({ selector: el.selector, action: 'keep' as const }));
}

// ---------------------------------------------------------------------------
// Noise scoring
// ---------------------------------------------------------------------------

/**
 * Compute a noise probability score (0.0–1.0) for a single element
 * using the heuristic signals described in CLAUDE.md §4.1.
 * Scores are additive; the result is capped at 1.0.
 */
function computeNoiseScore(el: ElementMetadata, mainContent: Element): number {
  let score = 0;

  const domEl = safeQuerySelector(el.selector);
  const isOutsideMain = domEl ? !mainContent.contains(domEl) : true;

  // Fixed / sticky positioning outside main content
  if (domEl && isOutsideMain) {
    const position = window.getComputedStyle(domEl).position;
    if (position === 'fixed') score += 0.45;
    else if (position === 'sticky') score += 0.25;
  }

  // High z-index (overlay / modal pattern)
  if (el.zIndex > 1000) score += 0.35;
  else if (el.zIndex > 100 && isOutsideMain) score += 0.15;

  // ARIA roles
  if (NOISY_ROLES.has(el.role ?? '')) score += 0.35;
  if (CONTEXTUAL_ROLES.has(el.role ?? '') && isOutsideMain) score += 0.2;

  // Class / ID name pattern matching
  const identifier = [...el.classes, el.tag, el.selector].join(' ');
  if (NOISE_PATTERN.test(identifier)) score += 0.4;

  // Element covers > 30% of viewport area
  if (isOutsideMain) {
    const viewportArea = window.innerWidth * window.innerHeight;
    const elArea = el.rect.width * el.rect.height;
    if (viewportArea > 0 && elArea / viewportArea > 0.3) score += 0.3;
  }

  // Empty or near-empty elements with z-index (trackers / spacers)
  if (el.textContent.length < 5 && el.zIndex > 0 && isOutsideMain) score += 0.15;

  return Math.min(score, 1.0);
}

/**
 * Attempt document.querySelector without throwing on invalid selectors
 * (e.g. selectors generated from unusual class names).
 */
function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}
