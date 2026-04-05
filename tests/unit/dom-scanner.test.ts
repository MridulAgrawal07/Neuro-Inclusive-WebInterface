/**
 * Unit tests for the DOM scanner and supporting utilities.
 * Uses JSDOM (provided by Vitest's jsdom environment).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { scanDOM } from '@/content/scanner/dom-scanner';
import { getUniqueSelector, SemanticMap } from '@/content/scanner/semantic-map';
import { extractMainContent } from '@/content/scanner/readability';

// ---------------------------------------------------------------------------
// getUniqueSelector
// ---------------------------------------------------------------------------

describe('getUniqueSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers the element id', () => {
    document.body.innerHTML = '<div id="hero"><p>text</p></div>';
    const el = document.getElementById('hero')!;
    expect(getUniqueSelector(el)).toBe('#hero');
  });

  it('falls back to tag:nth-of-type chain when no id', () => {
    document.body.innerHTML = '<div><p>first</p><p>second</p></div>';
    const second = document.querySelectorAll('p')[1];
    const selector = getUniqueSelector(second);
    expect(selector).toContain('p:nth-of-type(2)');
  });
});

// ---------------------------------------------------------------------------
// SemanticMap
// ---------------------------------------------------------------------------

describe('SemanticMap', () => {
  it('stores and retrieves elements by selector', () => {
    const map = new SemanticMap();
    const meta = {
      selector: '#foo',
      tag: 'div',
      role: null,
      classes: [],
      rect: { x: 0, y: 0, width: 100, height: 50 },
      zIndex: 0,
      textContent: 'hello',
    };
    map.add(meta);
    expect(map.get('#foo')).toEqual(meta);
    expect(map.size()).toBe(1);
  });

  it('filters by role', () => {
    const map = new SemanticMap();
    map.add({ selector: '#a', tag: 'nav', role: 'navigation', classes: [], rect: { x: 0, y: 0, width: 0, height: 0 }, zIndex: 0, textContent: '' });
    map.add({ selector: '#b', tag: 'div', role: 'main', classes: [], rect: { x: 0, y: 0, width: 0, height: 0 }, zIndex: 0, textContent: '' });
    expect(map.getByRole('navigation')).toHaveLength(1);
    expect(map.getByRole('main')).toHaveLength(1);
    expect(map.getByRole('banner')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractMainContent
// ---------------------------------------------------------------------------

describe('extractMainContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns <main> when present and has substantial text', () => {
    document.body.innerHTML = `
      <header><nav>nav</nav></header>
      <main><p>${'Lorem ipsum '.repeat(30)}</p></main>
      <footer>footer</footer>
    `;
    const content = extractMainContent();
    expect(content.tagName.toLowerCase()).toBe('main');
  });

  it('returns [role="main"] when <main> is absent', () => {
    document.body.innerHTML = `
      <div role="main"><p>${'Article text '.repeat(30)}</p></div>
    `;
    const content = extractMainContent();
    expect(content.getAttribute('role')).toBe('main');
  });

  it('falls back to document.body when no content region found', () => {
    document.body.innerHTML = '<p>short</p>';
    const content = extractMainContent();
    expect(content).toBe(document.body);
  });
});

// ---------------------------------------------------------------------------
// scanDOM
// ---------------------------------------------------------------------------

describe('scanDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns metadata for visible elements', () => {
    document.body.innerHTML = `
      <div id="container" style="width:200px;height:100px">
        <p style="width:100px;height:20px">Hello</p>
      </div>
    `;
    const results = scanDOM(document.body);
    const tags = results.map(r => r.tag);
    expect(tags).toContain('div');
    expect(tags).toContain('p');
  });

  it('skips <script> and <style> tags', () => {
    document.body.innerHTML = `
      <script>var x = 1;</script>
      <style>body{}</style>
      <p style="width:50px;height:20px">visible</p>
    `;
    const results = scanDOM(document.body);
    const tags = results.map(r => r.tag);
    expect(tags).not.toContain('script');
    expect(tags).not.toContain('style');
  });
});
