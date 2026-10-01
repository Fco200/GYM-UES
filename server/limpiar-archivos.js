/**
 * Gym UES - Limpieza de archivos huerfanos en MongoDB Atlas (GridFS).
 *
 * Cuando un alumno quita su foto o su certificado, el archivo NO se borra de la
 * base (ver server/almacen.js: con deduplicacion varios registros pueden
 * apuntar al mismo archivo). Eso evita romper enlaces ajenos, pero con el tiempo
 * se acumulan archivos que ya nadie referencia y consumen espacio de Atlas.
 *
 * Este script encuentra esos huerfanos y los elimina. Es seguro: solo borra lo
 * que ningun alumno ni ningun ajuste menciona.
 *
 * USO
 *   npm run limpiar:archivos            (informa y borra)
 *   npm run limpiar:archivos -- --dry   (solo informa)
 */
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const almacen = require('./almacen');
const { Alumno, Ajuste } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DRY = process.argv.includes('--dry');
const CAMPOS_ALUMNO = ['image_url', 'medical_certificate', 'certificate_file'];

function log(m) {
  console.log(`[limpiar] ${m}`);
}

async function main() {
  if (!MONGODB_URI) {
    console.error('[limpiar] Falta MONGODB_URI en .env. Abortando.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  log(`Conectado a Atlas (base "${mongoose.connection.name}").`);

  // Todo lo que esta referenciado hoy.
  const enUso = new Set();
  for (const a of await Alumno.find({}).select(CAMPOS_ALUMNO.join(' ')).lean()) {
    for (const campo of CAMPOS_ALUMNO) {
      const id = almacen.idDesdeUrl(a[campo]);
      if (id) enUso.add(id);
    }
  }
  for (const aj of await Ajuste.find({}).lean()) {
    const id = almacen.idDesdeUrl(aj.setting_value);
    if (id) enUso.add(id);
  }
  log(`Archivos referenciados: ${enUso.size}.`);

  const todos = await mongoose.connection.db
    .collection(`${almacen.BUCKET}.files`)
    .find({}, { projection: { filename: 1, length: 1, 'metadata.nombreOriginal': 1 } })
    .toArray();

  const huerfanos = todos.filter((f) => !enUso.has(String(f._id)));

  if (huerfanos.length === 0) {
    log('No hay archivos huerfanos. Nada que hacer.');
    await mongoose.connection.close();
    return;
  }

  const bytes = huerfanos.reduce((n, f) => n + (f.length || 0), 0);
  log(`Huerfanos: ${huerfanos.length} archivo(s), ${(bytes / (1024 * 1024)).toFixed(2)} MB.`);
  for (const f of huerfanos.slice(0, 20)) {
    const nombre = (f.metadata && f.metadata.nombreOriginal) || f.filename;
    log(`  ${String(f._id)}  ${nombre}`);
  }
  if (huerfanos.length > 20) log(`  ... y ${huerfanos.length - 20} mas.`);

  if (DRY) {
    log('--dry: no se borro nada.');
  } else {
    let borrados = 0;
    for (const f of huerfanos) {
      // GridFSBucket.delete() resuelve con void (no devuelve true/false), asi
      // que el exito se mide con el conteo final, no con su valor de retorno.
      // eslint-disable-next-line no-await-in-loop
      await almacen.borrarArchivo(f._id);
      borrados++;
    }
    log(`Archivos eliminados: ${borrados}.`);
  }

  const stats = await almacen.estadisticas();
  log(`Quedan en Atlas: ${stats.archivos} archivo(s), ${(stats.bytes / (1024 * 1024)).toFixed(2)} MB.`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('[limpiar] ERROR:', err.message);
  process.exit(1);
});
