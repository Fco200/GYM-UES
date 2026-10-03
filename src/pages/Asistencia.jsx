import { useState, useEffect, useCallback } from 'react';
import BarraUES from '../components/BarraUES.jsx';
import OverlayMensaje, { useMensaje } from '../components/OverlayMensaje.jsx';
import Modal from '../components/Modal.jsx';
import useAutoRefresh, { INTERVALO_REFRESCO_MS } from '../hooks/useAutoRefresh.js';
import { getAttendanceToday, getAttendanceCount, getAttendanceRange, updateAttendanceRecord, deleteAttendanceRecord } from '../services/api.js';
import { configTipo } from '../services/catalogos.js';
import {
  hoyISO,
  aFecha,
  aInputLocal,
  aTextoLocal,
  fechaHora,
  fechaLarga,
  hora,
  tiempoTranscurrido
} from '../services/fechas.js';

// El tipo viene del catalogo compartido, asi que una asistencia guardada con el
// antiguo 'maestro' (aun posible en registros previos a la migracion) se muestra
// con la etiqueta vigente sin cambiar el dato almacenado.
const CLASE_POR_TIPO = {
  alumno: 'etiqueta-alumno',
  personal: 'etiqueta-personal',
  exterior: 'etiqueta-exterior'
};

function EtiquetaTipo({ tipo }) {
  const clave = tipo === 'maestro' ? 'personal' : tipo;
  return (
    <span className={`etiqueta-tipo ${CLASE_POR_TIPO[clave] || 'etiqueta-alumno'}`}>
      {configTipo(clave).etiquetaCorta}
    </span>
  );
}

