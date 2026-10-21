// Asisya mock — SPA mínima con enrutamiento por hash.
// Todo el contenido dinámico se inserta con textContent (nunca innerHTML con datos del usuario)
// para evitar XSS. Ver docs/seguridad.md.
(function () {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  let stream = null;

  const ESTADOS = {
    RECIBIDA: 'Solicitud recibida',
    PROFESIONAL_ASIGNADO: 'Profesional asignado',
    EN_CAMINO: 'Profesional en camino',
    EN_SITIO: 'Profesional en sitio',
    FINALIZADA: 'Servicio finalizado',
  };
  const TIPOS = [
    { id: 'medico_domicilio', label: 'Asistencia médica a domicilio' },
    { id: 'grua', label: 'Grúa / Asistencia vial' },
    { id: 'cerrajeria', label: 'Cerrajería' },
    { id: 'plomeria', label: 'Plomería' },
  ];

  const session = {
    get token() { return sessionStorage.getItem('token'); },
    get user() { try { return JSON.parse(sessionStorage.getItem('user')); } catch { return null; } },
    set(token, user) { sessionStorage.setItem('token', token); sessionStorage.setItem('user', JSON.stringify(user)); },
    clear() { sessionStorage.clear(); },
  };

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  const render = (...nodes) => { app.replaceChildren(...nodes); };
  const go = (h) => { location.hash = h; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (session.token) headers.Authorization = 'Bearer ' + session.token;
    const res = await fetch(path, { ...opts, headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  // ---------------- Vistas ----------------
  function vistaLogin() {
    const err = el('p', { class: 'error', role: 'alert', 'data-testid': 'login-error', hidden: true });
    const form = el('form', { 'data-testid': 'form-login', novalidate: true },
      el('label', { for: 'usuario' }, 'Usuario'),
      el('input', { id: 'usuario', name: 'usuario', autocomplete: 'username' }),
      el('label', { for: 'clave' }, 'Contraseña'),
      el('input', { id: 'clave', name: 'clave', type: 'password', autocomplete: 'current-password' }),
      el('button', { type: 'submit', class: 'primary' }, 'Ingresar'),
      err,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ usuario: form.usuario.value, clave: form.clave.value }) });
      if (!r.ok) { err.textContent = r.body.mensaje || 'No fue posible iniciar sesión'; err.hidden = false; return; }
      session.set(r.body.token, r.body.usuario);
      go('#/inicio');
    });
    render(el('section', { class: 'card' }, el('h1', {}, 'Iniciar sesión'), form));
  }

  function vistaInicio() {
    const u = session.user;
    render(
      el('section', { class: 'card' },
        el('h1', { 'data-testid': 'saludo' }, `Hola, ${u.nombre}`),
        el('p', {}, '¿Qué necesitas hoy?'),
        el('div', { class: 'grid' },
          el('button', { class: 'opcion', 'data-testid': 'btn-solicitar', on: { click: () => go('#/solicitar') } }, 'Solicitar Asistencia'),
          el('button', { class: 'opcion', 'data-testid': 'btn-mi-asistencia', on: { click: () => go('#/mi-asistencia') } }, 'Mi Asistencia'),
        ),
      ),
    );
  }

  function vistaSolicitar() {
    render(
      el('section', { class: 'card' },
        el('h1', {}, 'Solicitar asistencia'),
        el('p', {}, 'Selecciona el tipo de asistencia:'),
        el('div', { class: 'grid' }, TIPOS.map((t) =>
          el('button', { class: 'opcion', 'data-tipo': t.id, on: { click: () => vistaFormulario(t) } }, t.label))),
      ),
    );
  }

  async function vistaFormulario(tipo) {
    // Simula la carga del formulario (latencia real de red) para que las esperas importen
    render(el('section', { class: 'card' }, el('p', { class: 'spinner', 'data-testid': 'cargando' }, 'Cargando formulario…')));
    await sleep(700);
    const hoy = new Date().toISOString().slice(0, 10);
    const res = el('div', { class: 'resultado-confirmacion', 'data-testid': 'resultado', role: 'status' });
    const btn = el('button', { id: 'btnConfirmar', type: 'submit', class: 'primary', disabled: true }, 'Confirmar solicitud');
    const form = el('form', { 'data-testid': 'form-solicitud', novalidate: true },
      el('label', { for: 'direccion' }, 'Dirección del servicio'),
      el('input', { id: 'direccion', name: 'direccion', maxlength: '120', placeholder: 'Ej: Cra 12 #34-56' }),
      el('label', { for: 'fecha' }, 'Fecha'),
      el('input', { id: 'fecha', name: 'fecha', type: 'date', value: hoy }),
      btn,
      res,
    );
    const validar = () => { btn.disabled = form.direccion.value.trim().length < 5 || !form.fecha.value; };
    form.addEventListener('input', validar);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      res.className = 'spinner';
      res.textContent = 'Enviando solicitud…';
      await sleep(900); // procesamiento asíncrono
      const r = await api('/api/asisya/solicitud-asistencia', {
        method: 'POST',
        body: JSON.stringify({ usuarioId: session.user.id, tipoAsistencia: tipo.id, direccion: form.direccion.value, fecha: form.fecha.value }),
      });
      if (!r.ok) { res.className = 'resultado-confirmacion error'; res.textContent = (r.body.detalles || [r.body.mensaje]).join('. '); btn.disabled = false; return; }
      res.className = 'resultado-confirmacion ok';
      res.replaceChildren(
        document.createTextNode(`Solicitud creada exitosamente · Ticket ${r.body.id} `),
        el('a', { href: `#/mi-asistencia/${r.body.id}`, 'data-testid': 'link-seguimiento' }, 'Ver en Mi Asistencia'),
      );
    });
    render(el('section', { class: 'card' }, el('h1', {}, tipo.label), form));
  }

  async function vistaMiAsistencia(id) {
    if (stream) { stream.close(); stream = null; }
    const r = await api('/api/asisya/mis-solicitudes');
    if (r.status === 401) { session.clear(); return go('#/login'); }
    const lista = r.body;
    if (!lista.length) {
      return render(el('section', { class: 'card', 'data-testid': 'mi-asistencia' }, el('h1', {}, 'Mi Asistencia'), el('p', { 'data-testid': 'sin-solicitudes' }, 'No tienes solicitudes activas.')));
    }
    const actual = lista.find((s) => s.id === id) || lista[0];
    const estado = el('span', { class: 'estado', 'data-testid': 'estado-asistencia' });
    const eta = el('p', { 'data-testid': 'eta' });
    const timeline = el('ul', { class: 'timeline', 'data-testid': 'timeline' });
    const prof = el('section', { class: 'card', 'data-testid': 'profesional', hidden: true });

    const pintar = (s) => {
      estado.textContent = ESTADOS[s.estado] || s.estado;
      estado.dataset.estado = s.estado;
      eta.textContent = s.etaMinutos === null ? 'Buscando profesional disponible…' : (s.etaMinutos === 0 ? 'El profesional llegó al sitio' : `Llegada estimada: ${s.etaMinutos} min`);
      const hechos = s.historial.map((h) => h.estado);
      timeline.replaceChildren(...Object.keys(ESTADOS).map((k) => el('li', { class: hechos.includes(k) ? 'hecho' : '' }, ESTADOS[k])));
      if (s.profesional) {
        const p = s.profesional;
        prof.hidden = false;
        prof.replaceChildren(
          el('h2', {}, 'Profesional asignado'),
          el('dl', {},
            el('dt', {}, 'Nombre'), el('dd', { 'data-testid': 'prof-nombre' }, p.nombre),
            el('dt', {}, 'Especialidad'), el('dd', { 'data-testid': 'prof-especialidad' }, p.especialidad),
            el('dt', {}, 'Registro'), el('dd', { 'data-testid': 'prof-registro' }, p.registro),
            el('dt', {}, 'Teléfono'), el('dd', { 'data-testid': 'prof-telefono' }, p.telefono),
            el('dt', {}, 'Calificación'), el('dd', { 'data-testid': 'prof-calificacion' }, `${p.calificacion} / 5`),
          ),
        );
      }
    };

    render(
      el('section', { class: 'card', 'data-testid': 'mi-asistencia' },
        el('h1', {}, 'Mi Asistencia'),
        el('dl', {},
          el('dt', {}, 'Ticket'), el('dd', { 'data-testid': 'ticket' }, actual.id),
          el('dt', {}, 'Dirección'), el('dd', { 'data-testid': 'direccion-solicitud' }, actual.direccion),
          el('dt', {}, 'Estado'), el('dd', {}, estado),
        ),
        eta, timeline,
      ),
      prof,
      el('section', { class: 'card lista-solicitudes' }, el('h2', {}, 'Historial'),
        lista.map((s) => el('button', { class: 'opcion', on: { click: () => go(`#/mi-asistencia/${s.id}`) } }, `${s.id} · ${ESTADOS[s.estado]}`))),
    );
    pintar(actual);
    stream = new EventSource(`/api/asisya/seguimiento/stream?id=${encodeURIComponent(actual.id)}`);
    stream.onmessage = (ev) => pintar(JSON.parse(ev.data));
  }

  // ---------------- Router ----------------
  function router() {
    const h = location.hash || '#/login';
    nav.hidden = !session.token;
    if (!session.token && h !== '#/login') return go('#/login');
    if (h === '#/login') return session.token ? go('#/inicio') : vistaLogin();
    if (h === '#/inicio') return vistaInicio();
    if (h === '#/solicitar') return vistaSolicitar();
    if (h.startsWith('#/mi-asistencia')) return vistaMiAsistencia(h.split('/')[2]);
    go('#/inicio');
  }
  document.getElementById('btnSalir').addEventListener('click', () => { session.clear(); go('#/login'); });
  window.addEventListener('hashchange', router);
  router();
})();
