/**
 * Floating Score Badge
 *
 * Renders a fixed-position widget at the bottom-right of every page.
 * Uses Shadow DOM so the badge's styles are completely isolated from the page.
 *
 * States:
 *   - Analysing…  (spinner, shown while score is being computed)
 *   - Score        (number + colour, shown once score arrives)
 *   - Breakdown    (expanded panel with per-dimension bars, shown on click)
 *
 * Score colour coding:
 *   80-100 → green  ("This page is accessible")
 *   50-79  → yellow ("Some issues detected")
 *   0-49   → red    ("Significant barriers found")
 */

import type { ScoreBreakdown } from '@/shared/types';

const HOST_ID = 'ni-score-badge-host';

interface DimensionDef {
  key: keyof Omit<ScoreBreakdown, 'overall'>;
  label: string;
  weight: string;
}

const DIMENSIONS: DimensionDef[] = [
  { key: 'visualComplexity',  label: 'Visual Complexity',  weight: '25%' },
  { key: 'textReadability',   label: 'Text Readability',   weight: '25%' },
  { key: 'distractionLevel',  label: 'Distraction Level',  weight: '20%' },
  { key: 'navigationClarity', label: 'Navigation Clarity', weight: '15%' },
  { key: 'sensoryLoad',       label: 'Sensory Load',       weight: '15%' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create the badge and show a "Analysing…" state. */
export function initScoreBadge(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483646;';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = buildShadowHTML();

  document.body.appendChild(host);

  // Toggle breakdown on badge click
  const badge = shadow.getElementById('badge')!;
  const breakdown = shadow.getElementById('breakdown')!;
  badge.addEventListener('click', () => {
    const hidden = breakdown.hasAttribute('hidden');
    if (hidden) breakdown.removeAttribute('hidden');
    else breakdown.setAttribute('hidden', '');
    badge.setAttribute('aria-expanded', String(hidden));
  });
}

/** Update the badge with a computed ScoreBreakdown. */
export function updateScoreBadge(score: ScoreBreakdown): void {
  const host = document.getElementById(HOST_ID);
  if (!host?.shadowRoot) return;

  const shadow = host.shadowRoot;
  const badge = shadow.getElementById('badge');
  const scoreEl = shadow.getElementById('score-number');
  const labelEl = shadow.getElementById('score-label');

  if (!badge || !scoreEl || !labelEl) return;

  const { color, message } = getScoreStyle(score.overall);

  scoreEl.textContent = String(score.overall);
  labelEl.textContent = message;
  badge.setAttribute('data-color', color);
  badge.setAttribute('aria-label', `Accessibility score: ${score.overall}. ${message}`);

  // Update dimension bars
  for (const dim of DIMENSIONS) {
    const fill = shadow.getElementById(`dim-fill-${dim.key}`);
    const val  = shadow.getElementById(`dim-val-${dim.key}`);
    if (!fill || !val) continue;
    const s = score[dim.key];
    fill.style.width = `${s}%`;
    fill.setAttribute('data-color', getBarColor(s));
    val.textContent = String(s);
  }
}

/** Remove the badge (called on reset). */
export function removeScoreBadge(): void {
  document.getElementById(HOST_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map an overall score to a CSS color name and human-readable message.
 * Used to colour the badge and populate its aria-label.
 */
function getScoreStyle(overall: number): { color: string; message: string } {
  if (overall >= 80) return { color: 'green',  message: 'Accessible' };
  if (overall >= 50) return { color: 'yellow', message: 'Some issues' };
  return              { color: 'red',    message: 'Significant barriers' };
}

/** Map a dimension score to a data-color attribute value for the progress bar fill. */
function getBarColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

/** Generate the HTML for all five dimension rows in the breakdown panel. */
function buildDimensionRows(): string {
  return DIMENSIONS.map(dim => `
    <div class="dim-row">
      <span class="dim-label">${dim.label}</span>
      <div class="bar-track">
        <div class="bar-fill" id="dim-fill-${dim.key}" style="width:0%" data-color="yellow"></div>
      </div>
      <span class="dim-val" id="dim-val-${dim.key}">—</span>
    </div>
  `).join('');
}

/**
 * Build the complete Shadow DOM HTML string for the badge.
 * Includes the circular score button and the hidden breakdown panel.
 */
function buildShadowHTML(): string {
  return `
    <style>
      :host { font-family: system-ui, sans-serif; }

      #badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        background: #6366f1;
        color: white;
        padding: 0;
        outline-offset: 3px;
      }
      #badge:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
      #badge[data-color="green"]  { background: #16a34a; }
      #badge[data-color="yellow"] { background: #ca8a04; }
      #badge[data-color="red"]    { background: #dc2626; }

      #score-number {
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
        color: white;
      }
      #score-label {
        font-size: 7px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.88;
        margin-top: 2px;
        color: white;
        text-align: center;
        max-width: 48px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #breakdown {
        position: absolute;
        bottom: 60px;
        right: 0;
        width: 240px;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        padding: 12px 14px;
        border: 1px solid #e5e7eb;
      }
      #breakdown[hidden] { display: none; }

      .breakdown-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        margin-bottom: 10px;
      }

      .dim-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 7px;
      }
      .dim-label {
        font-size: 11px;
        color: #374151;
        width: 110px;
        flex-shrink: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar-track {
        flex: 1;
        height: 6px;
        background: #f3f4f6;
        border-radius: 3px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        border-radius: 3px;
        background: #ca8a04;
        transition: width 0.4s ease;
      }
      .bar-fill[data-color="green"]  { background: #16a34a; }
      .bar-fill[data-color="yellow"] { background: #ca8a04; }
      .bar-fill[data-color="red"]    { background: #dc2626; }
      .dim-val {
        font-size: 11px;
        font-weight: 600;
        color: #374151;
        width: 22px;
        text-align: right;
        flex-shrink: 0;
      }
    </style>

    <button
      id="badge"
      aria-label="Accessibility score (analysing)"
      aria-expanded="false"
      title="Neuro-Inclusive Accessibility Score — click for breakdown"
    >
      <span id="score-number">…</span>
      <span id="score-label">NI Score</span>
    </button>

    <div id="breakdown" hidden role="dialog" aria-label="Score breakdown">
      <div class="breakdown-title">Score Breakdown</div>
      ${buildDimensionRows()}
    </div>
  `;
}
