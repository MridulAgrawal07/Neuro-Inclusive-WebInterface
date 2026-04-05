/**
 * Dyslexia Mode enhancements:
 *   1. CSS de-crowding — injects <style id="ni-dyslexia-styles"> with OpenDyslexic font,
 *      wider letter/word spacing, and increased line-height across all text elements.
 *      The font itself is loaded via a <link> tag pointing to CDN Fonts (no CSP issues).
 *   2. Immersive "Read Aloud" — sentence-queue architecture:
 *      - Builds a queue of readable DOM elements (p, h1–h4, li)
 *      - Tokenizes each element's text into individual sentences
 *      - Replaces element text with sentence <span> tags before reading starts
 *      - Creates one SpeechSynthesisUtterance per sentence
 *      - onstart → applies .active-sentence-highlight to that sentence span + auto-scrolls
 *      - onend   → removes highlight, advances to next sentence in queue
 *      - Restores original element innerHTML when reading stops or finishes
 *      - Bigger, bolder fixed button (🔊 Read Aloud / ⏹️ Stop Reading)
 *      - Siri-style animated sound wave embedded inside the button while active
 *      - Natural voice selection (Google / Premium / Natural voices preferred)
 *      - Module-level utterance reference prevents garbage collection on scroll
 *
 * Public API:
 *   injectDyslexiaStyles()         — inject font link + style tag
 *   removeDyslexiaStyles()         — remove both
 *   injectReadAloudButton(getText)  — inject the Read Aloud button (getText unused; kept for API compat)
 *   removeReadAloudButton()         — remove button, stop audio, clean up
 */

const DYSLEXIA_STYLE_ID = 'ni-dyslexia-styles';
const DYSLEXIA_FONT_ID  = 'ni-dyslexia-font';
const READ_ALOUD_BTN_ID = 'ni-read-aloud-btn';
const READ_ALOUD_CSS_ID = 'ni-read-aloud-styles';

// ---------------------------------------------------------------------------
// Dyslexia CSS injection
// ---------------------------------------------------------------------------

