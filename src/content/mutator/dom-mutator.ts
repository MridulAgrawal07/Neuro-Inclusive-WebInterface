/**
 * DOM Mutator — applies, tracks, and reverses element transformations.
 *
 * Operations:
 *   hide     — sets display:none + aria-hidden; stamped with data-ni-hidden
 *   collapse — wraps element in a togglable disclosure; stamped with data-ni-collapsed
 *
 * All mutations are reversible via resetPage().
 * Editable elements (input, textarea, select, contenteditable) are never touched.
 */

import type { ElementAction } from '@/shared/types';
import { queryAllPiercing, safeQueryPiercing } from '../utils/shadow-dom';

const ATTR_HIDDEN = 'data-ni-hidden';
const ATTR_COLLAPSED = 'data-ni-collapsed';
const CLASS_WRAPPER = 'ni-collapse-wrapper';

// Tags whose content must never be mutated
const PROTECTED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

/**
 * Apply a list of element actions produced by the Layout Simplifier Agent.
 * Each action is dispatched to the appropriate mutation function.
 */
export function applyActions(actions: ElementAction[]): void {
  for (const { selector, action } of actions) {
    if (action === 'hide') hideElement(selector);
    else if (action === 'collapse') collapseElement(selector);
  }
}

/**
 * Reverse all mutations applied by this module, restoring the original DOM.
 * Safe to call even if no mutations have been applied.
 */
export function resetPage(): void {
  // Restore hidden elements
  queryAllPiercing<HTMLElement>(`[${ATTR_HIDDEN}]`).forEach(el => {
    el.style.removeProperty('display');
    el.removeAttribute('aria-hidden');
    el.removeAttribute(ATTR_HIDDEN);
  });

  // Restore collapsed elements — unwrap from disclosure widget
  queryAllPiercing<HTMLElement>(`[${ATTR_COLLAPSED}]`).forEach(el => {
    el.style.removeProperty('display');
    el.removeAttribute(ATTR_COLLAPSED);

    const wrapper = el.closest<HTMLElement>(`.${CLASS_WRAPPER}`);
    if (wrapper) {
      wrapper.replaceWith(el);
    }
  });
}

// ---------------------------------------------------------------------------
// Individual operations
// ---------------------------------------------------------------------------

/**
 * Remove a noise element from the visual flow while keeping it in the DOM
 * so the page's layout engine does not reflow surrounding content.
 */
function hideElement(selector: string): void {
  const el = safeQueryPiercing<HTMLElement>(selector);
  if (!el || isProtected(el) || el.hasAttribute(ATTR_HIDDEN)) return;

  el.style.setProperty('display', 'none', 'important');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute(ATTR_HIDDEN, 'true');
}

/**
 * Replace a borderline element with a togglable disclosure widget.
 * The user can expand the section on demand rather than having it hidden entirely.
 */
function collapseElement(selector: string): void {
  const el = safeQueryPiercing<HTMLElement>(selector);
  if (!el || isProtected(el) || el.hasAttribute(ATTR_COLLAPSED)) return;

  const wrapper = document.createElement('div');
  wrapper.className = CLASS_WRAPPER;
  wrapper.style.cssText = 'margin:4px 0;';

  const toggle = buildToggleButton();
  let expanded = false;

  el.style.display = 'none';
  el.setAttribute(ATTR_COLLAPSED, 'true');

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    el.style.display = expanded ? '' : 'none';
    toggle.textContent = expanded ? 'Hide section \u25be' : 'Show collapsed section \u25b8';
    toggle.setAttribute('aria-expanded', String(expanded));
  });

  el.parentNode?.insertBefore(wrapper, el);
  wrapper.appendChild(toggle);
  wrapper.appendChild(el);
}

/** Build the "Show/Hide section" toggle button inserted by collapseElement. */
function buildToggleButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'ni-collapse-toggle';
  btn.textContent = 'Show collapsed section \u25b8';
  btn.setAttribute('aria-expanded', 'false');
  btn.style.cssText = [
    'display:block',
    'font-size:11px',
    'padding:3px 8px',
    'margin:2px 0',
    'cursor:pointer',
    'opacity:0.65',
    'border:1px solid #ccc',
    'border-radius:4px',
    'background:#f5f5f5',
    'font-family:system-ui,sans-serif',
  ].join(';');
  return btn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for elements that must never be mutated (form controls, editable regions). */
function isProtected(el: Element): boolean {
  return PROTECTED_TAGS.has(el.tagName) || el.hasAttribute('contenteditable');
}
