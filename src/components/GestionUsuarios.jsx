import { useEffect, useState } from 'react';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import { getUsers, createUser, updateUser, deleteUser } from '../services/api.js';
import { etiquetaRol, ROLES_REGISTRABLES } from '../services/roles.js';

/**
 * GestionUsuarios - Pestaña "Usuarios del Sistema" (solo super_admin).
 * Lista las cuentas de administrador y permite crear nuevos administradores,
 * cambiar el estado (activo/inactivo), restablecer contrasena y eliminar.
 * El backend refuerza el acceso con requireRole('super_admin').
 */
export default function GestionUsuarios() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    username: '',
    role: 'admin',
    password: '',
    carreras: ''
  });
  const { mensaje, mostrar } = useMensaje();

  const cargar = async () => {
    try {
      setLista(await getUsers());
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    const username = form.username.trim();
    if (!username) {
      mostrar('Ingrese el usuario (correo o nombre de usuario).', 'error');
      return;
    }
    if (form.password.length < 4) {
      mostrar('La contrasena debe tener al menos 4 caracteres.', 'error');
      return;
    }
    const scope_values =
      form.role === 'jefe_carrera'
        ? form.carreras.split(/[,;]/).map((c) => c.trim()).filter(Boolean)
        : undefined;
    if (form.role === 'jefe_carrera' && (!scope_values || scope_values.length === 0)) {
      mostrar('Asigne al menos una carrera para el jefe de carrera.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const ok = window.confirm(`¿Crear la cuenta de administrador "${username}" con rol ${etiquetaRol(form.role)}?`);
      if (!ok) {
        setGuardando(false);
        return;
      }
      await createUser({ username, password: form.password, role: form.role, scope_values });
      mostrar('Administrador creado correctamente.', 'exito');
      setForm({ username: '', role: 'admin', password: '', carreras: '' });
      cargar();
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (u) => {
    const ok = window.confirm(
      `¿${u.active ? 'Desactivar' : 'Activar'} la cuenta "${u.username}"?`
    );
    if (!ok) return;
    try {
      await updateUser(u.username, { active: !u.active });
      mostrar(`${u.username} ${u.active ? 'desactivado' : 'activado'}.`, 'exito');
      cargar();
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const restablecerPassword = async (u) => {
    const nueva = window.prompt(`Nueva contraseña para ${u.username} (min. 4 caracteres):`, '');
    if (!nueva) return;
    if (nueva.length < 4) {
      mostrar('La contraseña debe tener al menos 4 caracteres.', 'error');
      return;
    }
    const ok = window.confirm(`¿Guardar la nueva contraseña de "${u.username}"?`);
    if (!ok) return;
    try {
      await updateUser(u.username, { password: nueva });
      mostrar('Contraseña restablecida correctamente.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar definitivamente la cuenta "${u.username}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteUser(u.username);
      mostrar('Cuenta eliminada correctamente.', 'exito');
      cargar();
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Usuarios del Sistema</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Solo super_admin puede crear y gestionar cuentas de administrador.
          </p>
        </div>
      </div>

      {/* Formulario para nuevo administrador */}
      <div className="panel">
        <h3>Agregar nuevo administrador</h3>
        <form onSubmit={crear}>
          <div className="fila-form">
            <div className="campo">
              <label>Usuario (correo o nombre de usuario)</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="ej. admin2@gymues.com"
              />
            </div>
            <div className="campo">
              <label>Contrasena</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <div className="campo">
              <label>Rol</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES_REGISTRABLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            {form.role === 'jefe_carrera' && (
              <div className="campo">
                <label>Carreras asignadas (separadas por coma)</label>
                <input
                  value={form.carreras}
                  onChange={(e) => setForm((f) => ({ ...f, carreras: e.target.value }))}
                  placeholder="ej. Ingenieria de Software, Medicina"
                />
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-primario" disabled={guardando}>
              {guardando ? 'Creando...' : 'Crear administrador'}
            </button>
          </div>
        </form>
      </div>

      {/* Listado de cuentas */}
      <h3>Cuentas registradas ({lista.length})</h3>
      {cargando ? (
        <p className="texto-centrado">Cargando usuarios...</p>
      ) : (
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.username}>
                  <td>{u.username}</td>
                  <td>{etiquetaRol(u.role)}</td>
                  <td>
                    <span className={`chip ${u.active ? 'chip-ok' : 'chip-error'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secundario"
                      onClick={() => alternarActivo(u)}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secundario"
                      onClick={() => restablecerPassword(u)}
                    >
                      Contrasena
                    </button>
                    {u.username !== 'super_admin' && (
                      <button
                        type="button"
                        className="btn btn-error"
                        onClick={() => eliminar(u)}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}