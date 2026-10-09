import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import AvatarUsuario from './AvatarUsuario.jsx';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  uploadArchivo,
  urlArchivo
} from '../services/api.js';
import { etiquetaRol, ROLES_REGISTRABLES } from '../services/roles.js';
import { CARRERAS } from '../services/catalogos.js';
import { fechaCorta, valor } from '../services/fechas.js';

// Igual que en el directorio: la API responde un arreglo, y cualquier otra
// forma de respuesta debe llegar a la tabla como lista vacia y no como un
// error que tumbe el portal completo.
const comoLista = (valor) => (Array.isArray(valor) ? valor : []);

// Formulario en blanco de una cuenta nueva.
const CUENTA_VACIA = {
  username: '',
  email: '',
  display_name: '',
  role: 'admin',
  password: '',
  carreras: [],
  photoArchivo: null,
  photoPreview: ''
};

/**
 * GestionUsuarios - Pestaña "Cuentas del Sistema" (solo super_admin).
 *
 * Permite crear cuentas de administrador, activarlas o desactivarlas, cambiar
 * su contrasena, cambiar su correo y eliminarlas. Para el rol "Jefe de Carrera"
 * las carreras se eligen con una lista de verificacion (no se escriben), de
 * modo que el alcance coincide siempre con el nombre exacto de la carrera.
 */
