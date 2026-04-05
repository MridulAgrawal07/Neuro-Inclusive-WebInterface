import { describe, it, expect } from 'vitest';
import {
  fleschKincaidGrade,
  isAlreadySimple,
  chunkTextBlocks,
  deduplicateBlocks,
  isSimilar,
} from '@/shared/scoring';

// ---------------------------------------------------------------------------
// Flesch-Kincaid grade
// ---------------------------------------------------------------------------

describe('fleschKincaidGrade', () => {
  it('returns 0 for empty text', () => {
    expect(fleschKincaidGrade('')).toBe(0);
  });

  it('returns a low grade for simple text', () => {
    const simple = 'The cat sat on the mat. It was a big cat. The mat was red.';
    expect(fleschKincaidGrade(simple)).toBeLessThan(6);
  });

  it('returns a higher grade for complex academic text', () => {
    const complex =
      'The epistemological implications of postmodern deconstruction fundamentally undermine conventional hermeneutical frameworks. ' +
      'Consequently, philosophical interpretation must reconstitute its methodological presuppositions accordingly.';
    expect(fleschKincaidGrade(complex)).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// isAlreadySimple
// ---------------------------------------------------------------------------

describe('isAlreadySimple', () => {
  it('returns true for very simple text', () => {
    expect(isAlreadySimple('The dog ran fast. It was fun. I liked it.')).toBe(true);
  });

  it('returns false for complex academic text', () => {
    const complex =
      'Epistemological considerations necessitate a comprehensive re-evaluation of hermeneutical methodologies. ' +
      'Such philosophical reconstitution fundamentally undermines conventional interpretive frameworks.';
    expect(isAlreadySimple(complex)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chunkTextBlocks
// ---------------------------------------------------------------------------

describe('chunkTextBlocks', () => {
  it('returns a single chunk for short blocks', () => {
    const blocks = ['Hello world.', 'Short sentence.', 'Another one.'];
    const chunks = chunkTextBlocks(blocks);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(blocks);
  });

  it('splits into multiple chunks when total exceeds token limit', () => {
    // Each block is ~2000 chars, total > 4000 char limit per chunk
    const bigBlock = 'a'.repeat(2100);
    const blocks = [bigBlock, bigBlock, bigBlock];
    const chunks = chunkTextBlocks(blocks);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves all blocks across chunks', () => {
    const bigBlock = 'word '.repeat(500); // ~2500 chars
    const blocks = [bigBlock, bigBlock, bigBlock, bigBlock];
    const chunks = chunkTextBlocks(blocks);
    const flat = chunks.flat();
    expect(flat).toHaveLength(blocks.length);
  });
});

// ---------------------------------------------------------------------------
// deduplicateBlocks
// ---------------------------------------------------------------------------

describe('deduplicateBlocks', () => {
  it('removes duplicate blocks', () => {
    const blocks = ['Hello', 'World', 'Hello', 'World', 'Unique'];
    expect(deduplicateBlocks(blocks)).toEqual(['Hello', 'World', 'Unique']);
  });

  it('preserves order of first occurrence', () => {
    expect(deduplicateBlocks(['B', 'A', 'B', 'C', 'A'])).toEqual(['B', 'A', 'C']);
  });

  it('trims before comparing', () => {
    expect(deduplicateBlocks(['hello ', '  hello', 'hello'])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isSimilar
// ---------------------------------------------------------------------------

describe('isSimilar', () => {
  it('returns true for identical strings', () => {
    expect(isSimilar('hello', 'hello')).toBe(true);
  });

  it('returns false for completely different strings', () => {
    expect(isSimilar('abcde', 'zzzzz')).toBe(false);
  });

  it('returns false for empty shorter string', () => {
    expect(isSimilar('', 'something')).toBe(false);
  });
});
