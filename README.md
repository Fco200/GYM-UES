# Gym UES — Checador Biométrico

Sistema para el Gimnasio UES: control de asistencia de **alumnos, maestros y personas exteriores** con lector biométrico **DigitalPersona U.are.U 4500 (USB)**.

Stack: **Electron + React (Vite) + Express + MongoDB Atlas**.

El backend y los archivos viven en **MongoDB Atlas**, así que el mismo código sirve para:

- **Escritorio:** los 2 ejecutables de Electron (Admin y Checador) que se instalan en las computadoras.
- **Web:** un despliegue en **Render** con el mismo origen (frontend y API juntos), sin instalar nada.

| Ejecutable | Qué hace |
|---|---|
| **Gym UES Admin** (`dist`) | Abre la **Pantalla Principal** "**BIENVENIDO ADMINISTRADOR**" → clic en **Acceder al Login** → Login y panel de administración. |
| **Gym UES Checador** (`dist:checador`) | Abre **directamente el Checador** a pantalla completa (kiosco fijo, sin scroll, números grandes, menú hamburguesa a la derecha). **Es solo para eso.** |

---

## 1. Arquitectura (una sola carpeta / monorepo)

```
gym-ues-project/
├── electron/                 # Aplicacion Electron (CommonJS)
│   ├── main.cjs              # Proceso principal: ventana, IPC, config.json, arranque del backend
│   └── preload.cjs           # API segura via contextBridge (NUNCA expone Node)
├── server/                   # Backend Express (CommonJS)
│   ├── index.js              # Servidor, CORS, JSON, dist/ estatico, rutas /api
│   ├── db.js                 # Conexion a MongoDB Atlas (Mongoose) con reintentos
│   ├── almacen.js            # Guardado de archivos en Atlas con GridFS + deduplicacion
│   ├── middleware.js         # Autenticacion por token en memoria
│   ├── cache.js              # Cache en memoria de ajustes y conteos
│   ├── models/               # Modelos Mongoose + serializador
│   ├── routes/               # auth, students, attendance, settings, uploads, archivos, public, fingerprint
│   ├── migrar-a-mongo.js     # Copia los datos de MySQL a Atlas (una sola vez)
│   ├── migrar-archivos.js    # Copia los archivos del disco a GridFS y reescribe las URLs
│   └── limpiar-archivos.js   # Borra de Atlas los archivos que ya nadie referencia
├── src/                      # Frontend React + Vite (ES Modules)
│   ├── pages/               # PantallaPrincipal, ChecadorKiosco, Registro, AdminPortal, Asistencia
│   ├── components/          # Header, Modal, ModalPDF, BotonTema, FormularioRegistro, GestionAlumnos...
│   ├── hooks/               # useRefrescoAuto (recarga la pantalla cada 5 min)
│   ├── services/            # api.js (fetch wrapper), tema.js, digitalPersonaService.js
│   └── styles/global.css    # Colores institucionales UES (guinda #800020) + tema claro/oscuro
├── database/
│   ├── schema.sql           # Respaldo de la BD MySQL antigua (solo historico)
│   └── mysql-respaldo-antes-migrar.json  # Copia de los 31 registros que se movieron a Atlas
├── render.yaml               # Blueprint de despliegue en Render
├── .env                      # Credenciales locales (ignorado por Git, nunca se sube)
└── package.json              # Unico package con TODAS las dependencias
```

### Decisiones de arquitectura clave

- **CommonJS para Electron, ESM para el frontend.** `package.json` declara `"main": "electron/main.cjs"` y `electron/preload.cjs` usan `require/module.exports`. Vite compila `src/` (ESM) a estáticos en `dist/`, por lo que el renderer no necesita conocer módulos de Node.
- **El backend arranca de dos formas:** en desarrollo con `concurrently + nodemon`; en el ejecutable empaquetado `main.cjs` hace `require('../server/index.js')` y arranca Express dentro del proceso Electron.
- **El servidor escucha antes de conectarse a Atlas.** Si MongoDB tarda, la API ya responde `/api/health` y la conexión se reintenta en segundo plano. Así Render no marca el servicio como caído durante el arranque.
- **Proxy biométrico en el backend.** `server/routes/fingerprint.routes.js` consume el agente local HTTPS del lector (`https://127.0.0.1:52181/dp/v1/fingerprints/capture`) con `rejectUnauthorized: false` y expone `/api/fingerprint/capture` al frontend.
- **`app.commandLine.appendSwitch('ignore-certificate-errors')`** en `main.cjs` para tolerar el certificado self-signed del agente.

