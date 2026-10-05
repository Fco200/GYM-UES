/**
 * Prueba de la zona horaria (server/zona.js).
 *
 * Esta es LA prueba que importa. El historial de asistencias salia descuadrado
 * porque el backend formateaba con los getters locales de Date, o sea que la
 * hora la decidia el SERVIDOR. En la nube el servidor corre en UTC, y por eso
 * una entrada de las 7:57 p.m. aparecia como 1:22 a.m. del dia siguiente.
 *
 * Arranca este script UNA VEZ por cada zona del mundo y comprueba que el
 * resultado es IDENTICO. Si la zona del host cambiara el resultado, el bug
 * seguiria presente por mas que se ponga la variable TZ en el entorno: por eso
 * la zona esta fijada en codigo con Intl y no se toma del proceso.
 *
 *   node temp/prueba-zona.cjs
 */

const path = require('path');

let ok = 0;
let fallos = 0;

function check(nombre, condicion, detalle = '') {
  if (condicion) {
    ok += 1;
    console.log(`  OK   ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}${detalle ? ' -> ' + detalle : ''}`);
  }
}

function igual(nombre, obtenido, esperado) {
  check(nombre, obtenido === esperado, `esperado "${esperado}", obtenido "${obtenido}"`);
}

/** Un instante fijo y su hora de reloj en Sonora (UTC-06:00). */
const CASOS = [
  {
    nombre: '19:57 de la tarde',
    utc: '2026-10-05T01:57:22.000Z',
    esperado: '2026-10-04 19:57:22'
  },
  {
    nombre: '10:00 de la manana',
    utc: '2026-10-04T16:00:00.000Z',
    esperado: '2026-10-04 10:00:00'
  },
  {
    nombre: '14:00 de la tarde',
    utc: '2026-10-04T20:00:00.000Z',
    esperado: '2026-10-04 14:00:00'
  },
  {
    nombre: '00:30 de la madrugada',
    utc: '2026-10-04T06:30:00.000Z',
    esperado: '2026-10-04 00:30:00'
  },
  // Cruce de dia: en UTC sigue siendo 5 de octubre, en Sonora todavia es 4.
  // Este es el caso que mas confunde en el historial.
  {
    nombre: 'cruce de dia hacia atras',
    utc: '2026-10-05T05:59:59.000Z',
    esperado: '2026-10-04 23:59:59'
  },
  {
    nombre: 'cruce de dia hacia adelante',
    utc: '2026-10-04T06:00:00.000Z',
    esperado: '2026-10-04 00:00:00'
  },
  {
    nombre: 'fin de ano',
    utc: '2027-01-01T04:59:00.000Z',
    esperado: '2026-12-31 22:59:00'
  },
  {
    nombre: 'medianoche exacta',
    utc: '2026-10-04T06:00:00.000Z',
    esperado: '2026-10-04 00:00:00'
  }
];

/** Zonas del host contra las que se prueba. Incluye las trampas habituales. */
const ZONAS_HOST = [
  'UTC',
  'America/Mexico_City',
  'America/New_York',
  'America/Vancouver',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Madrid',
  'Pacific/Kiritimati', // UTC+14, el extremo oriental
  'Pacific/Midway' // UTC-11, el extremo occidental
];

