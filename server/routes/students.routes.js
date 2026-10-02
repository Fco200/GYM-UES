/**
 * Gym UES - CRUD de personas registradas en el gimnasio (alumnos, personal UES
 * y personas exteriores).
 *
 * - alumno / personal: la clave la ingresa el usuario (expediente o clave de
 *   empleado). El personal ademas debe capturar area laboral y puesto.
 * - exterior: se genera una clave aleatoria tipo GYM-XXXXXX (unica).
 *
 * LISTADO CON FILTROS (todos opcionales y combinables entre si):
 *   ?q=             texto libre: clave, nombres, carrera, puesto, area, unidad
 *   ?type=          alumno | personal | exterior (alias: maestro, MTO,
 *                   docente, trabajador UES)
 *   ?academic_unit= unidad academica de la UES
 *   ?work_area=     area laboral (solo tiene resultados en 'personal')
 *   ?turn=          Matutino | Vespertino | Sabatino
 *   ?career=        carrera / departamento / empresa (coincidencia parcial)
 *   ?certificado=   Si | No (medico validado por el encargado)
 * Si el `type` no existe en el catalogo la ruta responde 400. Los demas
 * parametros (unidad, area, turno, certificado) se IGNORAN si su valor no
 * pertenece a la lista, en lugar de propagar texto arbitrario a la base de
 * datos. Ignorarlos es preferible a devolver un error por un dato mal escrito.
 *
 * Sobre MongoDB Atlas. SEGURIDAD: todas las rutas exigen sesion (requireAuth) y
 * se valida el alcance del rol (server/scope.js). Todo dato del cliente pasa
 * por db-map.normalizarEntidad antes de guardarse; las consultas se construyen
 * con objetos de filtro de Mongoose (nunca concatenando texto), y los indices
 * de los modelos resuelven student_code, type, turn, career, academic_unit y
 * work_area.
 */
const express = require('express');
const { Alumno, serializar, serializarVarios } = require('../models');
const { requireAuth } = require('../middleware');
const { normalizarEntidad, normalizarEnum, OPCIONES } = require('../db-map');
const catalogos = require('../catalogos');
const { alcanceUsuario, conAlcance } = require('../scope');
const { generarClaveUnica } = require('../keygen');

const router = express.Router();

const VALID_TYPES = catalogos.VALID_TYPES;

// Escapa los metacaracteres de las expresiones regulares para que el texto
// buscado se trate como literal y no pueda provocar backtracking (ReDoS).
function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filtro de busqueda del listado: la clave, cualquiera de los tres nombres y
// los datos administrativo-laborales (carrera, puesto, area y unidad). Asi el
// admin puede buscar "auxiliar", "limpieza" o "Navojoa" y encontrar a quien
// corresponde sin conocer su expediente.
const CAMPOS_BUSQUEDA = [
  'student_code',
  'full_name',
  'second_name',
  'last_name',
  'career',
  'job_title',
  'work_area',
  'academic_unit'
];

/**
 * Traduce los parametros de consulta de los filtros a un objeto de MongoDB.
 * Cada valor se valida contra el catalogo: si no pertenece a la lista (por
 * ejemplo una unidad inventada desde la URL), el filtro se IGNORA en lugar de
 * propagar texto arbitrario a la base de datos. El listado entonces sale sin
 * ese filtro, que es preferible a devolver un error 400 por un dato mal escrito.
 *
 * Las condiciones se acumulan en un $and porque dos filtros distintos pueden
 * necesitar $or a la vez (texto libre y certificado) y MongoDB no admite dos
 * claves $or en el mismo nivel.
 */
function filtroListado(query) {
  const condiciones = [];

  const q = String(query.q || '').trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(escaparRegex(q), 'i');
    condiciones.push({ $or: CAMPOS_BUSQUEDA.map((campo) => ({ [campo]: rx })) });
  }

  const tipo = catalogos.canonicalizarTipo(query.type);
  if (tipo) condiciones.push({ type: tipo });

  const unidad = normalizarEnum(OPCIONES.unidad, query.academic_unit);
  if (String(query.academic_unit || '').trim() && unidad) condiciones.push({ academic_unit: unidad });

  const area = normalizarEnum(OPCIONES.area, query.work_area);
  if (String(query.work_area || '').trim() && area) condiciones.push({ work_area: area });

  const turno = normalizarEnum(OPCIONES.turno, query.turn);
  if (String(query.turn || '').trim() && turno) condiciones.push({ turn: turno });

  // La carrera / departamento / empresa es texto libre: se busca por coincidencia
  // parcial en vez de igualdad exacta, porque cada persona lo escribe de forma
  // distinta ("Ing. de Software" / "Ingenieria de Software").
  const carrera = String(query.career || '').trim().slice(0, 100);
  if (carrera) condiciones.push({ career: new RegExp(escaparRegex(carrera), 'i') });

  // Certificado medico: 'Si' busca lo que tiene certificado (marcado o PDF
  // adjunto) y 'No' lo que sigue pendiente. No se puede comparar por igualdad
  // porque el campo guarda tres cosas distintas ('No', 'Si' o una URL de PDF)
  // y en los registros mas antiguos puede no existir.
  const cert = String(query.certificado || '').trim().toLowerCase();
  if (cert === 'si') {
    condiciones.push({ medical_certificate: { $exists: true, $nin: ['No', ''] } });
  } else if (cert === 'no') {
    condiciones.push({
      $or: [
        { medical_certificate: { $in: ['No', ''] } },
        { medical_certificate: { $exists: false } }
      ]
    });
  }

  return condiciones.length > 0 ? { $and: condiciones } : {};
}