---

## 2. Base de datos: MongoDB Atlas

- **Conexión:** variable `MONGODB_URI` en `.env` (formato `mongodb+srv://usuario:clave@cluster.mongodb.net/gymues?...`).
  **Ojo:** el nombre de la base va dentro de la URI, después de la última `/`. Si se olvida, Atlas usa `test` y la aplicación parece vacía.
- **Modelos Mongoose** en `server/models/`: alumnos, asistencias, usuarios y ajustes. El campo `setting_key` es único.
- **Contraseñas:** se guardan con **bcrypt** (hash). El login acepta además contraseñas en texto plano para dar compatibilidad con los registros heredados de MySQL.
- **Cachés en memoria:** la configuración institucional (`AJUSTES_CACHE_MS`, 60 s) y el conteo de asistencias del día (`CONTEO_CACHE_MS`, 5 s). No hacen falta consultas extra en cada render.
- **Restricción de roles:** la pestaña "Configuración y Avisos" es exclusiva de `super_admin` / `admin`; el backend la refuerza con `requireRole` en `PUT /api/settings`.

### Migración desde MySQL (ya ejecutada)

MySQL/XAMPP ya no se usa en tiempo de ejecución. Los datos se movieron una vez con:

```bash
npm run migrar            # lee MySQL y escribe en Atlas (deja copia en database/)
npm run migrar:archivos   # sube los PDFs/fotos del disco a GridFS y reescribe las URLs
```

Los 31 registros (4 alumnos, 18 asistencias, 4 usuarios y 5 ajustes) están en Atlas. El respaldo previo quedó en `database/mysql-respaldo-antes-migrar.json`.

---

## 3. Archivos: todo dentro de Atlas (GridFS)

**No existe la carpeta `server/uploads`.** Nada se escribe en disco, y por eso la app funciona en un servidor con disco efímero como Render.

- **Cómo se guardan:** `POST /api/uploads` recibe el archivo con `multer.memoryStorage()` y lo guarda en el bucket GridFS `archivos` (colecciones `archivos.files` y `archivos.chunks`).
- **Cómo se sirven:** `GET /api/archivos/<id>/<nombre>`.
- **Deduplicación:** se calcula el `sha256` del contenido. Si el archivo ya existe (subir dos veces el mismo PDF), se **reutiliza** y no se duplica. Se eliminó el bug de buscar el hash en la raíz del documento en vez de en `metadata.sha256`.
- **Carga rápida:** cada URL incluye el `id`, así que es *direccionable por contenido*. Se manda `ETag` (hash) y `Cache-Control: public, max-age=31536000, immutable`: una recarga devuelve **304 sin bytes** y el visor de PDF pide solo los trozos que necesita con `Range`.
- **Borrado:** quitar una foto o un certificado de un alumno **no borra** el archivo de la base (puede estar referenciado por otro registro). Los archivos que quedan sin referencias se borran a demanda con `npm run limpiar:archivos`.
- **Límite:** 20 MB y solo `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`.

Archivos en el bucket: fotos de alumnos (`alumnos.image_url`), certificados médicos (`alumnos.medical_certificate` cuando es URL) y PDFs institucionales (`ajustes.reglamento_pdf`, `ajustes.horarios_pdf`).

---

## 4. Cómo ejecutar el proyecto

### Requisitos
- Node.js 18+ (probado con v24).
- Un cluster de **MongoDB Atlas** con la URI en `.env`.
- (Opcional) Agente DigitalPersona activo en `https://127.0.0.1:52181` con el lector U.are.U 4500 conectado.

### Pasos

```bash
# 1) Instalar dependencias (una sola vez)
npm install

# 2) Copiar .env.example a .env y pegar la MONGODB_URI de Atlas

# 3) Modo desarrollo (backend :3001 + frontend :5173 + Electron juntos)
npm run dev
```

