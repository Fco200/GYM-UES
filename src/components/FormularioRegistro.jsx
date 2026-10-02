import { useState } from 'react';
import { uploadArchivo } from '../services/api.js';
import {
  TIPOS_PERSONA,
  AREAS_TRABAJO,
  UNIDADES_ACADEMICAS,
  TURNOS,
  GENEROS,
  configTipo,
  opcionesConVacio
} from '../services/catalogos.js';

// Importante: se usa una funcion para poder "reiniciar" el formulario subiendo
// el contador de revision (limpia tambien los inputs de tipo file).
function VACIO(revision) {
  return {
    type: 'alumno',
    student_code: '',
    full_name: '',
    second_name: '',
    last_name: '',
    gender: '',
    turn: '',
    career: '',
    academic_unit: '',
    work_area: '',
    job_title: '',
    certificado: false,
    archivoCertificado: null,
    fotoArchivo: null,
    fotoPreview: '',
    revision
  };
}

/**
 * Formulario de registro de personas reutilizable (alta desde el panel o alta
 * publica en el kiosco).
 *
 * Los campos visibles dependen del tipo, y las reglas salen del catalogo
 * compartido para que nunca se pisen con el backend:
 *   - alumno:   expediente + unidad academica;
 *   - personal: clave de empleado + unidad + area laboral + puesto;
 *   - exterior: clave GYM-XXXXXX autogenerada (la unidad queda opcional porque
 *               aplica a outsiders).
 */
