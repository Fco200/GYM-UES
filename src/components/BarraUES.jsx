import { NavLink } from 'react-router-dom';

/**
 * Gym UES - Barra superior institucional SIN menu hamburguesa.
 * Muestra la marca GYM UES + enlaces simples (Checador, Registro),
 * enlaces adicionales opcionales y un boton discreto de acceso al
 * portal de administracion (icono de candado).
 */
export default function BarraUES({ extra = [] }) {
  return (
    <header className="barra-ues">
      <div className="barra-ues-marca">
        <img
          src="img/logo_ues.png"
          alt="Logo UES"
          className="barra-ues-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span>GYM UES</span>
        <small>Gimnasio UES · Checador de acceso</small>
      </div>

      <nav className="barra-ues-menu">
        <NavLink to="/checador" className="barra-enlace">
          Checador
        </NavLink>
        <NavLink to="/registro" className="barra-enlace">
          Registro
        </NavLink>
        {/* Enlaces extra para vistas administrativas (ej. Asistencia) */}
        {extra.map((e) => (
          <NavLink key={e.to} to={e.to} className="barra-enlace">
            {e.label}
          </NavLink>
        ))}
        {/* Acceso discreto al panel admin (candado) */}
        <NavLink to="/admin" className="barra-enlace barra-candado" title="Portal Admin">
          {'\uD83D\uDD12'} Admin
        </NavLink>
      </nav>
    </header>
  );
}