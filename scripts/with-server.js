/**
 * Levanta el mock, espera /api/health, ejecuta el comando recibido y apaga el servidor.
 * Uso: node scripts/with-server.js "<comando>"
 */
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3000;
// Acepta prefijos VAR=valor (sintaxis Unix) y los convierte en variables de entorno,
// para que el mismo script funcione en Windows (cmd/PowerShell), macOS y Linux.
const partes = process.argv.slice(2).join(' ').split(' ');
const envExtra = {};
while (partes.length && /^[A-Z_][A-Z0-9_]*=/.test(partes[0])) {
  const [k, ...v] = partes.shift().split('=');
  envExtra[k] = v.join('=');
}
const cmd = partes.join(' ');

const server = spawn(process.execPath, ['app/server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });

function health(retries = 50) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http.get(`http://localhost:${PORT}/api/health`, (r) => (r.statusCode === 200 ? resolve() : retry(n))).on('error', () => retry(n));
    };
    const retry = (n) => (n <= 0 ? reject(new Error('El mock no respondió')) : setTimeout(() => tryOnce(n - 1), 200));
    tryOnce(retries);
  });
}

health()
  .then(() => {
    const child = spawn(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...envExtra } });
    child.on('exit', (code) => { server.kill(); process.exit(code ?? 1); });
  })
  .catch((e) => { console.error(e.message); server.kill(); process.exit(1); });