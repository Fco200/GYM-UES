import Modal from './Modal.jsx';

// Modal de texto plano (reglamento y horarios del checador). Preserva los
// saltos de linea y permite scroll cuando el contenido es largo.
export default function ModalTexto({ titulo, texto, onClose }) {
  return (
    <Modal titulo={titulo || 'Documento'} onClose={onClose} mostrarLogo>
      <div className="modal-texto">
        {typeof texto === 'string' && texto.trim() ? (
          texto
        ) : (
          <p style={{ color: 'var(--texto-suave)' }}>Sin documento disponible.</p>
        )}
      </div>
    </Modal>
  );
}