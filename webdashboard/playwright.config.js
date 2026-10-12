// Browser tests (SRV-31): the seeded e2e server on :8795 serving the built dist/, the installed
// Google Chrome (no download; E2E_CHANNEL=chromium after `npx playwright install chromium`),
// three widths. One worker: one seeded database, and specs that write reset it.
import { defineConfig } from '@playwright/test';

const channel = process.env.E2E_CHANNEL ?? 'chrome';
const browser = channel === 'chromium' ? {} : { channel };

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30000,
  reporter: [['list']],
  outputDir: 'test-results',
  webServer: {
    command: 'node e2e/server.mjs',
    url: 'http://127.0.0.1:8795/healthz',
    reuseExistingServer: false,
    timeout: 120000,
    stdout: 'pipe',
  },
  use: {
    baseURL: 'http://127.0.0.1:8795/dashboard/',
    headless: true,
    ...browser,
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    // A hung step fails fast and names itself (one run hung 1.3 min past the test timeout).
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