export default function GestionUsuarios() {
  const [lista, setLista] = useState([]);
  const [filtros, setFiltros] = useState({ q: '', role: '', active: '' });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [abrirForm, setAbrirForm] = useState(false);
  const [form, setForm] = useState(CUENTA_VACIA);
  // Cuenta cuyo perfil (nombre + foto) se esta editando. null = modal cerrado.
  const [perfil, setPerfil] = useState(null);
  const { mensaje, mostrar } = useMensaje();

  const cargar = useCallback(
    async (filtrosActivos = {}) => {
      try {
        setLista(comoLista(await getUsers(filtrosActivos)));
      } catch (err) {
        mostrar(err.message, 'error');
      } finally {
        setCargando(false);
      }
    },
    [mostrar]
  );

  useEffect(() => {
    cargar(filtros);
  }, [cargar, filtros]);

  const setFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const limpiarFiltros = () => setFiltros({ q: '', role: '', active: '' });
  const hayFiltros = Object.values(filtros).some((v) => v !== '');

  const alternarCarrera = (carrera) =>
    setForm((f) => ({
      ...f,
      carreras: f.carreras.includes(carrera)
        ? f.carreras.filter((c) => c !== carrera)
        : [...f.carreras, carrera]
    }));

  const abrirNuevaCuenta = () => {
    setForm(CUENTA_VACIA);
    setAbrirForm(true);
  };

  // Foto de la cuenta nueva (opcional): se valida el tipo y se muestra la
  // vista previa antes de subirla al guardar.
  const manejarFotoNueva = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      mostrar('La foto debe ser una imagen (JPG/PNG/WebP).', 'error');
      e.target.value = '';
      return;
    }
    setForm((f) => ({ ...f, photoArchivo: file, photoPreview: URL.createObjectURL(file) }));
  };

  // ---------- Perfil de una cuenta existente (nombre + foto) ----------
  const abrirPerfil = (u) => {
    setPerfil({
      username: u.username,
      display_name: u.display_name || '',
      photo_url: u.photo_url || '',
      photoArchivo: null,
      photoPreview: u.photo_url ? urlArchivo(u.photo_url) : ''
    });
  };

  const manejarFotoPerfil = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      mostrar('La foto debe ser una imagen (JPG/PNG/WebP).', 'error');
      e.target.value = '';
      return;
    }
    setPerfil((p) => ({ ...p, photoArchivo: file, photoPreview: URL.createObjectURL(file) }));
  };

  const quitarFotoPerfil = () =>
    setPerfil((p) => ({ ...p, photoArchivo: null, photoPreview: '', photo_url: '' }));

  const guardarPerfil = async (e) => {
    e.preventDefault();
    if (!perfil) return;
    setGuardando(true);
    try {
      let photo_url = perfil.photo_url;
      if (perfil.photoArchivo) {
        const subida = await uploadArchivo(perfil.photoArchivo);
        photo_url = subida.url;
      }
      await updateUser(perfil.username, {
        display_name: perfil.display_name.trim(),
        photo_url
      });
      mostrar('Perfil actualizado correctamente.', 'exito');
      setPerfil(null);
      cargar(filtros);
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const crear = async (e) => {
    e.preventDefault();
    const username = form.username.trim();
    if (!username) {
      mostrar('Escriba el usuario (correo o nombre de usuario).', 'error');
      return;
    }
    if (form.password.length < 4) {
      mostrar('La contraseña debe tener al menos 4 caracteres.', 'error');
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostrar('El correo electrónico no tiene un formato válido.', 'error');
      return;
    }
    if (form.role === 'jefe_carrera' && form.carreras.length === 0) {
      mostrar('Marque al menos una carrera para el jefe de carrera.', 'error');
      return;
    }
    setGuardando(true);
    try {
      let photo_url = '';
      if (form.photoArchivo) {
        const subida = await uploadArchivo(form.photoArchivo);
        photo_url = subida.url;
      }
      await createUser({
        username,
        email,
        display_name: form.display_name.trim(),
        photo_url,
        password: form.password,
        role: form.role,
        scope_values: form.role === 'jefe_carrera' ? form.carreras : undefined
      });
      mostrar('Cuenta de administrador creada correctamente.', 'exito');
      setForm(CUENTA_VACIA);
      setAbrirForm(false);
      cargar(filtros);
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (u) => {
    const accion = u.active ? 'desactivar' : 'activar';
    const ok = window.confirm(`¿Desea ${accion} el acceso de "${u.username}" al portal?`);
    if (!ok) return;
    try {
      await updateUser(u.username, { active: !u.active });
      mostrar(`${u.username} ${u.active ? 'desactivado' : 'activado'}.`, 'exito');
      cargar(filtros);
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const restablecerPassword = async (u) => {
    const nueva = window.prompt(`Nueva contraseña para ${u.username} (mínimo 4 caracteres):`, '');
    if (nueva === null) return;
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

  // Asigna o cambia el correo donde se recibe el codigo de recuperacion.
  const cambiarCorreo = async (u) => {
    const actual = u.email || '';
    const nuevo = window.prompt(
      `Correo para recibir el código de recuperación de ${u.username}:\n` +
        '(dejar vacío para quitarlo; si la cuenta no tiene, se usa el usuario si contiene @)',
      actual
    );
    if (nuevo === null) return;
    const limpio = nuevo.trim();
    if (limpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
      mostrar('El correo electrónico no tiene un formato válido.', 'error');
      return;
    }
    try {
      await updateUser(u.username, { email: limpio });
      mostrar(limpio ? `Correo actualizado a ${limpio}.` : 'Correo eliminado de la cuenta.', 'exito');
      cargar(filtros);
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const eliminar = async (u) => {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la cuenta "${u.username}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      await deleteUser(u.username);
      mostrar('Cuenta eliminada correctamente.', 'exito');
      cargar(filtros);
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Cuentas del Sistema</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Aquí se crean y administran las cuentas de acceso al portal. Solo el
            Super Administrador puede gestionarlas. El rol de cada cuenta decide
            qué pantallas puede ver.
          </p>
        </div>
        <div className="encabezado-acciones">
          <button
            type="button"
            className="btn btn-primario"
            onClick={abrirNuevaCuenta}
            title="Crear una cuenta nueva de acceso al portal"
          >
            + Nueva cuenta
          </button>
        </div>
      </div>

      {/* Filtros: se resuelven en el servidor, igual que el directorio de personas */}
      <div className="filtros-directorio">
        <div className="filtros-campo filtros-campo-ancho">
          <label>Buscar por usuario o rol</label>
          <input
            value={filtros.q}
            onChange={(e) => setFiltro('q', e.target.value)}
            placeholder="Escriba el usuario o el rol..."
          />
        </div>
        <div className="filtros-campo">
          <label>Filtrar por rol</label>
          <select value={filtros.role} onChange={(e) => setFiltro('role', e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES_REGISTRABLES.map((r) => (
              <option key={r.id} value={r.id}>{r.etiqueta}</option>
            ))}
          </select>
        </div>
        <div className="filtros-campo">
          <label>Filtrar por estado</label>
          <select value={filtros.active} onChange={(e) => setFiltro('active', e.target.value)}>
            <option value="">Todas</option>
            <option value="1">Solo activas</option>
            <option value="0">Solo inactivas</option>
          </select>
        </div>
        <div className="filtros-acciones">
          <button
            type="button"
            className="btn btn-secundario"
            onClick={limpiarFiltros}
            disabled={!hayFiltros}
            title="Borrar la búsqueda y los filtros"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Listado de cuentas */}
      <h3>Cuentas registradas ({lista.length})</h3>
      {cargando ? (
        <p className="texto-centrado">Cargando cuentas...</p>
      ) : lista.length === 0 ? (
        <p className="aviso-info">No hay cuentas que coincidan con los filtros indicados.</p>
      ) : (
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo de recuperación</th>
                <th>Rol</th>
                <th>Carreras asignadas</th>
                <th>Fecha de alta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.username}>
                  <td>
                    <div className="cuenta-usuario">
                      <AvatarUsuario
                        nombre={u.display_name || u.username}
                        foto={u.photo_url}
                      />
                      <div className="cuenta-usuario-datos">
                        <span className="cuenta-usuario-nombre">
                          {u.display_name || u.username}
                        </span>
                        {u.display_name ? (
                          <span className="texto-suave cuenta-usuario-alias">{u.username}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.email || (
                      <span className="texto-suave" title="Sin correo: use la clave secreta">
                        Sin correo
                      </span>
                    )}
                  </td>
                  <td>{etiquetaRol(u.role)}</td>
                  <td>
                    {u.role === 'jefe_carrera'
                      ? (u.scope_values?.length ? u.scope_values.join(', ') : 'Sin carreras asignadas')
                      : u.role === 'maestro_mañana' ||
                          u.role === 'maestro_tarde' ||
                          u.role === 'admin_matutino' ||
                          u.role === 'admin_vespertino'
                        ? 'Todo el turno'
                        : 'Sin restricción'}
                  </td>
                  <td>{valor(u.created_at, fechaCorta, '—')}</td>
                  <td>
                    <span className={`chip ${u.active ? 'chip-ok' : 'chip-error'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="acciones-tabla">
                      <button
                        type="button"
                        className="btn btn-secundario btn-mini"
                        onClick={() => abrirPerfil(u)}
                        title="Cambiar el nombre y la foto que se muestran en el portal"
                      >
                        Editar perfil
                      </button>
                      <button
                        type="button"
                        className={`btn btn-mini ${u.active ? 'btn-secundario' : 'btn-exito'}`}
                        onClick={() => alternarActivo(u)}
                        title={
                          u.active
                            ? 'Bloquear temporalmente el acceso de esta cuenta'
                            : 'Permitir de nuevo el acceso de esta cuenta'
                        }
                      >
                        {u.active ? 'Desactivar acceso' : 'Activar acceso'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secundario btn-mini"
                        onClick={() => restablecerPassword(u)}
                        title="Asignar una contraseña nueva a esta cuenta"
                      >
                        Cambiar contraseña
                      </button>
                      <button
                        type="button"
                        className="btn btn-secundario btn-mini"
                        onClick={() => cambiarCorreo(u)}
                        title="Cambiar el correo donde se recibe el código de recuperación"
                      >
                        Cambiar correo
                      </button>
                      {u.username !== 'super_admin' ? (
                        <button
                          type="button"
                          className="btn btn-error btn-mini"
                          onClick={() => eliminar(u)}
                          title="Borrar la cuenta del sistema (no se puede deshacer)"
                        >
                          Eliminar cuenta
                        </button>
                      ) : (
                        <span className="texto-suave" title="La cuenta principal no se puede eliminar">
                          Cuenta protegida
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: crear cuenta nueva */}
      {abrirForm && (
        <Modal
          titulo="Nueva cuenta de administrador"
          subtitulo="Complete los datos de la persona que usará el portal"
          onClose={() => setAbrirForm(false)}
        >
          <form onSubmit={crear}>
            <div className="campo">
              <label>Usuario o correo de acceso</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="ej. admin2@gymues.com"
                autoFocus
              />
            </div>
            <div className="campo">
              <label>Nombre completo (opcional)</label>
              <input
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="ej. Juan Pérez López"
                maxLength={120}
              />
            </div>
            <div className="campo">
              <label>Foto de perfil (opcional)</label>
              <div className="perfil-foto">
                <AvatarUsuario
                  nombre={form.display_name || form.username}
                  foto={form.photoPreview}
                  tamano="grande"
                />
                <input type="file" accept="image/*" onChange={manejarFotoNueva} />
                {form.photoPreview ? (
                  <button
                    type="button"
                    className="btn btn-secundario btn-mini"
                    onClick={() =>
                      setForm((f) => ({ ...f, photoArchivo: null, photoPreview: '' }))
                    }
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
            </div>
            <div className="campo">
              <label>Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
                placeholder="Mínimo 4 caracteres"
              />
            </div>
            <div className="campo">
              <label>Correo de recuperación (opcional)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ej. admin@correo.com"
              />
            </div>
            <div className="campo">
              <label>Rol (qué podrá hacer en el sistema)</label>
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
                <label>
                  Carreras a su cargo (marque una o varias)
                  {form.carreras.length > 0 ? ` · ${form.carreras.length} seleccionada(s)` : ''}
                </label>
                <div className="checklist-carreras">
                  {CARRERAS.map((c) => (
                    <label key={c} className="checklist-opcion">
                      <input
                        type="checkbox"
                        checked={form.carreras.includes(c)}
                        onChange={() => alternarCarrera(c)}
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="fila-acciones">
              <button type="submit" className="btn btn-primario" disabled={guardando}>
                {guardando ? 'Creando cuenta...' : 'Crear cuenta'}
              </button>
              <button
                type="button"
                className="btn btn-secundario"
                onClick={() => setAbrirForm(false)}
                disabled={guardando}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: editar perfil (nombre + foto) */}
      {perfil && (
        <Modal
          titulo="Editar perfil de la cuenta"
          subtitulo={`Cuenta: ${perfil.username}`}
          onClose={() => setPerfil(null)}
        >
          <form onSubmit={guardarPerfil}>
            <div className="campo">
              <label>Nombre completo (opcional)</label>
              <input
                value={perfil.display_name}
                onChange={(e) => setPerfil((p) => ({ ...p, display_name: e.target.value }))}
                placeholder="ej. Juan Pérez López"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="campo">
              <label>Foto de perfil (opcional)</label>
              <div className="perfil-foto">
                <AvatarUsuario
                  nombre={perfil.display_name || perfil.username}
                  foto={perfil.photoPreview}
                  tamano="grande"
                />
                <input type="file" accept="image/*" onChange={manejarFotoPerfil} />
                {perfil.photoPreview || perfil.photo_url ? (
                  <button
                    type="button"
                    className="btn btn-secundario btn-mini"
                    onClick={quitarFotoPerfil}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
            </div>
            <div className="fila-acciones">
              <button type="submit" className="btn btn-primario" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                className="btn btn-secundario"
                onClick={() => setPerfil(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}
