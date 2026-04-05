/**
 * @file cognitiveScoring.js
 * @module cognitiveScoring
 *
 * Cognitive Load Assessor — custom O(n) iterative DFS DOM traversal.
 *
 * Visits every visible element node in the live DOM exactly once using an
 * explicit stack (no recursion), accumulating three signals that collectively
 * discriminate between clean reading sites (Medium, Wikipedia) and
 * sensory-overloaded pages (Fandom, Yahoo, Reddit).
 *
 * ---
 * **Why density, not raw counts**
 *
 * The previous model counted links and media in absolute terms. This fails
 * because both Medium (clean) and Fandom (overwhelming) can have ~400 links —
 * the difference is that Medium pairs those links with 20 000 characters of
 * paragraph text, while Fandom has only 2 000. Dividing by text volume
 * transforms an ambiguous count into a meaningful signal:
 *
 *   Medium  : 400 links / 20 000 chars × 1000 =  20 links per kchar → CALM
 *   Fandom  : 400 links /  2 000 chars × 1000 = 200 links per kchar → OVERWHELMING
 *
 * ---
 * **Three heuristics**
 *
 *   1. **Link/Interaction Density** — interactive elements per 1 000 chars of
 *      paragraph text. Separates article sites from wiki/link-farm pages.
 *
 *   2. **Clutter Tag Count** — absolute count of `<iframe>`, `<ins>`, `<aside>`,
 *      and `<video>` elements. These almost always represent ads, sidebars, or
 *      autoplay media — the strongest per-element cognitive-overload signal.
 *
 *   3. **DOM Nesting Depth** — maximum element depth reached during traversal.
 *      Aggressive ad-grid layouts ("div soup") consistently nest 40–50 levels
 *      deep; clean reading layouts rarely exceed 20–25.
 *
 * ---
 * **Text Wall heuristic — removed**
 *
 * Long `<p>` elements are intentional reading content, not cognitive noise.
 * Penalising them caused the algorithm to incorrectly score Medium and
 * long-form journalism sites as "Overwhelming". The `<p>` tag is now used
 * only as the denominator in the density calculation.
 *
 * ---
 * **Scoring thresholds**
 *
 * | Heuristic            | Value at score = 100                          |
 * |----------------------|-----------------------------------------------|
 * | Link Density         | ≥ 10 interactive elements per 1 000 chars     |
 * | Clutter Tag Count    | ≥ 15 clutter elements                         |
 * | DOM Nesting Depth    | ≥ 35 levels deep                              |
 *
 * Weights: Density 50 % · Clutter 35 % · Depth 15 %
 *
 * ---
 * **Complexity**
 * - Time:  O(n) — each node is pushed onto the stack once and popped once.
 * - Space: O(d) — the stack holds at most d objects at any time, where d is
 *                  the maximum depth of the DOM tree (typically ≤ 50).
 * ---
 *
 * @example
 * import { computeCognitiveScore } from '@/utils/cognitiveScoring.js';
 * const score = computeCognitiveScore();
 * // score: 0–30 Calm · 31–70 Busy · 71–100 Overwhelming
 */

/** Maximum element nodes to visit before halting the DFS. */
const NODE_LIMIT = 20_000;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Interactive elements (links, buttons, form controls) per 1 000 characters
 * of paragraph text at which the Link Density sub-score reaches 100.
 *
 * Rationale:
 *   - Medium article   : ~25 links / 15 000 chars ≈  1.7 / kchar → Calm
 *   - Wikipedia article: ~150 links / 20 000 chars ≈ 7.5 / kchar → Busy
 *   - Fandom wiki page : ~400 links /  2 000 chars = 200 / kchar → Overwhelming
 *
 * @type {number}
 */
const LINK_DENSITY_THRESHOLD = 10;

/**
 * Absolute count of clutter elements (`<iframe>`, `<ins>`, `<aside>`, `<video>`)
 * at which the Clutter sub-score reaches 100.
 *
 * Rationale: 15+ ad containers / asides / autoplay videos represent the upper
 * bound of tolerable sensory density for neurodiverse users.
 *
 * @type {number}
 */
