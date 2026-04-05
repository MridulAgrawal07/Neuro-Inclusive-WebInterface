/**
 * Scoring utilities shared between the content script and background worker.
 *
 * Phase 4: Flesch-Kincaid grade level pre-filter + text chunking.
 * Phase 5: Weighted dimension scoring (score agent uses these helpers too).
 */

import { FLESCH_KINCAID_SIMPLE_THRESHOLD, MAX_CHUNK_TOKENS } from './constants';

// ---------------------------------------------------------------------------
// Flesch-Kincaid Grade Level
// Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
// ---------------------------------------------------------------------------

/** Returns true if text is already simple enough to skip AI rewriting. */
export function isAlreadySimple(text: string): boolean {
  return fleschKincaidGrade(text) < FLESCH_KINCAID_SIMPLE_THRESHOLD;
}

/**
 * Compute the Flesch-Kincaid grade level for the given text.
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 * Returns 0 for empty or unparseable input.
 */
export function fleschKincaidGrade(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;

  const sentences = clean
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const words = clean.split(/\s+/).filter(w => w.trim().length > 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  const grade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, grade);
}

/**
 * Estimate the number of syllables in a single English word.
 * Uses a vowel-run heuristic with a silent-trailing-e correction.
 * Returns at least 1 for any non-empty input.
 */
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  // Remove silent trailing 'e' (unless it's the only vowel)
  const withoutSilentE = cleaned.length > 2 ? cleaned.replace(/e$/, '') : cleaned;
  const matches = withoutSilentE.match(/[aeiouy]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

// ---------------------------------------------------------------------------
// Text chunking (paragraph-boundary aware, max 1000 tokens ≈ 4000 chars)
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

/**
 * Splits an array of text blocks into chunks that each fit within the token limit.
 * Splits at block boundaries (not mid-block) to preserve paragraph coherence.
 */
export function chunkTextBlocks(blocks: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const block of blocks) {
    if (block.length > MAX_CHARS) {
      // Oversized single block — split it at sentence boundaries
      const subBlocks = splitLongBlock(block);
      for (const sub of subBlocks) {
        if (currentChars + sub.length > MAX_CHARS && current.length > 0) {
          chunks.push(current);
          current = [];
          currentChars = 0;
        }
        current.push(sub);
        currentChars += sub.length;
      }
    } else if (currentChars + block.length > MAX_CHARS && current.length > 0) {
      chunks.push(current);
      current = [block];
      currentChars = block.length;
    } else {
      current.push(block);
      currentChars += block.length;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Split a single oversized text block at sentence boundaries so each
 * resulting piece fits within MAX_CHARS.
 */
function splitLongBlock(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHARS && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current.trim());
  return parts;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Returns unique blocks, preserving first-seen order. */
export function deduplicateBlocks(blocks: string[]): string[] {
  const seen = new Set<string>();
  return blocks.filter(b => {
    const key = b.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Early termination: detect near-identical simplified output
// ---------------------------------------------------------------------------

/** True if two strings are more than `threshold` (0–1) similar by char overlap. */
export function isSimilar(a: string, b: string, threshold = 0.9): boolean {
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (shorter.length === 0) return false;
  let matches = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) matches++;
  }
  return matches / longer.length >= threshold;
}
