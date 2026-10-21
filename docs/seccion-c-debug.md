# Sección C — Debug y mejora del test `test-asistencia-falla.spec.ts`

**Candidato:** Robinson Damián Calderón Ávila · **Cargo:** Ingeniero QA — Asisya

## 1. Metodología

1. Ejecuté el test **original sin cambios de lógica** contra el ambiente simulado (`RUN_ORIGINAL=1`). Lo único que cambié fue la URL, porque `https://app.asisya.com` no es accesible desde fuera de Asisya.
2. Corregí **un error a la vez** y volví a ejecutar. Así se ven los fallos *en cascada*: cada fallo enmascara al siguiente.
3. Clasifiqué cada hallazgo según las categorías del enunciado: **locator, tiempo, lógica y flakiness**.
4. Escribí la versión corregida (`tests/debug/test-asistencia-corregido.spec.ts`) y la ejecuté 3 veces seguidas con `--repeat-each=3` para descartar inestabilidad.

## 2. Evidencia del fallo (antes)

**Ejecución 1, test original** (`docs/evidencias/01-original-fallo-selector.log`):

```
TimeoutError: page.click: Timeout 10000ms exceeded.
  - waiting for locator('text="Solicitar asistencia"')
```

**Ejecución 2, corrigiendo solo el selector** (`docs/evidencias/02-original-fallo-assert-texto.log`):

```
Error: expect(locator).toHaveText(expected) failed
Locator:  locator('.resultado-confirmacion')
Expected: "Solicitud creada exitosamente"
  - unexpected value "Solicitud creada exitosamente · Ticket ASY-4DF7FB Ver en Mi Asistencia"
```

## 3. Causas identificadas

| # | Línea original | Categoría | Causa probable | Impacto |
|---|---|---|---|---|
| C1 | `page.goto('https://app.asisya.com')` | Lógica / ambiente | URL de **producción quemada** en el código. El test no se puede ejecutar en QA o staging, y en CI podría generar datos reales en producción. | Bloqueante fuera de producción |
| C2 | `.fill('usuario_test')`, `.fill('clave123')` | Seguridad / mantenibilidad | **Credenciales en el código fuente**: quedan expuestas en el repositorio y no se pueden rotar por ambiente. | Riesgo de seguridad |
| C3 | `input[name="usuario"]`, `button[type="submit"]` | Locator (frágil) | Son selectores CSS atados a la implementación. Cualquier refactor del formulario los rompe aunque la funcionalidad siga bien. | Mantenimiento |
| C4 | `page.click(submit)` y luego `page.click('text=...')` | Tiempo / flakiness | No hay **ninguna verificación de que el login terminó**. Si el login tarda o falla, el error aparece en el paso siguiente con un mensaje engañoso ("no encuentra el botón") y no en el login. | Diagnóstico difícil, intermitencia |
| C5 | `page.click('text="Solicitar asistencia"')` | **Locator (fallo principal)** | El selector `text="..."` **entre comillas es exacto y distingue mayúsculas**. El botón real dice **"Solicitar Asistencia"** (A mayúscula), así que el elemento nunca se encuentra. | **Fallo 100 % reproducible** |
| C6 | `#direccion` y `#btnConfirmar` sin precondiciones | Tiempo | El formulario **carga de forma asíncrona** y el botón **arranca deshabilitado** hasta que hay una dirección válida. El auto-wait de Playwright lo absorbe, pero el test no deja explícita esa regla de negocio, y si cambia el umbral de validación el fallo sería opaco. | Flakiness potencial |
| C7 | `const resultado = await page.locator(...)` | Lógica (mala práctica) | `locator()` devuelve un **Locator perezoso, no una promesa**. El `await` sobra y confunde: da a entender que el elemento ya se resolvió. | Legibilidad |
| C8 | `toHaveText('Solicitud creada exitosamente')` | **Lógica (fallo secundario)** | `toHaveText` con string exige **coincidencia exacta del texto completo**, pero la confirmación real incluye un **ticket dinámico** (`· Ticket ASY-XXXXXX`) y un enlace. Nunca coincide. | **Fallo 100 % reproducible** |
| C9 | Fin del test | Cobertura | Solo valida un texto en pantalla. **No confirma que la solicitud exista en el backend**, así que un falso positivo de la UI pasaría sin ser detectado. | Falso positivo |

## 4. Correcciones aplicadas

Cada corrección está marcada en el código con su identificador (`[C1]` … `[C9]`).

| # | Corrección | Justificación |
|---|---|---|
| C1 | `page.goto('/')` con `baseURL` desde `playwright.config.ts` (variable `BASE_URL`) | Permite ejecutar el mismo test en local, QA o staging. |
| C2 | Credenciales desde el fixture `credenciales`, que lee `ASISYA_USER` y `ASISYA_PASS` | No hay secretos en el repositorio; en CI se usan *secrets*. |
| C3 | `getByLabel('Usuario')`, `getByRole('button', { name: 'Ingresar' })` | Son localizadores accesibles, recomendados por Playwright y resistentes a refactors de CSS. |
| C4 | `await expect(page.getByTestId('saludo')).toBeVisible()` | Es una espera por un **estado de negocio**, sin `sleep`, y localiza el fallo en el paso correcto. |
| C5 | `getByRole('button', { name: /solicitar asistencia/i })` | No depende de mayúsculas ni del formato exacto del texto. |
| C6 | `expect(direccion).toBeVisible()` y `expect(confirmar).toBeEnabled()` antes del clic | Deja documentada la regla de negocio y hace el test determinista. |
| C7 | Se quitó el `await` innecesario | Uso correcto de la API de Locator. |
| C8 | `toContainText('Solicitud creada exitosamente')` + `toHaveText(/Ticket ASY-[0-9A-F]{6}/)` | Valida el mensaje **y** el formato del ticket dinámico. |
| C9 | Consulta `GET /api/asisya/seguimiento?id=<ticket>` y verifica `tipoAsistencia` | Contrasta la UI contra la fuente de verdad. |

## 5. Evidencia de funcionamiento (después)

- **Ejecución:** `npm run test:debug` → `1 passed`. Con `--repeat-each=3` → `3 passed`, sin intermitencia.
- **Video:** `evidencias/videos/seccion-c-test-corregido.mp4`.
- **Log:** `docs/evidencias/03-corregido-ok.log`.
- **Reporte HTML de Playwright:** `reports/playwright-html/index.html`, con traza, video y pasos.

## 6. Recomendaciones para evitar regresiones

- Acordar con desarrollo atributos `data-testid` estables en los componentes críticos.
- Regla de lint `playwright/no-wait-for-timeout` y `playwright/no-useless-await` en el pipeline.
- Ejecutar en CI con `retries: 1` y revisar el **reporte de tests flaky**: un test que pasa en el reintento se trata como defecto, no se ignora.
