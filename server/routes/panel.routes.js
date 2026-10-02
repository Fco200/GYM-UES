/**
 * Gym UES - Panel estadistico del administrador (vista de resumen).
 *
 * GET /api/panel/resumen responde TODO lo que muestra la pantalla de inicio del
 * portal en una sola peticion:
 *   - totales de personas registradas, desglosadas por tipo, unidad academica,
 *     area laboral, turno y carrera;
 *   - altas y bajas del mes en curso;
 *   - cobertura de certificados medicos;
 *   - asistencias del dia (entradas, salidas y quien sigue adentro);
 *   - cuentas de administrador del sistema (solo super_admin).
 *
 * Todo se calcula RESPETANDO el alcance del rol: un jefe de carrera ve sus
 * carreras, un responsable de turno ve su turno y un super_admin ve el total.
 *
 * Rendimiento: cada desglose es un $group sobre el filtro de alcance ya
 * construido, de modo que se resuelven sobre los indices de type, turn, career,
 * academic_unit y work_area. El detalle del dia usa el mismo rango [inicio, fin)
 * por fecha que el resto del sistema, nunca DATE().
 */
const express = require('express');
const { Alumno, Asistencia, Usuario, hoy, rangoDelDia } = require('../models');
const { requireAuth } = require('../middleware');
const catalogos = require('../catalogos');
const { alcanceUsuario, filtroAlcance, codigosVisibles, filtroAsistencias } = require('../scope');

const router = express.Router();

// Etiqueta de "sin capturar": los registros anteriores a los campos nuevos, o
// los que el admin todavia no ha completado, no deben desaparecer del reporte.
const SIN_CAPTURAR = '';

/**
 * Cuenta los documentos de `coleccion` agrupados por `campo`, dentro del filtro.
 * @returns {Promise<Map<string, number>>}
 */
async function conteoPorCampo(Modelo, filtro, campo) {
  const filas = await Modelo.aggregate(
    [{ $match: filtro }, { $group: { _id: `$${campo}`, total: { $sum: 1 } } }],
    { maxTimeMS: 8000 }
  );
  const mapa = new Map();
  for (const f of filas) {
    mapa.set(f._id === null || f._id === undefined ? SIN_CAPTURAR : String(f._id), f.total);
  }
  return mapa;
}

/**
 * Convierte un mapa de conteos en la lista ordenada que consume la interfaz y
 * garantiza que TODAS las opciones del catalogo aparezcan, aunque el conteo sea
 * cero: si el total de Navojoa es 0, el administrador tiene que ver ese 0 para
 * saber que el campus existe y no tiene gente, no un renglon desaparecido.
 */
function aLista(mapa, valores, { incluirSinCapturar = true } = {}) {
  const lista = valores.map((valor) => ({ valor, total: mapa.get(valor) || 0 }));
  if (incluirSinCapturar) {
    const otros = [...mapa.entries()]
      .filter(([valor]) => !valores.includes(valor))
      .map(([valor, total]) => ({ valor, total }));
    lista.push(...otros);
  }
  return lista;
}

