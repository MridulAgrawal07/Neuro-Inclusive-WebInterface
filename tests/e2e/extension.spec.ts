/**
 * E2E tests for the Neuro-Inclusive Chrome extension.
 *
 * Uses Playwright's persistent context API to load the built extension
 * from the dist/ folder, then exercises the full pipeline on:
 *   - The local sample-page.html fixture
 *   - Key popup interactions
 *
 * Prerequisites:
 *   1. Build the extension first:  npm run build
 *   2. Run tests:                  npm run test:e2e
 *
 * Playwright config (playwright.config.ts) must set:
 *   use: { channel: 'chrome' }  — extensions only work in Chrome, not Chromium
 */

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const SAMPLE_PAGE_PATH = path.resolve(__dirname, 'fixtures/sample-page.html');
const SAMPLE_PAGE_URL = `file://${SAMPLE_PAGE_PATH.replace(/\\/g, '/')}`;

// ---------------------------------------------------------------------------
// Context lifecycle
// ---------------------------------------------------------------------------

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions cannot run in headless mode
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  // Resolve the extension ID from the service worker URL
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  extensionId = new URL(background.url()).hostname;
});

test.afterAll(async () => {
  await context.close();
});

// ---------------------------------------------------------------------------
// Helper: open a new page and navigate
// ---------------------------------------------------------------------------

