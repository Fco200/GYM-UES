import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { expedienteExiste, registroPublico, uploadArchivo } from '../services/api.js';

/**
 * Autoregistro publico de alumnos del Gimnasio UES.
 *
 * El alumno captura su expediente y sus datos personales; el expediente se
 * convierte en su clave de acceso al checador. El registro se guarda en la
 * misma coleccion `alumnos` que usa el panel administrativo, de modo que el
 * encargado lo ve exactamente como si lo hubiera dado de alta desde el portal.
 *
 * La foto y el certificado son OPCIONALES. Se suben a GridFS con el mismo
 * endpoint que usa el panel antes de crear el registro.
 */

// Ejemplos locales para la comprobacion inmediata de "expediente unico" (la
// validacion real la hace el servidor contra MongoDB). Se comparan ya
// normalizados en mayusculas.
const EXPEDIENTES_EJEMPLO = ['A123456', '20240001', 'UES2024', 'EXP001', 'ALUMNO1'];

const RE_EXPEDIENTE = /^[A-Z0-9]{4,20}$/;
const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_TELEFONO = /^\+?[\d\s().-]{6,24}$/;
const MAX_ARCHIVO = 20 * 1024 * 1024;

const VACIO = {
  expediente: '',
  nombre: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  correo: '',
  telefono: '',
  foto: null,
  certificado: null
};

function normalizarExpediente(valor) {
  return String(valor || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 20);
}

function validarExpediente(valor) {
  if (!valor) return 'Ingresa tu número de expediente.';
  if (!RE_EXPEDIENTE.test(valor)) {
    return 'Usa de 4 a 20 letras o números, sin espacios ni símbolos.';
  }
  if (EXPEDIENTES_EJEMPLO.includes(valor)) {
    return 'Este expediente ya está registrado.';
  }
  return '';
}

function validarNombre(valor, etiqueta) {
  const limpio = String(valor || '').trim();
  if (!limpio) return `Ingresa tu ${etiqueta}.`;
  if (limpio.length < 2 || !RE_NOMBRE.test(limpio)) {
    return `El ${etiqueta} solo debe contener letras y espacios.`;
  }
  return '';
}

function validarCorreo(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return 'Ingresa tu correo electrónico.';
  if (!RE_CORREO.test(limpio)) return 'Escribe un correo electrónico válido.';
  return '';
}

function validarTelefono(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return 'Ingresa tu teléfono.';
  if (!RE_TELEFONO.test(limpio)) return 'Usa solo números, espacios, guiones o paréntesis.';
  const digitos = limpio.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 15) {
    return 'El teléfono debe tener entre 7 y 15 dígitos.';
  }
  return '';
}

