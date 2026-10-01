/**
 * Gym UES - Modelo Alumno.
 *
 * Representa a toda persona registrada en el gimnasio: alumnos, maestros y
 * personas exteriores (campo `type`). Antes vivia en la tabla `students` de
 * MySQL; los nombres de campo se conservan EXACTAMENTE para que el frontend
 * no cambie (student_code, full_name, second_name, ...).
 */
'use strict';

const mongoose = require('mongoose');

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
      enum: ['alumno', 'maestro', 'exterior'],
      default: 'alumno'
    },
    gender: { type: String, default: '', trim: true, maxlength: 20 },
    turn: { type: String, default: '', trim: true, maxlength: 50 },
    career: { type: String, default: '', trim: true, maxlength: 200 },
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

module.exports = mongoose.model('Alumno', alumnoSchema);
