import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal.jsx';
import BotonTema from './BotonTema.jsx';
import { ROLES_REGISTRABLES } from '../services/roles.js';

/**
 * FormLogin - tarjeta de acceso unificada del portal admin.
 * Incluye el formulario principal y, en MODALES (sin amontonar la tarjeta),
 * los flujos de "recuperar contrasena" y "crear administrador con clave
 * secreta". Estado de BD en chips y enlace de regreso al checador.
 */
export default function FormLogin({
  estadoBd,
  cuentasAdmin,
  trabajando = false,
  onLogin,
  onRestablecer,
  onCrearAdmin
}) {
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [modal, setModal] = useState(null); // 'recuperar' | 'crear'
  const [recForm, setRecForm] = useState({ secret: '', username: '', password: '' });
  const [secForm, setSecForm] = useState({
    secret: '',
    username: '',
    name: '',
    password: '',
    role: 'admin'
  });

  const iniciar = async (e) => {
    e.preventDefault();
    try {
      await onLogin(loginForm.username.trim(), loginForm.password);
      setLoginForm({ username: '', password: '' });
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  const restablecer = async (e) => {
    e.preventDefault();
    try {
      await onRestablecer(recForm);
      setModal(null);
      setRecForm({ secret: '', username: '', password: '' });
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  const crearAdmin = async (e) => {
    e.preventDefault();
    try {
      await onCrearAdmin(secForm);
      setModal(null);
      setSecForm({ secret: '', username: '', name: '', password: '', role: 'admin' });
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  return (
    <div className="login-viewport">
      {/* El tema tambien se puede cambiar sin iniciar sesion. */}
      <BotonTema className="login-tema" />
      <div className="login-caja">
        <div className="login-marco">
          <img
            src="img/logo_ues.png"
            alt="Logo UES"
            className="login-logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h1 className="login-titulo">Gimnasio UES</h1>
          <p className="login-sub">Acceso restringido para administradores</p>
        </div>

        <div className="login-chips">
          {estadoBd === null && (
            <span className="chip chip-info">Conectando a la base de datos...</span>
          )}
          {estadoBd === true && (
            <span className="chip chip-ok">
              BD conectada &middot; {cuentasAdmin.length} cuenta
              {cuentasAdmin.length !== 1 ? 's' : ''} de administrador disponible
              {cuentasAdmin.length !== 1 ? 's' : ''}
            </span>
          )}
          {estadoBd === false && (
            <span className="chip chip-error">
              Base de datos no disponible (verifique la conexion con MongoDB Atlas)
            </span>
          )}
        </div>

        <form onSubmit={iniciar} className="login-form">
          <div className="campo">
            <label htmlFor="login-user">Usuario (correo o nombre de usuario)</label>
            <input
              id="login-user"
              value={loginForm.username}
              onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="campo">
            <label htmlFor="login-pass">Contrasena</label>
            <input
              id="login-pass"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
            {trabajando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="login-enlaces">
          <button
            type="button"
            className="login-enlace"
            onClick={() => setModal('recuperar')}
          >
            &#9881;&#65039; &iquest;Olvidaste tu contrasena?
          </button>
          <span className="login-sep">|</span>
          <button type="button" className="login-enlace" onClick={() => setModal('crear')}>
            &#128274; Crear administrador
          </button>
        </div>

        <p className="login-nota">
          Use las cuentas de administrador registradas en la base de datos. El{' '}
          <b>super_admin</b> puede crear nuevos administradores desde el portal.
        </p>

        <Link to="/checador" className="login-volver">
          &#8592; Regresar al checador UES
        </Link>
      </div>

      {/* Modal: recuperar contrasena */}
      {modal === 'recuperar' && (
        <Modal titulo="Recuperar contrasena" onClose={() => setModal(null)} mostrarLogo>
          <form onSubmit={restablecer} className="login-form">
            <p className="aviso-info">
              Necesitas la clave secreta de administrador para restablecer una
              contrasena. No se publica ni se guarda en ningun sitio: es la que
              definiste en <b>ADMIN_SECRET_KEY</b> al desplegar la aplicacion.
            </p>
            <div className="campo">
              <label>Clave secreta</label>
              <input
                type="password"
                value={recForm.secret}
                onChange={(e) => setRecForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Tu clave de administrador"
              />
            </div>
            <div className="campo">
              <label>Usuario</label>
              <input
                value={recForm.username}
                onChange={(e) => setRecForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Nueva contrasena</label>
              <input
                type="password"
                value={recForm.password}
                onChange={(e) => setRecForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
              {trabajando ? 'Procesando...' : 'Restablecer contrasena'}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal: crear administrador con clave secreta */}
      {modal === 'crear' && (
        <Modal titulo="Crear administrador (clave secreta)" onClose={() => setModal(null)} mostrarLogo>
          <form onSubmit={crearAdmin} className="login-form">
            <p className="aviso-info">
              Crea un administrador nuevo. Necesitas la clave secreta de
              administrador (<b>ADMIN_SECRET_KEY</b>).
            </p>
            <div className="campo">
              <label>Clave secreta</label>
              <input
                type="password"
                value={secForm.secret}
                onChange={(e) => setSecForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Tu clave de administrador"
              />
            </div>
            <div className="campo">
              <label>Usuario (correo o nombre de usuario)</label>
              <input
                value={secForm.username}
                onChange={(e) => setSecForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Nombre</label>
              <input
                value={secForm.name}
                onChange={(e) => setSecForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Contrasena</label>
              <input
                type="password"
                value={secForm.password}
                onChange={(e) => setSecForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Rol</label>
              <select
                value={secForm.role}
                onChange={(e) => setSecForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES_REGISTRABLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
              {trabajando ? 'Creando...' : 'Crear administrador'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}