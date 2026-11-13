import { EQUIPO_PROYECTO, iniciales } from '../services/equipo.js';

/**
 * EquipoProyecto - Tarjetas informativas de las personas que desarrollaron y
 * asesoraron el sistema. Se muestran en el panel administrativo y en el menu
 * hamburguesa del checador.
 */
export default function EquipoProyecto() {
  return (
    <div className="equipo">
      <p className="equipo-intro">
        Proyecto desarrollado por estudiantes y docentes de{' '}
        <b>Ingeniería en Software</b> de la Universidad Estatal de Sonora.
      </p>

      <div className="equipo-grid">
        {EQUIPO_PROYECTO.map((persona) => (
          <article
            key={persona.nombre}
            className={`equipo-card${persona.destacado ? ' equipo-card-destacado' : ''}${
              persona.asesor ? ' equipo-card-asesor' : ''
            }`}
          >
            <div className="equipo-card-cab">
              <span className="equipo-avatar" aria-hidden="true">
                {iniciales(persona.nombre)}
              </span>
              <div className="equipo-identidad">
                <h3>{persona.nombre}</h3>
                <span className="equipo-rol">{persona.rol}</span>
              </div>
            </div>

            {persona.insignia && (
              <span
                className={`equipo-insignia${persona.asesor ? ' equipo-insignia-asesor' : ''}`}
              >
                {persona.insignia}
              </span>
            )}

            <dl className="equipo-datos">
              <div>
                <dt>Carrera</dt>
                <dd>{persona.carrera}</dd>
              </div>
              {persona.matricula && (
                <div>
                  <dt>Matrícula</dt>
                  <dd>{persona.matricula}</dd>
                </div>
              )}
              {persona.telefono && (
                <div>
                  <dt>Teléfono</dt>
                  <dd>
                    <a href={`tel:+52${persona.telefono}`}>{persona.telefonoLegible}</a>
                  </dd>
                </div>
              )}
              {persona.correo && (
                <div>
                  <dt>Correo</dt>
                  <dd>
                    <a href={`mailto:${persona.correo}`}>{persona.correo}</a>
                  </dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
