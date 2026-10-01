/**
 * Gym UES - Mapa central de campos de la base de datos (MongoDB) y
 * normalizacion SEGURA de los valores antes de guardarlos.
 *
 * Objetivos:
 *   1) Ser la UNICA fuente de verdad de los campos de cada coleccion.
 *   2) Normalizar (recortar, canonicalizar enums, validar longitudes) todo
 *      valor antes de tocar MongoDB. Nunca se escribe en la base lo que el
 *      cliente mando tal cual.
 *   3) Las rutas solo reciben objetos ya normalizados: Mongoose se encarga del
 *      escapado, por lo que no existe concatenacion de cadenas.
 *
 * Regla de oro: ninguna ruta construye consultas a mano con datos del cliente;
 * siempre pasa por estas utilidades y por los modelos de server/models.
 */
'use strict';

// Mapas de valores celebrados para campos tipo enum (alias -> valor canonico).
const OPCIONES = {
  tipo: {
    alumno: 'alumno',
    estudiante: 'alumno',
    maestro: 'maestro',
    docente: 'maestro',
    exterior: 'exterior',
    externo: 'exterior'
  },
  genero: {
    '': '',
    femenino: 'Femenino',
    masculino: 'Masculino',
    otro: 'Otro'
  },
  turno: {
    '': '',
    matutino: 'Matutino',
    manana: 'Matutino',
    'mañana': 'Matutino',
    vespertino: 'Vespertino',
    tarde: 'Vespertino',
    sabatino: 'Sabatino',
    general: ''
  }
};

// Campos admitidos por coleccion. Cada definicion indica como normalizar:
//  - protegida:  no se recibe del cliente (se genera en el servidor).
//  - soloInsert: se puede crear pero NO actualizar (student_code).
//  - base:       valor por defecto si el cliente no lo envia.
//  - fecha:      se convierte a Date real de JavaScript.
const SCHEMA = {
  alumnos: {
    student_code: { tipo: 'texto', max: 50, base: '' },
    full_name: { tipo: 'texto', max: 200, base: '' },
    second_name: { tipo: 'texto', max: 200, base: '' },
    last_name: { tipo: 'texto', max: 200, base: '' },
    type: { tipo: 'enum', opciones: OPCIONES.tipo, base: 'alumno' },
    gender: { tipo: 'enum', opciones: OPCIONES.genero, base: '' },
    turn: { tipo: 'enum', opciones: OPCIONES.turno, base: '' },
    career: { tipo: 'texto', max: 200, base: '' },
    image_url: { tipo: 'texto', max: 500, base: '' },
    medical_certificate: { tipo: 'texto', max: 255, base: 'No' },
    created_at: { tipo: 'fecha', protegida: true }
  },
  asistencias: {
    student_code: { tipo: 'texto', max: 50, base: '' },
    full_name: { tipo: 'texto', max: 200, base: '' },
    user_type: { tipo: 'enum', opciones: OPCIONES.tipo, base: 'alumno' },
    check_in: { tipo: 'fecha' },
    check_out: { tipo: 'fecha' },
    created_at: { tipo: 'fecha', protegida: true }
  },
  ajustes: {
    setting_key: { tipo: 'texto', max: 100 },
    setting_value: { tipo: 'texto', max: 100000, base: '' },
    updated_at: { tipo: 'fecha', protegida: true }
  },
  usuarios: {
    username: { tipo: 'texto', max: 100 },
    password: { tipo: 'texto', max: 255 },
    role: { tipo: 'texto', max: 50, base: 'admin' },
    scope_values: { tipo: 'lista', max: 50, base: null },
    active: { tipo: 'booleano', base: true },
    created_at: { tipo: 'fecha', protegida: true }
  }
};

/** Nombres de coleccion -> nombre de entidad usado en SCHEMA. */
const ENTIDAD_POR_COLECCION = {
  alumnos: 'alumnos',
  asistencias: 'asistencias',
  ajustes: 'ajustes',
  usuarios: 'usuarios'
};

/**
 * Normaliza un valor segun la definicion de su campo.
 * Devuelve { valor } o { error }.
 */
