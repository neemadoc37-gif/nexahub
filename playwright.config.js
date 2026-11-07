const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');

// Replit supplies Chromium; elsewhere use Playwright's installed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './generated-artifacts/playwright',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    locale: 'en-KE',
    browserName: 'chromium',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 server.py',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
