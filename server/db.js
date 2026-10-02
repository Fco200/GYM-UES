/**
 * Gym UES - Conexion a MongoDB Atlas (Mongoose) e inicializacion de la base.
 *
 * Sustituye al pool de MySQL (server/db.js anterior). A partir de aqui toda la
 * persistencia pasa por los modelos de server/models.
 *
 * Rendimiento (requisito "peticiones rapidas"):
 *   - Pool de conexiones persistente (minPoolSize) para no reconectar en cada
 *     peticion.
 *   - maxIdleTimeMS por debajo del corte de Atlas (~60 s) para que el socket no
 *     muera entre usuarios y la primera peticion tras la pausa no pague el
 *     handshake TLS otra vez.
 *   - serverSelectionTimeoutMS acotado: si Atlas no responde, el API falla
 *     rapido y con un mensaje claro en vez de dejar la peticion colgada.
 *   - ensureIndexes(): crea los indices de los modelos al arrancar, que es lo
 *     que hace que los listados y reportes no hagan COLLSCAN.
 */
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const { Usuario, Ajuste, Alumno, Asistencia } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

// Cuentas admin iniciales: el administrador del gimnasio, los dos turnos
// (matutino y vespertino) y el jefe de carrera. Se crean SOLO si la coleccion
// esta vacia, para no pisar un Atlas que ya tiene usuarios.
const DEFAULT_USERS = [
  { username: 'super_admin', role: 'super_admin' },
  { username: 'admin', role: 'admin' },
  { username: 'matutino', role: 'admin_matutino' },
  { username: 'vespertino', role: 'admin_vespertino' },
  { username: 'jefecarrera', role: 'jefe_carrera' },
  { username: 'administradorgym', role: 'administrador_gym' }
];

const DEFAULT_SETTINGS = {
  reglamento:
    'REGLAMENTO DEL GIMNASIO UES\n\n1. Presentarse con una identificacion valida.\n' +
    '2. Usar el uniforme correspondiente.\n' +
    '3. El uso del gimnasio es exclusivo para miembros registrados.\n' +
    '4. Mantener limpio el area de trabajo.',
  horarios:
    'HORARIOS DEL GIMNASIO UES\n\nLunes a Viernes: 6:00 AM - 8:00 PM\n' +
    'Sabado: 7:00 AM - 4:00 PM\nDomingo: Cerrado'
};

// Silencia el aviso de que un modelo se recompila en desarrollo (HMR).
mongoose.set('strictQuery', true);

let conectado = false;
let indicesArreglados = false;

/**
 * Abre la conexion con Atlas. Es idempotente: si ya hay una conexion viva,
 * la reutiliza (importante porque Electron y nodemon la invocan mas de una vez).
 */
async function initDatabase() {
  if (mongoose.connection.readyState === 1) {
    conectado = true;
    return mongoose.connection;
  }

  if (!MONGODB_URI) {
    throw new Error(
      'Falta la variable MONGODB_URI. Copia .env.example a .env y pega la URI de MongoDB Atlas.'
    );
  }

  mongoose.connection.on('connected', () => {
    conectado = true;
    console.log('[db] Conectado a MongoDB Atlas:', mongoose.connection.name || 'gym_ues');
  });
  mongoose.connection.on('disconnected', () => {
    conectado = false;
    console.warn('[db] Conexion con MongoDB Atlas perdida. Reconectando...');
  });
  mongoose.connection.on('error', (err) => {
    conectado = false;
    console.error('[db] Error de conexion con MongoDB Atlas:', err.message);
  });

  await mongoose.connect(MONGODB_URI, {
    // Pool: mantiene conexiones vivas y evita el handshake TLS por peticion.
    maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL || 2),
    waitQueueTimeoutMS: 10000,
    // Atlas corta conexiones ociosas en ~60 s: si el socket muere antes, cada
    // peticion posterior paga reconexion + TLS y la app "se siente lenta".
    maxIdleTimeMS: 45000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    family: 4
  });

  conectado = true;
  await asegurarIndices();
  await seedDefaults();
  await migrarTipoPersonal();
  return mongoose.connection;
}

/**
 * Crea los indices declarados en cada modelo. Con autoIndex de Mongoose esto
 * ya se hace en segundo plano al conectar; aqui se fuerza de forma explicita
 * y una sola vez por proceso para que el arranque sea predecible.
 */
async function asegurarIndices() {
  if (indicesArreglados) return;
  try {
    const mongooseModels = mongoose.connection.models;
    for (const nombre of ['Alumno', 'Asistencia', 'Usuario', 'Ajuste']) {
      const modelo = mongooseModels[nombre];
      if (modelo) await modelo.createIndexes();
    }
    indicesArreglados = true;
    console.log('[db] Indices verificados en MongoDB Atlas.');
  } catch (err) {
    console.warn('[db] No se pudieron crear todos los indices:', err.message);
  }
}

