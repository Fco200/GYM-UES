// Gym UES - Roles y permisos del portal de administracion.
//
// Estos roles son PERMISOS DE CUENTA (que pantallas puede abrir el administrador
// que inicia sesion) y NO son el tipo de persona registrada en el directorio.
// Un rol `maestro_mañana` es el responsable de turno; el tipo de persona del
// directorio es `personal` (ver shared/catalogos.json).
//
// La pestaña "Configuracion y Avisos" (reglamento y horarios) es EXCLUSIVA de
// super_admin / admin. La pestaña "Cuentas del Sistema" es EXCLUSIVA de
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
  { id: 'maestro_mañana', etiqueta: 'Responsable de turno (Matutino)' },
  { id: 'maestro_tarde', etiqueta: 'Responsable de turno (Vespertino)' },
  { id: 'jefe_carrera', etiqueta: 'Jefe de Carrera' }
];

// Etiqueta legible de un rol para la interfaz.
// Los identificadores de los responsables de turno se conservan tal cual para
// no romper las cuentas ya creadas; solo cambia la palabra con la que se
// muestran, porque "Maestro de turno" se confundia con el tipo de persona
// "Personal UES" del directorio.
export function etiquetaRol(role) {
  const map = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    admin_matutino: 'Responsable de turno (Matutino)',
    admin_vespertino: 'Responsable de turno (Vespertino)',
    maestro_mañana: 'Responsable de turno (Matutino)',
    maestro_tarde: 'Responsable de turno (Vespertino)',
    jefe_carrera: 'Jefe de Carrera',
    administrador_gym: 'Administrador del Gimnasio'
  };
  return map[role] || role || 'Usuario';
}