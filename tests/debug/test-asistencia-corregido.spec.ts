/**
 * SECCIÓN C — Test CORREGIDO.
 * Cada corrección está numerada y referenciada al análisis en docs/seccion-c-debug.md.
 */
import { test, expect } from '../fixtures/asisya.fixtures';

test('Solicitud de asistencia médica - flujo completo (corregido)', async ({ page, credenciales }) => {
  // [C1] URL: baseURL desde la configuración/entorno, no la URL de producción quemada.
  await page.goto('/');

  // [C2] Credenciales desde fixture (variables de entorno), no en el código.
  // [C3] Localizadores accesibles por label/rol en lugar de selectores CSS frágiles.
  await page.getByLabel('Usuario').fill(credenciales.usuario);
  await page.getByLabel('Contraseña').fill(credenciales.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // [C4] Sincronización: se confirma que el login terminó antes de seguir (estado de negocio, no sleep).
  await expect(page.getByTestId('saludo')).toBeVisible();

  // [C5] El texto real del botón es "Solicitar Asistencia" (A mayúscula). El selector
  //      text="..." con comillas es EXACTO y sensible a mayúsculas -> nunca encontraba el botón.
  //      getByRole + name evita depender del formato exacto del texto.
  await page.getByRole('button', { name: /solicitar asistencia/i }).click();
  await page.getByRole('button', { name: 'Asistencia médica a domicilio' }).click();

  // [C6] El formulario carga de forma asíncrona y el botón inicia deshabilitado hasta tener
  //      una dirección válida: se verifica explícitamente cada precondición.
  const direccion = page.getByLabel('Dirección del servicio');
  await expect(direccion).toBeVisible();
  await direccion.fill('Calle 123 #45-67');
  const confirmar = page.locator('#btnConfirmar');
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  // [C7] `await page.locator()` era innecesario: un Locator es perezoso, no una promesa.
  const resultado = page.locator('.resultado-confirmacion');

  // [C8] toHaveText exige coincidencia EXACTA, pero el mensaje real incluye el ticket dinámico
  //      ("Solicitud creada exitosamente · Ticket ASY-XXXXXX Ver en Mi Asistencia").
  //      Se valida el mensaje con toContainText y el ticket con una expresión regular.
  await expect(resultado).toContainText('Solicitud creada exitosamente');
  await expect(resultado).toHaveText(/Ticket ASY-[0-9A-F]{6}/);

  // [C9] Aserción de negocio adicional: la solicitud realmente quedó registrada en el backend.
  const ticket = (await resultado.innerText()).match(/ASY-[0-9A-F]{6}/)![0];
  const seguimiento = await page.request.get(`/api/asisya/seguimiento?id=${ticket}`);
  expect(seguimiento.status()).toBe(200);
  expect((await seguimiento.json()).tipoAsistencia).toBe('medico_domicilio');
});
