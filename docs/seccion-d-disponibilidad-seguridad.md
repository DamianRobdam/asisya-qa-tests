# Sección D — Validación de disponibilidad y seguridad

**Candidato:** Robinson Damián Calderón Ávila · **Cargo:** Ingeniero QA — Asisya

---

## D1. Escenario 24/7 (alta disponibilidad)

Un usuario con el carro varado en carretera o con una urgencia médica en casa no puede esperar. Por eso la estrategia se centra en dos preguntas: **¿la solicitud llega?** y **¿se responde a tiempo?**, a cualquier hora y bajo cualquier carga.

### Objetivos de nivel de servicio propuestos (SLO)

| Indicador (SLI) | Objetivo (SLO) | Cómo se mide |
|---|---|---|
| Disponibilidad de `POST /solicitud-asistencia` | ≥ 99,9 % mensual (≈ 43 min de caída al mes) | Monitoreo sintético cada minuto + tasa de respuestas 5xx |
| Latencia de creación de solicitud | p95 < 1 s · p99 < 2 s | APM / percentiles en el balanceador |
| Latencia de seguimiento | Promedio < 1,5 s (requisito de la prueba) | JMeter / k6 en el pipeline |
| Tiempo de asignación de profesional | p90 < 5 min | Métrica de negocio (evento *PROFESIONAL_ASIGNADO*) |
| Solicitudes perdidas | 0 | Conciliación de solicitudes recibidas vs. persistidas |

### Pruebas que implementaría

| Tipo de prueba | Qué valida | Frecuencia |
|---|---|---|
| **Monitoreo sintético (smoke 24/7)** | Un flujo de Playwright y Postman que crea una solicitud de prueba marcada, la consulta y verifica el estado, desde varias regiones | Cada 1–5 min, en producción |
| **Health checks** | `/api/health` y dependencias (base de datos, cola de mensajes, proveedor de mapas o GPS) | Cada 30 s, desde el balanceador |
| **Carga (load)** | Volumen esperado en hora pico (fines de semana, festivos, lluvias en Bogotá) | En cada release |
| **Estrés** | Hasta dónde escala y cómo se degrada: errores controlados y no caídas | Mensual o antes de temporadas altas |
| **Picos (spike)** | Aumento súbito × 5 o × 10, por ejemplo durante un aguacero o un accidente masivo | Antes de temporadas altas |
| **Resistencia (soak)** | Carga moderada durante 8–12 h para detectar fugas de memoria y conexiones no liberadas | Mensual |
| **Failover / caos** | Apagar una instancia, la base de datos réplica o la cola de mensajes, y verificar que **ninguna solicitud se pierde** (reintentos, idempotencia) | Trimestral (game days) |
| **Recuperación (DR)** | Restauración de backups y cumplimiento de RTO y RPO | Semestral |
| **Contrato de API** | Que los cambios del backend no rompan la app móvil ni la web | En cada PR |

### Herramientas para medir disponibilidad y latencia bajo carga

| Necesidad | Herramienta | Por qué |
|---|---|---|
| Carga y estrés | **JMeter** (usado en esta prueba), **k6** | JMeter: GUI y reporte HTML listo para negocio. k6: scripts en JS, umbrales como código y fácil de integrar en CI |
| Monitoreo sintético | **Checkly** (Playwright), **Grafana Synthetic Monitoring**, **UptimeRobot** | Ejecutan flujos reales 24/7 y alertan |
| APM y trazas | **Grafana + Prometheus**, **Datadog**, **New Relic**, **OpenTelemetry** | Percentiles p95/p99, errores y trazas distribuidas para encontrar el cuello de botella |
| Alertas y guardias | **PagerDuty**, **Opsgenie** | Escalamiento 24/7 cuando se rompe el SLO |
| Caos | **Chaos Mesh**, **AWS Fault Injection Service** | Fallos controlados en ambientes previos |

---

## D2. Validación de SLA y rendimiento básico (API)

**Requisito:** que `/api/asisya/seguimiento` mantenga un tiempo de respuesta **promedio < 1,5 s** con **≥ 10 solicitudes por segundo durante 30 s**.

### Diseño de la prueba (`performance/seguimiento-carga.jmx`)

- **setUp Thread Group:** crea una solicitud real con `POST` y comparte su `id` con el grupo de carga, así la prueba no depende de datos preexistentes.
- **Thread Group de carga:** 20 hilos y duración de 30 s, con un **Constant Throughput Timer** a 600 peticiones por minuto (**10 rps exactas**). Todo es parametrizable con `-Jrps`, `-Jduration` y `-Jthreads`.
- **Aserciones por petición:** HTTP 200, el JSON contiene `estado` y cada respuesta tarda menos de 2 s.
- **Reporte:** dashboard HTML de JMeter (`reports/jmeter/dashboard/index.html`).

### Resultados (ambiente simulado, 20/10/2026)