const CLUTTER_THRESHOLD = 15;

/**
 * Maximum DOM nesting depth at which the Depth sub-score reaches 100.
 *
 * Rationale: ad-grid pages ("div soup") routinely nest 40–50 levels deep;
 * well-structured reading pages rarely exceed 20–25.
 *
 * @type {number}
 */
const DEPTH_THRESHOLD = 35;

// ---------------------------------------------------------------------------
// Weights — must sum to 1.0
// ---------------------------------------------------------------------------

/** @type {number} Weight for the Link Density sub-score (primary signal). */
const W_DENSITY = 0.50;

/** @type {number} Weight for the Clutter Tag Count sub-score. */
const W_CLUTTER = 0.35;

/** @type {number} Weight for the DOM Nesting Depth sub-score. */
const W_DEPTH = 0.15;

// ---------------------------------------------------------------------------
// Tag sets
// ---------------------------------------------------------------------------

/**
 * Non-visual tags whose entire subtrees are skipped to conserve the
 * NODE_LIMIT budget for elements that actually appear on screen.
 *
 * @type {Set<string>}
 */
const VOID_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'head',   'meta',  'link',     'base',
]);

/**
 * Tags that almost always represent advertising, sidebar noise, or
 * disruptive autoplay media — the strongest per-element overload signal.
 *
 * | Tag      | Typical use                                         |
 * |----------|-----------------------------------------------------|
 * | `iframe` | Ad frames, tracking pixels, embedded widgets        |
 * | `ins`    | Google AdSense insertion containers                 |
 * | `aside`  | Ad sidebars, related-content rails, cookie banners  |
 * | `video`  | Autoplay ads, background hero videos                |
 *
 * @type {Set<string>}
 */
