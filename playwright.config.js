import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true, reducedMotion: 'reduce' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://registration-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
  },
  reporter: 'list',
});
