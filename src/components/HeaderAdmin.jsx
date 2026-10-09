import { useEffect, useRef, useState } from 'react';
import { etiquetaRol } from '../services/roles.js';
import BotonTema from './BotonTema.jsx';
import AvatarUsuario from './AvatarUsuario.jsx';

/**
 * HeaderAdmin - Header institucional fijo del panel de administracion.
 *
 * Muestra el logotipo, el reloj en vivo, el boton de tema y, al extremo
 * derecho, la identificacion del usuario autenticado (foto + nombre + rol)
 * junto al boton "Salir". Al hacer clic en el usuario se despliega un menu con
 * accesos rapidos a las pantallas permitidas y el cierre de sesion.
 */
export default function HeaderAdmin({ usuario, onSalir, opciones = [] }) {
  const [ahora, setAhora] = useState(new Date());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);

  // Reloj en vivo: se actualiza cada segundo.
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cierra el menu al hacer clic fuera del chip o al pulsar Escape.
  useEffect(() => {
    if (!menuAbierto) return undefined;
    const alClicFuera = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAbierto(false);
    };
    const alTecla = (e) => {
      if (e.key === 'Escape') setMenuAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alTecla);
    };
  }, [menuAbierto]);

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

  const nombre = usuario?.display_name || usuario?.username || 'Usuario';
  const rol = etiquetaRol(usuario?.role);

  const ejecutar = (accion) => {
    setMenuAbierto(false);
    if (typeof accion === 'function') accion();
  };

  return (
    <header className="header-admin">
      {/* Logotipo institucional (public/img/logo_ues.png; ruta relativa para
          que funcione tanto en Vite como en el Electron empaquetado file://) */}
      <div className="header-admin-logo">
        <img src="img/logo_ues.png" alt="Logo UES - Gimnasio" />
      </div>

      <div className="header-admin-info">
        <span className="header-admin-cargo">Panel de Administración</span>
        <span className="header-admin-sub">Gym UES · Checador de acceso</span>
      </div>

      {/* Reloj y fecha */}
      <div className="header-admin-reloj">
        <span className="header-admin-hora">{hora}</span>
        <span className="header-admin-fecha">{fecha}</span>
      </div>

      {/* Cambio de tema: claro -> oscuro -> seguir al sistema */}
      <BotonTema />

      {/* Usuario autenticado: foto + nombre + rol, con menu de opciones */}
      <div className="header-admin-usuario-menu" ref={menuRef}>
        <button
          type="button"
          className={`usuario-chip ${menuAbierto ? 'abierto' : ''}`}
          onClick={() => setMenuAbierto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuAbierto}
          title="Opciones de la cuenta"
        >
          <AvatarUsuario nombre={nombre} foto={usuario?.photo_url} />
          <span className="usuario-chip-datos">
            <span className="usuario-chip-nombre">{nombre}</span>
            <span className="usuario-chip-rol">{rol}</span>
          </span>
          <span className="usuario-chip-flecha" aria-hidden="true">
            {'\u25BE'}
          </span>
        </button>

        {menuAbierto && (
          <div className="usuario-menu" role="menu">
            <div className="usuario-menu-cabecera">
              <AvatarUsuario nombre={nombre} foto={usuario?.photo_url} tamano="grande" />
              <div className="usuario-menu-cabecera-datos">
                <strong>{nombre}</strong>
                <span className="usuario-menu-rol">{rol}</span>
                {usuario?.email ? (
                  <span className="texto-suave usuario-menu-correo">{usuario.email}</span>
                ) : null}
              </div>
            </div>

            {opciones.length > 0 && (
              <div className="usuario-menu-lista">
                {opciones.map((o) => (
                  <button
                    key={o.etiqueta}
                    type="button"
                    role="menuitem"
                    className="usuario-menu-opcion"
                    onClick={() => ejecutar(o.onClick)}
                  >
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            )}

            <div className="usuario-menu-lista">
              <button
                type="button"
                role="menuitem"
                className="usuario-menu-opcion usuario-menu-salir"
                onClick={() => ejecutar(onSalir)}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Salir -> cierra sesion y regresa limpio al Login */}
      <button type="button" className="btn btn-salir" onClick={onSalir}>
        Salir
      </button>
    </header>
  );
}
