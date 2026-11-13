import { useState } from 'react';
import { CONTACTO_SOPORTE } from '../services/equipo.js';

/**
 * AyudaSoporte - Centro de ayuda compartido por el panel administrativo y el
 * checador.
 *
 * No requiere backend: arma el reporte con los datos que escribe la persona y
 * lo abre en WhatsApp o en el correo, ya listo para enviar. El telefono de
 * atencion se muestra siempre visible y se puede marcar desde el celular.
 */
export default function AyudaSoporte({ contexto = 'admin' }) {
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [tipo, setTipo] = useState('Problema técnico');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const esChecador = contexto === 'checador';

  const mensaje = [
    'Hola, necesito ayuda con el Gimnasio UES.',
    `Nombre: ${nombre.trim() || 'No indicado'}`,
    `Expediente / clave: ${clave.trim() || 'No indicado'}`,
    `Tipo de ayuda: ${tipo}`,
    `Detalle: ${detalle.trim() || 'Sin detalle'}`
  ].join('\n');

  const waUrl = `https://wa.me/${CONTACTO_SOPORTE.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  const correoUrl =
    `mailto:${CONTACTO_SOPORTE.correo}` +
    `?subject=${encodeURIComponent('Ayuda con el sistema del Gimnasio UES')}` +
    `&body=${encodeURIComponent(mensaje)}`;

  const enviarWhatsApp = (e) => {
    e.preventDefault();
    if (!detalle.trim()) {
      setError('Cuéntanos qué necesitas o qué problema tienes para poder ayudarte.');
      setAviso('');
      return;
    }
    setError('');
    setAviso('Se abrió WhatsApp con tu reporte listo para enviar.');
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="ayuda">
      <div className="ayuda-intro">
        <span className="ayuda-intro-ico" aria-hidden="true">
          {'\uD83E\uDD1D'}
        </span>
        <div>
          <h3>¿Necesitas ayuda?</h3>
          <p>
            {esChecador
              ? 'Si no puedes registrar tu entrada o salida, no apareces en el sistema o necesitas corregir tus datos, escríbenos o llámanos. Con gusto te atendemos.'
              : 'Reporta un problema del sistema, pide apoyo con un registro o consulta cómo corregir datos. Te atendemos directamente.'}
          </p>
        </div>
      </div>

      <div className="ayuda-contacto">
        <div className="ayuda-contacto-datos">
          <span className="ayuda-contacto-etiqueta">Llámanos o escríbenos</span>
          <a className="ayuda-telefono" href={`tel:${CONTACTO_SOPORTE.telefonoLlamada}`}>
            {CONTACTO_SOPORTE.telefonoLegible}
          </a>
          <span className="ayuda-contacto-nota">
            Atención de reportes y problemas &middot; {CONTACTO_SOPORTE.responsable}
          </span>
          <a className="ayuda-correo" href={`mailto:${CONTACTO_SOPORTE.correo}`}>
            {CONTACTO_SOPORTE.correo}
          </a>
        </div>
        <div className="ayuda-contacto-acciones">
          <a className="btn btn-primario" href={`tel:${CONTACTO_SOPORTE.telefonoLlamada}`}>
            Llamar
          </a>
          <a
            className="btn btn-secundario"
            href={`https://wa.me/${CONTACTO_SOPORTE.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
        </div>
      </div>

      <div className="ayuda-reporte">
        <h4 className="ayuda-reporte-titulo">Reportar un problema o pedir ayuda</h4>
        <p className="ayuda-reporte-desc">
          Llena estos datos y elige cómo enviarlos. También puedes escribirnos
          directamente al {CONTACTO_SOPORTE.telefonoLegible}.
        </p>

        <form className="ayuda-form" onSubmit={enviarWhatsApp}>
          <div className="ayuda-grid">
            <div className="ayuda-campo">
              <label htmlFor="ayuda-nombre">Nombre (opcional)</label>
              <input
                id="ayuda-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                maxLength={80}
                autoComplete="name"
              />
            </div>

            <div className="ayuda-campo">
              <label htmlFor="ayuda-clave">Expediente o clave (opcional)</label>
              <input
                id="ayuda-clave"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Ej. 20240001"
                maxLength={50}
              />
            </div>

            <div className="ayuda-campo ayuda-campo-ancho">
              <label htmlFor="ayuda-tipo">¿Qué tipo de ayuda necesitas?</label>
              <select
                id="ayuda-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option>Problema técnico</option>
                <option>No puedo registrar mi entrada o salida</option>
                <option>No aparezco en el sistema</option>
                <option>Necesito actualizar mis datos</option>
                <option>Problema con un registro o historial</option>
                <option>Otro</option>
              </select>
            </div>

            <div className="ayuda-campo ayuda-campo-ancho">
              <label htmlFor="ayuda-detalle">Cuéntanos qué pasa *</label>
              <textarea
                id="ayuda-detalle"
                value={detalle}
                onChange={(e) => {
                  setDetalle(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Describe el problema con el mayor detalle posible."
                rows={4}
                maxLength={1000}
              />
            </div>
          </div>

          {error && (
            <p className="aviso-error" role="alert">{error}</p>
          )}
          {aviso && (
            <p className="ayuda-aviso" role="status">{aviso}</p>
          )}

          <div className="ayuda-acciones">
            <button type="submit" className="btn btn-primario">
              Enviar por WhatsApp
            </button>
            <a className="btn btn-secundario" href={correoUrl}>
              Enviar por correo
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
