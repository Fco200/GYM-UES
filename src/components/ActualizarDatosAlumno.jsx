import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import {
  actualizarAlumnoPublico,
  consultarAlumnoPublico,
  uploadArchivo,
  urlArchivo
} from '../services/api.js';
import {
  CARRERAS,
  TURNOS,
  UNIDADES_ACADEMICAS,
  etiquetaTipo,
  opcionesConVacio
} from '../services/catalogos.js';
import { adaptarImagen, esImagen } from '../services/imagenes.js';
import {
  normalizarExpediente,
  validarNombre,
  validarCorreo,
  validarTelefono,
  validarSeleccion
} from '../services/validacionAlumno.js';
import { imprimirComprobanteActualizacion } from '../services/pdf.js';

/**
 * ActualizarDatosAlumno - Autoservicio del autoregistro.
 *
 * La persona escribe su expediente, el sistema le muestra los datos que ya
 * estan guardados y puede corregir sus datos personales/academicos y su foto.
 * Al guardar se genera un comprobante imprimible (o guardable como PDF).
 *
 * Por seguridad NO se permite cambiar el expediente, el tipo de persona ni el
 * certificado medico: esos campos los controla el encargado del gimnasio.
 */

const TOCADO_INICIAL = {
  nombre: false,
  apellidoPaterno: false,
  apellidoMaterno: false,
  correo: false,
  telefono: false,
  academic_unit: false,
  turn: false,
  career: false
};

function formDesdeAlumno(alumno) {
  return {
    nombre: alumno.full_name || '',
    apellidoPaterno: alumno.second_name || '',
    apellidoMaterno: alumno.last_name || '',
    correo: alumno.email || '',
    telefono: alumno.phone || '',
    academic_unit: alumno.academic_unit || '',
    turn: alumno.turn || '',
    career: alumno.career || ''
  };
}

function nombreCompleto(alumno) {
  return [alumno.full_name, alumno.second_name, alumno.last_name]
    .filter(Boolean)
    .join(' ');
}

