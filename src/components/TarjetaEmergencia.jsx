/**
 * TarjetaEmergencia - Contacto de emergencia de una persona registrada.
 *
 * Es el bloque que mas importa cuando alguien se lesiona dentro del gimnasio,
 * asi que esta disenado para leerse de un vistazo y para avisar con un clic
 * sin salir del portal: marcar (protocolo <a href="tel:">), mandar WhatsApp o
 * mandar correo.
 *
 * Tiene tres modos:
 *  - editable:      inputs para capturar el contacto de la persona.
 *  - lectura:       datos guardados de la persona.
 *  - institucional: datos globales del gimnasio (telefono de emergencias e
 *                   instrucciones), que se muestran cuando todavia no hay
 *                   contacto capturado o como vista previa en Configuracion.
 *
 * Los botones de WhatsApp y correo SOLO aparecen si quien la usa pasa
 * `onMensaje` (lo hace la ficha tecnica, que abre el ModalMensaje para
 * redactar el texto con su prefijo). En la vista previa de Configuracion y en
 * el formulario de alta no se pasan, y la tarjeta se queda en solo lectura de
 * datos: es lo correcto, porque ahi no hay a quien escribirle todavia.
 *
 * @param {object}   props
 * @param {object}   [props.contacto]        { name, relationship, phone, email }
 * @param {object}   [props.institucional]   { telefono, instrucciones, nombre, telefonoInstitucion }
 * @param {boolean}  [props.editable]        true para mostrar inputs (edicion)
 * @param {Function} [props.onChange]        (campo, valor) => void
 * @param {Function} [props.onMensaje]       (canal) => void; habilita WhatsApp/Correo
 */
import { aE164, enlaceLlamada } from '../services/contacto.js';

export default function TarjetaEmergencia({
  contacto = {},
  institucional = null,
  editable = false,
  onChange,
  onMensaje
}) {
  const set = (campo) => (e) => onChange && onChange(campo, e.target.value);

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
            <span>Teléfono de emergencias</span>
            {institucional.telefono ? (
              <a href={enlaceLlamada(institucional.telefono)}>{institucional.telefono}</a>
            ) : (
              <b>911</b>
            )}
          </div>
          {institucional.telefonoInstitucion && (
            <div className="tarjeta-emergencia-dato">
              <span>Teléfono de la unidad</span>
              <a href={enlaceLlamada(institucional.telefonoInstitucion)}>
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
            Aún no hay instrucciones de emergencia registradas.
          </p>
        )}
      </div>
    );
  }

  // Botones de aviso. Se construye una sola vez y se usa igual en modo lectura
  // y en modo edicion, para que el personal no tenga que aprender dos caminos.
  const acciones =
    (contacto.phone || contacto.email) && (
      <div className="tarjeta-emergencia-acciones">
        {contacto.phone && (
          <a className="btn-emergencia" href={enlaceLlamada(contacto.phone)}>
            {'\u260E'} Llamar ahora
          </a>
        )}
        {/* WhatsApp exige el numero en E.164. Si el numero capturado no llega a
            eso (falta el codigo de pais, por ejemplo) el boton se apaga en vez
            de abrir una conversacion equivocada. */}
        {contacto.phone && aE164(contacto.phone) && (
          <button
            type="button"
            className="btn-emergencia btn-emergencia-wa"
            onClick={() => onMensaje && onMensaje('whatsapp')}
          >
            {'\uD83D\uDCAC'} WhatsApp
          </button>
        )}
        {contacto.email &&
          (onMensaje ? (
            <button
              type="button"
              className="btn-emergencia"
              onClick={() => onMensaje('correo')}
            >
              {'\u2709'} Enviar correo
            </button>
          ) : (
            <a className="btn-emergencia" href={`mailto:${contacto.email}`}>
              {'\u2709'} Enviar correo
            </a>
          ))}
      </div>
    );

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
        <>
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
                placeholder="+52 686 123 4567"
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
          {/* En modo edicion tambien se puede avisar de inmediato: en una
              emergencia no es razonable obligar a guardar primero. Se usan los
              valores tal cual aparecen en los inputs, asi que conviene guardar
              antes si se acaba de capturar el numero. */}
          {onMensaje && (contacto.phone || contacto.email) && (
            <>
              {acciones}
              <p className="tarjeta-emergencia-aviso">
                Se usan los datos tal cual están en los campos de arriba.
              </p>
            </>
          )}
        </>
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
                <a href={enlaceLlamada(contacto.phone)}>{contacto.phone}</a>
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
          {acciones}
          {contacto.phone && !aE164(contacto.phone) && (
            <div className="tarjeta-emergencia-nota">
              <span>WhatsApp no disponible</span>
              <p>
                El teléfono capturado no trae código de país, así que no se puede
                abrir una conversación. Capture el número como +52 686 123 4567
                para habilitarlo. La llamada y el correo siguen funcionando.
              </p>
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