/**
 * Gym UES - Modelo Alumno.
 *
 * Representa a toda persona registrada en el gimnasio (campo `type`):
 *   - 'alumno'   : estudiante de la UES.
 *   - 'personal' : trabajador / empleado de la UES de cualquier area. Antes se
 *                  llamaba 'maestro'; se migro a 'personal' porque al gimnasio
 *                  llegan tambien administrative, servicios, apoyo a la
 *                  docencia y directivos. Por eso se capturan `work_area`
 *                  (area laboral) y `job_title` (puesto).
 *   - 'exterior' : visitante / fabricante, con clave GYM-XXXXXX autogenerada.
 *
 * Antes vivia en la tabla `students` de MySQL; los nombres de campo existentes
 * se conservan EXACTAMENTE para que el frontend no cambie (student_code,
 * full_name, second_name, ...). Los campos nuevos son academic_unit, work_area
 * y job_title.
 */
'use strict';

const mongoose = require('mongoose');
const catalogos = require('../catalogos');

const alumnoSchema = new mongoose.Schema(
  {
    student_code: {
      type: String,
      required: [true, 'La clave del alumno es obligatoria.'],
      trim: true,
      maxlength: 50
    },
    full_name: { type: String, default: '', trim: true, maxlength: 200 },
    second_name: { type: String, default: '', trim: true, maxlength: 200 },
    last_name: { type: String, default: '', trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: catalogos.VALID_TYPES,
      default: 'alumno'
    },
    gender: { type: String, default: '', trim: true, maxlength: 20 },
    turn: { type: String, default: '', trim: true, maxlength: 50 },
    // Unidad academica de la UES (Hermosillo, Navojoa, Magdalena, San Luis Rio
    // Colorado, Benito Juarez, Otra / No aplica). Aplica a los tres tipos.
    academic_unit: { type: String, default: '', trim: true, maxlength: 80 },
    // Adscripcion academica: carrera del alumno, departamento del personal o
    // empresa/motivo del visitante. Conserva el nombre historico del campo.
    career: { type: String, default: '', trim: true, maxlength: 200 },
    // Area laboral del personal UES. Solo tiene sentido en type 'personal'.
    work_area: { type: String, default: '', trim: true, maxlength: 60 },
    // Puesto dentro del area. Solo tiene sentido en type 'personal'.
    job_title: { type: String, default: '', trim: true, maxlength: 120 },
    // Telefono de contacto. Se guarda solo el texto para admitir los formatos
    // reales de El Salvador (+503 7xxx-xxxx, 7xxx xxxx, con o sin guiones).
    phone: { type: String, default: '', trim: true, maxlength: 30 },
    // Correo electronico, en minuscula para no duplicar la misma direccion.
    email: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
      lowercase: true
    },
    // Tarjeta de contacto de emergencia: es la que se usa si la persona se
    // lesiona dentro del gimnasio, asi que vive anidada en su propio objeto.
    emergency_contact: {
      name: { type: String, default: '', trim: true, maxlength: 200 },
      relationship: { type: String, default: '', trim: true, maxlength: 60 },
      phone: { type: String, default: '', trim: true, maxlength: 30 },
      email: { type: String, default: '', trim: true, maxlength: 120, lowercase: true }
    },
    image_url: { type: String, default: '', trim: true, maxlength: 500 },
    // 'Si' | 'No' | URL del PDF. Se mantiene como texto (no booleano) porque el
    // portal admin guarda y muestra exactamente estos valores.
    medical_certificate: { type: String, default: 'No', trim: true, maxlength: 255 },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'alumnos', versionKey: false }
);

// Clave natural del sistema (expediente, clave de empleado o GYM-XXXXXX).
// Unico: el checador valida contra este campo en cada marcacion.
alumnoSchema.index({ student_code: 1 }, { unique: true, name: 'uq_alumnos_codigo' });

// Listado del admin: orden por created_at DESC con filtro por turno/carrera.
alumnoSchema.index({ turn: 1, created_at: -1 }, { name: 'ix_alumnos_turno_fecha' });
alumnoSchema.index({ career: 1, created_at: -1 }, { name: 'ix_alumnos_carrera_fecha' });
alumnoSchema.index({ type: 1, created_at: -1 }, { name: 'ix_alumnos_tipo_fecha' });

// Indices de los filtros nuevos del panel administrativo (unidad academica y
// area laboral). El portal los cruza todo el tiempo: listar por unidad es el
// reporte principal y no puede resolverse con un COLLSCAN.
alumnoSchema.index({ academic_unit: 1, created_at: -1 }, { name: 'ix_alumnos_unidad_fecha' });
alumnoSchema.index({ work_area: 1, created_at: -1 }, { name: 'ix_alumnos_area_fecha' });

module.exports = mongoose.model('Alumno', alumnoSchema);
