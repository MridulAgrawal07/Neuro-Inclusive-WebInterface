/**
 * Content script entry point.
 *
 * Pipeline:
 *   1. Load settings from chrome.storage.sync
 *   2. Inject base styles
 *   3. Apply visual profile (font)
 *   4. Pre-parse page with Readability so ADHD Reader Mode is instant
 *
 * Message handlers:
 *   APPLY_PROFILE     — re-apply font/colors for active profile
 *   RESET_PAGE        — remove all transforms and restore page
 *   ENABLE_ADHD_MODE  — open floating Reader Mode modal (instant, no API)
 *   DISABLE_ADHD_MODE — close the modal
 *   TLDR_STREAM_CHUNK — append AI chunk into the open modal
 *   TLDR_STREAM_DONE  — finalize the streaming summary
 *   TLDR_ERROR        — show error inside the modal
 */

/// <reference types="chrome" />

import { applyVisualProfile, resetVisualProfile } from './agents/visual-adjuster';
import { injectBaseStyles, resetStyles } from './mutator/style-injector';
import { extractPageText, extractPageArticle } from './tldr/extract-text';
import { injectDyslexiaStyles, removeDyslexiaStyles, injectReadAloudButton, removeReadAloudButton } from './agents/dyslexia-mode';
import { enableAutismShield, disableAutismShield } from './agents/autism-mode';
import type { PageArticle } from './tldr/extract-text';
import { showReaderMode, removeTLDRModal } from './tldr/modal';
import type { ReaderModeController } from './tldr/modal';
import { computeCognitiveScore } from '@/utils/cognitiveScoring.js';
import { getSettings } from '@/shared/storage';
import { PROFILE_DEFAULTS } from '@/shared/constants';
import type { MessageType, UserSettings } from '@/shared/types';

// ---------------------------------------------------------------------------
// Cross-origin iframe guard
// ---------------------------------------------------------------------------

/**
 * Detect whether the script is running inside a cross-origin iframe.
 * The content script should exit immediately in that case to avoid
 * triggering a SecurityError when accessing window.top properties.
 */
function isInCrossOriginIframe(): boolean {
  if (window === window.top) return false;
  try {
    void window.top?.location.href;
    return false;
  } catch {
    return true;
  }
}

