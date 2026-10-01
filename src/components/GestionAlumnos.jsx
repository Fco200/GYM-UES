import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal.jsx';
import FormularioRegistro from './FormularioRegistro.jsx';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import useAutoRefresh, { INTERVALO_REFRESCO_MS } from '../hooks/useAutoRefresh.js';
import {
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentAttendance,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  uploadArchivo,
  urlArchivo
} from '../services/api.js';

const TIPO_LABEL = {
  alumno: 'Alumno',
  maestro: 'Maestro',
  exterior: 'Exterior'
};

const ETIQUETA_CLASE = {
  alumno: 'etiqueta-alumno',
  maestro: 'etiqueta-maestro',
  exterior: 'etiqueta-exterior'
};

const TIPOS = [
  { id: 'alumno', etiqueta: 'Alumno UES' },
  { id: 'maestro', etiqueta: 'Maestro (Mto)' },
  { id: 'exterior', etiqueta: 'Persona Exterior' }
];

// Mini avatar con iniciales cuando no hay fotografia
function FotoAlumno({ alumno, className = '' }) {
  if (alumno.image_url) {
    return (
      <img
        className={`alumno-foto-thumb ${className}`}
        src={urlArchivo(alumno.image_url)}
        alt={alumno.full_name || 'Foto'}
      />
    );
  }
  const iniciales = `${(alumno.full_name || '')[0] || ''}${(alumno.second_name || '')[0] || ''}`.toUpperCase();
  return <div className={`alumno-foto-thumb alumno-foto-iniciales ${className}`}>{iniciales || '\uD83D\uDC64'}</div>;
}

