/**
 * Gym UES - Rutas PUBLICAS del kiosco (no requieren sesion).
 * - GET /api/public/member/:code   : tarjeta del miembro + ultimas asistencias.
 * - GET /api/public/count-today    : conteo de asistencias del dia (kiosco).
 * - POST /api/public/registro      : auto-registro abierto del checador.
 *
 * Sobre MongoDB Atlas. Este es el endpoint mas consultado del sistema (lo
 * llama el checador sin sesion), asi que el conteo del dia se cachea durante
 * CONTEO_CACHE_MS: varias pantallas de checador a la vez no generan
 * una consulta a Atlas por cada una. La cache se invalida en cuanto se
 * registra una entrada o una salida.
 */
const express = require('express');
const { Alumno, Asistencia, serializar, hoy, rangoDelDia } = require('../models');
const { normalizarEntidad } = require('../db-map');
const catalogos = require('../catalogos');
const { generarClaveUnica } = require('../keygen');
const { leer, guardar, CLAVES } = require('../cache');

const router = express.Router();

// Auto-registro del kiosco: limite anti-spam por IP (60 registros / hora).
const VALID_TYPES = catalogos.VALID_TYPES;
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
        mensaje: 'Clave no encontrada. Verifique que esté registrado en el gimnasio.'
      });
    }
    const estudiante = {
      student_code: s.student_code,
      full_name: `${s.full_name} ${s.second_name} ${s.last_name}`.trim(),
      type: s.type,
      gender: s.gender,
      turn: s.turn,
      academic_unit: s.academic_unit,
      career: s.career,
      work_area: s.work_area,
      job_title: s.job_title,
      image_url: s.image_url,
      // El certificado puede venir como 'Si' o como la URL del PDF subido, asi
      // que basta con descartar el 'No' explicito.
      certificadoVigente: String(s.medical_certificate || '') !== 'No'
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
// personal UES y personas exteriores (sin sesion). Los 3 tipos se guardan en la
// coleccion alumnos. Para exteriores la clave GYM-XXXXXX se genera sola.
// Limitado por IP para evitar spam (60 registros / hora).
router.post('/registro', async (req, res, next) => {
  try {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    if (!comprobarLimiteIp(ip)) {
      return res.status(429).json({
        mensaje: 'Se alcanzó el límite de auto-registros desde este dispositivo. Intente más tarde.'
      });
    }

    const body = { ...(req.body || {}) };
    // Tipo obligatorio y validado: si llega algo desconocido se rechaza en vez
    // de asumir 'alumno', porque un tipo mal escrito crearia el registro con los
    // campos equivocados y despues nadie sabria de donde salio.
    const typeSolicitado = String(body.type || '').trim();
    const type = catalogos.canonicalizarTipo(typeSolicitado);
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ mensaje: 'Tipo de persona inválido.' });
    }

    // El area y el puesto son exclusivos del personal UES.
    if (type !== 'personal') {
      delete body.work_area;
      delete body.job_title;
    }

    const nombre = String(body.full_name || '').trim();
    const segundo = String(body.second_name || '').trim();
    const apellido = String(body.last_name || '').trim();
    if (!nombre || !segundo || !apellido) {
      return res.status(400).json({ mensaje: 'Nombre y apellidos son obligatorios.' });
    }

    // Alumno / personal: se exige el expediente o la clave de empleado que
    // digito la persona, igual que en el panel: sin ella se generaria una clave
    // GYM-XXXXXX y el registro quedaria huerfano. Exterior: la clave se genera
    // sola porque es un visitante sin credencial institucional.
    const cfg = catalogos.tipoPorId(type);
    let studentCode = String(body.student_code || '').trim().slice(0, 50);
    if (!cfg.claveGenerada) {
      if (!studentCode) {
        return res.status(400).json({
          mensaje: `Ingrese ${cfg.codigoEtiqueta.toLowerCase()}.`
        });
      }
      const dup = await Alumno.exists({ student_code: studentCode });
      if (dup) {
        return res.status(409).json({ mensaje: `La clave ${studentCode} ya está registrada.` });
      }
    } else {
      studentCode = await generarClaveUnica();
    }

    const { datos, errores } = normalizarEntidad('alumnos', { ...body, type, student_code: studentCode });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos inválidos: ' + errores.join('; ') });
    }

    // El kiosco es un auto-registro abierto: no se exige unidad academica ni
    // puesto (nadie los teclea frente al lector). El administrador completa y
    // corrige esos datos desde el portal, que si los exige.
    datos.created_at = new Date();
    let creado;
    try {
      creado = await Alumno.create(datos);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ mensaje: `La clave ${studentCode} ya está registrada.` });
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

// GET /api/public/catalogos - listas institucionales (tipos de persona, areas
// laborales del personal, unidades academicas, turnos y generos).
//
// Es PUBLICO a proposito: el formulario de registro abierto del kiosco y el
// buscador de la pantalla principal tambien necesitan los desplegables, y son
// datos que ya viven en el propio sistema (no son secretos). Asi, si se agrega
// una unidad academica o un area nueva a shared/catalogos.json, todos los
// formularios la muestran sin que haya que actualizar el frontend a mano.
router.get('/catalogos', (_req, res) => {
  res.json({
    tipos: catalogos.TIPOS.map((t) => ({
      id: t.id,
      etiqueta: t.etiqueta,
      etiquetaCorta: t.etiquetaCorta,
      codigoEtiqueta: t.codigoEtiqueta,
      codigoPlaceholder: t.codigoPlaceholder,
      campoCarrera: t.campoCarrera,
      campoCarreraPlaceholder: t.campoCarreraPlaceholder,
      claveGenerada: t.claveGenerada,
      requiereArea: t.requiereArea,
      requierePuesto: t.requierePuesto,
      requiereUnidad: t.requiereUnidad
    })),
    areasTrabajo: catalogos.AREAS_TRABAJO,
    unidadesAcademicas: catalogos.UNIDADES_ACADEMICAS,
    carreras: catalogos.CARRERAS,
    turnos: catalogos.TURNOS,
    generos: catalogos.GENEROS
  });
});

module.exports = router;