async function openPage(url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

// ---------------------------------------------------------------------------
// Extension loads
// ---------------------------------------------------------------------------

test.describe('Extension lifecycle', () => {
  test('service worker registers without errors', async () => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('popup page renders', async () => {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const page = await openPage(popupUrl);

    await expect(page.getByRole('heading', { name: /neuro-inclusive/i })).toBeVisible();
    await expect(page.getByText(/web accessibility extension/i)).toBeVisible();
    await page.close();
  });

  test('popup shows profile selector with four profiles', async () => {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const page = await openPage(popupUrl);

    for (const label of ['ADHD', 'Autism', 'Dyslexia', 'Custom']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
    await page.close();
  });
});

// ---------------------------------------------------------------------------
// Sample page: noise removal
// ---------------------------------------------------------------------------

test.describe('Content script on sample page', () => {
  let page: Page;

  test.beforeEach(async () => {
    page = await openPage(SAMPLE_PAGE_URL);
    // Give content script time to run (document_idle fires after load)
    await page.waitForTimeout(1500);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('page loads without extension JS errors', async () => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const extensionErrors = errors.filter(e =>
      e.includes('[NI]') || e.includes('neuro-inclusive'),
    );
    expect(extensionErrors).toHaveLength(0);
  });

  test('cookie banner is hidden after pipeline runs', async () => {
    const banner = page.locator('#cookie-banner');
    const isHidden = await banner.evaluate(el =>
      window.getComputedStyle(el).display === 'none' ||
      el.getAttribute('aria-hidden') === 'true',
    );
    expect(isHidden).toBe(true);
  });

  test('newsletter popup is hidden after pipeline runs', async () => {
    const popup = page.locator('#newsletter-popup');
    const isHidden = await popup.evaluate(el =>
      window.getComputedStyle(el).display === 'none' ||
      el.getAttribute('aria-hidden') === 'true',
    );
    expect(isHidden).toBe(true);
  });

  test('ad sidebar is hidden after pipeline runs', async () => {
    const sidebar = page.locator('#ad-sidebar');
    const isHidden = await sidebar.evaluate(el =>
      window.getComputedStyle(el).display === 'none' ||
      el.getAttribute('aria-hidden') === 'true',
    );
    expect(isHidden).toBe(true);
  });

  test('main article content is preserved and visible', async () => {
    const heading = page.getByRole('heading', {
      name: /scientists discover new method/i,
    });
    await expect(heading).toBeVisible();
  });

  test('score badge is injected into page', async () => {
    const host = page.locator('#ni-score-badge-host');
    await expect(host).toBeAttached();
  });

  test('base styles element is injected', async () => {
    const styleEl = page.locator('#ni-injected-styles');
    await expect(styleEl).toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// Popup interactions
// ---------------------------------------------------------------------------

test.describe('Popup interactions', () => {
  let popup: Page;

  test.beforeEach(async () => {
    popup = await openPage(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await popup.close();
  });

  test('switching profile updates active button aria-pressed', async () => {
    const autismBtn = popup.getByRole('button', { name: 'Autism' });
    await autismBtn.click();
    await expect(autismBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('feature toggle switches change aria-checked state', async () => {
    const toggle = popup.getByRole('switch', { name: /adjust fonts/i });
    const initialState = await toggle.getAttribute('aria-checked');
    await toggle.click();
    const newState = await toggle.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);
  });

  test('reset button is present and clickable', async () => {
    const resetBtn = popup.getByRole('button', { name: /reset page/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click(); // Should not throw
  });

  test('apply button is present', async () => {
    const applyBtn = popup.getByRole('button', { name: /apply to this page/i });
    await expect(applyBtn).toBeVisible();
  });

  test('score section renders', async () => {
    const scoreSection = popup.getByText(/accessibility score/i).first();
    await expect(scoreSection).toBeVisible();
  });

  test('api key input is visible', async () => {
    const input = popup.getByPlaceholder(/sk-ant/i);
    await expect(input).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Reset flow
// ---------------------------------------------------------------------------

test.describe('Reset page flow', () => {
  test('reset removes injected styles from sample page', async () => {
    const page = await openPage(SAMPLE_PAGE_URL);
    await page.waitForTimeout(1500);

    const hasBaseStyles = await page.evaluate(() =>
      document.getElementById('ni-injected-styles') !== null,
    );
    expect(hasBaseStyles).toBe(true);

    // Trigger reset via chrome.runtime message directly from page context
    await page.evaluate(() => {
      chrome.runtime.sendMessage({ type: 'RESET_PAGE' });
    });
    await page.waitForTimeout(600);

    const hasStylesAfterReset = await page.evaluate(() =>
      document.getElementById('ni-injected-styles') !== null,
    );
    expect(hasStylesAfterReset).toBe(false);

    await page.close();
  });
});

// ---------------------------------------------------------------------------
// Performance: non-AI pipeline < 500ms
// ---------------------------------------------------------------------------

test.describe('Performance', () => {
  test('non-AI pipeline completes within 500ms', async () => {
    const page = await openPage(SAMPLE_PAGE_URL);

    // Wait for the NI performance measure to be available (set by content script)
    const duration = await page.evaluate(
      async (): Promise<number> =>
        new Promise(resolve => {
          const check = () => {
            const entries = performance.getEntriesByName('ni-pipeline-total');
            if (entries.length > 0) {
              resolve(entries[0].duration);
            } else {
              setTimeout(check, 50);
            }
          };
          check();
        }),
    );

    // Non-AI pipeline must complete in < 500ms
    expect(duration).toBeLessThan(500);
    await page.close();
  });
});

// ---------------------------------------------------------------------------
// Onboarding page
// ---------------------------------------------------------------------------

test.describe('Onboarding page', () => {
  test('onboarding page renders with welcome heading', async () => {
    const page = await openPage(
      `chrome-extension://${extensionId}/onboarding.html`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await page.close();
  });

  test('onboarding shows profile selection buttons', async () => {
    const page = await openPage(
      `chrome-extension://${extensionId}/onboarding.html`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('button', { name: /adhd/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /autism/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /dyslexia/i })).toBeVisible();
    await page.close();
  });

  test('onboarding allows entering an API key', async () => {
    const page = await openPage(
      `chrome-extension://${extensionId}/onboarding.html`,
    );
    await page.waitForLoadState('domcontentloaded');

    const input = page.getByPlaceholder(/sk-ant/i);
    await expect(input).toBeVisible();
    await input.fill('sk-ant-api03-test-key');
    await expect(input).toHaveValue('sk-ant-api03-test-key');
    await page.close();
  });
});

// ---------------------------------------------------------------------------
// Accessibility: popup a11y audit
// ---------------------------------------------------------------------------

test.describe('Popup accessibility', () => {
  test('profile buttons have aria-pressed attribute', async () => {
    const popup = await openPage(`chrome-extension://${extensionId}/popup.html`);

    for (const name of ['ADHD', 'Autism', 'Dyslexia', 'Custom']) {
      const btn = popup.getByRole('button', { name });
      const pressed = await btn.getAttribute('aria-pressed');
      expect(pressed === 'true' || pressed === 'false').toBe(true);
    }
    await popup.close();
  });

  test('feature toggles use role="switch" with aria-checked', async () => {
    const popup = await openPage(`chrome-extension://${extensionId}/popup.html`);

    const switches = popup.getByRole('switch');
    const count = await switches.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const checked = await switches.nth(i).getAttribute('aria-checked');
      expect(checked === 'true' || checked === 'false').toBe(true);
    }
    await popup.close();
  });

  test('all interactive elements are keyboard reachable via Tab', async () => {
    const popup = await openPage(`chrome-extension://${extensionId}/popup.html`);

    const focusable: string[] = [];
    await popup.keyboard.press('Tab');

    for (let i = 0; i < 25; i++) {
      const tag = await popup.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return `${el.tagName}`;
      });
      if (!tag) break;
      focusable.push(tag);
      await popup.keyboard.press('Tab');
    }

    // At minimum: profile buttons + intensity + toggles + actions
    expect(focusable.length).toBeGreaterThan(5);
    await popup.close();
  });

  test('score progress bars have aria-valuenow, aria-valuemin, aria-valuemax', async () => {
    const popup = await openPage(`chrome-extension://${extensionId}/popup.html`);

    // Score display is shown when showScore is enabled (default)
    const bars = popup.getByRole('progressbar');
    const count = await bars.count();

    if (count > 0) {
      const first = bars.first();
      await expect(first).toHaveAttribute('aria-valuemin', '0');
      await expect(first).toHaveAttribute('aria-valuemax', '100');
    }
    await popup.close();
  });
});
