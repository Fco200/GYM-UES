/**
 * Modal generico reutilizable.
 *
 * - `mostrarLogo` anade el logo institucional pequeno junto al titulo (usado en
 *   las vistas de documentos).
 * - `ancho` controla el tamano: 'normal' para confirmaciones y 'ancho' para la
 *   ficha tecnica, que necesita mostrar muchas columnas sin que se corte.
 * - `pie` es la barra de acciones del pie, separada del contenido para que los
 *   botones de CRUD queden siempre visibles aunque la ficha sea larga.
 */
export default function Modal({
  titulo,
  subtitulo,
  onClose,
  children,
  pie,
  mostrarLogo = false,
  ancho = 'normal'
}) {
  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className={`modal-caja modal-${ancho}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrado" onClick={onClose} aria-label="Cerrar">
          {'\u2715'}
        </button>
        {(titulo || mostrarLogo) && (
          <div className="modal-cabecera">
            <h2 className={mostrarLogo ? 'modal-titulo-logo' : ''}>
              {mostrarLogo && (
                <img src="img/logo_ues.png" alt="Logo UES" className="modal-logo-mini" />
              )}
              {titulo}
            </h2>
            {subtitulo && <p className="modal-subtitulo">{subtitulo}</p>}
          </div>
        )}
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  );
}