/**
 * Type declarations for the O(n) DFS Cognitive Load Assessor.
 * The implementation lives in cognitiveScoring.js (plain JS with JSDoc).
 */

/**
 * Compute a Cognitive Load Score (0–100) for the current page via a single
 * O(n) iterative DFS traversal of the live DOM.
 *
 * | Range  | Label        |
 * |--------|--------------|
 * | 0–30   | Calm         |
 * | 31–70  | Busy         |
 * | 71–100 | Overwhelming |
 */
export function computeCognitiveScore(): number;
