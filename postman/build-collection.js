/**
 * Genera la colección Postman (v2.1) de forma reproducible.
 * Uso: node postman/build-collection.js
 * Salida: postman/Asisya-API.postman_collection.json
 *
 * Se genera por código para mantener los scripts de prueba legibles y versionables;
 * el JSON resultante se importa directamente en Postman.
 */
const fs = require('fs');
const path = require('path');

const js = (fn) => fn.toString().split('\n').slice(1, -1).map((l) => l.replace(/^ {4}/, ''));

const req = (name, method, url, body, tests, pre) => ({
  name,
  event: [
    ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: js(pre) } }] : []),
    { listen: 'test', script: { type: 'text/javascript', exec: js(tests) } },
  ],
  request: {
    method,
    header: [{ key: 'Content-Type', value: 'application/json' }],
    ...(body !== undefined ? { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    url: { raw: `{{baseUrl}}${url}`, host: ['{{baseUrl}}'], path: url.split('?')[0].split('/').filter(Boolean), ...(url.includes('?') ? { query: url.split('?')[1].split('&').map((q) => ({ key: q.split('=')[0], value: q.split('=')[1] })) } : {}) },
  },
});

const cuerpoValido = { usuarioId: 'USR999', tipoAsistencia: 'medico_domicilio', direccion: 'Cra 12 #34-56', fecha: '2025-08-02' };

