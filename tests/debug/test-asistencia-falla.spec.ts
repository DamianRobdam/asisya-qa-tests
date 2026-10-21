/**
 * SECCIÓN C — Test ORIGINAL entregado por Asisya (sin modificar la lógica).
 *
 * Se conserva tal cual para reproducir los fallos y dejar evidencia del "antes".
 * Única adaptación: la URL de producción (https://app.asisya.com) no es accesible
 * para el candidato, por lo que se ejecuta contra el mock con la variable
 * ORIGINAL_URL. Aun así, ESTE TEST FALLA por los errores intencionales del fragmento.
 *
 * Por defecto está marcado como `fixme` para no romper la suite de CI.
 * Para reproducir el fallo:   npm run test:debug:original
 * Análisis completo:           docs/seccion-c-debug.md
 */
import { test, expect } from '@playwright/test';

const ejecutarOriginal = !!process.env.RUN_ORIGINAL;

test('Solicitud de asistencia médica - flujo completo', async ({ page }) => {
  test.fixme(!ejecutarOriginal, 'Test defectuoso original — se ejecuta solo con RUN_ORIGINAL=1');
  test.setTimeout(20_000);

  await page.goto(process.env.ORIGINAL_URL || 'https://app.asisya.com');
  await page.locator('input[name="usuario"]').fill('usuario_test');
  await page.locator('input[name="clave"]').fill('clave123');
  await page.click('button[type="submit"]');

  await page.click('text="Solicitar asistencia"');
  await page.click('text="Asistencia médica a domicilio"');

  await page.locator('#direccion').fill('Calle 123 #45-67');
  await page.click('#btnConfirmar');

  const resultado = await page.locator('.resultado-confirmacion');
  await expect(resultado).toHaveText('Solicitud creada exitosamente');
});