if (isInCrossOriginIframe()) {
  throw new Error('[NI] Skipping cross-origin iframe.');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let pipelineRan = false;
let currentSettings: UserSettings | null = null;

// Pre-parsed article — populated on page load so Reader Mode is instant
let cachedArticle: PageArticle | null = null;

// Controller for the open ADHD Reader Mode modal (null when modal is closed)
let readerModeController: ReaderModeController | null = null;

// Plain text extracted from the sanitized article shown in the Autism modal
// Used as the input to the Easy Read AI call (cleaner than raw page body)
let cachedAutismText: string | null = null;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Main initialization pipeline — runs once per page load (idempotent).
 * Loads settings, injects base styles, applies visual profile, and
 * pre-parses the article so Reader Mode can open instantly on request.
 */
async function runPipeline(): Promise<void> {
  if (pipelineRan) return;
  pipelineRan = true;

  try {
    currentSettings = await getSettings();
    if (!currentSettings.autoRun) return;

    injectBaseStyles(document);
    applyVisualProfile(currentSettings);

    // Pre-parse Readability so Reader Mode is instant when requested
    cachedArticle = extractPageArticle();
  } catch (err) {
    console.error('[NI] Pipeline error:', err);
  }
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: MessageType, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  switch (message.type) {
    case 'APPLY_PROFILE': {
      currentSettings = message.payload;
      injectBaseStyles(document);
      applyVisualProfile(currentSettings);
      sendResponse({ ok: true });
      break;
    }

    case 'RESET_PAGE': {
      removeAllPills();
      resetStyles();
      resetVisualProfile();
      removeTLDRModal();
      readerModeController = null;
      pipelineRan = false;
      currentSettings = null;
      cachedArticle = null;
      cachedAutismText = null;
      sendResponse({ ok: true });
      break;
    }

    case 'ENABLE_ADHD_MODE': {
      showAdhdPill();
      sendResponse({ ok: true });
      break;
    }

    case 'DISABLE_ADHD_MODE': {
      removeAdhdPill();
      removeTLDRModal();
      readerModeController = null;
      sendResponse({ ok: true });
      break;
    }

    case 'TLDR_STREAM_CHUNK': {
      readerModeController?.appendChunk(message.payload.chunk);
      sendResponse({ ok: true });
      break;
    }

    case 'TLDR_STREAM_DONE': {
      readerModeController?.finalize();
      sendResponse({ ok: true });
      break;
    }

    case 'TLDR_ERROR': {
      readerModeController?.showError(message.payload.error);
      sendResponse({ ok: true });
      break;
    }

    case 'ENABLE_AUTISM_MODE': {
      showAutismPill();
      sendResponse({ ok: true });
      break;
    }

    case 'DISABLE_AUTISM_MODE': {
      removeAutismPill();
      resetStyles();
      resetVisualProfile();
      disableAutismShield();
      removeTLDRModal();
      readerModeController = null;
      cachedAutismText = null;
      sendResponse({ ok: true });
      break;
    }

    case 'LITERAL_STREAM_CHUNK': {
      readerModeController?.appendChunk(message.payload.chunk);
      sendResponse({ ok: true });
      break;
    }

    case 'LITERAL_STREAM_DONE': {
      readerModeController?.finalize();
      sendResponse({ ok: true });
      break;
    }

    case 'LITERAL_ERROR': {
      readerModeController?.showError(message.payload.error);
      sendResponse({ ok: true });
      break;
    }

    case 'ENABLE_DYSLEXIA_MODE': {
      injectBaseStyles(document);
      applyVisualProfile(PROFILE_DEFAULTS['dyslexia']);
      currentSettings = PROFILE_DEFAULTS['dyslexia'];
      injectDyslexiaStyles();
      injectReadAloudButton(() =>
        (cachedArticle?.textContent ?? extractPageText()).slice(0, 50_000),
      );
      sendResponse({ ok: true });
      break;
    }

    case 'DISABLE_DYSLEXIA_MODE': {
      resetStyles();
      resetVisualProfile();
      removeDyslexiaStyles();
      removeReadAloudButton();
      sendResponse({ ok: true });
      break;
    }

    case 'GET_COGNITIVE_SCORE': {
      // Run the O(n) DFS traversal and return the score synchronously.
      const score = computeCognitiveScore();
      sendResponse({ score });
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Post-processing sanitization — strips junk that slips through Readability
// ---------------------------------------------------------------------------

const JUNK_PHRASES = ['ad feedback', 'advertisement', 'share this:', 'read more:'];
const SHORT_NAV_PHRASES = ['live updates', 'sign in', 'log in', 'subscribe', 'newsletter'];

/**
 * Remove residual noise elements that slip through Readability's parser.
 * Operates on a detached DOM fragment so it never touches the live page.
 *
 * Cleans:
 *   1. Block elements whose full text matches known junk phrases
 *   2. Short navigational anchors and their now-empty parent lists
 *   3. Figures with no image or negligible captions
 *   4. Elements that are completely empty after earlier passes
 */
function sanitizeArticleHTML(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // 1. Remove block elements whose full text matches a known junk phrase
  tmp.querySelectorAll('p, span, div, li').forEach((el) => {
    const text = el.textContent?.trim().toLowerCase() ?? '';
    if (JUNK_PHRASES.some((phrase) => text === phrase || text.startsWith(phrase))) {
      el.remove();
    }
  });

  // 2. Remove short navigational anchors and their orphaned lists
  tmp.querySelectorAll('a, li').forEach((el) => {
    const text = el.textContent?.trim().toLowerCase() ?? '';
    if (text.length < 30 && SHORT_NAV_PHRASES.some((phrase) => text.includes(phrase))) {
      const parent = el.parentElement;
      el.remove();
      if (parent && (parent.tagName === 'UL' || parent.tagName === 'OL')) {
        if (!parent.querySelector('li')) parent.remove();
      }
    }
  });

  // 3. Remove figures that have no image, or have only a very short/empty caption
  tmp.querySelectorAll('figure').forEach((fig) => {
    const hasImage = !!fig.querySelector('img');
    const captionText = fig.querySelector('figcaption')?.textContent?.trim() ?? '';
    if (!hasImage || (!hasImage && captionText.length < 5)) {
      fig.remove();
    }
  });

  // 4. Prune elements that are now completely empty (no text, no embedded media)
  tmp.querySelectorAll('p, div, span').forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector('img, video, iframe')) {
      el.remove();
    }
  });

  return tmp.innerHTML;
}

// ---------------------------------------------------------------------------
// ADHD Reader Mode — instant open, with inline AI summarize escalation
// ---------------------------------------------------------------------------

/**
 * Open the ADHD Reader Mode modal with the pre-parsed article.
 * Falls back to a fresh Readability parse if the pipeline has not yet run.
 */
function handleEnableADHD(): void {
  // Use cached article; fall back to a fresh parse if pipeline didn't run yet
  const article = cachedArticle ?? extractPageArticle();
  if (!article?.content) {
    console.warn('[NI] Could not extract readable content from this page.');
    return;
  }

  const cleanHTML = sanitizeArticleHTML(article.content);
  readerModeController = showReaderMode(cleanHTML, article.title, handleSummarize, {
    loadingText: 'Simplifying page...',
    profile: 'adhd',
  });
}

// ---------------------------------------------------------------------------
// Autism Reader Mode — instant open with "Translate to Literal" AI escalation
// ---------------------------------------------------------------------------

/**
 * Open the Autism Reader Mode modal.
 * Also extracts plain text from the sanitized article into cachedAutismText
 * so the Easy Read AI call uses only article content, not raw page noise.
 */
function handleEnableAutism(): void {
  const article = cachedArticle ?? extractPageArticle();
  if (!article?.content) {
    console.warn('[NI] Could not extract readable content from this page.');
    return;
  }

  const cleanHTML = sanitizeArticleHTML(article.content);

  // Extract plain text from the sanitized HTML — this is what gets sent to the AI,
  // so it only contains the core article content (no noise, no nav, no ads)
  const tmpDiv = document.createElement('div');
  tmpDiv.innerHTML = cleanHTML;
  cachedAutismText = tmpDiv.textContent ?? null;

  readerModeController = showReaderMode(cleanHTML, article.title, handleLiteralTranslate, {
    badge:         'Autism Mode',
    btnLabel:      'Easy Read',
    btnBackground: '#0F766E',
    loadingText:   'AI is reading...',
    outputFormat:  'paragraphs',
    profile:       'autism',
  });
}

// ---------------------------------------------------------------------------
// AI Literal Translate — triggered by the "Translate to Literal" button
// ---------------------------------------------------------------------------

/**
 * Trigger the Autism Easy Read AI translation.
 * Sends the article text to the background service worker for Gemini processing.
 * The response arrives as a series of LITERAL_STREAM_CHUNK messages.
 */
async function handleLiteralTranslate(): Promise<void> {
  if (!readerModeController) return;

  readerModeController.showAILoading();

  // Prefer text extracted from the sanitized modal article (cleanest source),
  // then fall back to Readability's textContent, then raw page text
  const text = (cachedAutismText ?? cachedArticle?.textContent ?? extractPageText()).slice(0, 15_000);

  if (!text) {
    readerModeController.showError('Could not extract enough text from this page.');
    return;
  }

  const title = cachedArticle?.title || document.title || 'Untitled page';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LITERAL_TRANSLATE',
      payload: { text, title },
    });

    if (response?.type === 'LITERAL_ERROR') {
      readerModeController?.showError(response.payload.error);
    }
  } catch (err) {
    console.error('[NI] Literal translate request failed:', err);
    readerModeController?.showError(err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// AI Summarize — triggered by the "Summarize with AI" button inside the modal
// ---------------------------------------------------------------------------

/**
 * Trigger the ADHD TL;DR AI summarization.
 * Sends the article text to the background service worker for Gemini processing.
 * The response arrives as a series of TLDR_STREAM_CHUNK messages.
 */
async function handleSummarize(): Promise<void> {
  if (!readerModeController) return;

  readerModeController.showAILoading();

  const text = cachedArticle?.textContent
    ? cachedArticle.textContent.slice(0, 15_000)
    : extractPageText();

  if (!text) {
    readerModeController.showError('Could not extract enough text from this page.');
    return;
  }

  const title = cachedArticle?.title || document.title || 'Untitled page';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TLDR_SUMMARIZE',
      payload: { text, title },
    });

    if (response?.type === 'TLDR_ERROR') {
      readerModeController?.showError(response.payload.error);
    }
  } catch (err) {
    console.error('[NI] TLDR request failed:', err);
    readerModeController?.showError(err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Activation pills — contextual modes require explicit per-tab opt-in
// ---------------------------------------------------------------------------

const PILL_CONTAINER_ID = 'ni-activation-container';
const TOGGLE_STORAGE_KEY = 'ni-toggle-state';

/**
 * Return the shared pill container element, creating it if it does not exist.
 * The container is a fixed row at the top-center of the viewport that holds
 * the ADHD and Autism activation pills side-by-side.
 */
function getPillContainer(): HTMLDivElement {
  const existing = document.getElementById(PILL_CONTAINER_ID) as HTMLDivElement | null;
  if (existing) return existing;
  const container = document.createElement('div');
  container.id = PILL_CONTAINER_ID;
  container.style.cssText =
    'position:fixed;top:40px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:10px;z-index:2147483646;' +
    'font-family:system-ui,-apple-system,sans-serif;';
  document.body.appendChild(container);
  return container;
}

/** Inject the Nunito font once — idempotent, skips if already present. */
function ensureNunitoFont(): void {
  if (document.getElementById('ni-nunito-font')) return;
  const link = document.createElement('link');
  link.id = 'ni-nunito-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap';
  document.head.appendChild(link);
}

/** Inject the drop-in keyframe animation used by all pills — idempotent. */
function ensurePillAnimation(): void {
  if (document.getElementById('ni-pill-anim')) return;
  const s = document.createElement('style');
  s.id = 'ni-pill-anim';
  s.textContent =
    '@keyframes ni-pill-drop{from{opacity:0;transform:translateY(-16px)}' +
    'to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(s);
}

/**
 * Create a styled pill button with hover feedback and a drop-in entrance animation.
 * @param label   - Visible button text.
 * @param bgColor - CSS color value for the button background.
 * @param onClick - Handler invoked when the user clicks the pill.
 */
function createPillButton(label: string, bgColor: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText =
    `background:${bgColor};color:#fff;` +
    'font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:600;' +
    'padding:8px 18px;border-radius:999px;border:none;cursor:pointer;display:inline-block;' +
    'box-shadow:0 4px 14px rgba(0,0,0,0.3);white-space:nowrap;' +
    'animation:ni-pill-drop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;';
  btn.addEventListener('mouseenter', () => {
    btn.style.opacity = '0.85';
    btn.style.transform = 'scale(1.05)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  });
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Show the ADHD "Refine Page" activation pill at the top of the page.
 * Clicking the pill dismisses it and opens the Reader Mode modal.
 */
function showAdhdPill(): void {
  if (document.getElementById('ni-adhd-pill')) return;
  ensurePillAnimation();
  ensureNunitoFont();
  const btn = createPillButton('Refine Page', '#8B5CF6', () => {
    removeAdhdPill();
    handleEnableADHD();
  });
  btn.id = 'ni-adhd-pill';
  btn.style.cssText =
    'background:#8B5CF6;color:#fff;' +
    "font-family:'Nunito',system-ui,-apple-system,sans-serif;font-size:18px;font-weight:800;" +
    'letter-spacing:0.02em;padding:16px 36px;border-radius:999px;cursor:pointer;display:inline-block;' +
    'border:2px solid rgba(255,255,255,0.2);white-space:nowrap;' +
    'box-shadow:0 10px 30px rgba(139,92,246,0.4);' +
    'animation:ni-pill-drop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;';
  getPillContainer().appendChild(btn);
}

/**
 * Show the Autism "Refine Page" activation pill at the top of the page.
 * Clicking applies the autism visual profile, enables the sensory shield,
 * and opens the Reader Mode modal.
 */
function showAutismPill(): void {
  if (document.getElementById('ni-autism-pill')) return;
  ensurePillAnimation();
  ensureNunitoFont();
  const btn = createPillButton('Refine Page', '#0F766E', () => {
    removeAutismPill();
    injectBaseStyles(document);
    applyVisualProfile(PROFILE_DEFAULTS['autism']);
    currentSettings = PROFILE_DEFAULTS['autism'];
    enableAutismShield();
    handleEnableAutism();
  });
  btn.id = 'ni-autism-pill';
  btn.style.cssText =
    'background:#0F766E;color:#fff;' +
    "font-family:'Nunito',system-ui,-apple-system,sans-serif;font-size:18px;font-weight:800;" +
    'letter-spacing:0.02em;padding:16px 36px;border-radius:999px;cursor:pointer;display:inline-block;' +
    'border:2px solid rgba(255,255,255,0.2);white-space:nowrap;' +
    'box-shadow:0 10px 30px rgba(15,118,110,0.4);' +
    'animation:ni-pill-drop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;';
  getPillContainer().appendChild(btn);
}

/** Remove the ADHD pill and clean up the container if it is now empty. */
function removeAdhdPill(): void {
  document.getElementById('ni-adhd-pill')?.remove();
  const container = document.getElementById(PILL_CONTAINER_ID);
  if (container && !container.hasChildNodes()) container.remove();
}

/** Remove the Autism pill and clean up the container if it is now empty. */
function removeAutismPill(): void {
  document.getElementById('ni-autism-pill')?.remove();
  const container = document.getElementById(PILL_CONTAINER_ID);
  if (container && !container.hasChildNodes()) container.remove();
}

/** Remove the entire pill container along with any pills currently displayed. */
function removeAllPills(): void {
  document.getElementById(PILL_CONTAINER_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Boot-time contextual mode initialization
// ---------------------------------------------------------------------------

/**
 * Re-apply any modes that were active before the page was (re)loaded.
 * Reads the persisted toggle state from chrome.storage.local and restores
 * pills and styles so the UX is consistent across navigations.
 */
async function bootContextualModes(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(TOGGLE_STORAGE_KEY);
    const state = result[TOGGLE_STORAGE_KEY] as
      | { adhd?: boolean; autism?: boolean; dyslexia?: boolean }
      | undefined;
    if (!state) return;

    if (state.dyslexia) {
      injectBaseStyles(document);
      applyVisualProfile(PROFILE_DEFAULTS['dyslexia']);
      currentSettings = PROFILE_DEFAULTS['dyslexia'];
      injectDyslexiaStyles();
      injectReadAloudButton(() =>
        (cachedArticle?.textContent ?? extractPageText()).slice(0, 50_000),
      );
    }

    if (state.adhd) showAdhdPill();
    if (state.autism) showAutismPill();
  } catch {
    // storage unavailable — skip
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

runPipeline().then(() => bootContextualModes());