/**
 * Inserta los datos por defecto SOLO en una base nueva (colecciones vacias).
 * IMPORTANTE: si ya hay datos en Atlas NO se crea ni se modifica ninguna
 * cuenta: se conservan tal cual los usuarios existentes.
 */
async function seedDefaults() {
  try {
    const totalUsers = await Usuario.countDocuments();
    if (totalUsers === 0) {
      await Usuario.insertMany(
        DEFAULT_USERS.map((c) => ({
          username: c.username,
          password: 'admin123',
          role: c.role,
          scope_values: [],
          active: true,
          created_at: new Date()
        }))
      );
      console.log('[db] Cuentas admin iniciales creadas (contrasena admin123).');
    } else {
      console.log(`[db] Atlas ya tiene ${totalUsers} usuario(s): se conservan las cuentas.`);
    }
  } catch (err) {
    console.warn('[db] Seed de admins omitido:', err.message);
  }

  try {
    for (const [clave, valor] of Object.entries(DEFAULT_SETTINGS)) {
      // upsert: si el administrador edito el reglamento, no se sobrescribe.
      await Ajuste.updateOne(
        { setting_key: clave },
        { $setOnInsert: { setting_value: valor, updated_at: new Date() } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn('[db] Seed de configuracion omitido:', err.message);
  }
}

/**
 * Renombra el tipo historico 'maestro' a 'personal' en alumnos y asistencias.
 *
 * El catalogo institucional ya no distingue "maestro" de "trabajador de la
 * UES": al gimnasio llegan docentes, administrativos, servicios, apoyo a la
 * docencia y directivos, y todos se capturan como 'personal' con su area y su
 * puesto. Esta migracion es idempotente y barata (una consulta con filtro por
 * 'maestro' que, cuando ya no hay nada que cambiar, no toca ningun documento),
 * asi que se puede ejecutar en cada arranque sin riesgo.
 *
 * Los documentos que aun no tengan unidad academica, area ni puesto (capturados
 * antes de que existieran esos campos) se rellenan con '' para que los listados
 * y los reportes reciban siempre la misma forma de documento.
 */
async function migrarTipoPersonal() {
  try {
    const [alumnos, asistencias] = await Promise.all([
      Alumno.updateMany({ type: 'maestro' }, { $set: { type: 'personal' } }),
      Asistencia.updateMany({ user_type: 'maestro' }, { $set: { user_type: 'personal' } })
    ]);

    const nuevosCampos = { $set: { academic_unit: '', work_area: '', job_title: '' } };
    const [sinUnidad, sinArea, sinPuesto] = await Promise.all([
      Alumno.updateMany({ academic_unit: { $exists: false } }, nuevosCampos),
      Alumno.updateMany({ work_area: { $exists: false } }, { $set: { work_area: '' } }),
      Alumno.updateMany({ job_title: { $exists: false } }, { $set: { job_title: '' } })
    ]);

    const total =
      (alumnos.modifiedCount || 0) +
      (asistencias.modifiedCount || 0) +
      (sinUnidad.modifiedCount || 0) +
      (sinArea.modifiedCount || 0) +
      (sinPuesto.modifiedCount || 0);

    if (total > 0) {
      console.log(
        `[db] Migracion a 'personal' aplicada: ${alumnos.modifiedCount || 0} alumno(s) y ` +
          `${asistencias.modifiedCount || 0} asistencia(s) renombradas; ` +
          `${sinUnidad.modifiedCount || 0} registro(s) con unidad academica vacia.`
      );
    }
  } catch (err) {
    // La migracion nunca debe impedir que el portal arranque: si falla, se
    // reporta y el admin completa los datos desde la interfaz.
    console.warn('[db] Migracion a tipo personal omitida:', err.message);
  }
}

/** Estado de la conexion, para /api/health y la pantalla de login. */
function estadoDB() {
  const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
  return {
    conectado: mongoose.connection.readyState === 1,
    estado: estados[mongoose.connection.readyState] || 'desconocido',
    base: mongoose.connection.name || null
  };
}

/** Cierra la conexion de forma ordenada (SIGINT/SIGTERM en el despliegue web). */
async function cerrarDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close(false);
  conectado = false;
}

module.exports = { initDatabase, cerrarDB, estadoDB, mongoose, MONGODB_URI, DEFAULT_USERS, DEFAULT_SETTINGS, migrarTipoPersonal };
