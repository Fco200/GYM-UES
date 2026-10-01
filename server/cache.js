/**
 * Gym UES - Cache en memoria con tiempo de vida (TTL).
 *
 * Motivo (requisito "las peticiones a la base de datos sean rapidas"):
 * el checador es un kiosco sin sesion que golpea /api/public/count-today en
 * cada apertura y el panel admin lee la configuracion institucional en cada
 * carga. Atlas es una base remota: cada consulta son ~30-80 ms de ida y vuelta
 * de red. Cachear estos dos datos, que cambian muy pocas veces, elimina la
 * mayor parte de la latencia percibida sin excluir datos del negocio.
 *
 * No se cachea nada que el usuario pueda cambiar seguido: asistencias,
 * alumnos y cuentas siempre se leen de Atlas.
 *
 * NOTA: es una cache por proceso. Si mas adelante se despliega en varias
 * instancias habria que moverla a Redis o convertirla en un contador
 * compartido.
 */
'use strict';

const store = new Map();

// Limpia entradas vencidas para que el Map no crezca sin control.
const PODA_MS = 5 * 60 * 1000;
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, entrada] of store) {
    if (ahora - entrada.t > Math.max(entrada.ttl, PODA_MS)) store.delete(clave);
  }
}, PODA_MS).unref();

/** Devuelve el valor cacheado, o undefined si no hay o ya vencio. */
function leer(clave, ttlMs) {
  const entrada = store.get(clave);
  if (!entrada) return undefined;
  if (Date.now() - entrada.t > ttlMs) {
    store.delete(clave);
    return undefined;
  }
  return entrada.v;
}

/** Guarda un valor con su TTL (para la poda posterior). */
function guardar(clave, valor, ttlMs) {
  store.set(clave, { v: valor, t: Date.now(), ttl: ttlMs });
  return valor;
}

/** Invalida una clave (tras una escritura que la cambia). */
function invalidar(clave) {
  store.delete(clave);
}

/** Invalida todas las claves que empiezan por un prefijo. */
function invalidarPrefijo(prefijo) {
  for (const clave of store.keys()) {
    if (clave.startsWith(prefijo)) store.delete(clave);
  }
}

module.exports = { leer, guardar, invalidar, invalidarPrefijo };

// Claves de cache conocidas (evita errores de escritura en las rutas).
const CLAVES = {
  AJUSTES: 'config:ajustes',
  CONTEO_HOY: 'conteo:hoy'
};

module.exports.CLAVES = CLAVES;
