# Neuro-Inclusive Web Interface — System Blueprint

## 1. Project Overview & Goals

A Chrome extension that transforms overwhelming web pages into cognitively accessible experiences for users with ADHD, Autism, and Dyslexia. The extension parses the DOM in real time, strips visual noise, simplifies language via AI, and reshapes the UI according to the user's neurocognitive profile.

### Core Objectives

- Parse any webpage DOM and classify elements as **main content** vs **noise**
- Remove or collapse clutter (ads, popups, sticky banners, auto-play media)
- Rewrite complex text into plain language using Gemini API
- Apply profile-specific UI adjustments (typography, color, spacing, animation)
- Compute and display a **Cognitive Accessibility Score** (0–100) per page
- Run entirely client-side where possible; call AI only when text simplification is needed

### Target User Profiles

| Profile | Key Needs |
|---------|-----------|
| **ADHD** | Reduce motion, hide distractions, shorten paragraphs, highlight key points |
| **Autism** | Predictable layout, muted colors, literal language, no surprise elements |
| **Dyslexia** | OpenDyslexic font, increased line height, bionic reading markers, high contrast |

---

## 2. Full Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension runtime | Chrome Manifest v3 | Extension shell, permissions, lifecycle |
| Content scripts | Vanilla JS + DOM API | Page parsing, DOM mutation, UI injection |
| Popup UI | React 18 + Tailwind CSS | Settings panel, score display, profile switcher |
| Background worker | Service Worker (JS) | Message routing, API calls, caching |
| AI backend | Gemini API (gemini-1.5-flash) | Text simplification, content classification |
| Storage | chrome.storage.sync + chrome.storage.local | User settings (sync), page cache (local) |
| Build | Vite + CRXJS plugin | Fast builds, HMR for popup, manifest handling |
| Testing | Vitest + Playwright | Unit tests, E2E extension testing |
| Linting | ESLint + Prettier | Code quality |
| Types | TypeScript (strict) | All source files |

---

## 3. Chrome Extension Architecture

### 3.1 Manifest v3

```
manifest.json
├── manifest_version: 3
├── permissions: ["activeTab", "storage", "scripting"]
├── host_permissions: ["<all_urls>"]
├── background.service_worker: "src/background/index.ts"
├── content_scripts:
│   ├── matches: ["<all_urls>"]
│   ├── js: ["src/content/index.ts"]
│   └── css: ["src/content/inject.css"]
├── action.default_popup: "popup.html"
└── icons: 16, 48, 128
```

### 3.2 Content Scripts

Injected into every page. Responsibilities:

1. **DOM Scanner** — Walks the DOM tree, builds a semantic map of elements
2. **Noise Detector** — Identifies ads, modals, overlays, sticky bars, autoplay media using heuristics + ARIA roles
3. **Content Extractor** — Isolates primary content using Readability-style algorithm
4. **DOM Mutator** — Applies hide/restyle/rewrite operations to the live DOM
5. **Style Injector** — Applies profile-specific CSS custom properties
6. **Score Overlay** — Renders the accessibility score badge (floating widget)

Content scripts communicate with the background worker via `chrome.runtime.sendMessage`.

### 3.3 Background Service Worker

Stateless message router and API gateway:

- Receives text chunks from content scripts for AI simplification
- Batches and deduplicates API requests
- Manages a response cache (keyed by text hash) in `chrome.storage.local`
- Enforces rate limiting (max 10 requests/min to Gemini API)
- Handles alarm-based cache eviction (24h TTL)

### 3.4 Popup UI

Single-page React app rendered in the extension popup:

- **Profile Selector** — Toggle between ADHD / Autism / Dyslexia / Custom
- **Intensity Slider** — Light / Medium / Full transformation
- **Feature Toggles** — Granular on/off for each transformation type
- **Accessibility Score** — Live score for current tab with breakdown
- **Quick Actions** — "Simplify this page" / "Reset" / "Report issue"

---

## 4. AI Agents Design

Each agent is a self-contained module with a single responsibility. Agents are orchestrated by the background service worker.

### 4.1 Layout Simplifier Agent

**Input:** Serialized DOM metadata (tag, role, class, visibility, position, size, z-index)

