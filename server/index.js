/**
 * Gym UES - Servidor Express principal (backend web + API).
 *
 * Este archivo sirve para los dos escenarios del proyecto:
 *   - Desarrollo con Vite  : el frontend corre en :5173 y hace proxy de /api.
 *   - Produccion web       : `npm run build` genera dist/ y este mismo servidor
 *                            lo publica, de modo que la app queda en un solo
 *                            origen (misma API, sin CORS ni URLs distintas).
 *   - Electron empaquetado: el proceso principal lo invoca con require().
 *
 * - CORS habilitado (funciona en desarrollo Vite y en Electron empaquetado)
 * - express.json para APIs; los archivos van a Atlas por GridFS, no al disco
 * - compression reduce el tamano de las respuestas JSON de listados
 * - Sirve dist/ (la SPA compilada) como estatico
 * - Todas las rutas de datos bajo /api
 *
 * NOTA SOBRE ARCHIVOS: ya no existe server/uploads. Las fotos de alumnos, los
 * certificados medicos y los PDFs institucionales se guardan dentro de MongoDB
 * (GridFS) y se sirven desde /api/archivos/:id/:nombre. Asi el despliegue en
 * Render no depende de un disco efimero.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { initDatabase, cerrarDB, estadoDB } = require('./db');
const almacen = require('./almacen');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const ES_PRODUCCION = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// Compresion: reduce de forma notable el tamano de las respuestas JSON de
// listados (la tabla de asistencias es el payload mas pesado del portal).
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// ---------------------------------------------------------------
// API
// ---------------------------------------------------------------

app.get('/api/health', async (_req, res) => {
  const bd = estadoDB();
  res.json({
    ok: true,
    servicio: 'Gym UES API',
    db: bd.conectado,
    motor: 'MongoDB Atlas',
    base: bd.base,
    estado: bd.estado,
    hora: new Date().toISOString()
  });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/students', require('./routes/students.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/uploads', require('./routes/uploads.routes'));
app.use('/api/archivos', require('./routes/archivos.routes'));
app.use('/api/users', require('./routes/users.routes'));

// 404 de API: se declara antes del frontend para que /api no caiga nunca en la
// respuesta HTML del fallback SPA.
app.use('/api', (_req, res) => {
  res.status(404).json({ mensaje: 'Endpoint no encontrado.' });
});

// ---------------------------------------------------------------
// Frontend compilado (produccion web).
// Se registra DESPUES de /api para que las rutas de datos sigan teniendo
// prioridad. El fallback SPA devuelve index.html para cualquier ruta que no
// sea un archivo real, de modo que /admin y /checador funcionen al recargar.
// ---------------------------------------------------------------
const DIST_DIR = path.join(__dirname, '..', 'dist');
const hayBuild = fs.existsSync(path.join(DIST_DIR, 'index.html'));

if (hayBuild) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        if (ES_PRODUCCION && filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Los assets llevan hash en el nombre: se cachean para siempre.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    })
  );

  // Fallback SPA. Excluye /api para no interferir con la API ni con los
  // archivos (un PDF inexistente debe dar 404, no index.html).
  // Tambien excluye /uploads: esa carpeta ya no existe (los archivos viven en
  // Atlas), asi que un enlace viejo debe responder 404 y no devolver el HTML
  // de la aplicacion, que el navegador interpretaria como un PDF corrupto.
  const SPA_FALLBACK = /^\/(?!(?:api|uploads)(?:\/|$)).*/;
  app.get(SPA_FALLBACK, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  app.use('/uploads', (_req, res) => {
    res.status(404).json({
      mensaje:
        'Los archivos ya no se sirven desde el disco. Revisa la referencia del archivo o subelo de nuevo.'
    });
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<h1>Gym UES API</h1>' +
          '<p>El backend esta corriendo. Para ver la interfaz:</p>' +
          '<ul><li><b>Desarrollo</b>: <code>npm run dev:web</code> y abre http://localhost:5173</li>' +
          '<li><b>Produccion</b>: <code>npm run build</code> y luego <code>npm start</code></li></ul>'
      );
  });
}

