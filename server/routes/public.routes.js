/**
 * Gym UES - Rutas PUBLICAS del kiosco (no requieren sesion).
 * - GET /api/public/member/:code   : tarjeta del miembro + ultimas asistencias.
 * - GET /api/public/count-today    : conteo de asistencias del dia (kiosco).
 * - POST /api/public/registro      : auto-registro abierto del checador.
 * - GET /api/public/alumno/:code   : consulta de los datos propios por expediente.
 * - PUT /api/public/alumno/:code   : actualizacion de esos datos (autoservicio).
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

// Auto-registro del kiosco: limite anti-spam por IP. Se puede ajustar con
// LIMITE_REGISTRO_IP porque en una jornada de inscripcion cientos de alumnos
// pueden compartir la misma IP publica del campus (NAT). El valor por defecto
// deja pasar esa demanda normal sin abrir la puerta a un bucle de spam.
const VALID_TYPES = catalogos.VALID_TYPES;
const LIMITE_REGISTRO_HORA = Math.max(1, Number(process.env.LIMITE_REGISTRO_IP || 300));
const registrosPorIp = new Map();

// Consulta/actualizacion de datos propios: limite independiente para que un
// curioso no pueda recorrer expedientes a fuerza de peticiones. No se comparte
// con el contador del auto-registro para no castigar a un alumno legitimo que
// ya se registro y luego corrige sus datos desde el mismo telefono.
const LIMITE_CONSULTA_HORA = Math.max(1, Number(process.env.LIMITE_CONSULTA_IP || 240));
const consultasPorIp = new Map();

// Cache corta del conteo de hoy (evita golpear Atlas en cada apertura).
// La clave incluye el dia para que el cambio de fecha la invalide sola; una
// marcacion la borra explicitamente (attendance.routes -> invalidar).
const CONTEO_CACHE_MS = Number(process.env.CONTEO_CACHE_MS || 5_000);

// Tope de IPs recordadas por el limitador. Si el gimnasio recibe muchas
// visitas, se purgan las entradas viejas para que el Map no crezca sin limite
// (cada entrada caduca sola a la hora).
const MAX_IPS_LIMITE = 20000;

function comprobarLimite(mapa, ip, limite) {
  const ahora = Date.now();
  if (mapa.size > MAX_IPS_LIMITE) {
    for (const [clave, valor] of mapa) {
      if (ahora - valor.hora >= 3600000) mapa.delete(clave);
    }
  }
  const entrada = mapa.get(ip);
  if (!entrada || ahora - entrada.hora >= 3600000) {
    mapa.set(ip, { hora: ahora, n: 1 });
    return true;
  }
  if (entrada.n >= limite) return false;
  entrada.n += 1;
  return true;
}

function comprobarLimiteIp(ip) {
  return comprobarLimite(registrosPorIp, ip, LIMITE_REGISTRO_HORA);
}

function comprobarLimiteConsulta(ip) {
  return comprobarLimite(consultasPorIp, ip, LIMITE_CONSULTA_HORA);
}

// Campos que el autoservicio puede leer y editar. Se dejan fuera a proposito:
// student_code (es la llave de acceso), type (lo define el alta), created_at y
// medical_certificate (el certificado lo valida el encargado en el gimnasio).
const CAMPOS_PUBLICOS = [
  'student_code',
  'full_name',
  'second_name',
  'last_name',
  'email',
  'phone',
  'academic_unit',
  'turn',
  'career',
  'type',
  'image_url',
  'created_at'
];

const CAMPOS_EDITABLES = [
  'full_name',
  'second_name',
  'last_name',
  'email',
  'phone',
  'academic_unit',
  'turn',
  'career',
  'image_url'
];

const OBLIGATORIOS_ACTUALIZACION = [
  ['full_name', 'nombre'],
  ['second_name', 'apellido paterno'],
  ['last_name', 'apellido materno'],
  ['email', 'correo electrónico'],
  ['phone', 'teléfono'],
  ['academic_unit', 'unidad académica'],
  ['turn', 'turno'],
  ['career', 'carrera']
];

// Escapa los metacaracteres de una expresion regular para buscar el expediente
// como texto literal (evita que un valor raro altere la consulta).
function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/public/expediente/:code/existe - comprobacion ligera para el
// auto-registro de alumnos. Solo informa si la clave ya esta ocupada; no
// devuelve ningun dato personal, por eso puede ser publica. La comparacion es
// sin distinguir mayusculas para que "a123456" no pase junto a "A123456".
router.get('/expediente/:code/existe', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim().slice(0, 50);
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese el expediente a verificar.' });
    }
    const patron = new RegExp(`^${escaparRegex(code)}$`, 'i');
    const existe = await Alumno.exists({ student_code: patron });
    res.json({ expediente: code, existe: Boolean(existe) });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/alumno/:code - autoservicio de actualizacion de datos.
// Devuelve SOLO los campos que la persona puede corregir, para que el
// autoregistro pueda precargar el formulario. Se compara sin distinguir
// mayusculas y se limita por IP para reducir la enumeracion de expedientes.
router.get('/alumno/:code', async (req, res, next) => {
  try {
    // Son datos personales: no deben quedar en la cache del navegador ni en la
    // de un proxy intermedio.
    res.set('Cache-Control', 'no-store');
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    if (!comprobarLimiteConsulta(ip)) {
      return res.status(429).json({
        mensaje: 'Demasiadas consultas desde este dispositivo. Intente más tarde.'
      });
    }
    const code = String(req.params.code || '').trim().slice(0, 50);
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese el expediente a consultar.' });
    }
    const patron = new RegExp(`^${escaparRegex(code)}$`, 'i');
    const alumno = await Alumno.findOne({ student_code: patron }).lean().maxTimeMS(5000);
    if (!alumno) {
      return res.status(404).json({
        mensaje: 'No encontramos un registro con ese expediente. Verifique que esté bien escrito.'
      });
    }
    res.json({
      estudiante: serializar(alumno, 'alumnos', { solo: CAMPOS_PUBLICOS })
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/public/alumno/:code - guarda los cambios hechos por la propia
// persona. La lista blanca evita que alguien cambie su clave, su tipo o su
// certificado desde la calle; el resto pasa por normalizarEntidad, que valida
// enums, longitudes y formato de correo antes de escribir en MongoDB.
router.put('/alumno/:code', async (req, res, next) => {
  try {
    // Son datos personales: no deben quedar en la cache del navegador ni en la
    // de un proxy intermedio.
    res.set('Cache-Control', 'no-store');
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    if (!comprobarLimiteConsulta(ip)) {
      return res.status(429).json({
        mensaje: 'Demasiadas actualizaciones desde este dispositivo. Intente más tarde.'
      });
    }
    const code = String(req.params.code || '').trim().slice(0, 50);
    if (!code) {
      return res.status(400).json({ mensaje: 'Ingrese el expediente a actualizar.' });
    }

    const patron = new RegExp(`^${escaparRegex(code)}$`, 'i');
    const alumno = await Alumno.findOne({ student_code: patron }).lean().maxTimeMS(5000);
    if (!alumno) {
      return res.status(404).json({
        mensaje: 'No encontramos un registro con ese expediente. Verifique que esté bien escrito.'
      });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const entrada = {};
    for (const campo of CAMPOS_EDITABLES) {
      if (Object.prototype.hasOwnProperty.call(body, campo)) entrada[campo] = body[campo];
    }
    if (Object.keys(entrada).length === 0) {
      return res.status(400).json({ mensaje: 'No se recibieron datos para actualizar.' });
    }

    // La foto solo puede ser una URL ya subida por el endpoint de archivos (o
    // una URL absoluta); se rechaza cualquier otro esquema.
    if (Object.prototype.hasOwnProperty.call(entrada, 'image_url')) {
      const url = String(entrada.image_url || '').trim();
      if (url && !/^(?:\/api\/archivos\/|\/uploads\/|https?:\/\/)/i.test(url)) {
        return res.status(400).json({ mensaje: 'La dirección de la fotografía no es válida.' });
      }
      entrada.image_url = url;
    }

    const { datos, errores } = normalizarEntidad('alumnos', entrada, { completo: false });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos inválidos: ' + errores.join('; ') });
    }

    // Se valida sobre el resultado final (lo que ya estaba + lo que cambio),
    // porque la actualizacion es parcial y no queremos dejar campos vacios.
    const resultante = { ...alumno, ...datos };
    for (const [campo, etiqueta] of OBLIGATORIOS_ACTUALIZACION) {
      if (!String(resultante[campo] || '').trim()) {
        return res.status(400).json({ mensaje: `El campo "${etiqueta}" es obligatorio.` });
      }
    }
    const digitos = String(resultante.phone || '').replace(/\D/g, '');
    if (digitos.length < 7 || digitos.length > 15) {
      return res.status(400).json({
        mensaje: 'El teléfono debe tener entre 7 y 15 dígitos.'
      });
    }

    const actualizado = await Alumno.findOneAndUpdate(
      { _id: alumno._id },
      { $set: datos },
      { new: true, runValidators: true }
    )
      .lean()
      .maxTimeMS(5000);

    res.json({
      mensaje: 'Tus datos se actualizaron correctamente.',
      estudiante: serializar(actualizado, 'alumnos', { solo: CAMPOS_PUBLICOS })
    });
  } catch (err) {
    next(err);
  }
});

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
// Limitado por IP para evitar spam (LIMITE_REGISTRO_IP registros / hora).
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
