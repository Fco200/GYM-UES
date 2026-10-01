import { useState } from 'react';
import { obtenerModo, guardarModo, siguienteModo, modoEsOscuro, ETIQUETAS } from '../services/tema.js';

/**
 * BotonTema - Interruptor de tema claro / oscuro / sistema.
 *
 * Un unico boton que va recorriendo los tres modos: al pulsarlo pasa de Claro
 * a Oscuro, de Oscuro a Sistema, y de Sistema a Claro. El texto muestra SIEMPRE
 * como se vera la pantalla ahora mismo, mientras que el borde punteado indica
 * que el color viene del sistema operativo.
 *
 * No guarda estado propio entre recargas mas alla del localStorage: el estado
 * inicial se lee de ahi y el atributo data-tema del <html> es la fuente de
 * verdad para el CSS.
 */
export default function BotonTema({ className = '' }) {
  const [modo, setModo] = useState(() => obtenerModo());
  const oscuro = modoEsOscuro(modo);
  const etiqueta = ETIQUETAS[modo] || ETIQUETAS.sistema;

  const cambiar = () => setModo(guardarModo(siguienteModo(modo)));

  return (
    <button
      type="button"
      className={`btn-tema ${className}`.trim()}
      onClick={cambiar}
      title={etiqueta.titulo}
      aria-label={etiqueta.titulo}
      data-modo={modo}
    >
      <span className="btn-tema-ico" aria-hidden="true">
        {etiqueta.icono}
      </span>
      <span className="btn-tema-txt">{oscuro ? 'Oscuro' : 'Claro'}</span>
    </button>
  );
}