export default function ActualizarDatosAlumno({ expedienteInicial = '', onClose }) {
  const [paso, setPaso] = useState('buscar');
  const [expediente, setExpediente] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [alumno, setAlumno] = useState(null);
  const [form, setForm] = useState(null);
  const [tocado, setTocado] = useState(TOCADO_INICIAL);
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [fotoUrl, setFotoUrl] = useState('');
  const [fotoPreview, setFotoPreview] = useState('');
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const [errorArchivos, setErrorArchivos] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [actualizado, setActualizado] = useState(null);
  const [fechaGuardado, setFechaGuardado] = useState(null);
  const [errorImpresion, setErrorImpresion] = useState('');

  const setCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  // Carga los datos de una persona en el formulario de edicion.
  const aplicarAlumno = useCallback((datos) => {
    setAlumno(datos);
    setForm(formDesdeAlumno(datos));
    setFotoArchivo(null);
    setFotoUrl(datos.image_url || '');
    setFotoPreview(urlArchivo(datos.image_url || ''));
    setTocado(TOCADO_INICIAL);
    setErrorArchivos('');
    setErrorGeneral('');
    setErrorBusqueda('');
    setPaso('editar');
  }, []);

  // Si el modal se abre desde la pantalla de "registro exitoso" ya conocemos el
  // expediente: se consulta solo para que la persona no lo vuelva a escribir.
  useEffect(() => {
    if (!expedienteInicial) return undefined;
    const code = normalizarExpediente(expedienteInicial);
    setExpediente(code);
    if (code.length < 4) return undefined;

    let cancelado = false;
    setBuscando(true);
    (async () => {
      try {
        const res = await consultarAlumnoPublico(code);
        if (!cancelado) aplicarAlumno(res.estudiante);
      } catch (err) {
        if (!cancelado) setErrorBusqueda(err.message || 'No se pudo consultar el expediente.');
      } finally {
        if (!cancelado) setBuscando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [expedienteInicial, aplicarAlumno]);

  // Libera la vista previa local cuando cambia o se desmonta el modal.
  useEffect(() => {
    return () => {
      if (fotoPreview.startsWith('blob:')) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  const valores = form || {};

  const errores = useMemo(
    () => ({
      nombre: validarNombre(valores.nombre, 'nombre'),
      apellidoPaterno: validarNombre(valores.apellidoPaterno, 'apellido paterno'),
      apellidoMaterno: validarNombre(valores.apellidoMaterno, 'apellido materno'),
      correo: validarCorreo(valores.correo),
      telefono: validarTelefono(valores.telefono),
      academic_unit: validarSeleccion(valores.academic_unit, 'unidad académica'),
      turn: validarSeleccion(valores.turn, 'turno'),
      career: validarSeleccion(valores.career, 'carrera')
    }),
    [
      valores.nombre,
      valores.apellidoPaterno,
      valores.apellidoMaterno,
      valores.correo,
      valores.telefono,
      valores.academic_unit,
      valores.turn,
      valores.career
    ]
  );

  const formularioValido = Boolean(form) && Object.values(errores).every((e) => !e);
  const errorVisible = (campo) => (tocado[campo] ? errores[campo] : '');
  const marcarTocado = (campo) => setTocado((t) => ({ ...t, [campo]: true }));

  const buscar = async (e) => {
    e.preventDefault();
    const code = normalizarExpediente(expediente);
    setExpediente(code);
    if (code.length < 4) {
      setErrorBusqueda('Escribe un expediente válido de al menos 4 caracteres.');
      return;
    }
    if (buscando) return;
    setBuscando(true);
    setErrorBusqueda('');
    try {
      const res = await consultarAlumnoPublico(code);
      aplicarAlumno(res.estudiante);
    } catch (err) {
      setErrorBusqueda(err.message || 'No se pudo consultar el expediente.');
    } finally {
      setBuscando(false);
    }
  };

  const manejarFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!esImagen(archivo)) {
      setErrorArchivos('Selecciona una imagen (JPG, PNG, WebP, GIF, BMP, AVIF, HEIC o TIFF).');
      return;
    }
    setErrorArchivos('');
    setPreparandoFoto(true);
    try {
      const adaptada = await adaptarImagen(archivo);
      setFotoArchivo(adaptada);
      setFotoPreview(URL.createObjectURL(adaptada));
    } catch (err) {
      setErrorArchivos(err.message || 'No se pudo preparar la fotografía.');
    } finally {
      setPreparandoFoto(false);
    }
  };

  const quitarFoto = () => {
    setFotoArchivo(null);
    setFotoUrl('');
    setFotoPreview('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setTocado({
      nombre: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      correo: true,
      telefono: true,
      academic_unit: true,
      turn: true,
      career: true
    });
    setErrorGeneral('');

    if (!alumno) return;
    if (preparandoFoto) {
      setErrorGeneral('Espera un momento mientras se optimiza tu fotografía.');
      return;
    }
    if (!formularioValido) {
      setErrorGeneral('Revisa los campos marcados en rojo para continuar.');
      return;
    }
    if (guardando) return;

    setGuardando(true);
    try {
      let imagen = fotoUrl;
      if (fotoArchivo) {
        const subida = await uploadArchivo(fotoArchivo);
        imagen = subida.url || '';
      }
      const res = await actualizarAlumnoPublico(alumno.student_code, {
        full_name: form.nombre.trim(),
        second_name: form.apellidoPaterno.trim(),
        last_name: form.apellidoMaterno.trim(),
        email: form.correo.trim(),
        phone: form.telefono.trim(),
        academic_unit: form.academic_unit,
        turn: form.turn,
        career: form.career,
        image_url: imagen
      });
      setActualizado(res?.estudiante || { ...alumno, ...form });
      setFechaGuardado(new Date());
      setPaso('listo');
    } catch (err) {
      setErrorGeneral(err.message || 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  const descargarComprobante = async () => {
    if (!actualizado) return;
    setErrorImpresion('');
    try {
      await imprimirComprobanteActualizacion({ alumno: actualizado });
    } catch (err) {
      setErrorImpresion(err.message || 'No se pudo abrir el comprobante.');
    }
  };

  const volverBuscar = () => {
    setPaso('buscar');
    setAlumno(null);
    setForm(null);
    setTocado(TOCADO_INICIAL);
    setFotoArchivo(null);
    setFotoUrl('');
    setFotoPreview('');
    setErrorGeneral('');
    setErrorArchivos('');
    setErrorImpresion('');
  };

  const titulo =
    paso === 'listo' ? 'Datos actualizados' : '¿Necesitas actualizar tu información?';
  const subtitulo =
    paso === 'buscar'
      ? 'Consulta tu expediente y corrige los datos que ya están registrados.'
      : paso === 'editar'
        ? 'Modifica lo que necesites y guarda los cambios.'
        : 'Guarda tu comprobante como respaldo de la actualización.';

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} ancho="ancho">
      {paso === 'buscar' && (
        <div className="actualizar">
          <div className="actualizar-intro-card">
            <span className="actualizar-intro-ico" aria-hidden="true">
              {'\uD83D\uDD0E'}
            </span>
            <div>
              <strong>Consulta con tu número de expediente</strong>
              <p>
                Es la misma clave que usas en el checador. Al encontrarla podrás
                revisar y corregir tus datos.
              </p>
            </div>
          </div>

          <form className="actualizar-buscar" onSubmit={buscar}>
            <div className="auto-campo">
              <label htmlFor="actualizar-expediente">Número de expediente *</label>
              <input
                id="actualizar-expediente"
                value={expediente}
                onChange={(e) => setExpediente(normalizarExpediente(e.target.value))}
                placeholder="Ej. 20240001"
                autoComplete="username"
                autoCapitalize="characters"
                inputMode="text"
                maxLength={20}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn-primario"
              disabled={buscando || expediente.trim().length < 4}
            >
              {buscando ? 'Buscando...' : 'Consultar mis datos'}
            </button>
          </form>

          {errorBusqueda && (
            <p className="aviso-error" role="alert">
              {errorBusqueda}
            </p>
          )}

          <p className="actualizar-nota">
            Por seguridad, desde aquí solo se pueden cambiar tus datos personales,
            académicos y tu fotografía. Tu expediente y tu certificado médico los
            controla el encargado del gimnasio.
          </p>
        </div>
      )}

      {paso === 'editar' && form && alumno && (
        <form className="actualizar" onSubmit={guardar} noValidate>
          <div className="actualizar-persona">
            {fotoPreview ? (
              <img src={fotoPreview} alt="Fotografía actual" />
            ) : (
              <span className="actualizar-persona-sin-foto" aria-hidden="true">
                {'\uD83D\uDC64'}
              </span>
            )}
            <div className="actualizar-persona-datos">
              <span className="actualizar-etiqueta">Expediente / clave</span>
              <strong className="actualizar-clave">{alumno.student_code}</strong>
              <span className="actualizar-tipo">{etiquetaTipo(alumno.type)}</span>
            </div>
            <button type="button" className="actualizar-cambiar" onClick={volverBuscar}>
              No soy yo
            </button>
          </div>

          <div className="auto-grid">
            <div className={`auto-campo${errorVisible('nombre') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="actualizar-nombre">Nombre *</label>
              <input
                id="actualizar-nombre"
                value={form.nombre}
                onChange={(e) => setCampo('nombre', e.target.value)}
                onBlur={() => marcarTocado('nombre')}
                maxLength={60}
                autoComplete="given-name"
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
              <label htmlFor="actualizar-paterno">Apellido paterno *</label>
              <input
                id="actualizar-paterno"
                value={form.apellidoPaterno}
                onChange={(e) => setCampo('apellidoPaterno', e.target.value)}
                onBlur={() => marcarTocado('apellidoPaterno')}
                maxLength={60}
                autoComplete="family-name"
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
              <label htmlFor="actualizar-materno">Apellido materno *</label>
              <input
                id="actualizar-materno"
                value={form.apellidoMaterno}
                onChange={(e) => setCampo('apellidoMaterno', e.target.value)}
                onBlur={() => marcarTocado('apellidoMaterno')}
                maxLength={60}
                aria-invalid={Boolean(errorVisible('apellidoMaterno'))}
              />
              {errorVisible('apellidoMaterno') && (
                <p className="auto-error" role="alert">{errorVisible('apellidoMaterno')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('correo') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="actualizar-correo">Correo electrónico *</label>
              <input
                id="actualizar-correo"
                type="email"
                value={form.correo}
                onChange={(e) => setCampo('correo', e.target.value)}
                onBlur={() => marcarTocado('correo')}
                maxLength={120}
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
                aria-invalid={Boolean(errorVisible('correo'))}
              />
              {errorVisible('correo') && (
                <p className="auto-error" role="alert">{errorVisible('correo')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('telefono') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="actualizar-telefono">Teléfono *</label>
              <input
                id="actualizar-telefono"
                type="tel"
                value={form.telefono}
                onChange={(e) => setCampo('telefono', e.target.value)}
                onBlur={() => marcarTocado('telefono')}
                maxLength={25}
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={Boolean(errorVisible('telefono'))}
              />
              {errorVisible('telefono') && (
                <p className="auto-error" role="alert">{errorVisible('telefono')}</p>
              )}
            </div>
          </div>

          <h3 className="actualizar-subtitulo">Datos académicos</h3>

          <div className="auto-grid">
            <div
              className={`auto-campo${
                errorVisible('academic_unit') ? ' auto-campo-error' : ''
              }`}
            >
              <label htmlFor="actualizar-unidad">Unidad académica *</label>
              <select
                id="actualizar-unidad"
                value={form.academic_unit}
                onChange={(e) => setCampo('academic_unit', e.target.value)}
                onBlur={() => marcarTocado('academic_unit')}
                aria-invalid={Boolean(errorVisible('academic_unit'))}
              >
                {opcionesConVacio(UNIDADES_ACADEMICAS, 'Selecciona tu unidad').map((o) => (
                  <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                ))}
              </select>
              {errorVisible('academic_unit') && (
                <p className="auto-error" role="alert">{errorVisible('academic_unit')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('turn') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="actualizar-turno">Turno *</label>
              <select
                id="actualizar-turno"
                value={form.turn}
                onChange={(e) => setCampo('turn', e.target.value)}
                onBlur={() => marcarTocado('turn')}
                aria-invalid={Boolean(errorVisible('turn'))}
              >
                {opcionesConVacio(TURNOS, 'Selecciona tu turno').map((o) => (
                  <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                ))}
              </select>
              {errorVisible('turn') && (
                <p className="auto-error" role="alert">{errorVisible('turn')}</p>
              )}
            </div>

            <div className={`auto-campo${errorVisible('career') ? ' auto-campo-error' : ''}`}>
              <label htmlFor="actualizar-carrera">Carrera *</label>
              <select
                id="actualizar-carrera"
                value={form.career}
                onChange={(e) => setCampo('career', e.target.value)}
                onBlur={() => marcarTocado('career')}
                aria-invalid={Boolean(errorVisible('career'))}
              >
                {opcionesConVacio(CARRERAS, 'Selecciona tu carrera').map((o) => (
                  <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                ))}
              </select>
              {errorVisible('career') && (
                <p className="auto-error" role="alert">{errorVisible('career')}</p>
              )}
            </div>
          </div>

          <h3 className="actualizar-subtitulo">Fotografía</h3>
          <div className="auto-archivo">
            <div className="auto-archivo-info">
              <span className="auto-archivo-ico" aria-hidden="true">{'\uD83D\uDCF7'}</span>
              <div>
                <strong>Tu fotografía</strong>
                <span>Cualquier imagen · máximo 20 MB</span>
              </div>
            </div>
            {fotoPreview ? (
              <div className="auto-archivo-elegido">
                <img src={fotoPreview} alt="Vista previa de la fotografía" />
                <span>{fotoArchivo?.name || 'Fotografía actual'}</span>
                <button type="button" className="auto-quitar" onClick={quitarFoto}>
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="actualizar-foto" className="auto-file-boton">
                  {preparandoFoto ? 'Preparando...' : 'Subir foto'}
                </label>
                <input
                  id="actualizar-foto"
                  className="auto-file-input"
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif"
                  onChange={manejarFoto}
                  disabled={preparandoFoto}
                />
              </>
            )}
          </div>

          {errorArchivos && (
            <p className="auto-error" role="alert">{errorArchivos}</p>
          )}
          {errorGeneral && (
            <p className="aviso-error actualizar-error" role="alert">{errorGeneral}</p>
          )}

          <div className="actualizar-acciones">
            <button
              type="submit"
              className="btn btn-primario"
              disabled={guardando || preparandoFoto}
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" className="btn btn-secundario" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {paso === 'listo' && actualizado && (
        <div className="actualizar actualizar-listo">
          <div className="auto-exito-icono" aria-hidden="true">
            {'\u2713'}
          </div>
          <h3 className="actualizar-listo-titulo">Tus datos se actualizaron</h3>
          <p className="actualizar-listo-texto">
            La información ya quedó guardada en el sistema del Gimnasio UES.
          </p>

          <dl className="auto-resumen">
            {actualizado.image_url && (
              <div className="auto-resumen-foto">
                <img src={urlArchivo(actualizado.image_url)} alt="Fotografía del alumno" />
              </div>
            )}
            <div>
              <dt>Expediente / clave</dt>
              <dd>{actualizado.student_code || '—'}</dd>
            </div>
            <div>
              <dt>Nombre completo</dt>
              <dd>{nombreCompleto(actualizado) || '—'}</dd>
            </div>
            <div>
              <dt>Correo electrónico</dt>
              <dd>{actualizado.email || '—'}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{actualizado.phone || '—'}</dd>
            </div>
            <div>
              <dt>Unidad académica</dt>
              <dd>{actualizado.academic_unit || '—'}</dd>
            </div>
            <div>
              <dt>Turno</dt>
              <dd>{actualizado.turn || '—'}</dd>
            </div>
            <div>
              <dt>Carrera</dt>
              <dd>{actualizado.career || '—'}</dd>
            </div>
            <div>
              <dt>Fecha de actualización</dt>
              <dd>
                {fechaGuardado
                  ? fechaGuardado.toLocaleString('es-SV', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="actualizar-aviso">
            <strong>Descarga tu comprobante.</strong>
            <span>
              Te servirá como respaldo de que tus datos quedaron actualizados.
              También puedes guardarlo como PDF.
            </span>
          </div>

          {errorImpresion && (
            <p className="aviso-error actualizar-error" role="alert">{errorImpresion}</p>
          )}

          <div className="actualizar-acciones">
            <button type="button" className="btn btn-primario" onClick={descargarComprobante}>
              Descargar comprobante
            </button>
            <button type="button" className="btn btn-secundario" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