const collection = {
  info: {
    name: 'Asisya API — Solicitud de asistencia',
    description: 'Componente 2 de la prueba técnica: API REST. Valida POST /api/asisya/solicitud-asistencia (HTTP 200, respuesta válida, campos obligatorios, tiempo < 2 s) y escenarios negativos. Ejecutar con Newman: npm run test:api',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: js(function () {
          // Reglas transversales: toda respuesta debe ser JSON y responder en menos de 2 s
          pm.test('[Global] Content-Type es JSON', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));
          pm.test('[Global] Tiempo de respuesta < 2000 ms', () => pm.expect(pm.response.responseTime).to.be.below(Number(pm.environment.get('slaMs') || 2000)));
        }),
      },
    },
  ],
  item: [
    {
      name: '01 · Casos positivos',
      item: [
        req('POST solicitud-asistencia — payload del enunciado (200)', 'POST', '/api/asisya/solicitud-asistencia', cuerpoValido, function () {
          const body = pm.response.json();
          pm.test('HTTP 200', () => pm.response.to.have.status(200));
          pm.test('La respuesta cumple el esquema', () => {
            const schema = {
              type: 'object',
              required: ['id', 'estado', 'mensaje', 'creadaEn', 'solicitud'],
              properties: {
                id: { type: 'string', pattern: '^ASY-[0-9A-F]{6}$' },
                estado: { type: 'string', enum: ['RECIBIDA'] },
                mensaje: { type: 'string' },
                creadaEn: { type: 'string' },
                solicitud: { type: 'object', required: ['usuarioId', 'tipoAsistencia', 'direccion', 'fecha', 'historial'] },
              },
            };
            pm.response.to.have.jsonSchema(schema);
          });
          pm.test('Los campos obligatorios se devuelven con los valores enviados', () => {
            const enviado = JSON.parse(pm.request.body.raw);
            ['usuarioId', 'tipoAsistencia', 'direccion', 'fecha'].forEach((c) => pm.expect(body.solicitud[c], c).to.eql(enviado[c]));
          });
          pm.test('Mensaje de confirmación correcto', () => pm.expect(body.mensaje).to.eql('Solicitud creada exitosamente'));
          pm.test('creadaEn es una fecha ISO válida', () => pm.expect(new Date(body.creadaEn).toString()).to.not.eql('Invalid Date'));
          pm.environment.set('solicitudId', body.id);
        }),
        req('GET seguimiento — la solicitud creada existe (200)', 'GET', '/api/asisya/seguimiento?id={{solicitudId}}', undefined, function () {
          const body = pm.response.json();
          pm.test('HTTP 200', () => pm.response.to.have.status(200));
          pm.test('Devuelve la misma solicitud creada', () => pm.expect(body.id).to.eql(pm.environment.get('solicitudId')));
          pm.test('El estado pertenece al flujo definido', () =>
            pm.expect(['RECIBIDA', 'PROFESIONAL_ASIGNADO', 'EN_CAMINO', 'EN_SITIO', 'FINALIZADA']).to.include(body.estado));
        }),
        req('POST solicitud-asistencia — tipo grúa (200)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, tipoAsistencia: 'grua', direccion: 'Autopista Norte km 18' }, function () {
          pm.test('HTTP 200', () => pm.response.to.have.status(200));
          pm.test('tipoAsistencia = grua', () => pm.expect(pm.response.json().solicitud.tipoAsistencia).to.eql('grua'));
        }),
      ],
    },
    {
      name: '02 · Campos obligatorios (negativos)',
      item: [
        ...['usuarioId', 'tipoAsistencia', 'direccion', 'fecha'].map((campo) => {
          const b = { ...cuerpoValido };
          delete b[campo];
          return req(`POST sin '${campo}' (400)`, 'POST', '/api/asisya/solicitud-asistencia', b, function () {
            // El nombre del campo omitido se toma del nombre de la petición: "POST sin 'campo' (400)"
            const campo = pm.info.requestName.match(/'(.+)'/)[1];
            pm.test('HTTP 400', () => pm.response.to.have.status(400));
            pm.test(`Error de validación que menciona el campo ${campo}`, () => {
              const body = pm.response.json();
              pm.expect(body.error).to.eql('VALIDACION');
              pm.expect(body.detalles.join(' ')).to.include(`'${campo}'`);
            });
          });
        }),
        req("POST con 'direccion' vacía (400)", 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, direccion: '   ' }, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
        }),
      ],
    },
    {
      name: '03 · Formato y tipos (negativos)',
      item: [
        req('POST tipoAsistencia no permitido (400)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, tipoAsistencia: 'spa' }, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
          pm.test('Indica los valores permitidos', () => pm.expect(pm.response.json().detalles.join(' ')).to.include('medico_domicilio'));
        }),
        req('POST fecha con formato inválido (400)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, fecha: '02/08/2025' }, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
          pm.test('Mensaje de formato YYYY-MM-DD', () => pm.expect(pm.response.json().detalles.join(' ')).to.include('YYYY-MM-DD'));
        }),
        req('POST usuarioId numérico (400)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, usuarioId: 999 }, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
        }),
        req('POST dirección de 121 caracteres — valor límite (400)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, direccion: 'A'.repeat(121) }, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
        }),
        req('POST dirección de 120 caracteres — valor límite (200)', 'POST', '/api/asisya/solicitud-asistencia', { ...cuerpoValido, direccion: 'A'.repeat(120) }, function () {
          pm.test('HTTP 200', () => pm.response.to.have.status(200));
        }),
        req('POST JSON malformado (400, sin stack trace)', 'POST', '/api/asisya/solicitud-asistencia', '{"usuarioId": "USR999",', function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
          pm.test('No expone detalles internos', () => pm.expect(pm.response.text()).to.not.match(/SyntaxError|node_modules|at .*\.js/));
        }),
      ],
    },
    {
      name: '04 · Seguimiento (negativos)',
      item: [
        req('GET seguimiento con id inexistente (404)', 'GET', '/api/asisya/seguimiento?id=ASY-000000', undefined, function () {
          pm.test('HTTP 404', () => pm.response.to.have.status(404));
        }),
        req('GET seguimiento con payload SQLi (400)', 'GET', "/api/asisya/seguimiento?id=ASY-000000'%20OR%20'1'='1", undefined, function () {
          pm.test('HTTP 400', () => pm.response.to.have.status(400));
          pm.test('Error controlado ID_INVALIDO', () => pm.expect(pm.response.json().error).to.eql('ID_INVALIDO'));
        }),
      ],
    },
  ],
};

fs.writeFileSync(path.join(__dirname, 'Asisya-API.postman_collection.json'), JSON.stringify(collection, null, 2));

const env = {
  name: 'Asisya — local (mock)',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
    { key: 'slaMs', value: '2000', enabled: true },
    { key: 'solicitudId', value: '', enabled: true },
  ],
};
fs.writeFileSync(path.join(__dirname, 'local.postman_environment.json'), JSON.stringify(env, null, 2));
console.log('Colección y ambiente generados en /postman');
