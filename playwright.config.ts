/**
 * Playwright configuration for E2E extension tests.
 *
 * Key constraints for Chrome extension testing:
 *   - Must use a persistent context (launchPersistentContext), not the default browser
 *   - headless: false  — Chrome extensions do not work in headless mode
 *   - channel: 'chrome' — must be installed Chrome, not Playwright's bundled Chromium
 *
 * The extension is loaded from dist/ so run `npm run build` before `npm run test:e2e`.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,

  use: {
    // Extensions require a real Chrome channel
    channel: 'chrome',
    // Viewport matching the popup width
    viewport: { width: 1280, height: 800 },
    // Capture screenshots on failure
    screenshot: 'only-on-failure',
    // Capture traces on retry
    trace: 'on-first-retry',
  },

  // Run tests in a single worker because the persistent context is shared
  workers: 1,
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
