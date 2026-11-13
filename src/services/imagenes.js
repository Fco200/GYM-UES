/**
 * Gym UES - Adaptacion de fotografias antes de subirlas.
 *
 * El panel administrativo y el autoregistro aceptan CUALQUIER imagen que el
 * navegador pueda leer (JPG, PNG, WebP, GIF, BMP, AVIF, TIFF...). Aqui se
 * normaliza a JPEG, se corrige la orientacion EXIF y se reduce el lado mayor
 * para que una foto de telefono de 12 MP no viaje a Atlas tal cual.
 *
 * Ventajas:
 *   - Una foto de 4-8 MB baja a ~150-400 KB: sube mas rapido en red movil.
 *   - El mismo archivo se ve bien en el directorio, en la ficha y en el PDF.
 *   - Se quitan metadatos (GPS, marca del telefono) al recomponer la imagen.
 *
 * LIMITACION: si el navegador no puede decodificar el formato (por ejemplo
 * HEIC de iPhone en Chrome de escritorio), se avisa con un mensaje claro en
 * vez de subir un archivo que luego no se podria mostrar.
 */

/** Lado mayor de la foto final. Suficiente para ficha, PDF y pantalla grande. */
export const MAX_LADO_FOTO = 1600;
/** Calidad JPEG: buena definicion sin inflar el archivo. */
export const CALIDAD_FOTO = 0.86;
/** Limite de entrada: se acepta aunque sea grande, luego se reduce. */
export const MAX_ARCHIVO_IMAGEN = 30 * 1024 * 1024;

const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

/** true si el archivo parece una imagen, aunque el telefono no reporte MIME. */
export function esImagen(archivo) {
  if (!archivo) return false;
  const tipo = String(archivo.type || '').toLowerCase();
  if (tipo.startsWith('image/')) return !tipo.includes('svg');
  // Algunos navegadores moviles mandan type vacio o generico: se usa la
  // extension para no rechazar una foto valida (pasa con HEIC/HEIF).
  if (!tipo || tipo === 'application/octet-stream' || tipo === 'binary/octet-stream') {
    return EXT_IMAGEN.test(String(archivo.name || ''));
  }
  return false;
}

/** Carga la imagen con createImageBitmap o, si no existe, con un <img>. */
async function cargarFuente(archivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' aplica la orientacion EXIF (fotos de telefono giradas).
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      // Algunos navegadores no aceptan la opcion; se reintenta sin ella.
      return createImageBitmap(archivo);
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.decoding = 'async';
      img.src = url;
    });
  } finally {
    // El objeto ya esta cargado en memoria del navegador: se libera la URL.
    URL.revokeObjectURL(url);
  }
}

function nombreJpeg(nombreOriginal) {
  const base = String(nombreOriginal || 'foto')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'foto'}.jpg`;
}

/**
 * Convierte cualquier imagen legible a un JPEG optimizado.
 *
 * @param {File|Blob} archivo
 * @param {object} [opciones]
 * @param {number} [opciones.maxLado=1600]   lado mayor permitido (px)
 * @param {number} [opciones.calidad=0.86]   calidad JPEG (0 a 1)
 * @returns {Promise<File>} archivo listo para subir
 */
export async function adaptarImagen(archivo, opciones = {}) {
  if (!archivo) throw new Error('No se selecciono ninguna imagen.');
  if (!esImagen(archivo)) {
    throw new Error('Selecciona una imagen (JPG, PNG, WebP, GIF, BMP, AVIF, HEIC o TIFF).');
  }
  if (archivo.size > MAX_ARCHIVO_IMAGEN) {
    throw new Error('La imagen supera el limite de 30 MB.');
  }

  const maxLado = Number(opciones.maxLado) > 0 ? Number(opciones.maxLado) : MAX_LADO_FOTO;
  const calidad = Number(opciones.calidad) > 0 ? Math.min(1, Number(opciones.calidad)) : CALIDAD_FOTO;

  let fuente;
  try {
    fuente = await cargarFuente(archivo);
  } catch {
    throw new Error(
      'No se pudo leer la imagen. Si es una foto HEIC de iPhone, cambiala a JPG o PNG e intenta de nuevo.'
    );
  }

  const anchoOriginal = fuente.width || fuente.naturalWidth || 0;
  const altoOriginal = fuente.height || fuente.naturalHeight || 0;
  if (!anchoOriginal || !altoOriginal) {
    if (typeof fuente.close === 'function') fuente.close();
    throw new Error('La imagen no tiene dimensiones validas.');
  }

  // Solo se reduce si es mas grande; nunca se amplia una foto pequena.
  const escala = Math.min(1, maxLado / Math.max(anchoOriginal, altoOriginal));
  const ancho = Math.max(1, Math.round(anchoOriginal * escala));
  const alto = Math.max(1, Math.round(altoOriginal * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (typeof fuente.close === 'function') fuente.close();
    throw new Error('El navegador no pudo procesar la imagen.');
  }

  // Fondo blanco: si la imagen original tiene transparencia (PNG/WebP), el
  // JPEG no la admite y sin fondo saldria en negro.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, ancho, alto);
  if (typeof fuente.close === 'function') fuente.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', calidad)
  );
  if (!blob) throw new Error('No se pudo convertir la imagen. Intenta con otra foto.');

  return new File([blob], nombreJpeg(archivo.name), {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}
