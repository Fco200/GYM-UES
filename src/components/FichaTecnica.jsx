/**
 * FichaTecnica - Ficha completa de una persona registrada.
 *
 * Se abre desde el directorio con el boton "Ficha tecnica". Concentra TODO lo
 * que el administrador necesita de una persona en una sola ventana:
 *
 *   - datos de identificacion y adscripcion institucional (editables en el acto)
 *   - contacto: telefono, correo y la tarjeta de contacto de emergencia
 *   - fotografia y certificado medico (subir o quitar)
 *   - historial de asistencias con edicion de horarios y eliminacion
 *   - descarga de la ficha en PDF
 *   - eliminacion del registro
 *
 * REGLA DE ORO: NADA recarga la pagina. Cada operacion actualiza el estado
 * local y el listado del directorio en el acto, de modo que el panel se siente
 * nativo: se guarda, se ve el cambio, se sigue trabajando.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import Modal from './Modal.jsx';
import ModalMensaje from './ModalMensaje.jsx';
import TarjetaEmergencia from './TarjetaEmergencia.jsx';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import {
  getStudent,
  updateStudent,
  deleteStudent,
  getStudentAttendance,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  uploadArchivo,
  urlArchivo,
  getSettings
} from '../services/api.js';
import {
  TIPOS_PERSONA,
  AREAS_TRABAJO,
  UNIDADES_ACADEMICAS,
  TURNOS,
  GENEROS,
  configTipo,
  etiquetaCarrera,
  opcionesConVacio
} from '../services/catalogos.js';
import {
  fechaCorta,
  fechaHora,
  hora,
  aInputLocal,
  aFecha,
  tiempoTranscurrido
} from '../services/fechas.js';
import { imprimirFicha } from '../services/pdf.js';
import { aE164 } from '../services/contacto.js';

/** Prefijos por defecto si el admin todavia no ha configurado los suyos. */
const PREFIJO_WHATSAPP =
  'Gimnasio Universitario UES: le escribimos desde el gimnasio. Por favor confirme que pudo leer este mensaje.';
const PREFIJO_CORREO = 'Aviso del Gimnasio Universitario UES';

/** Une los tres nombres que guarda la base de datos. */
export function nombreCompleto(p) {
  return [p?.full_name, p?.second_name, p?.last_name].filter(Boolean).join(' ') || 'Sin nombre';
}

/** 'Si' o la URL del PDF; 'No' cuando no hay certificado. */
function certificadoTexto(alumno) {
  const v = alumno?.medical_certificate || 'No';
  if (v === 'No') return 'Sin certificado';
  return /^https?:/i.test(v) ? 'Certificado adjuntado (PDF)' : 'Certificado validado';
}

function tieneCertificado(alumno) {
  const v = alumno?.medical_certificate || 'No';
  return v !== 'No' && v !== '';
}

/** Duracion de una asistencia, ya cerrada o todavia abierta. */
function duracion(asistencia) {
  if (!asistencia.check_in) return '';
  return tiempoTranscurrido(
    asistencia.check_in,
    asistencia.check_out || new Date()
  );
}

/**
 * Resumen agregado del historial: alimenta las tarjetas de la ficha y el PDF.
 * `ultima` es la fecha del registro mas reciente.
 */
function resumenDe(registros) {
  const conEntrada = registros.filter((r) => r.check_in);
  const cerradas = conEntrada.filter((r) => r.check_out);
  const dias = new Set(conEntrada.map((r) => fechaCorta(r.check_in))).size;
  // aFecha interpreta el texto local del servidor en la zona del navegador, de
  // modo que restar dos instantes nunca mezcla husos ni convierte a UTC.
  const mins = cerradas
    .map((r) => (aFecha(r.check_out).getTime() - aFecha(r.check_in).getTime()) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0);
  const promedio = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0;
  return {
    total: conEntrada.length,
    dias,
    ultima: conEntrada.length ? fechaCorta(conEntrada[0].check_in) : '',
    promedio: promedio ? `${promedio} min` : '',
    cerradas: cerradas.length,
    abiertas: conEntrada.length - cerradas.length
  };
}

