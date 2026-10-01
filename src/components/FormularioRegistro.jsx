import { useState } from 'react';
import { uploadArchivo } from '../services/api.js';

const TIPOS = [
  { id: 'alumno', etiqueta: 'Alumno UES' },
  { id: 'maestro', etiqueta: 'Maestro (Mto)' },
  { id: 'exterior', etiqueta: 'Persona Exterior' }
];

const ETIQUETA_CARRERA = {
  alumno: 'Carrera',
  maestro: 'Departamento / Facultad',
  exterior: 'Empresa / Motivo'
};

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
    certificado: false,
    archivoCertificado: null,
    fotoArchivo: null,
    fotoPreview: '',
    revision
  };
}

/**
 * Formulario de registro de personas reutilizable.
 * - El formulario cambia segun el tipo (alumno / maestro / exterior).
 * - Para exteriores la clave GYM-XXXXXX se genera sola en el backend.
 * - Sube el certificado (PDF) y la foto (imagen) y entrega ya el payload
 *   (image_url, medical_certificate) lista para createStudent / registroPublico.
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

  const esExterior = form.type === 'exterior';

  const cambiarTipo = (id) => {
    setVal('type', id);
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

  const enviar = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.second_name.trim() || !form.last_name.trim()) {
      setError('Nombre y apellidos son obligatorios.');
      return;
    }
    if (!esExterior && !form.student_code.trim()) {
      setError(form.type === 'alumno' ? 'Ingrese el expediente del alumno.' : 'Ingrese la clave de empleado del maestro.');
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
        career: form.career || '',
        medical_certificate: certificadoUrl,
        image_url: fotoUrl
      };
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
        {TIPOS.map((t) => (
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
          {esExterior ? (
            <div className="campo">
              <label>Clave asignada</label>
              <input value="Se genera automáticamente (GYM-XXXXXX)" disabled />
            </div>
          ) : (
            <div className="campo campo-req">
              <label>{form.type === 'alumno' ? 'Expediente / Matrícula' : 'Clave de empleado'}</label>
              <input
                value={form.student_code}
                onChange={(e) => setVal('student_code', e.target.value)}
                placeholder={form.type === 'alumno' ? 'Ej. AL2024001' : 'Ej. MTO001'}
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
          <div className="campo">
            <label>{ETIQUETA_CARRERA[form.type]}</label>
            <input
              value={form.career}
              onChange={(e) => setVal('career', e.target.value)}
              placeholder={form.type === 'alumno' ? 'Ej. Licenciatura en Deportes' : 'Ej. Facultad de Ingeniería'}
            />
          </div>
          <div className="campo">
            <label>Género</label>
            <select value={form.gender} onChange={(e) => setVal('gender', e.target.value)}>
              <option value="">Seleccione...</option>
              <option value="Femenino">Femenino</option>
              <option value="Masculino">Masculino</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div className="campo">
            <label>Turno</label>
            <select value={form.turn} onChange={(e) => setVal('turn', e.target.value)}>
              <option value="">Seleccione...</option>
              <option value="Matutino">Matutino</option>
              <option value="Vespertino">Vespertino</option>
              <option value="Sabatino">Sabatino</option>
            </select>
          </div>
        </div>
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