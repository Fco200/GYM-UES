/**
 * Gym UES - Servidor de archivos desde MongoDB Atlas (GridFS).
 *
 * GET /api/archivos/:id/:nombre
 *
 * Estas URLs son "direccionables por contenido": el nombre va incluido para que
 * se lea sola, pero lo que identifica de verdad al archivo es su id. Gracias a
 * eso se puede cachear de forma ETERNA en el navegador:
 *
 *   - Si un archivo cambia, se sube OTRO (id nuevo, URL nueva). La URL vieja
 *     nunca cambia de contenido, asi que un `max-age` de un año es seguro.
 *   - Se envia ETag, de modo que una recarga devuelve 304 sin bytes.
 *   - Se acepta `Range`: el visor de PDF del navegador pide solo los pedazos
 *     que necesita y no baja los 200 KB completos.
 *
 * La lectura es publica (sin token) porque el kiosco muestra fotos y el
 * registro abierto adjunta certificados. Es el mismo criterio que antes, cuando
 * los archivos se servian como estaticos: quien tenga la URL puede verlos.
 * Los identificadores de MongoDB no se adivinan, pero no son un secreto fuerte:
 * si en el futuro se requiere privacidad, hay que meter requireAuth aqui y
 * revisar el visor de PDF, que necesita la URL directa.
 */
const express = require('express');
const mongoose = require('mongoose');
const almacen = require('../almacen');

const router = express.Router();

/** Un dia: los archivos son inmutables, asi que podrian cachearse para siempre. */
const CACHE_INMUTABLE = 'public, max-age=31536000, immutable';

// Formatos que el navegador puede mostrar en una pestana; el resto se descarga.
const EN_LINEA = /^(image\/|application\/pdf)/i;

/**
 * El manejador de la descarga. Se declara aparte y se registra en las DOS
 * variantes de la ruta porque Express 5 (path-to-regexp 8) ya no acepta el
 * comodin opcional "/:nombre?"; con dos rutas explicitas el archivo se puede
 * pedir con o sin el nombre y el codigo funciona en cualquier version de Express.
 */
async function servirArchivo(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ mensaje: 'Archivo no encontrado.' });
    }

    const doc = await almacen.metadatos(id);
    if (!doc) {
      return res.status(404).json({ mensaje: 'Archivo no encontrado.' });
    }

    const mimetype = (doc.metadata && doc.metadata.mimetype) || 'application/octet-stream';
    const nombre = (doc.metadata && doc.metadata.nombreOriginal) || doc.filename;
    // ETag por contenido: dos peticiones seguidas no transfieren el archivo.
    const etag = `"${doc.metadata && doc.metadata.sha256 ? doc.metadata.sha256 : String(id)}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', CACHE_INMUTABLE);
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      `${EN_LINEA.test(mimetype) ? 'inline' : 'attachment'}; filename="${nombre.replace(/["\\]/g, '')}"`
    );

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    // Peticion parcial (Range): solo se envia el tramo pedido.
    const rango = parseRange(req.headers.range, doc.length);
    if (rango === 'invalido') {
      res.setHeader('Content-Range', `bytes */${doc.length}`);
      return res.status(416).end();
    }

    if (rango) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${rango.start}-${rango.end}/${doc.length}`);
      res.setHeader('Content-Length', rango.end - rango.start + 1);
    } else {
      res.setHeader('Content-Length', doc.length);
    }

    const stream = almacen.abrirArchivo(id, rango ? { start: rango.start, end: rango.end } : undefined);
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// Con nombre: /api/archivos/<id>/<nombre.pdf>  (lo que genera elalmacen)
router.get('/:id/:nombre', servirArchivo);
// Sin nombre: /api/archivos/<id>
router.get('/:id', servirArchivo);

/**
 * Interpreta la cabecera Range: "bytes=0-1023", "bytes=1024-" o "bytes=-500".
 * Devuelve null si no hay Range (se envia el archivo entero), 'invalido' si no
 * se puede satisfacer, o {start, end}.
 */
function parseRange(cabecera, tamano) {
  if (!cabecera) return null;
  const m = String(cabecera).match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  const [, iniStr, finStr] = m;
  if (iniStr === '' && finStr === '') return 'invalido';

  let start;
  let end;
  if (iniStr === '') {
    // "-500" = los ultimos 500 bytes.
    const n = Number(finStr);
    if (!n) return 'invalido';
    start = Math.max(0, tamano - n);
    end = tamano - 1;
  } else {
    start = Number(iniStr);
    end = finStr === '' ? tamano - 1 : Number(finStr);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= tamano) {
    return 'invalido';
  }
  return { start, end: Math.min(end, tamano - 1) };
}

module.exports = router;