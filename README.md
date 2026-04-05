# Neuro-Inclusive Web Interface

A Chrome extension that makes the web cognitively accessible for users with ADHD, Autism, and Dyslexia — powered by AI.

---

## Project Overview

Web pages are cluttered with ads, pop-ups, complex language, and sensory overload. This extension transforms any webpage into a calmer, clearer experience by:

- Detecting and removing visual noise (ads, modals, sticky banners)
- Simplifying complex text into plain language using Gemini AI
- Adjusting fonts, colors, spacing, and layout per neurocognitive profile
- Scoring every page on cognitive accessibility (0–100)

Three built-in profiles — **ADHD**, **Autism**, **Dyslexia** — plus a fully customizable mode.

---

## System Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                    Chrome Browser                     │
│                                                       │
│  ┌──────────┐    messages    ┌───────────────────┐   │
│  │  Popup   │◄──────────────►│  Content Script   │   │
│  │ (React)  │                │  (DOM Engine)     │   │
│  │          │                │                   │   │
│  │ Profile  │                │ ┌───────────────┐ │   │
│  │ Settings │                │ │ DOM Scanner   │ │   │
│  │ Score    │                │ │ Layout Agent  │ │   │
│  │ Controls │                │ │ Visual Agent  │ │   │
│  └──────────┘                │ │ Score Agent   │ │   │
│                              │ └───────────────┘ │   │
│                              └────────┬──────────┘   │
│                                       │ messages     │
│                              ┌────────▼──────────┐   │
│                              │  Background Worker │   │
│                              │                    │   │
│                              │ ┌────────────────┐ │   │
│                              │ │ API Client     │ │   │
│                              │ │ Rate Limiter   │ │   │
│                              │ │ Response Cache │ │   │
│                              │ └───────┬────────┘ │   │
│                              └─────────┼──────────┘   │
│                                        │              │
└────────────────────────────────────────┼──────────────┘
                                         │ HTTPS
                                ┌────────▼────────┐
                                │   Gemini API    │
                                │ (Text Simplify) │
                                │ (Classify DOM)  │
                                └─────────────────┘
```

**Three runtime components:**

| Component | Runs In | Role |
|-----------|---------|------|
| **Content Script** | Every web page | Scans DOM, applies transforms, renders score badge |
| **Background Worker** | Extension service worker | Routes messages, calls Gemini API, manages cache |
| **Popup** | Extension toolbar popup | User settings, profile switching, score display |

---

## Module Breakdown

### 1. Extension Shell

The Manifest v3 foundation. Declares permissions, registers the content script and service worker, and configures the popup. Built with Vite + CRXJS for fast iteration.

### 2. DOM Engine (Content Script)

The core transformation pipeline, running entirely in the page context:

- **DOM Scanner** — Traverses the DOM and builds a semantic map of every element (tag, role, position, visibility, text content)
- **Noise Detector** — Scores elements on noise probability using heuristics (fixed positioning, ad-related classes, high z-index, overlay behavior)
- **Content Extractor** — Identifies the primary content region using a Readability-style algorithm
- **DOM Mutator** — Executes hide, collapse, and restyle operations on identified noise
- **Style Injector** — Applies profile-specific CSS custom properties to the page root

### 3. AI Layer (Background Worker + Agents)

Four specialized agents, orchestrated by the background worker:

- **Layout Simplifier** — Classifies ambiguous DOM elements via Gemini when heuristics are inconclusive
- **Text Rewriter** — Sends text chunks to Gemini with profile-specific prompts; replaces complex language with simplified versions
- **Visual Adjuster** — Applies CSS transforms based on the active profile (fonts, colors, spacing, animation control)
- **Score Agent** — Evaluates the page across 5 dimensions (visual complexity, readability, distractions, navigation, sensory load)

### 4. UI Transformation

All visual changes are applied through CSS custom properties namespaced with `--ni-`. Each profile defines a complete set of properties. The system never modifies user-editable elements (inputs, textareas, contenteditable).

### 5. Cognitive Load Assessor — Penalty-Point DOM Scanner

A penalty-point DOM traversal algorithm (`src/utils/cognitiveScoring.js`) that scans the live DOM and accumulates penalty points for elements that cause real cognitive overload. The final score is the raw penalty sum capped at 100.

**Algorithm design:**
- Uses an explicit element stack (no recursion) to avoid JavaScript call-stack overflows
- **Hard-stop node limit of 20 000** nodes covers the full above-the-fold content of even the most complex pages while bounding worst-case runtime
- Pure reading content carries **zero penalty** — `<p>`, `<h1>`–`<h6>`, `<span>`, `<article>`, `<li>` are never penalised
- Plain `<a>` text links are ignored entirely (article sites use many — they are not noise)
- Ad and clutter detection uses both tag name and class/id keyword matching:

  | Category | Elements / Signals | Points |
  |----------|-------------------|--------|
  | **Aggressive Ad** | `<iframe>`, `<ins>`, className or id containing `ad`, `banner`, `popup`, `sponsor`, `modal` | +15 each |
  | **Media** | `<img>`, `<video>`, `<picture>`, `<canvas>` | +5 each |
  | **Interactive** | `<button>`, `<input>` | +1 each |
  | **Image-wrapped link** | `<a>` whose content includes an `<img>` | +2 each |

- Ad containers and media subtrees are skipped after counting — their internals add no further cognitive load and would waste the NODE_LIMIT budget
- SVG internals (icon fonts, sprite sheets) are skipped entirely
- Hidden elements (`hidden` attribute, `aria-hidden`, inline `display:none` / `visibility:hidden`) are pruned without traversing their subtrees
- **Final score = sum of all penalty points, capped at 100**
- **Time complexity: O(n)** — each node is pushed and popped once; no node is ever revisited
- **Space complexity: O(n)** — stack bounded by the number of siblings at the widest level

**Score interpretation:**

| Range | Label | Colour |
|-------|-------|--------|
| 0–30 | Calm | Green |
| 31–70 | Busy | Amber |
| 71–100 | Overwhelming | Red |

The score is surfaced via a **"Cognitive Score" button** in the popup — styled to match the three profile rows — that fires the DFS scan and displays the result inline with colour-coded feedback.

### 6. Scoring System

Computes a 0–100 Cognitive Accessibility Score from five weighted dimensions. Displayed as a floating badge on the page and a detailed breakdown in the popup. The score updates after each transformation pass.

---

## Step-by-Step Implementation Phases

### Phase 1: Project Foundation

**Goal:** Working extension skeleton that loads in Chrome.

- [ ] Initialize project with Vite, TypeScript, React, Tailwind, CRXJS
- [ ] Create `manifest.json` (Manifest v3, required permissions)
- [ ] Set up folder structure as specified in CLAUDE.md
- [ ] Build minimal popup shell (React app with placeholder UI)
- [ ] Create empty content script and background worker entry points
- [ ] Verify the extension loads via `chrome://extensions/` and the popup opens

