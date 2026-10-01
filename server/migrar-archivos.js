/**
 * Gym UES - Migra los archivos de server/uploads/ a MongoDB Atlas (GridFS) y
 * reescribe todas las referencias que apuntan a ellos.
 *
 * CONTEXTO
 * Antes los archivos vivian en el disco (server/uploads). Eso no sirve en un
 * despliegue web: el disco de Render es efimero. Este script deja el sistema
 * limpio para que la aplicacion funcione solo con Atlas.
 *
 * QUE REESCRIBE
 *   alumnos.image_url          -> fotos de perfil
 *   alumnos.medical_certificate-> certificado medico (cuando es una URL)
 *   alumnos.certificate_file   -> documento adjunto, si existe en algun registro
 *   ajustes.setting_value      -> reglamento_pdf, horarios_pdf
 *
 * ES IDEMPOTENTE: se puede ejecutar varias veces. Los archivos se deduplican
 * por sha256, asi que volver a subir un PDF igual no crea una copia nueva, y las
 * URLs que ya apuntan a /api/archivos/ se dejan intactas.
 *
 * USO
 *   npm run migrar:archivos                    (mueve y reescribe)
 *   npm run migrar:archivos -- --dry           (solo informa, no escribe)
 *   npm run migrar:archivos -- --limpiar-rotos  (ademas vacia las referencias
 *                                                  que apuntan a archivos que ya
 *                                                  no existen, para que la
 *                                                  interfaz no muestre imagenes
 *                                                  o PDFs rotos)
 *
 * IMPORTANTE: este script es la UNICA vez que se lee el disco. Despues, la
 * carpeta server/uploads/ puede borrarse.
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const almacen = require('./almacen');
const { Alumno, Ajuste } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || '';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const DRY = process.argv.includes('--dry');
// Vacia las referencias que apuntan a un archivo que ya no existe en disco.
const LIMPIAR_ROTOS = process.argv.includes('--limpiar-rotos');

/** Campos de alumno que guardan una ruta de archivo. */
const CAMPOS_ALUMNO = ['image_url', 'medical_certificate', 'certificate_file'];

function log(m) {
  console.log(`[archivos] ${m}`);
}

/** Clasifica el archivo por su contenido para la carpeta de GridFS. */
function carpetaDe(nombre) {
  if (/^img_/i.test(nombre)) return 'foto';
  return 'documento';
}