// Gestion de alumnos/usuarios del panel admin: CRUD completo (listar, crear via
// RegistroAlumno, editar, eliminar) + foto y PDF medico guardados en la base de
// datos gym_ues_db.
export default function GestionAlumnos() {
  const [alumnos, setAlumnos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [pdfArchivo, setPdfArchivo] = useState(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [quitarPdf, setQuitarPdf] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [asistencias, setAsistencias] = useState([]);
  const [cargandoAsist, setCargandoAsist] = useState(false);
  const [editandoAsist, setEditandoAsist] = useState(null);
  const [guardandoAsist, setGuardandoAsist] = useState(false);
  const { mensaje, mostrar } = useMensaje();

  const cargar = useCallback(
    async (termino = '', { silencioso = false } = {}) => {
      if (!silencioso) setCargando(true);
      try {
        const lista = await getStudents(termino);
        setAlumnos(lista || []);
      } catch (err) {
        // Un refresco automatico que falla no debe interrumpir al usuario con
        // un error: solo se avisa cuando la carga fue manual.
        if (!silencioso) mostrar(err.message, 'error');
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Refresco automatico cada 5 minutos: el checador puede registrar alumnos o
  // marcar asistencias desde otro dispositivo mientras el admin tiene esta
  // pestana abierta, y asi la lista se actualiza sin recargar la pagina.
  // Se conserva el termino de busqueda activo y no se interrumpe si hay un
  // formulario abierto o se esta guardando algo.
  useAutoRefresh(
    () => cargar(q, { silencioso: true }),
    INTERVALO_REFRESCO_MS,
    { activo: !guardando && !eliminando && !agregando && !confirmarEliminar && !editandoAsist }
  );

  const buscar = (e) => {
    e.preventDefault();
    cargar(busqueda.trim());
    setQ(busqueda.trim());
  };

  const nombreCompleto = (s) => `${s.full_name || ''} ${s.second_name || ''} ${s.last_name || ''}`.trim();

  // ---- Asistencias y salidas del alumno (CRUD) ----
  const aLocalInput = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) {
      return String(dt).replace('T', ' ').slice(0, 16).replace(' ', 'T');
    }
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const aVista = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return String(dt);
    return d.toLocaleString('es-SV', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const cargarAsistencias = useCallback(async (codigo) => {
    if (!codigo) return;
    setCargandoAsist(true);
    try {
      setAsistencias(await getStudentAttendance(codigo) || []);
    } catch (err) {
      mostrar(err.message, 'error');
      setAsistencias([]);
    } finally {
      setCargandoAsist(false);
    }
  }, []);

  const iniciarEdicionAsistencia = (r) => {
    setEditandoAsist({ id: r.id, check_in: aLocalInput(r.check_in), check_out: aLocalInput(r.check_out) });
  };

  const guardarAsistencia = async () => {
    if (!editandoAsist || guardandoAsist) return;
    const ok = window.confirm('¿Guardar los cambios de horarios de este registro?');
    if (!ok) return;
    setGuardandoAsist(true);
    try {
      await updateAttendanceRecord(editandoAsist.id, {
        check_in: editandoAsist.check_in || null,
        check_out: editandoAsist.check_out || null
      });
      mostrar('Horarios de asistencia actualizados.', 'exito');
      setEditandoAsist(null);
      cargarAsistencias(detalle?.student_code);
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardandoAsist(false);
    }
  };

  const eliminarAsistencia = async (r) => {
    if (!window.confirm(`Eliminar el registro de asistencia del ${aVista(r.check_in || r.created_at)}? Esta accion no se puede deshacer.`)) return;
    try {
      await deleteAttendanceRecord(r.id);
      mostrar('Registro de asistencia eliminado.', 'exito');
      cargarAsistencias(detalle?.student_code);
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const setVal = (campo, valor) => setDetalle((d) => (d ? { ...d, [campo]: valor } : d));

  // Cambia el tipo y ajusta etiquetas del formulario
  const cambiarTipo = (id) => {
    setVal('type', id);
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

  const guardarCambios = async (e) => {
    e.preventDefault();
    if (!detalle) return;
    if (!detalle.full_name.trim() || !detalle.second_name.trim() || !detalle.last_name.trim()) {
      mostrar('Nombre y apellidos son obligatorios.', 'error');
      return;
    }
    if (guardando) return;
    const ok = window.confirm('¿Guardar los cambios del alumno en la base de datos?');
    if (!ok) return;
    setGuardando(true);
    try {
      const payload = {
        full_name: detalle.full_name.trim(),
        second_name: detalle.second_name.trim(),
        last_name: detalle.last_name.trim(),
        type: detalle.type,
        gender: detalle.gender || '',
        turn: detalle.turn || '',
        career: detalle.career || '',
        medical_certificate: detalle.medical_certificate || 'No'
      };

      // Foto de perfil: archivo nuevo, quitar existente o conservar
      if (quitarFoto) payload.image_url = '';
      else if (fotoArchivo) {
        const subida = await uploadArchivo(fotoArchivo);
        payload.image_url = subida.url;
      }

      // Certificado medico (PDF): archivo nuevo, quitar existente o conservar
      if (quitarPdf) payload.medical_certificate = '';
      else if (pdfArchivo) {
        const subida = await uploadArchivo(pdfArchivo);
        payload.medical_certificate = subida.url;
      }

      const res = await updateStudent(detalle.student_code, payload);
      setDetalle(res.estudiante || detalle);
      setFotoArchivo(null);
      setPdfArchivo(null);
      setQuitarFoto(false);
      setQuitarPdf(false);
      await cargar(q);
      mostrar('Cambios guardados correctamente en la base de datos.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarRegistro = async () => {
    if (!detalle || eliminando) return;
    setEliminando(true);
    try {
      await deleteStudent(detalle.student_code);
      setDetalle(null);
      setConfirmarEliminar(false);
      await cargar(q);
      mostrar('Registro eliminado de la base de datos.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setEliminando(false);
    }
  };

  const guardarNuevo = async (payload) => {
    const ok = window.confirm('¿Registrar esta persona en el gimnasio?');
    if (!ok) return;
    const res = await createStudent(payload);
    mostrar(
      res.mensaje + (res.estudiante?.student_code ? ` Clave asignada: ${res.estudiante.student_code}.` : ''),
      'exito'
    );
    setAgregando(false);
    await cargar(q);
  };

  const abrirDetalle = (a) => {
    setDetalle(a);
    setFotoArchivo(null);
    setPdfArchivo(null);
    setQuitarFoto(false);
    setQuitarPdf(false);
    setConfirmarEliminar(false);
    setEditandoAsist(null);
    cargarAsistencias(a.student_code);
  };

  // Una foto/certificado se guarda como URL dentro de MongoDB (Atlas), no como
  // archivo en disco. Se reconocen tanto las URLs nuevas (/api/archivos/...) como
  // las antiguas (/uploads/...) para no romper datos previos a la migracion.
  const esArchivo = (valor) => {
    const v = String(valor || '').trim();
    return v.startsWith('/api/archivos/') || v.startsWith('/uploads/') || v.startsWith('http');
  };

  const certificadoDetalle = (alumno) => {
    const valor = (alumno.medical_certificate || '').trim();
    if (esArchivo(valor)) {
      return (
        <a href={urlArchivo(valor)} target="_blank" rel="noreferrer" className="enlace">
          {'\uD83D\uDCC4'} Ver certificado (PDF)
        </a>
      );
    }
    if (valor === 'Si') return 'Sí (sin PDF adjunto)';
    if (valor === 'No' || valor === '') return 'No registrado';
    return valor;
  };

  // Indica si el alumno cuenta con certificado medico vigente (casilla
  // interactiva del formulario de edicion).
  const tieneCertificadoVigente = (alumno) => {
    const v = String(alumno?.medical_certificate || '').trim();
    return v === 'Si' || v === '1' || esArchivo(v);
  };

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Gestión de Alumnos / Usuarios</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            {alumnos.length} registros · pulse "Editar Seleccionado" para abrir el formulario
            con todos los campos precargados (nombres, apellidos, género, carrera, turno y
            certificado médico), ver el historial completo de entradas y salidas, subir
            foto / PDF o eliminar.
          </p>
        </div>
        <form className="barra-busqueda" onSubmit={buscar}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por clave o nombre..."
          />
          <button type="submit" className="btn btn-primario">Buscar</button>
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => setAgregando(true)}
            title="Dar de alta a un alumno, maestro o persona exterior"
          >
            + Agregar persona
          </button>
        </form>
      </div>

      {cargando ? (
        <p className="texto-centrado">Cargando registros...</p>
      ) : alumnos.length === 0 ? (
        <p className="aviso-info">No hay registros que coincidan con la búsqueda.</p>
      ) : (
        <div className="tabla-wrap">
          <table>
            <thead>
                <tr>
                  <th>Foto</th>
                  <th>Clave</th>
                  <th>Nombre completo</th>
                  <th>Tipo</th>
                  <th>Género</th>
                  <th>Carrera / Dpto.</th>
                  <th>Turno</th>
                  <th>Cert. médico</th>
                  <th />
                </tr>
            </thead>
            <tbody>
              {alumnos.map((a) => (
                <tr key={a.student_code}>
                  <td><FotoAlumno alumno={a} /></td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{a.student_code}</td>
                  <td>{nombreCompleto(a)}</td>
                  <td>
                    <span className={`etiqueta-tipo ${ETIQUETA_CLASE[a.type] || 'etiqueta-alumno'}`}>
                      {TIPO_LABEL[a.type] || a.type}
                    </span>
                  </td>
                  <td>{a.gender || '—'}</td>
                  <td>{a.career || '—'}</td>
                  <td>{a.turn || '—'}</td>
                  <td>
                    <span className={tieneCertificadoVigente(a) ? 'texto-exito' : 'texto-error'}>
                      {tieneCertificadoVigente(a) ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-secundario" onClick={() => abrirDetalle(a)}>
                      Editar Seleccionado
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle / edicion del alumno */}
      {detalle && (
        <Modal titulo={`Editar: ${nombreCompleto(detalle)} (${detalle.student_code})`} onClose={() => setDetalle(null)}>
          <form onSubmit={guardarCambios}>
            <div className="detalle-alumno">
              <div className="detalle-foto">
                {detalle.image_url && !quitarFoto ? (
                  <FotoAlumno alumno={detalle} className="detalle-foto-img" />
                ) : (
                  <div className="alumno-foto-thumb alumno-foto-iniciales detalle-foto-img">{'\uD83D\uDC64'}</div>
                )}
                <span className={`etiqueta-tipo ${ETIQUETA_CLASE[detalle.type] || 'etiqueta-alumno'}`}>
                  {TIPO_LABEL[detalle.type] || detalle.type}
                </span>
              </div>

              <div className="detalle-datos">
                <div className="detalle-fila"><span>Clave</span><b>{detalle.student_code}</b></div>
                <div className="detalle-fila"><span>Nombre completo</span>
                  <b>{nombreCompleto(detalle)}</b>
                </div>
                <div className="detalle-fila"><span>Nombre</span>
                  <input value={detalle.full_name || ''} onChange={(e) => setVal('full_name', e.target.value)} />
                </div>
                <div className="detalle-fila"><span>Apellido paterno</span>
                  <input value={detalle.second_name || ''} onChange={(e) => setVal('second_name', e.target.value)} />
                </div>
                <div className="detalle-fila"><span>Apellido materno</span>
                  <input value={detalle.last_name || ''} onChange={(e) => setVal('last_name', e.target.value)} />
                </div>
                <div className="detalle-fila"><span>Tipo</span>
                  <select value={detalle.type || 'alumno'} onChange={(e) => cambiarTipo(e.target.value)}>
                    {TIPOS.map((t) => (
                      <option key={t.id} value={t.id}>{t.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="detalle-fila"><span>Género</span>
                  <select value={detalle.gender || ''} onChange={(e) => setVal('gender', e.target.value)}>
                    <option value="">Seleccione...</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="detalle-fila"><span>Turno</span>
                  <select value={detalle.turn || ''} onChange={(e) => setVal('turn', e.target.value)}>
                    <option value="">Seleccione...</option>
                    <option value="Matutino">Matutino</option>
                    <option value="Vespertino">Vespertino</option>
                    <option value="Sabatino">Sabatino</option>
                  </select>
                </div>
                <div className="detalle-fila"><span>{detalle.type === 'alumno' ? 'Carrera' : detalle.type === 'maestro' ? 'Departamento' : 'Empresa / Motivo'}</span>
                  <input value={detalle.career || ''} onChange={(e) => setVal('career', e.target.value)} />
                </div>
                <div className="detalle-fila"><span>Certificado médico</span><b>{certificadoDetalle(detalle)}</b></div>
                <div className="detalle-fila"><span>Fecha de registro</span>
                  <b>{detalle.created_at ? new Date(detalle.created_at).toLocaleDateString('es-SV') : '—'}</b>
                </div>
                <div className="detalle-fila"><span>Total de asistencias</span><b>{asistencias.length}</b></div>
                <div className="detalle-fila"><span>Última asistencia</span>
                  <b>{asistencias.length > 0 ? aVista(asistencias[0].check_in || asistencias[0].created_at) : '—'}</b>
                </div>
              </div>
            </div>

            {/* Fotografia */}
            <div className="panel-seccion">
              <label className="campo" style={{ fontWeight: 600 }}>Fotografía</label>
              {detalle.image_url && !quitarFoto && (
                <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--texto-suave)' }}>
                  Actual: <a href={urlArchivo(detalle.image_url)} target="_blank" rel="noreferrer" className="enlace">ver</a>{' '}
                  <button type="button" className="btn btn-error btn-mini" onClick={() => setQuitarFoto(true)}>Quitar</button>
                </p>
              )}
              <input type="file" accept="image/*" onChange={manejarFoto} />
              {fotoArchivo && <p style={{ fontSize: 13, color: 'var(--exito)' }}>Nueva foto lista: {fotoArchivo.name}</p>}
            </div>

            {/* Certificado medico: casilla interactiva que persiste en la BD */}
            <div className="panel-seccion">
              <label className="campo" style={{ fontWeight: 600 }}>Certificado médico</label>
              <label className="certificado-check">
                <input
                  type="checkbox"
                  checked={tieneCertificadoVigente(detalle)}
                  onChange={(e) =>
                    setVal('medical_certificate', e.target.checked ? 'Si' : 'No')
                  }
                />
                ¿Cuenta con certificado médico vigente?
              </label>
              {tieneCertificadoVigente(detalle) && (
                <>
                  {detalle.medical_certificate &&
                    !quitarPdf &&
                    detalle.medical_certificate !== 'No' &&
                    detalle.medical_certificate !== '' && (
                      <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--texto-suave)' }}>
                        {certificadoDetalle(detalle)}{' '}
                        <button
                          type="button"
                          className="btn btn-error btn-mini"
                          onClick={() => setQuitarPdf(true)}
                        >
                          Quitar
                        </button>
                      </p>
                    )}
                  {!quitarPdf && (
                    <>
                      <label className="campo" style={{ fontWeight: 600 }}>
                        Adjuntar certificado (PDF opcional)
                      </label>
                      <input type="file" accept=".pdf" onChange={manejarPdf} />
                      {pdfArchivo && (
                        <p style={{ fontSize: 13, color: 'var(--exito)' }}>
                          Nuevo certificado listo: {pdfArchivo.name}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Asistencias y salidas del alumno (historial completo) */}
            <div className="panel-seccion">
              <label className="campo" style={{ fontWeight: 600 }}>
                Historial completo de entradas y salidas ({asistencias.length} registros)
              </label>
              {cargandoAsist ? (
                <p className="texto-centrado">Cargando asistencias...</p>
              ) : asistencias.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                  Este alumno aún no tiene registros de asistencia.
                </p>
              ) : (
                <div className="tabla-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistencias.map((r, i) =>
                        editandoAsist && editandoAsist.id === r.id ? (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{r.check_in ? new Date(r.check_in).toLocaleDateString('es-SV') : '—'}</td>
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
                            <td>
                              <button
                                type="button"
                                className="btn btn-primario btn-mini"
                                onClick={guardarAsistencia}
                                disabled={guardandoAsist}
                              >
                                {guardandoAsist ? 'Guardando...' : 'Guardar'}
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
                            <td>{i + 1}</td>
                            <td>
                              {(r.check_in || r.created_at)
                                ? new Date(r.check_in || r.created_at).toLocaleDateString('es-SV', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit'
                                  })
                                : '—'}
                            </td>
                            <td>{aVista(r.check_in)}</td>
                            <td>{aVista(r.check_out)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secundario btn-mini"
                                onClick={() => iniciarEdicionAsistencia(r)}
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

            <div className="detalle-botones">
              <button type="submit" className="btn btn-primario" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {!confirmarEliminar ? (
                <button type="button" className="btn btn-error" onClick={() => setConfirmarEliminar(true)}>
                  Eliminar registro
                </button>
              ) : (
                <span className="confirmar-eliminar">
                  ¿Eliminar definitivamente de la base de datos?
                  <button type="button" className="btn btn-error" onClick={eliminarRegistro} disabled={eliminando}>
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button type="button" className="btn btn-secundario" onClick={() => setConfirmarEliminar(false)}>
                    Cancelar
                  </button>
                </span>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* Modal para dar de alta a personas (formulario segun tipo) */}
      {agregando && (
        <Modal
          titulo="Agregar persona (Alumno / Maestro / Exterior)"
          onClose={() => setAgregando(false)}
        >
          <FormularioRegistro
            onGuardar={guardarNuevo}
            botonTexto="Guardar persona"
            tituloGratis="Su clave quedará asociada a este registro."
          />
        </Modal>
      )}

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}