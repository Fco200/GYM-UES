/**
 * Gym UES - CRUD de estudiantes (alumnos, maestros y personas exteriores).
 * - Alumno/Maestro: el codigo lo ingresa el usuario (expediente / clave empleado).
 * - Exterior: se genera una clave aleatoria tipo GYM-XXXXXX (unica).
 *
 * Sobre MongoDB Atlas. SEGURIDAD: todas las rutas exigen sesion (requireAuth) y
 * se valida el alcance del rol (server/scope.js). Todo dato del cliente pasa
 * por db-map.normalizarEntidad antes de guardarse; las consultas se construyen
 * con objetos de filtro de Mongoose (nunca concatenando texto), y los indices
 * de los modelos resuelven student_code, turn y career.
 */
const express = require('express');
const { Alumno, serializar, serializarVarios } = require('../models');
const { requireAuth } = require('../middleware');
const { normalizarEntidad } = require('../db-map');
const { alcanceUsuario, conAlcance } = require('../scope');
const { generarClaveUnica } = require('../keygen');

const router = express.Router();

const VALID_TYPES = ['alumno', 'maestro', 'exterior'];

// Escapa los metacaracteres de las expresiones regulares para que el texto
// buscado se trate como literal y no pueda provocar backtracking (ReDoS).
function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filtro de busqueda del listado: coincide con clave o con cualquiera de los
// tres nombres, como hacia el LIKE de MySQL.
function filtroBusqueda(q) {
  const rx = new RegExp(escaparRegex(q), 'i');
  return { $or: [{ student_code: rx }, { full_name: rx }, { second_name: rx }, { last_name: rx }] };
}

// GET /api/students - listado dentro del alcance, con busqueda opcional (?q=)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const filtro = conAlcance(q ? filtroBusqueda(q) : {}, alcance);

    const alumnos = await Alumno.find(filtro)
      .sort({ created_at: -1 })
      .lean()
      .maxTimeMS(8000);
    res.json(serializarVarios(alumnos, 'alumnos'));
  } catch (err) {
    next(err);
  }
});

// GET /api/students/:code - detalle por codigo (dentro del alcance)
router.get('/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = conAlcance({ student_code: String(req.params.code) }, alcance);
    const alumno = await Alumno.findOne(filtro).lean().maxTimeMS(8000);
    if (!alumno) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado.' });
    }
    res.json(serializar(alumno, 'alumnos'));
  } catch (err) {
    next(err);
  }
});

// POST /api/students - registrar alumno / maestro / exterior (requiere sesion)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    if (alcance.tipo === 'ninguno') {
      return res.status(403).json({ mensaje: 'No tiene permisos para registrar alumnos.' });
    }
    const body = { ...(req.body || {}) };
    const type = String(body.type || 'alumno').trim().toLowerCase() || 'alumno';
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ mensaje: 'Tipo de persona invalido.' });
    }

    // admin_matutino / admin_vespertino: solo pueden registrar de su turno.
    // Personas exteriores y maestros pueden registrarse con cualquier turno.
    if (alcance.tipo === 'turno' && type !== 'exterior') {
      if (body.turn && String(body.turn).trim() && String(body.turn).trim() !== alcance.turno) {
        return res.status(403).json({ mensaje: `Solo puede registrar alumnos del turno ${alcance.turno}.` });
      }
      body.turn = alcance.turno;
    }

    // jefe_carrera: la restriccion de carreras aplica solo a alumnos.
    if (alcance.tipo === 'carreras' && type === 'alumno') {
      const career = String(body.career || '').trim();
      const permitidas = (alcance.carreras || []).map((c) => c.toLowerCase());
      if (!career || !permitidas.includes(career.toLowerCase())) {
        return res.status(403).json({ mensaje: 'Solo puede registrar alumnos de sus carreras asignadas.' });
      }
    }

    const nombre = String(body.full_name || '').trim();
    const segundo = String(body.second_name || '').trim();
    const apellido = String(body.last_name || '').trim();
    if (!nombre || !segundo || !apellido) {
      return res.status(400).json({ mensaje: 'Nombre y apellidos son obligatorios.' });
    }

    let studentCode = String(body.student_code || '').trim().slice(0, 50);
    if (type === 'exterior' || !studentCode) {
      studentCode = await generarClaveUnica();
    } else {
      const dup = await Alumno.exists({ student_code: studentCode });
      if (dup) {
        return res.status(409).json({ mensaje: `La clave ${studentCode} ya esta registrada.` });
      }
    }

    const { datos, errores } = normalizarEntidad('alumnos', { ...body, student_code: studentCode });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos invalidos: ' + errores.join('; ') });
    }

    datos.created_at = new Date();
    let creado;
    try {
      creado = await Alumno.create(datos);
    } catch (err) {
      // 11000 = indice unico uq_alumnos_codigo (carrera perdida entre el
      // exists() y el create()).
      if (err && err.code === 11000) {
        return res.status(409).json({ mensaje: `La clave ${studentCode} ya esta registrada.` });
      }
      throw err;
    }

    res.status(201).json({
      mensaje: 'Registro creado correctamente.',
      estudiante: serializar(creado.toObject(), 'alumnos')
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/students/:code - actualizar (requiere sesion y permiso sobre el alumno)
router.put('/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const actual = await Alumno.findOne(
      conAlcance({ student_code: String(req.params.code) }, alcance)
    )
      .lean()
      .maxTimeMS(8000);
    if (!actual) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado.' });
    }

    const body = { ...(req.body || {}) };
    const tipoActual = String(actual.type || 'alumno');
    if (alcance.tipo === 'turno' && tipoActual !== 'exterior') {
      if (body.turn && String(body.turn).trim() && String(body.turn).trim() !== alcance.turno) {
        return res.status(403).json({ mensaje: `Solo puede editar alumnos del turno ${alcance.turno}.` });
      }
      body.turn = alcance.turno;
    }
    if (alcance.tipo === 'carreras' && tipoActual === 'alumno' && body.career !== undefined) {
      const career = String(body.career || '').trim();
      const permitidas = (alcance.carreras || []).map((c) => c.toLowerCase());
      if (!career || !permitidas.includes(career.toLowerCase())) {
        return res.status(403).json({ mensaje: 'Solo puede asignar carreras de su lista autorizada.' });
      }
    }

    // Edicion parcial: solo se tocan los campos presentes en el cuerpo.
    const { datos, errores } = normalizarEntidad('alumnos', body, { completo: false });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos invalidos: ' + errores.join('; ') });
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar.' });
    }

    await Alumno.updateOne({ student_code: String(req.params.code) }, { $set: datos });

    const actualizado = await Alumno.findOne({ student_code: String(req.params.code) })
      .lean()
      .maxTimeMS(8000);
    res.json({ mensaje: 'Registro actualizado.', estudiante: serializar(actualizado, 'alumnos') });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/students/:code - solo alumnos dentro del alcance
router.delete('/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const r = await Alumno.deleteOne(
      conAlcance({ student_code: String(req.params.code) }, alcance)
    );
    if (r.deletedCount === 0) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado.' });
    }
    res.json({ mensaje: 'Registro eliminado.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.VALID_TYPES = VALID_TYPES;
