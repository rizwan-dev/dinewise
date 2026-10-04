import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against the running stack (`docker compose up`).
 *
 * One worker: tests share one restaurant, its kitchen slots and its tables, and running them in
 * parallel would make them compete for the same capacity.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8082',
    trace: 'retain-on-failure',
  },
  projects: [
    // Customers order from their phones; the main target.
    { name: 'android', use: { ...devices['Pixel 7'] }, testIgnore: /screenshots/ },
    { name: 'screenshots', testMatch: /screenshots/ },
  ],
})