function normalizarValor(def, valor) {
  const ausente = valor === undefined || valor === null;

  switch (def.tipo) {
    case 'texto': {
      const texto = String(valor === undefined || valor === null ? '' : valor)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, def.max || 200);
      return { valor: texto };
    }

    case 'enum': {
      const v = String(valor === undefined || valor === null ? '' : valor).trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(def.opciones, v)) {
        return { valor: def.opciones[v] };
      }
      return { error: `valor no permitido: "${v}"` };
    }

    case 'lista': {
      if (ausente) return { valor: def.base === undefined ? [] : def.base };
      if (!Array.isArray(valor)) return { error: 'debe ser una lista' };
      const lista = valor
        .map((v) => String(v).trim().slice(0, def.max || 50))
        .filter(Boolean)
        .slice(0, 50);
      return { valor: lista.length > 0 ? lista : def.base === undefined ? [] : def.base };
    }

    case 'booleano': {
      if (ausente) return { valor: def.base === undefined ? true : def.base };
      if (typeof valor === 'boolean') return { valor };
      if (valor === 1 || valor === '1' || valor === 'true') return { valor: true };
      return { valor: false };
    }

    case 'entero': {
      const n = Number(valor);
      return Number.isInteger(n) ? { valor: n } : { error: 'debe ser un entero' };
    }

    case 'fecha': {
      if (ausente || valor === '') return { valor: null };
      // Acepta 'YYYY-MM-DD HH:MM:SS' (formato local historico de MySQL),
      // ISO-8601 y el valor 'YYYY-MM-DDTHH:MM' que envian los <input
      // type="datetime-local"> del portal admin. Todo se interpreta como
      // HORA LOCAL, nunca UTC, para no desplazar los horarios del gimnasio.
      const d = aFechaLocal(valor);
      return d ? { valor: d } : { error: 'fecha invalida' };
    }

    default:
      return { valor: String(valor === undefined || valor === null ? '' : valor) };
  }
}

const p2 = (n) => String(n).padStart(2, '0');

/** Formatea un Date a 'YYYY-MM-DD HH:MM:SS' en hora local. */
function formatearFechaLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  );
}

/**
 * Convierte a Date cualquier entrada de fecha de la aplicacion, SIEMPRE en
 * hora local. Rechaza '2026-09-25T14:30:00.000Z' como texto suelto para que
 * el 'Z' (UTC) no termine desplazando la hora; los objetos Date ya bucketeados
 * por MongoDB se respetan tal cual.
 */
function aFechaLocal(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (!texto) return null;

  // Formato local explicito: YYYY-MM-DD[ T]HH:MM[:SS]
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto);
  if (local) {
    const d = new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4] || 0),
      Number(local[5] || 0),
      Number(local[6] || 0),
      0
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Cualquier otro formato (p.ej. ISO con Z) se delega al motor de JS, que
  // respeta la zona horaria del instante.
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Normaliza un objeto arbitrario del cliente contra la definicion de una
 * coleccion y devuelve { datos, errores }.
 *
 * @param {string} coleccion  nombre de coleccion (alumnos, asistencias, ...)
 * @param {object} entrada     objeto recibido del cliente
 * @param {object} [opciones]
 * @param {boolean} [opciones.completo=true]  true = toma todos los campos
 *        aplicando sus valores por defecto (alta); false = solo los campos
 *        presentes en `entrada` (edicion parcial).
 */
function normalizarEntidad(coleccion, entrada, opciones = {}) {
  const completo = opciones.completo !== false;
  const defEntidad = SCHEMA[coleccion] || {};
  const raw = entrada && typeof entrada === 'object' ? entrada : {};
  const datos = {};
  const errores = [];

  for (const [campo, def] of Object.entries(defEntidad)) {
    if (def.protegida) continue;
    if (!completo && def.soloInsert) continue;

    const presente = Object.prototype.hasOwnProperty.call(raw, campo);
    if (!completo && !presente) continue;

    let valor = presente ? raw[campo] : undefined;
    if (!presente && def.base !== undefined) valor = def.base;

    const res = normalizarValor(def, valor);
    if (res.error) {
      errores.push(`${campo}: ${res.error}`);
      continue;
    }
    datos[campo] = res.valor;
  }

  return { datos, errores };
}

/** Devuelve la lista de campos editables de una coleccion. */
function camposDe(coleccion) {
  return Object.entries(SCHEMA[coleccion] || {})
    .filter(([, def]) => !def.protegida)
    .map(([campo]) => campo);
}

module.exports = {
  SCHEMA,
  OPCIONES,
  ENTIDAD_POR_COLECCION,
  normalizarValor,
  normalizarEntidad,
  camposDe,
  aFechaLocal,
  formatearFechaLocal
};
