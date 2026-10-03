import { useState, useEffect, useCallback, useMemo } from 'react';
import Modal from './Modal.jsx';
import FichaTecnica from './FichaTecnica.jsx';
import FormularioRegistro from './FormularioRegistro.jsx';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import useAutoRefresh, { INTERVALO_REFRESCO_MS } from '../hooks/useAutoRefresh.js';
import { getStudents, createStudent, urlArchivo } from '../services/api.js';
import { configTipo, texto } from '../services/catalogos.js';
import { hoyISO } from '../services/fechas.js';

const ETIQUETA_CLASE = {
  alumno: 'etiqueta-alumno',
  personal: 'etiqueta-personal',
  exterior: 'etiqueta-exterior'
};

// Cuantas filas se dibujan por pagina. El servidor devuelve todo lo que
// coincide con los filtros, asi que el recorte es solo de renderizado: evita
// colgar el navegador cuando el directorio tiene cientos de registros.
const POR_PAGINA = 25;

// La API devuelve un arreglo, pero si el servidor respondiera con otra cosa
// (un objeto de error sin `mensaje`, por ejemplo) el .slice reventaria y el
// ErrorBoundary reemplazaria toda la pantalla. Se normaliza siempre a arreglo.
const comoLista = (valor) => (Array.isArray(valor) ? valor : []);

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
 * La tabla es deliberadamente sobria: clave, nombre, tipo, unidad, turno y
 * certificado. Todo lo demas vive dentro de la FICHA TECNICA, que se abre con un
 * clic y concentrate datos, contacto, emergencia, documentos y el CRUD completo
 * de la persona y de sus asistencias, todo sin recargar la pagina.
 */
export default function GestionAlumnos() {
  const [personas, setPersonas] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargandoAsist, setCargandoAsist] = useState(false);
  const { mensaje, mostrar } = useMensaje();

  const cargar = useCallback(
    async (filtrosActivos = {}, { silencioso = false } = {}) => {
      if (!silencioso) setCargando(true);
      try {
        setPersonas(comoLista(await getStudents(filtrosActivos)));
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
  // pestana abierta. Se pausa mientras hay un formulario abierto, para no
  // cambiar la lista debajo de lo que el usuario esta escribiendo.
  useAutoRefresh(
    () => cargar(filtrosAplicados, { silencioso: true }),
    INTERVALO_REFRESCO_MS,
    { activo: !agregando }
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
      ['Telefono', 'phone'],
      ['Correo', 'email'],
      ['Emergencia nombre', 'em_name'],
      ['Emergencia parentesco', 'em_relationship'],
      ['Emergencia telefono', 'em_phone'],
      ['Emergencia correo', 'em_email'],
      ['Certificado', 'medical_certificate'],
      ['Fecha de registro', 'created_at']
    ];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const aplanar = (p) => {
      const em = p.emergency_contact || {};
      return { ...p, em_name: em.name, em_relationship: em.relationship, em_phone: em.phone, em_email: em.email };
    };
    const filas = [
      columnas.map((c) => celda(c[0])).join(','),
      ...personas.map((p) => columnas.map((c) => celda(aplana(p)[c[1]])).join(','))
    ];
    // BOM para que Excel respete acentos y la coma decimal.
    const blob = new Blob([`\uFEFF${filas.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directorio-ues-${hoyISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrar('Archivo CSV generado con los registros filtrados.', 'exito');
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

  // Abrir la ficha tecnica. Todo el estado de edicion (datos, archivos y
  // confirmaciones) vive dentro de FichaTecnica.jsx, asi que aqui solo se pasa
  // la persona y se controla el cierre.
  const abrirDetalle = (p) => setDetalle(p);

  // Una foto/certificado se guarda como URL dentro de MongoDB (Atlas), no como
  // archivo en disco. Se reconocen tanto las URLs nuevas (/api/archivos/...) como
  // las antiguas (/uploads/...) para no romper datos previos a la migracion.
  const esArchivo = (valor) => {
    const v = String(valor || '').trim();
    return v.startsWith('/api/archivos/') || v.startsWith('/uploads/') || v.startsWith('http');
  };

  // Indica si la persona cuenta con certificado medico vigente. La ficha tecnica
  // muestra el archivo o el estado, pero la tabla del directorio solo necesita el
  // semaforo verde/rojo.
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
                <th>Clave</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Unidad académica</th>
                <th>Turno</th>
                <th>Cert. médico</th>
                <th>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.student_code}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{p.student_code}</td>
                  <td>
                    <div className="directorio-persona">
                      <FotoPersona persona={p} />
                      <div>
                        <button
                          type="button"
                          className="directorio-nombre"
                          onClick={() => abrirDetalle(p)}
                          title="Ver ficha técnica"
                        >
                          {nombreCompleto(p)}
                        </button>
                        <div className="directorio-sub">
                          {esPersonal(p)
                            ? [texto(p.work_area), texto(p.job_title)].filter(Boolean).join(' · ')
                            : texto(p.career)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`etiqueta-tipo ${ETIQUETA_CLASE[p.type] || 'etiqueta-alumno'}`}>
                      {configTipo(p.type).etiquetaCorta}
                    </span>
                  </td>
                  <td>{texto(p.academic_unit)}</td>
                  <td>{texto(p.turn)}</td>
                  <td>
                    <span className={tieneCertificadoVigente(p) ? 'texto-exito' : 'texto-error'}>
                      {tieneCertificadoVigente(p) ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primario btn-mini"
                      onClick={() => abrirDetalle(p)}
                    >
                      Ficha técnica
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

      {/* Ficha tecnica: toda la informacion y el CRUD en una sola ventana, sin
          recargar la pagina. onActualizado refresca el listado en el acto. */}
      {detalle && (
        <FichaTecnica
          alumno={detalle}
          onClose={() => setDetalle(null)}
          onActualizado={() => cargar(filtrosAplicados, { silencioso: true })}
          onEliminado={(codigo) => {
            setPersonas((lista) => lista.filter((p) => p.student_code !== codigo));
            cargar(filtrosAplicados, { silencioso: true });
          }}
        />
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