export default function FormularioRegistro({
  onGuardar,
  botonTexto = 'Guardar registro',
  tituloGratis = null
}) {
  const [form, setForm] = useState(() => VACIO(0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const setVal = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const cfg = configTipo(form.type);
  const esExterior = form.type === 'exterior';

  // Al cambiar de tipo se limpian los campos que ya no aplican, para no mandar
  // un area de "Docente" en el registro de un alumno.
  const cambiarTipo = (id) => {
    setForm((f) => ({
      ...f,
      type: id,
      work_area: id === 'personal' ? f.work_area : '',
      job_title: id === 'personal' ? f.job_title : ''
    }));
    setError('');
  };

  const manejarCertificado = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') {
      setError('El certificado debe ser un archivo PDF.');
      e.target.value = '';
      return;
    }
    setError('');
    setVal('archivoCertificado', file);
  };

  const manejarFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La fotografía debe ser una imagen (JPG/PNG/WebP).');
      e.target.value = '';
      return;
    }
    setError('');
    setForm((f) => ({
      ...f,
      fotoArchivo: file,
      fotoPreview: URL.createObjectURL(file)
    }));
  };

  // Validacion previa: replica las reglas del servidor para avisar de inmediato
  // en vez de subir un archivo y recibir un error 400.
  const validar = () => {
    if (!form.full_name.trim() || !form.second_name.trim() || !form.last_name.trim()) {
      return 'Nombre y apellidos son obligatorios.';
    }
    if (!cfg.claveGenerada && !form.student_code.trim()) {
      return `Ingrese ${cfg.codigoEtiqueta.toLowerCase()}.`;
    }
    if (cfg.requiereUnidad && !form.academic_unit) {
      return 'Seleccione la unidad académica.';
    }
    if (cfg.requiereArea && !form.work_area) {
      return 'Seleccione el área laboral del personal UES.';
    }
    if (cfg.requierePuesto && !form.job_title.trim()) {
      return 'Ingrese el puesto que ocupa en la UES.';
    }
    return '';
  };

  const enviar = async (e) => {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    if (guardando) return;
    setGuardando(true);
    setError('');
    try {
      // Certificado medico validado por el encargado (PDF opcional -> 'Si').
      let certificadoUrl = 'No';
      if (form.certificado && form.archivoCertificado) {
        const subida = await uploadArchivo(form.archivoCertificado);
        certificadoUrl = subida.url;
      } else if (form.certificado) {
        certificadoUrl = 'Si';
      }

      // Fotografia opcional.
      let fotoUrl = '';
      if (form.fotoArchivo) {
        const subidaFoto = await uploadArchivo(form.fotoArchivo);
        fotoUrl = subidaFoto.url;
      }

      const payload = {
        type: form.type,
        full_name: form.full_name.trim(),
        second_name: form.second_name.trim(),
        last_name: form.last_name.trim(),
        gender: form.gender || '',
        turn: form.turn || '',
        career: form.career.trim(),
        medical_certificate: certificadoUrl,
        image_url: fotoUrl
      };
      // La unidad aplica a los tres tipos, pero solo es obligatoria para alumno
      // y personal: un exterior puede registrarse sin campus.
      if (form.academic_unit) payload.academic_unit = form.academic_unit;
      if (cfg.requiereArea || form.work_area) payload.work_area = form.work_area;
      if (cfg.requierePuesto || form.job_title.trim()) payload.job_title = form.job_title.trim();
      if (form.student_code.trim()) payload.student_code = form.student_code.trim();

      await onGuardar(payload);
      setForm(VACIO(form.revision + 1));
    } catch (err) {
      setError(err.message || 'No se pudo guardar el registro.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar}>
      {/* Selector de tipo de persona */}
      <div className="pestanas">
        {TIPOS_PERSONA.map((t) => (
          <button
            key={t.id}
            className={`pestana ${form.type === t.id ? 'activa' : ''}`}
            type="button"
            onClick={() => cambiarTipo(t.id)}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {esExterior && (
        <p className="aviso-info">
          Para personas exteriores la clave GYM-XXXXXX se genera automáticamente.
          {tituloGratis && ` ${tituloGratis}`}
        </p>
      )}

      <div className="panel-seccion">
        <div className="fila-form">
          {cfg.claveGenerada ? (
            <div className="campo">
              <label>{cfg.codigoEtiqueta}</label>
              <input value={cfg.codigoPlaceholder} disabled />
            </div>
          ) : (
            <div className="campo campo-req">
              <label>{cfg.codigoEtiqueta}</label>
              <input
                value={form.student_code}
                onChange={(e) => setVal('student_code', e.target.value)}
                placeholder={cfg.codigoPlaceholder}
              />
            </div>
          )}

          <div className="campo campo-req">
            <label>Nombre</label>
            <input
              value={form.full_name}
              onChange={(e) => setVal('full_name', e.target.value)}
              placeholder="Primer nombre"
            />
          </div>
        </div>

        <div className="fila-form">
          <div className="campo campo-req">
            <label>Apellido paterno</label>
            <input
              value={form.second_name}
              onChange={(e) => setVal('second_name', e.target.value)}
            />
          </div>
          <div className="campo campo-req">
            <label>Apellido materno</label>
            <input
              value={form.last_name}
              onChange={(e) => setVal('last_name', e.target.value)}
            />
          </div>
        </div>

        <div className="fila-form">
          {/* Unidad academica: aplica a alumnos, personal y exteriores. */}
          <div className={`campo ${cfg.requiereUnidad ? 'campo-req' : ''}`}>
            <label>Unidad académica</label>
            <select
              value={form.academic_unit}
              onChange={(e) => setVal('academic_unit', e.target.value)}
            >
              {opcionesConVacio(
                UNIDADES_ACADEMICAS,
                esExterior ? 'Sin unidad / No aplica' : 'Seleccione...'
              ).map((o) => (
                <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Género</label>
            <select value={form.gender} onChange={(e) => setVal('gender', e.target.value)}>
              {opcionesConVacio(GENEROS).map((o) => (
                <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Turno</label>
            <select value={form.turn} onChange={(e) => setVal('turn', e.target.value)}>
              {opcionesConVacio(TURNOS).map((o) => (
                <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fila-form">
          <div className="campo">
            <label>{cfg.campoCarrera}</label>
            <input
              value={form.career}
              onChange={(e) => setVal('career', e.target.value)}
              placeholder={cfg.campoCarreraPlaceholder}
            />
          </div>
        </div>

        {/* Area laboral y puesto: solo tienen sentido para el personal UES, que
            puede venir de areas muy distintas (docencia, administracion,
            servicios, apoyo a la docencia o directivo). */}
        {form.type === 'personal' && (
          <div className="fila-form">
            <div className="campo campo-req">
              <label>Área laboral</label>
              <select
                value={form.work_area}
                onChange={(e) => setVal('work_area', e.target.value)}
              >
                {opcionesConVacio(AREAS_TRABAJO).map((o) => (
                  <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                ))}
              </select>
            </div>
            <div className="campo campo-req">
              <label>Puesto</label>
              <input
                value={form.job_title}
                onChange={(e) => setVal('job_title', e.target.value)}
                placeholder="Ej. Analista administrativo, Auxiliar de mantenimiento..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Certificado medico validado por el encargado */}
      <div className="panel-seccion">
        <label className="campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={form.certificado}
            onChange={(e) => setVal('certificado', e.target.checked)}
          />
          ¿Certificado médico validado por el encargado?
        </label>
        {form.certificado && (
          <div className="campo mt-2" key={`cert-${form.revision}`}>
            <label>Adjuntar certificado médico (PDF)</label>
            <input type="file" accept="application/pdf,.pdf" onChange={manejarCertificado} />
          </div>
        )}
      </div>

      {/* Fotografia opcional */}
      <div className="panel-seccion">
        <label className="campo" style={{ fontWeight: 600 }}>
          Fotografía (opcional)
        </label>
        <div className="fila-form">
          <div className="campo" key={`foto-${form.revision}`}>
            <input type="file" accept="image/*" onChange={manejarFoto} />
          </div>
          {form.fotoPreview && (
            <div className="alumno-foto-preview">
              <img src={form.fotoPreview} alt="Vista previa de la fotografía" />
            </div>
          )}
        </div>
      </div>

      {error && <p className="aviso-error">{error}</p>}

      <button type="submit" className="btn btn-primario" style={{ width: '100%' }} disabled={guardando}>
        {guardando ? 'Guardando...' : botonTexto}
      </button>
    </form>
  );
}