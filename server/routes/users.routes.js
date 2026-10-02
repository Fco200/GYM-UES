/**
 * Gym UES - CRUD de cuentas de administrador del sistema.
 * Acceso EXCLUSIVO de super_admin (requireAuth + requireRole). Nunca se
 * expone la contrasena de ningun usuario en las respuestas. Las contrasenas
 * nuevas se guardan SIN CIFRAR (texto plano) para poder verlas en la base de
 * datos; el login acepta tanto bcrypt como texto plano.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { Usuario, serializarVarios } = require('../models');
const { requireAuth, requireRole } = require('../middleware');

const router = express.Router();

const ROLES_VALIDOS = [
  'super_admin',
  'admin',
  'administrador_gym',
  'admin_matutino',
  'admin_vespertino',
  'maestro_mañana',
  'maestro_tarde',
  'jefe_carrera'
];

// Convierte scope_values en array de carreras. Con MongoDB ya es un array
// nativo, pero se acepta tambien texto ("Carrera A; Carrera B") para no romper
// clientes que envieen el campo como CSV.
function deserializarScope(raw) {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    const lista = raw.map((c) => String(c).trim()).filter(Boolean);
    return lista.length > 0 ? lista : null;
  }
  const texto = String(raw).trim();
  if (!texto) return null;
  const lista = texto.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
  return lista.length > 0 ? lista : null;
}

function serializarScope(valor) {
  if (valor === undefined || valor === null) return null;
  const arr = Array.isArray(valor) ? valor : String(valor).split(/[;,]/);
  const limpio = arr.map((c) => String(c).trim()).filter(Boolean);
  return limpio.length > 0 ? limpio : null;
}

router.use(requireAuth, requireRole('super_admin'));

// GET /api/users - lista de cuentas (sin password), con busqueda y filtros.
// Filtros opcionales: ?q= (usuario o rol), ?role= y ?active=1|0.
router.get('/', async (req, res, next) => {
  try {
    const filtro = {};

    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) {
      // Texto escapado: el usuario escribe, nunca se inyecta una expresion.
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtro.$or = [{ username: rx }, { role: rx }];
    }

    const role = String(req.query.role || '').trim().slice(0, 50);
    if (role) filtro.role = role;

    if (req.query.active !== undefined && req.query.active !== '') {
      filtro.active = req.query.active === '1' || req.query.active === 'true';
    }

    const cuentas = await Usuario.find(filtro)
      .select({ username: 1, role: 1, active: 1, scope_values: 1, created_at: 1 })
      .sort({ username: 1 })
      .lean()
      .maxTimeMS(5000);
    res.json(
      serializarVarios(cuentas, 'usuarios', {
        solo: ['id', 'username', 'role', 'active', 'scope_values', 'created_at']
      })
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/users - crea una cuenta
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = String(body.username || '').trim().slice(0, 100);
    const password = String(body.password || '');
    const role = String(body.role || 'admin');
    const active = body.active === false || Number(body.active) === 0 ? false : true;

    if (!username) {
      return res.status(400).json({ mensaje: 'El usuario es obligatorio.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ mensaje: 'La contrasena debe tener al menos 4 caracteres.' });
    }
    if (!ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ mensaje: 'Rol no valido.' });
    }
    if (role === 'jefe_carrera' && !Array.isArray(body.scope_values)) {
      return res.status(400).json({ mensaje: 'Asigne carreras para el rol jefe_carrera.' });
    }

    await Usuario.create({
      username,
      // Se guarda el hash con bcrypt, nunca la contrasena en claro.
      password: await bcrypt.hash(password, 10),
      role,
      active,
      scope_values: serializarScope(body.scope_values) || [],
      created_at: new Date()
    });
    res.status(201).json({ mensaje: 'Usuario creado correctamente.', username });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ mensaje: `El usuario ${String(req.body?.username || '').trim()} ya existe.` });
    }
    next(err);
  }
});

// PUT /api/users/:username - actualiza role/password/active/scope_values
router.put('/:username', async (req, res, next) => {
  try {
    const target = String(req.params.username || '').trim();
    const body = req.body || {};

    const actual = await Usuario.findOne({ username: target }).lean().maxTimeMS(5000);
    if (!actual) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    // $set solo con los campos que el cliente envio: actualizacion parcial.
    const cambios = {};

    const nuevoRole = Object.prototype.hasOwnProperty.call(body, 'role')
      ? String(body.role)
      : actual.role;
    if (!ROLES_VALIDOS.includes(nuevoRole)) {
      return res.status(400).json({ mensaje: 'Rol no valido.' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'role') && body.role !== actual.role) {
      if (actual.username === 'super_admin') {
        return res.status(403).json({ mensaje: 'No se puede cambiar el rol de super_admin.' });
      }
      cambios.role = nuevoRole;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'active')) {
      if (actual.username === 'super_admin' && (body.active === false || Number(body.active) === 0)) {
        return res.status(403).json({ mensaje: 'No se puede desactivar la cuenta super_admin.' });
      }
      cambios.active = body.active === false || Number(body.active) === 0 ? false : true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'password') && String(body.password) !== '') {
      const pw = String(body.password);
      if (pw.length < 4) {
        return res.status(400).json({ mensaje: 'La contrasena debe tener al menos 4 caracteres.' });
      }
      cambios.password = await bcrypt.hash(pw, 10);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'scope_values')) {
      if (nuevoRole === 'jefe_carrera' && !Array.isArray(body.scope_values)) {
        return res.status(400).json({ mensaje: 'Asigne carreras para el rol jefe_carrera.' });
      }
      cambios.scope_values = serializarScope(body.scope_values) || [];
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ mensaje: 'No hay cambios para guardar.' });
    }

    await Usuario.updateOne({ username: target }, { $set: cambios });
    res.json({ mensaje: 'Usuario actualizado correctamente.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:username - elimina (nunca a super_admin ni a si mismo)
router.delete('/:username', async (req, res, next) => {
  try {
    const target = String(req.params.username || '').trim();
    if (target === 'super_admin') {
      return res.status(400).json({ mensaje: 'No se puede eliminar la cuenta super_admin.' });
    }
    if (target === req.auth.username) {
      return res.status(400).json({ mensaje: 'No puede eliminar su propia cuenta.' });
    }
    const r = await Usuario.deleteOne({ username: target });
    if (r.deletedCount === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }
    res.json({ mensaje: 'Usuario eliminado correctamente.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ROLES_VALIDOS = ROLES_VALIDOS;
module.exports.deserializarScope = deserializarScope;
