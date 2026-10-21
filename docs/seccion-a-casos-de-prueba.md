# Sección A — Diseño de casos de prueba funcionales

**Candidato:** Robinson Damián Calderón Ávila
**Cargo:** Ingeniero QA — Asisya
**Escenario evaluado:** Solicitud de asistencia para grúa desde dispositivo móvil. El flujo comprende la captura de ubicación, selección de categoría, ingreso de placa, confirmación de recepción y seguimiento de estado en tiempo real.

> El enunciado pide 5 casos; se entregan 6. El sexto (CP_GRUA_006) cubre el escenario de fallo más probable en carretera: la ubicación GPS no está disponible.

---

## Enfoque de diseño

Los casos se diseñaron aplicando **clases de equivalencia** y **análisis de valores límite** sobre los campos de entrada, complementados con **pruebas negativas** sobre las condiciones del entorno. La priorización sigue el criterio de **riesgo de negocio**: una solicitud de asistencia vial ocurre en carretera, con conectividad inestable y bajo presión de tiempo, por lo que los fallos de captura de datos y de confirmación tienen impacto directo sobre el usuario.

La cobertura se distribuye en tres capas:

| Capa | Casos | Qué valida |
| --- | --- | --- |
| Interfaz y validación de entrada | CP_GRUA_002, CP_GRUA_003 | Que el sistema rechace datos incompletos o mal formados antes de enviar |
| Flujo funcional completo | CP_GRUA_001, CP_GRUA_006 | Que el usuario complete la solicitud en condiciones normales y degradadas |
| Integración y estado | CP_GRUA_004, CP_GRUA_005 | Que el backend responda correctamente y el estado se refleje en tiempo real |

---

## CP_GRUA_001 — Solicitud exitosa de asistencia vial (grúa)

**Tipo:** Positivo · **Prioridad:** Alta · **Técnica:** Partición de equivalencia (clase válida)

**Objetivo:** Verificar que el usuario complete el flujo de solicitud de grúa enviando de forma correcta la geolocalización, el tipo de servicio y los datos del vehículo.

**Precondiciones:** Usuario autenticado con sesión activa. Permisos de ubicación concedidos. Conectividad estable.

**Datos de entrada:**
- Coordenadas GPS: Lat 4.60971, Lng -74.08175
- Tipo de asistencia: Grúa / Vial
- Placa: XYZ-123

**Pasos de ejecución:**
1. Abrir la app e iniciar sesión con credenciales válidas.
2. Ir al menú principal y seleccionar "Solicitar Asistencia" → "Grúa".
3. Validar que el sistema cargue automáticamente la ubicación GPS del dispositivo.
4. Digitar la placa del vehículo en el campo habilitado.
5. Pulsar el botón de confirmación de envío.

**Resultado esperado:**
- El sistema procesa la petición sin errores de red.
- Se muestra una pantalla de confirmación con el número de ticket generado y el mensaje de recepción.
- El estado inicial de la solicitud queda registrado como *pendiente de asignación*.

---

## CP_GRUA_002 — Bloqueo de solicitud por campo obligatorio vacío

**Tipo:** Negativo · **Prioridad:** Alta · **Técnica:** Valor límite (longitud 0) y validación de campo obligatorio

**Objetivo:** Comprobar que la plataforma no permita procesar la solicitud si faltan datos obligatorios como la placa.

**Precondiciones:** Usuario autenticado. Ubicación GPS activa.

**Datos de entrada:**
- Ubicación GPS: activa
- Tipo de asistencia: Grúa
- Placa: *(vacío)*

**Pasos de ejecución:**
1. Ingresar al formulario de solicitud de grúa.
2. Omitir el ingreso de la placa del vehículo.
3. Intentar pulsar el botón de confirmar solicitud.

**Resultado esperado:**
- El sistema frena el envío y no genera la solicitud.
- Se despliega una validación visual señalando que el campo de placa es obligatorio.
- No se registra ningún ticket en el backend.

---

## CP_GRUA_003 — Validación de formato de placa incorrecto

**Tipo:** Negativo · **Prioridad:** Media · **Técnica:** Partición de equivalencia (clase inválida)

**Objetivo:** Asegurar que el sistema valide las restricciones de formato para las placas vehiculares colombianas (tres letras, guion, tres dígitos).

**Precondiciones:** Usuario autenticado. Formulario de solicitud abierto.

**Datos de entrada:**
- Placa ingresada: `12345ABC` (orden invertido respecto al formato válido)

**Pasos de ejecución:**
1. Entrar al flujo de solicitud de grúa.
2. Escribir una placa con estructura no válida (`12345ABC`).
3. Intentar avanzar al siguiente paso.

**Resultado esperado:**
- El sistema detecta el error de formato en el campo.
- Muestra una alerta indicando que el formato de la placa es incorrecto.
- El botón de envío permanece deshabilitado hasta que el dato se corrija.

