/**
 * TL;DR / Focus Modal — injects a clean, immersive reading modal anchored at the
 * top of the viewport, dominating the screen from the top down.
 *
 * Uses an isolated Shadow DOM so page styles don't interfere.
 *
 * The backdrop applies backdrop-filter: blur(12px) brightness(0.7) for a true
 * Focus Modal feel. Profile-specific card themes are applied via CSS classes:
 *   - .ni-profile-adhd  — white background, high-contrast text, increased line-height
 *   - .ni-profile-autism — soft cream background, rounded edges, gentle text color
 *
 * A "Read Aloud" button is embedded in the modal header. It tokenizes the visible
 * article text into sentences (wrapped in <span class="ni-sent"> tags on injection),
 * and uses the SpeechSynthesis API to read each sentence individually — applying
 * .active-sentence-highlight to only the currently-spoken sentence.
 *
 * showReaderMode() — renders the full cleaned article with an inline AI action button.
 * Returns a ReaderModeController so the caller can transition the modal through:
 *   article → loading → streaming → done/error
 */

const HOST_ID = 'ni-tldr-modal-host';

// ---------------------------------------------------------------------------
// Shared CSS (used by all modal states)
// ---------------------------------------------------------------------------

const MODAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .ni-tldr-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(12px) brightness(0.7);
    -webkit-backdrop-filter: blur(12px) brightness(0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    animation: ni-fade-in 0.2s ease-out;
  }

  .ni-tldr-card {
    background: #fefefe;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 4px 16px rgba(0, 0, 0, 0.1);
    max-width: 960px;
    width: 70vw;
    padding: 60px;
    /* Top-anchored viewport lock — card starts at the top, horizontally centered */
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    /* Internal scroll — content grows up to 90vh (screen-dominant), then scrolls */
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: ni-slide-in 0.25s ease-out;
  }

  /* ADHD profile: clean white, high contrast, generous line-height and letter-spacing */
  .ni-tldr-card.ni-profile-adhd {
    background: #FFFFFF;
    color: #111111;
  }
  .ni-tldr-card.ni-profile-adhd .ni-reader-body {
    color: #111111;
    line-height: 2.0;
    letter-spacing: 0.02em;
  }

  /* Autism profile: soft cream, rounded edges, gentle dark-gray text */
  .ni-tldr-card.ni-profile-autism {
    background: #FAF8F5;
    color: #3A3A3A;
    border-radius: 20px;
  }
  .ni-tldr-card.ni-profile-autism .ni-reader-body {
    color: #3A3A3A;
  }
  .ni-tldr-card.ni-profile-autism .ni-easy-read-body {
    background: #F3EFE8;
    color: #3A3A3A;
  }

  .ni-tldr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .ni-tldr-title {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ni-tldr-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6366f1;
    background: #eef2ff;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .ni-tldr-close {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: #f1f5f9;
    color: #64748b;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    line-height: 1;
  }

  .ni-tldr-close:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  /* Read Aloud button embedded in modal header */
  .ni-modal-read-aloud-btn {
    padding: 5px 12px;
    border-radius: 8px;
    border: none;
    background: #f1f5f9;
    color: #334155;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .ni-modal-read-aloud-btn:hover { background: #e2e8f0; }
  .ni-modal-read-aloud-btn.speaking {
    background: #7C3AED;
    color: #ffffff;
  }
  .ni-modal-read-aloud-btn.speaking:hover { background: #6D28D9; }

  .ni-summarize-btn {
    padding: 5px 12px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(to right, #f59e0b, #f97316);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .ni-summarize-btn:hover { opacity: 0.85; }
  .ni-summarize-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Sentence highlight — applied to .ni-sent spans during read-aloud */
  .active-sentence-highlight {
    background-color: rgba(255, 238, 80, 0.5) !important;
    border-radius: 3px !important;
    padding: 1px 3px;
    transition: background-color 0.15s ease;
  }

  .ni-tldr-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .ni-tldr-item {
    font-size: 15px;
    line-height: 1.7;
    color: #334155;
    padding-left: 20px;
    position: relative;
  }

  .ni-tldr-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6366f1;
  }

  .ni-tldr-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: #6366f1;
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: ni-blink 0.6s step-end infinite;
  }

  .ni-tldr-error {
    text-align: center;
    padding: 24px 16px;
    color: #4b5563;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.7;
  }

  .ni-progress-container {
    padding: 32px 0 24px;
    text-align: center;
  }

  .ni-progress-label {
    color: #64748b;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 14px;
  }

  .ni-progress-track {
    width: 100%;
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  .ni-progress-bar {
    height: 100%;
    background: linear-gradient(to right, #6366f1, #818cf8);
    border-radius: 999px;
    transition: width 0.12s ease-out;
    will-change: width;
  }

  @keyframes ni-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ni-slide-in {
    from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  @keyframes ni-blink {
    50% { opacity: 0; }
  }

  /* Easy-read container — Autism mode paragraph output */
  .ni-easy-read-body {
    font-family: 'Inter', 'Open Sans', Tahoma, Verdana, sans-serif;
    font-size: 16px;
    font-weight: 400;
    font-style: normal;
    line-height: 1.7;
    letter-spacing: 0.02em;
    color: #2C2C2C;
    background: #F9F6F0;
    padding: 20px 24px;
    border-radius: 8px;
  }

  .ni-easy-read-body p {
    margin: 0 0 1.4em;
    font-style: normal;
    font-weight: 400;
  }

  .ni-easy-read-body p:last-child {
    margin-bottom: 0;
  }
`;

// ---------------------------------------------------------------------------
// Reader mode CSS — article body typography
// ---------------------------------------------------------------------------

const READER_CSS = `
  .ni-reader-scroll {
    overflow-y: auto;
    /* flex: 1 + min-height: 0 lets this area grow to fill the card's 85vh cap
       without needing a hard-coded pixel offset for the header height */
    flex: 1;
    min-height: 0;
    padding-right: 4px;
  }

  .ni-reader-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .ni-reader-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .ni-reader-scroll::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }

  .ni-reader-body { font-size: 16px; line-height: 1.85; color: #1e293b; }
  .ni-reader-body p  { margin: 0 0 1em; }
  .ni-reader-body h1, .ni-reader-body h2 { font-size: 1.2em; font-weight: 700; color: #0f172a; margin: 1.4em 0 0.5em; line-height: 1.3; }
  .ni-reader-body h3, .ni-reader-body h4 { font-size: 1.05em; font-weight: 600; color: #0f172a; margin: 1.2em 0 0.4em; }
  .ni-reader-body ul, .ni-reader-body ol { margin: 0 0 1em 1.4em; }
  .ni-reader-body li { margin-bottom: 0.35em; }
  .ni-reader-body a  { color: #4f46e5; text-decoration: underline; }
  .ni-reader-body blockquote { border-left: 3px solid #6366f1; margin: 1em 0; padding: 0.5em 1em; color: #475569; font-style: italic; }
  .ni-reader-body code { font-family: monospace; background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  .ni-reader-body pre  { background: #f1f5f9; padding: 1em; border-radius: 8px; overflow-x: auto; font-size: 0.85em; margin: 0 0 1em; }
  .ni-reader-body img  { max-width: 100%; border-radius: 8px; margin: 0.5em 0; }
  .ni-reader-body figure { margin: 1em 0; text-align: center; }
  .ni-reader-body figcaption { font-size: 0.85em; color: #64748b; margin-top: 0.25em; }
`;

// ---------------------------------------------------------------------------
// Bullet helpers (ADHD mode — bullet list rendering)
// ---------------------------------------------------------------------------

/**
 * Split AI output into individual bullet strings.
 * Strips leading list markers (-, •, *, numbered) and filters blank lines.
 */
function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^[\s]*[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter(line => line.length > 0);
}

/**
 * Build a <ul> of bullet items from the parsed strings.
 * When streaming is true, a blinking cursor span is appended to the last item.
 */
function buildBulletList(bullets: string[], streaming: boolean): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'ni-tldr-list';

  for (let i = 0; i < bullets.length; i++) {
    const li = document.createElement('li');
    li.className = 'ni-tldr-item';
    const isLast = i === bullets.length - 1;
    if (isLast && streaming) {
      li.innerHTML = escapeHtml(bullets[i]) + '<span class="ni-tldr-cursor"></span>';
    } else {
      li.textContent = bullets[i];
    }
    ul.appendChild(li);
  }

  if (bullets.length === 0 && streaming) {
    const li = document.createElement('li');
    li.className = 'ni-tldr-item';
    li.innerHTML = '<span class="ni-tldr-cursor"></span>';
    ul.appendChild(li);
  }

  return ul;
}

// ---------------------------------------------------------------------------
// Paragraph helpers (Autism mode — easy-read paragraph rendering)
// ---------------------------------------------------------------------------

/**
 * Split AI output into paragraphs on double newlines.
 * Internal single newlines are collapsed to spaces to preserve sentence flow.
 */
function parseParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(block => block.replace(/\n/g, ' ').trim())
    .filter(block => block.length > 0);
}

/**
 * Build an easy-read paragraph container from the parsed blocks.
 * Applies .ni-easy-read-body typography (Autism mode styling).
 * When streaming is true, a blinking cursor is appended to the last paragraph.
 */
function buildParagraphContainer(paragraphs: string[], streaming: boolean): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'ni-easy-read-body';

  for (let i = 0; i < paragraphs.length; i++) {
    const p = document.createElement('p');
    const isLast = i === paragraphs.length - 1;
    if (isLast && streaming) {
      p.innerHTML = escapeHtml(paragraphs[i]) + '<span class="ni-tldr-cursor"></span>';
    } else {
      p.textContent = paragraphs[i];
    }
    div.appendChild(p);
  }

  if (paragraphs.length === 0 && streaming) {
    const p = document.createElement('p');
    p.innerHTML = '<span class="ni-tldr-cursor"></span>';
    div.appendChild(p);
  }

  return div;
}

// ---------------------------------------------------------------------------
// Sentence span injection — wraps sentences in <span class="ni-sent"> for TTS
// ---------------------------------------------------------------------------

/**
 * Process text-only block elements within the container, wrapping each sentence
 * in a <span class="ni-sent"> element. This enables sentence-level TTS highlighting.
 * Skips elements that contain child elements (inline links, images, etc.) to
 * avoid breaking complex markup.
 */
function injectSentenceSpans(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('p, li, blockquote').forEach(el => {
    // Skip elements with child element nodes (complex markup)
    if (Array.from(el.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE)) return;

    const text = el.textContent?.trim() ?? '';
    if (text.length < 30) return;

    // Split on sentence-ending punctuation followed by whitespace
    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 2);
    if (sentences.length <= 1) return;

    el.innerHTML = sentences
      .map((s, i) => `<span class="ni-sent" data-si="${i}">${escapeHtml(s)}</span>`)
      .join(' ');
  });
}

// ---------------------------------------------------------------------------
// Modal-internal TTS helpers
// ---------------------------------------------------------------------------

/**
 * Lazily select the best available English voice for modal TTS.
 * Prefers named high-quality voices (Google, Natural, Premium) before
 * falling back to any English locale voice.
 */
function pickModalVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(v => v.name === 'Google US English') ??
    voices.find(v => v.name.includes('Natural'))     ??
    voices.find(v => v.name.includes('Premium'))     ??
    voices.find(v => v.lang.startsWith('en-') && !v.name.toLowerCase().includes('compact')) ??
    voices.find(v => v.lang.startsWith('en'))        ??
    null
  );
}

/**
 * Collect all readable nodes from the shadow root content area for TTS.
 * Returns sentence spans (.ni-sent) when they exist (article view), or falls
 * back to paragraph/list-item elements (AI summary view).
 */
function getReadableNodes(shadow: ShadowRoot): HTMLElement[] {
  const sentSpans = Array.from(shadow.querySelectorAll<HTMLElement>('.ni-sent'));
  if (sentSpans.length > 0) return sentSpans;

  const contentArea = shadow.getElementById('content-area');
  if (!contentArea) return [];
  return Array.from(contentArea.querySelectorAll<HTMLElement>('p, li, .ni-tldr-item'));
}

// ---------------------------------------------------------------------------
// Reader mode modal — full article + inline AI action escalation
// ---------------------------------------------------------------------------

export interface ReaderModeController {
  /** Transition the content area to a loading spinner (called before API starts). */
  showAILoading: () => void;
  /** Append a streamed text chunk from the AI (renders as bullets or paragraphs). */
  appendChunk: (chunk: string) => void;
  /** Remove the blinking cursor — streaming is done. */
  finalize: () => void;
  /** Show an error message inside the modal. */
  showError: (msg: string) => void;
}

export interface ReaderModeConfig {
  /** Text shown in the coloured badge next to the title. Default: "ADHD Mode" */
  badge?: string;
  /** Label on the AI action button. Default: "✨ Summarize with AI" */
  btnLabel?: string;
  /** CSS background value for the AI action button. Default: orange gradient */
  btnBackground?: string;
  /** Label prefix shown in the progress bar while AI is working. Default: "AI is reading..." */
  loadingText?: string;
  /**
   * How to render the streamed AI output.
   * 'bullets'    — parsed bullet list (default, for ADHD mode)
   * 'paragraphs' — plain paragraph blocks with easy-read typography (for Autism mode)
   */
  outputFormat?: 'bullets' | 'paragraphs';
  /**
   * User profile for dynamic card theming.
   * 'adhd'   — white background, high contrast, increased line-height and letter-spacing
   * 'autism' — soft cream background, gentle dark-gray text, extra-rounded corners
   */
  profile?: 'adhd' | 'autism';
}

/**
 * Show the full cleaned article in a scrollable Focus Modal with a blurred backdrop.
 * A "Read Aloud" button in the header enables sentence-level TTS highlighting.
 * An AI action button triggers onSummarize() / onTranslate() for the AI pipeline.
 * Pass `config` to customise the badge text, button label, button color, and profile theme.
 * Returns a controller so the caller can drive the AI streaming transition.
 */
export function showReaderMode(
  html: string,
  title: string,
  onSummarize: () => void,
  config?: ReaderModeConfig,
): ReaderModeController {
  removeTLDRModal();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647; font-family: system-ui, -apple-system, sans-serif;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const badgeText  = config?.badge        ?? 'ADHD Mode';
  const btnLabel   = config?.btnLabel     ?? '✨ Summarize with AI';
  const btnBg      = config?.btnBackground ?? 'linear-gradient(to right, #f59e0b, #f97316)';
  const profileClass = config?.profile === 'autism' ? 'ni-profile-autism'
    : config?.profile === 'adhd'   ? 'ni-profile-adhd'
    : '';

  shadow.innerHTML = `
    <style>${MODAL_CSS}${READER_CSS}</style>
    <div class="ni-tldr-backdrop" id="backdrop">
      <div class="ni-tldr-card ${profileClass}">
        <div class="ni-tldr-header" style="flex-shrink:0;">
          <div class="ni-tldr-title">
            <span>${escapeHtml(title || 'Reader Mode')}</span>
            <span class="ni-tldr-badge">${escapeHtml(badgeText)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="ni-modal-read-aloud-btn" id="read-aloud-btn" aria-label="Read aloud">🔊 Read Aloud</button>
            <button class="ni-summarize-btn" id="summarize-btn" style="background:${btnBg}">${escapeHtml(btnLabel)}</button>
            <button class="ni-tldr-close" id="close-btn" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="ni-reader-scroll" id="content-area">
          <div class="ni-reader-body" id="article-body"></div>
        </div>
      </div>
    </div>
  `;

  // Inject article HTML and post-process to wrap sentences in spans for TTS
  const articleBody = shadow.getElementById('article-body')!;
  articleBody.innerHTML = html;
  articleBody.querySelectorAll('script, style').forEach(el => el.remove());
  injectSentenceSpans(articleBody);

  // ---------------------------------------------------------------------------
  // Modal-internal TTS state
  // ---------------------------------------------------------------------------

  let modalTTSState: 'idle' | 'speaking' = 'idle';
  let modalTTSIdx   = -1;
  let modalTTSUtterance: SpeechSynthesisUtterance | null = null;
  let modalTTSVoice: SpeechSynthesisVoice | null = null;

  const readAloudBtn = shadow.getElementById('read-aloud-btn') as HTMLButtonElement;

  /** Cancel all active TTS and reset the Read Aloud button to idle state. */
  function stopModalTTS(): void {
    window.speechSynthesis.cancel();
    modalTTSState     = 'idle';
    modalTTSIdx       = -1;
    modalTTSUtterance = null;
    shadow.querySelectorAll('.active-sentence-highlight').forEach(el => {
      el.classList.remove('active-sentence-highlight');
    });
    readAloudBtn.textContent = '🔊 Read Aloud';
    readAloudBtn.classList.remove('speaking');
  }

  /**
   * Recursive sentence/node processor for modal TTS.
   * Reads the node at modalTTSIdx, highlights it, then advances on completion.
   */
  function speakModalNode(nodes: HTMLElement[]): void {
    if (modalTTSState !== 'speaking' || modalTTSIdx >= nodes.length) {
      stopModalTTS();
      return;
    }

    const nodeEl = nodes[modalTTSIdx];
    const text   = nodeEl.textContent?.trim() ?? '';

    if (!text) {
      modalTTSIdx++;
      speakModalNode(nodes);
      return;
    }

    if (!modalTTSVoice) {
      modalTTSVoice = pickModalVoice();
      // Retry once asynchronously if voices haven't loaded yet
      if (!modalTTSVoice) {
        window.speechSynthesis.onvoiceschanged = () => {
          modalTTSVoice = pickModalVoice();
          window.speechSynthesis.onvoiceschanged = null;
        };
      }
    }

    modalTTSUtterance       = new SpeechSynthesisUtterance(text);
    modalTTSUtterance.rate  = 0.95;
    modalTTSUtterance.pitch = 1;
    if (modalTTSVoice) modalTTSUtterance.voice = modalTTSVoice;

    modalTTSUtterance.onstart = () => {
      shadow.querySelectorAll('.active-sentence-highlight').forEach(el => {
        el.classList.remove('active-sentence-highlight');
      });
      nodeEl.classList.add('active-sentence-highlight');
      nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    modalTTSUtterance.onend = () => {
      nodeEl.classList.remove('active-sentence-highlight');
      modalTTSIdx++;
      speakModalNode(nodes);
    };

    modalTTSUtterance.onerror = () => {
      nodeEl.classList.remove('active-sentence-highlight');
      modalTTSIdx++;
      speakModalNode(nodes);
    };

    window.speechSynthesis.speak(modalTTSUtterance);
  }

  /** Start TTS from the first readable node in the current content area. */
  function startModalTTS(): void {
    const nodes = getReadableNodes(shadow);
    if (!nodes.length) return;

    modalTTSIdx   = 0;
    modalTTSState = 'speaking';
    readAloudBtn.textContent = '⏹ Stop';
    readAloudBtn.classList.add('speaking');

    window.speechSynthesis.cancel();
    speakModalNode(nodes);
  }

  readAloudBtn.addEventListener('click', () => {
    if (modalTTSState === 'idle') {
      startModalTTS();
    } else {
      stopModalTTS();
    }
  });

  // ---------------------------------------------------------------------------
  // Close handlers
  // ---------------------------------------------------------------------------

  const closeBtn = shadow.getElementById('close-btn')!;
  const backdrop = shadow.getElementById('backdrop')!;

  closeBtn.addEventListener('click', () => {
    stopModalTTS();
    removeTLDRModal();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      stopModalTTS();
      removeTLDRModal();
    }
  });

  // Summarize / translate button
  const summarizeBtn = shadow.getElementById('summarize-btn') as HTMLButtonElement;
  summarizeBtn.addEventListener('click', () => {
    summarizeBtn.disabled = true;
    onSummarize();
  });

  document.body.appendChild(host);
  // Prevent the background page from scrolling while the modal is open
  document.body.style.overflow = 'hidden';

  // --- Controller (drives the article → loading → streaming transition) ---

  const contentArea  = shadow.getElementById('content-area')!;
  const outputFormat = config?.outputFormat ?? 'bullets';
  let fullAIText     = '';

  function renderContent(text: string, streaming: boolean): Element {
    if (outputFormat === 'paragraphs') {
      return buildParagraphContainer(parseParagraphs(text), streaming);
    }
    return buildBulletList(parseBullets(text), streaming);
  }

  const loadingLabel = config?.loadingText ?? 'AI is reading...';
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let progressPercent = 0;
  let isLoading   = false;
  let isSnapping  = false;
  let snappingReveal: (() => void) | null = null;

  function getDynamicLabel(pct: number): string {
    if (pct >= 90) return 'Almost done...';
    if (pct >= 50) return 'We are halfway through...';
    if (pct >= 20) return 'Processing...';
    return loadingLabel;
  }

  function updateProgressDOM(pct: number): void {
    const bar   = shadow.getElementById('ni-prog-bar')   as HTMLElement | null;
    const label = shadow.getElementById('ni-prog-label') as HTMLElement | null;
    if (bar)   bar.style.width   = `${pct}%`;
    if (label) label.textContent = `${getDynamicLabel(pct)} ${Math.round(pct)}%`;
  }

  function snapToComplete(reveal: () => void): void {
    // Always update to the latest desired reveal (finalize beats appendChunk)
    snappingReveal = reveal;
    if (!isSnapping) {
      isSnapping = true;
      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
      updateProgressDOM(100);
      setTimeout(() => {
        isLoading      = false;
        isSnapping     = false;
        snappingReveal?.();
        snappingReveal = null;
      }, 300);
    }
  }

  return {
    showAILoading() {
      stopModalTTS();
      contentArea.innerHTML = `
        <div class="ni-progress-container">
          <div class="ni-progress-label" id="ni-prog-label">${escapeHtml(getDynamicLabel(0))} 0%</div>
          <div class="ni-progress-track">
            <div class="ni-progress-bar" id="ni-prog-bar" style="width:0%;"></div>
          </div>
        </div>
      `;
      fullAIText     = '';
      isLoading      = true;
      isSnapping     = false;
      snappingReveal = null;
      if (progressInterval) clearInterval(progressInterval);
      progressPercent = 0;

      // Eased tick: fast at start, decelerates toward 90%
      progressInterval = setInterval(() => {
        const remaining = 90 - progressPercent;
        const increment = Math.max(0.15, remaining * 0.1);
        progressPercent = Math.min(90, progressPercent + increment);
        updateProgressDOM(progressPercent);
        if (progressPercent >= 90) {
          clearInterval(progressInterval!);
          progressInterval = null;
        }
      }, 100);
    },

    appendChunk(chunk: string) {
      fullAIText += chunk;
      if (isLoading) {
        snapToComplete(() => {
          contentArea.replaceChildren(renderContent(fullAIText, true));
        });
      } else {
        contentArea.replaceChildren(renderContent(fullAIText, true));
      }
    },

    finalize() {
      const doFinalize = () => {
        contentArea.replaceChildren(renderContent(fullAIText, false));
      };
      if (isLoading) {
        snapToComplete(doFinalize);
      } else {
        doFinalize();
      }
    },

    showError(msg: string) {
      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
      isLoading      = false;
      isSnapping     = false;
      snappingReveal = null;
      contentArea.innerHTML = `<div class="ni-tldr-error">${escapeHtml(msg)}</div>`;
    },
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Remove the modal from the page, cancel any active TTS, and restore background scrolling. */
export function removeTLDRModal(): void {
  window.speechSynthesis.cancel();
  const host = document.getElementById(HOST_ID);
  if (host) {
    // Only restore scroll lock if the modal was actually present, so we never
    // clobber an overflow value set by the page itself when no modal was open.
    document.body.style.overflow = '';
    host.remove();
  }
}

/**
 * Escape a plain-text string for safe insertion into innerHTML.
 * Uses the browser's own serializer so all entities are handled correctly.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
