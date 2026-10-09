/**
 * Gym UES - Envio de correos con Gmail SMTP (nodemailer).
 *
 * Gratuito: se usa la cuenta de Google del gimnasio con una CONTRASENA DE
 * APLICACION (Cuenta > Seguridad > Contrasenas de aplicacion). Nunca se
 * guarda la contrasena normal de Google en el .env.
 *
 * Si faltan GMAIL_USER / GMAIL_APP_PASSWORD, `configurado()` devuelve false y
 * el flujo de recuperacion por correo se desactiva (el login ofrece la clave
 * secreta como segunda opcion).
 */
'use strict';

const nodemailer = require('nodemailer');

const USUARIO = process.env.GMAIL_USER || '';
const CLAVE = process.env.GMAIL_APP_PASSWORD || '';

let transporter = null;

/** true si las variables de correo estan completas en el .env. */
function configurado() {
  return Boolean(USUARIO && CLAVE);
}

/**
 * Transporter perezoso: solo se construye si hay credenciales, para no
 * romper el arranque del servidor cuando el correo no esta configurado.
 */
function obtenerTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: USUARIO, pass: CLAVE },
      // Gmail puede tardar en aceptar la conexion SMTP; un timeout corto
      // dejaria al usuario esperando sin respuesta.
      connectionTimeout: 10_000
    });
  }
  return transporter;
}

/**
 * Envia un correo HTML sencillo. Lanza una excepcion si falla (el llamador
 * decide que responder al usuario).
 */
async function enviarCorreo({ para, asunto, html, texto }) {
  if (!configurado()) {
    throw new Error('Correo electrónico no configurado (faltan GMAIL_USER/GMAIL_APP_PASSWORD).');
  }
  await obtenerTransporter().sendMail({
    from: `"Gimnasio UES" <${USUARIO}>`,
    to: para,
    subject: asunto,
    text: texto || '',
    html
  });
}

/**
 * Cuerpo HTML del correo con el codigo de recuperacion. Institucional y
 * sobrio: logo en texto, codigo grande y aviso de caducidad.
 */
function htmlCodigo(codigo) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:24px;border:1px solid #e5e5e5;border-radius:12px">
    <h2 style="color:#800020;margin:0 0 4px">Gimnasio UES</h2>
    <p style="color:#555;margin:0 0 18px">Recuperacion de contrasena del portal de administracion</p>
    <p style="color:#333">Su codigo de verificacion es:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#800020;text-align:center;background:#f7f2f4;padding:14px 0;border-radius:8px;margin:8px 0 18px">${codigo}</p>
    <p style="color:#777;font-size:13px;line-height:1.6">
      Caduca en <b>10 minutos</b> y solo puede usarse una vez.<br/>
      Si usted no solicito este codigo, ignore este correo: su contrasena no cambia.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
    <p style="color:#999;font-size:12px;margin:0">Gimnasio UES &middot; Portal de administracion</p>
  </div>`;
}

module.exports = { configurado, enviarCorreo, htmlCodigo };
