/**
 * Gym UES - Migracion de datos de MySQL (XAMPP) a MongoDB Atlas.
 *
 * Copia las cuatro tablas del esquema anterior a las colecciones de Mongoose,
 * respetando la clave natural de cada una para que el script sea IDEMPOTENTE:
 * se puede ejecutar dos veces sin duplicar nada.
 *
 *   students  -> alumnos       (clave: student_code)
 *   attendance-> asistencias   (sin clave natural: se inserta tal cual)
 *   users     -> usuarios      (clave: username)
 *   settings  -> ajustes       (clave: setting_key)
 *
 * USO
 *   1) Copia .env.example a .env y llena MONGODB_URI y las variables DB_*
 *      (las de MySQL) con los datos de tu XAMPP.
 *   2) Con XAMPP/MySQL encendido y Atlas accesible:
 *        npm run migrar
 *   3) Para empezar de cero en Atlas (BORRA las colecciones):
 *        npm run migrar -- --wipe
 *
 * IMPORTANTE: este script solo LEE de MySQL. Nunca borra nada de MySQL, asi
 * que puedes dejar XAMPP funcionando y revertir si algo sale mal.
 */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

const { Alumno, Asistencia, Usuario, Ajuste } = require('./models');
const { aFechaLocal } = require('./db-map');
const catalogos = require('./catalogos');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'gym_ues_db';

const WIPE = process.argv.includes('--wipe');
const LOTE = 1000;

function log(mensaje) {
  console.log(`[migrar] ${mensaje}`);
}

// ---------- Origen: MySQL ----------

async function leerMySQL() {
  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    charset: 'utf8mb4'
  });
  try {
    log(`Leyendo MySQL ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME} ...`);
    const [tables] = await pool.query('SHOW TABLES');
    const nombres = tables.map((t) => Object.values(t)[0]);
    const datos = {};

    // students
    if (nombres.includes('students')) {
      const [rows] = await pool.query('SELECT * FROM students');
      datos.students = rows;
      log(`  students: ${rows.length} fila(s)`);
    }
    // attendance
    if (nombres.includes('attendance')) {
      const [rows] = await pool.query('SELECT * FROM attendance');
      datos.attendance = rows;
      log(`  attendance: ${rows.length} fila(s)`);
    }
    // users
    if (nombres.includes('users')) {
      const [rows] = await pool.query('SELECT * FROM users');
      datos.users = rows;
      log(`  users: ${rows.length} fila(s)`);
    }
    // settings
    if (nombres.includes('settings')) {
      const [rows] = await pool.query('SELECT * FROM settings');
      datos.settings = rows;
      log(`  settings: ${rows.length} fila(s)`);
    }
    return datos;
  } finally {
    await pool.end();
  }
}

// ---------- Transformacion MySQL -> documentos ----------

/** Recorta a texto plano; las columnas ENUM legado se canonicalizan aparte. */
function txt(v, max = 200) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

/** Convierte el DATETIME de MySQL a Date local (nunca UTC). */
function fecha(v) {
  if (!v) return null;
  return aFechaLocal(v instanceof Date ? v : String(v));
}

// Los tipos salen del catalogo compartido: 'maestro' es alias de 'personal',
// asi que los registros legacy del dump de MySQL llegan ya con el tipo actual.
function canonTipo(v) {
  return catalogos.canonicalizarTipo(txt(v, 40)) || 'alumno';
}

function aAlumno(r) {
  return {
    student_code: txt(r.student_code || r.student_number, 50),
    full_name: txt(r.full_name || r.name, 200),
    second_name: txt(r.second_name || r.apellido_paterno, 200),
    last_name: txt(r.last_name || r.apellido_materno || r.lastname, 200),
    type: canonTipo(r.type || r.member_type),
    gender: txt(r.gender, 20),
    turn: txt(r.turn, 50),
    // Campos nuevos del catalogo institucional. El dump de MySQL no los tiene,
    // asi que se dejan vacios: los captura el administrador desde el portal.
    academic_unit: txt(r.academic_unit, 80),
    career: txt(r.career, 200),
    work_area: txt(r.work_area, 60),
    job_title: txt(r.job_title, 120),
    image_url: txt(r.image_url, 500),
    // El esquema legacy usaba tinyint(1) para el certificado medico.
    medical_certificate:
      r.medical_certificate === 1 || r.medical_certificate === '1'
        ? 'Si'
        : r.medical_certificate === 0 || r.medical_certificate === '0'
          ? 'No'
          : txt(r.medical_certificate, 255) || 'No',
    created_at: fecha(r.created_at) || new Date()
  };
}