/**
 * Valida los campos que dependen del tipo de persona. El personal UES tiene que
 * declarar area laboral y puesto, porque de eso depende el reporte por areas;
 * los alumnos y la unidad academica se exigen en todos los tipos que tienen
 * campus. Devuelve un mensaje de error o null.
 */
function errorDeCamposObligatorios(type, datos) {
  const cfg = catalogos.tipoPorId(type) || {};
  if (cfg.requierePuesto && !String(datos.job_title || '').trim()) {
    return 'Indique el puesto del trabajador.';
  }
  if (cfg.requiereArea && !String(datos.work_area || '').trim()) {
    return 'Seleccione el area laboral del trabajador.';
  }
  if (cfg.requiereUnidad && !String(datos.academic_unit || '').trim()) {
    return 'Seleccione la unidad academica de la UES.';
  }
  return null;
}

// GET /api/students - listado dentro del alcance, con busqueda y filtros
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Un ?type= que no existe en el catalogo se rechaza con 400 en vez de
    // ignorarse: ignorarlo devolveria TODO el directorio y el admin creeria
    // que esta filtrando por un tipo que no existe. Es el mismo criterio que
    // aplica el alta de personas (errorDeCamposObligatorios / POST 400).
    const tipoPedido = String((req.query || {}).type || '').trim();
    if (tipoPedido && !catalogos.canonicalizarTipo(tipoPedido)) {
      return res.status(400).json({
        mensaje: `Tipo de persona no valido: "${tipoPedido}". Use uno de: ${VALID_TYPES.join(', ')}.`
      });
    }
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = conAlcance(filtroListado(req.query || {}), alcance);
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
      return res.status(404).json({ mensaje: 'Registro no encontrado.' });
    }
    res.json(serializar(alumno, 'alumnos'));
  } catch (err) {
    next(err);
  }
});

// POST /api/students - registrar alumno / personal UES / exterior
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    if (alcance.tipo === 'ninguno') {
      return res.status(403).json({ mensaje: 'No tiene permisos para registrar personas.' });
    }
    const body = { ...(req.body || {}) };
    // Si el cliente manda un tipo se valida: un valor desconocido es un error,
    // no un alumno. Solo se aplica 'alumno' por defecto cuando no se envió tipo.
    const typeSolicitado = String(body.type || '').trim();
    const type = catalogos.canonicalizarTipo(typeSolicitado) || (typeSolicitado ? null : 'alumno');
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ mensaje: 'Tipo de persona invalido.' });
    }

    // El area y el puesto son exclusivos del personal UES: si llegan en otro
    // tipo se descartan para no dejar datos laborales colgando de un alumno.
    if (type !== 'personal') {
      delete body.work_area;
      delete body.job_title;
    }

    // admin_matutino / admin_vespertino: solo pueden registrar de su turno.
    // Las personas exteriores y el personal pueden registrarse con cualquier
    // turno porque los trabajadores de la UES no se asignan a un turno del gym.
    if (alcance.tipo === 'turno' && type !== 'exterior' && type !== 'personal') {
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

    const cfg = catalogos.tipoPorId(type);
    let studentCode = String(body.student_code || '').trim().slice(0, 50);
    if (cfg.claveGenerada || !studentCode) {
      studentCode = await generarClaveUnica();
    } else {
      const dup = await Alumno.exists({ student_code: studentCode });
      if (dup) {
        return res.status(409).json({ mensaje: `La clave ${studentCode} ya esta registrada.` });
      }
    }

    const { datos, errores } = normalizarEntidad('alumnos', { ...body, type, student_code: studentCode });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos invalidos: ' + errores.join('; ') });
    }

    const faltante = errorDeCamposObligatorios(type, datos);
    if (faltante) {
      return res.status(400).json({ mensaje: faltante });
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

// PUT /api/students/:code - actualizar (requiere sesion y permiso sobre el registro)
router.put('/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const actual = await Alumno.findOne(
      conAlcance({ student_code: String(req.params.code) }, alcance)
    )
      .lean()
      .maxTimeMS(8000);
    if (!actual) {
      return res.status(404).json({ mensaje: 'Registro no encontrado.' });
    }

    const body = { ...(req.body || {}) };
    const tipoActual = String(actual.type || 'alumno');
    const tipoNuevo = Object.prototype.hasOwnProperty.call(body, 'type')
      ? catalogos.canonicalizarTipo(body.type) || tipoActual
      : tipoActual;

    if (alcance.tipo === 'turno' && tipoActual !== 'exterior' && tipoActual !== 'personal') {
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

    // Al cambiar de tipo, los campos del tipo anterior dejan de aplicar: limpiar
    // area y puesto evita que un alumno conserve el puesto de un trabajador.
    if (tipoNuevo !== 'personal') {
      body.work_area = '';
      body.job_title = '';
    }

    // Edicion parcial: solo se tocan los campos presentes en el cuerpo.
    const { datos, errores } = normalizarEntidad('alumnos', body, { completo: false });
    if (errores.length > 0) {
      return res.status(400).json({ mensaje: 'Datos invalidos: ' + errores.join('; ') });
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar.' });
    }

    // Los campos obligatorios se validan contra el estado resultante, no solo
    // contra lo que mando el cliente: puede estar heredandolo del registro.
    const resultante = { ...actual, ...datos };
    const faltante = errorDeCamposObligatorios(tipoNuevo, resultante);
    if (faltante) {
      return res.status(400).json({ mensaje: faltante });
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

// DELETE /api/students/:code - borra el registro si esta dentro del alcance
router.delete('/:code', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const r = await Alumno.deleteOne(
      conAlcance({ student_code: String(req.params.code) }, alcance)
    );
    if (r.deletedCount === 0) {
      return res.status(404).json({ mensaje: 'Registro no encontrado.' });
    }
    res.json({ mensaje: 'Registro eliminado.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
