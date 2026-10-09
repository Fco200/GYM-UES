import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal.jsx';
import BotonTema from './BotonTema.jsx';
import { ROLES_REGISTRABLES } from '../services/roles.js';

/**
 * FormLogin - tarjeta de acceso del portal admin (diseno limpio UES).
 *
 * En la tarjeta SOLO estan usuario, contrasena y un enlace de ayuda: nada de
 * notas largas ni estados de BD a texto. El estado se muestra como un punto
 * de color con descripcion al pasar el cursor.
 *
 * Los flujos secundarios viven en MODALES:
 *   - Recuperar contrasena: pestaña principal por CODIGO AL CORREO (2 pasos)
 *     y pestaña secundaria con la CLAVE SECRETA.
 *   - Crear administrador con clave secreta.
 */
export default function FormLogin({
  estadoBd,
  cuentasAdmin,
  correoDisponible = null,
  trabajando = false,
  onLogin,
  onRestablecer,
  onCrearAdmin,
  onSolicitarCodigo,
  onVerificarCodigo
}) {
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [modal, setModal] = useState(null); // 'recuperar' | 'crear'

  // Modal de recuperacion: pestana y paso.
  const [pestana, setPestana] = useState('correo'); // 'correo' | 'secreta'
  const [paso, setPaso] = useState(1); // paso 1: usuario | paso 2: codigo + contrasena
  const [recUsuario, setRecUsuario] = useState('');
  const [recDestino, setRecDestino] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [recNueva, setRecNueva] = useState('');
  const [reenvio, setReenvio] = useState(0); // segundos restantes del cooldown
  const temporizador = useRef(null);

  // Segunda opcion: restablecer con la clave secreta.
  const [recForm, setRecForm] = useState({ secret: '', username: '', password: '' });

  // Crear administrador.
  const [secForm, setSecForm] = useState({
    secret: '',
    username: '',
    name: '',
    password: '',
    role: 'admin'
  });

  // Cuenta regresiva del boton "Reenviar codigo".
  useEffect(() => {
    if (reenvio <= 0) {
      if (temporizador.current) clearInterval(temporizador.current);
      return undefined;
    }
    temporizador.current = setInterval(() => {
      setReenvio((s) => {
        if (s <= 1) {
          clearInterval(temporizador.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => temporizador.current && clearInterval(temporizador.current);
  }, [reenvio > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciar = async (e) => {
    e.preventDefault();
    // Si ya hay un inicio de sesion en curso, se ignora el reenvio (Enter
    // repetido o doble clic): evita que dos peticiones se crucen y que un error
    // tardio aparezca encima de una sesion que si se abrio.
    if (trabajando) return;
    try {
      const ok = await onLogin(loginForm.username.trim(), loginForm.password);
      // El formulario solo se limpia si el acceso fue correcto; asi, si falla,
      // la persona ve lo que escribio y puede corregirlo.
      if (ok !== false) setLoginForm({ username: '', password: '' });
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  /** Paso 1 -> 2: pide el codigo al servidor. */
  const enviarCodigo = async (e) => {
    e.preventDefault();
    const usuario = recUsuario.trim();
    if (!usuario) return;
    try {
      const res = await onSolicitarCodigo(usuario);
      setRecDestino(res?.destino || '');
      setReenvio(60);
      setPaso(2);
      setRecCodigo('');
      setRecNueva('');
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  /** Reenvia el codigo (mismo paso 2, respeta el cooldown en el servidor). */
  const reenviarCodigo = async () => {
    if (reenvio > 0) return;
    try {
      const res = await onSolicitarCodigo(recUsuario.trim());
      setRecDestino(res?.destino || '');
      setReenvio(60);
      setRecCodigo('');
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  /** Paso 2: verifica el codigo y guarda la contrasena nueva. */
  const verificarCodigo = async (e) => {
    e.preventDefault();
    try {
      await onVerificarCodigo({
        username: recUsuario.trim(),
        codigo: recCodigo.trim(),
        password: recNueva
      });
      cerrarRecuperar();
    } catch {
      /* el mensaje lo muestra el padre */
    }
  };

  const restablecer = async (e) => {
    e.preventDefault();
    try {
      await onRestablecer(recForm);
      cerrarRecuperar();
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

  function abrirRecuperar() {
    // Si el servidor no tiene el correo configurado, se abre directo en la
    // pestana de clave secreta (la unica que puede funcionar).
    setPestana(correoDisponible === false ? 'secreta' : 'correo');
    setPaso(1);
    setRecUsuario(loginForm.username.trim());
    setRecCodigo('');
    setRecNueva('');
    setRecDestino('');
    setReenvio(0);
    setModal('recuperar');
  }

  function cerrarRecuperar() {
    setModal(null);
    setPaso(1);
    setRecCodigo('');
    setRecNueva('');
    setRecForm({ secret: '', username: '', password: '' });
  }

  // Descripcion accesible del estado de la base de datos para el punto.
  const estadoTitulo =
    estadoBd === null
      ? 'Conectando a la base de datos...'
      : estadoBd
        ? `Base de datos conectada (${cuentasAdmin.length} cuenta${
            cuentasAdmin.length !== 1 ? 's' : ''
          } de administrador)`
        : 'Base de datos no disponible';

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
          <p className="login-sub">Portal de Administración</p>
          <span
            className={`login-punto ${
              estadoBd === null ? 'gris' : estadoBd ? 'verde' : 'rojo'
            }`}
            title={estadoTitulo}
            aria-label={estadoTitulo}
          />
        </div>

        <form onSubmit={iniciar} className="login-form">
          <div className="campo">
            <label htmlFor="login-user">Usuario o correo</label>
            <input
              id="login-user"
              value={loginForm.username}
              onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="username"
              autoFocus
              placeholder="admin@ues.gob.sv"
            />
          </div>
          <div className="campo">
            <label htmlFor="login-pass">Contraseña</label>
            <input
              id="login-pass"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
            {trabajando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
          <button
            type="button"
            className="login-enlace login-enlace-centro"
            onClick={abrirRecuperar}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </form>

        <div className="login-pie">
          <button type="button" className="login-enlace login-pie-crear" onClick={() => setModal('crear')}>
            Crear administrador
          </button>
          <Link to="/checador" className="login-volver">
            &#8592; Regresar al checador
          </Link>
        </div>
      </div>

      {/* Modal: recuperar contrasena (correo = principal, clave = segunda opcion) */}
      {modal === 'recuperar' && (
        <Modal
          titulo="Recuperar contraseña"
          onClose={cerrarRecuperar}
          mostrarLogo
          subtitulo={
            pestana === 'correo' && paso === 2
              ? 'Ingrese el código que le enviamos a su correo'
              : undefined
          }
        >
          {/* Pestanas: principal por correo, secundaria con clave secreta */}
          <div className="rec-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={pestana === 'correo'}
              className={`rec-tab ${pestana === 'correo' ? 'activa' : ''}`}
              onClick={() => {
                setPestana('correo');
                setPaso(1);
              }}
            >
              Enviar código al correo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pestana === 'secreta'}
              className={`rec-tab ${pestana === 'secreta' ? 'activa' : ''}`}
              onClick={() => setPestana('secreta')}
            >
              Usar clave secreta
            </button>
          </div>

          {pestana === 'correo' && paso === 1 && (
            <form onSubmit={enviarCodigo} className="login-form">
              {correoDisponible === false && (
                <p className="rec-aviso">
                  El envío de códigos por correo no está configurado en el
                  servidor. Use la pestaña <b>Usar clave secreta</b>.
                </p>
              )}
              <p className="rec-ayuda">
                Escriba su usuario y le enviaremos un código de verificación a
                su correo registrado para crear una contraseña nueva.
              </p>
              <div className="campo">
                <label htmlFor="rec-user">Usuario o correo</label>
                <input
                  id="rec-user"
                  value={recUsuario}
                  onChange={(e) => setRecUsuario(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="admin@ues.gob.sv"
                />
              </div>
              <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
                {trabajando ? 'Enviando...' : 'Enviar código'}
              </button>
            </form>
          )}

          {pestana === 'correo' && paso === 2 && (
            <form onSubmit={verificarCodigo} className="login-form">
              <p className="rec-aviso">
                Código enviado{recDestino ? <> a <b>{recDestino}</b></> : ''}. Revise su
                carpeta de spam si no lo encuentra.
              </p>
              <div className="campo">
                <label htmlFor="rec-codigo">Código de 6 dígitos</label>
                <input
                  id="rec-codigo"
                  className="rec-codigo"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={recCodigo}
                  onChange={(e) => setRecCodigo(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                />
              </div>
              <div className="campo">
                <label htmlFor="rec-nueva">Nueva contraseña</label>
                <input
                  id="rec-nueva"
                  type="password"
                  value={recNueva}
                  onChange={(e) => setRecNueva(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 4 caracteres"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primario btn-login"
                disabled={trabajando || recCodigo.length !== 6 || recNueva.length < 4}
              >
                {trabajando ? 'Verificando...' : 'Restablecer contraseña'}
              </button>
              <div className="rec-acciones">
                <button
                  type="button"
                  className="login-enlace"
                  onClick={reenviarCodigo}
                  disabled={reenvio > 0 || trabajando}
                >
                  {reenvio > 0 ? `Reenviar código (${reenvio}s)` : 'Reenviar código'}
                </button>
                <button
                  type="button"
                  className="login-enlace"
                  onClick={() => setPaso(1)}
                  disabled={trabajando}
                >
                  Cambiar usuario
                </button>
              </div>
            </form>
          )}

          {pestana === 'secreta' && (
            <form onSubmit={restablecer} className="login-form">
              <p className="rec-ayuda">
                Segunda opción: si tiene a la mano la clave secreta de
                administración puede restablecer la contraseña sin código.
              </p>
              <div className="campo">
                <label htmlFor="rec-secret">Clave secreta</label>
                <input
                  id="rec-secret"
                  type="password"
                  value={recForm.secret}
                  onChange={(e) => setRecForm((f) => ({ ...f, secret: e.target.value }))}
                  placeholder="Clave de administración"
                />
              </div>
              <div className="campo">
                <label htmlFor="rec-sec-user">Usuario</label>
                <input
                  id="rec-sec-user"
                  value={recForm.username}
                  onChange={(e) => setRecForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div className="campo">
                <label htmlFor="rec-sec-pass">Nueva contraseña</label>
                <input
                  id="rec-sec-pass"
                  type="password"
                  value={recForm.password}
                  onChange={(e) => setRecForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primario btn-login" disabled={trabajando}>
                {trabajando ? 'Procesando...' : 'Restablecer contraseña'}
              </button>
            </form>
          )}
        </Modal>
      )}

      {/* Modal: crear administrador con clave secreta */}
      {modal === 'crear' && (
        <Modal titulo="Crear administrador" onClose={() => setModal(null)} mostrarLogo>
          <form onSubmit={crearAdmin} className="login-form">
            <p className="rec-ayuda">
              Requiere la clave secreta de administración.
            </p>
            <div className="campo">
              <label>Clave secreta</label>
              <input
                type="password"
                value={secForm.secret}
                onChange={(e) => setSecForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Clave de administración"
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
              <label>Contraseña</label>
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
