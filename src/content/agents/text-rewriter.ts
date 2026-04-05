/**
 * Text Rewriter Agent
 *
 * Pipeline:
 *   1. Walk main content, collect text blocks (p, h1-h6, li, blockquote)
 *   2. Filter out elements that are already simple (Flesch-Kincaid grade < 6)
 *   3. Deduplicate identical blocks
 *   4. Group into chunks (≤ 1000 tokens each)
 *   5. Send each chunk to background worker via SIMPLIFY_TEXT message
 *   6. Background calls Claude, caches, and returns { original, simplified }[]
 *   7. Replace original element text nodes with simplified content
 *   8. Attach hover tooltip showing the original text
 *
 * Skips: inputs, textareas, contenteditable, code, pre, script, style
 */

import type { Profile } from '@/shared/types';
import { isAlreadySimple, chunkTextBlocks, deduplicateBlocks } from '@/shared/scoring';
import { attachTooltip, initTooltip } from '../ui/tooltip';

// Tags whose content must never be rewritten
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
  'SVG', 'MATH', 'CANVAS',
]);

// Tags that represent meaningful text blocks
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'FIGCAPTION']);

const REWRITTEN_ATTR = 'data-ni-rewritten';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full rewrite pipeline on the given content root.
 * Returns the number of blocks actually rewritten.
 */
export async function rewriteContent(
  mainContent: Element,
  profile: Profile,
  showOriginalOnHover: boolean,
): Promise<number> {
  const blocks = collectTextBlocks(mainContent);

  // FK pre-filter: skip already-simple blocks
  const complexBlocks = blocks.filter(({ text }) => !isAlreadySimple(text));
  if (complexBlocks.length === 0) return 0;

  // Deduplicate by text content
  const uniqueTexts = deduplicateBlocks(complexBlocks.map(b => b.text));

  // Group into token-sized chunks
  const chunks = chunkTextBlocks(uniqueTexts);

  let rewrittenCount = 0;

  if (showOriginalOnHover) initTooltip();

  for (const chunk of chunks) {
    const pairs = await requestSimplification(chunk, profile);
    if (!pairs) continue;

    // Build a lookup: original text → simplified text
    const simplified = new Map(pairs.map(p => [p.original.trim(), p.simplified]));

    // Apply to matching DOM elements
    for (const { el, text } of complexBlocks) {
      const key = text.trim();
      const simplifiedText = simplified.get(key);
      if (!simplifiedText || simplifiedText === key) continue;
      if (el.hasAttribute(REWRITTEN_ATTR)) continue;

      replaceElementText(el, simplifiedText);
      el.setAttribute(REWRITTEN_ATTR, 'true');

      if (showOriginalOnHover) {
        attachTooltip(el as HTMLElement, text);
      }
      rewrittenCount++;
    }
  }

  return rewrittenCount;
}

/**
 * Restore all rewritten elements to their original text.
 */
export function resetRewrittenContent(): void {
  document.querySelectorAll<HTMLElement>(`[${REWRITTEN_ATTR}]`).forEach(el => {
    const original = el.getAttribute('data-ni-original');
    if (original) replaceElementText(el, original);
    el.removeAttribute(REWRITTEN_ATTR);
    el.removeAttribute('data-ni-original');
    el.style.removeProperty('cursor');
  });
}

// ---------------------------------------------------------------------------
// DOM traversal: collect text blocks from main content
// ---------------------------------------------------------------------------

interface TextBlock {
  el: Element;
  text: string;
}

/**
 * Walk the content root and collect all block-level text elements
 * that are candidates for AI rewriting.
 * Skips elements inside protected ancestors and those already rewritten.
 */
function collectTextBlocks(root: Element): TextBlock[] {
  const results: TextBlock[] = [];

  root.querySelectorAll<HTMLElement>(
    'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption',
  ).forEach(el => {
    // Skip if inside a protected ancestor
    if (isInsideSkippedTag(el)) return;
    // Skip already-rewritten
    if (el.hasAttribute(REWRITTEN_ATTR)) return;

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 30) return; // too short to be worth rewriting

    results.push({ el, text });
  });

  return results;
}

/**
 * Walk up the ancestor chain to check if any ancestor is a protected tag
 * (code block, form control, editable region) that must not be rewritten.
 */
function isInsideSkippedTag(el: Element): boolean {
  let current: Element | null = el.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    if (current.hasAttribute('contenteditable')) return true;
    current = current.parentElement;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Text replacement
// ---------------------------------------------------------------------------

/**
 * Swap the text content of an element while preserving any child elements
 * (images, inline links, etc.). Only the longest text node is replaced.
 * If the element contains only text nodes, textContent is replaced directly.
 */
function replaceElementText(el: Element, newText: string): void {
  // Preserve child elements (images, links) — only replace text nodes
  const childNodes = Array.from(el.childNodes);
  const hasOnlyText = childNodes.every(n => n.nodeType === Node.TEXT_NODE);

  if (hasOnlyText) {
    el.textContent = newText;
  } else {
    // Find the primary text node (longest) and replace it
    let longestNode: Text | null = null;
    let longestLen = 0;

    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent ?? '').trim().length;
        if (len > longestLen) {
          longestLen = len;
          longestNode = node as Text;
        }
      }
    }

    if (longestNode) {
      longestNode.textContent = newText;
    }
  }
}

// ---------------------------------------------------------------------------
// Message to background worker
// ---------------------------------------------------------------------------

/**
 * Send a batch of text chunks to the background service worker for AI simplification.
 * Returns the paired {original, simplified} results, or null on communication failure.
 */
async function requestSimplification(
  chunks: string[],
  profile: Profile,
): Promise<{ original: string; simplified: string }[] | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SIMPLIFY_TEXT',
      payload: { chunks, profile },
    }) as { type: string; payload: { original: string; simplified: string }[] };

    if (response?.type === 'SIMPLIFIED_TEXT') {
      return response.payload;
    }
    return null;
  } catch (err) {
    console.warn('[NI TextRewriter] simplification request failed:', err);
    return null;
  }
}

// Re-export for use in index.ts
export { BLOCK_TAGS, REWRITTEN_ATTR };
