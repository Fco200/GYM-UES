/**
 * Gym UES - Subida de archivos a MongoDB Atlas (GridFS).
 *
 * Acepta PDFs (certificados medicos, reglamento, horarios) e imagenes
 * (fotografias de perfil) y los guarda DENTRO de la base de datos, no en disco.
 * Esto es lo que permite que la aplicacion funcione en un servidor web: el
 * sistema de archivos de Render es efimero y se pierde en cada redespliegue.
 *
 * El flujo es multer EN MEMORIA -> hash sha256 -> GridFS. Nunca se escribe nada
 * en el sistema de archivos, ni siquiera de forma temporal.
 *
 * La API publica no cambia: sigue devolviendo { url, urlCompleta, nombre }, de
 * modo que el frontend no necesita modifications.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const almacen = require('../almacen');

const router = express.Router();

/** 20 MB: limite de Atlas por documento y holgura para un PDF escaneado. */
const MAX_BYTES = 20 * 1024 * 1024;

// Extensiones de imagen aceptadas cuando el navegador no envia un MIME fiable
// (pasa con HEIC/HEIF en algunos telefonos y con archivos renombrados).
const EXT_IMAGEN = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.heic',
  '.heif',
  '.tif',
  '.tiff'
]);

/**
 * Acepta cualquier imagen EXCEPTO SVG: un SVG puede incluir scripts y se
 * serviria desde el mismo dominio del portal, asi que no se permite subirlo.
 * El frontend ya normaliza las fotos a JPEG; esto solo evita rechazar el
 * archivo original cuando la persona sube HEIC, BMP, AVIF, etc.
 */
function esImagenSubida(file) {
  const mime = String((file && file.mimetype) || '').toLowerCase();
  const ext = path.extname((file && file.originalname) || '').toLowerCase();
  if (mime === 'image/svg+xml' || ext === '.svg') return false;
  return mime.startsWith('image/') || EXT_IMAGEN.has(ext);
}

// Cuando el navegador no declara el MIME (pasa con HEIC/HEIF), se deduce de la
// extension para que el archivo se sirva con el Content-Type correcto y la
// foto se pueda ver en el navegador en vez de descargarse como binario.
const MIME_POR_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf'
};

function mimeDelArchivo(file) {
  const declarado = String((file && file.mimetype) || '').toLowerCase();
  if (declarado) return declarado;
  const ext = path.extname((file && file.originalname) || '').toLowerCase();
  return MIME_POR_EXT[ext] || 'application/octet-stream';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();
    const esPdf = mime === 'application/pdf' || ext === '.pdf';
    const esImagen = esImagenSubida(file);
    if (!esPdf && !esImagen) {
      return cb(new Error('Solo se permiten archivos PDF o imágenes (JPG, PNG, WebP, HEIC, etc.).'));
    }
    cb(null, true);
  }
});

// POST /api/uploads - sube un PDF o una imagen y devuelve su URL publica
router.post('/', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const mensaje =
        err.code === 'LIMIT_FILE_SIZE'
          ? `El archivo supera el máximo de ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`
          : err.message || 'Error al subir el archivo.';
      return res.status(400).json({ mensaje });
    }
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió ningún archivo.' });
    }
    try {
      const esImagen = esImagenSubida(req.file);
      const guardado = await almacen.subirArchivo(req.file.buffer, {
        nombre: req.file.originalname,
        mimetype: mimeDelArchivo(req.file),
        carpeta: req.body && req.body.carpeta ? req.body.carpeta : esImagen ? 'foto' : 'documento'
      });

      const baseUrl = process.env.PUBLIC_URL || '';
      res.status(201).json({
        mensaje: guardado.reutilizado
          ? 'Archivo subido correctamente (contenido idéntico ya existente).'
          : 'Archivo subido correctamente.',
        url: guardado.url,
        urlCompleta: baseUrl ? `${baseUrl}${guardado.url}` : guardado.url,
        nombre: req.file.originalname,
        // Campos extra que el frontend puede ignorar; utiles para depurar.
        id: guardado.id,
        bytes: guardado.bytes,
        sha256: guardado.sha256,
        reutilizado: guardado.reutilizado
      });
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
