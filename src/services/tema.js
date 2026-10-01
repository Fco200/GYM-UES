/**
 * Gym UES - Servicio de tema (claro / oscuro).
 *
 * El tema se guarda en localStorage y se aplica como atributo data-tema en
 * <html>, que es lo que activan las variables CSS de global.css. De ese modo
 * TODO el portal cambia de color sin duplicar una sola regla de estilo.
 *
 * Tres modos: 'claro', 'oscuro' y 'sistema' (sigue al SO). Se guarda el modo
 * elegido, no el color resultante, para que un cambio de tema del sistema se
 * siga reflejando mientras el usuario no elija un color fijo.
 */

const CLAVE = 'gym_tema';
const MODOS = ['claro', 'oscuro', 'sistema'];

/** Devuelve el modo guardado, o 'sistema' si el usuario nunca eligio. */
export function obtenerModo() {
  try {
    const v = localStorage.getItem(CLAVE);
    return MODOS.includes(v) ? v : 'sistema';
  } catch {
    // localStorage puede estar bloqueado (modo privado): se usa 'sistema'.
    return 'sistema';
  }
}

/** Resuelve si el modo debe verse oscuro ahora mismo. */
export function modoEsOscuro(modo = obtenerModo()) {
  if (modo === 'oscuro') return true;
  if (modo === 'claro') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Escribe el atributo data-tema en <html>. */
export function aplicarTema(modo = obtenerModo()) {
  const oscuro = modoEsOscuro(modo);
  document.documentElement.setAttribute('data-tema', oscuro ? 'oscuro' : 'claro');
  // El navegador usa esto para pintar los scrollbars y los form nativos.
  document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
}

/** Guarda el modo y lo aplica de inmediato. Devuelve el modo resultante. */
export function guardarModo(modo) {
  const valido = MODOS.includes(modo) ? modo : 'sistema';
  try {
    if (valido === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, valido);
  } catch {
    /* sin persistencia: el tema durara lo que la sesion abierta */
  }
  aplicarTema(valido);
  return valido;
}

/** Ciclo util para un boton: claro -> oscuro -> sistema. */
export function siguienteModo(modo = obtenerModo()) {
  const i = MODOS.indexOf(modo);
  return MODOS[(i + 1) % MODOS.length];
}

/** Etiquetas de los botones segun el tema activo. */
export const ETIQUETAS = {
  claro: { icono: '☀', texto: 'Claro', titulo: 'Cambiar a tema oscuro' },
  oscuro: { icono: '☾', texto: 'Oscuro', titulo: 'Seguir al tema del sistema' },
  sistema: { icono: '◐', texto: 'Sistema', titulo: 'Cambiar a tema claro' }
};

/**
 * Aplica el tema al cargar y se queda escuchando los cambios del sistema.
 * Devuelve una funcion para dejar de escuchar (util en pruebas).
 */
export function iniciarTema() {
  aplicarTema();
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const alCambiar = () => {
    if (obtenerModo() === 'sistema') aplicarTema('sistema');
  };
  // addEventListener es la API estandar; addListener es la de los navegadores
  // antiguos (Safari / Chromium viejos), que son comunes en equipos de escritorio.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(alCambiar);
    return () => mq.removeListener(alCambiar);
  }
  return () => {};
}
