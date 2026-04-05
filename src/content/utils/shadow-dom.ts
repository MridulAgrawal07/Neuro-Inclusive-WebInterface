/**
 * Utilities for traversing and styling across Shadow DOM boundaries.
 */

/**
 * Perform a TreeWalker-like traversal, but recursively pierce open ShadowRoots.
 * Returns a flat array of nodes that pass the filter and acceptNode condition.
 */
export function walkPiercingShadow(
  root: Node,
  whatToShow: number,
  acceptNode?: (node: Node) => number,
): Node[] {
  const results: Node[] = [];
  const walker = document.createTreeWalker(
    root,
    whatToShow | NodeFilter.SHOW_ELEMENT, // Ensure we see elements to check for shadowRoot
    {
      acceptNode(node) {
        // If we're looking for something specific (e.g. text nodes), and it's an element,
        // we might still need to accept it to traverse into its children/shadowRoot.
        // Actually, createTreeWalker automatically traverses children even if the parent is skipped,
        // UNLESS it's rejected. So we should just accept what was requested, and handle shadow roots manually.
        if (acceptNode) {
          const res = acceptNode(node);
          // If the node itself is what we want, return its res.
          // Note: if NodeFilter.SHOW_ELEMENT isn't in whatToShow, elements won't reach acceptNode natively
          // unless whatToShow includes them.
          return res;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const isRelevant = (node: Node) => {
    if (whatToShow === NodeFilter.SHOW_ALL) return true;
    if (whatToShow === NodeFilter.SHOW_ELEMENT && node.nodeType === Node.ELEMENT_NODE) return true;
    if (whatToShow === NodeFilter.SHOW_TEXT && node.nodeType === Node.TEXT_NODE) return true;
    return false;
  };

  let node = walker.nextNode();
  while (node) {
    let accepted = true;
    if (acceptNode) {
      accepted = acceptNode(node) === NodeFilter.FILTER_ACCEPT;
    }
    
    if (accepted && isRelevant(node)) {
      results.push(node);
    }

    // If it's an element, check for a shadow root manually.
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.shadowRoot) {
        // Recursively walk the shadow root
        const shadowResults = walkPiercingShadow(el.shadowRoot, whatToShow, acceptNode);
        results.push(...shadowResults);
      }
    }
    node = walker.nextNode();
  }

  return results;
}

/**
 * Find all elements matching a selector, piercing through all open shadow roots globally.
 */
export function queryAllPiercing<T extends Element = Element>(
  selector: string,
  root: Document | ShadowRoot | Element = document,
): T[] {
  const results: T[] = Array.from(root.querySelectorAll<T>(selector));
  
  // Find all elements in this root that might have a shadow root
  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      results.push(...queryAllPiercing<T>(selector, el.shadowRoot));
    }
  }

  return results;
}

/**
 * Resolves a custom unique selector path (e.g. "#app >>> .player >>> .btn")
 * by traversing iteratively through shadow roots.
 */
export function safeQueryPiercing<T extends Element = Element>(selectorPath: string): T | null {
  try {
    const parts = selectorPath.split(' >>> ');
    let currentCtx: Document | ShadowRoot | Element = document;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const match: Element | null = (currentCtx as any).querySelector(part);
      if (!match) return null;

      if (i === parts.length - 1) {
        return match as T;
      }

      if (!match.shadowRoot) return null;
      currentCtx = match.shadowRoot;
    }
    return null;
  } catch {
    return null;
  }
}