export function injectDyslexiaStyles(): void {
  if (!document.getElementById(DYSLEXIA_FONT_ID)) {
    const fontLink = document.createElement('link');
    fontLink.id   = DYSLEXIA_FONT_ID;
    fontLink.rel  = 'stylesheet';
    fontLink.href = 'https://fonts.cdnfonts.com/css/opendyslexic';
    document.head.appendChild(fontLink);
  }
  if (!document.getElementById(DYSLEXIA_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = DYSLEXIA_STYLE_ID;
    style.textContent = DYSLEXIA_CSS;
    document.head.appendChild(style);
  }
}

export function removeDyslexiaStyles(): void {
  document.getElementById(DYSLEXIA_FONT_ID)?.remove();
  document.getElementById(DYSLEXIA_STYLE_ID)?.remove();
}

const DYSLEXIA_CSS = `
body, p, h1, h2, h3, h4, h5, h6, a, li, span {
  font-family: 'OpenDyslexic', sans-serif !important;
  letter-spacing: 0.1em !important;
  word-spacing: 0.2em !important;
  line-height: 1.6 !important;
}
`.trim();

// ---------------------------------------------------------------------------
// Module-level state — kept at module scope so the utterance is never
// garbage-collected mid-read, even when the user scrolls far from the text.
// ---------------------------------------------------------------------------

type SpeechState = 'idle' | 'speaking';

/** A processed DOM element whose innerHTML was replaced with sentence spans. */
interface ProcessedElement {
  el: HTMLElement;
  originalHTML: string;
}

/** A single sentence entry in the flat read-aloud queue. */
interface SentenceEntry {
  spanEl: HTMLSpanElement;
  text: string;
}

let _utterance:        SpeechSynthesisUtterance | null = null;
let _speechState:      SpeechState = 'idle';
let _bestVoice:        SpeechSynthesisVoice | null = null;
let _currentBtn:       HTMLButtonElement | null = null;

/** Flat list of all sentence entries across all queued elements. */
let _sentenceQueue:    SentenceEntry[] = [];
/** Index into _sentenceQueue for the currently-speaking sentence. */
let _sentIdx:          number = -1;
/** Elements whose innerHTML was replaced with sentence spans; restored on stop/finish. */
let _processedElements: ProcessedElement[] = [];

// ---------------------------------------------------------------------------
// Natural voice selection — runs eagerly and re-runs when voices load async
// ---------------------------------------------------------------------------

/**
 * Select the highest-quality English voice available in the browser.
 * Priority: Google US English > voices with "Natural" in name > "Premium" >
 * any English voice without "compact" > any English voice.
 */
function pickBestVoice(): void {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  _bestVoice =
    voices.find(v => v.name === 'Google US English') ??
    voices.find(v => v.name.includes('Natural'))     ??
    voices.find(v => v.name.includes('Premium'))     ??
    voices.find(v => v.lang.startsWith('en-') && !v.name.toLowerCase().includes('compact')) ??
    voices.find(v => v.lang.startsWith('en'))        ??
    null;
}

// Chrome loads voices asynchronously; try immediately then listen for the event
pickBestVoice();
if (!_bestVoice) {
  window.speechSynthesis.onvoiceschanged = () => {
    pickBestVoice();
    // Unregister after first successful load to avoid repeated callbacks
    if (_bestVoice) window.speechSynthesis.onvoiceschanged = null;
  };
}

// ---------------------------------------------------------------------------
// Sentence utilities
// ---------------------------------------------------------------------------

/**
 * Split a plain-text string into individual sentences.
 * Uses lookbehind on sentence-ending punctuation (.!?) followed by whitespace.
 * Falls back to the whole string as a single sentence if no splits are found.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.map(s => s.trim()).filter(s => s.length > 2);
}

/**
 * Escape a plain-text string for safe insertion into innerHTML.
 * Only escapes the four characters that would break HTML parsing.
 */
function escapeForDom(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Queue builder — collects readable DOM elements in document order
// ---------------------------------------------------------------------------

/**
 * Collect readable DOM elements in document order for the read-aloud queue.
 * Tries increasingly broad selectors, stopping at the first set with ≥ 3 items.
 * Filters out elements shorter than 20 characters and aria-hidden regions.
 */
function buildQueue(): HTMLElement[] {
  const selectors = [
    'article p, article h1, article h2, article h3, article h4, article li',
    'main p, main h1, main h2, main h3, main li',
    '[role="main"] p, [role="main"] h1, [role="main"] h2, [role="main"] li',
    '.content p, .post-content p, .entry-content p, #content p',
  ];

  let elements: HTMLElement[] = [];
  for (const sel of selectors) {
    elements = Array.from(document.querySelectorAll<HTMLElement>(sel));
    if (elements.length >= 3) break;
  }
  if (elements.length < 3) {
    elements = Array.from(document.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, li'));
  }

  return elements.filter(el => {
    const text = el.textContent?.trim() ?? '';
    return text.length >= 20 && !el.closest('[aria-hidden="true"]');
  });
}

/**
 * Build the flat sentence queue by tokenizing each readable element into sentences,
 * replacing its innerHTML with one <span class="ni-sentence-span"> per sentence,
 * and collecting a reference to each span for highlight control.
 * The original innerHTML of each element is saved in _processedElements for restoration.
 */
function buildSentenceQueue(): SentenceEntry[] {
  _processedElements = [];
  const elements = buildQueue();
  const allSentences: SentenceEntry[] = [];

  for (const el of elements) {
    const text = el.textContent?.trim() ?? '';
    if (!text) continue;

    const sentences = splitSentences(text);
    if (sentences.length === 0) continue;

    const originalHTML = el.innerHTML;
    el.innerHTML = sentences
      .map((s, i) => `<span class="ni-sentence-span" data-si="${i}">${escapeForDom(s)}</span>`)
      .join(' ');

    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>('.ni-sentence-span'));
    for (let i = 0; i < spans.length; i++) {
      allSentences.push({ spanEl: spans[i], text: sentences[i] });
    }

    _processedElements.push({ el, originalHTML });
  }

  return allSentences;
}

// ---------------------------------------------------------------------------
// DOM restoration and highlight cleanup
// ---------------------------------------------------------------------------

/**
 * Restore the innerHTML of every element that was modified during sentence
 * span injection, and clear the _processedElements registry.
 */
function restoreProcessedElements(): void {
  for (const { el, originalHTML } of _processedElements) {
    el.innerHTML = originalHTML;
  }
  _processedElements = [];
}

/**
 * Remove the .active-sentence-highlight class from all sentence spans
 * on the page (called on stop, finish, and error).
 */
function clearActiveSentenceHighlight(): void {
  document.querySelectorAll('.active-sentence-highlight').forEach(el => {
    el.classList.remove('active-sentence-highlight');
  });
}

// ---------------------------------------------------------------------------
// Injected CSS — sentence highlight + in-button sound wave + drop-in animation
// ---------------------------------------------------------------------------

const READ_ALOUD_CSS = `
/* Active sentence highlight — applied to individual sentence <span> elements */
.active-sentence-highlight {
  background-color: rgba(255, 238, 80, 0.45) !important;
  border-radius: 3px !important;
  padding: 1px 2px;
  transition: background-color 0.2s ease;
}

/* Sound wave — lives inside the button, shown only while speaking */
.ni-sound-wave {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 18px;
  flex-shrink: 0;
  margin-right: 8px;
  vertical-align: middle;
}

/* Individual bars */
.ni-sound-wave span {
  display: block;
  width: 4px;
  background-color: #ffffff;
  border-radius: 99px;
  animation: ni-ripple 1.2s ease-in-out infinite;
  transform-origin: bottom;
}

/* Staggered delays + varying heights for a realistic, Siri-style waveform */
.ni-sound-wave span:nth-child(1) { animation-delay:  0.0s; height: 60%;  }
.ni-sound-wave span:nth-child(2) { animation-delay: -0.2s; height: 100%; }
.ni-sound-wave span:nth-child(3) { animation-delay: -0.4s; height: 80%;  }
.ni-sound-wave span:nth-child(4) { animation-delay: -0.6s; height: 100%; }
.ni-sound-wave span:nth-child(5) { animation-delay: -0.8s; height: 70%;  }
.ni-sound-wave span:nth-child(6) { animation-delay: -1.0s; height: 90%;  }
.ni-sound-wave span:nth-child(7) { animation-delay: -1.2s; height: 50%;  }

@keyframes ni-ripple {
  0%, 100% { transform: scaleY(0.2); }
  50%       { transform: scaleY(1);   }
}

/* Button entrance animation */
@keyframes ni-drop-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0);     }
}
`.trim();

// ---------------------------------------------------------------------------
// Read Aloud button — public API
// ---------------------------------------------------------------------------

export function injectReadAloudButton(_getText: () => string): void {
  if (document.getElementById(READ_ALOUD_BTN_ID)) return;

  if (!document.getElementById(READ_ALOUD_CSS_ID)) {
    const s = document.createElement('style');
    s.id = READ_ALOUD_CSS_ID;
    s.textContent = READ_ALOUD_CSS;
    document.head.appendChild(s);
  }

  const btn = document.createElement('button');
  btn.id = READ_ALOUD_BTN_ID;
  applyButtonStyles(btn);
  setButtonIdle(btn);

  btn.addEventListener('click', () => {
    if (_speechState === 'idle') {
      startReading(btn);
    } else {
      stopReading();
    }
  });

  _currentBtn = btn;
  document.body.appendChild(btn);
}

export function removeReadAloudButton(): void {
  stopReading();
  document.getElementById(READ_ALOUD_BTN_ID)?.remove();
  document.getElementById(READ_ALOUD_CSS_ID)?.remove();
  _currentBtn = null;
}

// ---------------------------------------------------------------------------
// Reading lifecycle — sentence-queue engine
// ---------------------------------------------------------------------------

/**
 * Start reading from the first sentence of the queue.
 * Builds the sentence queue (injecting sentence spans into DOM elements),
 * cancels any in-progress speech, and begins queued utterance playback.
 */
function startReading(btn: HTMLButtonElement): void {
  _sentenceQueue = buildSentenceQueue();
  if (!_sentenceQueue.length) return;

  _sentIdx     = 0;
  _speechState = 'speaking';
  setButtonSpeaking(btn);

  window.speechSynthesis.cancel();
  speakSentence();
}

/**
 * Recursive sentence processor.
 * Creates one utterance for the sentence at _sentIdx, applies the active highlight
 * on start, removes it on end, then advances to the next sentence.
 */
function speakSentence(): void {
  if (_speechState !== 'speaking' || _sentIdx >= _sentenceQueue.length) {
    finishReading();
    return;
  }

  const { spanEl, text } = _sentenceQueue[_sentIdx];

  if (!text) {
    _sentIdx++;
    speakSentence();
    return;
  }

  if (!_bestVoice) pickBestVoice();

  _utterance       = new SpeechSynthesisUtterance(text);
  _utterance.rate  = 0.95;
  _utterance.pitch = 1;
  if (_bestVoice) _utterance.voice = _bestVoice;

  _utterance.onstart = () => {
    clearActiveSentenceHighlight();
    spanEl.classList.add('active-sentence-highlight');
    spanEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  _utterance.onend = () => {
    spanEl.classList.remove('active-sentence-highlight');
    _sentIdx++;
    speakSentence();
  };

  _utterance.onerror = () => {
    spanEl.classList.remove('active-sentence-highlight');
    _sentIdx++;
    speakSentence();
  };

  window.speechSynthesis.speak(_utterance);
}

/** Clean up all state when the sentence queue is fully exhausted. */
function finishReading(): void {
  _utterance     = null;
  _speechState   = 'idle';
  _sentenceQueue = [];
  _sentIdx       = -1;
  clearActiveSentenceHighlight();
  restoreProcessedElements();
  if (_currentBtn) setButtonIdle(_currentBtn);
}

/** Cancel speech synthesis and immediately reset all reading state. */
function stopReading(): void {
  window.speechSynthesis.cancel();
  _utterance     = null;
  _speechState   = 'idle';
  _sentenceQueue = [];
  _sentIdx       = -1;
  clearActiveSentenceHighlight();
  restoreProcessedElements();
  if (_currentBtn) setButtonIdle(_currentBtn);
}

// ---------------------------------------------------------------------------
// Button styling
// ---------------------------------------------------------------------------

const WAVE_HTML =
  '<span class="ni-sound-wave">' +
  '<span></span><span></span><span></span><span></span><span></span><span></span><span></span>' +
  '</span>';

/** Apply the fixed-position dark-pill styles and hover effects to the Read Aloud button. */
function applyButtonStyles(btn: HTMLButtonElement): void {
  Object.assign(btn.style, {
    position:       'fixed',
    top:            '20px',
    left:           '50%',
    transform:      'translateX(-50%)',
    zIndex:         '999999',
    display:        'inline-flex',
    alignItems:     'center',
    padding:        '12px 28px',
    background:     '#1F2937',
    color:          '#FFFFFF',
    fontSize:       '16px',
    fontWeight:     'bold',
    fontFamily:     "'Nunito', system-ui, -apple-system, sans-serif",
    letterSpacing:  '0.01em',
    lineHeight:     '1',
    border:         '1px solid rgba(255,255,255,0.15)',
    borderRadius:   '50px',
    cursor:         'pointer',
    boxShadow:      '0 12px 32px -6px rgba(0,0,0,0.4), 0 6px 12px -6px rgba(0,0,0,0.2)',
    animation:      'ni-drop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
    whiteSpace:     'nowrap',
    transition:     'background 0.2s ease, box-shadow 0.2s ease',
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.background = _speechState === 'speaking' ? '#6D28D9' : '#374151';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = _speechState === 'speaking' ? '#7C3AED' : '#1F2937';
  });
}

/** Render the button in its idle state (dark background, 🔊 icon). */
function setButtonIdle(btn: HTMLButtonElement): void {
  btn.innerHTML        = '🔊 Read Aloud';
  btn.style.background = '#1F2937';
  btn.style.boxShadow  = '0 12px 32px -6px rgba(0,0,0,0.4), 0 6px 12px -6px rgba(0,0,0,0.2)';
}

/** Render the button in its speaking state (purple background, Siri wave + "Stop Reading"). */
function setButtonSpeaking(btn: HTMLButtonElement): void {
  btn.innerHTML        = WAVE_HTML + ' Stop Reading';
  btn.style.background = '#7C3AED';
  btn.style.boxShadow  = '0 12px 32px -6px rgba(124,58,237,0.5), 0 6px 12px -6px rgba(124,58,237,0.3)';
}