**Process:**
1. Score each element on a noise probability scale (0.0–1.0) using rule-based heuristics
2. Elements scoring > 0.7 are marked for removal
3. Borderline elements (0.4–0.7) are sent to Gemini for classification with a structured prompt
4. Returns a list of element selectors + actions (hide / collapse / keep)

**Heuristic signals:**
- `position: fixed/sticky` outside main content → likely noise
- `role="dialog"`, `role="alert"`, `role="banner"` → evaluate context
- Class/ID matching patterns: `ad`, `popup`, `modal`, `overlay`, `sidebar`, `cookie`
- Z-index > 1000 → likely overlay
- Element covers > 30% viewport → likely modal

### 4.2 Text Rewriter Agent

**Input:** Text blocks extracted from main content (paragraphs, headings, list items)

**Process:**
1. Segment page text into chunks (max 1000 tokens each)
2. Skip chunks that are already simple (Flesch-Kincaid grade < 6)
3. Send remaining chunks to Gemini with profile-aware prompt
4. Replace original text nodes with simplified versions
5. Add tooltip with original text on hover

**Profile-specific prompts:**
- **ADHD:** Shorten to key points, use bullet lists, bold action items
- **Autism:** Use literal language, avoid idioms/sarcasm, define jargon inline
- **Dyslexia:** Short sentences (max 15 words), common words, active voice

### 4.3 Visual Adjuster Agent

**Input:** Current user profile + intensity level

**Process:** Applies CSS custom properties to `:root` via content script.

| Property | ADHD | Autism | Dyslexia |
|----------|------|--------|----------|
| `--ni-font-family` | system-ui | system-ui | OpenDyslexic |
| `--ni-font-size` | 1rem | 1rem | 1.15rem |
| `--ni-line-height` | 1.6 | 1.8 | 2.0 |
| `--ni-letter-spacing` | normal | normal | 0.05em |
| `--ni-word-spacing` | normal | normal | 0.1em |
| `--ni-max-width` | 680px | 720px | 640px |
| `--ni-bg-color` | #fefefe | #f5f0e8 | #fdf6e3 |
| `--ni-text-color` | #1a1a1a | #2c2c2c | #2c2c2c |
| `--ni-link-color` | #0055cc | #0055cc | #0055cc |
| `--ni-animation` | none | none | inherit |
| `--ni-border-style` | subtle | prominent | subtle |

Additional behaviors:
- **ADHD:** Disable CSS animations/transitions, pause all media, dim non-focused content
- **Autism:** Stabilize layout (no reflows), mute colors to pastel range, add visible borders
- **Dyslexia:** Apply bionic reading (bold first half of words), increase paragraph spacing

### 4.4 Cognitive Accessibility Score Agent

**Input:** DOM metadata + applied transformations

**Scoring dimensions (0–100 each, weighted average for final score):**

| Dimension | Weight | Measures |
|-----------|--------|----------|
| Visual Complexity | 25% | Number of distinct colors, font sizes, layout regions |
| Text Readability | 25% | Flesch-Kincaid grade, average sentence length, jargon density |
| Distraction Level | 20% | Count of animations, auto-play media, popups, ads |
| Navigation Clarity | 15% | Heading hierarchy, landmark roles, link distinguishability |
| Sensory Load | 15% | Contrast ratio extremes, flashing content, audio autoplay |

**Output:** Overall score + per-dimension breakdown + specific recommendations.

**Score display:**
- 80–100: Green badge — "This page is accessible"
- 50–79: Yellow badge — "Some issues detected"
- 0–49: Red badge — "Significant barriers found"

---

## 5. Complete Folder Structure

