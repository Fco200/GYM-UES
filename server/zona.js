/**
 * Gym UES - Zona horaria del gimnasio.
 *
 * QUE PROBLEMA RESUELVE, DE VERDAD
 * El historial de asistencias salia descuadrado: el reloj del checador marcaba
 * las 7:57 p.m. y en el historial se veia 1:22 a.m. del dia siguiente (o al
 * reves, las 10 contra las 6). La causa NO era la base de datos ni el reloj:
 * era que el backend formateaba las fechas con los getters LOCALES de `Date`
 * (getHours, getDate...). Eso hace que la zona horaria la decida el PROCESO DE
 * NODE, no el codigo. Y el proceso corre en UTC en un servidor en la nube, asi
 * que el backend pintaba la hora de UTC y el navegador la:"-pedia" como si fuera
 * del gym.
 *
 * PONER `TZ=...` EN EL ENTORNO NO ALCANZA
 * Se intento, y no es confiable: depende de que la variable llegue al proceso
 * antes de que se use `Date`, de que el sistema la respete (Windows y Linux no
 * se comportan igual) y de que nadie la borre en un redesplie. Si algo de eso
 * falla, las horas vuelven a estar mal y no hay forma de saberlo.
 *
 * LA SOLUCION
 * Aqui la zona esta FIJADA EN CODIGO y se aplica con `Intl`, que lee la base de
 * datos de zonas horarias del propio Node. No depende del host, ni de variables
 * de entorno, ni del sistema operativo. Si el servidor corre en UTC, en
 * Hermosillo o en Tokio, este modulo devuelve SIEMPRE la hora del gimnasio.
 *
 * Mexico elimino el horario de verano en 2022, asi que America/Mexico_City es
 * un desplazamiento fijo de -06:00. Aun asi se usa el nombre de zona y no un
 * offset fijo, para que el dia de un cambio de horario futuro se resuelva solo.
 */

/** Zona del gimnasio. Se puede overriding con GYM_ZONA, pero el default es el correcto. */
const ZONA = process.env.GYM_ZONA || 'America/Mexico_City';

const p2 = (n) => String(n).padStart(2, '0');

// Formateador de una sola vez: construirlo es caro y solo depende de la zona.
const FORMATEADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // h23 evita que la medianoche salga como "24" en algunas versiones de ICU.
  hourCycle: 'h23'
});

/** Descompone un instante en sus campos de reloj SEGUN LA ZONA DEL GIMNASIO. */
function partes(fecha) {
  const out = {};
  for (const p of FORMATEADOR.formatToParts(fecha)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/**
 * Cuanto se adelanta (+) o se atrasa (-) la zona respecto a UTC, en ms.
 * Positivo para America/Mexico_City (-06:00 -> +21600000).
 */
function desplazamiento(fecha) {
  const p = partes(fecha);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Se resta el resto de milisegundos para que la comparacion sea exacta.
  return comoUtc - (fecha.getTime() - fecha.getMilliseconds());
}

/**
 * Inverso de `partes`: arma el instante UTC que corresponde a una hora de
 * RELOJ en la zona del gimnasio. Es la operacion delicada, porque hay que
 * deducir el desplazamiento: se estima con el instante aproximado y se vuelve a
 * comprobar con el resultado (asi tambien funciona en el borde de un cambio de
 * horario).
 */
function instanteDesdePartes(anio, mes, dia, hora, minuto, segundo) {
  const aproximado = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo);
  const primerDesplazamiento = desplazamiento(new Date(aproximado));
  let instante = aproximado - primerDesplazamiento;
  const segundoDesplazamiento = desplazamiento(new Date(instante));
  if (segundoDesplazamiento !== primerDesplazamiento) {
    instante = aproximado - segundoDesplazamiento;
  }
  return new Date(instante);
}

/** 'YYYY-MM-DD HH:MM:SS' con la hora del gimnasio. Es el formato que ve el portal. */
function formatearFechaLocal(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
  const p = partes(fecha);
  return (
    `${p.year}-${p2(p.month)}-${p2(p.day)} ` +
    `${p2(p.hour)}:${p2(p.minute)}:${p2(p.second)}`
  );
}

/**
 * Convierte a Date lo que llega del cliente o de la base.
 *
 * - 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS' o 'YYYY-MM-DDTHH:MM'  -> se
 *   interpreta como hora de RELOJ del gimnasio, no como UTC. Asi el admin que
 *   escribe "10:00" en el formulario quiere decir las 10 del gym.
 * - Texto con 'Z' o desplazamiento (+hh:mm)                        -> ese
 *   instante exacto, tal cual (viene de otra zona y no se toca).
 * - Date o numero                                                -> se respeta.
 */
function aFechaLocal(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (!texto) return null;

  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto);
  if (local) {
    return instanteDesdePartes(
      Number(local[1]),
      Number(local[2]),
      Number(local[3]),
      Number(local[4] || 0),
      Number(local[5] || 0),
      Number(local[6] || 0)
    );
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' del dia de HOY en el gimnasio. */
function hoy() {
  const p = partes(new Date());
  return `${p.year}-${p2(p.month)}-${p2(p.day)}`;
}

/**
 * Rango [inicio, fin) del dia 'YYYY-MM-DD' del gimnasio, como instantes.
 *
 * Se usa para filtrar por indice en vez de por DATE(), que en MongoDB no usa
 * indice. El `fin` se pide el dia siguiente con Date.UTC, que normaliza solo
 * (el dia 32 pasa al mes que toque), en lugar de sumar 24 h: asi el rango
 * abarca exactamente la medianoche a medianoche aunque cambie el horario.
 */
function rangoDelDia(fecha = hoy()) {
  const partesFecha = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const y = partesFecha ? Number(partesFecha[1]) : 1970;
  const m = partesFecha ? Number(partesFecha[2]) : 1;
  const d = partesFecha ? Number(partesFecha[3]) : 1;
  return {
    inicio: instanteDesdePartes(y, m, d, 0, 0, 0),
    fin: instanteDesdePartes(y, m, d + 1, 0, 0, 0)
  };
}

/** Rango [inicio, fin) que cubre los dias 'desde'..'hasta' inclusive. */
function rangoDeFechas(desde, hasta) {
  const a = rangoDelDia(desde || hoy());
  const b = rangoDelDia(hasta || desde || hoy());
  return { inicio: a.inicio, fin: b.fin };
}

/**
 * Texto de diagnostico para /api/health y para el arranque del servidor.
 * Sirve para confirmar de un vistazo que el backend esta usando la zona del gym
 * y no la del host, sin tener que razonar sobre el desplazamiento.
 */
function diagnostico() {
  const ahora = new Date();
  const p = partes(ahora);
  return {
    zona: ZONA,
    desplazamientoMinutos: Math.round(desplazamiento(ahora) / 60000),
    ahoraEnGimnasio: `${p.year}-${p2(p.month)}-${p2(p.day)} ${p2(p.hour)}:${p2(p.minute)}:${p2(p.second)}`,
    // La zona del PROCESO, que es justo lo que hay que ignorar. Se reporta para
    // que se note si alguien vuelve a formatar con los getters de Date.
    zonaDelProceso: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    utc: ahora.toISOString()
  };
}

module.exports = {
  ZONA,
  partes,
  desplazamiento,
  formatearFechaLocal,
  aFechaLocal,
  hoy,
  rangoDelDia,
  rangoDeFechas,
  diagnostico
};
