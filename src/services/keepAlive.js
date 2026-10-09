// Gym UES - Senal de mantenimiento para que el servidor no se duerma.
//
// El plan gratuito de Render apaga el servicio tras unos 15 minutos sin
// peticiones (y la siguiente visita paga ~30-50 s de "despertar"). Mientras la
// aplicacion este abierta (el kiosco o el portal), este modulo envia una
// peticion ligera a /api/health cada pocos minutos para mantenerlo despierto.
//
// Se puede apuntar a otro dominio sin tocar el codigo definiendo la variable
// de entorno VITE_KEEPALIVE_URL al compilar.
import { API_URL } from './api.js';

const URL_REMOTA = import.meta.env.VITE_KEEPALIVE_URL || 'https://gym-ues-3rx8.onrender.com';

// 4 minutos: por debajo del corte de 15 minutos de Render y sin trafico de mas.
const INTERVALO_MS = 4 * 60 * 1000;

/** Destinos a mantener despiertos: el backend en uso y el despliegue web. */
function destinos() {
  const lista = new Set();
  const local = `${API_URL}/api/health`;
  lista.add(local);
  if (URL_REMOTA) {
    const remoto = `${URL_REMOTA.replace(/\/+$/, '')}/api/health`;
    lista.add(remoto);
  }
  return [...lista];
}

/** Envia la senal a todos los destinos; los errores se ignoran a proposito. */
function enviarSenal() {
  for (const url of destinos()) {
    try {
      fetch(url, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {});
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  }
}

/**
 * Arranca el ciclo de mantenimiento. Devuelve una funcion para detenerlo
 * (se usa al desmontar el componente que la inicia).
 */
export function iniciarKeepAlive() {
  enviarSenal();
  const id = setInterval(enviarSenal, INTERVALO_MS);
  return () => clearInterval(id);
}