También puedes ejecutar las partes por separado:

```bash
npm run dev:server   # solo backend Express en :3001
npm run dev:client   # solo frontend Vite en :5173 (abrirlo en el navegador)
npm run dev:electron # espera ambos servidores y abre Electron
```

### Scripts de base de datos

```bash
npm run migrar              # (opcional, una vez) MySQL -> Atlas
npm run migrar:archivos     # (opcional, una vez) disco -> GridFS, reescribe URLs
npm run migrar:archivos -- --dry           # solo informa, no escribe
npm run migrar:archivos -- --limpiar-rotos # vacía referencias a archivos ya borrados
npm run limpiar:archivos                   # borra de Atlas los archivos huérfanos
npm run limpiar:archivos -- --dry          # solo informa
```

### Generar los 2 ejecutables (.exe)

```bash
npm run build        # compila el frontend a dist/

# 1) Ejecutable ADMIN -> release/Gym UES Setup 1.0.0.exe
npm run dist

# 2) Ejecutable CHECADOR -> release-checador/Gym UES Checador Setup 1.0.0.exe
npm run dist:checador
```

### La app empaquetada y Atlas

El `.exe` no incluye el archivo `.env` (está fuera del repositorio), así que toma la conexión de `%APPDATA%\Gym UES\config.json`:

| Campo         | Default | Qué es |
|----------------|---------|--------|
| `MONGODB_URI` | *(vacío)* | **Pega aquí la misma URI de Atlas** que usas en desarrollo. |
| `API_PORT`    | `3001`   | Puerto del backend local. |

Si el archivo no existe, la app lo crea vacío la primera vez: **abre `config.json`, pega tu `MONGODB_URI` y reinicia**. (Si lanzas el `.exe` desde una terminal con `MONGODB_URI` puesta, esa gana.)

---

## 5. Despliegue en Render

`render.yaml` ya está listo (Blueprint). Pasos:

1. Sube el proyecto a GitHub.
2. En Render: **New → Blueprint** y selecciona el repo. Render lee `render.yaml`.
3. Rellena las dos variables marcadas como secret:
   - `MONGODB_URI` → la URI de Atlas.
   - `PUBLIC_URL` → el dominio del servicio (ej. `https://gym-ues.onrender.com`). Si lo dejas vacío, la API devuelve rutas relativas y todo funciona igual.
   - `ADMIN_SECRET_KEY` se genera sola.

**Antes del primer despliegue**, en **MongoDB Atlas → Network Access** hay que permitir la IP de salida de Render (o `0.0.0.0/0` mientras pruebas). Si no, el servicio arranca pero se queda sin base de datos.

| Paso | Valor |
|------|-------|
| Runtime | Node |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health check | `/api/health` |
| Plan | `free` (ver nota) |

> **Nota sobre el plan gratuito:** Render apaga el servicio tras unos minutos sin uso y la siguiente visita tarda ~30–50 s en "despertar". Si quieres que responda **siempre al instante**, cambia `plan: free` a `plan: starter` en `render.yaml` y haz *Save & Deploy*.

El build usa `npm ci`, así que `package-lock.json` debe estar siempre al día en el repo.

---

