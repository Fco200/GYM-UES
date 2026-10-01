import { useEffect, useState } from 'react';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import ModalPDF from './ModalPDF.jsx';
import { getSettings, updateSettings, uploadPdf } from '../services/api.js';

/**
 * ConfiguracionAvisos - Pestaña "Configuracion y Avisos" del panel admin.
 * Reglamento y horarios (texto editable + PDFs institucionales). Esta seccion
 * SOLO se renderiza para super_admin / admin (controlado desde AdminPortal y
 * reforzado en el backend con requireRole en PUT /api/settings).
 */
export default function ConfiguracionAvisos() {
  const [config, setConfig] = useState({});
  const [pdf, setPdf] = useState(null);
  const { mensaje, mostrar } = useMensaje();

  useEffect(() => {
    getSettings()
      .then((s) => setConfig(s && typeof s === 'object' ? s : {}))
      .catch(() => mostrar('No se pudo cargar la configuración.', 'error'));
  }, []);

  const guardarTextos = async () => {
    const ok = window.confirm('¿Guardar los textos de reglamento y horarios?');
    if (!ok) return;
    try {
      await updateSettings({
        reglamento: config.reglamento || '',
        horarios: config.horarios || ''
      });
      mostrar('Textos de reglamento y horarios guardados.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const subirPdf = async (clave, file) => {
    if (!file) return;
    const ok = window.confirm(`¿Subir este archivo como "${clave === 'reglamento_pdf' ? 'Reglamento' : 'Horarios'}"?`);
    if (!ok) return;
    try {
      const res = await uploadPdf(file);
      await updateSettings({ [clave]: res.url });
      setConfig((c) => ({ ...c, [clave]: res.url }));
      mostrar('PDF subido y enlazado correctamente.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const verPdf = (clave) => {
    const url = config[clave];
    if (!url) {
      mostrar(`Aun no hay un PDF de "${clave.replace('_pdf', '')}".`, 'info');
      return;
    }
    setPdf({ url, titulo: clave === 'reglamento_pdf' ? 'Reglamento' : 'Horarios' });
  };

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Configuración y Avisos</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Solo super_admin / admin pueden modificar la información institucional.
          </p>
        </div>
      </div>

      {/* Reglamento y horarios (texto) */}
      <div className="panel">
        <h3>Textos: Reglamento y Horarios</h3>
        <div className="campo">
          <label>Reglamento</label>
          <textarea
            value={config.reglamento || ''}
            onChange={(e) => setConfig((c) => ({ ...c, reglamento: e.target.value }))}
          />
        </div>
        <div className="campo">
          <label>Horarios</label>
          <textarea
            value={config.horarios || ''}
            onChange={(e) => setConfig((c) => ({ ...c, horarios: e.target.value }))}
          />
        </div>
        <button className="btn btn-primario" onClick={guardarTextos}>
          Guardar textos
        </button>
      </div>

      {/* PDFs institucionales */}
      <div className="panel">
        <h3>Documentos PDF (Reglamento y Horarios)</h3>
        <div className="fila-form">
          <div className="campo">
            <label>Reglamento en PDF</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) subirPdf('reglamento_pdf', e.target.files[0]);
              }}
            />
            {config.reglamento_pdf && (
              <button className="btn btn-secundario" onClick={() => verPdf('reglamento_pdf')}>
                Ver PDF actual
              </button>
            )}
          </div>
          <div className="campo">
            <label>Horarios en PDF</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) subirPdf('horarios_pdf', e.target.files[0]);
              }}
            />
            {config.horarios_pdf && (
              <button className="btn btn-secundario" onClick={() => verPdf('horarios_pdf')}>
                Ver PDF actual
              </button>
            )}
          </div>
        </div>
      </div>

      {pdf && <ModalPDF titulo={pdf.titulo} url={pdf.url} onClose={() => setPdf(null)} />}
      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}