// ---------------------------------------------------------------
// Manejo central de errores. Va SIEMPRE al final.
// FIRMA OBLIGATORIA de 4 parametros (err, req, res, next): Express solo lo
// trata como middleware de error si arity == 4. Nunca se exponen errores
// internos de Node (TypeError: "res.json is not a function", etc.) al cliente.
// ---------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[api] Error:', err && (err.stack || err.message));
  const msg = (err && err.message) || 'Error interno del servidor';

  // Errores internos de Node siempre se reportan como genericos
  const interno =
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    /(is not a function|Cannot read|is not defined|Unexpected token|Cannot set headers)/i.test(msg);

  let mensaje = 'Error interno del servidor. Intentelo nuevamente.';
  if (!interno) {
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|MongooseServerSelectionError|Server selection|getaddrinfo|buffering timed out|MongoParseError|topology .* was destroyed/i.test(msg)) {
      mensaje = 'No se pudo conectar con MongoDB Atlas. Verifique la URI en el archivo .env.';
    } else if (/(MaxTimeMSExpired|operation exceeded time limit)/i.test(msg)) {
      mensaje = 'La consulta a la base de datos tardo demasiado. Intentelo nuevamente.';
    } else if (msg && msg !== 'Error interno del servidor') {
      mensaje = msg;
    }
  }

  if (res.headersSent) {
    return _next(err);
  }
  try {
    res.status(Number.isInteger(err && err.status) ? err.status : 500).json({ mensaje });
  } catch (e) {
    // Ultimo recurso: nunca dejar colgada la peticion
    try {
      res.end(JSON.stringify({ mensaje }));
    } catch (_e2) {
      /* sin respuesta posible */
    }
  }
});

// ---------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------
let servidor = null;

/**
 * Conexion con Atlas en segundo plano, con reintentos.
 *
 * El servidor ESCUCHA DE INMEDIATO y la base se conecta despues a proposito:
 * abrir la conexion puede tardar mas de un minuto la primera vez (resolucion
 * DNS del SRV, handshake TLS y hasta la creacion de indices). Si esperasemos a
 * Atlas para escuchar, el proceso no responderia a /api/health durante todo ese
 * tiempo y cualquier plataforma de despliegue lo marcaria como caido y lo
 * reiniciaria en bucle.
 *
 * Mientras no hay conexion, el sitio sigue sirviendo la interfaz y la pantalla
 * de login muestra "Conectando a la base de datos..."; las rutas que si
 * necesitan datos responden con un error claro.
 */
async function conectarConReintentos() {
  for (let intento = 1; ; intento++) {
    try {
      await initDatabase();
      // Indices de GridFS: el sha256 permite reutilizar archivos identicos y el
      // hash es tambien el ETag que evita reenviar el contenido en cada recarga.
      await almacen.asegurarIndices();
      console.log('[servidor] MongoDB Atlas listo.');
      return true;
    } catch (err) {
      console.error(`[servidor] No se pudo conectar a Atlas (intento ${intento}): ${err.message}`);
      if (intento >= 10) {
        console.error('[servidor] Se agotaron los reintentos. El API queda arriba, pero sin datos.');
        return false;
      }
      // Espera creciente, con tope: no martillea Atlas ni quema CPU.
      const espera = Math.min(1000 * 2 ** (intento - 1), 15000);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

function startServer() {
  servidor = app.listen(PORT, () => {
    console.log(`[servidor] Gym UES API escuchando en http://localhost:${PORT}`);
    console.log(
      `[servidor] Frontend compilado: ${hayBuild ? 'servido desde /dist' : 'no compilado (use Vite en desarrollo)'}`
    );
  });
  // La base se conecta aparte: el sitio responde mientras Atlas resuelve.
  conectarConReintentos();
  return servidor;
}
// Cierre ordenado: cierra el pool de MongoDB antes de soltar el servidor, para
// que Atlas no vea conexiones colgadas al reiniciar el despliegue.
async function stopServer() {
  if (servidor) {
    await new Promise((resolve) => servidor.close(resolve));
    servidor = null;
  }
  await cerrarDB();
}

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    console.log(`\n[servidor] ${senal} recibido. Cerrando...`);
    stopServer()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

// Exporta startServer: nodemon lo invoca como proceso principal,
// Electron empaquetado lo invoca via require().
// startServer ya no es async (escucha de inmediato y conecta Atlas en segundo
// plano), asi que solo hay que avisar si el puerto, por ejemplo, esta ocupado.
if (require.main === module) {
  try {
    startServer();
  } catch (err) {
    console.error('[servidor] No se pudo iniciar:', err.message);
    process.exit(1);
  }
}

module.exports = startServer;
module.exports.app = app;
module.exports.stopServer = stopServer;
module.exports.estadoDB = estadoDB;
module.exports.almacen = almacen;
