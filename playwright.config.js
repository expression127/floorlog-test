// Suite 6 (brief section 11, item 6): Playwright at 390x844 in light and
// dark; every screen renders, no horizontal scroll, no console errors, tap
// targets at least 44px, log flow works with the network blocked and syncs
// when restored.
module.exports = {
  testDir: './tests-pw',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  webServer: {
    command: 'python -m http.server 8421',
    port: 8421,
    reuseExistingServer: true,
    timeout: 15000
  },
  use: {
    baseURL: 'http://localhost:8421',
    viewport: { width: 390, height: 844 }
  }
};
