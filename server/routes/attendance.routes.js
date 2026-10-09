/**
 * Gym UES - Rutas de asistencia: check-in, check-out, registros y conteos.
 * Check-in/check-out son PUBLICOS (kiosco) y quedan SOLO por student_code.
 * Las consultas (today/count/range) exigen sesion y se filtran por el alcance
 * del rol (server/scope.js).
 *
 * Sobre MongoDB Atlas. Dos decisiones de rendimiento que sustituyen al SQL:
 *   - "hoy" ya no se calcula con DATE(check_in) = ? (que no usa indice) sino
 *     por RANGO [inicio, fin) sobre el indice ix_asistencias_entrada.
 *   - el filtro de alcance se resuelve con una agregacion $lookup contra
 *     alumnos, en lugar de un LEFT JOIN + filtro por alias.
 *
 * SEGURIDAD: todas las consultas se construyen con objetos de filtro y valores
 * ya normalizados; ninguna concatenacion de texto con datos del cliente.
 */
const express = require('express');
const { Alumno, Asistencia, serializarVarios, hoy, rangoDelDia, aObjectId } = require('../models');
const { requireAuth } = require('../middleware');
const { alcanceUsuario, filtroAsistencias, codigosVisibles } = require('../scope');
const { normalizarEntidad, formatearFechaLocal } = require('../db-map');
const { invalidarPrefijo, CLAVES } = require('../cache');

const router = express.Router();

// El conteo del dia que muestra el kiosco se cachea; en cuanto se registra una
// entrada o una salida hay que invalidarlo para que el numero no quede viejo.
function refrescarConteoCache() {
  invalidarPrefijo(CLAVES.CONTEO_HOY);
}

