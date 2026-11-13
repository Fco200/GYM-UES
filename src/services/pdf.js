/**
 * FichaTecnicaPDF - Genera la ficha tecnica del alumno como PDF.
 *
 * DECISION: no se agrega ninguna libreria de PDF. El sistema ya tiene un
 * servidor Express y una app Electron/React, y el motor de impresion del
 * sistema operativo (Chrome en Electron, Chrome/Edge en el navegador) produce
 * un PDF de mejor calidad tipografica que cualquier generador hecho a mano,
 * con menos peso y sin dependencias que actualizar.
 *
 * El flujo es el nativo del escritorio: se arma un documento oculto con el
 * diseno de la ficha y se llama a window.print(). El usuario elige "Guardar
 * como PDF". Por eso el resultado respeta la hoja de estilos de impresion, el
 * logo institucional y las fuentes ya cargadas por la aplicacion.
 *
 * LEGIBILIDAD: la version anterior usaba 9.5 pt y dos columnas de datos con
 * etiquetas de 118 px, lo que hacia que en hoja Letter los valores largos se
 * partieran y las letras quedaran demasiado pequenas. Ahora se usa una sola
 * columna para los datos, 11 pt de base, etiquetas con mas contraste y filas
 * que nunca recortan el texto. Tambien se espera a que carguen las imagenes y
 * las fuentes antes de abrir el dialogo de impresion.
 */
import { fechaCorta, fechaLarga, hora } from './fechas.js';

/** Escapa el texto antes de inyectarlo en el HTML de la ficha. */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Valor de la ficha o el texto que usa el portal cuando no hay dato. */
const v = (valor, sufijo = 'No capturado') => esc(valor || sufijo);

function fila(etiqueta, valor) {
  return `<div class="f-pdf-fila"><span>${esc(etiqueta)}</span><b>${valor}</b></div>`;
}

function bloque(titulo, filas) {
  return `
    <section class="f-pdf-bloque">
      <h2>${esc(titulo)}</h2>
      <div class="f-pdf-filas">${filas.join('')}</div>
    </section>`;
}

