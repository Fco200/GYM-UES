/**
 * Gym UES - Catalogos institucionales (tipos de persona, areas laborales del
 * personal UES, unidades academicas, turnos y generos).
 *
 * Los datos viven en shared/catalogos.json para que el backend y el frontend
 * compartan EXACTAMENTE la misma lista: si se agrega una unidad academica o un
 * area nueva, aparece en los desplegables, en la validacion del servidor y en
 * los reportes sin tocar tres archivos distintos.
 *
 * Este modulo anade lo que el JSON no expresa:
 *   - mapas alias -> valor canonico, que consume db-map.js para normalizar;
 *   - helpers de lectura (tipoPorId, esPersonal, etiquetaTipo).
 *
 * COMPARACION DE ALIAS: todo alias se reduce con `clave()`, que quita acentos,
 * pasa a minusculas y colapsa espacios. Por eso los alias del JSON van escritos
 * sin tildes ni mayusculas, y 'San Luis Rio Colorado' con tilde tambien resuelve.
 */
'use strict';

const CATALOGOS = require('../shared/catalogos.json');

/** Reduce un texto a su forma comparable (sin acentos, minusculas, sin dobles espacios). */
function clave(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte una lista del catalogo en un mapa plano alias -> valor canonico.
 * Cada elemento aporta su valor (`valor`, o `id` en el caso de los tipos de
 * persona) y todos sus alias. El propio valor se agrega como alias para que el
 * texto exacto que ya vive en la base de datos siga siendo aceptado aunque no
 * este listado a mano.
 */
function mapaDeAlias(lista) {
  const mapa = Object.create(null);
  for (const item of lista) {
    const canonico = item.valor !== undefined ? item.valor : item.id;
    if (canonico === undefined) continue;
    mapa[clave(canonico)] = canonico;
    for (const alias of item.alias || []) {
      const k = clave(alias);
      if (k) mapa[k] = canonico;
    }
  }
  return mapa;
}

// ---------- Tipos de persona ----------

const TIPOS = CATALOGOS.tipos;
const VALID_TYPES = TIPOS.map((t) => t.id);
const OPCIONES_TIPO = mapaDeAlias(TIPOS);

/** Configuracion de un tipo de persona; null si el id no existe. */
function tipoPorId(id) {
  const id2 = String(id || '').trim();
  return TIPOS.find((t) => t.id === id2) || null;
}

/** Traduce cualquier forma recibida ('maestro', 'Mto', 'trabajador') al id canonico. */
function canonicalizarTipo(valor) {
  const k = clave(valor);
  return k && Object.prototype.hasOwnProperty.call(OPCIONES_TIPO, k) ? OPCIONES_TIPO[k] : null;
}

/** Etiqueta legible de un tipo para la interfaz. */
function etiquetaTipo(id) {
  const t = tipoPorId(id) || tipoPorId(canonicalizarTipo(id));
  return t ? t.etiquetaCorta : String(id || '');
}

/** true para 'personal': los trabajadores / empleados de la UES de cualquier area. */
function esPersonal(id) {
  return canonicalizarTipo(id) === 'personal';
}

// ---------- Catalogos enumerados ----------

const AREAS_TRABAJO = CATALOGOS.areasTrabajo.map((a) => a.valor);
const UNIDADES_ACADEMICAS = CATALOGOS.unidadesAcademicas.map((u) => u.valor);
const TURNOS = CATALOGOS.turnos.map((t) => t.valor);
const GENEROS = CATALOGOS.generos.map((g) => g.valor);

const OPCIONES_AREA = mapaDeAlias(CATALOGOS.areasTrabajo);
const OPCIONES_UNIDAD = mapaDeAlias(CATALOGOS.unidadesAcademicas);
const OPCIONES_TURNO = mapaDeAlias(CATALOGOS.turnos);
const OPCIONES_GENERO = mapaDeAlias(CATALOGOS.generos);

/** Etiqueta de una unidad academica ('' si no se capturo o no existe). */
function etiquetaUnidad(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  const k = clave(v);
  return Object.prototype.hasOwnProperty.call(OPCIONES_UNIDAD, k) ? OPCIONES_UNIDAD[k] : v;
}

/** Etiqueta de un area laboral ('' si no se capturo o no existe). */
function etiquetaArea(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  const k = clave(v);
  return Object.prototype.hasOwnProperty.call(OPCIONES_AREA, k) ? OPCIONES_AREA[k] : v;
}

module.exports = {
  CATALOGOS,
  TIPOS,
  VALID_TYPES,
  AREAS_TRABAJO,
  UNIDADES_ACADEMICAS,
  TURNOS,
  GENEROS,
  OPCIONES_TIPO,
  OPCIONES_AREA,
  OPCIONES_UNIDAD,
  OPCIONES_TURNO,
  OPCIONES_GENERO,
  clave,
  tipoPorId,
  canonicalizarTipo,
  etiquetaTipo,
  esPersonal,
  etiquetaUnidad,
  etiquetaArea
};
