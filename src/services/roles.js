// Gym UES - Roles y permisos del portal de administracion.
//
// La pestaña "Configuracion y Avisos" (reglamento y horarios) es EXCLUSIVA de
// super_admin / admin. La pestaña "Usuarios del Sistema" es EXCLUSIVA de
// super_admin. Los demas roles ven unicamente lo habilitado segun su alcance
// (turno o carreras) definido en server/scope.js.

// Roles con acceso a la configuracion institucional.
export const ROLES_CONFIG = ['super_admin', 'admin'];

// Rol unico con gestion de usuarios del sistema.
export function puedeGestionarUsuarios(role) {
  return role === 'super_admin';
}

// Indica si un rol puede editar reglamento/horarios.
export function puedeConfiguracion(role) {
  return ROLES_CONFIG.includes(role);
}

// Roles que se pueden asignar al crear un administrador.
export const ROLES_REGISTRABLES = [
  { id: 'super_admin', etiqueta: 'Super Administrador' },
  { id: 'admin', etiqueta: 'Administrador' },
  { id: 'administrador_gym', etiqueta: 'Administrador del Gimnasio' },
  { id: 'maestro_mañana', etiqueta: 'Maestro de turno (Matutino)' },
  { id: 'maestro_tarde', etiqueta: 'Maestro de turno (Vespertino)' },
  { id: 'jefe_carrera', etiqueta: 'Jefe de Carrera' }
];

// Etiqueta legible de un rol para la interfaz.
export function etiquetaRol(role) {
  const map = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    admin_matutino: 'Maestro de turno (Matutino)',
    admin_vespertino: 'Maestro de turno (Vespertino)',
    maestro_mañana: 'Maestro de turno (Matutino)',
    maestro_tarde: 'Maestro de turno (Vespertino)',
    jefe_carrera: 'Jefe de Carrera',
    administrador_gym: 'Administrador del Gimnasio'
  };
  return map[role] || role || 'Usuario';
}