// Modal generico reutilizable. `mostrarLogo` anade el logo institucional
// pequeno junto al titulo (usado en las vistas de documentos).
export default function Modal({ titulo, onClose, children, mostrarLogo = false }) {
  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className="modal-caja" onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrado" onClick={onClose} aria-label="Cerrar">
          {'\u2715'}
        </button>
        {titulo && (
          <h2 className={mostrarLogo ? 'modal-titulo-logo' : ''}>
            {mostrarLogo && (
              <img src="img/logo_ues.png" alt="Logo UES" className="modal-logo-mini" />
            )}
            {titulo}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}