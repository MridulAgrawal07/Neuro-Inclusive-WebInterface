/**
 * DOM Scanner — walks the live DOM and serializes visible elements into
 * ElementMetadata objects for downstream heuristic and AI classification.
 *
 * Shadow DOM roots are pierced automatically so web components are included.
 */

import type { ElementMetadata } from '@/shared/types';
import { getUniqueSelector } from './semantic-map';
import { walkPiercingShadow } from '../utils/shadow-dom';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK',
  'HEAD', 'BR', 'HR', 'WBR',
]);

const IMPLICIT_ROLES: Record<string, string> = {
  MAIN: 'main',
  NAV: 'navigation',
  HEADER: 'banner',
  FOOTER: 'contentinfo',
  ASIDE: 'complementary',
  ARTICLE: 'article',
  SECTION: 'region',
  FORM: 'form',
  DIALOG: 'dialog',
  H1: 'heading', H2: 'heading', H3: 'heading',
  H4: 'heading', H5: 'heading', H6: 'heading',
  UL: 'list', OL: 'list',
  LI: 'listitem',
  TABLE: 'table',
  BUTTON: 'button',
  A: 'link',
  IMG: 'img',
};

/**
 * Walks the DOM tree from `root` and returns metadata for every
 * visible, non-skipped element.
 */
export function scanDOM(root: Element = document.body): ElementMetadata[] {
  const results: ElementMetadata[] = [];
  const nodes = walkPiercingShadow(root, NodeFilter.SHOW_ELEMENT);

  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (!SKIP_TAGS.has(el.tagName) && isVisible(el)) {
        results.push(buildMetadata(el));
      }
    }
  }

  return results;
}

/**
 * Extract the metadata fields used for noise scoring from a single element.
 * Text content is truncated to 200 characters to keep payloads small.
 */
function buildMetadata(el: Element): ElementMetadata {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return {
    selector: getUniqueSelector(el),
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') ?? IMPLICIT_ROLES[el.tagName] ?? null,
    classes: Array.from(el.classList),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    zIndex: parseInt(style.zIndex) || 0,
    textContent: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
  };
}

/**
 * Returns true if an element is visually rendered and occupies space on-screen.
 * Elements hidden via CSS display/visibility/opacity or zero dimensions are excluded.
 */
function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
