import { defineConfig } from '@playwright/test';

// Opens the built editor against a pretend server and checks it draws the 3D world. Build first: cd standalone && VITE_SERVICE_URL=http://api.test npm run build
export default defineConfig({
  testDir: './tests-editor',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  outputDir: 'editor-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1180, height: 820 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npx serve standalone/dist -s -l 4173 --no-clipboard', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
