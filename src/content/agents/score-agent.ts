/**
 * Cognitive Accessibility Score Agent
 *
 * Evaluates the current (post-transformation) DOM across five weighted dimensions
 * and returns a ScoreBreakdown. All computation is local — no API calls.
 *
 * Dimensions and weights (CLAUDE.md §4.4):
 *   Visual Complexity   25% — distinct colors, font sizes, layout regions
 *   Text Readability    25% — Flesch-Kincaid grade of main content
 *   Distraction Level   20% — animations, autoplay media, remaining noise elements
 *   Navigation Clarity  15% — heading hierarchy, landmarks, link distinguishability
 *   Sensory Load        15% — contrast ratio, flashing content, audio autoplay
 */

import type { ScoreBreakdown } from '@/shared/types';
import { SCORE_WEIGHTS } from '@/shared/constants';
import { fleschKincaidGrade } from '@/shared/scoring';

const ELEMENT_SAMPLE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function computeScore(mainContent: Element): ScoreBreakdown {
  const visualComplexity = scoreVisualComplexity();
  const textReadability = scoreTextReadability(mainContent);
  const distractionLevel = scoreDistractionLevel(mainContent);
  const navigationClarity = scoreNavigationClarity();
  const sensoryLoad = scoreSensoryLoad();

  const overall = Math.round(
    visualComplexity * SCORE_WEIGHTS.visualComplexity +
    textReadability  * SCORE_WEIGHTS.textReadability  +
    distractionLevel * SCORE_WEIGHTS.distractionLevel +
    navigationClarity * SCORE_WEIGHTS.navigationClarity +
    sensoryLoad      * SCORE_WEIGHTS.sensoryLoad,
  );

  return {
    overall: clamp(overall),
    visualComplexity: clamp(visualComplexity),
    textReadability:  clamp(textReadability),
    distractionLevel: clamp(distractionLevel),
    navigationClarity: clamp(navigationClarity),
    sensoryLoad: clamp(sensoryLoad),
  };
}

// ---------------------------------------------------------------------------
// Dimension 1: Visual Complexity (25%)
// Measures distinct colors, font sizes, and layout regions.
// Fewer distinct values → less cognitive load → higher score.
// ---------------------------------------------------------------------------

export function scoreVisualComplexity(): number {
  const elements = sampleVisibleElements(ELEMENT_SAMPLE_LIMIT);

  const colors = new Set<string>();
  const fontSizes = new Set<string>();

  for (const el of elements) {
    const style = window.getComputedStyle(el);
    colors.add(normalizeColor(style.color));
    colors.add(normalizeColor(style.backgroundColor));
    fontSizes.add(style.fontSize);
  }

  // Remove transparent / default values
  colors.delete('rgba(0,0,0,0)');
  colors.delete('transparent');

  const layoutRegions = document.querySelectorAll(
    'header, nav, main, aside, footer, section, article',
  ).length;

  const colorScore    = mapCount(colors.size,       [5, 10, 20, 40]);
  const fontScore     = mapCount(fontSizes.size,     [3,  5,  7,  9]);
  const regionScore   = mapCount(layoutRegions,      [4,  6,  9, 12]);

  return Math.round((colorScore + fontScore + regionScore) / 3);
}

// ---------------------------------------------------------------------------
// Dimension 2: Text Readability (25%)
// Measures Flesch-Kincaid grade of the main content text.
// Lower grade → easier to read → higher score.
// ---------------------------------------------------------------------------

export function scoreTextReadability(mainContent: Element): number {
  const paragraphs = Array.from(mainContent.querySelectorAll('p, li, blockquote'))
    .slice(0, 30)
    .map(el => (el.textContent ?? '').trim())
    .filter(t => t.length > 40);

  if (paragraphs.length === 0) return 70; // no paragraphs → neutral

  const combined = paragraphs.join('. ');
  const grade = fleschKincaidGrade(combined);

  return gradeToScore(grade);
}

/** Map FK grade to 0-100 score. */
export function gradeToScore(grade: number): number {
  if (grade <= 4)  return 100;
  if (grade <= 6)  return 90;
  if (grade <= 8)  return 78;
  if (grade <= 10) return 65;
  if (grade <= 12) return 52;
  if (grade <= 14) return 40;
  if (grade <= 16) return 28;
  return 15;
}

// ---------------------------------------------------------------------------
// Dimension 3: Distraction Level (20%)
// Counts remaining noise elements, autoplay media, and active animations.
// Starts at 100; each distractor reduces the score.
// ---------------------------------------------------------------------------

export function scoreDistractionLevel(mainContent: Element): number {
  let score = 100;

  // Autoplay media not paused by NI
  const autoplaying = Array.from(
    document.querySelectorAll<HTMLMediaElement>('video[autoplay], audio[autoplay]'),
  ).filter(el => !el.paused && !el.hasAttribute('data-ni-paused'));
  score -= autoplaying.length * 25;

  // Fixed/sticky elements outside main content still visible
  const fixedOutside = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
    if (mainContent.contains(el)) return false;
    if (el.hasAttribute('data-ni-hidden')) return false;
    const pos = window.getComputedStyle(el).position;
    return pos === 'fixed' || pos === 'sticky';
  });
  score -= Math.min(fixedOutside.length, 5) * 12;

  // Elements matching noise patterns still visible (not caught by heuristic)
  const noisePattern =
    /\b(ad|popup|modal|overlay|cookie|newsletter|subscribe|chat-widget)\b/i;
  const remainingNoise = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
    el =>
      !el.hasAttribute('data-ni-hidden') &&
      !mainContent.contains(el) &&
      noisePattern.test([...el.classList, el.id].join(' ')),
  );
  score -= Math.min(remainingNoise.length, 4) * 8;

  // Active CSS animations
  const animated = Array.from(
    document.querySelectorAll<HTMLElement>('*'),
  ).filter(el => {
    const style = window.getComputedStyle(el);
    return (
      style.animationName !== 'none' &&
      style.animationPlayState === 'running' &&
      parseFloat(style.animationDuration) > 0
    );
  });
  score -= Math.min(animated.length, 6) * 5;

  return Math.max(0, score);
}

