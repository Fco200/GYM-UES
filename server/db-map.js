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

const catalogos = require('./catalogos');
// Toda conversioon de fecha pasa por aqui, para que la zona horaria del
// gimnasio este FIJADA en codigo y no dependa de donde corra el proceso.
// Ver server/zona.js: usar los getters locales de Date fue lo que descuadro las
// horas del historial.
const { formatearFechaLocal, aFechaLocal } = require('./zona');

// Mapas de valores aceptados para campos tipo enum (alias -> valor canonico).
// Los mapas salen de shared/catalogos.json, de modo que la lista de unidades
// academicas, areas laborales, turnos y generos existe en un solo lugar y la
// comparacion ignora acentos, mayusculas y espacios repetidos.
const OPCIONES = {
  // El tipo NUNCA admite vacio: es el campo que decide las reglas del registro.
  tipo: { ...catalogos.OPCIONES_TIPO },
  genero: { '': '', ...catalogos.OPCIONES_GENERO },
  turno: { '': '', ...catalogos.OPCIONES_TURNO },
  area: { '': '', ...catalogos.OPCIONES_AREA },
  unidad: { '': '', ...catalogos.OPCIONES_UNIDAD }
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
    // Unidad academica de la UES a la que pertenece la persona. Aplica a los
    // tres tipos: los alumnos y el personal se adscriben a un campus y permite
    // implementarlo en Hermosillo, Navojoa, Magdalena, San Luis Rio Colorado y
    // Benito Juarez sin cambiar el modelo.
    academic_unit: { tipo: 'enum', opciones: OPCIONES.unidad, base: '' },
    // Adscripcion academica: la carrera del alumno, el departamento del
    // personal o la empresa/motivo de la persona exterior.
    career: { tipo: 'texto', max: 200, base: '' },
    // Area laboral del personal UES (Docente, Administrativo, Servicios, Apoyo
    // a la Docencia, Directivo). Solo aplica al tipo 'personal'.
    work_area: { tipo: 'enum', opciones: OPCIONES.area, base: '' },
    // Puesto especifico dentro del area ("Profesor de Tiempo Completo",
    // "Auxiliar de Limpieza", "Jefe de Departamento"). Solo tipo 'personal'.
    job_title: { tipo: 'texto', max: 120, base: '' },
    // Contacto directo de la persona. Se capturan porque ante una emergencia
    // el gimnasta puede no tener el celular a la mano y hay que poder localizar
    // a la persona en segundos.
    phone: { tipo: 'telefono', max: 30, base: '' },
    email: { tipo: 'correo', max: 120, base: '' },
    // Tarjeta de contacto de emergencia: se usa si la persona se lesiona. Es
    // un subobjeto porque los cuatro datos juntos son una sola unidad y asi se
    // guardan y se leen como una tarjeta, no como campos sueltos.
    emergency_contact: {
      tipo: 'objeto',
      campos: {
        name: { tipo: 'texto', max: 200, base: '' },
        relationship: { tipo: 'texto', max: 60, base: '' },
        phone: { tipo: 'telefono', max: 30, base: '' },
        email: { tipo: 'correo', max: 120, base: '' }
      },
      base: {}
    },
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
      // catalogos.clave() quita acentos, pasa a minusculas y colapsa espacios,
      // de modo que 'SAN LUIS RÍO COLORADO', 'san luis' y 'slrc' son la misma
      // unidad academica y no hay tres formas distintas de escribirla.
      const v = catalogos.clave(valor);
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

    // Telefono: se conservan los digitos, el '+' inicial y los separadores que
    // la persona escriba (+503 7xxx-xxxx, 7xxx xxxx, (503) 2xxx-xxxx). Solo se
    // recorta al largo maximo; no se fuerza un formato porque en un gimnasio
    // se anota como la persona lo dicta y hay que poder volver a leerlo igual.
    case 'telefono': {
      if (ausente || valor === '') return { valor: def.base === undefined ? '' : def.base };
      const t = String(valor).replace(/[^\d+()\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, def.max || 30);
      return { valor: t };
    }

    // Correo: minusculas y con una comprobacion minima. No se exige el dominio
    // completo porque el gym funciona con redes moviles y a veces se captura el
    // correo desde el celular sin terminarlo.
    case 'correo': {
      if (ausente || valor === '') return { valor: def.base === undefined ? '' : def.base };
      const c = String(valor).trim().toLowerCase().slice(0, def.max || 120);
      if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return { error: 'correo electrónico no válido' };
      return { valor: c };
    }

    // Objeto anidado (contacto de emergencia): cada subcampo se valida con su
    // propia definicion, de modo que el mismo control sirve para texto, correo
    // o telefono sin repetir la logica.
    case 'objeto': {
      const fuente = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
      const salida = {};
      for (const [sub, defSub] of Object.entries(def.campos || {})) {
        const tiene = Object.prototype.hasOwnProperty.call(fuente, sub);
        const r = normalizarValor(defSub, tiene ? fuente[sub] : defSub.base);
        // Un subcampo invalido no tumba todo el objeto: se omite y el resto de
        // la tarjeta se guarda igual, que es preferible a perder el contacto de
        // emergencia completo por un correo mal escrito.
        if (r.error) continue;
        salida[sub] = r.valor;
      }
      return { valor: salida };
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
      return d ? { valor: d } : { error: 'fecha inválida' };
    }

    default:
      return { valor: String(valor === undefined || valor === null ? '' : valor) };
  }
}

const p2 = (n) => String(n).padStart(2, '0');

/**
 * Formatea un Date a 'YYYY-MM-DD HH:MM:SS' en hora del gimnasio.
 *
 * Reexportada desde server/zona.js. Antes vivia aqui con los getters locales de
 * Date (getHours/getDate), lo que hacia que la hora dependiera de la zona del
 * SERVIDOR: en UTC el historial salia corrido. Ahora la zona la decide el
 * codigo, no el host.
 */
const formatearFechaLocalGym = formatearFechaLocal;
const aFechaLocalGym = aFechaLocal;

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

/**
 * Normaliza un valor contra uno de los mapas de OPCIONES y devuelve el valor
 * canonico, o null si no pertenece al catalogo. Lo usan las rutas para validar
 * y para construir filtros de listado (tipo, unidad academica, area, turno),
 * donde lo que importa es NO escribir en la base un valor fuera de catalogo.
 */
function normalizarEnum(mapa, valor) {
  const k = catalogos.clave(valor);
  if (k && Object.prototype.hasOwnProperty.call(mapa, k)) return mapa[k];
  return null;
}

module.exports = {
  SCHEMA,
  OPCIONES,
  ENTIDAD_POR_COLECCION,
  normalizarValor,
  normalizarEntidad,
  normalizarEnum,
  camposDe,
  aFechaLocal: aFechaLocalGym,
  formatearFechaLocal: formatearFechaLocalGym
};
