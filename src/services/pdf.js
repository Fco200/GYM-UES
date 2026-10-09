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
 */
import { fechaCorta, fechaLarga, hora } from './fechas.js';

/** Escapa el texto antes de inyectarlo en el HTML de la ficha. */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Valor de la ficha o el guion que usa el portal cuando no hay dato. */
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

/**
 * Construye el HTML completo de la ficha y lo imprime.
 *
 * @param {object} opciones
 * @param {object} opciones.alumno    datos de la persona
 * @param {Array}  opciones.asistencias  historial (opcional, hasta 40)
 * @param {object} opciones.resumen   conteos agregados (opcional)
 * @param {string} opciones.etiquetaTipo  'Alumno' | 'Personal UES' | ...
 * @param {string} opciones.emisor    nombre de quien emite la ficha
 */
export function imprimirFicha({ alumno, asistencias = [], resumen = null, etiquetaTipo = '', emisor = '' }) {
  const em = alumno.emergency_contact || {};
  const tieneEmergencia = Boolean(em.name || em.phone || em.email);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ficha técnica - ${esc(alumno.student_code)}</title>
<style>
  @page { size: Letter; margin: 10mm 9mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Roboto, Arial, sans-serif;
    color: #1a1a1a; margin: 0; font-size: 9.5pt; line-height: 1.40;
  }

  /* ---- encabezado institucional ---- */
  .f-pdf-cabecera {
    display: flex; align-items: center; gap: 12px;
    border-bottom: 3px solid #800020; padding-bottom: 8px; margin-bottom: 10px;
  }
  .f-pdf-logo { width: 62px; height: 62px; object-fit: contain; }
  .f-pdf-inst { flex: 1; }
  .f-pdf-inst h1 { font-size: 15pt; margin: 0; color: #800020; letter-spacing: .3px; }
  .f-pdf-inst p { margin: 2px 0 0; font-size: 9pt; color: #555; }
  .f-pdf-titulo { text-align: right; }
  .f-pdf-titulo strong { display: block; font-size: 11pt; color: #800020; }
  .f-pdf-titulo span { font-size: 8pt; color: #666; }

  /* ---- identidad ---- */
  .f-pdf-encabezado-persona {
    display: flex; gap: 12px; align-items: flex-start;
    background: #f7f8fa; border: 1px solid #e2e5ea;
    border-left: 4px solid #800020; border-radius: 6px;
    padding: 8px 10px; margin-bottom: 10px;
  }
  .f-pdf-foto {
    width: 78px; height: 92px; object-fit: cover; border-radius: 5px;
    border: 1px solid #ccd; background: #fff;
  }
  .f-pdf-foto-vacia {
    display: flex; align-items: center; justify-content: center;
    color: #99a; font-size: 8pt; text-align: center;
  }
  .f-pdf-nombre { font-size: 14pt; font-weight: 700; margin: 0 0 3px; }
  .f-pdf-clave {
    display: inline-block; background: #800020; color: #fff;
    padding: 2px 9px; border-radius: 4px; font-size: 9.5pt;
    font-weight: 600; letter-spacing: .5px;
  }
  .f-pdf-tags { margin-top: 7px; display: flex; gap: 6px; flex-wrap: wrap; }
  .f-pdf-tag {
    font-size: 8pt; border: 1px solid #ccd; border-radius: 11px;
    padding: 2px 9px; background: #fff;
  }
  .f-pdf-tag-alerta { border-color: #c0392b; color: #c0392b; font-weight: 600; }

  /* ---- bloques de datos ---- */
  .f-pdf-bloque { margin-bottom: 8px; break-inside: avoid; }
  .f-pdf-bloque h2 {
    font-size: 9.5pt; text-transform: uppercase; letter-spacing: .8px;
    color: #800020; margin: 0 0 6px; padding-bottom: 3px;
    border-bottom: 1px solid #e2e5ea;
  }
  .f-pdf-filas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px 18px; }
  .f-pdf-fila { display: flex; gap: 8px; font-size: 9.5pt; padding: 2px 0; }
  .f-pdf-fila span { color: #666; min-width: 118px; }
  .f-pdf-fila b { font-weight: 600; }

  /* ---- tarjeta de emergencia ---- */
  .f-pdf-emergencia {
    border: 1.5px solid #c0392b; border-radius: 6px;
    padding: 10px 12px; background: #fdf3f2; break-inside: avoid;
  }
  .f-pdf-emergencia h2 {
    color: #c0392b; border-color: #f0c8c4; margin-top: 0;
  }
  .f-pdf-emergencia .f-pdf-filas { grid-template-columns: 1fr; gap: 2px; }
  .f-pdf-emergencia .f-pdf-fila span { min-width: 130px; }

  /* ---- tabla de asistencias ---- */
  table { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
  th, td { border: 1px solid #d8dce2; padding: 4px 6px; text-align: left; }
  th { background: #f2f3f6; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .4px; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .f-pdf-centro { text-align: center; }
  .f-pdf-activo { color: #1e7a3c; font-weight: 700; }

  /* ---- resumen ---- */
  .f-pdf-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
  .f-pdf-kpi {
    border: 1px solid #e2e5ea; border-radius: 6px;
    padding: 8px; text-align: center; background: #f7f8fa;
  }
  .f-pdf-kpi b { display: block; font-size: 16pt; color: #800020; line-height: 1.1; }
  .f-pdf-kpi span { font-size: 7.6pt; color: #666; text-transform: uppercase; letter-spacing: .4px; }

  .f-pdf-pie {
    margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e5ea;
    font-size: 7.6pt; color: #777; display: flex; justify-content: space-between;
  }
  .f-pdf-firmas { display: flex; gap: 30px; margin-top: 16px; break-inside: avoid; }
  .f-pdf-firma { flex: 1; text-align: center; font-size: 8pt; color: #555; }
  .f-pdf-firma div { border-top: 1px solid #999; margin-bottom: 4px; height: 34px; }

  .f-pdf-vacio { color: #888; font-size: 9pt; font-style: italic; }
</style>
</head>
<body>
  <header class="f-pdf-cabecera">
    <img class="f-pdf-logo" src="${window.location.origin}/img/logo_ues.png" alt="" />
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
    <div>
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

  <section class="f-pdf-bloque" style="margin-top:8px">
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
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    // El navegador bloquea la ventana emergente: se avisa para que el usuario
    // permita las ventanas de este sitio y vuelva a intentar.
    throw new Error(
      'El navegador bloqueo la ventana de la ficha. Permita las ventanas emergentes para este sitio e intente de nuevo.'
    );
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Se espera a que las imagenes (logo, foto) terminen de cargar: si se
  // imprime antes, el PDF sale sin ellas.
  const listo = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === 'complete') setTimeout(listo, 350);
  else win.addEventListener('load', () => setTimeout(listo, 350), { once: true });
}