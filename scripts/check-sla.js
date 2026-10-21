/**
 * Quality gate del SLA: lee el statistics.json del dashboard de JMeter y falla
 * (exit 1) si el promedio de /api/asisya/seguimiento supera 1500 ms, si hay errores
 * o si el throughput quedó por debajo de 10 rps.
 * Uso: node scripts/check-sla.js [ruta statistics.json]
 */
const fs = require('fs');

const file = process.argv[2] || 'reports/jmeter/dashboard/statistics.json';
const stats = JSON.parse(fs.readFileSync(file, 'utf8'));
const s = stats['GET /api/asisya/seguimiento'];
if (!s) { console.error('No se encontró el sampler de seguimiento'); process.exit(1); }

const reglas = [
  { nombre: 'Promedio < 1500 ms', ok: s.meanResTime < 1500, valor: `${s.meanResTime.toFixed(1)} ms` },
  { nombre: 'Throughput >= 10 rps', ok: s.throughput >= 9.5, valor: `${s.throughput.toFixed(2)} rps` },
  { nombre: 'Errores = 0 %', ok: s.errorPct === 0, valor: `${s.errorPct.toFixed(2)} %` },
];

console.log('\nSLA /api/asisya/seguimiento');
console.log(`Muestras: ${s.sampleCount} · p90: ${s.pct1ResTime} ms · p95: ${s.pct2ResTime} ms · p99: ${s.pct3ResTime} ms · máx: ${s.maxResTime} ms`);
for (const r of reglas) console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.nombre} -> ${r.valor}`);
process.exit(reglas.every((r) => r.ok) ? 0 : 1);