// GET /api/panel/resumen - indicadores del panel, dentro del alcance del rol
router.get('/resumen', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const filtro = filtroAlcance(alcance);
    const esSuperAdmin = req.auth.role === 'super_admin';

    const [total, porTipo, porUnidad, porArea, porTurno, porCarrera, conCertificado] =
      await Promise.all([
        Alumno.countDocuments(filtro).maxTimeMS(8000),
        conteoPorCampo(Alumno, filtro, 'type'),
        conteoPorCampo(Alumno, filtro, 'academic_unit'),
        conteoPorCampo(Alumno, filtro, 'work_area'),
        conteoPorCampo(Alumno, filtro, 'turn'),
        conteoPorCampo(Alumno, filtro, 'career'),
        Alumno.aggregate(
          [
            { $match: filtro },
            {
              // El certificado medico guarda tres cosas distintas: 'No', 'Si'
              // o la URL del PDF adjunto. Cuenta como PENDIENTE solo 'No', lo
              // vacio y lo que no existe (registros anteriores a la captura).
              // Es el mismo criterio que usa el filtro ?certificado= del
              // directorio, para que el panel y la tabla jamas discrepen.
              // OJO: se comparan con $eq y no con $in porque $in aplana arrays
              // anidados y la URL del PDF terminaria comparandose consigo misma.
              $group: {
                _id: {
                  $cond: [
                    {
                      $or: [
                        { $eq: [{ $ifNull: ['$medical_certificate', ''] }, 'No'] },
                        { $eq: [{ $ifNull: ['$medical_certificate', ''] }, ''] }
                      ]
                    },
                    'No',
                    'Si'
                  ]
                },
                total: { $sum: 1 }
              }
            }
          ],
          { maxTimeMS: 8000 }
        )
      ]);

    // Altas del mes en curso: los documentos creados dentro del alcance. Se
    // cuenta en el servidor para no tener que traer todos los registros.
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const [altasMes] = await Alumno.aggregate([
      { $match: { ...filtro, created_at: { $gte: inicioMes } } },
      { $count: 'total' }
    ], { maxTimeMS: 8000 });

    // Asistencias del dia, tambien dentro del alcance del rol.
    const dia = hoy();
    const filtroHoy = await filtroAsistencias(alcance, dia, dia);
    const [conteoHoy] = await Asistencia.aggregate(
      [
        { $match: filtroHoy },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            entradas: { $sum: { $cond: [{ $ifNull: ['$check_in', false] }, 1, 0] } },
            salidas: { $sum: { $cond: [{ $ifNull: ['$check_out', false] }, 1, 0] } },
            // Entrada sin salida = la persona sigue dentro del gimnasio ahora.
            adentro: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ifNull: ['$check_in', false] }, { $eq: [{ $ifNull: ['$check_out', true] }, true] }]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ],
      { maxTimeMS: 8000 }
    );

    // Cuentas de administrador: solo super_admin ve el detalle y el total. Para
    // los demas roles basta el numero, sin revelar quien existe.
    let cuentas = null;
    const totalCuentas = await Usuario.countDocuments({}).maxTimeMS(8000);
    if (esSuperAdmin) {
      const porRol = await Usuario.aggregate(
        [{ $group: { _id: '$role', total: { $sum: 1 } } }],
        { maxTimeMS: 5000 }
      );
      const inactivas = await Usuario.countDocuments({ active: false }).maxTimeMS(5000);
      cuentas = {
        total: totalCuentas,
        inactivas: inactivas || 0,
        porRol: porRol.map((f) => ({ valor: String(f._id || 'sin rol'), total: f.total }))
      };
    }

    res.json({
      generado: new Date().toISOString(),
      alcance: { tipo: alcance.tipo, turno: alcance.turno || null },
      personas: {
        total: total || 0,
        altasMes: (altasMes && altasMes.total) || 0,
        porTipo: aLista(porTipo, catalogos.VALID_TYPES),
        porUnidad: aLista(porUnidad, catalogos.UNIDADES_ACADEMICAS),
        porArea: aLista(porArea, catalogos.AREAS_TRABAJO),
        porTurno: aLista(porTurno, catalogos.TURNOS),
        // Solo las 12 adscripciones mas frecuentes: el resto se consulta con el
        // buscador del directorio, que ya filtra por carrera.
        porCarrera: [...porCarrera.entries()]
          .filter(([valor]) => valor !== SIN_CAPTURAR)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([valor, n]) => ({ valor, total: n })),
        certificados: {
          conCertificado:
            (conCertificado.find((c) => c._id === 'Si') || { total: 0 }).total || 0,
          sinCertificado:
            (conCertificado.find((c) => c._id === 'No') || { total: 0 }).total || 0
        }
      },
      // El total de personal sale del mismo conteo por tipo: no hace falta una
      // consulta extra para el dato que mas se consulta del panel.
      personal: { total: porTipo.get('personal') || 0 },
      hoy: {
        total: (conteoHoy && conteoHoy.total) || 0,
        entradas: (conteoHoy && conteoHoy.entradas) || 0,
        salidas: (conteoHoy && conteoHoy.salidas) || 0,
        adentro: (conteoHoy && conteoHoy.adentro) || 0
      },
      cuentas: esSuperAdmin ? cuentas : { total: totalCuentas }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/panel/adentro - quienes siguen dentro del gimnasio ahora mismo.
// Usa el mismo par (alcance, filtro de hoy) que el resumen, asi que la lista de
// presentes y su conteo nunca pueden discrepar.
router.get('/adentro', requireAuth, async (req, res, next) => {
  try {
    const alcance = await alcanceUsuario(req.auth.username, req.auth.role);
    const dia = hoy();
    const { inicio, fin } = rangoDelDia(dia);
    const codigos = await codigosVisibles(alcance);

    const filtro = {
      $and: [
        { check_in: { $gte: inicio, $lt: fin }, check_out: null },
        ...(codigos !== null ? [{ student_code: { $in: codigos } }] : [])
      ]
    };

    const docs = await Asistencia.find(filtro)
      .sort({ check_in: 1 })
      .lean()
      .maxTimeMS(8000);

    // Se cruza con alumnos para devolver la unidad academica y el puesto: el
    // Admin necesita ver de que area es la persona que sigue adentro.
    const claves = docs.map((d) => d.student_code);
    const fichas = claves.length
      ? await Alumno.find({ student_code: { $in: claves } })
          .select({ student_code: 1, full_name: 1, second_name: 1, last_name: 1, type: 1, academic_unit: 1, work_area: 1, job_title: 1, image_url: 1 })
          .lean()
          .maxTimeMS(8000)
      : [];
    const porClave = new Map(fichas.map((f) => [f.student_code, f]));

    res.json({
      registros: docs.map((d) => ({
        id: String(d._id),
        student_code: d.student_code,
        full_name: d.full_name,
        user_type: d.user_type,
        check_in: d.check_in,
        academic_unit: (porClave.get(d.student_code) || {}).academic_unit || '',
        work_area: (porClave.get(d.student_code) || {}).work_area || '',
        job_title: (porClave.get(d.student_code) || {}).job_title || '',
        image_url: (porClave.get(d.student_code) || {}).image_url || ''
      }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
