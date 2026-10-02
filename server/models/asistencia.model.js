/**
 * Gym UES - Modelo Asistencia (gym).
 *
 * Un documento = una visita al gimnasio. `check_in` y `check_out` son Date
 * reales (bucket por dia) y pueden ser null: una salida sin entrada abierta
 * genera una fila con check_in null, igual que en el esquema MySQL anterior.
 */
'use strict';

const mongoose = require('mongoose');
const catalogos = require('../catalogos');

const asistenciaSchema = new mongoose.Schema(
  {
    student_code: { type: String, required: true, trim: true, maxlength: 50 },
    full_name: { type: String, default: '', trim: true, maxlength: 200 },
    // Copia del tipo de la persona al momento de marcar. Sigue los tipos del
    // catalogo (alumno / personal / exterior); los documentos historicos con
    // 'maestro' se renombran a 'personal' al arrancar el servidor.
    user_type: {
      type: String,
      enum: catalogos.VALID_TYPES,
      default: 'alumno'
    },
    check_in: { type: Date, default: null },
    check_out: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'asistencias', versionKey: false }
);

// Historial de un alumno: se resuelve por student_code ordenando por fecha.
asistenciaSchema.index({ student_code: 1, check_in: -1 }, { name: 'ix_asistencias_alumno_fecha' });

// Reportes del dia y del rango de fechas: filtran por check_in y ordenan desc.
asistenciaSchema.index({ check_in: -1 }, { name: 'ix_asistencias_entrada' });
asistenciaSchema.index({ created_at: -1 }, { name: 'ix_asistencias_creacion' });

// Consultas de "ultima marcacion" del checador (chequeo de entrada abierta).
asistenciaSchema.index({ student_code: 1, created_at: -1 }, { name: 'ix_asistencias_alumno_creacion' });

// NOTA: deliberadamente NO se declara un indice unico de "entrada abierta" por
// alumno. El esquema MySQL permitia varias visitas sin check_out y el flujo del
// checador (espera de 1 minuto) depende de ese comportamiento; imposinglo aqui
// generaria errores de clave duplicada en marcaciones legitimas.

module.exports = mongoose.model('Asistencia', asistenciaSchema);
