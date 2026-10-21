/**
 * Asisya Mock — servidor de pruebas (SUT simulado)
 * -------------------------------------------------
 * Asisya no expone un ambiente público, así que este servidor reproduce el
 * comportamiento descrito en la prueba técnica para poder ejecutar las
 * automatizaciones de punta a punta:
 *
 *  - Web:  login -> inicio -> "Solicitar Asistencia" -> "Mi Asistencia"
 *          con estado en tiempo real (Server-Sent Events) y profesional asignado.
 *  - API:  POST /api/asisya/solicitud-asistencia
 *          GET  /api/asisya/seguimiento?id=...
 *
 * Variables de entorno:
 *  PORT                 Puerto (por defecto 3000)
 *  STATUS_STEP_MS       Intervalo entre cambios de estado (por defecto 1500 ms)
 *  API_LATENCY_MS       Latencia artificial de la API (por defecto 0)
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const STATUS_STEP_MS = Number(process.env.STATUS_STEP_MS || 1500);
const API_LATENCY_MS = Number(process.env.API_LATENCY_MS || 0);

const app = express();
app.use(express.json({ limit: '10kb' }));

// Cabeceras de seguridad básicas (ver docs/seguridad.md)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Datos en memoria
// ---------------------------------------------------------------------------
const USERS = {
  usuario_test: { id: 'USR999', nombre: 'Usuario de Prueba', clave: 'clave123' },
};
const sessions = new Map(); // token -> userId
const solicitudes = new Map(); // id -> solicitud

const TIPOS_VALIDOS = ['medico_domicilio', 'grua', 'cerrajeria', 'plomeria', 'electricista'];
const PROFESIONALES = {
  medico_domicilio: { nombre: 'Dra. Laura Méndez', especialidad: 'Medicina general', registro: 'RM-48213', telefono: '3001234567', calificacion: 4.8 },
  grua: { nombre: 'Carlos Rojas', especialidad: 'Operador de grúa', registro: 'OP-77120', telefono: '3109876543', calificacion: 4.6, placaGrua: 'TRK-582' },
  default: { nombre: 'Andrés Pardo', especialidad: 'Técnico hogar', registro: 'TH-30411', telefono: '3205551122', calificacion: 4.7 },
};
const FLUJO_ESTADOS = ['RECIBIDA', 'PROFESIONAL_ASIGNADO', 'EN_CAMINO', 'EN_SITIO', 'FINALIZADA'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const latency = async (req, res, next) => { if (API_LATENCY_MS) await delay(API_LATENCY_MS); next(); };

function crearTicket() {
  return 'ASY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'NO_AUTORIZADO', mensaje: 'Token ausente o inválido' });
  }
  req.userId = sessions.get(token);
  next();
}

function avanzarEstados(sol) {
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    if (i >= FLUJO_ESTADOS.length) return clearInterval(timer);
    sol.estado = FLUJO_ESTADOS[i];
    sol.historial.push({ estado: sol.estado, fecha: new Date().toISOString() });
    if (sol.estado === 'PROFESIONAL_ASIGNADO') {
      sol.profesional = PROFESIONALES[sol.tipoAsistencia] || PROFESIONALES.default;
      sol.etaMinutos = 25;
    }
    if (sol.estado === 'EN_CAMINO') sol.etaMinutos = 12;
    if (sol.estado === 'EN_SITIO') sol.etaMinutos = 0;
  }, STATUS_STEP_MS);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'UP', timestamp: new Date().toISOString() }));

app.post('/api/auth/login', latency, (req, res) => {
  const { usuario, clave } = req.body || {};
  const u = typeof usuario === 'string' ? USERS[usuario] : undefined;
  // Mensaje genérico: no revela si falló el usuario o la clave (OWASP A07)
  if (!u || typeof clave !== 'string' || u.clave !== clave) {
    return res.status(401).json({ error: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contraseña incorrectos' });
  }
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, u.id);
  res.json({ token, usuario: { id: u.id, nombre: u.nombre } });
});

app.post('/api/asisya/solicitud-asistencia', latency, (req, res) => {
  const b = req.body || {};
  const errores = [];
  const obligatorios = ['usuarioId', 'tipoAsistencia', 'direccion', 'fecha'];
  for (const c of obligatorios) {
    if (b[c] === undefined || b[c] === null || String(b[c]).trim() === '') errores.push(`El campo '${c}' es obligatorio`);
  }
  for (const c of obligatorios) {
    if (b[c] !== undefined && b[c] !== null && typeof b[c] !== 'string') errores.push(`El campo '${c}' debe ser texto`);
  }
  if (typeof b.tipoAsistencia === 'string' && b.tipoAsistencia && !TIPOS_VALIDOS.includes(b.tipoAsistencia)) {
    errores.push(`tipoAsistencia inválido. Valores permitidos: ${TIPOS_VALIDOS.join(', ')}`);
  }
  if (typeof b.fecha === 'string' && b.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) {
    errores.push("El campo 'fecha' debe tener formato YYYY-MM-DD");
  }
  if (typeof b.direccion === 'string' && b.direccion.length > 120) {
    errores.push("El campo 'direccion' admite máximo 120 caracteres");
  }
  if (errores.length) return res.status(400).json({ error: 'VALIDACION', detalles: errores });

  const sol = {
    id: crearTicket(),
    usuarioId: b.usuarioId,
    tipoAsistencia: b.tipoAsistencia,
    direccion: b.direccion,
    fecha: b.fecha,
    estado: 'RECIBIDA',
    profesional: null,
    etaMinutos: null,
    creadaEn: new Date().toISOString(),
    historial: [{ estado: 'RECIBIDA', fecha: new Date().toISOString() }],
  };
  solicitudes.set(sol.id, sol);
  avanzarEstados(sol);
  res.status(200).json({ id: sol.id, estado: sol.estado, mensaje: 'Solicitud creada exitosamente', creadaEn: sol.creadaEn, solicitud: sol });
});

app.get('/api/asisya/seguimiento', latency, (req, res) => {
  const id = req.query.id;
  // Validación estricta del identificador (defensa contra inyección)
  if (typeof id !== 'string' || !/^ASY-[0-9A-F]{6}$/.test(id)) {
    return res.status(400).json({ error: 'ID_INVALIDO', mensaje: 'Identificador de solicitud inválido' });
  }
  const sol = solicitudes.get(id);
  if (!sol) return res.status(404).json({ error: 'NO_ENCONTRADA', mensaje: 'La solicitud no existe' });
  res.json(sol);
});

// Mis solicitudes del usuario autenticado
app.get('/api/asisya/mis-solicitudes', auth, (req, res) => {
  res.json([...solicitudes.values()].filter((s) => s.usuarioId === req.userId).reverse());
});

// Estado en tiempo real (Server-Sent Events)
app.get('/api/asisya/seguimiento/stream', (req, res) => {
  const id = req.query.id;
  const sol = typeof id === 'string' ? solicitudes.get(id) : undefined;
  if (!sol) return res.status(404).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  let ultimo = null;
  const push = () => {
    if (sol.estado !== ultimo) {
      ultimo = sol.estado;
      res.write(`data: ${JSON.stringify(sol)}\n\n`);
    }
  };
  push();
  const t = setInterval(push, 300);
  req.on('close', () => clearInterval(t));
});

// Errores no controlados: nunca exponer stack traces
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON_INVALIDO', mensaje: 'El cuerpo no es un JSON válido' });
  res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Asisya mock escuchando en http://localhost:${PORT}`));
}
module.exports = app;
