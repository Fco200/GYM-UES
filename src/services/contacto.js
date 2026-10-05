/**
 * Gym UES - Servicio de contacto: telefono, WhatsApp y correo.
 *
 * QUE RESUELVE
 * El gym no tiene ningun proveedor de mensajeria (ni SMTP, ni Twilio, ni Meta).
 * Lo unico que hace falta es abrir la app de WhatsApp o el cliente de correo
 * del propio administrador con el destinatario y el texto ya puestos. Eso se
 * hace con dos enlaces profundos, y no requiere cuentas, ni API keys, ni saldo:
 *
 *   - WhatsApp: https://wa.me/<numero>?text=<mensaje>
 *   - Correo:   mailto:<correo>?subject=<asunto>&body=<cuerpo>
 *
 * QUE HACE FALTA Y POR QUE ESTA SEPARADO
 * `wa.me` exige el numero en formato E.164 (pais + subscriber), solo digitos:
 * '5216861234567'. Pero el campo `phone` se guarda como TEXTO LIBRE, tal
 * como la persona lo dicta, porque en un gimnasio se anota como se puede
 * ('662 123 4567', '+52 662 555 1111', '(503) 2xxx-xxxx'). Sin normalizar,
 * el enlace deepa wa.me no abre la conversacion correcta.
 *
 * Mexico (Sonora) tiene codigos de area de 2 digitos, asi que un numero local
 * completo son 10 digitos y con pais son 12 ('52' + 10). Los moviles
 * antiguos se anotaban con el '1' de larga distancia ('1 686 123 4567'), y
 * siguen en la base de datos, asi que tambien se contemplan.
 *
 * IMPORTANTE
 * Si el numero no se puede resolver con certeza (por ejemplo '7xxx xxxx', sin
 * codigo de area) estas funciones devuelven null en vez de adivinar, y quien
 * llama debe deshabilitar el boton. Mandarle a un numero equivocado en una
 * emergencia es peor que no tener boton.
 */

/** Codigo de pais de Mexico, sin el '+'. */
const CODIGO_MX = '52';

/**
 * Numero de telefono a E.164: '+526621234567'.
 *
 * @param {string} telefono  texto libre capturado en el formulario
 * @returns {string|null}    '+52...' o null si no se puede resolver
 */
export function aE164(telefono) {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  // 5216861234567 -> los 13 digitos son el formato viejo con el '1' de larga
  // distancia; WhatsApp ya no lo usa, asi que se quita.
  if (digitos.length === 13 && digitos.startsWith(`${CODIGO_MX}1`)) {
    return `+${CODIGO_MX}${digitos.slice(3)}`;
  }

  // Ya viene con pais: 526621234567 (12) o 5216861234567 (13, ya resuelto arriba).
  if (digitos.length === 12 && digitos.startsWith(CODIGO_MX)) {
    return `+${digitos}`;
  }
  if (digitos.length === 11 && digitos.startsWith(CODIGO_MX)) {
    return `+${digitos}`;
  }

  // Numero local de 10 digitos: se le pone el pais.
  if (digitos.length === 10) {
    return `+${CODIGO_MX}${digitos}`;
  }

  // 11 digitos empezando por '1': movil antiguo con el 1 de larga distancia.
  if (digitos.length === 11 && digitos.startsWith('1')) {
    return `+${CODIGO_MX}${digitos.slice(1)}`;
  }

  // Cualquier otra cosa (7 u 8 digitos sin area, o numero de otro pais mal
  // capturado) no se puede resolver con certeza: null y el boton se apaga.
  return null;
}

/**
 * El mismo numero pero solo digitos y sin '+', que es lo que exige wa.me.
 *
 * @param {string} telefono
 * @returns {string|null}    '5216861234567' o null
 */
export function numeroWhatsApp(telefono) {
  const e164 = aE164(telefono);
  return e164 ? e164.slice(1) : null;
}

/** Enlace para marcar directo: 'tel:+526621234567'. */
export function enlaceLlamada(telefono) {
  const e164 = aE164(telefono);
  return e164 ? `tel:${e164}` : null;
}

/**
 * Enlace de WhatsApp con el mensaje ya escrito.
 *
 * @param {string} telefono
 * @param {string} mensaje  texto que se abre en la caja de escritura
 * @returns {string|null}   URL de wa.me o null si el numero no resuelve
 */
export function enlaceWhatsApp(telefono, mensaje) {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return null;
  const texto = String(mensaje ?? '').trim();
  return texto
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/${numero}`;
}

/**
 * Enlace de correo con asunto y cuerpo ya escritos.
 *
 * @param {string} correo
 * @param {string} [asunto]
 * @param {string} [mensaje]
 * @returns {string|null}   URL mailto: o null si el correo no es valido
 */
export function enlaceCorreo(correo, asunto, mensaje) {
  const destino = String(correo ?? '').trim().toLowerCase();
  // Misma validacion laxa que usa el backend (db-map.js, tipo 'correo').
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return null;

  const params = [];
  const cto = String(asunto ?? '').trim();
  if (cto) params.push(`subject=${encodeURIComponent(cto)}`);
  const cuerpo = String(mensaje ?? '').trim();
  if (cuerpo) params.push(`body=${encodeURIComponent(cuerpo)}`);

  // El primer separador es '?' y los siguientes '&'. Si se une todo con '?'
  // el mailto queda mal formado y el cliente de correo no abre el borrador.
  return `mailto:${destino}${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * Une el prefijo institucional con lo que escribio el administrador.
 *
 * El prefijo evita el problema clasico de estos avisos: un texto que empieza
 * en seco ("oye, el muchacho se hizo dano en la pierna") y que el contacto de
 * emergencia no puede ubicar. El prefijo identifica al gym de entrada.
 *
 * @param {string} prefijo  texto configurable en Configuracion y Avisos
 * @param {string} cuerpo   lo que escribio el administrador
 * @returns {string}        mensaje final, sin espacios de sobra
 */
export function mensajeConPrefijo(prefijo, cuerpo) {
  const p = String(prefijo ?? '').trim();
  const c = String(cuerpo ?? '').trim();
  if (p && c) return `${p}\n\n${c}`;
  return p || c;
}