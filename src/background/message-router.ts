/**
 * Message Router — handles all AI-related messages from content scripts.
 *
 * CLASSIFY_ELEMENTS:
 *   Receives borderline ElementMetadata[], calls Claude for each,
 *   responds with ElementAction[].
 *
 * SIMPLIFY_TEXT:
 *   Receives text chunks + profile, calls Claude per chunk (with caching,
 *   rate limiting, deduplication, and early termination), responds with
 *   { original, simplified }[] pairs.
 */

import type { MessageType, ElementMetadata, ElementAction, Profile } from '@/shared/types';
import { classifyElement, simplifyText, resolveApiKey } from './api-client';
import { rateLimiter } from './rate-limiter';
import { getCached, setCached } from './cache';
import { getSettings } from '@/shared/storage';
import { isSimilar } from '@/shared/scoring';

// Prompt templates imported as raw strings via Vite's ?raw loader
import classifyPrompt from '@/prompts/classify-element.txt?raw';
import adhdPrompt from '@/prompts/simplify-adhd.txt?raw';
import autismPrompt from '@/prompts/simplify-autism.txt?raw';
import dyslexiaPrompt from '@/prompts/simplify-dyslexia.txt?raw';

const PROFILE_PROMPTS: Record<Profile, string> = {
  adhd: adhdPrompt,
  autism: autismPrompt,
  dyslexia: dyslexiaPrompt,
  custom: adhdPrompt, // custom falls back to ADHD-style brevity
};

// ---------------------------------------------------------------------------
// Router entry point — call this from background/index.ts onMessage
// ---------------------------------------------------------------------------

export function handleAIMessage(
  message: MessageType,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type === 'CLASSIFY_ELEMENTS') {
    handleClassifyElements(message.payload, sendResponse);
    return true; // async response
  }

  if (message.type === 'SIMPLIFY_TEXT') {
    handleSimplifyText(message.payload.chunks, message.payload.profile, sendResponse);
    return true; // async response
  }

  return false; // not handled here
}

// ---------------------------------------------------------------------------
// CLASSIFY_ELEMENTS handler
// ---------------------------------------------------------------------------

async function handleClassifyElements(
  elements: ElementMetadata[],
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    const settings = await getSettings();
    const apiKey = resolveApiKey(settings.apiKey ?? '');
    const actions: ElementAction[] = [];

    for (const el of elements) {
      const action = await classifyWithRateLimit(el, apiKey);
      actions.push({ selector: el.selector, action });
    }

    sendResponse({ type: 'CLASSIFICATION_RESULT', payload: actions });
  } catch (err) {
    console.error('[NI Router] classifyElements error:', err);
    // Fallback: keep all borderline elements
    const fallback = (elements as ElementMetadata[]).map(el => ({
      selector: el.selector,
      action: 'keep' as const,
    }));
    sendResponse({ type: 'CLASSIFICATION_RESULT', payload: fallback });
  }
}

/**
 * Classify a single element via the Gemini API, waiting for a rate-limit token first.
 * @returns The action to apply ('hide' | 'collapse' | 'keep').
 */
async function classifyWithRateLimit(
  element: ElementMetadata,
  apiKey: string,
): Promise<ElementAction['action']> {
  await waitForToken();
  const result = await classifyElement(element, classifyPrompt, apiKey);
  return result.action;
}

// ---------------------------------------------------------------------------
// SIMPLIFY_TEXT handler
// ---------------------------------------------------------------------------

async function handleSimplifyText(
  chunks: string[],
  profile: Profile,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    const settings = await getSettings();
    const apiKey = resolveApiKey(settings.apiKey ?? '');
    const systemPrompt = PROFILE_PROMPTS[profile];
    const pairs: { original: string; simplified: string }[] = [];

    // Dedup: track unique chunks to avoid redundant API calls
    const seen = new Map<string, string>(); // original → simplified
    const recentOutputs: string[] = []; // for early-termination check

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;

      // Return cached dedup result immediately
      if (seen.has(trimmed)) {
        pairs.push({ original: chunk, simplified: seen.get(trimmed)! });
        continue;
      }

      // Check response cache
      const cached = settings.cacheEnabled ? await getCached(trimmed, profile) : null;
      if (cached) {
        seen.set(trimmed, cached);
        pairs.push({ original: chunk, simplified: cached });
        continue;
      }

      // Early termination: if last 3 outputs are nearly identical to input, stop
      if (recentOutputs.length >= 3 && recentOutputs.every(o => isSimilar(o, trimmed))) {
        pairs.push({ original: chunk, simplified: chunk });
        continue;
      }

      // Rate-limit, then call API
      await waitForToken();
      const simplified = await simplifyText(trimmed, profile, systemPrompt, apiKey);

      if (settings.cacheEnabled) {
        await setCached(trimmed, profile, simplified);
      }

      seen.set(trimmed, simplified);
      pairs.push({ original: chunk, simplified });

      recentOutputs.push(simplified);
      if (recentOutputs.length > 3) recentOutputs.shift();
    }

    sendResponse({ type: 'SIMPLIFIED_TEXT', payload: pairs });
  } catch (err) {
    console.error('[NI Router] simplifyText error:', err);
    // Fallback: return original text unchanged
    const fallback = (chunks as string[]).map(c => ({ original: c, simplified: c }));
    sendResponse({ type: 'SIMPLIFIED_TEXT', payload: fallback });
  }
}

// ---------------------------------------------------------------------------
// Rate-limit helper: waits until a token is available
// ---------------------------------------------------------------------------

/**
 * Block until the rate limiter has a token available, then consume it.
 * Polls on the limiter's own estimate of time-to-next-token.
 */
async function waitForToken(): Promise<void> {
  let wait = rateLimiter.msUntilNextToken();
  while (wait > 0) {
    await delay(wait);
    wait = rateLimiter.msUntilNextToken();
  }
  rateLimiter.tryConsume();
}

/** Promisified setTimeout for use with async/await. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
