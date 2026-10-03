/**
 * TarjetaEmergencia - Contacto de emergencia de una persona registrada.
 *
 * Es el bloque que mas importa cuando alguien se lesiona dentro del gimnasio,
 * asi que esta disenado para leerse de un vistazo y para marcar el numero con
 * un clic (protocolo <a href="tel:">), sin salir del portal.
 *
 * Tiene tres modos:
 *  - editable:      inputs para capturar el contacto de la persona.
 *  - lectura:       datos guardados de la persona.
 *  - institucional: datos globales del gimnasio (telefono de emergencias e
 *                   instrucciones), que se muestran cuando todavia no hay
 *                   contacto capturado o como vista previa en Configuracion.
 *
 * @param {object}   props
 * @param {object}   [props.contacto]        { name, relationship, phone, email }
 * @param {object}   [props.institucional]   { telefono, instrucciones, nombre, telefonoInstitucion }
 * @param {boolean}  [props.editable]        true para mostrar inputs (edicion)
 * @param {Function} [props.onChange]        (campo, valor) => void
 */
export default function TarjetaEmergencia({
  contacto = {},
  institucional = null,
  editable = false,
  onChange
}) {
  const set = (campo) => (e) => onChange && onChange(campo, e.target.value);
  const soloDigitos = (tel) => String(tel || '').replace(/[^\d+]/g, '');

  const datos = editable || (contacto.name || contacto.phone || contacto.email) ? contacto : null;
  const esInstitucional = !editable && !datos && Boolean(institucional?.telefono || institucional?.instrucciones);

  if (esInstitucional) {
    return (
      <div className="tarjeta-emergencia">
        <div className="tarjeta-emergencia-cabecera">
          <span className="tarjeta-emergencia-ico" aria-hidden="true">
            {'+'}
          </span>
          <h3>Protocolo de emergencia del gimnasio</h3>
        </div>
        <div className="tarjeta-emergencia-datos">
          <div className="tarjeta-emergencia-dato">
            <span>Avisar primero a</span>
            <b>{institucional.nombre || 'Gimnasio UES'}</b>
          </div>
          <div className="tarjeta-emergencia-dato">
            <span>Telefono de emergencias</span>
            {institucional.telefono ? (
              <a href={`tel:${soloDigitos(institucional.telefono)}`}>{institucional.telefono}</a>
            ) : (
              <b>911</b>
            )}
          </div>
          {institucional.telefonoInstitucion && (
            <div className="tarjeta-emergencia-dato">
              <span>Telefono de la unidad</span>
              <a href={`tel:${soloDigitos(institucional.telefonoInstitucion)}`}>
                {institucional.telefonoInstitucion}
              </a>
            </div>
          )}
        </div>
        {institucional.instrucciones ? (
          <div className="tarjeta-emergencia-nota">
            <span>Instrucciones</span>
            <p>{institucional.instrucciones}</p>
          </div>
        ) : (
          <p className="tarjeta-emergencia-vacia">
            Aun no hay instrucciones de emergencia registradas.
          </p>
        )}
      </div>
    );
  }

  const hayAlgo = Boolean(contacto.name || contacto.phone || contacto.email);

  return (
    <div className="tarjeta-emergencia">
      <div className="tarjeta-emergencia-cabecera">
        <span className="tarjeta-emergencia-ico" aria-hidden="true">
          {'+'}
        </span>
        <h3>Contacto de emergencia</h3>
      </div>

      {editable ? (
        <div className="fila-form">
          <div className="campo">
            <label>Nombre completo</label>
            <input
              type="text"
              value={contacto.name || ''}
              onChange={set('name')}
              placeholder="Nombre de quien avisa"
              maxLength={200}
            />
          </div>
          <div className="campo">
            <label>Parentesco / relación</label>
            <input
              type="text"
              value={contacto.relationship || ''}
              onChange={set('relationship')}
              placeholder="Madre, padre, hermano"
              maxLength={60}
            />
          </div>
          <div className="campo">
            <label>Teléfono</label>
            <input
              type="tel"
              value={contacto.phone || ''}
              onChange={set('phone')}
              placeholder="+503 7845-1234"
              maxLength={30}
            />
          </div>
          <div className="campo">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={contacto.email || ''}
              onChange={set('email')}
              placeholder="contacto@correo.com"
              maxLength={120}
            />
          </div>
        </div>
      ) : hayAlgo ? (
        <>
          <div className="tarjeta-emergencia-datos">
            <div className="tarjeta-emergencia-dato">
              <span>Nombre</span>
              <b>{contacto.name || '—'}</b>
            </div>
            <div className="tarjeta-emergencia-dato">
              <span>Parentesco</span>
              <b>{contacto.relationship || '—'}</b>
            </div>
            <div className="tarjeta-emergencia-dato">
              <span>Teléfono</span>
              {contacto.phone ? (
                <a href={`tel:${soloDigitos(contacto.phone)}`}>{contacto.phone}</a>
              ) : (
                <b>—</b>
              )}
            </div>
            <div className="tarjeta-emergencia-dato">
              <span>Correo</span>
              {contacto.email ? (
                <a href={`mailto:${contacto.email}`}>{contacto.email}</a>
              ) : (
                <b>—</b>
              )}
            </div>
          </div>
          {(contacto.phone || contacto.email) && (
            <div className="tarjeta-emergencia-acciones">
              {contacto.phone && (
                <a className="btn-emergencia" href={`tel:${soloDigitos(contacto.phone)}`}>
                  {'\u260E'} Llamar ahora
                </a>
              )}
              {contacto.email && (
                <a className="btn-emergencia" href={`mailto:${contacto.email}`}>
                  {'\u2709'} Enviar correo
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="tarjeta-emergencia-vacia">
          Sin contacto de emergencia registrado. Se recomienda capturarlo para
          poder avisar a la familia si la persona se lesiona dentro del
          gimnasio.
        </p>
      )}
    </div>
  );
}