/** Espera a que una imagen termine de cargar (o falle) sin bloquear la ficha. */
function esperarImagen(img) {
  if (!img || img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}

/**
 * Abre un documento HTML en una ventana nueva y lanza el dialogo de impresion
 * (desde el cual el usuario puede guardar como PDF). Se espera a que imagenes y
 * fuentes esten listas para que el documento no salga incompleto.
 */
async function abrirEImprimir(html) {
  const win = window.open('', '_blank', 'width=920,height=1100');
  if (!win) {
    throw new Error(
      'El navegador bloqueó la ventana del documento. Permita las ventanas emergentes para este sitio e intente de nuevo.'
    );
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  try {
    // Se espera a que el documento, las imagenes y las fuentes esten listos.
    // Si se imprime antes, el PDF sale sin logo/foto o con una fuente de
    // respaldo distinta, que es lo que hacia que las letras no se entendieran.
    const imagenes = Array.from(win.document.images || []).map(esperarImagen);
    const fuentes =
      win.document.fonts && typeof win.document.fonts.ready === 'object'
        ? win.document.fonts.ready.catch(() => {})
        : Promise.resolve();
    await Promise.all([...imagenes, fuentes]);
    // Margen extra para que el motor de impresion termine el layout.
    await new Promise((resolve) => setTimeout(resolve, 250));
    win.focus();
    win.print();
  } catch {
    // Si algo falla al esperar, se imprime de todas formas: el usuario no debe
    // quedarse sin su documento por una imagen que no cargo.
    win.focus();
    win.print();
  }
}

/**
 * Construye el HTML completo de la ficha y lo imprime.
 *
 * @param {object} opciones
 * @param {object} opciones.alumno    datos de la persona
 * @param {Array}  opciones.asistencias  historial (opcional, hasta 40)
 * @param {object} opciones.resumen   conteos agregados (opcional)
 * @param {string} opciones.etiquetaTipo  'Alumno' | 'Personal UES' | ...
 * @param {string} opciones.emisor    nombre de quien emite la ficha
 * @returns {Promise<void>}
 */
export async function imprimirFicha({
  alumno,
  asistencias = [],
  resumen = null,
  etiquetaTipo = '',
  emisor = ''
}) {
  const em = alumno.emergency_contact || {};
  const tieneEmergencia = Boolean(em.name || em.phone || em.email);

  // Ruta absoluta al logo: funciona tanto en web como dentro de Electron.
  const logoUrl = new URL('img/logo_ues.png', window.location.href).href;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ficha técnica - ${esc(alumno.student_code)}</title>
<style>
  @page { size: letter portrait; margin: 12mm 11mm 14mm; }
  * { box-sizing: border-box; }
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #111111; margin: 0;
    font-size: 11pt; line-height: 1.45;
    font-variant-numeric: tabular-nums;
  }

  /* ---- encabezado institucional ---- */
  .f-pdf-cabecera {
    display: flex; align-items: center; gap: 14px;
    border-bottom: 3px solid #800020; padding-bottom: 10px; margin-bottom: 12px;
  }
  .f-pdf-logo { width: 68px; height: 68px; object-fit: contain; flex: 0 0 auto; }
  .f-pdf-inst { flex: 1; min-width: 0; }
  .f-pdf-inst h1 { font-size: 17pt; margin: 0; color: #800020; letter-spacing: .2px; }
  .f-pdf-inst p { margin: 3px 0 0; font-size: 9.5pt; color: #444; }
  .f-pdf-titulo { text-align: right; flex: 0 0 auto; }
  .f-pdf-titulo strong { display: block; font-size: 12pt; color: #800020; }
  .f-pdf-titulo span { font-size: 8.5pt; color: #555; }

  /* ---- identidad ---- */
  .f-pdf-encabezado-persona {
    display: flex; gap: 14px; align-items: flex-start;
    background: #f7f8fa; border: 1px solid #e2e5ea;
    border-left: 4px solid #800020; border-radius: 6px;
    padding: 10px 12px; margin-bottom: 12px;
    break-inside: avoid;
  }
  .f-pdf-foto {
    width: 86px; height: 100px; object-fit: cover; border-radius: 5px;
    border: 1px solid #ccd; background: #fff; flex: 0 0 auto;
  }
  .f-pdf-foto-vacia {
    display: flex; align-items: center; justify-content: center;
    color: #777; font-size: 8.5pt; text-align: center;
  }
  .f-pdf-identidad { min-width: 0; flex: 1; }
  .f-pdf-nombre { font-size: 15pt; font-weight: 700; margin: 0 0 5px; line-height: 1.25; }
  .f-pdf-clave {
    display: inline-block; background: #800020; color: #fff;
    padding: 3px 11px; border-radius: 4px; font-size: 10.5pt;
    font-weight: 600; letter-spacing: .5px;
  }
  .f-pdf-tags { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
  .f-pdf-tag {
    font-size: 9pt; border: 1px solid #ccd; border-radius: 11px;
    padding: 3px 10px; background: #fff;
  }
  .f-pdf-tag-alerta { border-color: #b03024; color: #b03024; font-weight: 700; }

  /* ---- bloques de datos ---- */
  .f-pdf-bloque { margin-bottom: 11px; break-inside: avoid; }
  .f-pdf-bloque h2 {
    font-size: 10pt; text-transform: uppercase; letter-spacing: .8px;
    color: #800020; margin: 0 0 7px; padding-bottom: 4px;
    border-bottom: 1px solid #d9dde4;
  }
  .f-pdf-filas { display: grid; grid-template-columns: 1fr; gap: 4px; }
  .f-pdf-fila {
    display: grid; grid-template-columns: minmax(120px, 34%) minmax(0, 1fr);
    gap: 10px; font-size: 10.5pt; padding: 3px 0;
    border-bottom: 1px dotted #e6e8ec;
    overflow-wrap: anywhere; word-break: break-word;
  }
  .f-pdf-fila span { color: #444; font-weight: 600; }
  .f-pdf-fila b { font-weight: 500; color: #111; }

  /* ---- tarjeta de emergencia ---- */
  .f-pdf-emergencia {
    border: 1.5px solid #b03024; border-radius: 6px;
    padding: 10px 12px; background: #fdf3f2; break-inside: avoid;
    margin-bottom: 11px;
  }
  .f-pdf-emergencia h2 { color: #b03024; border-color: #f0c8c4; margin-top: 0; }
  .f-pdf-emergencia .f-pdf-fila { border-bottom-color: #f2d9d6; }

  /* ---- tabla de asistencias ---- */
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border: 1px solid #d8dce2; padding: 5px 7px; text-align: left; }
  th {
    background: #f2f3f6; font-weight: 700; font-size: 8.6pt;
    text-transform: uppercase; letter-spacing: .4px;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .f-pdf-centro { text-align: center; }
  .f-pdf-activo { color: #176b35; font-weight: 700; }

  /* ---- resumen ---- */
  .f-pdf-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-bottom: 11px; }
  .f-pdf-kpi {
    border: 1px solid #e2e5ea; border-radius: 6px;
    padding: 8px; text-align: center; background: #f7f8fa;
  }
  .f-pdf-kpi b { display: block; font-size: 17pt; color: #800020; line-height: 1.15; }
  .f-pdf-kpi span { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: .4px; }

  .f-pdf-pie {
    margin-top: 18px; padding-top: 9px; border-top: 1px solid #d9dde4;
    font-size: 8.5pt; color: #555; display: flex; justify-content: space-between;
    gap: 12px;
  }
  .f-pdf-firmas { display: flex; gap: 32px; margin-top: 22px; break-inside: avoid; }
  .f-pdf-firma { flex: 1; text-align: center; font-size: 9pt; color: #333; }
  .f-pdf-firma div { border-top: 1px solid #777; margin-bottom: 5px; height: 38px; }

  .f-pdf-vacio { color: #555; font-size: 10pt; font-style: italic; }
</style>
</head>
<body>
  <header class="f-pdf-cabecera">
    <img class="f-pdf-logo" src="${esc(logoUrl)}" alt="" />
    <div class="f-pdf-inst">
      <h1>Gimnasio UES</h1>
      <p>Universidad Estatal de Sonora &middot; Sistema de Control de Asistencia</p>
    </div>
    <div class="f-pdf-titulo">
      <strong>FICHA T&Eacute;CNICA</strong>
      <span>Emitida el ${esc(fechaLarga(new Date()))} a las ${esc(hora(new Date(), true))}</span>
    </div>
  </header>

  <div class="f-pdf-encabezado-persona">
    ${
      alumno.image_url
        ? `<img class="f-pdf-foto" src="${esc(alumno.image_url)}" alt="" />`
        : `<div class="f-pdf-foto f-pdf-foto-vacia">Sin<br />fotografía</div>`
    }
    <div class="f-pdf-identidad">
      <p class="f-pdf-nombre">${v(
        [alumno.full_name, alumno.second_name, alumno.last_name].filter(Boolean).join(' ')
      )}</p>
      <span class="f-pdf-clave">${esc(alumno.student_code)}</span>
      <div class="f-pdf-tags">
        <span class="f-pdf-tag">${esc(etiquetaTipo || alumno.type)}</span>
        ${alumno.turn ? `<span class="f-pdf-tag">Turno ${esc(alumno.turn)}</span>` : ''}
        ${alumno.academic_unit ? `<span class="f-pdf-tag">${esc(alumno.academic_unit)}</span>` : ''}
        <span class="f-pdf-tag ${alumno.medical_certificate && alumno.medical_certificate !== 'No' ? '' : 'f-pdf-tag-alerta'}">
          Certificado m&eacute;dico: ${
            alumno.medical_certificate && alumno.medical_certificate !== 'No' ? 'Vigente' : 'PENDIENTE'
          }
        </span>
      </div>
    </div>
  </div>

  ${
    resumen
      ? `<div class="f-pdf-kpis">
          <div class="f-pdf-kpi"><b>${esc(resumen.total ?? 0)}</b><span>Visitas totales</span></div>
          <div class="f-pdf-kpi"><b>${esc(resumen.dias ?? 0)}</b><span>D&iacute;as con visita</span></div>
          <div class="f-pdf-kpi"><b>${esc(resumen.ultima || '—')}</b><span>&Uacute;ltima visita</span></div>
          <div class="f-pdf-kpi"><b>${esc(resumen.promedio || '—')}</b><span>Permanencia media</span></div>
        </div>`
      : ''
  }

  ${bloque('Datos de identificaci&oacute;n', [
    fila('Clave / expediente', v(alumno.student_code)),
    fila('Tipo de persona', v(etiquetaTipo || alumno.type)),
    fila('Nombre completo', v([alumno.full_name, alumno.second_name, alumno.last_name].filter(Boolean).join(' '))),
    fila('G&eacute;nero', v(alumno.gender))
  ])}

  ${bloque('Contacto', [
    fila('Tel&eacute;fono', v(alumno.phone, 'No registrado')),
    fila('Correo electr&oacute;nico', v(alumno.email, 'No registrado')),
    fila('Fecha de registro', v(fechaCorta(alumno.created_at), 'Sin dato'))
  ])}

  ${bloque('Adscripci&oacute;n institucional', [
    fila('Unidad acad&eacute;mica', v(alumno.academic_unit)),
    fila(alumno.type === 'personal' ? 'Departamento / &Aacute;rea' : 'Carrera', v(alumno.career)),
    fila('&Aacute;rea laboral', v(alumno.work_area, 'No aplica')),
    fila('Puesto', v(alumno.job_title, 'No aplica')),
    fila('Turno', v(alumno.turn))
  ])}

  ${
    tieneEmergencia
      ? `<div class="f-pdf-emergencia">
          <h2>Contacto de emergencia</h2>
          <div class="f-pdf-filas">
            ${fila('Nombre', v(em.name))}
            ${fila('Parentesco / relaci&oacute;n', v(em.relationship))}
            ${fila('Tel&eacute;fono', v(em.phone, 'No registrado'))}
            ${fila('Correo', v(em.email, 'No registrado'))}
          </div>
        </div>`
      : `<div class="f-pdf-bloque">
          <h2>Contacto de emergencia</h2>
          <p class="f-pdf-vacio">Sin contacto de emergencia registrado.</p>
        </div>`
  }

  <section class="f-pdf-bloque" style="margin-top:10px">
    <h2>Historial de asistencias</h2>
    ${
      asistencias.length === 0
        ? '<p class="f-pdf-vacio">Sin asistencias registradas.</p>'
        : `<table>
            <thead>
              <tr>
                <th style="width:24%">Fecha</th>
                <th style="width:14%">Entrada</th>
                <th style="width:14%">Salida</th>
                <th style="width:14%">Permanencia</th>
                <th style="width:12%">Estado</th>
                <th style="width:22%">Observaci&oacute;n</th>
              </tr>
            </thead>
            <tbody>
              ${(asistencias || []).slice(0, 25)
                .map((a) => {
                  const ent = a.check_in ? hora(a.check_in, true) : '—';
                  const sal = a.check_out ? hora(a.check_out, true) : '—';
                  const abierto = Boolean(a.check_in && !a.check_out);
                  return `<tr>
                    <td>${esc(fechaCorta(a.check_in || a.created_at))}</td>
                    <td class="f-pdf-centro">${esc(ent)}</td>
                    <td class="f-pdf-centro">${esc(sal)}</td>
                    <td class="f-pdf-centro">${esc(a.duracion || '—')}</td>
                    <td class="f-pdf-centro ${abierto ? 'f-pdf-activo' : ''}">${abierto ? 'Adentro' : 'Cerrado'}</td>
                    <td>${esc(a.notes || '')}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>`
    }
  </section>

  <div class="f-pdf-firmas">
    <div class="f-pdf-firma"><div></div>${esc(emisor || 'Responsable del gimnasio')}</div>
    <div class="f-pdf-firma"><div></div>${esc([alumno.full_name, alumno.last_name].filter(Boolean).join(' '))}<br />Titular de la ficha</div>
  </div>

  <div class="f-pdf-pie">
    <span>Gimnasio UES &middot; Documento generado electr&oacute;nicamente, es v&aacute;lido sin firma manuscrita.</span>
    <span>Clave ${esc(alumno.student_code)}</span>
  </div>
</body>
</html>`;

  // Se abre en una ventana sin barras ni menues: al imprimir, el navegador
  // ofrece "Guardar como PDF" con el diseno exacto de la ficha.
  await abrirEImprimir(html);
}

/**
 * Comprobante de actualizacion de datos del autoservicio.
 *
 * Reutiliza el mismo motor de impresion de la ficha. El alumno lo descarga
 * desde la pantalla de confirmacion despues de guardar sus cambios.
 *
 * @param {object} opciones
 * @param {object} opciones.alumno datos ya actualizados
 * @returns {Promise<void>}
 */
export async function imprimirComprobanteActualizacion({ alumno }) {
  const logoUrl = new URL('img/logo_ues.png', window.location.href).href;
  const ahora = new Date();
  const nombre = [alumno.full_name, alumno.second_name, alumno.last_name]
    .filter(Boolean)
    .join(' ');
  const folio = `ACT-${String(alumno.student_code || 'ALUMNO')}-${ahora
    .getTime()
    .toString(36)
    .toUpperCase()}`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprobante de actualización - ${esc(alumno.student_code)}</title>
<style>
  @page { size: letter portrait; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #111; margin: 0; font-size: 11pt; line-height: 1.5;
  }
  .c-cabecera {
    display: flex; align-items: center; gap: 14px;
    border-bottom: 3px solid #800020; padding-bottom: 11px; margin-bottom: 18px;
  }
  .c-logo { width: 64px; height: 64px; object-fit: contain; flex: 0 0 auto; }
  .c-inst { flex: 1; min-width: 0; }
  .c-inst h1 { margin: 0; font-size: 17pt; color: #800020; }
  .c-inst p { margin: 3px 0 0; font-size: 9.5pt; color: #444; }
  .c-folio { text-align: right; font-size: 9pt; color: #444; flex: 0 0 auto; }
  .c-folio b { display: block; font-size: 10.5pt; color: #111; }
  .c-titulo {
    text-align: center; margin: 0 0 8px; font-size: 16pt;
    color: #800020; letter-spacing: .4px;
  }
  .c-sub { text-align: center; margin: 0 0 18px; color: #444; font-size: 10pt; }
  .c-persona {
    display: flex; gap: 14px; align-items: center;
    background: #f7f8fa; border: 1px solid #e2e5ea;
    border-left: 4px solid #800020; border-radius: 6px;
    padding: 11px 13px; margin-bottom: 15px; break-inside: avoid;
  }
  .c-foto {
    width: 74px; height: 88px; object-fit: cover; border-radius: 5px;
    border: 1px solid #ccd; background: #fff; flex: 0 0 auto;
  }
  .c-nombre { margin: 0 0 4px; font-size: 14pt; font-weight: 700; }
  .c-clave {
    display: inline-block; background: #800020; color: #fff;
    padding: 3px 11px; border-radius: 4px; font-size: 10.5pt;
    font-weight: 600; letter-spacing: .5px;
  }
  .c-tabla { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .c-tabla th, .c-tabla td {
    border: 1px solid #dcdfe5; padding: 8px 10px; text-align: left;
    vertical-align: top; overflow-wrap: anywhere;
  }
  .c-tabla th {
    width: 34%; background: #f2f3f6; font-size: 9.5pt; color: #333;
    text-transform: uppercase; letter-spacing: .5px;
  }
  .c-tabla td { font-size: 10.5pt; font-weight: 500; }
  .c-aviso {
    border: 1px solid #d9dde4; border-left: 4px solid #0f8a4d;
    background: #f2faf5; border-radius: 6px; padding: 11px 13px;
    margin-bottom: 22px; font-size: 10pt; color: #1f3a2a; break-inside: avoid;
  }
  .c-aviso b { color: #0b6b3a; }
  .c-firma {
    margin: 34px auto 0; width: 72%; text-align: center; font-size: 9.5pt;
    color: #333; break-inside: avoid;
  }
  .c-firma-linea { border-top: 1px solid #777; height: 42px; margin-bottom: 6px; }
  .c-pie {
    margin-top: 26px; padding-top: 9px; border-top: 1px solid #d9dde4;
    font-size: 8.5pt; color: #555; display: flex; justify-content: space-between;
    gap: 12px;
  }
</style>
</head>
<body>
  <header class="c-cabecera">
    <img class="c-logo" src="${esc(logoUrl)}" alt="" />
    <div class="c-inst">
      <h1>Gimnasio UES</h1>
      <p>Universidad Estatal de Sonora &middot; Sistema de Control de Asistencia</p>
    </div>
    <div class="c-folio">
      Folio
      <b>${esc(folio)}</b>
    </div>
  </header>

  <h2 class="c-titulo">COMPROBANTE DE ACTUALIZACIÓN DE DATOS</h2>
  <p class="c-sub">
    Emitido el ${esc(fechaLarga(ahora))} a las ${esc(hora(ahora, true))}
  </p>

  <div class="c-persona">
    ${
      alumno.image_url
        ? `<img class="c-foto" src="${esc(alumno.image_url)}" alt="" />`
        : ''
    }
    <div>
      <p class="c-nombre">${v(nombre, 'Nombre no registrado')}</p>
      <span class="c-clave">${esc(alumno.student_code)}</span>
    </div>
  </div>

  <table class="c-tabla">
    <tbody>
      <tr><th>Expediente / clave</th><td>${v(alumno.student_code)}</td></tr>
      <tr><th>Nombre completo</th><td>${v(nombre)}</td></tr>
      <tr><th>Correo electrónico</th><td>${v(alumno.email, 'No registrado')}</td></tr>
      <tr><th>Teléfono</th><td>${v(alumno.phone, 'No registrado')}</td></tr>
      <tr><th>Unidad académica</th><td>${v(alumno.academic_unit)}</td></tr>
      <tr><th>Turno</th><td>${v(alumno.turn)}</td></tr>
      <tr><th>Carrera</th><td>${v(alumno.career)}</td></tr>
    </tbody>
  </table>

  <div class="c-aviso">
    <b>Actualización registrada correctamente.</b><br />
    Estos son los datos que quedaron guardados en el sistema del Gimnasio UES.
    Conserve este comprobante. Si algún dato no es correcto, acuda con el
    encargado del gimnasio para corregirlo.
  </div>

  <div class="c-firma">
    <div class="c-firma-linea"></div>
    ${v(nombre, 'Titular del registro')}<br />
    Recibí de conformidad
  </div>

  <div class="c-pie">
    <span>Gimnasio UES &middot; Documento generado electrónicamente, es válido sin firma manuscrita.</span>
    <span>${esc(folio)}</span>
  </div>
</body>
</html>`;

  await abrirEImprimir(html);
}