function aAsistencia(r) {
  return {
    student_code: txt(r.student_code, 50),
    full_name: txt(r.full_name, 200),
    user_type: canonTipo(r.user_type || r.type),
    check_in: fecha(r.check_in),
    check_out: fecha(r.check_out),
    created_at: fecha(r.created_at) || new Date()
  };
}

function aUsuario(r) {
  // scope_values venia como texto JSON; ahora es un array real.
  let carreras = [];
  if (r.scope_values) {
    try {
      const v = typeof r.scope_values === 'string' ? JSON.parse(r.scope_values) : r.scope_values;
      if (Array.isArray(v)) carreras = v.map((c) => txt(c, 50)).filter(Boolean);
    } catch {
      carreras = String(r.scope_values)
        .split(/[;,]/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
  }
  return {
    username: txt(r.username || r.email, 100),
    // La contrasena se copia TAL CUAL: el login acepta bcrypt y texto plano.
    password: r.password === null || r.password === undefined ? '' : String(r.password),
    role: txt(r.role, 50) || 'admin',
    scope_values: carreras,
    active: Number(r.active === undefined ? 1 : r.active) === 1,
    created_at: fecha(r.created_at) || new Date()
  };
}

function aAjuste(r) {
  return {
    setting_key: txt(r.setting_key, 100),
    setting_value: r.setting_value === null || r.setting_value === undefined ? '' : String(r.setting_value),
    updated_at: fecha(r.updated_at) || new Date()
  };
}

// ---------- Destino: MongoDB ----------

/**
 * Inserta por lotes con upsert sobre la clave natural.
 * Si `clave` es null (asistencias no tienen clave natural) cada documento se
 * inserta como nuevo: NO vuelvas a ejecutar el script sin --wipe o se
 * duplicaria todo el historial de asistencias.
 */
async function volcar(Model, documentos, clave, etiqueta) {
  if (documentos.length === 0) {
    log(`  ${etiqueta}: nada que migrar.`);
    return 0;
  }
  if (!clave) {
    log(`  ${etiqueta}: ${documentos.length} documento(s) SIN clave natural, se insertan como nuevos.`);
  }
  let insertados = 0;
  let actualizados = 0;
  for (let i = 0; i < documentos.length; i += LOTE) {
    const lote = documentos.slice(i, i + LOTE);
    const r = await Model.bulkWrite(
      lote.map((doc) => ({
        updateOne: {
          filter: clave ? { [clave]: doc[clave] } : { _id: new mongoose.Types.ObjectId() },
          update: { $set: doc },
          upsert: true
        }
      })),
      { ordered: false }
    );
    insertados += r.upsertedCount || 0;
    actualizados += r.modifiedCount || 0;
  }
  log(`  ${etiqueta}: ${insertados} nuevo(s), ${actualizados} actualizado(s).`);
  return insertados;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('Falta MONGODB_URI en el archivo .env. Abortando.');
    process.exit(1);
  }

  const datos = await leerMySQL();

  log('Conectando a MongoDB Atlas ...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  log(`  Conectado a la base "${mongoose.connection.name}".`);

  if (WIPE) {
    log('--wipe: borrando las colecciones de Atlas antes de migrar ...');
    await Promise.all([
      Alumno.deleteMany({}),
      Asistencia.deleteMany({}),
      Usuario.deleteMany({}),
      Ajuste.deleteMany({})
    ]);
  }

  log('Escribiendo en Atlas ...');
  await volcar(Ajuste, (datos.settings || []).map(aAjuste), 'setting_key', 'ajustes');
  await volcar(Usuario, (datos.users || []).map(aUsuario), 'username', 'usuarios');
  await volcar(Alumno, (datos.students || []).map(aAlumno), 'student_code', 'alumnos');
  await volcar(Asistencia, (datos.attendance || []).map(aAsistencia), null, 'asistencias');

  const resumen = {
    alumnos: await Alumno.countDocuments(),
    asistencias: await Asistencia.countDocuments(),
    usuarios: await Usuario.countDocuments(),
    ajustes: await Ajuste.countDocuments()
  };
  log(`Listo. En Atlas hay: ${JSON.stringify(resumen)}`);
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('[migrar] ERROR:', err.message);
  if (/ECONNREFUSED|ER_ACCESS_DENIED|Unknown database/i.test(err.message)) {
    console.error('  -> Revisa que XAMPP/MySQL este encendido y que DB_* en .env sean correctos.');
  }
  if (/Server selection|MongooseServerSelectionError|getaddrinfo/i.test(err.message)) {
    console.error('  -> Revisa MONGODB_URI en .env y que tu IP este en la lista de acceso de Atlas.');
  }
  process.exit(1);
});
