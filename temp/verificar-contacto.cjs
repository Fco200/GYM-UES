/**
 * Verificacion de la capa de datos (sin HTTP): comprueba que los campos nuevos
 * de contacto y emergencia se normalizan igual a como los espera el modelo y
 * que un ciclo real guardar->leer contra Atlas devuelve exactamente lo que se
 * escribio. Todo el documento de prueba se borra al final.
 *
 *   node temp/verificar-contacto.cjs
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Alumno } = require('../server/models');
const { normalizarEntidad, formatearFechaLocal } = require('../server/db-map');

const CLAVE = 'PRUEBA-E2E-CONTACTO';
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

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  // Limpieza previa por si una corrida anterior quedo a medias.
  await Alumno.deleteMany({ student_code: CLAVE });

  console.log('\n[1] Normalizacion de campos de contacto');
  const entrada = {
    full_name: 'Prueba',
    second_name: 'Contacto',
    last_name: 'Temporal',
    type: 'alumno',
    academic_unit: 'Hermosillo',
    phone: '  662-123-4567  ',
    email: '  PRUEBA.Contacto@UES.MX ',
    emergency_contact: {
      name: '  Maria Contacto  ',
      relationship: '  Madre  ',
      phone: '+52 662 555 1111',
      email: 'Mama.Contacto@Ejemplo.COM'
    }
  };

  const normalizada = normalizarEntidad('alumnos', entrada, { completo: true });
  check('la normalizacion no reporta errores', normalizada.errores.length === 0, normalizada.errores.join('; '));
  const doc = normalizada.datos;
  check('telefono queda sin espacios sobrantes', doc.phone === '662-123-4567', doc.phone);
  check('correo queda en minusculas', doc.email === 'prueba.contacto@ues.mx', doc.email);
  check('emergencia: nombre recortado', doc.emergency_contact?.name === 'Maria Contacto', doc.emergency_contact?.name);
  check('emergencia: parentesco recortado', doc.emergency_contact?.relationship === 'Madre', doc.emergency_contact?.relationship);
  check('emergencia: telefono conserva el +', doc.emergency_contact?.phone === '+52 662 555 1111', doc.emergency_contact?.phone);
  check('emergencia: correo en minusculas', doc.emergency_contact?.email === 'mama.contacto@ejemplo.com', doc.emergency_contact?.email);

  console.log('\n[2] Rechazo de datos invalidos');
  const malo = normalizarEntidad('alumnos', { full_name: 'X', second_name: 'Y', last_name: 'Z', email: 'no-es-correo' }, { completo: true });
  check('correo invalido se reporta como error', malo.errores.length > 0, JSON.stringify(malo.datos.email));
  const sinEmergencia = normalizarEntidad('alumnos', { full_name: 'X', second_name: 'Y', last_name: 'Z' }, { completo: true });
  check('emergencia ausente no rompe', !sinEmergencia.errores.length, sinEmergencia.errores.join('; '));

  console.log('\n[3] Ciclo real guardar -> leer en Atlas');
  const creado = await Alumno.create({ ...doc, student_code: CLAVE });
  check('se genero _id', Boolean(creado._id));
  const leido = await Alumno.findOne({ student_code: CLAVE }).lean();
  check('telefono persistido', leido.phone === '662-123-4567', leido.phone);
  check('correo persistido en minusculas', leido.email === 'prueba.contacto@ues.mx', leido.email);
  check('emergencia anidada persistida', leido.emergency_contact?.phone === '+52 662 555 1111', JSON.stringify(leido.emergency_contact));
  check('created_at es un Date real', leido.created_at instanceof Date, typeof leido.created_at);

  console.log('\n[4] Serializacion de hora local');
  const textoFecha = formatearFechaLocal(leido.created_at);
  check('created_at se serializa como texto local', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(textoFecha), textoFecha);
  const ahoraTexto = formatearFechaLocal(new Date());
  const desvioMin = Math.abs((new Date(ahoraTexto.replace(' ', 'T')) - new Date()) / 60000);
  check('la hora serializada no se desvÃ­a de la local', desvioMin < 2, `desvio ${desvioMin.toFixed(2)} min`);

  console.log('\n[5] Actualizacion parcial (como la hace la ficha tecnica)');
  await Alumno.updateOne(
    { student_code: CLAVE },
    { $set: { phone: '662 999 0000', 'emergency_contact.name': 'Papa Contacto' } }
  );
  const trasUpdate = await Alumno.findOne({ student_code: CLAVE }).lean();
  check('telefono actualizado', trasUpdate.phone === '662 999 0000', trasUpdate.phone);
  check('emergencia actualizada', trasUpdate.emergency_contact?.name === 'Papa Contacto', trasUpdate.emergency_contact?.name);

  const borrados = await Alumno.deleteMany({ student_code: CLAVE });
  check('limpieza: documento de prueba eliminado', borrados.deletedCount === 1, `borrados ${borrados.deletedCount}`);
  const restante = await Alumno.countDocuments({ student_code: CLAVE });
  check('limpieza: no quedan residuos', restante === 0, `quedan ${restante}`);

  await mongoose.disconnect();
  console.log(`\n=== ${ok} pruebas OK, ${fallos} fallas ===`);
  process.exit(fallos ? 1 : 0);
})().catch(async (err) => {
  console.error('Error en la verificacion:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});