function mimeDe(nombre) {
  const ext = path.extname(nombre).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/** "¿este valor es una ruta /uploads/... ?" */
function esRutaUploads(v) {
  return typeof v === 'string' && /\/uploads\/[^/]+\.[a-z0-9]{2,5}$/i.test(v.trim());
}

async function main() {
  if (!MONGODB_URI) {
    console.error('[archivos] Falta MONGODB_URI en .env. Abortando.');
    process.exit(1);
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    log(`No existe ${UPLOADS_DIR}: nada que migrar.`);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  log(`Conectado a Atlas (base "${mongoose.connection.name}").`);
  await almacen.asegurarIndices();

  // ---- 1. Indexar los archivos del disco por nombre ----
  const enDisco = new Map();
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
      if (!f.toLowerCase().endsWith('.pdf') && !/\.(jpe?g|png|webp|gif)$/i.test(f)) continue;
      const stat = fs.statSync(path.join(UPLOADS_DIR, f));
      if (stat.size === 0) continue;
      enDisco.set(f.toLowerCase(), { ruta: path.join(UPLOADS_DIR, f), bytes: stat.size });
    }
  }
  log(`Archivos en disco: ${enDisco.size}.`);

  // ---- 2. Subirlos a GridFS y construir el mapa nombre -> URL nueva ----
  // En --dry NO se sube nada: solo se informa de lo que habria que cambiar.
  const urls = new Map();
  let subidos = 0;
  let reutilizados = 0;
  for (const [clave, info] of enDisco) {
    if (DRY) {
      log(`  ${clave} -> (se subiria; ${(info.bytes / 1024).toFixed(1)} KB)`);
      continue;
    }
    const buffer = fs.readFileSync(info.ruta);
    const guardado = await almacen.subirArchivo(buffer, {
      nombre: clave,
      mimetype: mimeDe(clave),
      carpeta: carpetaDe(clave)
    });
    urls.set(clave, guardado.url);
    if (guardado.reutilizado) reutilizados++;
    else subidos++;
    log(`  ${clave} -> ${guardado.url}${guardado.reutilizado ? ' (reutilizado)' : ''}`);
  }
  if (!DRY) {
    log(`GridFS: ${subidos} nuevo(s), ${reutilizados} reutilizado(s).`);
  }

  /** Convierte "/uploads/x.pdf" en "/api/archivos/<id>/x.pdf". */
  const convertir = (valor) => {
    if (!esRutaUploads(valor)) return null;
    const nombre = path.basename(valor.trim());
    return urls.get(nombre.toLowerCase()) || null;
  };

  // Referencias que apuntan a /uploads/ pero cuyo archivo no esta en la carpeta:
  // ya estaban rotas antes de migrar (el archivo se borro en su momento), asi
  // que no se pueden arreglar aqui. Se listan para que quede constancia.
  const rotos = [];
  const anotarRotos = (donde, campo, valor) => {
    const nombre = path.basename(String(valor).trim());
    rotos.push({ donde, campo, valor, nombre, existe: fs.existsSync(path.join(UPLOADS_DIR, nombre)) });
  };

  if (DRY) {
    log('--dry: no se modifica nada en la base.');
  } else {
    // ---- 3. Reescribir alumnos ----
    const alumnos = await Alumno.find({});
    let tocados = 0;
    for (const a of alumnos) {
      let cambio = false;
      for (const campo of CAMPOS_ALUMNO) {
        const nueva = convertir(a[campo]);
        if (nueva) {
          log(`  alumno ${a.student_code}: ${campo} -> ${nueva}`);
          a[campo] = nueva;
          cambio = true;
        } else if (esRutaUploads(a[campo])) {
          anotarRotos(`alumno ${a.student_code}`, campo, a[campo]);
          if (LIMPIAR_ROTOS) {
            log(`  alumno ${a.student_code}: ${campo} <- vaciado (el archivo ya no existe)`);
            a[campo] = '';
            cambio = true;
          }
        }
      }
      if (cambio) {
        await a.save();
        tocados++;
      }
    }
    log(`Alumnos actualizados: ${tocados} de ${alumnos.length}.`);

    // ---- 4. Reescribir ajustes que apunten a un PDF ----
    const ajustes = await Ajuste.find({});
    let ajustesTocados = 0;
    for (const aj of ajustes) {
      const nueva = convertir(aj.setting_value);
      if (nueva) {
        log(`  ajuste ${aj.setting_key}: -> ${nueva}`);
        aj.setting_value = nueva;
        await aj.save();
        ajustesTocados++;
      } else if (esRutaUploads(aj.setting_value)) {
        anotarRotos(`ajuste ${aj.setting_key}`, 'setting_value', aj.setting_value);
        if (LIMPIAR_ROTOS) {
          log(`  ajuste ${aj.setting_key}: <- vaciado (el archivo ya no existe)`);
          aj.setting_value = '';
          await aj.save();
          ajustesTocados++;
        }
      }
    }
    log(`Ajustes actualizados: ${ajustesTocados} de ${ajustes.length}.`);

    if (rotos.length) {
      log('');
      if (LIMPIAR_ROTOS) {
        log(`${rotos.length} referencia(s) rotas se han vaciado:`);
        for (const r of rotos) log(`  - ${r.donde} [${r.campo}] ${r.valor}`);
        log('Vuelve a subir esos archivos desde la aplicacion para que queden en Atlas.');
      } else {
        log(`ATENCION: ${rotos.length} referencia(s) siguen apuntando a /uploads/ de un archivo que`);
        log('no existe, asi que quedaron sin migrar. YA ESTABAN ROTAS antes de este proceso');
        log('(el archivo se borro del disco en su momento), no es culpa de la migracion:');
        for (const r of rotos) {
          log(`  - ${r.donde} [${r.campo}] ${r.valor}`);
        }
        log('Para vaciarlas y que la interfaz no muestre imagenes/PDFs rotos, ejecuta:');
        log('  npm run migrar:archivos -- --limpiar-rotos');
      }
    }
  }

  // ---- 5. Resumen ----
  if (!DRY) {
    const referenciados = new Set();
    for (const a of await Alumno.find({})) {
      for (const campo of CAMPOS_ALUMNO) {
        const id = almacen.idDesdeUrl(a[campo]);
        if (id) referenciados.add(id);
      }
    }
    for (const aj of await Ajuste.find({})) {
      const id = almacen.idDesdeUrl(aj.setting_value);
      if (id) referenciados.add(id);
    }
    log(`Archivos referenciados ahora: ${referenciados.size}.`);
  }

  const stats = await almacen.estadisticas();
  log(`En Atlas: ${stats.archivos} archivo(s), ${(stats.bytes / (1024 * 1024)).toFixed(2)} MB.`);
  if (!DRY) {
    log('Listo. Ya puedes borrar la carpeta server/uploads/.');
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('[archivos] ERROR:', err.message);
  process.exit(1);
});