// El script se relanza por cada zona del host, porque process.env.TZ solo se
// aplica al arrancar el proceso.
if (process.env._ZONA_ACTUAL) {
  const { formatearFechaLocal, aFechaLocal, hoy, rangoDelDia, diagnostico } = require(
    path.join(__dirname, '..', 'server', 'zona.js')
  );

  const zonaHost = process.env._ZONA_ACTUAL;
  console.log(`\n=== Zona del proceso (host): ${zonaHost} ===`);

  const d = diagnostico();
  igual('zona fijada en codigo', d.zona, 'America/Mexico_City');
  igual('desplazamiento de Sonora', d.desplazamientoMinutos, -360);

  console.log('\n[1] Un instante UTC se muestra en hora del gimnasio');
  for (const caso of CASOS) {
    igual(caso.nombre, formatearFechaLocal(new Date(caso.utc)), caso.esperado);
  }

  console.log('\n[2] Ida y vuelta: lo que se muestra es lo que se guarda');
  for (const caso of CASOS) {
    const original = new Date(caso.utc);
    const ida = formatearFechaLocal(original);
    const vuelta = aFechaLocal(ida);
    check(
      `vuelta de "${ida}"`,
      vuelta.getTime() === original.getTime(),
      `original ${original.toISOString()}, vuelto ${vuelta.toISOString()}`
    );
  }

  console.log('\n[3] El rango del dia cae en la medianoche del gimnasio');
  const r = rangoDelDia('2026-10-04');
  igual('inicio = medianoche local', formatearFechaLocal(r.inicio), '2026-10-04 00:00:00');
  igual('fin = siguiente medianoche', formatearFechaLocal(r.fin), '2026-10-05 00:00:00');
  igual('inicio en UTC', r.inicio.toISOString(), '2026-10-04T06:00:00.000Z');

  // Una entrada de las 23:30 del 4 cae dentro del rango del 4, y una de las
  // 00:30 del 5 no. Esto es lo que decide si el conteo de "hoy" acierta.
  const entradaNoche = new Date('2026-10-05T05:30:00.000Z'); // 23:30 del 4 en Sonora
  const entradaMadrugada = new Date('2026-10-04T06:30:00.000Z'); // 00:30 del 4
  check('23:30 del dia 4 cae en el rango del 4', entradaNoche >= r.inicio && entradaNoche < r.fin);
  check('00:30 del dia 5 NO cae en el rango del 4', !(entradaMadrugada < r.inicio));

  console.log('\n[4] Texto del formulario: "10:00" son las 10 del gimnasio');
  const elegido = aFechaLocal('2026-10-04 10:00:00');
  igual('instante en UTC', elegido.toISOString(), '2026-10-04T16:00:00.000Z');
  igual('se vuelve a mostrar como 10:00', formatearFechaLocal(elegido), '2026-10-04 10:00:00');
  igual('formato datetime-local', aFechaLocal('2026-10-04T10:00').toISOString(), '2026-10-04T16:00:00.000Z');

  console.log('\n[5] Texto con Z se respeta como instante, sin desplazarlo');
  igual('ISO con Z', aFechaLocal('2026-10-04T16:00:00.000Z').toISOString(), '2026-10-04T16:00:00.000Z');

  console.log('\n[6] Hoy y casos limite');
  igual('fecha suelta sin hora', formatearFechaLocal(aFechaLocal('2026-10-04')), '2026-10-04 00:00:00');
  igual('cadena vacia', aFechaLocal(''), null);
  igual('nulo', aFechaLocal(null), null);
  igual('texto basura', aFechaLocal('no-es-fecha'), null);
  igual('Date invalido', formatearFechaLocal(new Date('x')), null);
  check('hoy tiene formato YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(hoy()), hoy());

  console.log(`\n${zonaHost}: ${fallos} fallo(s) de ${ok + fallos} comprobaciones`);
  process.exit(fallos ? 1 : 0);
}

// ---------- Lanzador ----------
const { spawnSync } = require('child_process');
let totalFallos = 0;
for (const zona of ZONAS_HOST) {
  const r = spawnSync(process.execPath, [__filename], {
    env: { ...process.env, _ZONA_ACTUAL: zona, TZ: zona },
    encoding: 'utf8',
    stdio: 'inherit'
  });
  totalFallos += r.status === 0 ? 0 : 1;
}

console.log('\n==================================================');
if (totalFallos) {
  console.log(`FALLO: ${totalFallos} de ${ZONAS_HOST.length} zonas del host dieren un resultado distinto.`);
  console.log('El backend sigue dependiendo de la zona donde corre.');
} else {
  console.log(`TODO OK: las ${ZONAS_HOST.length} zonas del host dan el mismo resultado.`);
  console.log('El historial ya no depende de donde este desplegado el servidor.');
}
console.log('==================================================\n');
process.exit(totalFallos ? 1 : 0);
