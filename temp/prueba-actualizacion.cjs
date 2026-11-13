/**
 * Prueba de integracion del autoservicio de datos (solo para desarrollo).
 *
 * Crea un alumno temporal, ejercita GET/PUT /api/public/alumno/:code contra la
 * app real de Express y lo elimina al final. No forma parte de `npm test`
 * porque necesita MONGODB_URI.
 */
'use strict';

require('dotenv').config();
const assert = require('assert');
const { initDatabase, cerrarDB } = require('../server/db');
const { Alumno } = require('../server/models');
const app = require('../server/index').app;

(async () => {
  const code = `ZZTEST${Date.now()}`;
  let creado = null;
  let servidor = null;
  let fallos = 0;

  const ok = (nombre, condicion) => {
    if (condicion) {
      console.log(`  OK   ${nombre}`);
    } else {
      fallos += 1;
      console.log(`  FALLO ${nombre}`);
    }
  };

  try {
    await initDatabase();

    creado = await Alumno.create({
      student_code: code,
      full_name: 'Prueba',
      second_name: 'Automática',
      last_name: 'Temporal',
      email: 'prueba@example.com',
      phone: '6621234567',
      academic_unit: 'Hermosillo',
      turn: 'Matutino',
      career: 'Ingeniería en Software',
      type: 'alumno',
      image_url: '',
      medical_certificate: 'No',
      created_at: new Date()
    });

    servidor = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => servidor.once('listening', resolve));
    const puerto = servidor.address().port;
    const base = `http://127.0.0.1:${puerto}/api/public/alumno`;

    const getJson = async (url, opciones) => {
      const res = await fetch(url, opciones);
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };

    console.log('\n[1] Consulta por expediente');
    let r = await getJson(`${base}/${code}`);
    ok('responde 200', r.res.status === 200);
    ok('devuelve el expediente', r.data.estudiante?.student_code === code);
    ok('devuelve el correo', r.data.estudiante?.email === 'prueba@example.com');
    ok('no devuelve el certificado', !('medical_certificate' in (r.data.estudiante || {})));

    r = await getJson(`${base}/${code.toLowerCase()}`);
    ok('encuentra sin distinguir mayúsculas', r.res.status === 200);

    r = await getJson(`${base}/NO-EXISTE-${Date.now()}`);
    ok('expediente inexistente responde 404', r.res.status === 404);

    console.log('\n[2] Actualización de datos');
    r = await getJson(`${base}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Prueba',
        second_name: 'Actualizada',
        last_name: 'Temporal',
        email: 'nuevo@example.com',
        phone: '662 987 6543',
        academic_unit: 'Navojoa',
        turn: 'Vespertino',
        career: 'Ingeniería Industrial y de Sistemas',
        image_url: '',
        // Intentos que el backend debe ignorar:
        type: 'personal',
        student_code: 'HACKEADO',
        medical_certificate: 'Si'
      })
    });
    ok('responde 200', r.res.status === 200);
    ok('corrige el correo', r.data.estudiante?.email === 'nuevo@example.com');
    ok('corrige el teléfono', r.data.estudiante?.phone === '662 987 6543');
    ok('corrige la carrera', r.data.estudiante?.career === 'Ingeniería Industrial y de Sistemas');

    const enBd = await Alumno.findOne({ student_code: code }).lean();
    ok('no cambia el tipo de persona', enBd.type === 'alumno');
    ok('no cambia el expediente', enBd.student_code === code);
    ok('no cambia el certificado', enBd.medical_certificate === 'No');

    console.log('\n[3] Actualización parcial y validaciones');
    r = await getJson(`${base}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '6621112233' })
    });
    ok('acepta cambio parcial', r.res.status === 200 && r.data.estudiante?.phone === '6621112233');

    r = await getJson(`${base}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'correo-invalido' })
    });
    ok('rechaza correo inválido', r.res.status === 400);

    r = await getJson(`${base}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: 'javascript:alert(1)' })
    });
    ok('rechaza URL de foto no permitida', r.res.status === 400);

    r = await getJson(`${base}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: '' })
    });
    ok('rechaza nombre vacío', r.res.status === 400);

    console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLO(S)`}`);
  } catch (err) {
    fallos += 1;
    console.error('\nError inesperado:', err.message);
  } finally {
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    if (creado) await Alumno.deleteOne({ _id: creado._id });
    await cerrarDB();
    process.exitCode = fallos === 0 ? 0 : 1;
  }
})();