```
neuro-inclusive-extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── .env.example                    # CLAUDE_API_KEY placeholder
├── .eslintrc.cjs
├── .prettierrc
├── CLAUDE.md
├── README.md
│
├── public/
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── fonts/
│       └── OpenDyslexic-Regular.woff2
│
├── src/
│   ├── background/
│   │   ├── index.ts                # Service worker entry
│   │   ├── message-router.ts       # Message dispatch
│   │   ├── api-client.ts           # Gemini API wrapper
│   │   ├── cache.ts                # Response cache (storage.local)
│   │   └── rate-limiter.ts         # Token bucket rate limiter
│   │
│   ├── content/
│   │   ├── index.ts                # Content script entry
│   │   ├── inject.css              # Base injected styles
│   │   ├── scanner/
│   │   │   ├── dom-scanner.ts      # DOM tree walker
│   │   │   ├── semantic-map.ts     # Element classification map
│   │   │   └── readability.ts      # Main content extraction
│   │   ├── agents/
│   │   │   ├── layout-simplifier.ts
│   │   │   ├── text-rewriter.ts
│   │   │   ├── visual-adjuster.ts
│   │   │   └── score-agent.ts
│   │   ├── mutator/
│   │   │   ├── dom-mutator.ts      # Apply hide/restyle/rewrite
│   │   │   └── style-injector.ts   # CSS custom property injection
│   │   └── ui/
│   │       ├── score-badge.ts      # Floating score widget
│   │       └── tooltip.ts          # Original text tooltip
│   │
│   ├── popup/
│   │   ├── main.tsx                # React entry
│   │   ├── App.tsx                 # Root component
│   │   ├── components/
│   │   │   ├── ProfileSelector.tsx
│   │   │   ├── IntensitySlider.tsx
│   │   │   ├── FeatureToggles.tsx
│   │   │   ├── ScoreDisplay.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── hooks/
│   │   │   ├── useSettings.ts
│   │   │   └── useTabScore.ts
│   │   └── styles/
│   │       └── popup.css
│   │
│   ├── shared/
│   │   ├── types.ts                # Shared TypeScript interfaces
│   │   ├── constants.ts            # Profile defaults, thresholds
│   │   ├── messages.ts             # Message type definitions
│   │   ├── storage.ts              # chrome.storage helpers
│   │   └── scoring.ts              # Score calculation utilities
│   │
│   └── prompts/
│       ├── classify-element.txt    # Layout agent prompt template
│       ├── simplify-adhd.txt       # ADHD text rewriting prompt
│       ├── simplify-autism.txt     # Autism text rewriting prompt
│       └── simplify-dyslexia.txt   # Dyslexia text rewriting prompt
│
├── tests/
│   ├── unit/
│   │   ├── dom-scanner.test.ts
│   │   ├── score-agent.test.ts
│   │   ├── rate-limiter.test.ts
│   │   └── text-rewriter.test.ts
│   └── e2e/
│       ├── extension.spec.ts
│       └── fixtures/
│           └── sample-page.html
│
└── scripts/
    ├── build.sh                    # Production build
    └── dev.sh                      # Dev mode with HMR
```

---

## 6. Data Flow & Workflow

### Page Load Pipeline

```
1. User navigates to a page
       │
2. Content script injects (document_idle)
       │
3. DOM Scanner walks the tree
   ├── Builds semantic map: {selector, tag, role, classes, rect, zIndex, textContent}
   └── Computes initial raw score
       │
4. Layout Simplifier Agent runs
   ├── Heuristic pass: marks obvious noise (score > 0.7)
   ├── Borderline elements sent to background → Gemini API (batched)
   └── Returns action list: [{selector, action: hide|collapse|keep}]
       │
5. DOM Mutator applies layout changes
   ├── Hides noise elements (display:none + aria-hidden)
   └── Collapses sidebars into expandable toggles
       │
6. Text Rewriter Agent runs (if enabled)
   ├── Extracts text from main content region
   ├── Filters out already-simple text (Flesch-Kincaid < 6)
   ├── Chunks remaining text (≤1000 tokens)
   ├── Sends chunks to background → Gemini API (profile-specific prompt)
   └── Replaces text nodes, attaches original-text tooltips
       │
7. Visual Adjuster Agent runs
   ├── Reads user profile + intensity from storage
   └── Injects CSS custom properties on :root
       │
8. Score Agent computes final score
   ├── Evaluates 5 dimensions against transformed DOM
   └── Sends score + breakdown to popup via message
       │
9. Score Badge rendered on page
```

### Message Protocol

All inter-component communication uses typed messages:

