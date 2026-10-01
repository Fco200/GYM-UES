import Modal from './Modal.jsx';
import { urlArchivo } from '../services/api.js';

// Visualiza un PDF servido por el backend (/uploads/archivo.pdf)
export default function ModalPDF({ titulo, url, onClose }) {
  const src = urlArchivo(url);
  return (
    <Modal titulo={titulo || 'Documento PDF'} onClose={onClose} mostrarLogo>
      <div className="modal-pdf">
        {src ? (
          <iframe
            src={src}
            title={titulo || 'Documento'}
            loading="lazy"
          />
        ) : (
          <p>Sin documento disponible.</p>
        )}
      </div>
    </Modal>
  );
}