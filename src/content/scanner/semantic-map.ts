/**
 * SemanticMap — an in-memory registry of scanned ElementMetadata objects,
 * indexed by their unique CSS selector for O(1) lookups.
 */

import type { ElementMetadata } from '@/shared/types';

/**
 * Keyed store of ElementMetadata produced by the DOM scanner.
 * Used by agents that need to query elements by selector or ARIA role.
 */
export class SemanticMap {
  private elements: Map<string, ElementMetadata> = new Map();

  /** Add or overwrite an element entry. */
  add(meta: ElementMetadata): void {
    this.elements.set(meta.selector, meta);
  }

  /** Retrieve metadata by unique selector, or undefined if not found. */
  get(selector: string): ElementMetadata | undefined {
    return this.elements.get(selector);
  }

  /** Return all registered elements in insertion order. */
  getAll(): ElementMetadata[] {
    return Array.from(this.elements.values());
  }

  /** Filter elements by their explicit or implicit ARIA role. */
  getByRole(role: string): ElementMetadata[] {
    return this.getAll().filter(el => el.role === role);
  }

  /** Total number of registered elements. */
  size(): number {
    return this.elements.size;
  }
}

/**
 * Generates a unique CSS selector for an element.
 * Prefers #id, falls back to tag:nth-of-type chains.
 * Crosses shadow boundaries using ' >>> ' separator.
 */
export function getUniqueSelector(el: Element): string {
  const isGlobalId = el.id && el.getRootNode() === document;
  if (isGlobalId) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    if (current.id && current.getRootNode() === document) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    let part = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement as HTMLElement | null;

    if (parent) {
      const children = Array.from(parent.children as HTMLCollection) as Element[];
      const siblings = children.filter(
        c => c.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
      parts.unshift(part);
      current = parent;
    } else {
      const root = current.getRootNode();
      if (current.id) {
         // It has an ID local to its shadow root, use it as a shortcut within this shadow context
         part = `#${CSS.escape(current.id)}`;
      }
      parts.unshift(part);
      if (root instanceof ShadowRoot) {
        parts.unshift('>>>');
        current = root.host as Element;
      } else {
        break;
      }
    }
  }

  let selector = '';
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      selector += parts[i];
    } else if (parts[i] === '>>>') {
      selector += ' >>> ';
    } else if (parts[i - 1] === '>>>') {
      selector += parts[i];
    } else {
      selector += ` > ${parts[i]}`;
    }
  }

  return selector;
}
