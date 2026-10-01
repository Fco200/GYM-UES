/**
 * Gym UES - Modelo Usuario (cuentas de administracion del sistema).
 *
 * Antes vivia en la tabla `users` de MySQL. `scope_values` pasa de ser un
 * JSON serializado a un array real de cadenas, lo que elimina el
 * JSON.parse/JSON.stringify en cada lectura del filtro de alcance.
 */
'use strict';

const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'El nombre de usuario es obligatorio.'],
      trim: true,
      maxlength: 100
    },
    // Contrasena en texto plano o hash bcrypt ($2a$/$2b$): el login acepta
    // ambos formatos, igual que antes, para no romper cuentas existentes.
    password: { type: String, required: true, maxlength: 255 },
    role: { type: String, default: 'admin', trim: true, maxlength: 50 },
    // Carreras asignadas al rol jefe_carrera. Vacio para el resto de roles.
    scope_values: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
  },
  { collection: 'usuarios', versionKey: false }
);

// El login busca por username: indice unico y rapido.
usuarioSchema.index({ username: 1 }, { unique: true, name: 'uq_usuarios_username' });
usuarioSchema.index({ role: 1 }, { name: 'ix_usuarios_rol' });

module.exports = mongoose.model('Usuario', usuarioSchema);