**Exit criteria:** Extension installs, popup renders, content script injects, console logs confirm all three components are running.

### Phase 2: DOM Scanning & Noise Removal

**Goal:** Extension can detect and remove clutter from any page without AI.

- [ ] Implement DOM Scanner — walk tree, build semantic element map
- [ ] Implement noise detection heuristics (15+ rule set)
- [ ] Implement DOM Mutator — hide/collapse operations
- [ ] Implement MutationObserver for SPA support
- [ ] Add content script ↔ background worker message bus
- [ ] Test on: CNN, Twitter/X, Amazon, MDN, Medium

**Exit criteria:** Ads, popups, cookie banners, and sticky overlays are removed on test sites. Main content is preserved.

### Phase 3: Visual Profiles & Settings

**Goal:** Users can select a profile and see immediate UI changes.

- [ ] Define CSS custom property sets for ADHD, Autism, Dyslexia profiles
- [ ] Implement Style Injector in content script
- [ ] Implement Visual Adjuster Agent (applies profile CSS)
- [ ] Build ProfileSelector, IntensitySlider, FeatureToggles components
- [ ] Wire popup → content script settings messaging
- [ ] Implement chrome.storage.sync persistence
- [ ] Bundle OpenDyslexic font

**Exit criteria:** Selecting a profile in the popup instantly transforms the page's appearance. Settings persist across sessions.

### Phase 4: AI Text Simplification

**Goal:** Complex text is rewritten to match the user's cognitive profile.

- [ ] Build Gemini API client wrapper (background worker)
- [ ] Implement token bucket rate limiter (10 req/min)
- [ ] Implement SHA-256 response cache in chrome.storage.local
- [ ] Write prompt templates for each profile (classify, simplify x3)
- [ ] Implement Flesch-Kincaid pre-filter (skip already simple text)
- [ ] Implement Text Rewriter Agent (chunk, send, replace)
- [ ] Add original-text tooltip on hover for rewritten blocks
- [ ] Implement Layout Simplifier Agent (AI classification for borderline elements)

**Exit criteria:** Selecting "Simplify this page" rewrites complex text. Original text visible on hover. API calls are cached and rate-limited.

### Phase 5: Accessibility Scoring

**Goal:** Every page gets a cognitive accessibility score with breakdown.

- [ ] Implement five scoring dimension calculators
- [ ] Implement Score Agent (aggregates dimensions with weights)
- [ ] Build floating score badge (Shadow DOM, positioned bottom-right)
- [ ] Build ScoreDisplay component in popup (bar chart breakdown)
- [ ] Score updates after each transformation pass
- [ ] Calibrate weights by scoring 20 reference pages manually

