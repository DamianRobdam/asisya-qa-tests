# Prueba técnica — Ingeniero QA · Asisya

**Candidato:** Robinson Damián Calderón Ávila · rcalderonavila@gmail.com · [Portafolio](https://damian-calderon-qa.netlify.app)

Automatización de pruebas para la plataforma de asistencias de Asisya: **Frontend web (Playwright)** y **API REST (Postman + Newman)**, debug del test defectuoso, pruebas de carga (**JMeter**) y seguridad (**OWASP Top 10**).

| Sección | Entregable | Dónde |
|---|---|---|
| **A** · Casos de prueba funcionales | 6 casos (el enunciado pide 5) del flujo de grúa | [`docs/seccion-a-casos-de-prueba.md`](docs/seccion-a-casos-de-prueba.md) |
| **B** · Automatización, componente 1 | Frontend "Mi Asistencia": 6 tests | [`tests/frontend/`](tests/frontend/mi-asistencia.spec.ts) |
| **B** · Automatización, componente 2 | API `solicitud-asistencia`: 16 peticiones y 63 aserciones | [`postman/`](postman/) |
| **C** · Debug y mejora | Análisis de 9 causas, test corregido y evidencias | [`docs/seccion-c-debug.md`](docs/seccion-c-debug.md) · [`tests/debug/`](tests/debug/) |
| **D** · Disponibilidad y seguridad | Estrategia 24/7, SLA con JMeter y 7 pruebas OWASP | [`docs/seccion-d-disponibilidad-seguridad.md`](docs/seccion-d-disponibilidad-seguridad.md) · [`tests/security/`](tests/security/seguridad.spec.ts) · [`performance/`](performance/seguimiento-carga.jmx) |
| **Bonus** | Paralelización (workers + *sharding*), reportes HTML/JUnit, pipeline CI y *quality gate* de SLA | [`.github/workflows/qa.yml`](.github/workflows/qa.yml) · [`scripts/check-sla.js`](scripts/check-sla.js) |

---

## ¿Por qué un ambiente simulado?

La prueba no entrega una URL ni credenciales de un ambiente de Asisya, y la URL del fragmento de la Sección C (`app.asisya.com`) no es accesible. Para que **todas las automatizaciones se ejecuten de verdad** (y no queden como código teórico), construí un **SUT simulado** en [`app/`](app/server.js) con Node + Express que reproduce lo que describe el enunciado:

- Web: login → "Solicitar Asistencia" → formulario → **"Mi Asistencia"**, con estado en **tiempo real** (Server-Sent Events) y datos del **profesional asignado**.
- API: `POST /api/asisya/solicitud-asistencia` (payload del enunciado) y `GET /api/asisya/seguimiento`.

Las pruebas no dependen del mock: **apuntan a otro ambiente cambiando una variable** (`BASE_URL` para Playwright, `baseUrl` en el ambiente de Postman, `-Jhost` y `-Jport` en JMeter).

## Arquitectura de la solución

```
asisya-qa-tests/
├── app/                      SUT simulado (Express + SPA en JS sin dependencias)
├── tests/
│   ├── fixtures/             Fixtures: credenciales, página autenticada, solicitud creada por API
│   ├── frontend/             COMPONENTE 1 — Playwright (Mi Asistencia)
│   ├── debug/                SECCIÓN C — test original (reproduce el fallo) + test corregido
│   └── security/             SECCIÓN D — SQLi, XSS, errores de login, cabeceras
├── postman/                  COMPONENTE 2 — colección y ambiente Postman (+ generador)
├── performance/              SECCIÓN D — plan JMeter (10 rps × 30 s, parametrizable)
├── scripts/                  Utilidades: levantar el mock en CI, quality gate de SLA
├── docs/                     Secciones A, C y D + evidencias (logs)
├── reports/                  Reportes generados (Playwright HTML, Newman HTML, JMeter dashboard, JUnit)
└── .github/workflows/qa.yml  Pipeline CI: shards en paralelo + API + carga
```

**Estrategia por capas:**

| Capa | Herramienta | Qué se valida |
|---|---|---|
| UI / E2E | Playwright + TypeScript | Flujos críticos del usuario, tiempo real y datos del profesional |
| API | Postman + Newman | Contrato, códigos HTTP, campos obligatorios, valores límite y tiempo < 2 s |
| Rendimiento | Apache JMeter | SLA: promedio < 1,5 s con ≥ 10 rps durante 30 s |
| Seguridad | Playwright (API + UI) | OWASP A03 (SQLi, XSS), A05 (cabeceras) y A07 (errores de login) |

## Requisitos

- Node.js 18 o superior (probado con Node 22)
- Para la carga: Java 11 o superior y [Apache JMeter 5.6.3](https://jmeter.apache.org/download_jmeter.cgi) en el `PATH`

## Instalación

```bash
git clone <url-del-repositorio>
cd asisya-qa-tests
npm install
npx playwright install chromium
```

## Ejecución

| Comando | Qué hace |
|---|---|
| `npm start` | Levanta el SUT simulado en http://localhost:3000 (usuario `usuario_test` / clave `clave123`) |
| `npm run test:e2e` | Todas las pruebas de Playwright (frontend, Sección C corregida y seguridad), en paralelo, con video |
| `npm run test:frontend` | Solo el **componente 1** (frontend) |
| `npm run test:api:ci` | **Componente 2** (API): levanta el mock y corre Newman → `reports/newman/newman-report.html` |
| `npm run test:debug` | Sección C: test **corregido** |
| `npm run test:debug:original` | Sección C: test **original**. Falla a propósito para reproducir el error |
| `npm run test:security` | Pruebas OWASP |
| `npm start` + `npm run test:load` | Carga JMeter 10 rps × 30 s + *quality gate* del SLA |
| `npm run report` | Abre el reporte HTML de Playwright (videos, trazas y pasos) |

Variables de entorno opcionales: `BASE_URL`, `ASISYA_USER`, `ASISYA_PASS` y `ASISYA_USER_ID` (ver [`.env.example`](.env.example)).

## Resultados (20/10/2026)

| Suite | Resultado |
|---|---|
| Playwright: frontend (6), Sección C corregida (1) y seguridad (10) | **17/17 ✅** (el test original queda en `fixme`; se reproduce con `test:debug:original`) |
| Newman (API) | **16 peticiones, 63/63 aserciones ✅**, promedio de 5 ms |
| JMeter 10 rps × 30 s | **319 peticiones, 10,7 rps, promedio 2,9 ms, p95 5 ms, 0 % errores ✅** |
| JMeter estrés 50 rps con 250 ms de latencia simulada | 1.532 peticiones, promedio 252 ms, p99 258 ms, 0 % errores ✅ |

## Decisiones técnicas

- **Playwright sobre Cypress:** auto-wait nativo, **video y trazas incluidos**, paralelización sin costo adicional, múltiples navegadores y API testing en la misma herramienta (lo uso para combinar UI con verificación en el backend).
- **Localizadores accesibles** (`getByRole`, `getByLabel`) y `data-testid` para los datos dinámicos. Ningún `waitForTimeout`: todas las esperas son aserciones que reintentan solas.
- **Datos aislados por test:** el fixture `solicitudCreada` crea los datos por API (rápido) y la UI se prueba sobre ellos. Así cada test es independiente y paralelizable.
- **UI contrastada con el backend:** FE-03 y el test corregido de la Sección C comparan lo que se ve en pantalla contra la API (fuente de verdad), para evitar falsos positivos.
- **La colección de Postman se genera por código** (`postman/build-collection.js`): los scripts de prueba quedan legibles y versionados, y el JSON resultante se importa en Postman sin cambios.
- **Quality gate de SLA** (`scripts/check-sla.js`): el pipeline falla si el promedio supera 1,5 s, si hay errores o si no se alcanzan 10 rps.

## Hallazgos y mejoras propuestas

1. **Login sin *rate limiting*** (fuerza bruta): recomendaría bloqueo progresivo o CAPTCHA tras N intentos.
2. **Seguimiento por *polling*** en clientes móviles: migrar a *push* (SSE o WebSocket) reduce la carga de lectura en la base de datos (ver D2).
3. Incorporar **pruebas de contrato** (Pact) entre la app móvil y la API, y un **escaneo ZAP baseline** en CI.