// ---------------------------------------------------------------------------
// Dimension 4: Navigation Clarity (15%)
// Checks heading hierarchy, landmark roles, and link distinguishability.
// Each satisfied criterion contributes points (total possible: 100).
// ---------------------------------------------------------------------------

export function scoreNavigationClarity(): number {
  let score = 0;

  // Single h1 exists
  const h1s = document.querySelectorAll('h1');
  if (h1s.length === 1) score += 20;
  else if (h1s.length > 1) score += 5; // multiple h1s is bad but not zero

  // Main landmark exists
  if (document.querySelector('main, [role="main"]')) score += 25;

  // Nav landmark exists
  if (document.querySelector('nav, [role="navigation"]')) score += 15;

  // Heading hierarchy is sequential (no skipped levels)
  if (headingsAreHierarchical()) score += 25;

  // Links are visually distinct from body text
  if (linksAreDistinct()) score += 15;

  return Math.min(score, 100);
}

/**
 * Check that heading levels increase by at most one at a time (no skipped levels).
 * A page can return to a higher level at any point (e.g. h3 → h2 is fine).
 */
function headingsAreHierarchical(): boolean {
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  if (headings.length === 0) return false;

  let prevLevel = 0;
  for (const h of headings) {
    const level = parseInt(h.tagName[1]);
    // A heading may stay same level, go up any amount, or go down by exactly 1
    if (level > prevLevel + 1 && prevLevel !== 0) return false;
    prevLevel = level;
  }
  return true;
}

/** Returns true if the computed color of the first link differs from the body text color. */
function linksAreDistinct(): boolean {
  const bodyStyle = window.getComputedStyle(document.body);
  const bodyColor = normalizeColor(bodyStyle.color);
  const link = document.querySelector('a');
  if (!link) return true; // no links → not a problem
  const linkColor = normalizeColor(window.getComputedStyle(link).color);
  return linkColor !== bodyColor;
}

// ---------------------------------------------------------------------------
// Dimension 5: Sensory Load (15%)
// Evaluates contrast ratio, flashing content, and audio autoplay.
// ---------------------------------------------------------------------------

export function scoreSensoryLoad(): number {
  let score = 0;

  // Contrast ratio check (WCAG)
  const contrast = computeBodyContrastRatio();
  if (contrast >= 7.0)  score += 45; // AAA
  else if (contrast >= 4.5) score += 40; // AA
  else if (contrast >= 3.0) score += 20; // AA large text only

  // No autoplay audio
  const autoAudio = document.querySelectorAll('audio[autoplay]');
  if (autoAudio.length === 0) score += 25;
  else score += Math.max(0, 25 - autoAudio.length * 12);

  // No autoplay video
  const autoVideo = document.querySelectorAll('video[autoplay]');
  if (autoVideo.length === 0) score += 20;
  else score += Math.max(0, 20 - autoVideo.length * 10);

  // No rapid-fire animations (duration < 200ms — potential flashing)
  const rapidAnimations = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
    const style = window.getComputedStyle(el);
    return (
      style.animationName !== 'none' &&
      parseFloat(style.animationDuration) < 0.2 &&
      parseFloat(style.animationDuration) > 0
    );
  });
  if (rapidAnimations.length === 0) score += 10;

  return Math.min(score, 100);
}

// ---------------------------------------------------------------------------
// Contrast ratio (WCAG relative luminance)
// ---------------------------------------------------------------------------

export function computeBodyContrastRatio(): number {
  const bodyStyle = window.getComputedStyle(document.body);
  const fgColor = parseRgb(bodyStyle.color);
  const bgColor = parseRgb(bodyStyle.backgroundColor);

  if (!fgColor || !bgColor) return 1;

  const fgL = relativeLuminance(fgColor);
  const bgL = relativeLuminance(bgColor);
  const lighter = Math.max(fgL, bgL);
  const darker  = Math.min(fgL, bgL);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Compute WCAG relative luminance for an sRGB triplet (each component 0–255).
 * Formula from WCAG 2.1 §1.4.3 success criterion.
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Parse an `rgb(…)` or `rgba(…)` string into an [R, G, B] triplet.
 * Returns null if the string is not a recognised RGB color.
 */
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/**
 * Maps a count to a 0-100 score using thresholds.
 * thresholds: [great, ok, poor, bad] — count above each → lower bucket.
 */
function mapCount(count: number, [great, ok, poor, bad]: [number, number, number, number]): number {
  if (count <= great) return 100;
  if (count <= ok)    return 80;
  if (count <= poor)  return 60;
  if (count <= bad)   return 40;
  return 20;
}

/**
 * Return up to `limit` visible elements from the document.
 * Stops early to avoid spending too long on very large pages.
 */
function sampleVisibleElements(limit: number): Element[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
  const visible: Element[] = [];
  for (const el of all) {
    if (visible.length >= limit) break;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) visible.push(el);
  }
  return visible;
}

/** Normalise a CSS color string for reliable equality comparisons. */
function normalizeColor(color: string): string {
  return color.replace(/\s/g, '').toLowerCase();
}

/** Clamp and round a score value to the valid range [0, 100]. */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
