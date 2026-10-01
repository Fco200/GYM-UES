/* eslint-disable no-undef */
// Gym UES - Proceso principal de Electron (CommonJS)
// Decision de arquitectura:
//  - electron/main.cjs y electron/preload.cjs usan CommonJS (require/module.exports)
//    porque Electron carga el "main" desde package.json y es el formato mas
//    robusto/compatible con electron-builder y el empaquetado ASAR.
//  - El frontend (src/, Vite) usa ES Modules porque Vite compila y empaqueta
//    todo a archivos estaticos; no hay conflicto de runtime.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// Dos ejecutables distintos del mismo codigo:
//  - "Gym UES Admin": abre la pantalla principal "Bienvenido Administrador" y
//    de ahi fluye al Login y al panel.
//  - "Gym UES Checador": abre DIRECTAMENTE el checador a pantalla completa
//    (solo para eso). Se detecta por el nombre del ejecutable (productName).
const esChecador = /checador/i.test(app.getName());

// Los archivos ya NO se guardan en disco (van a MongoDB Atlas por GridFS), asi
// que no hace falta un directorio escribible para subidas. Sigue haciendo falta
// el config.json persistente para la conexion a Atlas y el puerto de la API.
if (!isDev) {
  const cfgPath = path.join(app.getPath('userData'), 'config.json');
  const DEFAULTS = {
    // IMPORTANTE: la app empaquetada no lleva el archivo .env (va fuera del
    // repositorio), asi que la URI de Atlas se lee de aqui. Pega en este valor
    // la misma MONGODB_URI que usas en desarrollo, y el ejecutable se conectara
    // a la misma base que la version web.
    MONGODB_URI: '',
    API_PORT: 3001
  };
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8') || '{}');
  } catch {
    cfg = {};
  }
  // Las variables de entorno tienen prioridad: si el .exe se lanza desde una
  // terminal con MONGODB_URI puesta, gana esa.
  const merged = { ...DEFAULTS, ...cfg };
  if (process.env.MONGODB_URI) merged.MONGODB_URI = process.env.MONGODB_URI;
  try {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2));
  } catch {
    /* sin permisos de escritura: se usan los valores en memoria */
  }
  process.env.MONGODB_URI = String(merged.MONGODB_URI);
  process.env.PORT = String(merged.API_PORT);
}

const API_PORT = Number(process.env.PORT || 3001);
const API_URL = `http://127.0.0.1:${API_PORT}`;

let mainWindow = null;
let backendServer = null;

// ---------------------------------------------------------------------------
// Proxy HTTP hacia el backend Express (usado por las APIs expuestas en preload)
// ---------------------------------------------------------------------------
function proxyToBackend(method, apiPath, body = null, token = '') {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: API_PORT,
        path: apiPath,
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: { mensaje: data } });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// IPC handlers: conectan la API expuesta en preload con el backend
// ---------------------------------------------------------------------------
ipcMain.handle('api:request', async (_event, { method, path: apiPath, body, token }) => {
  try {
    return await proxyToBackend(method, apiPath, body, token);
  } catch (err) {
    return { status: 503, data: { mensaje: 'No se pudo conectar con el servidor local.' } };
  }
});

// ---------------------------------------------------------------------------
// Creacion de la ventana principal
// ---------------------------------------------------------------------------
function createWindow() {
  // Ajusta la ventana al area de trabajo para que todo se vea completo
  // (evita que el contenido se corte en pantallas pequenas).
  const area = screen.getPrimaryDisplay().workAreaSize;
  const ancho = Math.min(area.width - 60, 1280);
  const alto = Math.min(area.height - 60, 800);

  mainWindow = new BrowserWindow({
    width: ancho,
    height: alto,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: esChecador && !isDev,
    autoHideMenuBar: true,
    backgroundColor: '#F5F7FA',
    title: esChecador ? 'Gym UES Checador' : 'Gym UES',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Comunica al renderer el puerto real del backend local (configurable en
      // config.json / API_PORT) para que /api y los archivos servidos por el
      // backend apunten al servidor correcto sin depender de una constante
      // compilada.
      additionalArguments: [`--gym-api-url=http://127.0.0.1:${API_PORT}`]
    }
  });

  mainWindow.setMenuBarVisibility(!esChecador && isDev);

  if (isDev) {
    // Modo desarrollo: Vite sirve la app en http://localhost:5173
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Modo produccion: el servidor Express esta empaquetado junto a la app
    loadBuiltApp();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Carga la app compilada (dist/index.html) esperando a que el backend escuche
// ---------------------------------------------------------------------------
let backendIniciado = false;

// Arranca el servidor Express empaquetado (server/index.js exporta la funcion
// async startServer, NO una promesa: hay que invocarla y capturar su promise).
function iniciarBackend() {
  if (backendIniciado) return Promise.resolve(backendServer);
  backendIniciado = true;
  const startServer = require('../server/index.js');
  return Promise.resolve()
    .then(() => startServer())
    .then((server) => {
      backendServer = server;
      // Espera el evento 'listening' para no abrir la interfaz antes de que la
      // API local este disponible.
      if (server && !server.listening) {
        return new Promise((resolve, reject) => {
          server.once('listening', () => resolve(server));
          server.once('error', reject);
        });
      }
      return server;
    });
}

// Carga dist/index.html con el hash correcto segun el ejecutable:
//  - Checador -> #/checador (abre directo el kiosco)
//  - Admin    -> #/ (pantalla principal "Bienvenido Administrador")
function cargarDist() {
  if (!mainWindow) return;
  const html = path.join(__dirname, '..', 'dist', 'index.html');
  const hash = esChecador ? '/checador' : '/';
  return mainWindow.loadFile(html, { hash });
}

function loadBuiltApp() {
  iniciarBackend()
    .then(cargarDist)
    .catch((err) => {
      // Si el backend no arranca (ej. MySQL apagado o puerto ocupado) igual se
      // abre la interfaz: el frontend muestra los avisos de "sin conexion".
      console.error('[app] No se pudo iniciar el servidor local:', err && err.message);
      return cargarDist();
    });
}

// ---------------------------------------------------------------------------
// Ciclo de vida de la aplicacion
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendServer) {
    backendServer.close();
    backendServer = null;
  }
  app.quit();
});