import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Fixtures reutilizables.
 *
 *  credenciales      -> datos de prueba leídos de variables de entorno (nunca quemados en el test).
 *  paginaAutenticada -> página ya logueada por la UI, lista para usar.
 *  solicitudCreada   -> crea una solicitud por API (setup rápido y aislado) y devuelve su id,
 *                       así cada test tiene SUS propios datos y puede correr en paralelo.
 */
type Credenciales = { usuario: string; clave: string; usuarioId: string };

type Fixtures = {
  credenciales: Credenciales;
  paginaAutenticada: Page;
  solicitudCreada: { id: string; direccion: string };
};

export async function iniciarSesionUI(page: Page, c: Credenciales) {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(c.usuario);
  await page.getByLabel('Contraseña').fill(c.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  // Espera explícita a un estado de negocio (no un sleep): el saludo confirma la sesión
  await expect(page.getByTestId('saludo')).toBeVisible();
}

export async function crearSolicitudAPI(request: APIRequestContext, usuarioId: string, direccion: string) {
  const res = await request.post('/api/asisya/solicitud-asistencia', {
    data: { usuarioId, tipoAsistencia: 'medico_domicilio', direccion, fecha: new Date().toISOString().slice(0, 10) },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { id: string };
}

export const test = base.extend<Fixtures>({
  credenciales: async ({}, use) => {
    await use({
      usuario: process.env.ASISYA_USER || 'usuario_test',
      clave: process.env.ASISYA_PASS || 'clave123',
      usuarioId: process.env.ASISYA_USER_ID || 'USR999',
    });
  },

  paginaAutenticada: async ({ page, credenciales }, use) => {
    await iniciarSesionUI(page, credenciales);
    await use(page);
  },

  solicitudCreada: async ({ request, credenciales }, use, testInfo) => {
    // Dirección única por test: evita colisiones entre workers paralelos
    const direccion = `Cra 12 #34-56 · ${testInfo.workerIndex}-${Date.now()}`;
    const { id } = await crearSolicitudAPI(request, credenciales.usuarioId, direccion);
    await use({ id, direccion });
  },
});

export { expect };
