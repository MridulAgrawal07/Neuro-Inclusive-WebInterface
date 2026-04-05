/**
 * Style Injector — Simplified (font-only).
 *
 * Injects a single <style> tag that applies the --ni-font-family
 * custom property to text elements when body.ni-active is set.
 */

const STYLE_ELEMENT_ID = 'ni-injected-styles';

/**
 * Inject the base <style> tag into the given root context.
 * Idempotent — safe to call multiple times.
 */
export function injectBaseStyles(root: Document | ShadowRoot = document): void {
  const target = 'head' in root ? root.head : root;
  if (target.querySelector(`#${STYLE_ELEMENT_ID}`)) return;

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = BASE_CSS;
  target.appendChild(style);
}

/** Set a single CSS custom property on :root. */
export function setCSSProperty(property: string, value: string): void {
  document.documentElement.style.setProperty(property, value);
}

/** Set multiple CSS custom properties in one call. */
export function setCSSProperties(props: Record<string, string>): void {
  for (const [property, value] of Object.entries(props)) {
    setCSSProperty(property, value);
  }
}

/** Remove a single CSS custom property from :root. */
export function removeCSSProperty(property: string): void {
  document.documentElement.style.removeProperty(property);
}

/**
 * Remove the injected <style> tag and all --ni-* custom properties,
 * fully restoring the original page appearance.
 */
export function resetStyles(): void {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();

  const allProps = Array.from(document.documentElement.style).filter(p =>
    p.startsWith('--ni-'),
  );
  allProps.forEach(p => document.documentElement.style.removeProperty(p));
}

// ---------------------------------------------------------------------------
// Base CSS — font only
// ---------------------------------------------------------------------------

const BASE_CSS = `
/* =========================================================
   Neuro-Inclusive — injected stylesheet (font-only)
   ========================================================= */

/* --- Custom property default ------------------------------------------- */
:root {
  --ni-font-family: inherit;
}

/* --- Apply font to all text elements when active ----------------------- */
body.ni-active,
body.ni-active p,
body.ni-active li,
body.ni-active span,
body.ni-active div,
body.ni-active h1,
body.ni-active h2,
body.ni-active h3,
body.ni-active h4,
body.ni-active h5,
body.ni-active h6,
body.ni-active blockquote,
body.ni-active td,
body.ni-active th,
body.ni-active figcaption,
body.ni-active label,
body.ni-active a {
  font-family: var(--ni-font-family) !important;
}
`;
