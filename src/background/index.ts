/**
 * Background service worker entry point.
 *
 * Responsibilities:
 *   - Route AI messages (CLASSIFY_ELEMENTS, SIMPLIFY_TEXT) to message-router.ts
 *   - Relay RESET_PAGE to the active tab's content script
 *   - Register the cache sweep alarm on install/activate
 */

import type { MessageType } from '@/shared/types';
import { handleAIMessage } from './message-router';
import { streamTLDRSummary, streamLiteralTranslation, resolveApiKey } from './api-client';
import { getSettings } from '@/shared/storage';
import { registerSweepAlarm, sweepExpiredEntries, getCached, setCached } from './cache';

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: MessageType, sender, sendResponse) => {
    // AI messages are handled by the router (async, returns true)
    const handled = handleAIMessage(message, sendResponse);
    if (handled) return true;

    // TLDR_SUMMARIZE: stream Gemini response, send chunks back to tab
    if (message.type === 'TLDR_SUMMARIZE') {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ type: 'TLDR_ERROR', payload: { error: 'No tab context' } });
        return true;
      }
      handleTLDRStream(message.payload.text, message.payload.title, tabId, sendResponse);
      return true;
    }

    // LITERAL_TRANSLATE: stream Gemini literal translation, send chunks back to tab
    if (message.type === 'LITERAL_TRANSLATE') {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ type: 'LITERAL_ERROR', payload: { error: 'No tab context' } });
        return true;
      }
      handleLiteralStream(message.payload.text, message.payload.title, tabId, sendResponse);
      return true;
    }

    // RESET_PAGE: relay to the active tab
    if (message.type === 'RESET_PAGE') {
      relayToActiveTab(message)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
  },
);

// ---------------------------------------------------------------------------
// Cache sweep alarm
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'ni_cache_sweep') {
    sweepExpiredEntries();
  }
});

// Register alarm on service worker activation
chrome.runtime.onInstalled.addListener(() => {
  registerSweepAlarm();
});

// Also register on startup (service workers can be restarted)
registerSweepAlarm();

// ---------------------------------------------------------------------------
// In-flight dedup — prevents duplicate concurrent requests per tab
// ---------------------------------------------------------------------------

const activeTLDRTabs    = new Set<number>();
const activeLiteralTabs = new Set<number>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Forward a message to whichever tab is currently focused in the active window.
 * Returns `{ ok: false }` if no active tab is found (e.g. a new tab page).
 */
async function relayToActiveTab(message: MessageType): Promise<{ ok: boolean }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false };
  await chrome.tabs.sendMessage(tab.id, message);
  return { ok: true };
}

/**
 * Orchestrate the ADHD TL;DR summary for a single tab.
 * Checks the cache first, then calls Gemini and streams the result back
 * as TLDR_STREAM_CHUNK messages followed by TLDR_STREAM_DONE.
 * Deduplicates concurrent requests from the same tab via activeTLDRTabs.
 */
async function handleTLDRStream(
  text: string,
  title: string,
  tabId: number,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  // In-flight dedup: ignore if this tab already has an active TLDR request
  if (activeTLDRTabs.has(tabId)) {
    sendResponse({ ok: true });
    return;
  }
  activeTLDRTabs.add(tabId);

  try {
    const settings = await getSettings();
    const apiKey = resolveApiKey(settings.apiKey ?? '');

    // Acknowledge the request immediately so the content script knows streaming has started
    sendResponse({ ok: true });

    // Cache check — keyed by title + text content (profile = 'tldr')
    const cacheInput = `${title}\n\n${text}`;
    const cached = await getCached(cacheInput, 'tldr');
    if (cached) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TLDR_STREAM_CHUNK',
        payload: { chunk: cached },
      }).catch(() => {});
      chrome.tabs.sendMessage(tabId, { type: 'TLDR_STREAM_DONE' }).catch(() => {});
      return;
    }

    // Stream chunks to the content script tab; accumulate for caching
    const fullText = await streamTLDRSummary(text, title, apiKey, (chunk: string) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'TLDR_STREAM_CHUNK',
        payload: { chunk },
      }).catch(() => { /* tab may have navigated away */ });
    });

    // Store result in cache for future visits to the same page
    if (fullText) {
      await setCached(cacheInput, 'tldr', fullText);
    }

    // Signal completion
    chrome.tabs.sendMessage(tabId, { type: 'TLDR_STREAM_DONE' }).catch(() => {});
  } catch (err) {
    console.error('[NI] TLDR stream error:', err);
    chrome.tabs.sendMessage(tabId, {
      type: 'TLDR_ERROR',
      payload: { error: err instanceof Error ? err.message : 'Unknown error' },
    }).catch(() => {});
  } finally {
    activeTLDRTabs.delete(tabId);
  }
}

/**
 * Orchestrate the Autism Easy Read literal translation for a single tab.
 * Mirrors handleTLDRStream but uses a different prompt and cache namespace.
 */
async function handleLiteralStream(
  text: string,
  title: string,
  tabId: number,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  if (activeLiteralTabs.has(tabId)) {
    sendResponse({ ok: true });
    return;
  }
  activeLiteralTabs.add(tabId);

  try {
    const settings = await getSettings();
    const apiKey = resolveApiKey(settings.apiKey ?? '');

    sendResponse({ ok: true });

    // Cache check — keyed by title + text (profile = 'autism')
    const cacheInput = `literal:${title}\n\n${text}`;
    const cached = await getCached(cacheInput, 'autism');
    if (cached) {
      chrome.tabs.sendMessage(tabId, {
        type: 'LITERAL_STREAM_CHUNK',
        payload: { chunk: cached },
      }).catch(() => {});
      chrome.tabs.sendMessage(tabId, { type: 'LITERAL_STREAM_DONE' }).catch(() => {});
      return;
    }

    const fullText = await streamLiteralTranslation(text, title, apiKey, (chunk: string) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'LITERAL_STREAM_CHUNK',
        payload: { chunk },
      }).catch(() => { /* tab may have navigated away */ });
    });

    if (fullText) {
      await setCached(cacheInput, 'autism', fullText);
    }

    chrome.tabs.sendMessage(tabId, { type: 'LITERAL_STREAM_DONE' }).catch(() => {});
  } catch (err) {
    console.error('[NI] Literal stream error:', err);
    chrome.tabs.sendMessage(tabId, {
      type: 'LITERAL_ERROR',
      payload: { error: err instanceof Error ? err.message : 'Unknown error' },
    }).catch(() => {});
  } finally {
    activeLiteralTabs.delete(tabId);
  }
}

export {};
