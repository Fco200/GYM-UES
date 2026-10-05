/**
 * ModalMensaje - Redactor que abre WhatsApp o el cliente de correo.
 *
 * POR QUE UN MODAL Y NO UN SOLO ENLACE
 * Un enlace `wa.me` necesita el texto ya escrito, y el texto depende de la
 * situacion: si alguien se lesiona dentro del gimnasio no es lo mismo avisar
 * "paso a recogerlo" que "solo se rauno un cambio de turno". Este modal deja
 * escribirlo, le antepone el prefijo institucional (ver Configuracion y
 * Avisos) y luego abre la app con todo puesto. El administrador conserva el
 * control de lo que dice, que es lo unico razonable en un aviso de emergencia.
 *
 * NO ESCRIBE NADA EN LA BASE DE DATOS
 * El gym no usa ningun proveedor de mensajeria, asi que no hay registro de que
 * se mando algo. El modal solo arma el enlace y abre la aplicacion: el
 * administrador ve y envia desde su propio WhatsApp o su propio correo. Por
 * eso el boton dice "Abrir WhatsApp" y no "Enviar": enviar ocurre en la app.
 *
 * @param {object}   props
 * @param {'whatsapp'|'correo'} props.canal    que aplicacion se va a abrir
 * @param {string}   [props.telefono]          destino si el canal es whatsapp
 * @param {string}   [props.correo]            destino si el canal es correo
 * @param {string}   [props.nombre]            a quien se le escribe (visible)
 * @param {string}   [props.parentesco]        "Madre", "Hermano"... si es emergencia
 * @param {string}   [props.prefijo]           texto que se antepone al cuerpo
 * @param {string}   [props.asuntoSugerido]    asunto por defecto del correo
 * @param {Function} props.onClose
 */
import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import { aE164, enlaceCorreo, enlaceWhatsApp, mensajeConPrefijo } from '../services/contacto.js';

const MAX_CUERPO = 1200;

export default function ModalMensaje({
  canal,
  telefono = '',
  correo = '',
  nombre = '',
  parentesco = '',
  prefijo = '',
  asuntoSugerido = '',
  onClose
}) {
  const [cuerpo, setCuerpo] = useState('');
  const [asunto, setAsunto] = useState(asuntoSugerido);
  const { mensaje, mostrar } = useMensaje();

  const esCorreo = canal === 'correo';
  // El prefijo se muestra aparte y solo se antepone al abrir el enlace, para
  // que el administrador vea exactamente lo que se va a mandar y pueda
  // corregirlo sin pelearse con un bloque de texto que no puede editar.
  const final = useMemo(() => mensajeConPrefijo(prefijo, cuerpo), [prefijo, cuerpo]);

  const destino = esCorreo ? correo : telefono;
  const e164 = esCorreo ? null : aE164(telefono);
  const faltaNumero = !esCorreo && !e164;

  const etiquetaDestino = esCorreo
    ? correo || 'sin correo registrado'
    : `${telefono || 'sin teléfono'}${e164 ? ` → ${e164}` : ''}`;

  const abrir = () => {
    const url = esCorreo
      ? enlaceCorreo(correo, asunto, final)
      : enlaceWhatsApp(telefono, final);
    if (!url) {
      mostrar(
        esCorreo
          ? 'El correo registrado no tiene un formato válido.'
          : 'El teléfono registrado no se puede convertir a un número internacional.',
        'error'
      );
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    mostrar(esCorreo ? 'Se abrió tu programa de correo.' : 'Se abrió WhatsApp.', 'exito');
    onClose();
  };

  const limpio = final.trim().length > 0;

  return (
    <Modal
      titulo={esCorreo ? 'Escribir correo' : 'Escribir por WhatsApp'}
      subtitulo={`A: ${etiquetaDestino}`}
      onClose={onClose}
      ancho="normal"
      pie={
        <div className="fila-acciones">
          <button
            className="btn btn-primario"
            onClick={abrir}
            disabled={faltaNumero || !limpio}
            title={
              faltaNumero
                ? 'El teléfono no se puede convertir a formato internacional.'
                : esCorreo
                  ? 'Abrir el programa de correo con el texto listo'
                  : 'Abrir WhatsApp con el texto listo'
            }
          >
            {esCorreo ? '\u2709 Abrir correo' : '\uD83D\uDCAC Abrir WhatsApp'}
          </button>
          <button className="btn btn-secundario" onClick={onClose}>
            Cancelar
          </button>
        </div>
      }
    >
      {nombre && (
        <p className="msj-destinatario">
          <b>{nombre}</b>
          {parentesco ? ` · ${parentesco}` : ''}
        </p>
      )}

      {faltaNumero && (
        <p className="msj-aviso">
          El teléfono capturado no se puede convertir a un número internacional
          (WhatsApp necesita el código de país). Captúralo como
          <b> +52 686 123 4567</b> en la ficha para poder usarlo.
        </p>
      )}

      {esCorreo && (
        <div className="campo">
          <label>Asunto</label>
          <input
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            maxLength={120}
            placeholder="Aviso del gimnasio"
          />
        </div>
      )}

      <div className="campo">
        <label>Mensaje</label>
        <textarea
          rows={6}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value.slice(0, MAX_CUERPO))}
          placeholder={
            esCorreo
              ? 'Escriba aquí el mensaje...'
              : 'Ej. Le informamos que su hijo se lesionó el pie y ya fue atendido en el gimnasio.'
          }
          autoFocus
        />
      </div>

      <div className="msj-preview">
        <span>Así se enviará (prefijo + mensaje):</span>
        <pre>{final || '—'}</pre>
      </div>

      <OverlayMensaje mensaje={mensaje} />
    </Modal>
  );
}