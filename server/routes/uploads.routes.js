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

/**
 * Multer en memoria. Antes se escribia directo a server/uploads con
 * multer.diskStorage; ahora el buffer se sube a Atlas y se descarta, asi que el
 * servidor no necesita permiso de escritura en disco ni carpeta uploads.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();
    const esPdf = mime === 'application/pdf' || ext === '.pdf';
    const esImagen = mime.startsWith('image/') && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    if (!esPdf && !esImagen) {
      return cb(new Error('Solo se permiten archivos PDF o imagenes (JPG/PNG/WebP).'));
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
          ? `El archivo supera el maximo de ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`
          : err.message || 'Error al subir el archivo.';
      return res.status(400).json({ mensaje });
    }
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibio ningun archivo.' });
    }
    try {
      const esImagen = (req.file.mimetype || '').startsWith('image/');
      const guardado = await almacen.subirArchivo(req.file.buffer, {
        nombre: req.file.originalname,
        mimetype: req.file.mimetype,
        carpeta: req.body && req.body.carpeta ? req.body.carpeta : esImagen ? 'foto' : 'documento'
      });

      const baseUrl = process.env.PUBLIC_URL || '';
      res.status(201).json({
        mensaje: guardado.reutilizado
          ? 'Archivo subido correctamente (contenido identico ya existente).'
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
