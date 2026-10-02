import { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  TIPOS_PERSONA,
  AREAS_TRABAJO,
  UNIDADES_ACADEMICAS,
  TURNOS,
  GENEROS,
  configTipo,
  etiquetaCarrera,
  opcionesConVacio,
  texto
} from '../services/catalogos.js';

const ETIQUETA_CLASE = {
  alumno: 'etiqueta-alumno',
  personal: 'etiqueta-personal',
  exterior: 'etiqueta-exterior'
};

// Cuantas filas se dibujan por pagina. El servidor devuelve todo lo que
// coincide con los filtros, asi que el recorte es solo de renderizado: evita
// colgar el navegador cuando el directorio tiene cientos de registros.
const POR_PAGINA = 25;

const FILTROS_VACIOS = {
  q: '',
  type: '',
  academic_unit: '',
  work_area: '',
  turn: '',
  career: '',
  certificado: ''
};

/** Mini avatar con iniciales cuando no hay fotografia */
function FotoPersona({ persona, className = '' }) {
  if (persona.image_url) {
    return (
      <img
        className={`alumno-foto-thumb ${className}`}
        src={urlArchivo(persona.image_url)}
        alt={persona.full_name || 'Foto'}
      />
    );
  }
  const iniciales = `${(persona.full_name || '')[0] || ''}${(persona.second_name || '')[0] || ''}`.toUpperCase();
  return <div className={`alumno-foto-thumb alumno-foto-iniciales ${className}`}>{ iniciales || '\uD83D\uDC64'}</div>;
}

/**
 * Directorio institucional del panel administrativo.
 *
 * Reemplaza la antigua "Gestion de Alumnos": lista alumnos, personal UES y
 * personas exteriores en una sola tabla, con filtros combinables resueltos en el
 * servidor (siempre dentro del alcance del rol), edicion completa del registro
 * (incluida unidad academica, area laboral y puesto) e historial de asistencias.
 */
