import { useCallback, useEffect, useState } from 'react';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import ModalPDF from './ModalPDF.jsx';
import TarjetaEmergencia from './TarjetaEmergencia.jsx';
import {
  getSettings,
  updateSettings,
  uploadPdf,
  estadoClaveSecreta,
  cambiarClaveSecreta
} from '../services/api.js';

/** Etiquetas legibles de los PDFs institucionales, para menus y confirmaciones. */
const ETIQUETAS_PDF = {
  reglamento_pdf: 'Reglamento',
  horarios_pdf: 'Horarios'
};

/**
 * Campos de cada grupo. El backend guarda pares { clave: valor } como texto, asi
 * que cualquier ajuste nuevo solo necesita declararse aqui para poder escribirse.
 */
const GRUPOS = [
  {
    clave: 'textos',
    titulo: 'Textos: Reglamento y Horarios',
    descripcion: 'Los textos que el checador y el chatbot muestran a los miembros.',
    campos: [
      { id: 'reglamento', etiqueta: 'Reglamento', tipo: 'textarea', filas: 6 },
      { id: 'horarios', etiqueta: 'Horarios', tipo: 'textarea', filas: 5 }
    ]
  },
  {
    clave: 'contacto',
    titulo: 'Contacto institucional',
    descripcion: 'Aparece al pie de la ficha técnica en PDF y sirve de referencia para el personal.',
    campos: [
      { id: 'contacto_nombre', etiqueta: 'Nombre de la unidad', placeholder: 'Gimnasio Universitario UES' },
      { id: 'contacto_telefono', etiqueta: 'Teléfono', tipo: 'tel', placeholder: '662 123 4567' },
      { id: 'contacto_correo', etiqueta: 'Correo electrónico', tipo: 'email', placeholder: 'gimnasio@ues.mx' },
      { id: 'contacto_horario_atencion', etiqueta: 'Horario de atención', placeholder: 'Lunes a viernes de 6:00 a 20:00' },
      { id: 'contacto_direccion', etiqueta: 'Dirección', contenedor: 'ancho', placeholder: 'Blvd. ... No. ..., Hermosillo, Sonora' }
    ]
  },
  {
    clave: 'emergencia',
    titulo: 'Emergencias',
    descripcion: 'Se muestra en la tarjeta de emergencia de cada persona y en la ficha en PDF.',
    campos: [
      { id: 'emergencia_telefono', etiqueta: 'Teléfono de emergencias (por defecto 911)', tipo: 'tel', placeholder: '911' },
      { id: 'emergencia_instrucciones', etiqueta: 'Instrucciones', tipo: 'textarea', filas: 4, contenedor: 'ancho', placeholder: 'Avise al personal de la entrada, mantenga despejada la salida más cercana...' }
    ]
  },
  {
    clave: 'mensajeria',
    titulo: 'Mensajería: WhatsApp y correo',
    descripcion:
      'El gym no usa ningún proveedor de mensajería: al darle clic al botón de WhatsApp o de correo en la ficha de una persona, se abre la aplicación del administrador con el texto ya escrito. El prefijo es lo que se antepone a cada mensaje para que el contacto de emergencia sepa quién le escribe. No se guarda ninguna copia de los mensajes.',
    campos: [
      {
        id: 'whatsapp_prefijo',
        etiqueta: 'Prefijo de los mensajes de WhatsApp',
        tipo: 'textarea',
        filas: 3,
        contenedor: 'ancho',
        placeholder:
          'Gimnasio Universitario UES: le escribimos desde el gimnasio. Por favor confirme que pudo leer este mensaje.'
      },
      {
        id: 'correo_prefijo',
        etiqueta: 'Asunto por defecto del correo',
        contenedor: 'ancho',
        placeholder: 'Aviso del Gimnasio Universitario UES'
      }
    ]
  },
  {
    clave: 'aviso',
    titulo: 'Aviso general y aforo',
    descripcion: 'El aviso se muestra como cinta en el checador; el aforo aparece junto a los contadores.',
    campos: [
      { id: 'aviso_activo', etiqueta: 'Mostrar el aviso en el checador', tipo: 'booleano' },
      { id: 'aviso_general', etiqueta: 'Aviso', tipo: 'textarea', filas: 3, contenedor: 'ancho', placeholder: 'Mantener despejada la zona de pesas el viernes por mantenimiento.' },
      { id: 'aforo_maximo', etiqueta: 'Aforo máximo de usuarios simultáneos', tipo: 'numero', min: 0, max: 9999, placeholder: 'Ej. 80' }
    ]
  }
];

