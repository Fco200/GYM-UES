/**
 * Gym UES - Serializacion de documentos de MongoDB hacia el formato JSON que
 * consume el frontend (src/services/api.js).
 *
 * Es la CAPA DE COMPATIBILIDAD clave de la migracion a MongoDB. El portal y el
 * checador ya funcionan contra MySQL, donde:
 *   - la clave primaria se llamaba `id` y era un entero;
 *   - los DATETIME llegaban como texto 'YYYY-MM-DD HH:MM:SS' en HORA LOCAL.
 *
 * En MongoDB el identificador es `_id` (ObjectId) y las fechas son objetos
 * Date que JSON.stringify() convertiria a ISO-8601 en UTC, lo que:
 *   1) romperia la clave `id` que usa el frontend para editar/asistencias;
 *   2) mostraria la hora corrida (UTC) en las tablas del admin y del checador.
 *
 * Por eso TODO documento sale por aqui: se renombra _id -> id y las fechas se
 * formatean en hora local con el mismo formato textual de siempre.
 */
'use strict';

const mongoose = require('mongoose');
const { formatearFechaLocal } = require('../db-map');

// OJO: el ObjectId real es mongoose.Types.ObjectId. `mongoose.ObjectId` es la
// CLASE DE SCHEMA y no instancia un id: usarla rompe silenciosamente porque
// el documento construido no es un ObjectId valido.
const { ObjectId } = mongoose.Types;

/** El _id de MongoDB es un ObjectId: 24 caracteres hexadecimales. */
function esId(valor) {
  return typeof valor === 'string' && /^[0-9a-fA-F]{24}$/.test(valor);
}

/** Convierte un id de ruta en ObjectId, o null si no es un id valido. */
function aObjectId(valor) {
  return esId(valor) ? new ObjectId(valor) : null;
}

// Campos de fecha de cada coleccion, en el orden en que se serializan.
const CAMPOS_FECHA = {
  alumnos: ['created_at'],
  asistencias: ['check_in', 'check_out', 'created_at'],
  usuarios: ['created_at'],
  ajustes: ['updated_at']
};

const CAMPOS_OCULTOS = {
  // Nunca se expone el hash/contrasena en ninguna respuesta.
  usuarios: ['password', '__v'],
  alumnos: ['__v'],
  asistencias: ['__v'],
  ajustes: ['__v']
};

/**
 * Convierte un documento (lean o hidratado) en un objeto plano listo para
 * res.json(), respetando el contrato historico del API.
 *
 * @param {object|null} doc        documento de MongoDB
 * @param {string}     [coleccion] nombre de coleccion
 * @param {object}     [opciones]
 * @param {string[]}   [opciones.solo]  limita la salida a estos campos
 */
function serializar(doc, coleccion, opciones = {}) {
  if (!doc) return null;

  const src = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : { ...doc };
  const ocultos = new Set(CAMPOS_OCULTOS[coleccion] || ['__v']);
  const fechas = CAMPOS_FECHA[coleccion] || [];
  const solo = opciones.solo ? new Set(opciones.solo) : null;

  const out = {};
  for (const [clave, valor] of Object.entries(src)) {
    if (ocultos.has(clave)) continue;
    if (clave === '_id') {
      if (solo && !solo.has('id')) continue;
      out.id = valor === null || valor === undefined ? null : String(valor);
      continue;
    }
    if (solo && !solo.has(clave)) continue;
    out[clave] = valor;
  }

  for (const campo of fechas) {
    if (!(campo in src)) continue;
    if (solo && !solo.has(campo)) continue;
    out[campo] = src[campo] ? formatearFechaLocal(src[campo]) : null;
  }

  // 'active' siempre es booleano en la respuesta (antes venia 0/1 de MySQL).
  if (coleccion === 'usuarios' && 'active' in src) {
    out.active = Boolean(src.active);
  }

  return out;
}

/** Serializa una lista de documentos. */
function serializarVarios(docs, coleccion, opciones = {}) {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => serializar(d, coleccion, opciones));
}

// ---------- Formateo de fechas locales reutilizable por las rutas ----------

const p2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' del dia de hoy en hora local. */
function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * Rango [inicio, fin) del dia 'YYYY-MM-DD' en hora local, para consultar por
 * indices en lugar de por la funcion DATE() de MySQL (que no usa indice).
 */
function rangoDelDia(fecha = hoy()) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const inicio = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { inicio, fin };
}

/** Rango [inicio, fin) que cubre los dias 'desde'..'hasta' inclusive. */
function rangoDeFechas(desde, hasta) {
  const a = rangoDelDia(desde || hoy());
  const b = rangoDelDia(hasta || desde || hoy());
  return { inicio: a.inicio, fin: b.fin };
}

module.exports = { serializar, serializarVarios, hoy, rangoDelDia, rangoDeFechas, esId, aObjectId };