## 6. Módulos y rutas de la API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login de admin (bcrypt) → devuelve token |
| POST | `/api/auth/logout` | Cierra sesión |
| GET | `/api/auth/me` | Verifica sesión |
| GET | `/api/students` | Listado (con `?q=` para buscar) |
| POST | `/api/students` | Registrar alumno/maestro/exterior |
| GET | `/api/students/:code` | Detalle por clave |
| PUT | `/api/students/:code` | Actualizar (requiere sesión) |
| DELETE | `/api/students/:code` | Eliminar (requiere sesión) |
| POST | `/api/attendance/check-in` | `{student_code, method}` o `{fingerprint_template}` |
| POST | `/api/attendance/check-out` | `{student_code}` |
| GET | `/api/attendance/today` | Registros del día |
| GET | `/api/attendance/count` | Conteo (total, entradas, salidas) |
| GET | `/api/attendance/range?desde&hasta` | Asistencia por fechas |
| GET | `/api/settings` | Configuración (reglamento, horarios, URLs PDF) |
| PUT | `/api/settings` | Guardar textos (requiere sesión) |
| GET | `/api/public/member/:code` | **Público:** ficha del miembro + últimas 5 asistencias (kiosco) |
| GET | `/api/public/count-today` | **Público:** conteos de asistencia del día (kiosco) |
| POST | `/api/public/registro` | **Público:** auto-registro (endpoint conservado; la UI ya no muestra el botón) |
| POST | `/api/uploads` | Subir PDF o imagen (multipart `file`, requiere sesión) |
| GET | `/api/archivos/:id/:nombre` | **Público:** descarga un archivo de Atlas (con `ETag`, `Range`, caché) |
| GET | `/api/health` | Estado del servidor y de la conexión a Atlas |
| GET | `/api/fingerprint/capture` | Captura de huella (proxy → agente DigitalPersona) |
| GET | `/api/fingerprint/status` | Disponibilidad del agente |
| GET | `/api/fingerprint/sensors?q=` | Usuarios con estado de huella (panel Adaptación) |
| POST | `/api/fingerprint/verify` | Comprueba si la plantilla capturada pertenece a un registro |

`GET /api/archivos/...` es público a propósito (igual que antes los archivos estáticos): el kiosco muestra fotos y el registro abierto adjunta certificados.

---

## 7. Pantallas

- **Pantalla Principal (`/`)** — Launcher de bienvenida **del administrador**: logotipo `logo_ues.png`, "**BIENVENIDO ADMINISTRADOR**", reloj/fecha en vivo y el botón **Acceder al Login** (portal admin), más un enlace secundario al checador.
- **Checador (`/checador`)** — Pantalla **fija (sin scroll) con números grandes**, reloj en tiempo real, hora con tamaño grande, campo de clave, contadores del día en vivo y botones grandes de **Registrar Entrada** / **Registrar Salida**. **Menú hamburguesa a la derecha** con el formulario **"Consultar mi asistencia"** y los documentos **Reglamento** y **Horarios**.
- **Registro (`/registro`)** — Formulario único con pestañas **Alumno UES**, **Maestro (Mto)** y **Persona Exterior**, certificado médico (PDF opcional) y foto opcional.
- **Asistencia (`/asistencia`)** — Tabla de registros por día o rango de fechas, conteos y buscador por clave/nombre.
- **Admin (`/admin`)** — Login de pantalla completa; panel con header fijo, botón de tema (claro/oscuro/sistema) y pestañas **Gestión de Alumnos**, **Historial de Asistencias**, **Adaptación de Huella** y **Configuración y Avisos** (exclusiva de `super_admin`/`admin`).

### Detalles de experiencia

- **Tema claro/oscuro/sistema** con variables CSS, botón en el login y en el header. Se guarda en `localStorage` y se aplica antes de pintar la página para que no haya parpadeo.
- **Auto-refresh:** las pantallas de asistencia y alumnos se recargan solas cada 5 minutos (`useRefrescoAuto`) para que las horas y los conteos no se queden congelados.
- **Carga de archivos:** los archivos se muestran con `urlArchivo()`, que convierte la ruta de Atlas en URL absoluta. Funciona también dentro de Electron (donde la API corre en otro puerto).

---

## 8. Notas de seguridad

- `contextIsolation: true` y `nodeIntegration: false` en el `BrowserWindow`; el renderer solo accede a la API de `preload.cjs`.
- Consultas parametrizadas por Mongoose; los agregados de asistencia llevan `maxTimeMS` para no colgarse si la colección crece.
- Validación de tipo/tamaño en subidas (solo PDF e imágenes, 20 MB) y nombres de archivo saneados antes de guardarse.
- Las contraseñas se guardan con **bcrypt**. Cambia la clave secreta por defecto (`gymues-2026`) con `ADMIN_SECRET_KEY` (en Render se genera sola).
- Las credenciales de ejemplo (`super_admin`, `admin`, `matutino`, `vespertino`, `jefecarrera`, `administradorgym`) usan contraseñas de fábrica: **elimínalas o cámbialas antes de publicar en internet**.
- `.env` está en `.gitignore`: nunca subas credenciales al repositorio.