function tamanoLegible(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AutoregistroAlumno() {
  const [form, setForm] = useState(VACIO);
  const [tocado, setTocado] = useState({});
  const [estadoExpediente, setEstadoExpediente] = useState('');
  const [errorExpediente, setErrorExpediente] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [errorArchivos, setErrorArchivos] = useState('');
  const [fotoPreview, setFotoPreview] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const setCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  // La vista previa vive en un blob: se libera cuando cambia o se desmonta la
  // pagina para no dejar memoria colgada en telefonos.
  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  // Verificacion en tiempo real del expediente: primero el formato y el array
  // de ejemplos, y despues la consulta publica a la base de datos (con un
  // pequeno retardo para no lanzar una peticion por cada tecla).
  useEffect(() => {
    const valor = form.expediente.trim();
    if (!valor) {
      setErrorExpediente('');
      setEstadoExpediente('');
      return undefined;
    }

    const base = validarExpediente(valor);
    if (base) {
      setErrorExpediente(base);
      setEstadoExpediente(EXPEDIENTES_EJEMPLO.includes(valor) ? 'ocupado' : '');
      return undefined;
    }

    setErrorExpediente('');
    setEstadoExpediente('verificando');
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      try {
        const res = await expedienteExiste(valor);
        if (cancelado) return;
        if (res?.existe) {
          setErrorExpediente('Este expediente ya está registrado.');
          setEstadoExpediente('ocupado');
        } else {
          setEstadoExpediente('disponible');
        }
      } catch {
        // Sin red no se puede confirmar, pero tampoco se bloquea el registro:
        // el servidor volvera a comprobarlo al guardar.
        if (!cancelado) setEstadoExpediente('sin-verificar');
      }
    }, 450);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [form.expediente]);

  const errores = useMemo(
    () => ({
      expediente: validarExpediente(form.expediente),
      nombre: validarNombre(form.nombre, 'nombre'),
      apellidoPaterno: validarNombre(form.apellidoPaterno, 'apellido paterno'),
      apellidoMaterno: validarNombre(form.apellidoMaterno, 'apellido materno'),
      correo: validarCorreo(form.correo),
      telefono: validarTelefono(form.telefono)
    }),
    [form.expediente, form.nombre, form.apellidoPaterno, form.apellidoMaterno, form.correo, form.telefono]
  );

  const formularioValido =
    Object.values(errores).every((e) => !e) &&
    estadoExpediente !== 'verificando' &&
    estadoExpediente !== 'ocupado';

  const puedeEnviar = formularioValido && !enviando;

  // Los errores se muestran debajo de cada campo: el del expediente en cuanto
  // hay algo escrito y los demas cuando la persona sale del campo.
  const errorVisible = (campo) => {
    if (campo === 'expediente') {
      if (!errorExpediente) return '';
      return tocado.expediente || form.expediente ? errorExpediente : '';
    }
    return tocado[campo] ? errores[campo] : '';
  };

  const marcarTocado = (campo) => setTocado((t) => ({ ...t, [campo]: true }));

  const manejarFoto = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/\.(jpe?g|png)$/i.test(archivo.name) || (archivo.type && !/^image\/(jpeg|png)$/i.test(archivo.type))) {
      setErrorArchivos('La fotografía debe ser un archivo JPG o PNG.');
      return;
    }
    if (archivo.size > MAX_ARCHIVO) {
      setErrorArchivos('La fotografía no debe superar los 20 MB.');
      return;
    }
    setErrorArchivos('');
    setCampo('foto', archivo);
    setFotoPreview(URL.createObjectURL(archivo));
  };

  const manejarCertificado = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/\.pdf$/i.test(archivo.name) || (archivo.type && archivo.type !== 'application/pdf')) {
      setErrorArchivos('El certificado debe ser un archivo PDF.');
      return;
    }
    if (archivo.size > MAX_ARCHIVO) {
      setErrorArchivos('El certificado no debe superar los 20 MB.');
      return;
    }
    setErrorArchivos('');
    setCampo('certificado', archivo);
  };

  const quitarFoto = () => {
    setCampo('foto', null);
    setFotoPreview('');
  };

  const enviar = async (e) => {
    e.preventDefault();
    setTocado({
      expediente: true,
      nombre: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      correo: true,
      telefono: true
    });
    setErrorGeneral('');

    if (!formularioValido) {
      if (estadoExpediente === 'verificando') {
        setErrorGeneral('Espera un momento mientras verificamos tu expediente.');
      } else {
        setErrorGeneral('Revisa los campos marcados con * para continuar.');
      }
      return;
    }
    if (enviando) return;

    setEnviando(true);
    try {
      // Foto opcional: se sube primero y se guarda la URL en el registro.
      let fotoUrl = '';
      if (form.foto) {
        const subida = await uploadArchivo(form.foto);
        fotoUrl = subida.url || '';
      }

      // Certificado opcional (PDF). El modelo guarda 'No' cuando no hay.
      let certificadoUrl = 'No';
      if (form.certificado) {
        const subida = await uploadArchivo(form.certificado);
        certificadoUrl = subida.url || 'Si';
      }

      const res = await registroPublico({
        type: 'alumno',
        student_code: form.expediente,
        full_name: form.nombre.trim(),
        second_name: form.apellidoPaterno.trim(),
        last_name: form.apellidoMaterno.trim(),
        email: form.correo.trim(),
        phone: form.telefono.trim(),
        image_url: fotoUrl,
        medical_certificate: certificadoUrl
      });

      setResultado(res?.estudiante || { student_code: form.expediente });
    } catch (err) {
      const mensaje = err?.message || 'No se pudo completar el registro.';
      if (/ya est[áa] registrad/i.test(mensaje)) {
        setErrorExpediente('Este expediente ya está registrado.');
        setEstadoExpediente('ocupado');
        setTocado((t) => ({ ...t, expediente: true }));
      }
      setErrorGeneral(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setForm(VACIO);
    setTocado({});
    setEstadoExpediente('');
    setErrorExpediente('');
    setErrorGeneral('');
    setErrorArchivos('');
    setFotoPreview('');
    setResultado(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---------- Pantalla de confirmacion ----------
  if (resultado) {
    const nombre = [resultado.full_name, resultado.second_name, resultado.last_name]
      .filter(Boolean)
      .join(' ');
    const clave = resultado.student_code || form.expediente;

    return (
      <div className="autoregistro">
        <div className="auto-tarjeta auto-exito" role="status" aria-live="polite">
          <div className="auto-exito-icono" aria-hidden="true">
            {'\u2713'}
          </div>
          <h1 className="auto-titulo">Registro exitoso</h1>
          <p className="auto-exito-texto">
            Registro exitoso. Tu clave de acceso es tu número de expediente.
          </p>

          <div className="auto-clave-caja">
            <span className="auto-clave-etiqueta">Tu clave de acceso al checador</span>
            <strong className="auto-clave">{clave}</strong>
          </div>

          <dl className="auto-resumen">
            {fotoPreview && (
              <div className="auto-resumen-foto">
                <img src={fotoPreview} alt="Fotografía del alumno" />
              </div>
            )}
            <div>
              <dt>Nombre</dt>
              <dd>{nombre || '—'}</dd>
            </div>
            <div>
              <dt>Correo electrónico</dt>
              <dd>{resultado.email || form.correo || '—'}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{resultado.phone || form.telefono || '—'}</dd>
            </div>
            <div>
              <dt>Certificado</dt>
              <dd>{form.certificado ? 'PDF adjunto' : 'Sin adjuntar'}</dd>
            </div>
          </dl>

          <p className="auto-exito-nota">
            Guarda tu expediente: lo necesitarás cada vez que marques entrada o
            salida en el gimnasio.
          </p>

          <div className="auto-exito-acciones">
            <Link to="/checador" className="btn btn-primario">
              Ir al checador
            </Link>
            <button type="button" className="btn btn-secundario" onClick={reiniciar}>
              Registrar otro alumno
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Formulario ----------
  return (
    <div className="autoregistro">
      <header className="auto-cabecera">
        <img
          src="img/logo_ues.png"
          alt="Logo UES"
          className="auto-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div>
          <span className="auto-marca">Gimnasio UES</span>
          <h1 className="auto-titulo">Registro de alumnos</h1>
          <p className="auto-subtitulo">
            Completa tus datos para darte de alta. Tu número de expediente será
            tu clave de acceso al checador.
          </p>
        </div>
      </header>

      <form className="auto-tarjeta auto-form" onSubmit={enviar} noValidate>
        <section className="auto-seccion">
          <h2 className="auto-seccion-titulo">
            <span className="auto-paso">1</span> Tu expediente
          </h2>

          <div className={`auto-campo${errorVisible('expediente') ? ' auto-campo-error' : ''}`}>
            <label htmlFor="auto-expediente">Número de expediente *</label>
            <div
              className={`auto-control${
                estadoExpediente === 'disponible' ? ' auto-control-ok' : ''
              }${estadoExpediente === 'ocupado' ? ' auto-control-mal' : ''}`}
            >
              <input
                id="auto-expediente"
                name="expediente"
                value={form.expediente}
                onChange={(e) => setCampo('expediente', normalizarExpediente(e.target.value))}
                onBlur={() => marcarTocado('expediente')}
                placeholder="Ej. 20240001"
                autoComplete="username"
                autoCapitalize="characters"
                inputMode="text"
                maxLength={20}
                aria-invalid={Boolean(errorVisible('expediente'))}
                aria-describedby="auto-expediente-ayuda"
              />
              {estadoExpediente === 'verificando' && (
                <span className="auto-mini-spinner" aria-label="Verificando expediente" />
              )}
              {estadoExpediente === 'disponible' && (
                <span className="auto-control-icono" aria-hidden="true">
                  {'\u2713'}
                </span>
              )}
            </div>
            <p id="auto-expediente-ayuda" className="auto-ayuda">
              De 4 a 20 letras o números. Lo usarás como clave en el checador.
            </p>
            {errorVisible('expediente') && (
              <p className="auto-error" role="alert">
                {errorVisible('expediente')}
              </p>
            )}
            {estadoExpediente === 'disponible' && !errorVisible('expediente') && (
              <p className="auto-ok" role="status">
                Expediente disponible.
              </p>
            )}
            {estadoExpediente === 'sin-verificar' && !errorVisible('expediente') && (
              <p className="auto-ayuda auto-ayuda-aviso">
                No pudimos verificar en línea; el sistema lo confirmará al guardar.
              </p>
            )}
          </div>
        </section>

        <section className="auto-seccion">
          <h2 className="auto-seccion-titulo">
            <span className="auto-paso">2</span> Datos personales
          </h2>

          <div className="auto-grid">
            <div className={`auto-campo${errorVisible('nombre') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="auto-nombre">Nombre *</label>
              <input
                id="auto-nombre"
                value={form.nombre}
                onChange={(e) => setCampo('nombre', e.target.value)}
                onBlur={() => marcarTocado('nombre')}
                placeholder="Ej. Ana Sofía"
                autoComplete="given-name"
                maxLength={60}
                aria-invalid={Boolean(errorVisible('nombre'))}
              />
              {errorVisible('nombre') && (
                <p className="auto-error" role="alert">{errorVisible('nombre')}</p>
              )}
            </div>

            <div
              className={`auto-campo${
                errorVisible('apellidoPaterno') ? ' auto-campo-error' : ''
              }`}
            >
              <label htmlFor="auto-apellido-paterno">Apellido paterno *</label>
              <input
                id="auto-apellido-paterno"
                value={form.apellidoPaterno}
                onChange={(e) => setCampo('apellidoPaterno', e.target.value)}
                onBlur={() => marcarTocado('apellidoPaterno')}
                placeholder="Ej. García"
                autoComplete="family-name"
                maxLength={60}
                aria-invalid={Boolean(errorVisible('apellidoPaterno'))}
              />
              {errorVisible('apellidoPaterno') && (
                <p className="auto-error" role="alert">{errorVisible('apellidoPaterno')}</p>
              )}
            </div>

            <div
              className={`auto-campo${
                errorVisible('apellidoMaterno') ? ' auto-campo-error' : ''
              }`}
            >
              <label htmlFor="auto-apellido-materno">Apellido materno *</label>
              <input
                id="auto-apellido-materno"
                value={form.apellidoMaterno}
                onChange={(e) => setCampo('apellidoMaterno', e.target.value)}
                onBlur={() => marcarTocado('apellidoMaterno')}
                placeholder="Ej. López"
                maxLength={60}
                aria-invalid={Boolean(errorVisible('apellidoMaterno'))}
              />
              {errorVisible('apellidoMaterno') && (
                <p className="auto-error" role="alert">{errorVisible('apellidoMaterno')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('correo') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="auto-correo">Correo electrónico *</label>
              <input
                id="auto-correo"
                type="email"
                value={form.correo}
                onChange={(e) => setCampo('correo', e.target.value)}
                onBlur={() => marcarTocado('correo')}
                placeholder="nombre@correo.com"
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
                maxLength={120}
                aria-invalid={Boolean(errorVisible('correo'))}
              />
              {errorVisible('correo') && (
                <p className="auto-error" role="alert">{errorVisible('correo')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('telefono') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="auto-telefono">Teléfono *</label>
              <input
                id="auto-telefono"
                type="tel"
                value={form.telefono}
                onChange={(e) => setCampo('telefono', e.target.value)}
                onBlur={() => marcarTocado('telefono')}
                placeholder="Ej. 662 123 4567"
                autoComplete="tel"
                inputMode="tel"
                maxLength={25}
                aria-invalid={Boolean(errorVisible('telefono'))}
              />
              {errorVisible('telefono') && (
                <p className="auto-error" role="alert">{errorVisible('telefono')}</p>
              )}
            </div>
          </div>
        </section>

        <section className="auto-seccion">
          <h2 className="auto-seccion-titulo">
            <span className="auto-paso">3</span> Documentos
            <span className="auto-opcional">Opcional</span>
          </h2>
          <p className="auto-ayuda auto-ayuda-bloque">
            Puedes agregar tu fotografía y tu certificado médico ahora, o
            entregarlos después en el gimnasio.
          </p>

          <div className="auto-archivos">
            <div className="auto-archivo">
              <div className="auto-archivo-info">
                <span className="auto-archivo-ico" aria-hidden="true">{'\uD83D\uDCF7'}</span>
                <div>
                  <strong>Fotografía</strong>
                  <span>JPG o PNG · máximo 20 MB</span>
                </div>
              </div>
              {form.foto ? (
                <div className="auto-archivo-elegido">
                  {fotoPreview && (
                    <img src={fotoPreview} alt="Vista previa de la fotografía" />
                  )}
                  <span>{form.foto.name}</span>
                  <button type="button" className="auto-quitar" onClick={quitarFoto}>
                    Quitar
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="auto-foto" className="auto-file-boton">
                    Subir foto
                  </label>
                  <input
                    id="auto-foto"
                    className="auto-file-input"
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={manejarFoto}
                  />
                </>
              )}
            </div>

            <div className="auto-archivo">
              <div className="auto-archivo-info">
                <span className="auto-archivo-ico" aria-hidden="true">{'\uD83D\uDCC4'}</span>
                <div>
                  <strong>Certificado médico</strong>
                  <span>PDF · máximo 20 MB</span>
                </div>
              </div>
              {form.certificado ? (
                <div className="auto-archivo-elegido">
                  <span>{form.certificado.name} · {tamanoLegible(form.certificado.size)}</span>
                  <button
                    type="button"
                    className="auto-quitar"
                    onClick={() => setCampo('certificado', null)}
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="auto-certificado" className="auto-file-boton">
                    Subir PDF
                  </label>
                  <input
                    id="auto-certificado"
                    className="auto-file-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={manejarCertificado}
                  />
                </>
              )}
            </div>
          </div>

          {errorArchivos && (
            <p className="auto-error" role="alert">{errorArchivos}</p>
          )}
        </section>

        {errorGeneral && (
          <p className="aviso-error auto-error-general" role="alert">
            {errorGeneral}
          </p>
        )}

        <div className="auto-acciones">
          <p className={`auto-estado${puedeEnviar ? ' auto-estado-listo' : ''}`}>
            {enviando
              ? 'Guardando tu registro...'
              : estadoExpediente === 'verificando'
                ? 'Verificando que tu expediente esté disponible...'
                : puedeEnviar
                  ? 'Todo listo. Puedes registrarte.'
                  : 'Completa los campos obligatorios (*) para continuar.'}
          </p>
          <button type="submit" className="btn btn-primario auto-enviar" disabled={!puedeEnviar}>
            {enviando ? 'Guardando...' : 'Registrarme'}
          </button>
        </div>

        <p className="auto-pie">
          Los datos se guardan en el sistema del Gimnasio UES y quedan
          disponibles para el encargado del gimnasio.
        </p>
        <p className="auto-pie">
          ¿Ya estás registrado? <Link to="/checador">Ir al checador</Link>
        </p>
      </form>
    </div>
  );
}