export default function GestionAlumnos() {
  const [personas, setPersonas] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
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
    async (filtrosActivos = {}, { silencioso = false } = {}) => {
      if (!silencioso) setCargando(true);
      try {
        setPersonas((await getStudents(filtrosActivos)) || []);
      } catch (err) {
        // Un refresco automatico que falla no debe interrumpir al usuario con
        // un error: solo se avisa cuando la carga fue manual.
        if (!silencioso) mostrar(err.message, 'error');
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [mostrar]
  );

  useEffect(() => {
    cargar(filtrosAplicados);
  }, [cargar, filtrosAplicados]);

  // Refresco automatico cada 5 minutos: el checador puede registrar personas o
  // marcar asistencias desde otro dispositivo mientras el admin tiene esta
  // pestana abierta. Conserva los filtros activos y no interrumpe si hay un
  // formulario abierto o se esta guardando algo.
  useAutoRefresh(
    () => cargar(filtrosAplicados, { silencioso: true }),
    INTERVALO_REFRESCO_MS,
    { activo: !guardando && !eliminando && !agregando && !confirmarEliminar && !editandoAsist }
  );

  const setFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const hayFiltros = Object.values(filtrosAplicados).some((v) => v !== '');

  const buscar = (e) => {
    e?.preventDefault();
    setPagina(1);
    setFiltrosAplicados({ ...filtros });
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_VACIOS);
    setFiltrosAplicados(FILTROS_VACIOS);
    setPagina(1);
  };

  // Paginacion de renderizado.
  const totalPaginas = Math.max(1, Math.ceil(personas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => personas.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA),
    [personas, paginaSegura]
  );

  const nombreCompleto = (s) => `${s.full_name || ''} ${s.second_name || ''} ${s.last_name || ''}`.trim();

  // Exporta a CSV lo que hay en pantalla (respeta los filtros aplicados) para que
  // el reporte se pueda compartir sin depender del sistema.
  const exportarCsv = () => {
    const columnas = [
      ['Clave', 'student_code'],
      ['Nombre', 'full_name'],
      ['Apellido paterno', 'second_name'],
      ['Apellido materno', 'last_name'],
      ['Tipo', 'type'],
      ['Unidad academica', 'academic_unit'],
      ['Area laboral', 'work_area'],
      ['Puesto', 'job_title'],
      ['Adscripcion / Carrera', 'career'],
      ['Turno', 'turn'],
      ['Genero', 'gender'],
      ['Certificado', 'medical_certificate']
    ];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [
      columnas.map((c) => celda(c[0])).join(','),
      ...personas.map((p) => columnas.map((c) => celda(p[c[1]])).join(','))
    ];
    // BOM para que Excel respete acentos y la coma decimal.
    const blob = new Blob([`\uFEFF${filas.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directorio-ues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrar('Archivo CSV generado con los registros filtrados.', 'exito');
  };

  // ---- Asistencias y salidas de la persona (CRUD) ----
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
      setAsistencias((await getStudentAttendance(codigo)) || []);
    } catch (err) {
      mostrar(err.message, 'error');
      setAsistencias([]);
    } finally {
      setCargandoAsist(false);
    }
  }, [mostrar]);

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

  const eliminarAsistencia = (r) => {
    if (!window.confirm(`Eliminar el registro de asistencia del ${aVista(r.check_in || r.created_at)}? Esta accion no se puede deshacer.`)) return;
    deleteAttendanceRecord(r.id)
      .then(() => {
        mostrar('Registro de asistencia eliminado.', 'exito');
        cargarAsistencias(detalle?.student_code);
      })
      .catch((err) => mostrar(err.message, 'error'));
  };

  const setVal = (campo, valor) => setDetalle((d) => (d ? { ...d, [campo]: valor } : d));

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
    const cfg = configTipo(detalle.type);
    if (!detalle.full_name.trim() || !detalle.second_name.trim() || !detalle.last_name.trim()) {
      mostrar('Nombre y apellidos son obligatorios.', 'error');
      return;
    }
    if (cfg.requiereUnidad && !detalle.academic_unit) {
      mostrar('Seleccione la unidad académica.', 'error');
      return;
    }
    if (cfg.requiereArea && !detalle.work_area) {
      mostrar('Seleccione el área laboral.', 'error');
      return;
    }
    if (cfg.requierePuesto && !detalle.job_title?.trim()) {
      mostrar('Ingrese el puesto que ocupa.', 'error');
      return;
    }
    if (guardando) return;
    const ok = window.confirm('¿Guardar los cambios de esta persona en la base de datos?');
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
        academic_unit: detalle.academic_unit || '',
        // Al cambiar de tipo fuera de "personal" se vacian area y puesto para
        // no dejar datos laborales colgando en un alumno o un exterior.
        work_area: detalle.type === 'personal' ? detalle.work_area || '' : '',
        job_title: detalle.type === 'personal' ? (detalle.job_title || '').trim() : '',
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
      await cargar(filtrosAplicados);
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
      await cargar(filtrosAplicados);
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
    await cargar(filtrosAplicados);
  };

  const abrirDetalle = (p) => {
    setDetalle(p);
    setFotoArchivo(null);
    setPdfArchivo(null);
    setQuitarFoto(false);
    setQuitarPdf(false);
    setConfirmarEliminar(false);
    setEditandoAsist(null);
    cargarAsistencias(p.student_code);
  };

  // Una foto/certificado se guarda como URL dentro de MongoDB (Atlas), no como
  // archivo en disco. Se reconocen tanto las URLs nuevas (/api/archivos/...) como
  // las antiguas (/uploads/...) para no romper datos previos a la migracion.
  const esArchivo = (valor) => {
    const v = String(valor || '').trim();
    return v.startsWith('/api/archivos/') || v.startsWith('/uploads/') || v.startsWith('http');
  };

  const certificadoDetalle = (persona) => {
    const valor = (persona.medical_certificate || '').trim();
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

  // Indica si la persona cuenta con certificado medico vigente (casilla
  // interactiva del formulario de edicion).
  const tieneCertificadoVigente = (persona) => {
    const v = String(persona?.medical_certificate || '').trim();
    return v === 'Si' || v === '1' || esArchivo(v);
  };

  const esPersonal = (p) => p.type === 'personal';

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Directorio de Personas</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Alumnos, personal UES y visitantes en un solo lugar. Filtre por tipo,
            unidad académica, area laboral, puesto, turno o adscripcion; el detalle
            incluye el historial completo de entradas y salidas.
          </p>
        </div>
        <div className="encabezado-acciones">
          <button
            type="button"
            className="btn btn-secundario"
            onClick={exportarCsv}
            disabled={personas.length === 0}
            title="Descargar los registros filtrados en formato CSV"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => setAgregando(true)}
            title="Dar de alta a un alumno, personal UES o persona exterior"
          >
            + Agregar persona
          </button>
        </div>
      </div>

      {/* ---- Filtros del directorio: se resuelven en el servidor ---- */}
      <form className="filtros-directorio" onSubmit={buscar}>
        <div className="filtros-campo filtros-campo-ancho">
          <label>Buscar</label>
          <input
            value={filtros.q}
            onChange={(e) => setFiltro('q', e.target.value)}
            placeholder="Clave, nombre, puesto o área..."
          />
        </div>
        <div className="filtros-campo">
          <label>Tipo</label>
          <select value={filtros.type} onChange={(e) => setFiltro('type', e.target.value)}>
            <option value="">Todos</option>
            {TIPOS_PERSONA.map((t) => (
              <option key={t.id} value={t.id}>{t.etiquetaCorta}</option>
            ))}
          </select>
        </div>
        <div className="filtros-campo">
          <label>Unidad académica</label>
          <select
            value={filtros.academic_unit}
            onChange={(e) => setFiltro('academic_unit', e.target.value)}
          >
            {opcionesConVacio(UNIDADES_ACADEMICAS, 'Todas').map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </div>
        <div className="filtros-campo">
          <label>Área laboral</label>
          <select value={filtros.work_area} onChange={(e) => setFiltro('work_area', e.target.value)}>
            {opcionesConVacio(AREAS_TRABAJO, 'Todas').map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </div>
        <div className="filtros-campo">
          <label>Turno</label>
          <select value={filtros.turn} onChange={(e) => setFiltro('turn', e.target.value)}>
            {opcionesConVacio(TURNOS, 'Todos').map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </div>
        <div className="filtros-campo">
          <label>Carrera / Adscripción</label>
          <input
            value={filtros.career}
            onChange={(e) => setFiltro('career', e.target.value)}
            placeholder="Ej. Licenciatura en Deportes"
          />
        </div>
        <div className="filtros-campo">
          <label>Cert. médico</label>
          <select value={filtros.certificado} onChange={(e) => setFiltro('certificado', e.target.value)}>
            <option value="">Todos</option>
            <option value="Si">Con certificado</option>
            <option value="No">Sin certificado</option>
          </select>
        </div>
        <div className="filtros-acciones">
          <button type="submit" className="btn btn-primario">Aplicar</button>
          <button
            type="button"
            className="btn btn-secundario"
            onClick={limpiarFiltros}
            disabled={!hayFiltros}
          >
            Limpiar
          </button>
        </div>
      </form>

      <p className="directorio-conteo">
        <b>{personas.length}</b> {personas.length === 1 ? 'registro' : 'registros'}
        {hayFiltros ? ' con los filtros aplicados' : ' en total'}
        {personas.length > POR_PAGINA && ` · mostrando ${visibles.length} (página ${paginaSegura} de ${totalPaginas})`}
      </p>

      {cargando ? (
        <p className="texto-centrado">Cargando registros...</p>
      ) : personas.length === 0 ? (
        <p className="aviso-info">No hay registros que coincidan con los filtros indicados.</p>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla-directorio">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Clave</th>
                <th>Nombre completo</th>
                <th>Tipo</th>
                <th>Unidad académica</th>
                <th>Área</th>
                <th>Puesto</th>
                <th>{etiquetaCarrera('alumno')} / Adscripción</th>
                <th>Turno</th>
                <th>Cert. médico</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.student_code}>
                  <td><FotoPersona persona={p} /></td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{p.student_code}</td>
                  <td>
                    {nombreCompleto(p)}
                    {p.gender && <span className="texto-suave"> · {p.gender}</span>}
                  </td>
                  <td>
                    <span className={`etiqueta-tipo ${ETIQUETA_CLASE[p.type] || 'etiqueta-alumno'}`}>
                      {configTipo(p.type).etiquetaCorta}
                    </span>
                  </td>
                  <td>{texto(p.academic_unit)}</td>
                  <td>{esPersonal(p) ? texto(p.work_area) : '—'}</td>
                  <td>{esPersonal(p) ? texto(p.job_title) : '—'}</td>
                  <td>{texto(p.career)}</td>
                  <td>{texto(p.turn)}</td>
                  <td>
                    <span className={tieneCertificadoVigente(p) ? 'texto-exito' : 'texto-error'}>
                      {tieneCertificadoVigente(p) ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secundario btn-mini"
                      onClick={() => abrirDetalle(p)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacion */}
      {totalPaginas > 1 && (
        <div className="paginacion">
          <button
            type="button"
            className="btn btn-secundario btn-mini"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={paginaSegura <= 1}
          >
            Anterior
          </button>
          <span>
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            type="button"
            className="btn btn-secundario btn-mini"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaSegura >= totalPaginas}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Detalle / edicion de la persona */}
      {detalle && (
        <Modal titulo={`${nombreCompleto(detalle)} · ${detalle.student_code}`} onClose={() => setDetalle(null)}>
          <form onSubmit={guardarCambios}>
            <div className="detalle-alumno">
              <div className="detalle-foto">
                {detalle.image_url && !quitarFoto ? (
                  <FotoPersona persona={detalle} className="detalle-foto-img" />
                ) : (
                  <div className="alumno-foto-thumb alumno-foto-iniciales detalle-foto-img">{'\uD83D\uDC64'}</div>
                )}
                <span className={`etiqueta-tipo ${ETIQUETA_CLASE[detalle.type] || 'etiqueta-alumno'}`}>
                  {configTipo(detalle.type).etiquetaCorta}
                </span>
              </div>

              <div className="detalle-datos">
                <div className="detalle-fila"><span>Clave</span><b>{detalle.student_code}</b></div>
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
                  <select value={detalle.type || 'alumno'} onChange={(e) => setVal('type', e.target.value)}>
                    {TIPOS_PERSONA.map((t) => (
                      <option key={t.id} value={t.id}>{t.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="detalle-fila"><span>Unidad académica</span>
                  <select
                    value={detalle.academic_unit || ''}
                    onChange={(e) => setVal('academic_unit', e.target.value)}
                  >
                    {opcionesConVacio(UNIDADES_ACADEMICAS, 'Sin unidad / No aplica').map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </div>
                {/* Area y puesto solo se editan si la persona es personal UES. */}
                {detalle.type === 'personal' && (
                  <>
                    <div className="detalle-fila"><span>Área laboral</span>
                      <select
                        value={detalle.work_area || ''}
                        onChange={(e) => setVal('work_area', e.target.value)}
                      >
                        {opcionesConVacio(AREAS_TRABAJO).map((o) => (
                          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                        ))}
                      </select>
                    </div>
                    <div className="detalle-fila"><span>Puesto</span>
                      <input
                        value={detalle.job_title || ''}
                        onChange={(e) => setVal('job_title', e.target.value)}
                        placeholder="Ej. Analista administrativo"
                      />
                    </div>
                  </>
                )}
                <div className="detalle-fila"><span>{etiquetaCarrera(detalle.type)}</span>
                  <input value={detalle.career || ''} onChange={(e) => setVal('career', e.target.value)} />
                </div>
                <div className="detalle-fila"><span>Género</span>
                  <select value={detalle.gender || ''} onChange={(e) => setVal('gender', e.target.value)}>
                    {opcionesConVacio(GENEROS).map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="detalle-fila"><span>Turno</span>
                  <select value={detalle.turn || ''} onChange={(e) => setVal('turn', e.target.value)}>
                    {opcionesConVacio(TURNOS).map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
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

            {/* Asistencias y salidas (historial completo) */}
            <div className="panel-seccion">
              <label className="campo" style={{ fontWeight: 600 }}>
                Historial completo de entradas y salidas ({asistencias.length} registros)
              </label>
              {cargandoAsist ? (
                <p className="texto-centrado">Cargando asistencias...</p>
              ) : asistencias.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                  Esta persona aún no tiene registros de asistencia.
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
        <Modal titulo="Agregar persona (Alumno / Personal UES / Exterior)" onClose={() => setAgregando(false)}>
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