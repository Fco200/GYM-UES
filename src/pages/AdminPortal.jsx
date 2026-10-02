import { useEffect, useState } from 'react';
import HeaderAdmin from '../components/HeaderAdmin.jsx';
import FormLogin from '../components/FormLogin.jsx';
import GestionAlumnos from '../components/GestionAlumnos.jsx';
import PanelResumen from '../components/PanelResumen.jsx';
import ConfiguracionAvisos from '../components/ConfiguracionAvisos.jsx';
import GestionUsuarios from '../components/GestionUsuarios.jsx';
import Asistencia from './Asistencia.jsx';
import OverlayMensaje, { useMensaje } from '../components/OverlayMensaje.jsx';
import {
  login,
  logout,
  guardarSesion,
  cerrarSesionLocal,
  estadoAuth,
  restablecerPasswordPublico,
  crearAdminPrueba
} from '../services/api.js';
import {
  puedeConfiguracion,
  puedeGestionarUsuarios,
  etiquetaRol
} from '../services/roles.js';

// Orden pensado para el flujo de trabajo del administrador: primero el resumen
// de como viene el dia, despues el directorio, el historial, las cuentas y al
// final la configuracion institucional.
const PESTANAS = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'alumnos', etiqueta: 'Directorio de Personas' },
  { id: 'asistencia', etiqueta: 'Historial de Asistencias' },
  { id: 'usuarios', etiqueta: 'Cuentas del Sistema' },
  { id: 'config', etiqueta: 'Configuracion y Avisos' }
];

export default function AdminPortal() {
  const [autenticado, setAutenticado] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState('resumen');
  const [estadoBd, setEstadoBd] = useState(null);
  const [cuentasAdmin, setCuentasAdmin] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  const { mensaje, mostrar } = useMensaje();

  const rolActual = usuario?.role;
  const esAdmin = puedeConfiguracion(rolActual);
  const esSuperAdmin = puedeGestionarUsuarios(rolActual);
  const pestanasVisibles = PESTANAS.filter(
    (p) =>
      (p.id !== 'config' || esAdmin) && (p.id !== 'usuarios' || esSuperAdmin)
  );

  useEffect(() => {
    // Siempre se muestra el login (no se restaura la sesion automaticamente).
    setCargando(false);
    estadoAuth()
      .then((res) => {
        setEstadoBd(Boolean(res.db));
        setCuentasAdmin(Array.isArray(res.cuentas) ? res.cuentas : []);
      })
      .catch(() => {
        setEstadoBd(false);
        setCuentasAdmin([]);
      });
  }, []);

  const iniciar = async (username, password) => {
    // Login directo: sin preguntas de confirmacion ni alertas que retrasen la
    // entrada. Solo muestra error si las credenciales son incorrectas.
    try {
      const res = await login(username, password);
      guardarSesion(res.token, res.usuario);
      setUsuario(res.usuario || null);
      setAutenticado(true);
      setPestana('resumen');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const restablecer = async (recForm) => {
    setTrabajando(true);
    try {
      const res = await restablecerPasswordPublico(recForm);
      mostrar(res.mensaje, 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setTrabajando(false);
    }
  };

  const crearAdmin = async (secForm) => {
    setTrabajando(true);
    try {
      const res = await crearAdminPrueba(secForm);
      mostrar(res.mensaje, 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setTrabajando(false);
    }
  };

  // Cierre de sesion: unica accion del portal que conserva la pregunta de
  // confirmacion (dialogo limpio y rapido). La confirma o la cancela el usuario.
  const confirmarSalida = async () => {
    try {
      await logout();
    } catch {
      /* sin conexion */
    }
    cerrarSesionLocal();
    setUsuario(null);
    setAutenticado(false);
    setConfirmandoSalir(false);
    setPestana('resumen');
  };

  if (cargando) {
    return <p className="texto-centrado">Cargando portal...</p>;
  }

  // ---------- FormLogin (tarjeta unificada + modales) ----------
  if (!autenticado) {
    return (
      <>
        <FormLogin
          estadoBd={estadoBd}
          cuentasAdmin={cuentasAdmin}
          trabajando={trabajando}
          onLogin={iniciar}
          onRestablecer={restablecer}
          onCrearAdmin={crearAdmin}
        />
        <OverlayMensaje mensaje={mensaje} />
      </>
    );
  }

  // ---------- FormAdmin (dashboard con tabs) ----------
  return (
    <div className="admin-dashboard">
      <HeaderAdmin usuario={usuario} onSalir={() => setConfirmandoSalir(true)} />

      {!esSuperAdmin && rolActual && rolActual !== 'super_admin' && (
        <div className="aviso-info aviso-restriccion">
          Modo restringido ({etiquetaRol(rolActual)}): solo ve lo permitido por su
          rol. La configuracion institucional es de super_admin / admin.
        </div>
      )}

      <div className="admin-tabs panel">
        {pestanasVisibles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`admin-tab ${pestana === p.id ? 'activa' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && <PanelResumen onIrAlDirectorio={() => setPestana('alumnos')} />}
      {pestana === 'alumnos' && <GestionAlumnos />}
      {pestana === 'asistencia' && <Asistencia embedded />}
      {pestana === 'usuarios' && esSuperAdmin && <GestionUsuarios />}
      {pestana === 'config' && esAdmin && <ConfiguracionAvisos />}

      {confirmandoSalir && (
        <div className="modal-fondo" onClick={() => setConfirmandoSalir(false)}>
          <div className="modal-caja modal-confirmar" onClick={(e) => e.stopPropagation()}>
            <h2>Cerrar sesión</h2>
            <p className="modal-confirmar-texto">
              ¿Desea cerrar la sesión de <b>{usuario?.username || 'este usuario'}</b> y salir
              del panel de administración?
            </p>
            <div className="modal-confirmar-botones">
              <button type="button" className="btn btn-primario" onClick={confirmarSalida}>
                Sí, cerrar sesión
              </button>
              <button
                type="button"
                className="btn btn-secundario"
                onClick={() => setConfirmandoSalir(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}