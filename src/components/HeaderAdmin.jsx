import { useEffect, useState } from 'react';
import { etiquetaRol } from '../services/roles.js';
import BotonTema from './BotonTema.jsx';

/**
 * HeaderAdmin - Header institucional fijo del panel de administracion.
 * Logotipo "logo_ues.png", nombre del usuario autenticado en vivo, reloj en
 * tiempo real, boton de tema (claro / oscuro / sistema) y boton "Salir" que
 * regresa de forma limpia al Login (flujo de sesion, no navegacion/historial).
 */
export default function HeaderAdmin({ usuario, onSalir }) {
  const [ahora, setAhora] = useState(new Date());

  // Reloj en vivo: se actualiza cada segundo.
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const fecha = ahora.toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <header className="header-admin">
      {/* Logotipo institucional (public/img/logo_ues.png; ruta relativa para
          que funcione tanto en Vite como en el Electron empaquetado file://) */}
      <div className="header-admin-logo">
        <img src="img/logo_ues.png" alt="Logo UES - Gimnasio" />
      </div>

      {/* Usuario autenticado en vivo */}
      <div className="header-admin-info">
        <span className="header-admin-cargo">Panel de Administración</span>
        <span className="header-admin-usuario">
          Usuario: <b>{usuario?.username || '—'}</b>
          <em className="header-admin-rol">({etiquetaRol(usuario?.role)})</em>
        </span>
      </div>

      {/* Reloj y fecha */}
      <div className="header-admin-reloj">
        <span className="header-admin-hora">{hora}</span>
        <span className="header-admin-fecha">{fecha}</span>
      </div>

      {/* Cambio de tema: claro -> oscuro -> seguir al sistema */}
      <BotonTema />

      {/* Salir -> cierra sesion y regresa limpio al Login */}
      <button type="button" className="btn btn-salir" onClick={onSalir}>
        Salir
      </button>
    </header>
  );
}
