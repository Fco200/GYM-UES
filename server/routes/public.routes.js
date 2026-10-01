/**
 * Gym UES - Rutas PUBLICAS del kiosco (no requieren sesion).
 * - GET /api/public/member/:code   : tarjeta del miembro + ultimas asistencias.
 * - GET /api/public/count-today    : conteo de asistencias del dia (kiosco).
 * - POST /api/public/registro      : auto-registro abierto del checador.
 *
 * Sobre MongoDB Atlas. Este es el endpoint mas consultado del sistema (lo
 * llama el checador sin sesion), asi que el conteo del dia se cachea durante
 * CONTEO_CACHE_MS: varias pantallas de checador asking a la vez no generates
 * una consulta a Atlas por cada una. La cache se invalida en cuanto se
 * registra una entrada o una salida.
 */
const express = require('express');
const { Alumno, Asistencia, serializar, hoy, rangoDelDia } = require('../models');
const { normalizarEntidad } = require('../db-map');
const { generarClaveUnica } = require('../keygen');
const { leer, guardar, CLAVES } = require('../cache');

const router = express.Router();

// Auto-registro del kiosco: limite anti-spam por IP (60 registros / hora).
const VALID_TYPES = ['alumno', 'maestro', 'exterior'];
const LIMITE_REGISTRO_HORA = 60;
const registrosPorIp = new Map();

// Cache corta del conteo de hoy (evita golpear Atlas en cada apertura).
// La clave incluye el dia para que el cambio de fecha la invalide sola; una
// marcacion la borra explicitamente (attendance.routes -> invalidar).
const CONTEO_CACHE_MS = Number(process.env.CONTEO_CACHE_MS || 5_000);

function comprobarLimiteIp(ip) {
  const ahora = Date.now();
  const entrada = registrosPorIp.get(ip);
  if (!entrada || ahora - entrada.hora >= 3600000) {
    registrosPorIp.set(ip, { hora: ahora, n: 1 });
    return true;
  }
  if (entrada.n >= LIMITE_REGISTRO_HORA) return false;
  entrada.n += 1;
  return true;
}

// GET /api/public/member/:code - informacion publica de un miembro registrado
// y sus 5 ultimas asistencias. Permite al kiosco "consultar mi asistencia".
router.get('/member/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim().slice(0, 50);
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese la clave del usuario.' });
    }
    const s = await Alumno.findOne({ student_code: code }).lean().maxTimeMS(5000);
    if (!s) {
      return res.status(404).json({
        mensaje: 'Clave no encontrada. Verifique que este registrado en el gimnasio.'
      });
    }
    const estudiante = {
      student_code: s.student_code,
      full_name: `${s.full_name} ${s.second_name} ${s.last_name}`.trim(),
      type: s.type,
      gender: s.gender,
      turn: s.turn,
      career: s.career,
      image_url: s.image_url,
      certificadoVigente: String(s.medical_certificate || '') === 'Si'
    };
    const docs = await Asistencia.find({ student_code: code })
      .sort({ created_at: -1 })
      .limit(5)
      .lean()
      .maxTimeMS(5000);
    // Estas dos fechas si se muestran crudas en la tabla del kiosco, asi que
    // pasan por el serializador para conservar el formato local habitual.
    const registros = docs.map((d) => serializar(d, 'asistencias', { solo: ['id', 'check_in', 'check_out'] }));
    res.json({ estudiante, registros });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/count-today - conteos del dia para el checador (sin sesion)
router.get('/count-today', async (_req, res, next) => {
  try {
    const dia = hoy();
    const clave = `${CLAVES.CONTEO_HOY}:${dia}`;
    const cacheado = leer(clave, CONTEO_CACHE_MS);
    if (cacheado) return res.json(cacheado);

    const { inicio, fin } = rangoDelDia(dia);
    const [conteo] = await Asistencia.aggregate(
      [
        {
          $match: {
            $or: [
              { check_in: { $gte: inicio, $lt: fin } },
              { check_in: null, created_at: { $gte: inicio, $lt: fin } }
            ]
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            entradas: { $sum: { $cond: [{ $ifNull: ['$check_in', false] }, 1, 0] } },
            salidas: { $sum: { $cond: [{ $ifNull: ['$check_out', false] }, 1, 0] } }
          }
        }
      ],
      // maxTimeMS es opcion de aggregate, no metodo encadenable.
      { maxTimeMS: 5000 }
    );
    const resultado = {
      total: (conteo && conteo.total) || 0,
      entradas: (conteo && conteo.entradas) || 0,
      salidas: (conteo && conteo.salidas) || 0
    };
    guardar(clave, resultado, CONTEO_CACHE_MS);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// POST /api/public/registro - auto-registro abierto del checador para alumnos,
// maestros y personas exteriores (sin sesion). Los 3 tipos se guardan en la
// coleccion alumnos. Para exteriores la clave GYM-XXXXXX se genera sola.
// Limitado por IP para evitar spam (60 registros / hora).
router.post('/registro', async (req, res, next) => {
  try {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    if (!comprobarLimiteIp(ip)) {
      return res.status(429).json({
        mensaje: 'Se alcanzo el limite de auto-registros desde este dispositivo. Intente mas tarde.'
      });
    }

    const body = { ...(req.body || {}) };
    const type = String(body.type || 'alumno').trim().toLowerCase() || 'alumno';
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ mensaje: 'Tipo de persona invalido.' });
    }

    const nombre = String(body.full_name || '').trim();
    const segundo = String(body.second_name || '').trim();
    const apellido = String(body.last_name || '').trim();
    if (!nombre || !segundo || !apellido) {
      return res.status(400).json({ mensaje: 'Nombre y apellidos son obligatorios.' });
    }

    // Alumno/Maestro: se exige el expediente / clave de empleado que digito el
    // usuario. Exterior: la clave GYM-XXXXXX se genera automaticamente.
    let studentCode = String(body.student_code || '').trim().slice(0, 50);
    if (!studentCode) {
      if (type === 'exterior') {
        studentCode = await generarClaveUnica();
      } else {
        return res.status(400).json({
          mensaje: type === 'alumno' ? 'Ingrese el expediente del alumno.' : 'Ingrese la clave de empleado del maestro.'
        });
      }
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

module.exports = router;
