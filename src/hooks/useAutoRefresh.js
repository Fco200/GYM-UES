import { useEffect, useRef } from 'react';

/** Periodo de refresco automatico del portal: 5 minutos. */
export const INTERVALO_REFRESCO_MS = 5 * 60 * 1000;

/**
 * AUTO-REFRESCADO DE DATOS
 *
 * Ejecuta `callback` cada `intervaloMs` para que el portal se mantenga al día
 * sin que el usuario tenga que recargar la pagina. Motivacion operativa: en el
 * gimnasio el checador marca entradas y salidas todo el dia desde otro
 * dispositivo, y el administrador debe ver esos cambios sin pulsar F5.
 *
 * Decisiones de diseno:
 *  - 5 minutos por defecto. Es el equilibrio que pidio el proyecto: los datos
 *    del dia no cambian cada segundo y un intervalo menor solo gastaria ancho
 *    de banda y consultas contra Atlas sin aportar nada.
 *  - NO refresca si la pestana esta oculta (document.hidden). Nadie mira el
 *    portal en segundo plano, y así no se ejecutan consultas en un equipo
 *    que el usuario dejóMinimizado. Al volver a mirar la pestana se refresca
 *    de inmediato.
 *  - NO refresca mientras hay una operacion en vuelo: `activo` permite pausar
 *    los reintentos (por ejemplo, mientras se guarda un formulario).
 *  - Pausa automaticamente al desmontar el componente, sin dejar temporizadores
 *    huérfanos que dispareen setState sobre un componente desmontado.
 *  - Si el callback falla, se reintenta en el siguiente ciclo: un error de red
 *    puntual no debe detener el refresco para siempre.
 *
 * @param {Function} callback  funcion a ejecutar (puede ser asincrona)
 * @param {number}   intervaloMs  periodo entre ejecuciones (300000 = 5 min)
 * @param {object}   [opciones]
 * @param {boolean}  [opciones.activo=true]  si es false, no se programa nada
 * @param {boolean}  [opciones.alVolver=true] refrescar al volver a la pestana
 */
export default function useAutoRefresh(callback, intervaloMs = 5 * 60 * 1000, opciones = {}) {
  const { activo = true, alVolver = true } = opciones;

  // Guardamos la funcion en un ref para no reiniciar el temporizador cada vez
  // que el componente padre crea una funcion nueva en cada render.
  const refCallback = useRef(callback);
  const refIntervalo = useRef(intervaloMs);
  const refActivo = useRef(activo);
  const refAlVolver = useRef(alVolver);

  refCallback.current = callback;
  refIntervalo.current = intervaloMs;
  refActivo.current = activo;
  refAlVolver.current = alVolver;

  useEffect(() => {
    if (!activo) return undefined;

    let temporizador = null;
    let cancelado = false;

    const ejecutar = async () => {
      if (cancelado || !refActivo.current) return;
      try {
        await refCallback.current();
      } catch {
        // Un fallo puntual (red, Atlas lento) no debe detener el ciclo: se
        // reintentara en la proxima vez.
      }
    };

    const programar = () => {
      if (cancelado) return;
      clearTimeout(temporizador);
      temporizador = setTimeout(async () => {
        await ejecutar();
        programar();
      }, refIntervalo.current);
    };

    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        // Se detiene el ciclo mientras la pestana no se mira.
        clearTimeout(temporizador);
        temporizador = null;
        return;
      }
      // Volvio a la vista: se actualiza al instante y se reanuda el ciclo.
      clearTimeout(temporizador);
      ejecutar().finally(programar);
    };

    programar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [activo, intervaloMs]);
}
