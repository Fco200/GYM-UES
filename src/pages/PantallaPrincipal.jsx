import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * PantallaPrincipal - Pantalla de inicio del ejecutable (.exe) para el
 * administrador. Muestra "BIENVENIDO ADMINISTRADOR" con reloj en vivo y un
 * boton unico para acceder al Login del administrador; del login se sigue el
 * flujo normal hacia el panel. Incluye un enlace secundario al checador.
 * Pantalla fija (sin scroll).
 */
export default function PantallaPrincipal() {
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fecha = ahora.toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const hora = ahora.toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="launcher">
      <div className="launcher-tarjeta">
        <img
          src="img/logo_ues.png"
          alt="Logo UES - Gimnasio"
          className="launcher-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <h1 className="launcher-titulo">Gimnasio UES</h1>
        <p className="launcher-bienvenida">Bienvenido Administrador</p>
        <p className="launcher-sub">Sistema de Checador de Asistencia</p>

        <div className="launcher-reloj">
          <span className="launcher-fecha">{fecha}</span>
          <span className="launcher-hora">{hora}</span>
        </div>

        <Link to="/admin" className="launcher-boton launcher-admin">
          <span className="launcher-boton-ico">{'\uD83D\uDD12'}</span>
          <span className="launcher-boton-txt">Acceder al Login</span>
          <span className="launcher-boton-sub">Portal de Administración</span>
        </Link>

        <Link to="/checador" className="launcher-enlace">
          Ingresar al Checador de Asistencia
        </Link>
      </div>

      <p className="launcher-pie">Gimnasio UES · Universidad Estatal de Sonora</p>
    </div>
  );
}