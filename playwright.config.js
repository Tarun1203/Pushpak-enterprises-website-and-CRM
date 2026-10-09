const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-results/playwright-results.json' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', testIgnore: /browsers\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    // Other browsers run only the compatibility spec (CI: "Browser compatibility QA").
    { name: 'chromium-compat', testMatch: /browsers\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /browsers\.spec\.js/, use: { ...devices['Desktop Firefox'] } },
    { name: 'safari', testMatch: /browsers\.spec\.js/, use: { ...devices['Desktop Safari'] } },
    { name: 'android', testMatch: /browsers\.spec\.js/, use: { ...devices['Pixel 7'] } },
    { name: 'iphone', testMatch: /browsers\.spec\.js/, use: { ...devices['iPhone 13'] } },
    { name: 'tablet', testMatch: /browsers\.spec\.js/, use: { ...devices['iPad (gen 7)'] } },
  ],
  outputDir: 'qa-results/artifacts'
});
