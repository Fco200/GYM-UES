/**
 * Gym UES - Modelo Ajuste (configuracion institucional).
 *
 * Antes vivia en la tabla `settings` (setting_key / setting_value). Guarda el
 * reglamento, los horarios y las URLs opcionales de sus PDF. Un documento por
 * clave; `setting_key` es unico.
 */
'use strict';

const mongoose = require('mongoose');

const ajusteSchema = new mongoose.Schema(
  {
    setting_key: {
      type: String,
      required: [true, 'La clave de configuracion es obligatoria.'],
      trim: true,
      maxlength: 100
    },
    setting_value: { type: String, default: '', maxlength: 100000 },
    updated_at: { type: Date, default: Date.now }
  },
  { collection: 'ajustes', versionKey: false }
);

// El GET de configuracion lee la coleccion completa (son pocos documentos).
ajusteSchema.index({ setting_key: 1 }, { unique: true, name: 'uq_ajustes_clave' });

module.exports = mongoose.model('Ajuste', ajusteSchema);