```
ContentScript → Background:
  { type: "CLASSIFY_ELEMENTS", payload: ElementMetadata[] }
  { type: "SIMPLIFY_TEXT", payload: { chunks: string[], profile: Profile } }

Background → ContentScript:
  { type: "CLASSIFICATION_RESULT", payload: ElementAction[] }
  { type: "SIMPLIFIED_TEXT", payload: { original: string, simplified: string }[] }

ContentScript → Popup:
  { type: "SCORE_UPDATE", payload: ScoreBreakdown }

Popup → ContentScript:
  { type: "APPLY_PROFILE", payload: UserSettings }
  { type: "RESET_PAGE" }
```

---

## 7. User Settings Schema

Stored in `chrome.storage.sync` (syncs across devices):

```typescript
interface UserSettings {
  // Active profile
  activeProfile: "adhd" | "autism" | "dyslexia" | "custom";

  // Transformation intensity
  intensity: "light" | "medium" | "full";

  // Feature toggles
  features: {
    removeAds: boolean;
    removePopups: boolean;
    removeAutoplay: boolean;
    simplifyText: boolean;
    adjustFonts: boolean;
    adjustColors: boolean;
    adjustSpacing: boolean;
    showScore: boolean;
    bionicReading: boolean;      // Dyslexia only
    dimUnfocused: boolean;       // ADHD only
    stabilizeLayout: boolean;    // Autism only
  };

  // Custom overrides (when profile = "custom")
  customCSS: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
    bgColor: string;
    textColor: string;
    maxWidth: string;
  };

  // API
  apiKey: string;  // User's Gemini API key

  // Behavior
  autoRun: boolean;              // Run on every page load
  cacheEnabled: boolean;         // Cache simplified text
  showOriginalOnHover: boolean;  // Tooltip with original text
}
```

**Defaults** are defined per profile in `src/shared/constants.ts`. On first install, the extension opens an onboarding page where the user selects their primary profile.

---

## 8. API Integration Plan

### 8.1 Gemini API Usage

**Model:** `gemini-1.5-flash` (balances quality and speed for real-time use)

**Two API call types:**

1. **Element Classification** — Used sparingly for borderline elements
   - Input: ~200 tokens (element metadata)
   - Output: ~50 tokens (classification + confidence)
   - Frequency: 0–5 calls per page

2. **Text Simplification** — Primary API usage
   - Input: ~1000 tokens per chunk (text + prompt)
   - Output: ~800 tokens per chunk (simplified text)
   - Frequency: 1–10 calls per page depending on content length

### 8.2 Prompt Strategy

All prompts follow this structure:

```
[System] You are a cognitive accessibility assistant. Your task is to {task}.
         Target audience: users with {profile}.

[Rules]  {profile-specific rules — max 5 bullet points}

[Input]  {the content to process}

[Output] {structured output format — JSON for classification, plain text for simplification}
```

Prompts are stored as `.txt` templates in `src/prompts/` with `{{placeholder}}` substitution.

### 8.3 Token Optimization

| Strategy | Implementation |
|----------|---------------|
| Client-side pre-filter | Skip text with Flesch-Kincaid grade < 6 |
| Chunking | Split at paragraph boundaries, max 1000 tokens |
| Response cache | SHA-256 hash of input text → cached response (24h TTL) |
| Batch dedup | Deduplicate identical text blocks before sending |
| Prompt compression | Minimal system prompts, rules as terse bullets |
| Early termination | If first 3 chunks return nearly identical text, skip remaining |

**Estimated cost per page:** 2,000–15,000 input tokens, 1,500–10,000 output tokens.

---

## 9. Dependencies

### package.json

```json
{
  "name": "neuro-inclusive-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "@google/generative-ai": "^0.39.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@playwright/test": "^1.48.0",
    "@types/chrome": "^0.0.280",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.14.0",
    "postcss": "^8.4.49",
    "prettier": "^3.4.2",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

---

## 10. Build & Dev Setup

### Prerequisites

- Node.js >= 20
- npm >= 10
- Chrome >= 120
- Gemini API key from aistudio.google.com

### Local Development

```bash
# Clone and install
git clone <repo-url> && cd neuro-inclusive-extension
npm install

# Configure API key
cp .env.example .env
# Edit .env → VITE_GEMINI_API_KEY=sk-ant-...

