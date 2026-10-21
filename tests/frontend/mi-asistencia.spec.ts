import { test, expect } from '../fixtures/asisya.fixtures';

/**
 * COMPONENTE 1 — FRONTEND WEB (Playwright)
 * Cubre los 4 puntos exigidos por la prueba:
 *  1. Ingreso al módulo "Mi Asistencia"
 *  2. Visualización del estado de la asistencia en tiempo real
 *  3. Validación de los datos del profesional asignado
 *  4. Uso de fixtures, espera automática y grabación de video (ver playwright.config.ts)
 *
 * Buenas prácticas aplicadas:
 *  - Localizadores por rol, label y data-testid (estables ante cambios de estilos).
 *  - Cero `waitForTimeout`: todas las esperas son aserciones web-first con reintento automático.
 *  - Cada test crea sus propios datos (fixture solicitudCreada) => independiente y paralelizable.
 */

test.describe('Mi Asistencia — seguimiento de la solicitud', () => {
  test('FE-01 · Ingreso al módulo "Mi Asistencia" desde el inicio', async ({ paginaAutenticada: page, solicitudCreada }) => {
    await page.getByTestId('btn-mi-asistencia').click();

    await expect(page).toHaveURL(/#\/mi-asistencia/);
    await expect(page.getByRole('heading', { name: 'Mi Asistencia' })).toBeVisible();
    await expect(page.getByTestId('ticket')).toHaveText(/^ASY-[0-9A-F]{6}$/);
    // La solicitud del fixture aparece en el historial del usuario
    await expect(page.getByRole('button', { name: new RegExp(solicitudCreada.id) })).toBeVisible();
  });

  test('FE-02 · El estado se actualiza en tiempo real sin recargar la página', async ({ paginaAutenticada: page, solicitudCreada }) => {
    await page.goto(`/#/mi-asistencia/${solicitudCreada.id}`);
    const estado = page.getByTestId('estado-asistencia');

    // Marcador: si la página se recargara, esta propiedad desaparecería
    await page.evaluate(() => ((window as any).__sinRecarga = true));

    // Espera automática: toHaveAttribute reintenta hasta que el SSE empuja cada estado
    await expect(estado).toHaveAttribute('data-estado', 'PROFESIONAL_ASIGNADO', { timeout: 10_000 });
    await expect(estado).toHaveText('Profesional asignado');
    await expect(estado).toHaveAttribute('data-estado', 'EN_CAMINO', { timeout: 10_000 });
    await expect(page.getByTestId('eta')).toHaveText(/Llegada estimada: \d+ min/);
    await expect(estado).toHaveAttribute('data-estado', 'EN_SITIO', { timeout: 10_000 });
    await expect(page.getByTestId('eta')).toHaveText('El profesional llegó al sitio');

    // La línea de tiempo marca como completados los estados recorridos
    await expect(page.getByTestId('timeline').locator('li.hecho')).toHaveCount(4);
    expect(await page.evaluate(() => (window as any).__sinRecarga)).toBe(true);
  });

  test('FE-03 · Los datos del profesional asignado coinciden con el backend', async ({ paginaAutenticada: page, solicitudCreada, request }) => {
    await page.goto(`/#/mi-asistencia/${solicitudCreada.id}`);
    await expect(page.getByTestId('profesional')).toBeVisible({ timeout: 10_000 });

    // Fuente de verdad: la API de seguimiento (no solo lo que pinta la UI)
    const api = await (await request.get(`/api/asisya/seguimiento?id=${solicitudCreada.id}`)).json();
    const p = api.profesional;
    expect(p, 'el backend ya debe tener profesional asignado').toBeTruthy();

    await expect(page.getByTestId('prof-nombre')).toHaveText(p.nombre);
    await expect(page.getByTestId('prof-especialidad')).toHaveText(p.especialidad);
    await expect(page.getByTestId('prof-registro')).toHaveText(p.registro);
    await expect(page.getByTestId('prof-telefono')).toHaveText(/^3\d{9}$/); // celular colombiano
    await expect(page.getByTestId('prof-calificacion')).toHaveText(`${p.calificacion} / 5`);
    await expect(page.getByTestId('direccion-solicitud')).toHaveText(solicitudCreada.direccion);
  });

  test('FE-04 · Flujo completo por UI: solicitar asistencia médica y verla en Mi Asistencia', async ({ paginaAutenticada: page }) => {
    await page.getByRole('button', { name: 'Solicitar Asistencia' }).click();
    await page.getByRole('button', { name: 'Asistencia médica a domicilio' }).click();

    const confirmar = page.locator('#btnConfirmar');
    await expect(confirmar).toBeDisabled(); // regla de negocio: sin dirección no se puede enviar
    await page.getByLabel('Dirección del servicio').fill('Calle 123 #45-67');
    await expect(confirmar).toBeEnabled();
    await confirmar.click();

    const resultado = page.getByTestId('resultado');
    await expect(resultado).toContainText('Solicitud creada exitosamente');
    const texto = await resultado.innerText();
    const ticket = texto.match(/ASY-[0-9A-F]{6}/)?.[0];
    expect(ticket, 'la confirmación debe incluir el número de ticket').toBeTruthy();

    await page.getByTestId('link-seguimiento').click();
    await expect(page.getByTestId('ticket')).toHaveText(ticket!);
    await expect(page.getByTestId('estado-asistencia')).toBeVisible();
  });

  test('FE-05 · Sin sesión, "Mi Asistencia" redirige al login', async ({ page }) => {
    await page.goto('/#/mi-asistencia');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});

test.describe('Mi Asistencia — usuario sin solicitudes', () => {
  test('FE-06 · Muestra mensaje vacío cuando el usuario no tiene solicitudes', async ({ page, request }) => {
    // Se intercepta la respuesta para aislar el escenario (sin depender del estado del servidor)
    await page.route('**/api/asisya/mis-solicitudes', (route) => route.fulfill({ status: 200, json: [] }));
    const login = await (await request.post('/api/auth/login', { data: { usuario: 'usuario_test', clave: 'clave123' } })).json();
    await page.goto('/');
    await page.evaluate((l) => {
      sessionStorage.setItem('token', l.token);
      sessionStorage.setItem('user', JSON.stringify(l.usuario));
    }, login);
    await page.goto('/#/mi-asistencia');
    await expect(page.getByTestId('sin-solicitudes')).toHaveText('No tienes solicitudes activas.');
  });
});
