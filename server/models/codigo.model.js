/**
 * Gym UES - Modelo CodigoRecuperacion (codigos de un solo uso).
 *
 * Cuando un administrador olvida su contrasena, el servidor genera un codigo
 * de 6 digitos y lo guarda aqui hasta que se verifique (o venza). El indice
 * TTL de `expires_at` hace que MongoDB borre los documentos vencidos solo,
 * sin cron ni limpieza manual.
 *
 * Seguridad:
 *   - El codigo se guarda CIFRADO con bcrypt: leer la coleccion no sirve de
 *     nada, igual que con las contrasenas.
 *   - `intentos` limita los intentos de verificacion a 5 por codigo.
 *   - `envios` y `ultimo_envio` limitan el reenvio (cooldown de 60 s).
 *   - Solo se guarda el username, nunca la contrasena nueva.
 */
'use strict';

const mongoose = require('mongoose');

const codigoSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'El usuario es obligatorio.'],
      trim: true,
      maxlength: 100
    },
    // Hash bcrypt del codigo de 6 digitos (nunca el codigo en claro).
    codigo_hash: { type: String, required: true, maxlength: 255 },
    // Intentos de verificacion fallidos permitidos antes de invalidar.
    intentos: { type: Number, default: 0, min: 0, max: 10 },
    // Cuantas veces se ha enviado un codigo para este usuario en la ventana.
    envios: { type: Number, default: 1, min: 0 },
    ultimo_envio: { type: Date, default: Date.now },
    // MongoDB borra el documento solo cuando vence (TTL, ver indice).
    expires_at: { type: Date, required: true }
  },
  { collection: 'codigos_recuperacion', versionKey: false }
);

// Un codigo vigente por usuario (reenviar reemplaza al anterior).
codigoSchema.index({ username: 1 }, { unique: true, name: 'uq_codigos_username' });

// TTL: MongoDB elimina el documento al llegar expires_at. Se crea un indice
// nuevo (y no se toca el unico de username) para no romper cuentas existentes.
codigoSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0, name: 'ix_codigos_expira' }
);

module.exports = mongoose.model('CodigoRecuperacion', codigoSchema);
