/**
 * Original-text tooltip.
 *
 * Shown on hover over any element rewritten by the Text Rewriter Agent.
 * Implemented as a single floating <div> (Shadow DOM) that repositions
 * itself next to the hovered element to avoid reflow conflicts.
 *
 * Usage:
 *   initTooltip()           — call once on page load
 *   attachTooltip(el, text) — mark an element with its original text
 *   removeAllTooltips()     — clean up on reset
 */

const ATTR = 'data-ni-original';
const TOOLTIP_ID = 'ni-tooltip-host';

let tooltipEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create the singleton tooltip element and wire global hover listeners. */
export function initTooltip(): void {
  if (document.getElementById(TOOLTIP_ID)) return;

  // Use a Shadow DOM host to isolate tooltip styles from the page
  const host = document.createElement('div');
  host.id = TOOLTIP_ID;
  host.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    #tooltip {
      display: none;
      position: fixed;
      max-width: 320px;
      padding: 6px 10px;
      background: #1a1a1a;
      color: #f0f0f0;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
      z-index: 2147483647;
    }
    #tooltip::before {
      content: 'Original: ';
      font-weight: 600;
      opacity: 0.7;
    }
  `;

  const tip = document.createElement('div');
  tip.id = 'tooltip';

  shadow.appendChild(style);
  shadow.appendChild(tip);
  tooltipEl = tip;

  document.addEventListener('mouseover', onMouseOver, { passive: true });
  document.addEventListener('mouseout', onMouseOut, { passive: true });
}

/**
 * Attach the original text to an element so it shows in the tooltip on hover.
 */
export function attachTooltip(el: HTMLElement, originalText: string): void {
  el.setAttribute(ATTR, originalText);
  el.style.cursor = 'help';
}

/**
 * Remove all tooltip markers and the tooltip host.
 */
export function removeAllTooltips(): void {
  document.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach(el => {
    el.removeAttribute(ATTR);
    el.style.removeProperty('cursor');
  });
  document.getElementById(TOOLTIP_ID)?.remove();
  document.removeEventListener('mouseover', onMouseOver);
  document.removeEventListener('mouseout', onMouseOut);
  tooltipEl = null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Show and position the tooltip when the cursor enters a rewritten element. */
function onMouseOver(e: MouseEvent): void {
  if (!tooltipEl) return;
  const target = (e.target as Element).closest<HTMLElement>(`[${ATTR}]`);
  if (!target) return;

  const original = target.getAttribute(ATTR) ?? '';
  tooltipEl.textContent = original;
  tooltipEl.style.display = 'block';
  positionTooltip(e);
}

/** Hide the tooltip when the cursor leaves — unless it moved to another annotated element. */
function onMouseOut(e: MouseEvent): void {
  if (!tooltipEl) return;
  const related = e.relatedTarget as Element | null;
  if (related?.closest(`[${ATTR}]`)) return; // still inside a tooltip element
  tooltipEl.style.display = 'none';
}

/**
 * Position the tooltip near the cursor, clamped so it never overflows the viewport.
 * Flips above the cursor when it would otherwise clip the bottom edge.
 */
function positionTooltip(e: MouseEvent): void {
  if (!tooltipEl) return;
  const margin = 12;
  const tipW = 320;
  const x = Math.min(e.clientX + margin, window.innerWidth - tipW - margin);
  const y = e.clientY + margin + 20; // below cursor
  const clampedY = y + 80 > window.innerHeight ? e.clientY - 80 : y;

  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${clampedY}px`;
}
