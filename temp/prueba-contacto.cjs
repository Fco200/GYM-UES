/**
 * Verificacion de la capa de contacto del frontend (sin HTTP ni Atlas).
 *
 * El punto delicateo de los avisos por WhatsApp es la conversion del telefono:
 * `wa.me` exige E.164 y solo digitos, pero el campo `phone` se guarda como texto
 * libre porque en un gimnasio se captura como lo dicta la persona. Si el
 * normalizador se equivoca, el boton abre una conversacion equivocada o directamente
 * no abre nada, y eso en un aviso de emergencia es lo peor que puede pasar.
 *
 * Estos casos son los formatos que de verdad aparecen en la base: numeros de
 * Hermosillo y Ciudad Obregon, con y sin codigo de pais, con el '1' de larga
 * distancia que usaban los moviles viejos, y los formatos que NO se pueden
 * resolver (y que por eso deben devolver null y dejar el boton apagado).
 *
 *   node temp/prueba-contacto.cjs
 */

let ok = 0;
let fallos = 0;

function check(nombre, condicion, detalle = '') {
  if (condicion) {
    ok += 1;
    console.log(`  OK   ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}${detalle ? ' -> ' + detalle : ''}`);
  }
}

function igual(nombre, obtenido, esperado) {
  check(nombre, obtenido === esperado, `esperado ${esperado}, obtenido ${obtenido}`);
}

(async () => {
  // El modulo del frontend es ESM y este archivo es CommonJS, asi que se trae
  // con import dinamico.
  const { aE164, numeroWhatsApp, enlaceLlamada, enlaceWhatsApp, enlaceCorreo, mensajeConPrefijo } =
    await import('../src/services/contacto.js');

  console.log('\n[1] Numeros locales de 10 digitos (con codigo de area)');
  igual('662 123 4567', aE164('662 123 4567'), '+526621234567');
  igual('662-123-4567', aE164('662-123-4567'), '+526621234567');
  igual('(503) 211-1234', aE164('(503) 211-1234'), '+525032111234');
  igual('  6861234567  ', aE164('  6861234567  '), '+526861234567');
  igual('sin espacios ni signos', aE164('6331234567'), '+526331234567');

  console.log('\n[2] Numeros que ya traen codigo de pais');
  igual('+52 662 555 1111', aE164('+52 662 555 1111'), '+526625551111');
  igual('52 686 123 4567', aE164('52 686 123 4567'), '+526861234567');
  igual('526621234567', aE164('526621234567'), '+526621234567');

  console.log('\n[3] Moviles con el "1" de larga distancia (formato viejo)');
  igual('5216861234567', aE164('5216861234567'), '+526861234567');
  igual('1 686 123 4567', aE164('1 686 123 4567'), '+526861234567');
  igual('16861234567', aE164('16861234567'), '+526861234567');

  console.log('\n[4] Formatos que NO se pueden resolver -> null');
  // Nada de adivinar: si no se sabe el numero completo, es mejor apagar el
  // boton que abrir una conversacion con alguien que no es.
  igual('local de 7 digitos sin area', aE164('3123456'), null);
  igual('local de 8 digitos sin area', aE164('12345678'), null);
  igual('texto con letras', aE164('7xxx xxxx'), null);
  igual('numero demasiado corto', aE164('12345'), null);
  igual('numero demasiado largo', aE164('1234567890123456'), null);
  igual('cadena vacia', aE164(''), null);
  igual('nulo', aE164(null), null);
  igual('indefinido', aE164(undefined), null);

  console.log('\n[5] Enlaces de llamada y WhatsApp');
  igual('tel: normaliza a E.164', enlaceLlamada('662 123 4567'), 'tel:+526621234567');
  igual('wa.me sin texto', enlaceWhatsApp('662 123 4567', ''), 'https://wa.me/526621234567');
  igual(
    'wa.me con texto',
    enlaceWhatsApp('662 123 4567', 'Su hijo se lesionó el pie'),
    'https://wa.me/526621234567?text=Su%20hijo%20se%20lesion%C3%B3%20el%20pie'
  );
  check(
    'wa.me escapa & y %',
    enlaceWhatsApp('6621234567', 'a & b 100%') ===
      'https://wa.me/526621234567?text=a%20%26%20b%20100%25'
  );
  igual('wa.me null si el numero no resuelve', enlaceWhatsApp('3123456', 'hola'), null);
  igual('tel: null si el numero no resuelve', enlaceLlamada('3123456'), null);

  console.log('\n[6] Enlaces de correo');
  igual(
    'mailto con asunto y cuerpo',
    enlaceCorreo('MADRE@Ejemplo.COM', 'Aviso', 'Su hijo se lesionó'),
    'mailto:madre@ejemplo.com?subject=Aviso&body=Su%20hijo%20se%20lesion%C3%B3'
  );
  igual('mailto solo destino', enlaceCorreo('madre@ejemplo.com'), 'mailto:madre@ejemplo.com');
  igual('mailto null si no es correo', enlaceCorreo('no-es-correo', 'Aviso', 'hola'), null);
  igual('mailto null si falta @', enlaceCorreo('madre.ejemplo.com'), null);

  console.log('\n[7] Armado del mensaje con prefijo institucional');
  igual(
    'prefijo + cuerpo',
    mensajeConPrefijo('Gym UES', 'Se lesionó el pie.'),
    'Gym UES\n\nSe lesionó el pie.'
  );
  igual('sin prefijo', mensajeConPrefijo('', 'Solo cuerpo'), 'Solo cuerpo');
  igual('sin cuerpo', mensajeConPrefijo('Solo prefijo', ''), 'Solo prefijo');
  igual('ambos vacios', mensajeConPrefijo('', ''), '');
  igual('prefijo con espacios de sobra', mensajeConPrefijo('  Gym UES  ', '  Hola  '), 'Gym UES\n\nHola');
  check('numeroWhatsApp sin +', /^52\d{10}$/.test(numeroWhatsApp('1 686 123 4567')));

  console.log(`\n${fallos ? 'FALLOS' : 'TODO OK'}: ${ok} OK, ${fallos} con fallo\n`);
  process.exit(fallos ? 1 : 0);
})().catch((err) => {
  console.error('\nError inesperado:', err);
  process.exit(1);
});