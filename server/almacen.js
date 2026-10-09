/**
 * Gym UES - Almacenamiento de archivos en MongoDB Atlas (GridFS).
 *
 * ¿POR QUÉ NO DISCO?
 * En un despliegue PaaS (Render, Railway, Heroku) el sistema de archivos es
 * EFÍMERO: cada redespliegue, cada reinicio y cada cambio de configuración
 * borra el disco y, con él, todas las fotos de alumnos y certificados médicos.
 * Por eso los archivos viven dentro de la base de datos, en la colección
 * `archivos` (GridFS), que sí se persiste y se replica.
 *
 * QUÉ ES GRIDFS
 * GridFS es el estándar de MongoDB para archivos de más de 16 MB (el límite de
 * un documento). Parte el contenido en "chunks" de 255 KB y guarda el archivo
 * completo en `archivos.files` y sus trozos en `archivos.chunks`.
 *
 * DEDUPLICACIÓN POR CONTENIDO (sha256)
 * Antes de guardar se calcula el SHA-256 del archivo. Si ya existe uno con el
 * mismo hash, se REUTILIZA en vez de subir un copia: en este sistema es
 * habitual que varios alumnos Entreguen el mismo PDF y que se re-suba la misma
 * foto, así que esto ahorra espacio y, sobre todo, evita tráfico de red.
 *
 * ELIMINACIÓN
 * Quitar una foto o un certificado SOLO borra la referencia del alumno: el
 * archivo queda en la base. Esto es deliberado, porque con deduplicación varios
 * registros pueden apuntar al mismo archivo y borrar uno rompería al resto.
 * Los archivos huérfanos se limpian con `npm run limpiar:archivos`.
 */
'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

/** Colección GridFS: archivos completos en .files, trozos en .chunks. */
const BUCKET = 'archivos';

/** Prefijo de la URL publica. Debe coincidir con el de archivos.routes.js. */
const PREFIJO_URL = '/api/archivos';

let bucketCache = null;

/** Devuelve el bucket GridFS, creándolo la primera vez. */
function bucket() {
  if (bucketCache) return bucketCache;
  if (!mongoose.connection.db) {
    throw new Error('No hay conexión con MongoDB: no se pueden leer archivos.');
  }
  bucketCache = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BUCKET
  });
  return bucketCache;
}

/** Colección de metadatos, para buscar por hash y para el contador. */
function coleccionArchivos() {
  return mongoose.connection.db.collection(`${BUCKET}.files`);
}

/**
 * Normaliza el nombre del archivo para que sea seguro como URL y conserve la
 * extension. No se confia en el nombre que envia el cliente: se eliminan
 * acentos, simbolos y separadores de ruta (.., /, \).
 */
function nombreSeguro(nombreOriginal, mimetype) {
  const ext = path.extname(String(nombreOriginal || '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = path
    .basename(String(nombreOriginal || 'archivo'), path.extname(String(nombreOriginal || '')))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'archivo';
  const extension = ext || (String(mimetype || '').startsWith('image/') ? '.jpg' : '.pdf');
  return `${base}${extension}`;
}

/**
 * Sube un archivo a GridFS y devuelve sus metadatos.
 *
 * @param {Buffer} buffer  contenido del archivo (multer en memoria)
 * @param {object} [opciones]
 * @param {string} [opciones.nombre]    nombre original, para la URL
 * @param {string} [opciones.mimetype]  tipo MIME declarado
 * @param {string} [opciones.carpeta]   agrupador lógico: foto, certificado, doc
 * @returns {Promise<{id: string, url: string, nombre: string, bytes: number, sha256: string, reutilizado: boolean}>}
 */
async function subirArchivo(buffer, opciones = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('El archivo está vacío.');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const files = coleccionArchivos();

  // Ya existe un archivo con este contenido exacto -> se reutiliza.
  // OJO: el hash vive en metadata.sha256 (dentro del documento de GridFS),
  // por eso la consulta y el indice usan esa misma ruta.
  const previo = await files.findOne({ 'metadata.sha256': sha256 });
  if (previo) {
    return {
      id: String(previo._id),
      url: urlPublica(previo),
      nombre: previo.metadata && previo.metadata.nombreSeguro ? previo.metadata.nombreSeguro : String(previo.filename),
      bytes: previo.length,
      sha256,
      reutilizado: true
    };
  }

  const nombre = nombreSeguro(opciones.nombre, opciones.mimetype);
  const metadata = {
    nombreSeguro: nombre,
    nombreOriginal: String(opciones.nombre || '').slice(0, 200),
    mimetype: String(opciones.mimetype || 'application/octet-stream').slice(0, 100),
    carpeta: String(opciones.carpeta || 'general').slice(0, 40),
    sha256
  };

  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(nombre, { metadata });
    stream.on('error', reject);
    stream.on('finish', () => {
      resolve({
        id: String(stream.id),
        url: urlPublica({ _id: stream.id, metadata }),
        nombre,
        bytes: buffer.length,
        sha256,
        reutilizado: false
      });
    });
    stream.end(buffer);
  });
}