// Panel de asistencia: registros del dia / por rango + busqueda + conteos.
// La prop `embedded` permite incrustarlo como pestaña dentro del portal admin
// (oculta la BarraUES y ajusta los encabezados).
export default function Asistencia({ embedded = false }) {
  const [registros, setRegistros] = useState([]);
  const [conteo, setConteo] = useState({ total: 0, entradas: 0, salidas: 0 });
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const { mensaje, mostrar } = useMensaje();

  const cargar = useCallback(
    async (d = desde, h = hasta, { silencioso = false } = {}) => {
      try {
        const rows = await getAttendanceRange(d, h);
        setRegistros(Array.isArray(rows) ? rows : []);
        const c = await getAttendanceCount();
        // Misma forma del objeto que el estado inicial: si faltara un campo el
        // conteo se leeria como undefined y caeria la pantalla.
        setConteo({
          total: c?.total || 0,
          entradas: c?.entradas || 0,
          salidas: c?.salidas || 0
        });
      } catch (err) {
        // Un fallo en el refresco automatico no debe molestar al usuario.
        if (!silencioso) mostrar(err.message, 'error');
        if (!silencioso) setRegistros([]);
      }
    },
    [desde, hasta]
  );

  useEffect(() => {
    cargar();
  }, []);

  // Refresco automatico cada 5 minutos: mientras el administrador consulta el
  // historial, el checador sigue marcando entradas y salidas en el kiosco.
  // Conserva el rango de fechas que el usuario eligio y se salta si hay una
  // edicion en curso para no perder lo que se esta escribiendo.
  useAutoRefresh(
    () => cargar(desde, hasta, { silencioso: true }),
    INTERVALO_REFRESCO_MS,
    { activo: !guardando && !editando }
  );

  const aplicaFecha = () => cargar(desde, hasta);

  const filtrados = registros.filter(
    (r) =>
      (r.student_code || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.full_name || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const abrirDetalle = (r) => setDetalle(r);

  // Permanencia del registro abierto: si no hay salida, el contador sigue
  // corriendo desde la entrada porque la persona sigue dentro del gimnasio.
  const duracion = !detalle
    ? ''
    : detalle.check_out
      ? tiempoTranscurrido(detalle.check_in, detalle.check_out)
      : tiempoTranscurrido(detalle.check_in, new Date());
  const adentroAhora = Boolean(detalle && detalle.check_in && !detalle.check_out);

  const iniciarEdicion = (r) =>
    setEditando({
      id: r.id,
      check_in: aInputLocal(r.check_in),
      check_out: aInputLocal(r.check_out)
    });

  const guardarEdicion = async () => {
    if (!editando || guardando) return;
    const ok = window.confirm('¿Guardar los cambios de horarios de este registro?');
    if (!ok) return;
    setGuardando(true);
    try {
      await updateAttendanceRecord(editando.id, {
        check_in: editando.check_in || null,
        check_out: editando.check_out || null
      });
      mostrar('Registro de asistencia actualizado.', 'exito');
      setDetalle(null);
      setEditando(null);
      cargar();
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarRegistro = async (r) => {
    if (!window.confirm(`¿Eliminar el registro de ${r.student_code}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteAttendanceRecord(r.id);
      mostrar('Registro de asistencia eliminado.', 'exito');
      setDetalle(null);
      setEditando(null);
      cargar();
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  return (
    <div className="panel">
      {!embedded && <BarraUES />}
      <div className="encabezado-pagina">
        <h1>{embedded ? 'Historial de Asistencias' : 'Asistencia'}</h1>
      </div>

      {/* Contadores del dia */}
      <div className="contadores">
        <div className="contador-caja">
          <div className="numero">{conteo.total}</div>
          <div className="etiqueta">Total registros</div>
        </div>
        <div className="contador-caja">
          <div className="numero">{conteo.entradas}</div>
          <div className="etiqueta">Entradas</div>
        </div>
        <div className="contador-caja">
          <div className="numero">{conteo.salidas}</div>
          <div className="etiqueta">Salidas</div>
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="barra-busqueda">
        <label htmlFor="desde">Desde</label>
        <input type="date" id="desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <label htmlFor="hasta">Hasta</label>
        <input type="date" id="hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="btn btn-primario" onClick={aplicaFecha}>
          Consultar
        </button>
      </div>

      {/* Busqueda */}
      <div className="barra-busqueda">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por clave o nombre..."
        />
      </div>

      {/* Tabla */}
      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--texto-suave)' }}>
                  Sin registros para el periodo seleccionado.
                </td>
              </tr>
            )}
            {filtrados.map((r) => (
              <tr key={r.id}>
                <td>{r.student_code}</td>
                <td>{r.full_name || '—'}</td>
                <td>
                  <EtiquetaTipo tipo={r.user_type} />
                </td>
                <td>{r.check_in || '—'}</td>
                <td>{r.check_out || '—'}</td>
                <td>
                  <button className="btn btn-secundario" onClick={() => abrirDetalle(r)}>
                    Detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <Modal titulo="Detalle de registro" onClose={() => setDetalle(null)} ancho="ancho">
          <div className="ficha-detalle">
            <div className="ficha-detalle-cabecera">
              <div>
                <strong>{detalle.full_name || 'Sin nombre'}</strong>
                <div className="ficha-detalle-sub">
                  <EtiquetaTipo tipo={detalle.user_type} />
                  <code>{detalle.student_code}</code>
                </div>
              </div>
              <span className={`insignia ${adentroAhora ? 'insignia-activo' : 'insignia-cerrado'}`}>
                {adentroAhora ? 'Dentro del gimnasio' : 'Registro cerrado'}
              </span>
            </div>

            <div className="ficha-datos">
              <div className="ficha-dato">
                <span>Fecha</span>
                <b>{fechaLarga(detalle.check_in || detalle.created_at)}</b>
              </div>
              <div className="ficha-dato">
                <span>Entrada</span>
                <b>{hora(detalle.check_in, true) || '—'}</b>
              </div>
              <div className="ficha-dato">
                <span>Salida</span>
                <b>{hora(detalle.check_out, true) || 'Sin registrar'}</b>
              </div>
              <div className="ficha-dato">
                <span>Permanencia</span>
                <b>{duracion || '—'}</b>
              </div>
              <div className="ficha-dato">
                <span>Registrado en</span>
                <b>{fechaHora(detalle.created_at)}</b>
              </div>
              <div className="ficha-dato">
                <span>Tipo de persona</span>
                <b>{configTipo(detalle.user_type === 'maestro' ? 'personal' : detalle.user_type).etiqueta}</b>
              </div>
            </div>

            <div className="ficha-form">
              <div className="campo">
                <label>Entrada</label>
                {editando && editando.id === detalle.id ? (
                  <input
                    type="datetime-local"
                    value={editando.check_in}
                    onChange={(e) =>
                      setEditando((ed) => ({ ...ed, check_in: e.target.value }))
                    }
                  />
                ) : (
                  <p>{detalle.check_in ? aTextoLocal(detalle.check_in) : '—'}</p>
                )}
              </div>
              <div className="campo">
                <label>Salida</label>
                {editando && editando.id === detalle.id ? (
                  <input
                    type="datetime-local"
                    value={editando.check_out}
                    onChange={(e) =>
                      setEditando((ed) => ({ ...ed, check_out: e.target.value }))
                    }
                  />
                ) : (
                  <p>{detalle.check_out ? aTextoLocal(detalle.check_out) : '—'}</p>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {editando && editando.id === detalle.id ? (
              <>
                <button type="button" className="btn btn-primario" onClick={guardarEdicion} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn btn-secundario" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secundario" onClick={() => iniciarEdicion(detalle)}>
                Editar horarios
              </button>
            )}
            <button type="button" className="btn btn-error" onClick={() => eliminarRegistro(detalle)}>
              Eliminar registro
            </button>
          </div>
        </Modal>
      )}

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}