# Start dev server (with HMR for popup)
npm run dev
```

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder (after build) or project root (during dev)
5. The extension icon appears in the toolbar

### Production Build

```bash
npm run build     # Outputs to dist/
```

The `dist/` folder is a ready-to-upload Chrome Web Store package.

### Testing

```bash
npm test          # Unit tests (Vitest)
npm run test:e2e  # E2E tests (Playwright + Chrome extension)
```

---

## 11. Implementation Order

### Phase 1 — Skeleton (Days 1–3)

- Initialize Vite + CRXJS project with Manifest v3
- Create folder structure
- Set up TypeScript, ESLint, Prettier, Tailwind
- Build minimal popup (React shell with profile selector)
- Verify extension loads in Chrome and popup renders

### Phase 2 — DOM Engine (Days 4–7)

- Implement DOM Scanner (tree walker + semantic map builder)
- Implement noise detection heuristics (rule-based, no AI)
- Implement DOM Mutator (hide/collapse operations)
- Implement Style Injector (CSS custom property injection)
- Test on 5 diverse websites (news, social media, docs, e-commerce, blog)

### Phase 3 — Visual Profiles (Days 8–10)

- Define CSS property sets for all three profiles
- Implement Visual Adjuster Agent
- Build IntensitySlider and FeatureToggles in popup
- Wire popup ↔ content script messaging
- Implement settings persistence (chrome.storage.sync)

### Phase 4 — AI Integration (Days 11–16)

- Build Gemini API client wrapper in background worker
- Implement rate limiter and response cache
- Create prompt templates for all profiles
- Implement Text Rewriter Agent (chunk → simplify → replace)
- Implement Element Classification (borderline elements)
- Add Flesch-Kincaid pre-filter
- Add original-text tooltips

### Phase 5 — Scoring System (Days 17–19)

- Implement five scoring dimensions
- Build Score Agent (evaluates transformed DOM)
- Build floating score badge (content script UI)
- Build ScoreDisplay component in popup (breakdown view)
- Calibrate weights against a test corpus of 20 pages

### Phase 6 — Polish & Testing (Days 20–25)

- E2E tests for full pipeline on real pages
- Performance profiling (target: < 500ms for non-AI operations)
- Edge case handling (SPAs, dynamic content, iframes)
- Onboarding flow (first install experience)
- Error states and fallbacks (API failures, rate limits)
- Accessibility audit of the extension's own UI

---

## 12. Edge Cases & Constraints

### Technical Constraints

| Constraint | Mitigation |
|-----------|------------|
| Manifest v3 has no persistent background | Use chrome.alarms for periodic tasks; keep service worker stateless |
| Content scripts can't access page JS context | Use MutationObserver for SPA detection; no direct framework access |
| chrome.storage.sync has 100KB limit | Store only settings in sync; cache in storage.local (10MB) |
| Gemini API latency (1–3s per call) | Show skeleton/loading state; apply non-AI transforms first |
| API key stored client-side | Warn user; recommend low-budget key; never log or transmit elsewhere |

### Edge Cases

| Case | Handling |
|------|---------|
| Single Page Applications (React, Vue) | MutationObserver watches for DOM changes; re-run pipeline on significant mutations (>10 new nodes) |
| Pages with iframes | Skip cross-origin iframes; process same-origin iframes |
| Already accessible pages | Score agent detects high baseline score; skip transformations, show green badge |
| Very long pages (>50k words) | Process only visible viewport + 2 screens ahead; lazy-process on scroll |
| Pages with no main content | Fallback to `<body>` as content root; reduce transformation intensity |
| Dynamic content (infinite scroll) | IntersectionObserver triggers processing for newly visible content |
| User editable content (forms, editors) | Never mutate `<input>`, `<textarea>`, `[contenteditable]` |
| Right-to-left languages | Detect `dir="rtl"` or script ranges; preserve text direction in rewrites |
| Images and media | Add alt-text indicators; auto-pause video/audio (ADHD mode) |
| Print stylesheets | Restore original DOM on `beforeprint` event; re-apply on `afterprint` |
| Extension conflicts | Namespace all injected CSS with `--ni-` prefix; use Shadow DOM for badge |
| Rate limit exceeded | Queue requests; show "simplification pending" state; process when quota resets |
