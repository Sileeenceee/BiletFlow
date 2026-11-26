import { defineConfig } from '@playwright/test'

const baseURL = process.env.BILETFLOW_E2E_BASE_URL
if (!baseURL) {
  throw new Error('Set BILETFLOW_E2E_BASE_URL to the frontend of a disposable Development stack.')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: 'artifacts/playwright',
  use: { baseURL, locale: 'en-US', trace: 'retain-on-failure' },
})