/** Construye la URL publica a partir del documento de GridFS. */
function urlPublica(doc) {
  const nombre = doc && doc.metadata && doc.metadata.nombreSeguro ? doc.metadata.nombreSeguro : String((doc && doc.filename) || 'archivo');
  return `${PREFIJO_URL}/${String(doc._id)}/${encodeURIComponent(nombre)}`;
}

/** Extrae el _id de una URL /api/archivos/<id>/<nombre>. */
function idDesdeUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/api\/archivos\/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

/**
 * Localiza un archivo por su id y devuelve una secuencia de lectura.
 * Se usa con respuestas parciales (Range) para que el navegador pueda navegar
 * un PDF largo sin descargarlo entero.
 *
 * DEVUELVE LA SECUENCIA DE FORMA SINCRONA, no una promesa: el stream ya puede
 * emitir 'data'/'end' en cuanto se retorna, asi que envolverlo en una promesa
 * obligaria a esperar un evento que GridFS no emite y la descarga se quedaria
 * colgada. El error se propaga con el evento 'error' del propio stream.
 *
 * `rango` sigue la convencion de HTTP: {start, end} AMBOS INCLUSIVOS.
 * OJO: el driver de MongoDB trata `end` como EXCLUSIVO (devuelve end-start
 * bytes, y con start===end devuelve 0), asi que aqui se le pasa end+1. Si no
 * se hiciera, la respuesta prometeria un byte de mas en Content-Length, nunca
 * llegaria y la peticion se quedaria colgada para siempre.
 */
function abrirArchivo(id, rango) {
  if (!rango) return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)));
  const opciones = { start: rango.start, end: rango.end + 1 };
  return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)), opciones);
}

/** Metadatos de un archivo, o null si no existe. */
async function metadatos(id) {
  return coleccionArchivos().findOne({ _id: new mongoose.Types.ObjectId(String(id)) });
}

/** Numero total de archivos y bytes almacenados. */
async function estadisticas() {
  // OJO: la coleccion cruda del driver devuelve un CURSOR; hay que llamar a
  // toArray() (await no basta, a diferencia de Model.aggregate() de Mongoose).
  const r = await coleccionArchivos()
    .aggregate([{ $group: { _id: null, archivos: { $sum: 1 }, bytes: { $sum: '$length' } } }], {
      allowDiskUse: true
    })
    .toArray();
  const fila = r[0];
  return { archivos: (fila && fila.archivos) || 0, bytes: (fila && fila.bytes) || 0 };
}

/**
 * Elimina fisicamente un archivo. NO se usa desde la interfaz (ver cabecera):
 * con deduplicacion, borrar un archivo compartido romperia a otros registros.
 * Solo lo invoca `npm run limpiar:archivos` para los huerfanos.
 */
async function borrarArchivo(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) return false;
  return bucket().delete(new mongoose.Types.ObjectId(String(id)));
}

/** Crea los indices que GridFS consulta en cada lectura. */
async function asegurarIndices() {
  try {
    // La deduplicacion busca por metadata.sha256: sin este indice, cada
    // subida haria un recorrido completo de la coleccion.
    await coleccionArchivos().createIndex({ 'metadata.sha256': 1 });
    await coleccionArchivos().createIndex({ 'metadata.carpeta': 1 });
  } catch (err) {
    console.warn('[almacen] No se pudieron crear los indices de archivos:', err.message);
  }
}

module.exports = {
  BUCKET,
  PREFIJO_URL,
  subirArchivo,
  urlPublica,
  idDesdeUrl,
  abrirArchivo,
  metadatos,
  borrarArchivo,
  estadisticas,
  asegurarIndices,
  nombreSeguro
};