/** Reúne los campos de un grupo en el objeto { clave: valor } que espera el backend. */
function valoresDelGrupo(config, grupo) {
  const salida = {};
  for (const campo of grupo.campos) {
    const bruto = config[campo.id];
    salida[campo.id] = campo.tipo === 'booleano' ? (bruto === 'Sí' ? 'No' : 'Sí') : String(bruto ?? '').trim();
  }
  return salida;
}

/** Un grupo tiene cambios sin guardar respecto a lo que se cargo del servidor. */
function grupoSucio(original, config, grupo) {
  return grupo.campos.some((campo) => (config[campo.id] ?? '') !== (original[campo.id] ?? ''));
}

/**
 * ConfiguracionAvisos - Pestaña "Configuracion y Avisos" del panel admin.
 * Cada grupo se guarda por separado con PUT /api/settings, que restringe la
 * escritura a super_admin / admin y refresca la cache de lectura al instante.
 *
 * `soloSeguridad` la reduce a la seccion "Seguridad del portal" (clave
 * secreta), que es lo unico que puede ver el rol administrador_gym.
 */
export default function ConfiguracionAvisos({ soloSeguridad = false }) {
  const [config, setConfig] = useState({});
  const [original, setOriginal] = useState({});
  const [pdf, setPdf] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const { mensaje, mostrar } = useMensaje();

  // ---- Seguridad del portal (clave secreta) ----
  const [segEstado, setSegEstado] = useState(null); // { personalizada, correo }
  const [segClave, setSegClave] = useState({ actual: '', nueva: '', confirmar: '' });
  const [segGuardando, setSegGuardando] = useState(false);

  useEffect(() => {
    estadoClaveSecreta()
      .then(setSegEstado)
      .catch(() => setSegEstado({ personalizada: false, correo: false }));
  }, []);

  useEffect(() => {
    if (soloSeguridad) return undefined;
    getSettings()
      .then((s) => {
        const limpio = s && typeof s === 'object' ? s : {};
        setConfig(limpio);
        setOriginal(limpio);
      })
      .catch(() => mostrar('No se pudo cargar la configuración.', 'error'));
    return undefined;
  }, [soloSeguridad]);

  const guardarClaveSecreta = async () => {
    if (segGuardando) return;
    const { actual, nueva, confirmar } = segClave;
    if (!actual || !nueva || !confirmar) {
      mostrar('Complete los tres campos de la clave secreta.', 'error');
      return;
    }
    if (nueva.length < 8) {
      mostrar('La nueva clave debe tener al menos 8 caracteres.', 'error');
      return;
    }
    if (nueva !== confirmar) {
      mostrar('La confirmacion no coincide con la nueva clave.', 'error');
      return;
    }
    if (!window.confirm('¿Cambiar la clave secreta del portal? La anterior deja de funcionar.')) {
      return;
    }
    setSegGuardando(true);
    try {
      const res = await cambiarClaveSecreta({ actual, nueva });
      mostrar(res.mensaje, 'exito');
      setSegClave({ actual: '', nueva: '', confirmar: '' });
      setSegEstado((e) => ({ ...e, personalizada: true }));
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setSegGuardando(false);
    }
  };

  const cambiar = useCallback((id, valor) => setConfig((c) => ({ ...c, [id]: valor })), []);

  /** Validaciones por tipo antes de tocar Atlas, para no guardar basura. */
  function validar(grupo, valores) {
    for (const campo of grupo.campos) {
      const v = valores[campo.id];
      if (campo.tipo === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return `El correo de "${campo.etiqueta}" no es válido.`;
      }
      if (campo.tipo === 'tel' && v && !/^[\d\s()+-]{7,25}$/.test(v)) {
        return `El teléfono de "${campo.etiqueta}" solo admite números.`;
      }
      if (campo.tipo === 'numero' && v) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < campo.min || n > campo.max) {
          return `"${campo.etiqueta}" debe ser un número entero entre ${campo.min} y ${campo.max}.`;
        }
      }
    }
    return null;
  }

  const guardarGrupo = async (grupo) => {
    if (guardando) return;
    const valores = valoresDelGrupo(config, grupo);
    const problema = validar(grupo, valores);
    if (problema) {
      mostrar(problema, 'error');
      return;
    }
    if (!window.confirm(`¿Guardar los cambios de "${grupo.titulo}"?`)) return;
    setGuardando(grupo.clave);
    try {
      await updateSettings(valores);
      setOriginal((o) => ({ ...o, ...valores }));
      setConfig((c) => ({ ...c, ...valores }));
      mostrar(`${grupo.titulo} guardado.`, 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    } finally {
      setGuardando(null);
    }
  };

  const subirPdf = async (clave, file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || '')) {
      mostrar('El archivo debe ser un PDF.', 'error');
      return;
    }
    const nombre = ETIQUETAS_PDF[clave];
    if (!window.confirm(`¿Subir este archivo como "${nombre}"?`)) return;
    try {
      const res = await uploadPdf(file);
      await updateSettings({ [clave]: res.url });
      setConfig((c) => ({ ...c, [clave]: res.url }));
      setOriginal((c) => ({ ...c, [clave]: res.url }));
      mostrar('PDF subido y enlazado correctamente.', 'exito');
    } catch (err) {
      mostrar(err.message, 'error');
    }
  };

  const verPdf = (clave) => {
    const url = config[clave];
    if (!url) {
      mostrar(`Aun no hay un PDF de "${ETIQUETAS_PDF[clave].toLowerCase()}".`, 'info');
      return;
    }
    setPdf({ url, titulo: ETIQUETAS_PDF[clave] });
  };

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Configuración y Avisos</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            {soloSeguridad
              ? 'Seguridad del portal: clave secreta de administración.'
              : 'Solo super_admin / admin pueden modificar la información institucional.'}
          </p>
        </div>
      </div>

      {/* ---- Seguridad del portal: clave secreta ---- */}
      <div className="panel">
        <h3>Seguridad del portal</h3>
        <p className="config-descripcion">
          La clave secreta se usa como segunda opcion para restablecer
          contrasenas y para crear administradores. Se guarda cifrada y solo
          la conocen los administradores autorizados.
        </p>
        <div className="seg-estado">
          <span className={`chip ${segEstado?.personalizada ? 'chip-ok' : 'chip-info'}`}>
            {segEstado === null
              ? 'Verificando...'
              : segEstado.personalizada
                ? 'Clave secreta personalizada (guardada en la BD)'
                : 'Clave secreta del archivo .env o por defecto'}
          </span>
          <span className={`chip ${segEstado?.correo ? 'chip-ok' : 'chip-aviso'}`}>
            {segEstado === null
              ? 'Verificando...'
              : segEstado.correo
                ? 'Recuperacion por correo activa'
                : 'Recuperacion por correo no configurada'}
          </span>
        </div>
        <div className="fila-form">
          <div className="campo">
            <label>Clave secreta actual</label>
            <input
              type="password"
              value={segClave.actual}
              onChange={(e) => setSegClave((c) => ({ ...c, actual: e.target.value }))}
              autoComplete="off"
            />
          </div>
          <div className="campo">
            <label>Nueva clave secreta (min. 8)</label>
            <input
              type="password"
              value={segClave.nueva}
              onChange={(e) => setSegClave((c) => ({ ...c, nueva: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="campo">
            <label>Confirmar nueva clave</label>
            <input
              type="password"
              value={segClave.confirmar}
              onChange={(e) => setSegClave((c) => ({ ...c, confirmar: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="fila-acciones">
          <button
            className="btn btn-primario"
            onClick={guardarClaveSecreta}
            disabled={segGuardando}
          >
            {segGuardando ? 'Guardando...' : 'Cambiar clave secreta'}
          </button>
        </div>
      </div>

      {!soloSeguridad && GRUPOS.map((grupo) => (
        <div className="panel" key={grupo.clave}>
          <h3>{grupo.titulo}</h3>
          <p className="config-descripcion">{grupo.descripcion}</p>
          <div className={grupo.clave === 'textos' ? '' : 'fila-form'}>
            {grupo.campos.map((campo) => (
              <div
                className="campo"
                key={campo.id}
                style={campo.contenedor === 'ancho' ? { flexBasis: '100%' } : undefined}
              >
                <label>{campo.etiqueta}</label>
                {campo.tipo === 'booleano' ? (
                  <label className="config-check">
                    <input
                      type="checkbox"
                      checked={config[campo.id] === 'Sí'}
                      onChange={(e) => cambiar(campo.id, e.target.checked ? 'Sí' : 'No')}
                    />
                    <span>{config[campo.id] === 'Sí' ? 'Visible en el checador' : 'Oculto'}</span>
                  </label>
                ) : campo.tipo === 'textarea' ? (
                  <textarea
                    rows={campo.filas || 4}
                    value={config[campo.id] || ''}
                    placeholder={campo.placeholder}
                    onChange={(e) => cambiar(campo.id, e.target.value)}
                  />
                ) : (
                  <input
                    type={campo.tipo || 'text'}
                    min={campo.min}
                    max={campo.max}
                    value={config[campo.id] || ''}
                    placeholder={campo.placeholder}
                    onChange={(e) => cambiar(campo.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="fila-acciones">
            <button
              className="btn btn-primario"
              onClick={() => guardarGrupo(grupo)}
              disabled={guardando === grupo.clave || (!!guardando && guardando !== grupo.clave)}
            >
              {guardando === grupo.clave ? 'Guardando...' : 'Guardar'}
            </button>
            {grupoSucio(original, config, grupo) && guardando !== grupo.clave && (
              <span className="config-sin-guardar">Tienes cambios sin guardar</span>
            )}
          </div>
        </div>
      ))}

      {/* PDFs institucionales */}
      {!soloSeguridad && (
      <div className="panel">
        <h3>Documentos PDF</h3>
        <p className="config-descripcion">
          Se muestran como botones "Reglamento" y "Horarios" dentro del checador.
        </p>
        <div className="fila-form">
          {['reglamento_pdf', 'horarios_pdf'].map((clave) => (
            <div className="campo" key={clave}>
              <label>{ETIQUETAS_PDF[clave]}</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) subirPdf(clave, file);
                }}
              />
              {config[clave] ? (
                <button className="btn btn-secundario" onClick={() => verPdf(clave)}>
                  Ver PDF actual
                </button>
              ) : (
                <span className="config-vacio">Sin PDF cargado</span>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Vista previa de como vera el personal la tarjeta de emergencia */}
      {!soloSeguridad && (
      <div className="panel">
        <h3>Vista previa de la tarjeta de emergencia</h3>
        <p className="config-descripcion">
          Así se verá al abrir una ficha técnica, con los valores guardados ahora.
        </p>
        <TarjetaEmergencia
          institucional={{
            telefono: config.emergencia_telefono || '',
            instrucciones: config.emergencia_instrucciones || '',
            nombre: config.contacto_nombre || '',
            telefonoInstitucion: config.contacto_telefono || ''
          }}
        />
      </div>
      )}

      {!soloSeguridad && pdf && <ModalPDF titulo={pdf.titulo} url={pdf.url} onClose={() => setPdf(null)} />}
      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}