**Exit criteria:** Score badge appears on every page. Score reflects actual accessibility. Breakdown is visible in popup.

### Phase 6: Integration, Polish & Testing

**Goal:** Production-ready extension.

- [ ] End-to-end pipeline test (scan → simplify → restyle → score)
- [ ] Performance optimization (< 500ms for non-AI transforms)
- [ ] Error handling: API failures, rate limits, malformed DOM
- [ ] Edge cases: iframes, very long pages, RTL text, print
- [ ] Onboarding flow for first-time users
- [ ] Unit tests for all agents and utilities
- [ ] E2E tests with Playwright
- [ ] Accessibility audit of the extension's own popup UI

**Exit criteria:** All tests pass. Extension works reliably on top-50 websites. Graceful degradation when API is unavailable.

---

## How Modules Connect

```
User clicks extension icon
        │
        ▼
   Popup loads ──── reads settings from chrome.storage.sync
        │
        │ user selects profile / clicks "Simplify"
        ▼
   Popup sends message ──► Content Script
        │
        ▼
   Content Script runs pipeline:
        │
        ├─ 1. DOM Scanner ──► builds semantic map
        │
        ├─ 2. Layout Simplifier ──► heuristic pass (local)
        │      │
        │      └─ borderline elements ──► Background Worker ──► Gemini API
        │                                        │
        │                                        ▼
        │                                  classification result
        │
        ├─ 3. DOM Mutator ──► hides noise elements
        │
        ├─ 4. Text Rewriter ──► extracts text, filters simple text
        │      │
        │      └─ complex chunks ──► Background Worker ──► Gemini API
        │                                   │
        │                                   ├─ checks cache first
        │                                   ├─ rate limits requests
        │                                   ▼
        │                            simplified text returned
        │
        ├─ 5. Visual Adjuster ──► injects CSS custom properties
        │
        └─ 6. Score Agent ──► computes 5 dimensions ──► renders badge
                                      │
                                      └──► sends score to Popup for display
```

**Key data flows:**

1. **Settings** — Popup writes to `chrome.storage.sync` → Content script reads on page load
2. **AI requests** — Content script sends text to Background worker → Background calls Gemini API → Response cached and returned
3. **Score** — Content script computes score → Sends to Popup via `chrome.runtime.sendMessage`
4. **Page mutations** — MutationObserver detects DOM changes → Re-triggers scanner for new content

---

## How to Run Locally

### Prerequisites

- Node.js 20+
- npm 10+
- Google Chrome 120+
- Gemini API key ([aistudio.google.com](https://aistudio.google.com))

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd neuro-inclusive-extension

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your Gemini API key:
#   VITE_GEMINI_API_KEY=AIzaSyD38rMHLSW71_YBuGZHlMxntX7Vsm-FIBw

# 4. Start development server
npm run dev
```

### Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` directory from the project
5. The Neuro-Inclusive icon appears in your toolbar
6. Pin it for easy access

### Available Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build → `dist/` |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run lint` | Lint all source files |
| `npm run format` | Auto-format with Prettier |

---

## Demo Flow

A step-by-step walkthrough to verify the extension works end-to-end:

1. **Install & open** — Load the extension, navigate to a news site (e.g., CNN.com)

2. **Run the Cognitive Load scan** — Click the **Cognitive Score** button (indigo row below the profiles). The O(n) DFS engine traverses the DOM and returns a score in milliseconds — no API call, no network round-trip. A news homepage typically scores 55–80 (Busy to Overwhelming)

3. **Observe the badge score** — A floating badge appears in the bottom-right showing the page's raw accessibility score (likely 30–50 for a news site)

4. **Select ADHD profile** — Click the extension icon, choose "ADHD" profile
   - Ads and sidebar clutter disappear
   - Animations stop
   - Non-focused content dims
   - Score increases

5. **Simplify text** — Click "Simplify this page"
   - Complex paragraphs are rewritten into shorter, clearer text
   - Hover over any rewritten text to see the original
   - Score increases further

6. **Switch to Dyslexia profile** — Select "Dyslexia" in the popup
   - Font changes to OpenDyslexic
   - Line height and letter spacing increase
   - Bionic reading markers appear (first half of words bolded)
   - Background shifts to warm cream

7. **Switch to Autism profile** — Select "Autism"
   - Colors mute to pastels
   - Layout stabilizes with visible borders
   - Idioms in text are replaced with literal alternatives

8. **Adjust intensity** — Move the slider from "Medium" to "Light"
   - Transformations become subtler
   - More of the original page shows through

9. **Reset** — Click "Reset" to restore the original page
   - All transformations are removed
   - Score returns to original value

---

## License

MIT
#   N e u r o _ I n c l u s i v e _ W e b I n t e r f a c e  
 