| Escenario | Peticiones | Throughput | Promedio | p90 | p95 | p99 | Máx | Errores | ¿Cumple SLA < 1,5 s? |
|---|---|---|---|---|---|---|---|---|---|
| **Requisito:** 10 rps × 30 s | 319 | **10,7 rps** | **2,9 ms** | 4 ms | 5 ms | 8 ms | 20 ms | **0 %** | ✅ Sí |
| **Estrés:** 50 rps × 30 s, con 250 ms de latencia simulada de backend | 1.532 | 50,6 rps | 252 ms | 253 ms | 254 ms | 258 ms | 289 ms | 0 % | ✅ Sí |

> **Nota de transparencia:** el ambiente es un *mock* local, así que los tiempos absolutos son mucho menores que los de un ambiente real con red, base de datos y servicios externos. Por eso agregué el escenario de estrés con latencia artificial: muestra el comportamiento cuando el tiempo de servicio es realista. **El plan de pruebas es el mismo que se ejecutaría contra el ambiente de QA de Asisya**, cambiando solo `-Jhost` y `-Jport`.

### Análisis de posibles cuellos de botella

1. **Base de datos (el más probable en producción).** `seguimiento` se consulta muchísimo más de lo que cambia: el usuario refresca o la app hace *polling* cada pocos segundos. Riesgos: consultas sin índice por `id` o `usuarioId`, *pool* de conexiones pequeño y bloqueos en la tabla de estados mientras otros procesos actualizan.
   *Mitigación:* índices, réplicas de lectura, caché de corta vida (Redis, 2–5 s) y **pasar de polling a push** (SSE o WebSocket, como hace la web simulada), lo que reduce la carga de lectura en un orden de magnitud.
2. **Concurrencia e hilos (Ley de Little).** Concurrencia = throughput × latencia. Con 50 rps y 250 ms se necesitan unos 12,5 hilos o conexiones simultáneas. Si en producción la latencia sube a 1 s, a 50 rps se necesitan unas 50 conexiones. Un *pool* de servidor o de base de datos más pequeño genera **colas y la latencia crece de forma no lineal**.
   *Recomendación:* dimensionar los *pools* con esta fórmula y alertar por la saturación del *pool*, no solo por la latencia.
3. **Dependencias externas.** Geolocalización, asignación de proveedores y notificaciones push. Si `seguimiento` las llama de forma síncrona, hereda su latencia.
   *Mitigación:* *timeouts*, *circuit breakers* y respuesta con el último estado conocido.
4. **Event loop de Node.js.** En el mock, la serialización JSON del historial es O(n). Con historiales largos o *payloads* grandes podría bloquear el hilo principal.
   *Mitigación:* paginar el historial y medir el *event loop lag*.
5. **Lo que la prueba NO mide y haría a continuación:** latencia desde la red móvil real (3G o 4G en carretera), percentiles en picos (prueba *spike*) y comportamiento después de 8 h (prueba *soak*).

---

## D3. Validación de seguridad básica (OWASP Top 10)

Pruebas **automatizadas** en `tests/security/seguridad.spec.ts` (Playwright), que se ejecutan en cada pipeline:

| ID | Riesgo OWASP 2021 | Prueba | Resultado esperado | Estado |
|---|---|---|---|---|
| SEC-01 | **A03 Inyección SQL** | Login con 4 *payloads* clásicos (`' OR '1'='1`, `admin'--`, `' OR 1=1;--`, `"; DROP TABLE…`) | 401, sin token y sin mensajes del motor de base de datos | ✅ |
| SEC-02 | **A03 Inyección SQL** | `GET /seguimiento?id=ASY-000000' OR '1'='1` | 400 `ID_INVALIDO` (validación con *allow-list* del formato del id) | ✅ |
| SEC-03 | **A03 XSS almacenado** | Se crea una solicitud con dirección `<img src=x onerror=…>` y se abre en *Mi Asistencia* | Se muestra como texto, no se crea `<img>` y el *handler* no se ejecuta | ✅ |
| SEC-04 | **A05 Configuración insegura** | Cabeceras de la respuesta | `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` | ✅ |
| SEC-05 | **A07 Errores en login** | Usuario inexistente vs. contraseña incorrecta | Mismo código y **mismo mensaje**: no permite enumerar usuarios | ✅ |
| SEC-06 | **A07 / A05 Fuga de información** | JSON malformado | 400 controlado, **sin stack trace** ni rutas internas | ✅ |
| SEC-07 | **A07 Errores en login (UI)** | *Payload* SQLi en el formulario | Mensaje genérico y sin sesión creada | ✅ |

**Prueba manual complementaria con Burp Suite u OWASP ZAP:** interceptar el `POST /api/auth/login`, enviar el *payload* al *Intruder* con un diccionario de SQLi y XSS, y comparar códigos, tamaños y tiempos de respuesta. Una diferencia de tiempo sugiere inyección ciega basada en tiempo. Además recomendaría un **escaneo base de ZAP (`zap-baseline`) en CI** contra el ambiente de QA y revisar **rate limiting** en el login, porque hoy no hay protección contra fuerza bruta. Lo dejo como hallazgo para el backlog.