---

## CP_GRUA_004 — Respuesta y acuse de recibo del microservicio

**Tipo:** Positivo · **Prioridad:** Alta · **Técnica:** Validación de integración (capa de servicio)

**Objetivo:** Validar la respuesta del backend al despachar una solicitud exitosa, verificando el dato en la fuente y no únicamente lo que muestra la interfaz.

**Precondiciones:** Usuario autenticado. Herramientas de red o acceso a logs disponibles.

**Datos de entrada:**
- Solicitud generada con datos correctos (placa XYZ-123, GPS activo)

**Pasos de ejecución:**
1. Ejecutar el flujo completo de solicitud hasta la confirmación final.
2. Inspeccionar la respuesta del microservicio mediante las herramientas de red o los logs.
3. Contrastar el identificador de ticket mostrado en pantalla contra el devuelto por el servicio.

**Resultado esperado:**
- El servidor responde con código HTTP 200.
- La respuesta contiene el identificador de ticket y el estado de la solicitud.
- El identificador mostrado en la interfaz coincide con el devuelto por el backend.
- La interfaz refleja de inmediato la confirmación y el cambio de estado a *búsqueda de proveedor*.

---

## CP_GRUA_005 — Seguimiento dinámico del estado del servicio

**Tipo:** Positivo · **Prioridad:** Alta · **Técnica:** Prueba de flujo end-to-end con actualización asíncrona

**Objetivo:** Comprobar que el usuario visualiza el cambio de estados de la grúa asignada (en camino, sitio alcanzado) sin reiniciar la aplicación.

**Precondiciones:** Solicitud activa con operador de grúa asignado. Acceso al panel del operador para simular cambios.

**Datos de entrada:**
- Solicitud activa con operador asignado

**Pasos de ejecución:**
1. Navegar a la sección "Mis Solicitudes" dentro de la app.
2. Abrir el detalle de la solicitud en curso.
3. Simular un cambio de estado desde el panel del operador.
4. Revisar la interfaz del cliente final sin recargar la aplicación.

**Resultado esperado:**
- La pantalla se actualiza en tiempo real reflejando el nuevo estado.
- Se muestra la información del conductor asignado.
- La actualización ocurre sin necesidad de reiniciar ni recargar la aplicación.

---

## CP_GRUA_006 — Solicitud con ubicación GPS no disponible

**Tipo:** Negativo · **Prioridad:** Alta · **Técnica:** Prueba de condición de entorno degradado

**Objetivo:** Verificar el comportamiento del sistema cuando no puede capturar la ubicación del dispositivo, ya sea por permisos denegados o por ausencia de señal GPS.

**Justificación del caso:** Una solicitud de grúa se origina en carretera, donde la cobertura es inestable y el usuario puede haber denegado el permiso de ubicación. Es el escenario de fallo más probable en condiciones reales de uso, y el enunciado establece que el sistema debe capturar la ubicación.

**Precondiciones:** Usuario autenticado. Permisos de ubicación denegados o GPS sin señal.

**Datos de entrada:**
- Ubicación GPS: no disponible
- Tipo de asistencia: Grúa
- Placa: XYZ-123

**Pasos de ejecución:**
1. Denegar el permiso de ubicación a la aplicación o deshabilitar el GPS del dispositivo.
2. Ingresar al flujo de solicitud de grúa.
3. Observar el comportamiento del campo de ubicación.
4. Intentar completar y enviar la solicitud.

**Resultado esperado:**
- El sistema informa al usuario que no pudo obtener la ubicación y explica el motivo.
- Se ofrece una alternativa: ingresar la dirección manualmente o reintentar la captura.
- La solicitud no se envía con coordenadas vacías o con valores por defecto.
- Si el usuario ingresa la dirección manualmente, el flujo continúa con normalidad.

---

## Resumen de cobertura

| ID | Tipo | Prioridad | Técnica aplicada |
| --- | --- | --- | --- |
| CP_GRUA_001 | Positivo | Alta | Partición de equivalencia (clase válida) |
| CP_GRUA_002 | Negativo | Alta | Valor límite y campo obligatorio |
| CP_GRUA_003 | Negativo | Media | Partición de equivalencia (clase inválida) |
| CP_GRUA_004 | Positivo | Alta | Validación de integración |
| CP_GRUA_005 | Positivo | Alta | Flujo end-to-end asíncrono |
| CP_GRUA_006 | Negativo | Alta | Condición de entorno degradado |

**Distribución:** 3 casos positivos y 3 negativos, con 5 de prioridad alta. La cobertura abarca validación de entrada, flujo funcional, integración con el backend, actualización en tiempo real y comportamiento ante fallo de un servicio del dispositivo.
