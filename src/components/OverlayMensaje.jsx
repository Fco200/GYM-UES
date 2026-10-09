import { useEffect, useRef, useState, useCallback } from 'react';

// Notificacion flotante (toast) con animacion suave de entrada y salida.
// DURACION estricta: 2000 ms en pantalla; luego hace fade-out y se retira sola
// para agilizar el flujo de trabajo en el gimnasio.
const DURACION = 2000;
const FADE_OUT_MS = 250;

export default function OverlayMensaje({ mensaje }) {
  // mensaje: { texto, tipo: 'exito'|'error'|'info' }
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const timer = useRef(null);
  const fadeTimer = useRef(null);

  useEffect(() => {
    if (!mensaje) return undefined;

    // Nueva alerta: aparece inmediatamente (fade-in) y se programa el retiro.
    setSaliendo(false);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);

    timer.current = setTimeout(() => {
      // Final de la duracion: Inicia el fade-out.
      setSaliendo(true);
      fadeTimer.current = setTimeout(() => {
        setVisible(false);
        setSaliendo(false);
      }, FADE_OUT_MS);
    }, DURACION);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [mensaje?.id, mensaje?.texto]);

  if (!mensaje || !visible) return null;

  const titulo =
    mensaje.tipo === 'exito'
      ? '\u2714 Correcto'
      : mensaje.tipo === 'error'
        ? '\u2716 Error'
        : '\u2139 Información';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`overlay-mensaje ${mensaje.tipo || 'info'}${saliendo ? ' saliendo' : ''}`}
    >
      <div className={`overlay-mensaje-caja ${mensaje.tipo || 'info'}`}>
        <span className="overlay-mensaje-ico">
          {mensaje.tipo === 'exito' ? '\u2714' : mensaje.tipo === 'error' ? '\u2716' : '\u2139'}
        </span>
        <div className="overlay-mensaje-texto">
          <h3>{titulo}</h3>
          <p>{mensaje.texto}</p>
        </div>
      </div>
    </div>
  );
}

// Hook auxiliar: devuelve el estado de mensaje, una funcion para mostrarlo y
// otra para limpiarlo. `limpiar` se usa al iniciar una accion nueva para que no
// quede en pantalla el aviso de un intento anterior (por ejemplo, un error de
// credenciales que sobreviva a un login correcto).
export function useMensaje() {
  const [mensaje, setMensaje] = useState(null);

  const mostrar = useCallback((texto, tipo = 'info') => {
    setMensaje({ texto, tipo, id: Date.now() + Math.random() });
  }, []);

  const limpiar = useCallback(() => setMensaje(null), []);

  return { mensaje, mostrar, limpiar };
}