/**
 * Prueba de carga local del servidor Express.
 *
 * Arranca el servidor real en un puerto aislado con una URI de Mongo invalida
 * (para no tocar la base) y dispara N peticiones simultaneas contra /api/ping y
 * /api/health, que no dependen de la base. Sirve para comprobar que la capa
 * HTTP (keep-alive, compression, json) sostiene 500+ conexiones a la vez.
 */
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT_PRUEBA || 3999);
const N = Number(process.env.N_CONCURRENTES || 600);
const BASE = `http://localhost:${PORT}`;

const hijo = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    MONGODB_URI: 'mongodb://127.0.0.1:1/sin-base',
    NODE_ENV: 'test'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

hijo.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`));
hijo.stderr.on('data', (d) => process.stdout.write(`[srv-err] ${d}`));

async function esperarServidor(intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/ping`);
      if (r.ok) return true;
    } catch {
      /* aun no escucha */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function tanda(ruta, cantidad) {
  const inicio = Date.now();
  const resultados = await Promise.allSettled(
    Array.from({ length: cantidad }, () => fetch(`${BASE}${ruta}`).then((r) => r.status))
  );
  const ms = Date.now() - inicio;
  const ok = resultados.filter((r) => r.status === 'fulfilled' && r.value === 200).length;
  const fallos = resultados.length - ok;
  const errores = resultados
    .filter((r) => r.status === 'rejected')
    .slice(0, 3)
    .map((r) => r.reason && r.reason.message);
  return { ruta, cantidad, ok, fallos, ms, rps: Math.round((cantidad / ms) * 1000), errores };
}

let codigoSalida = 0;
try {
  if (!(await esperarServidor())) {
    console.error('El servidor no respondio a /api/ping.');
    codigoSalida = 1;
  } else {
    const tandas = [];
    tandas.push(await tanda('/api/ping', N));
    tandas.push(await tanda('/api/health', N));
    // Mezcla realista: ping + health a la vez.
    const mixtaInicio = Date.now();
    const mixta = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        fetch(`${BASE}${i % 2 ? '/api/ping' : '/api/health'}`).then((r) => r.status)
      )
    );
    tandas.push({
      ruta: 'ping+health',
      cantidad: N,
      ok: mixta.filter((r) => r.status === 'fulfilled' && r.value === 200).length,
      fallos: mixta.filter((r) => !(r.status === 'fulfilled' && r.value === 200)).length,
      ms: Date.now() - mixtaInicio,
      rps: Math.round((N / (Date.now() - mixtaInicio)) * 1000),
      errores: []
    });

    for (const t of tandas) {
      console.log(
        `${t.ruta.padEnd(12)} ${t.cantidad} simultaneas -> ${t.ok} OK, ${t.fallos} fallos, ` +
          `${t.ms} ms (~${t.rps} req/s)`
      );
      if (t.errores.length) console.log(`  errores: ${t.errores.join(' | ')}`);
      if (t.fallos > 0) codigoSalida = 1;
    }
  }
} catch (err) {
  console.error('Fallo la prueba:', err);
  codigoSalida = 1;
} finally {
  hijo.kill('SIGTERM');
  setTimeout(() => hijo.kill('SIGKILL'), 2500).unref();
  await new Promise((r) => setTimeout(r, 600));
  process.exit(codigoSalida);
}
