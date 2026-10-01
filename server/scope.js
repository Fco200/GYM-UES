/**
 * Gym UES - Calculo del alcance (filtrado por rol) de cada usuario autenticado.
 *
 * Alcance posible:
 *  - 'todo'     : super_admin, admin y administrador_gym (ven todo).
 *  - 'turno'    : admin_matutino / admin_vespertino (solo ese turno).
 *  - 'carreras' : jefe_carrera (solo las carreras asignadas en scope_values).
 *  - 'ninguno'  : rol desconocido -> sin acceso a alumnos/asistencia.
 *
 * En MongoDB el alcance ya no se expresa como un fragmento SQL con alias, sino
 * como un filtro plano del documento de alumno. `filtroAlcance` es el unico
 * lugar donde se decide que puede ver cada rol.
 */
'use strict';

const { Usuario } = require('./models');

const ROLES_TODO = ['super_admin', 'admin', 'administrador_gym'];

const TURNO_POR_ROL = {
  admin_matutino: 'Matutino',
  admin_vespertino: 'Vespertino',
  // Roles utilizados por el sistema anterior (base de datos existente)
  maestro_mañana: 'Matutino',
  maestro_tarde: 'Vespertino'
};

/**
 * Resuelve el alcance del usuario. Para jefe_carrera lee sus carreras de la
 * coleccion usuarios (scope_values ya es un array real, sin JSON que parsear).
 */
async function alcanceUsuario(username, role) {
  if (ROLES_TODO.includes(role)) {
    return { tipo: 'todo' };
  }
  if (TURNO_POR_ROL[role]) {
    return { tipo: 'turno', turno: TURNO_POR_ROL[role] };
  }
  if (role === 'jefe_carrera') {
    let carreras = [];
    try {
      // .lean() + .select() = documento plano sin hidratar: es la lectura mas
      // rapida posible para un unico campo.
      const u = await Usuario.findOne({ username })
        .select({ scope_values: 1, _id: 0 })
        .lean()
        .maxTimeMS(5000);
      if (u && Array.isArray(u.scope_values)) {
        carreras = u.scope_values.map((c) => String(c).trim()).filter(Boolean);
      }
    } catch {
      carreras = [];
    }
    return { tipo: 'carreras', carreras };
  }
  return { tipo: 'ninguno' };
}

/**
 * Traduce el alcance a un filtro de MongoDB para la coleccion de alumnos.
 * Se combina con el filtro de la consulta usando $and, nunca se concatena.
 */
function filtroAlcance(alcance) {
  if (!alcance || alcance.tipo === 'ninguno') {
    return { __sinAlcance: true };
  }
  if (alcance.tipo === 'turno') {
    return { turn: alcance.turno };
  }
  if (alcance.tipo === 'carreras') {
    const carreras = (alcance.carreras || []).map((c) => String(c).trim()).filter(Boolean);
    if (carreras.length === 0) return { __sinAlcance: true };
    return { career: { $in: carreras } };
  }
  return {};
}

/** Combina el filtro de alcance con el filtro de busqueda en un unico $and. */
function conAlcance(filtro, alcance) {
  const partes = [filtroAlcance(alcance)];
  if (filtro && Object.keys(filtro).length > 0) partes.push(filtro);
  return { $and: partes };
}

module.exports = { alcanceUsuario, filtroAlcance, conAlcance, ROLES_TODO, TURNO_POR_ROL };
