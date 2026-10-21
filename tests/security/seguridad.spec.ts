/**
 * SECCIÓN D — Validación de seguridad básica (OWASP Top 10)
 *  - A03 Inyección: SQL Injection en login y en el parámetro de seguimiento
 *  - A03 Inyección: Cross Site Scripting (XSS) almacenado en la dirección
 *  - A07 Fallas de identificación: gestión de errores en el login (enumeración de usuarios,
 *    fuga de información técnica)
 */
import { test, expect } from '../fixtures/asisya.fixtures';

const PAYLOADS_SQLI = [`' OR '1'='1`, `admin'--`, `' OR 1=1;--`, `"; DROP TABLE solicitudes;--`];
const PAYLOAD_XSS = `<img src=x onerror="window.__xss=true">`;

test.describe('OWASP A03 · Inyección SQL', () => {
  for (const payload of PAYLOADS_SQLI) {
    test(`SEC-01 · Login rechaza payload SQLi: ${payload}`, async ({ request }) => {
      const res = await request.post('/api/auth/login', { data: { usuario: payload, clave: payload } });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.token).toBeUndefined();
      // No debe filtrar errores del motor de base de datos
      expect(JSON.stringify(body)).not.toMatch(/sql|syntax|stack|exception|ORA-|postgres/i);
    });
  }

  test('SEC-02 · Seguimiento rechaza payload SQLi en el parámetro id', async ({ request }) => {
    const res = await request.get(`/api/asisya/seguimiento?id=${encodeURIComponent(`ASY-000000' OR '1'='1`)}`);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('ID_INVALIDO');
  });
});

test.describe('OWASP A03 · Cross Site Scripting (XSS)', () => {
  test('SEC-03 · Un script en la dirección se muestra como texto y NO se ejecuta', async ({ paginaAutenticada: page, request, credenciales }) => {
    const res = await request.post('/api/asisya/solicitud-asistencia', {
      data: { usuarioId: credenciales.usuarioId, tipoAsistencia: 'medico_domicilio', direccion: PAYLOAD_XSS, fecha: '2026-10-23' },
    });
    const { id } = await res.json();

    let dialogo = false;
    page.on('dialog', async (d) => { dialogo = true; await d.dismiss(); });
    await page.goto(`/#/mi-asistencia/${id}`);

    // Se renderiza literalmente como texto
    await expect(page.getByTestId('direccion-solicitud')).toHaveText(PAYLOAD_XSS);
    // No se creó ningún elemento <img> inyectado ni se ejecutó el handler
    await expect(page.getByTestId('direccion-solicitud').locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(dialogo).toBe(false);
  });

  test('SEC-04 · La respuesta incluye cabeceras de mitigación (CSP, nosniff, X-Frame-Options)', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
  });
});

test.describe('OWASP A07 · Gestión de errores en el login', () => {
  test('SEC-05 · El mensaje es idéntico para usuario inexistente y clave incorrecta (sin enumeración)', async ({ request }) => {
    const r1 = await request.post('/api/auth/login', { data: { usuario: 'no_existe_123', clave: 'x' } });
    const r2 = await request.post('/api/auth/login', { data: { usuario: 'usuario_test', clave: 'incorrecta' } });
    expect(r1.status()).toBe(401);
    expect(r2.status()).toBe(401);
    expect(await r1.json()).toEqual(await r2.json());
  });

  test('SEC-06 · Un JSON malformado no expone stack trace', async ({ request }) => {
    const res = await request.post('/api/auth/login', { headers: { 'Content-Type': 'application/json' }, data: '{"usuario": "abc",' });
    expect(res.status()).toBe(400);
    const texto = await res.text();
    expect(texto).not.toMatch(/at .*\.js:\d+|node_modules|SyntaxError/);
  });

  test('SEC-07 · La UI muestra un error genérico y no inicia sesión', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Usuario').fill(`' OR '1'='1`);
    await page.getByLabel('Contraseña').fill('cualquiera');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByTestId('login-error')).toHaveText('Usuario o contraseña incorrectos');
    await expect(page.getByTestId('saludo')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
  });
});