const CLUTTER_TAGS = new Set(['iframe', 'ins', 'aside', 'video']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a **Cognitive Load Score** (0–100) for the current page by
 * performing a single O(n) iterative DFS traversal of the live DOM.
 *
 * Higher scores indicate more cognitive demand:
 * | Range   | Label        | Badge colour |
 * |---------|--------------|-------------|
 * | 0–30    | Calm         | Green        |
 * | 31–70   | Busy         | Amber        |
 * | 71–100  | Overwhelming | Red          |
 *
 * **Algorithm steps**
 * 1. Push `{ node: document.body, depth: 0 }` onto an explicit stack.
 * 2. Pop an entry; skip the entire subtree if the node is a void tag or
 *    visually hidden (inline style, `hidden` attribute, `aria-hidden`).
 * 3. Update the running maximum depth.
 * 4. Classify the tag:
 *    - Interactive (`<a>`, `<button>`, etc.) → increment `interactiveCount`
 *    - Clutter (`<iframe>`, `<ins>`, etc.)   → increment `clutterCount`;
 *      skip the subtree (ad internals carry zero additional cognitive load)
 *    - `<svg>`                                → skip the subtree (icon-font
 *      internals can number in the thousands)
 *    - `<p>`                                  → accumulate `totalParaChars`
 *      (text volume used as the density denominator — not a penalty)
 * 5. Push remaining children in reverse order (preserves left-to-right order).
 * 6. Repeat until the stack is empty or NODE_LIMIT is reached.
 * 7. Compute the three sub-scores and combine via weighted average.
 *
 * @returns {number} Integer in [0, 100] representing page cognitive load.
 */
export function computeCognitiveScore() {
  const root = document.body;
  if (!root) return 0;

  // ── Iterative DFS stack ─────────────────────────────────────────────────
  // Each entry is a plain object { node, depth } so we can track nesting
  // depth without recursion and without a separate parallel stack.
  const stack = /** @type {{ node: Element, depth: number }[]} */ (
    [{ node: root, depth: 0 }]
  );

  let visited = 0;          // total visible element nodes examined
  let interactiveCount = 0; // links, buttons, form controls
  let clutterCount = 0;     // iframes, ins, asides, videos
  let totalParaChars = 0;   // total characters inside <p> elements (text volume)
  let maxDepth = 0;         // deepest nesting level reached

  while (stack.length > 0 && visited < NODE_LIMIT) {
    const entry = stack.pop();
    const node  = entry.node;
    const depth = entry.depth;

    // Guard: only process true element nodes.
    if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName.toLowerCase();

    // ── Skip non-visual subtrees ───────────────────────────────────────────
    if (VOID_TAGS.has(tag)) continue;

    // ── Skip visually hidden subtrees ─────────────────────────────────────
    // O(1) inline-style / attribute checks — avoids the expensive reflow
    // that getComputedStyle() would trigger.
    if (
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true' ||
      (node.style && node.style.display    === 'none') ||
      (node.style && node.style.visibility === 'hidden')
    ) {
      continue;
    }

    visited++;

    // ── Track nesting depth ───────────────────────────────────────────────
    if (depth > maxDepth) maxDepth = depth;

    // ── Heuristic 1 (numerator): Interactive elements ─────────────────────
    // Counted here; divided by text volume below to produce a density ratio.
    if (
      tag === 'a'        ||
      tag === 'button'   ||
      tag === 'input'    ||
      tag === 'select'   ||
      tag === 'textarea'
    ) {
      interactiveCount++;
    }

    // ── Heuristic 2: Clutter tag count ────────────────────────────────────
    // Each of these tags represents near-certain ad content, a disruptive
    // sidebar, or autoplay media. Count the root, then skip the entire
    // subtree — the internals carry zero additional cognitive load and would
    // otherwise waste the NODE_LIMIT budget.
    if (CLUTTER_TAGS.has(tag)) {
      clutterCount++;
      continue; // skip subtree
    }

    // ── SVG subtree skip ──────────────────────────────────────────────────
    // Icon fonts and sprite sheets embed thousands of <path>/<circle>/<g>
    // children that carry no cognitive load beyond the SVG root itself.
    if (tag === 'svg') continue;

    // ── Heuristic 1 (denominator): Text volume ────────────────────────────
    // Accumulate readable text length from <p> elements only. This is used
    // as the denominator in the link-density calculation — not a penalty.
    // Long articles (Medium) generate a large denominator that keeps density
    // low even when they have many navigation links.
    if (tag === 'p') {
      totalParaChars += (node.textContent ?? '').trim().length;
    }

    // ── Push children (reverse → left-to-right DFS pop order) ─────────────
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], depth: depth + 1 });
    }
  }

  if (visited === 0) return 0;

  // ── Sub-score 1: Link / Interaction Density ───────────────────────────────
  //
  // links per 1 000 chars of paragraph text
  //
  // When there is readable text, density = interactiveCount / (chars / 1000).
  // When there is NO paragraph text (pure link pages, dashboards), each link
  // counts double because there is nothing to contextualise the navigation —
  // a page of raw links with no explanatory text is inherently disorienting.
  const linkDensity =
    totalParaChars > 0
      ? (interactiveCount / totalParaChars) * 1000
      : interactiveCount * 2;

  const densityScore = Math.min(100, (linkDensity / LINK_DENSITY_THRESHOLD) * 100);

  // ── Sub-score 2: Clutter Tag Count ────────────────────────────────────────
  // Absolute count — even a single <iframe> is usually an ad, so a ratio
  // against total nodes would unfairly reward large pages.
  const clutterScore = Math.min(100, (clutterCount / CLUTTER_THRESHOLD) * 100);

  // ── Sub-score 3: DOM Nesting Depth ────────────────────────────────────────
  // Structural "div soup" proxy — ad grids nest 40–50 levels deep; article
  // pages rarely exceed 20–25.
  const depthScore = Math.min(100, (maxDepth / DEPTH_THRESHOLD) * 100);

  // ── Weighted average → final score ────────────────────────────────────────
  // Density carries the most weight (50 %) because it is the most
  // discriminating signal between reading-focused and clutter-heavy pages.
  const raw =
    densityScore * W_DENSITY  +
    clutterScore * W_CLUTTER  +
    depthScore   * W_DEPTH;

  return Math.round(Math.min(100, Math.max(0, raw)));
}