// POST /api/attendance/check-in  { student_code }
router.post('/check-in', async (req, res, next) => {
  try {
    const body = req.body || {};
    const code = String(body.student_code || '').trim();
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese la clave del alumno.' });
    }

    // Solo se registra asistencia a personas YA registradas en el sistema.
    const estudiante = await Alumno.findOne({ student_code: code }).lean().maxTimeMS(5000);
    if (!estudiante) {
      return res.status(400).json({
        mensaje:
          'Clave no registrada. Dé de alta a la persona (alumno, personal UES o exterior) en el Directorio del panel administrativo o en Registro primero.'
      });
    }

    // Unica regla anti-spam: esperar 1 minuto entre marcadas de ENTRADA.
    // Excepcion: si la ultima marcada del dia ya tiene SALIDA registrada,
    // se permite un nuevo check-in inmediatamente (sin esperar el minuto).
    const ultimo = await Asistencia.findOne({ student_code: code })
      .sort({ created_at: -1 })
      .select({ check_in: 1, check_out: 1 })
      .lean()
      .maxTimeMS(5000);
    if (ultimo && ultimo.check_in && !ultimo.check_out) {
      const prev = new Date(ultimo.check_in).getTime();
      const faltan = 60000 - (Date.now() - prev);
      if (faltan > 0) {
        const seg = Math.ceil(faltan / 1000);
        return res.json({
          yaRegistrado: true,
          codigo: code,
          mensaje: `Espere ${seg} s para registrar otra entrada (ya marcó entrada a las ${formatearFechaLocal(ultimo.check_in)}).`
        });
      }
    }

    const fullName = `${estudiante.full_name} ${estudiante.second_name} ${estudiante.last_name}`.trim();
    const checkIn = new Date(Date.now() - 60 * 60 * 1000);
    await Asistencia.create({
      student_code: code,
      full_name: fullName,
      user_type: estudiante.type,
      check_in: checkIn,
      check_out: null,
      created_at: checkIn
    });

    refrescarConteoCache();
    res.status(201).json({
      mensaje: `Entrada registrada a las ${formatearFechaLocal(checkIn)?.slice(-8) || checkIn.toLocaleTimeString('es-MX')} para ${fullName || code}.`,
      nombre: fullName,
      codigo: code
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/check-out  { student_code }
router.post('/check-out', async (req, res, next) => {
  try {
    const body = req.body || {};
    const code = String(body.student_code || '').trim();
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese la clave del alumno.' });
    }

    const { inicio, fin } = rangoDelDia(hoy());
    const abierta = await Asistencia.findOne({
      student_code: code,
      check_in: { $gte: inicio, $lt: fin },
      check_out: null
    })
      .lean()
      .maxTimeMS(5000);
    if (abierta) {
      const checkOut = new Date(Date.now() - 60 * 60 * 1000);
      await Asistencia.updateOne({ _id: abierta._id }, { $set: { check_out: checkOut } });
      refrescarConteoCache();
      return res.json({
        mensaje: `Salida registrada a las ${formatearFechaLocal(checkOut)?.slice(-8) || checkOut.toLocaleTimeString('es-MX')} para ${abierta.full_name || code}.`,
        nombre: abierta.full_name,
        codigo: code
      });
    }

    // Salida sin entrada abierta (salida opcional): se registra igual para que
    // la Salida del checador siempre funcione. Al no haber entrada previa, la
    // entrada se deja como NULL (documento valido para el historial).
    const estudiante = await Alumno.findOne({ student_code: code }).lean().maxTimeMS(5000);
    if (!estudiante) {
      return res.status(400).json({
        mensaje:
          'Clave no registrada. Dé de alta a la persona (alumno, personal UES o exterior) en el Directorio del panel administrativo o en Registro primero.'
      });
    }
    const fullName = `${estudiante.full_name} ${estudiante.second_name} ${estudiante.last_name}`.trim() || code;
    const checkOut2 = new Date(Date.now() - 60 * 60 * 1000);
    await Asistencia.create({
      student_code: code,
      full_name: fullName,
      user_type: estudiante.type,
      check_in: null,
      check_out: checkOut2,
      created_at: checkOut2
    });
    refrescarConteoCache();
    res.json({
      mensaje: `Salida registrada a las ${formatearFechaLocal(checkOut2)?.slice(-8) || checkOut2.toLocaleTimeString('es-MX')} para ${fullName || code} (sin entrada abierta).`,
      nombre: fullName || code,
      codigo: code
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/today - registros de hoy (dentro del alcance)
router.get('/today', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = await filtroAsistencias(alcance, hoy(), hoy());
    const rows = await Asistencia.find(filtro)
      .sort({ check_in: -1 })
      .lean()
      .maxTimeMS(8000);
    res.json(serializarVarios(rows, 'asistencias'));
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/count - conteo del dia (dentro del alcance)
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = await filtroAsistencias(alcance, hoy(), hoy());
    const [conteo] = await Asistencia.aggregate(
      [
        { $match: filtro },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            entradas: { $sum: { $cond: [{ $ifNull: ['$check_in', false] }, 1, 0] } },
            salidas: { $sum: { $cond: [{ $ifNull: ['$check_out', false] }, 1, 0] } }
          }
        }
      ],
      // maxTimeMS es una OPCION de aggregate, no un metodo encadenable: por
      // eso se pasa aqui y no como .maxTimeMS() (daria TypeError).
      { maxTimeMS: 8000 }
    );
    res.json({
      total: (conteo && conteo.total) || 0,
      entradas: (conteo && conteo.entradas) || 0,
      salidas: (conteo && conteo.salidas) || 0
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/range?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&q=...]
// Historial por fechas y busqueda, dentro del alcance del rol.
router.get('/range', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const desde = req.query.desde || hoy();
    const hasta = req.query.hasta || desde;
    const q = String(req.query.q || '').trim().slice(0, 100);

    const filtro = await filtroAsistencias(alcance, desde, hasta);
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtro.$and.push({ $or: [{ student_code: rx }, { full_name: rx }] });
    }

    const rows = await Asistencia.find(filtro)
      .sort({ check_in: -1 })
      .lean()
      .maxTimeMS(8000);
    res.json(serializarVarios(rows, 'asistencias'));
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/student/:code - historial completo de un alumno
// (dentro del alcance del rol). Muestra entrada, salida y fecha.
router.get('/student/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const codigos = await codigosVisibles(alcance);
    if (codigos !== null && !codigos.includes(String(req.params.code))) {
      return res.json([]);
    }
    const rows = await Asistencia.find({ student_code: String(req.params.code) })
      .sort({ created_at: -1 })
      .lean()
      .maxTimeMS(8000);
    res.json(serializarVarios(rows, 'asistencias'));
  } catch (err) {
    next(err);
  }
});

// PUT /api/attendance/:id - corrige los horarios de un registro (dentro del alcance)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const _id = aObjectId(req.params.id);
    if (!_id) {
      return res.status(400).json({ mensaje: 'ID inválido.' });
    }
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = await filtroAsistencias(alcance, hoy(), hoy());
    // Solo se permite editar si el registro cae dentro del alcance y es de hoy,
    // igual que antes: el alcance se evaluaba contra DATE(check_in) = hoy().
    filtro.$and.push({ _id });
    const existe = await Asistencia.exists(filtro);
    if (!existe) {
      return res.status(404).json({ mensaje: 'Registro de asistencia no encontrado.' });
    }

    const { datos, errores } = normalizarEntidad('asistencias', req.body || {}, { completo: false });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos inválidos: ' + errores.join('; ') });
    }
    // Solo se corrigen horarios: el resto de campos no se tocan.
    const cambios = {};
    for (const campo of ['check_in', 'check_out']) {
      if (Object.prototype.hasOwnProperty.call(datos, campo)) cambios[campo] = datos[campo];
    }
    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ mensaje: 'No hay cambios para guardar.' });
    }

    await Asistencia.updateOne({ _id }, { $set: cambios });
    res.json({ mensaje: 'Registro de asistencia actualizado.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/attendance/:id - elimina un registro (dentro del alcance)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const _id = aObjectId(req.params.id);
    if (!_id) {
      return res.status(400).json({ mensaje: 'ID inválido.' });
    }
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = await filtroAsistencias(alcance, hoy(), hoy());
    const r = await Asistencia.deleteOne({ $and: [...filtro.$and, { _id }] });
    if (r.deletedCount === 0) {
      return res.status(404).json({ mensaje: 'Registro de asistencia no encontrado.' });
    }
    res.json({ mensaje: 'Registro de asistencia eliminado.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
