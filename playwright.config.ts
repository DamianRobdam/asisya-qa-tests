import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración central de Playwright.
 * - baseURL por variable de entorno: el mismo código corre contra el mock local,
 *   QA o staging sin tocar los tests (corrige el error de URL quemada de la Sección C).
 * - Paralelización con workers + fullyParallel (bonus).
 * - Video, trace y screenshot como evidencia.
 */
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/playwright-results.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    // DEMO=1 ralentiza las acciones para grabar los videos de la entrega
    launchOptions: { slowMo: process.env.DEMO ? 450 : 0 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    actionTimeout: 10_000,
  },
  outputDir: 'test-results',
  projects: [
    { name: 'frontend', testDir: './tests/frontend', use: { ...devices['Desktop Chrome'] } },
    { name: 'debug-seccion-c', testDir: './tests/debug', use: { ...devices['Desktop Chrome'] } },
    { name: 'seguridad', testDir: './tests/security', use: { ...devices['Desktop Chrome'] } },
  ],
  // Levanta el SUT simulado automáticamente (no aplica si BASE_URL apunta a un ambiente real)
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node app/server.js',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(PORT), STATUS_STEP_MS: '1500' },
      },
});
