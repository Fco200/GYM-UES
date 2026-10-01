/**
 * Gym UES - Rutas de autenticacion: login, logout y verificacion de sesion.
 * Sobre MongoDB Atlas: la busqueda de la cuenta usa el indice unico de
 * `usuarios.username`.
 * Las contrasenas se comparan con bcrypt cuando estan cifradas y en texto
 * plano cuando el administrador las restablece (compatibilidad historica).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { Usuario } = require('../models');
const { requireAuth, createToken, revokeToken } = require('../middleware');

const router = express.Router();

// Clave secreta para crear administradores y restablecer contrasenas.
// En produccion DEBE definirse con ADMIN_SECRET_KEY: el valor por defecto es
// publico (esta en el repositorio), asi que con el, cualquiera que visitara la
// web podria cambiar la contrasena de cualquier usuario.
const CLAVE_POR_DEFECTO = 'gymues-2026';
const SECRET_ADMIN = process.env.ADMIN_SECRET_KEY || CLAVE_POR_DEFECTO;
if (SECRET_ADMIN === CLAVE_POR_DEFECTO && process.env.NODE_ENV === 'production') {
  console.warn(
    '[auth] AVISO DE SEGURIDAD: ADMIN_SECRET_KEY sigue con el valor por defecto. ' +
      'Define una clave propia en las variables de entorno antes de publicar la app.'
  );
}

const ROLES_REGISTRABLES = [
  'super_admin',
  'admin',
  'administrador_gym',
  'admin_matutino',
  'admin_vespertino',
  'maestro_mañana',
  'maestro_tarde',
  'jefe_carrera'
];

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña son obligatorios.' });
    }

    // .select() trae solo lo necesario (incluida la contrasena) y .lean()
    // evita hidratar el documento: la consulta mas rapida posible.
    const user = await Usuario.findOne({ username: String(username).trim() })
      .select({ username: 1, password: 1, role: 1, active: 1 })
      .lean()
      .maxTimeMS(5000);
    if (!user) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }
    if (!user.active) {
      return res.status(403).json({ mensaje: 'Esta cuenta esta desactivada. Contacte al super_admin.' });
    }
    // Soporta contrasenas cifradas (bcrypt) y en texto plano (las restablecidas
    // desde el login o creadas con clave secreta se guardan SIN cifrar para
    // poder verlas en la base de datos).
    let valid = false;
    if (String(user.password).startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = String(user.password) === password;
    }
    if (!valid) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }
    const token = createToken(user);
    res.json({
      token,
      usuario: { id: String(user._id), username: user.username, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  revokeToken(req.auth.token);
  res.json({ mensaje: 'Sesion cerrada correctamente.' });
});

// GET /api/auth/me - verifica sesion
// NOTA: la firma es (req, res). Antes se usaba (_req) y se hacia referencia a
// req.auth, lo que lanzaba "req is not defined" (error tipo res.json is not a function).
router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, usuario: { username: req.auth.username, role: req.auth.role } });
});

// GET /api/auth/status - estado de la conexion y cuentas de administrador.
// Sirve para que el login indique si Atlas responde y cuantas cuentas existen.
router.get('/status', async (_req, res) => {
  try {
    const cuentas = await Usuario.find({}, { username: 1, role: 1, _id: 0 })
      .sort({ username: 1 })
      .lean()
      .maxTimeMS(5000);
    res.json({ db: true, cuentas });
  } catch {
    res.status(503).json({
      db: false,
      mensaje: 'No se pudo conectar con MongoDB Atlas. Verifique la URI en el archivo .env.'
    });
  }
});

// POST /api/auth/restablecer - "Olvide mi contrasena": la restablece pedida la
// clave secreta de administrador. La contrasena se guarda CIFRADA con bcrypt
// (antes se guardaba en texto plano, lo que exponia todas las contrasenas de
// la base con solo leerla).
router.post('/restablecer', async (req, res, next) => {
  try {
    const { secret, username, password } = req.body || {};
    if (String(secret || '') !== SECRET_ADMIN) {
      return res.status(403).json({ mensaje: 'Clave secreta incorrecta.' });
    }
    const user = String(username || '').trim();
    const pass = String(password || '');
    if (!user || pass.length < 4) {
      return res.status(400).json({ mensaje: 'Usuario y nueva contrasena (min. 4 caracteres) son obligatorios.' });
    }
    const hash = await bcrypt.hash(pass, 10);
    const cuenta = await Usuario.findOneAndUpdate(
      { username: user },
      { $set: { password: hash } },
      { new: true }
    )
      .select({ _id: 1 })
      .lean();
    if (!cuenta) {
      return res.status(404).json({ mensaje: 'No existe un usuario con ese nombre de usuario.' });
    }
    res.json({ mensaje: 'Contrasena restablecida correctamente.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register-admin - crea un administrador nuevo pidiendo la clave
// secreta. La contrasena se guarda CIFRADA con bcrypt.
router.post('/register-admin', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (String(body.secret || '') !== SECRET_ADMIN) {
      return res.status(403).json({ mensaje: 'Clave secreta incorrecta.' });
    }
    const username = String(body.username || '').trim().slice(0, 100);
    const password = String(body.password || '');
    const role = String(body.role || 'admin');
    if (!username || password.length < 4) {
      return res.status(400).json({ mensaje: 'Usuario y contrasena (min. 4 caracteres) son obligatorios.' });
    }
    if (!ROLES_REGISTRABLES.includes(role)) {
      return res.status(400).json({ mensaje: 'Rol no valido.' });
    }
    const existe = await Usuario.exists({ username });
    if (existe) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    const hash = await bcrypt.hash(password, 10);
    await Usuario.create({
      username,
      password: hash,
      role,
      active: true,
      scope_values: [],
      created_at: new Date()
    });
    res.status(201).json({ mensaje: 'Administrador creado correctamente.', username });
  } catch (err) {
    // 11000 = violacion del indice unico de username (carrera perdida)
    if (err && err.code === 11000) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    next(err);
  }
});

module.exports = router;