export default function FichaTecnica({ alumno: inicial, onClose, onActualizado, onEliminado }) {
  const [alumno, setAlumno] = useState(inicial);
  const [asistencias, setAsistencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoAsist, setCargandoAsist] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [editandoAsist, setEditandoAsist] = useState(null);
  const [guardandoAsist, setGuardandoAsist] = useState(false);
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [pdfArchivo, setPdfArchivo] = useState(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [quitarPdf, setQuitarPdf] = useState(false);
  const [pestana, setPestana] = useState('datos');
  // Prefijos de los avisos, configurables en Configuracion y Avisos.
  const [prefijos, setPrefijos] = useState({
    whatsapp: PREFIJO_WHATSAPP,
    correo: PREFIJO_CORREO
  });
  // Destino del ModalMensaje: { canal, telefono, correo, nombre, parentesco }
  const [mensajeA, setMensajeA] = useState(null);
  const { mensaje, mostrar } = useMensaje();

  const cfg = configTipo(alumno?.type || 'alumno');
  const esPersonal = alumno?.type === 'personal';

  const cargarAsistencias = useCallback(
    async (codigo) => {
      if (!codigo) return;
      setCargandoAsist(true);
      try {
        const r = await getStudentAttendance(codigo);
        setAsistencias(Array.isArray(r) ? r : []);
      } catch (err) {
        mostrar(err.message, 'error');
        setAsistencias([]);
      } finally {
        setCargandoAsist(false);
      }
    },
    [mostrar]
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const [fresco] = await Promise.all([
          getStudent(alumno.student_code).catch(() => null),
          cargarAsistencias(alumno.student_code)
        ]);
        if (!vivo) return;
        if (fresco) setAlumno((a) => ({ ...a, ...fresco }));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // Solo al abrir la ficha: despues manda el estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumno.student_code]);

  // Los prefijos de los avisos son ajustes institucionales. GET /api/settings
  // es publico y va cacheado, asi que se puede pedir sinSessions: si falla, se
  // queda con los valores por defecto de arriba y el aviso se sigue pudiendo
  // mandar. Nunca debe impedir abrir la ficha.
  useEffect(() => {
    let vivo = true;
    getSettings()
      .then((s) => {
        if (!vivo || !s || typeof s !== 'object') return;
        setPrefijos((p) => ({
          whatsapp: String(s.whatsapp_prefijo ?? '').trim() || p.whatsapp,
          correo: String(s.correo_prefijo ?? '').trim() || p.correo
        }));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Abre el redactor. `origen` decide a quien se le escribe: la persona
   * registrada o su contacto de emergencia. No se decide comparando objetos
   * porque `emergency_contact` puede venir vacio y entonces la comparacion
   * apuntaria al contacto equivocado.
   */
  const abrirMensaje = useCallback(
    (canal, origen = 'persona') => {
      const eme = alumno?.emergency_contact || {};
      const esEmergencia = origen === 'emergencia';
      setMensajeA({
        canal,
        telefono: esEmergencia ? eme.phone || '' : alumno?.phone || '',
        correo: esEmergencia ? eme.email || '' : alumno?.email || '',
        nombre: esEmergencia ? eme.name || '' : nombreCompleto(alumno),
        parentesco: esEmergencia ? eme.relationship || '' : ''
      });
    },
    [alumno]
  );

  const resumen = useMemo(() => resumenDe(asistencias), [asistencias]);

  const setVal = (campo, valor) =>
    setAlumno((a) => (a ? { ...a, [campo]: valor } : a));

  const setEmergencia = (campo, valor) =>
    setAlumno((a) =>
      a
        ? { ...a, emergency_contact: { ...(a.emergency_contact || {}), [campo]: valor } }
        : a
    );

  // ---------- UPDATE de la persona (sin recargar) ----------
  const guardarCambios = async (e) => {
    e?.preventDefault();
    if (!alumno || guardando) return;
    if (!alumno.full_name.trim() || !alumno.second_name.trim() || !alumno.last_name.trim()) {
      mostrar('Nombre y apellidos son obligatorios.', 'error');
      return;
    }
    if (alumno.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alumno.email.trim())) {
      mostrar('El correo electrónico no tiene un formato válido.', 'error');
      return;
    }
    setGuardando(true);
    try {
      let imagen = alumno.image_url || '';
      if (quitarFoto) imagen = '';
      if (fotoArchivo) imagen = (await uploadArchivo(fotoArchivo)).url;

      let certificado = alumno.medical_certificate || 'No';
      if (quitarPdf) certificado = 'No';
      if (pdfArchivo) certificado = (await uploadArchivo(pdfArchivo)).url;

      await updateStudent(alumno.student_code, {
        full_name: alumno.full_name.trim(),
        second_name: alumno.second_name.trim(),
        last_name: alumno.last_name.trim(),
        type: alumno.type,
        gender: alumno.gender || '',
        turn: alumno.turn || '',
        academic_unit: alumno.academic_unit || '',
        career: alumno.career || '',
        work_area: esPersonal ? alumno.work_area || '' : '',
        job_title: esPersonal ? alumno.job_title || '' : '',
        phone: alumno.phone || '',
        email: alumno.email || '',
        emergency_contact: {
          name: (alumno.emergency_contact?.name || '').trim(),
          relationship: (alumno.emergency_contact?.relationship || '').trim(),
          phone: (alumno.emergency_contact?.phone || '').trim(),
          email: (alumno.emergency_contact?.email || '').trim()
        },
        medical_certificate: certificado,
        image_url: imagen
      });

      // Se refleja el resultado en el estado local: la lista y esta ficha
      // quedan al dia sin volver a pedir nada.
      setAlumno((a) => ({
        ...a,
        image_url: imagen,
        medical_certificate: certificado,
        email: alumno.email.trim().toLowerCase()
      }));
      setFotoArchivo(null);
      setPdfArchivo(null);
      setQuitarFoto(false);
      setQuitarPdf(false);
      mostrar('Ficha actualizada correctamente.', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  // ---------- DELETE de la persona ----------
  const eliminar = async () => {
    if (eliminando) return;
    setEliminando(true);
    try {
      await deleteStudent(alumno.student_code);
      mostrar('Registro eliminado del directorio.', 'exito');
      onEliminado?.(alumno.student_code);
      onClose();
    } catch (err) {
      mostrar(err.message, 'error');
      setEliminando(false);
      setConfirmarEliminar(false);
    }
  };

  // ---------- UPDATE de una asistencia ----------
  const guardarAsistencia = async () => {
    if (!editandoAsist || guardandoAsist) return;
    setGuardandoAsist(true);
    try {
      await updateAttendanceRecord(editandoAsist.id, {
        check_in: editandoAsist.check_in || null,
        check_out: editandoAsist.check_out || null
      });
      setEditandoAsist(null);
      // Se recarga solo el historial y se recalcula el resumen al instante.
      await cargarAsistencias(alumno.student_code);
      mostrar('Horarios actualizados.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardandoAsist(false);
    }
  };

  // ---------- DELETE de una asistencia ----------
  const eliminarAsistencia = async (r) => {
    if (!window.confirm('¿Eliminar este registro de asistencia? Esta acción no se puede deshacer.')) return;
    try {
      await deleteAttendanceRecord(r.id);
      await cargarAsistencias(alumno.student_code);
      mostrar('Registro de asistencia eliminado.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  // ---------- PDF ----------
  const descargarPdf = () => {
    try {
      imprimirFicha({
        alumno,
        asistencias: asistencias.slice(0, 40).map((a) => ({ ...a, duracion: duracion(a) })),
        resumen,
        etiquetaTipo: cfg.etiqueta,
        emisor: 'Gimnasio UES · Control de Asistencia'
      });
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const manejarFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      mostrar('La fotografía debe ser una imagen (JPG/PNG/WebP).', 'error');
      e.target.value = '';
      return;
    }
    setFotoArchivo(file);
    setQuitarFoto(false);
  };

  const manejarPdf = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || '')) {
      mostrar('El certificado debe ser un archivo PDF.', 'error');
      e.target.value = '';
      return;
    }
    setPdfArchivo(file);
    setQuitarPdf(false);
  };

  if (!alumno) return null;

  return (
    <>
      <Modal
      titulo={`Ficha técnica · ${alumno.student_code}`}
      subtitulo={`${nombreCompleto(alumno)} — ${cfg.etiqueta}`}
      onClose={onClose}
      ancho="ancho"
      pie={
        <>
          <button type="button" className="btn btn-primario" onClick={descargarPdf}>
            {'\u2913'} Descargar ficha en PDF
          </button>
          <button
            type="button"
            className="btn btn-secundario"
            onClick={guardarCambios}
            disabled={guardando}
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {!confirmarEliminar ? (
            <button
              type="button"
              className="btn btn-error"
              style={{ marginLeft: 'auto' }}
              onClick={() => setConfirmarEliminar(true)}
            >
              Eliminar registro
            </button>
          ) : (
            <span className="confirmar-eliminar">
              ¿Eliminar definitivamente?
              <button type="button" className="btn btn-error" onClick={eliminar} disabled={eliminando}>
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                className="btn btn-secundario"
                onClick={() => setConfirmarEliminar(false)}
              >
                Cancelar
              </button>
            </span>
          )}
        </>
      }
    >
      {cargando ? (
        <p className="texto-centrado">Cargando ficha completa...</p>
      ) : (
        <>
          {/* ---- Cabecera: foto, clave y estado ---- */}
          <div className="ficha-cabecera">
            <div className="ficha-foto">
              {alumno.image_url && !quitarFoto ? (
                <img src={urlArchivo(alumno.image_url)} alt={nombreCompleto(alumno)} />
              ) : (
                <div className="alumno-foto-thumb alumno-foto-iniciales ficha-foto-img">
                  {(alumno.full_name || '')[0] || '?'}
                </div>
              )}
            </div>
            <div className="ficha-identidad">
              <h3>{nombreCompleto(alumno)}</h3>
              <div className="ficha-identidad-tags">
                <span className="ficha-clave">{alumno.student_code}</span>
                <span className="insignia">{cfg.etiqueta}</span>
                {alumno.turn && <span className="insignia">Turno {alumno.turn}</span>}
                <span className={`insignia ${tieneCertificado(alumno) ? 'insignia-activo' : 'insignia-alerta'}`}>
                  {tieneCertificado(alumno) ? 'Certificado vigente' : 'Certificado pendiente'}
                </span>
                {resumen.abiertas > 0 && (
                  <span className="insignia insignia-activo">Adentro ahora</span>
                )}
              </div>
            </div>
            <div className="ficha-kpis">
              <div className="ficha-kpi">
                <b>{resumen.total}</b>
                <span>Visitas</span>
              </div>
              <div className="ficha-kpi">
                <b>{resumen.dias}</b>
                <span>Días</span>
              </div>
              <div className="ficha-kpi">
                <b>{resumen.ultima || '—'}</b>
                <span>Última</span>
              </div>
            </div>
          </div>

          {/* ---- Pestañas: mantienen la ventana limpia con mucha información ---- */}
          <div className="pestanas ficha-pestanas">
            {[
              { id: 'datos', txt: 'Datos y contacto' },
              { id: 'asistencias', txt: `Asistencias (${asistencias.length})` },
              { id: 'documentos', txt: 'Fotografía y certificado' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pestana ${pestana === p.id ? 'activa' : ''}`}
                onClick={() => setPestana(p.id)}
              >
                {p.txt}
              </button>
            ))}
          </div>

          {/* ============ PESTAÑA: DATOS ============ */}
          {pestana === 'datos' && (
            <div className="ficha-seccion">
              <h4 className="ficha-seccion-titulo">Identificación</h4>
              <div className="ficha-campos">
                <label className="ficha-campo">
                  <span>Nombre</span>
                  <input value={alumno.full_name || ''} onChange={(e) => setVal('full_name', e.target.value)} />
                </label>
                <label className="ficha-campo">
                  <span>Apellido paterno</span>
                  <input value={alumno.second_name || ''} onChange={(e) => setVal('second_name', e.target.value)} />
                </label>
                <label className="ficha-campo">
                  <span>Apellido materno</span>
                  <input value={alumno.last_name || ''} onChange={(e) => setVal('last_name', e.target.value)} />
                </label>
                <label className="ficha-campo">
                  <span>Tipo de persona</span>
                  <select value={alumno.type || 'alumno'} onChange={(e) => setVal('type', e.target.value)}>
                    {TIPOS_PERSONA.map((t) => (
                      <option key={t.id} value={t.id}>{t.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="ficha-campo">
                  <span>Género</span>
                  <select value={alumno.gender || ''} onChange={(e) => setVal('gender', e.target.value)}>
                    {opcionesConVacio(GENEROS).map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="ficha-campo">
                  <span>Unidad académica</span>
                  <select
                    value={alumno.academic_unit || ''}
                    onChange={(e) => setVal('academic_unit', e.target.value)}
                  >
                    {opcionesConVacio(UNIDADES_ACADEMICAS, 'Sin unidad / No aplica').map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="ficha-campo">
                  <span>Turno</span>
                  <select value={alumno.turn || ''} onChange={(e) => setVal('turn', e.target.value)}>
                    {opcionesConVacio(TURNOS).map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="ficha-campo">
                  <span>{etiquetaCarrera(alumno.type)}</span>
                  <input value={alumno.career || ''} onChange={(e) => setVal('career', e.target.value)} />
                </label>
                {esPersonal && (
                  <>
                    <label className="ficha-campo">
                      <span>Área laboral</span>
                      <select
                        value={alumno.work_area || ''}
                        onChange={(e) => setVal('work_area', e.target.value)}
                      >
                        {opcionesConVacio(AREAS_TRABAJO).map((o) => (
                          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ficha-campo">
                      <span>Puesto</span>
                      <input
                        value={alumno.job_title || ''}
                        onChange={(e) => setVal('job_title', e.target.value)}
                        placeholder="Ej. Analista administrativo"
                      />
                    </label>
                  </>
                )}
              </div>

              <h4 className="ficha-seccion-titulo">Contacto</h4>
              <div className="ficha-campos">
                <label className="ficha-campo">
                  <span>Teléfono</span>
                  <input
                    type="tel"
                    value={alumno.phone || ''}
                    onChange={(e) => setVal('phone', e.target.value)}
                    placeholder="+52 686 123 4567"
                  />
                </label>
                <label className="ficha-campo">
                  <span>Correo electrónico</span>
                  <input
                    type="email"
                    value={alumno.email || ''}
                    onChange={(e) => setVal('email', e.target.value)}
                    placeholder="nombre@ues.edu.sv"
                  />
                </label>
              </div>

              {/* Avisos a la persona: se abren desde el navegador, sin cuenta
                  de proveedor. El gym no manda nada por su cuenta; el
                  administrador ve el texto, lo edita y lo envia desde su propio
                  WhatsApp o su propio correo. */}
              <div className="ficha-contacto-acciones">
                {alumno.phone && aE164(alumno.phone) && (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => abrirMensaje('whatsapp', 'persona')}
                  >
                    {'\uD83D\uDCAC'} WhatsApp
                  </button>
                )}
                {alumno.email && (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => abrirMensaje('correo', 'persona')}
                  >
                    {'\u2709'} Correo
                  </button>
                )}
                {!alumno.phone && !alumno.email && (
                  <span className="config-vacio">
                    Sin teléfono ni correo registrados para esta persona.
                  </span>
                )}
                {alumno.phone && !aE164(alumno.phone) && (
                  <span className="config-vacio">
                    WhatsApp necesita el código de país: capture el número como
                    +52 686 123 4567.
                  </span>
                )}
              </div>

              <TarjetaEmergencia
                contacto={alumno.emergency_contact || {}}
                editable
                onChange={setEmergencia}
                onMensaje={(canal) => abrirMensaje(canal, 'emergencia')}
              />

              <div className="ficha-meta">
                <span>
                  <b>Fecha de registro:</b> {fechaCorta(alumno.created_at) || '—'}
                </span>
                <span>
                  <b>Clave:</b> {alumno.student_code}
                </span>
              </div>
            </div>
          )}

          {/* ============ PESTAÑA: ASISTENCIAS ============ */}
          {pestana === 'asistencias' && (
            <div className="ficha-seccion">
              <div className="ficha-resumen">
                <div className="ficha-resumen-item">
                  <b>{resumen.total}</b>
                  <span>Visitas totales</span>
                </div>
                <div className="ficha-resumen-item">
                  <b>{resumen.dias}</b>
                  <span>Días con visita</span>
                </div>
                <div className="ficha-resumen-item">
                  <b>{resumen.cerradas}</b>
                  <span>Registros cerrados</span>
                </div>
                <div className="ficha-resumen-item">
                  <b>{resumen.promedio || '—'}</b>
                  <span>Permanencia media</span>
                </div>
              </div>

              {cargandoAsist ? (
                <p className="texto-centrado">Cargando asistencias...</p>
              ) : asistencias.length === 0 ? (
                <p className="aviso-info">
                  Esta persona aún no tiene registros de asistencia en el gimnasio.
                </p>
              ) : (
                <div className="tabla-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Permanencia</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistencias.map((r) =>
                        editandoAsist?.id === r.id ? (
                          <tr key={r.id}>
                            <td>{fechaCorta(r.check_in || r.created_at)}</td>
                            <td>
                              <input
                                type="datetime-local"
                                value={editandoAsist.check_in}
                                onChange={(e) =>
                                  setEditandoAsist((ed) => ({ ...ed, check_in: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="datetime-local"
                                value={editandoAsist.check_out}
                                onChange={(e) =>
                                  setEditandoAsist((ed) => ({ ...ed, check_out: e.target.value }))
                                }
                              />
                            </td>
                            <td colSpan="2" className="texto-suave">editando horarios</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-primario btn-mini"
                                onClick={guardarAsistencia}
                                disabled={guardandoAsist}
                              >
                                {guardandoAsist ? '...' : 'Guardar'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secundario btn-mini"
                                onClick={() => setEditandoAsist(null)}
                              >
                                Cancelar
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={r.id}>
                            <td>{fechaCorta(r.check_in || r.created_at)}</td>
                            <td>{hora(r.check_in, true) || '—'}</td>
                            <td>{hora(r.check_out, true) || '—'}</td>
                            <td>{duracion(r) || '—'}</td>
                            <td>
                              <span
                                className={`insignia ${
                                  r.check_in && !r.check_out ? 'insignia-activo' : 'insignia-cerrado'
                                }`}
                              >
                                {r.check_in && !r.check_out ? 'Adentro' : 'Cerrado'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secundario btn-mini"
                                onClick={() =>
                                  setEditandoAsist({
                                    id: r.id,
                                    check_in: aInputLocal(r.check_in),
                                    check_out: aInputLocal(r.check_out)
                                  })
                                }
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-error btn-mini"
                                onClick={() => eliminarAsistencia(r)}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ============ PESTAÑA: DOCUMENTOS ============ */}
          {pestana === 'documentos' && (
            <div className="ficha-seccion">
              <div className="panel-seccion">
                <label className="campo" style={{ fontWeight: 600 }}>Fotografía</label>
                {alumno.image_url && !quitarFoto ? (
                  <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--texto-suave)' }}>
                    Actual:{' '}
                    <a href={urlArchivo(alumno.image_url)} target="_blank" rel="noreferrer" className="enlace">
                      ver imagen
                    </a>{' '}
                    <button type="button" className="btn btn-error btn-mini" onClick={() => setQuitarFoto(true)}>
                      Quitar
                    </button>
                  </p>
                ) : (
                  quitarFoto && (
                    <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--texto-error)' }}>
                      Se quitará al guardar.
                    </p>
                  )
                )}
                <input type="file" accept="image/*" onChange={manejarFoto} />
                {fotoArchivo && (
                  <p style={{ fontSize: 13, color: 'var(--exito)' }}>Nueva foto lista: {fotoArchivo.name}</p>
                )}
              </div>

              <div className="panel-seccion">
                <label className="campo" style={{ fontWeight: 600 }}>
                  Certificado médico
                </label>
                <p style={{ margin: '2px 0 10px', fontSize: 13, color: 'var(--texto-suave)' }}>
                  Estado actual: <b>{certificadoTexto(alumno)}</b>
                  {tieneCertificado(alumno) && /^https?:/i.test(alumno.medical_certificate) && (
                    <>
                      {' '}
                      <a
                        href={urlArchivo(alumno.medical_certificate)}
                        target="_blank"
                        rel="noreferrer"
                        className="enlace"
                      >
                        ver PDF
                      </a>
                    </>
                  )}
                </p>
                <label className="certificado-check">
                  <input
                    type="checkbox"
                    checked={tieneCertificado(alumno)}
                    onChange={(e) =>
                      setVal('medical_certificate', e.target.checked ? 'Si' : 'No')
                    }
                  />
                  ¿Cuenta con certificado médico vigente?
                </label>
                {tieneCertificado(alumno) && (
                  <>
                    {quitarPdf ? (
                      <p style={{ fontSize: 13, color: 'var(--texto-error)', margin: '8px 0 0' }}>
                        El certificado se quitará al guardar.
                      </p>
                    ) : (
                      <div className="campo mt-2">
                        <label style={{ fontWeight: 600 }}>Adjuntar certificado (PDF)</label>
                        <input type="file" accept=".pdf,application/pdf" onChange={manejarPdf} />
                      </div>
                    )}
                    {pdfArchivo && (
                      <p style={{ fontSize: 13, color: 'var(--exito)' }}>
                        Nuevo certificado listo: {pdfArchivo.name}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <OverlayMensaje mensaje={mensaje} />
        </>
      )}
    </Modal>

      {/* Redactor de WhatsApp / correo. Va como HERMANO de la ficha, no dentro
          de ella: asi el modal queda en el mismo nivel de apilado y se pinta
          encima sin depender del z-index del modal que lo contiene. */}
      {mensajeA && (
        <ModalMensaje
          canal={mensajeA.canal}
          telefono={mensajeA.telefono}
          correo={mensajeA.correo}
          nombre={mensajeA.nombre}
          parentesco={mensajeA.parentesco}
          prefijo={mensajeA.canal === 'correo' ? prefijos.correo : prefijos.whatsapp}
          asuntoSugerido={prefijos.correo}
          onClose={() => setMensajeA(null)}
        />
      )}
    </>
  );
}