/**
 * Gym UES - Servicio de fechas y horas.
 *
 * El problema que resuelve: el backend entrega las fechas SIEMPRE como texto
 * local 'YYYY-MM-DD HH:MM:SS' (ver server/models/serializador.js). Ese formato
 * NO es ISO 8601, asi que hacer `new Date('2026-10-02 10:28:34')` depende del
 * navegador: Chrome lo acepta como hora local, Safari lo devuelve como
 * Invalid Date, y Electron con distinta zona lo corre. Ese era el origen de que
 * el admin mostrara una hora distinta a la del reloj del checador.
 *
 * Aqui se parsea SIEMPRE como hora local, sin depender del motor del navegador,
 * y se formatea en espanol. Todo el portal debe usar estas funciones en vez de
 * `new Date(...)` sobre texto del API.
 */

const p2 = (n) => String(n).padStart(2, '0');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Convierte a Date cualquier fecha que llegue del API o de un <input>.
 *
 * - 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' / 'YYYY-MM-DDTHH:MM[:SS]'  -> local
 * - texto con 'Z' o deslocamiento (+hh:mm)                            -> ese instante
 * - objeto Date o number                                            -> se respeta
 *
 * Devuelve null si no hay fecha utilizable, para que el que llame pueda
 * mostrar un guion en vez de "Invalid Date".
 */
export function aFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  // Formato local explicito del backend: nunca se toca el zona horaria.
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  if (local) {
    return new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4] || 0),
      Number(local[5] || 0),
      Number(local[6] || 0),
      0
    );
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' de hoy en hora local (para <input type="date"> y consultas). */
export function hoyISO(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha) || new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 'YYYY-MM-DD HH:MM:SS' en hora local: el formato que espera el backend. */
export function aTextoLocal(fecha) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  );
}

/** 'YYYY-MM-DDTHH:MM' para <input type="datetime-local">. */
export function aInputLocal(fecha) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  return `${hoyISO(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** '10:28' o '10:28:34'. */
export function hora(fecha, conSegundos = false) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  return `${p2(d.getHours())}:${p2(d.getMinutes())}${conSegundos ? `:${p2(d.getSeconds())}` : ''}`;
}

/** '02/10/2026'. */
export function fechaCorta(fecha) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 'viernes, 2 de octubre de 2026'. */
export function fechaLarga(fecha) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * '2 oct 2026, 10:28' - el formato que usan las tablas del admin y del
 * historial, donde la columna es angosta.
 */
export function fechaHora(fecha) {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  if (!d) return '';
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${mes[d.getMonth()]} ${d.getFullYear()}, ${hora(d)}`;
}

/**
 * Diferencia legible entre dos instantes: '3 h 25 min', '45 min', 'ahora'.
 * Se usa en la ficha tecnica para cuanto tiempo lleva adentro la persona.
 */
export function tiempoTranscurrido(desde, hasta = new Date()) {
  const a = desde instanceof Date ? desde : aFecha(desde);
  const b = hasta instanceof Date ? hasta : aFecha(hasta) || new Date();
  if (!a) return '';
  const min = Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const dias = Math.floor(h / 24);
  const horas = h % 24;
  return horas ? `${dias} d ${horas} h` : `${dias} d`;
}

/** Texto para mostrar, o el guion que usa el portal cuando no hay dato. */
export function valor(fecha, formato = fechaCorta, sufijo = '-') {
  const d = fecha instanceof Date ? fecha : aFecha(fecha);
  return d ? formato(d) : sufijo;
}