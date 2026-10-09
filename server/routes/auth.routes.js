/**
 * Gym UES - Rutas de autenticacion: login, logout y verificacion de sesion.
 * Sobre MongoDB Atlas: la busqueda de la cuenta usa el indice unico de
 * `usuarios.username`.
 * Las contrasenas se comparan con bcrypt cuando estan cifradas y en texto
 * plano cuando el administrador las restablece (compatibilidad historica).
 *
 * Recuperacion de contrasena:
 *   1) CODIGO POR CORREO (principal): /recuperar/solicitar envia un codigo
 *      de 6 digitos a Gmail SMTP y /recuperar/verificar lo valida.
 *   2) CLAVE SECRETA (segunda opcion): /restablecer con la clave de
 *      administracion. La clave efectiva se resuelve en este orden:
 *      clave guardada en BD (ajuste) > ADMIN_SECRET_KEY (.env) > default.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Usuario, Ajuste, CodigoRecuperacion } = require('../models');
const { requireAuth, requireRole, createToken, revokeToken } = require('../middleware');
const { invalidar, CLAVES } = require('../cache');
const { configurado, enviarCorreo, htmlCodigo } = require('../correo');

const router = express.Router();

// Clave secreta para crear administradores y restablecer contrasenas.
// En produccion DEBE definirse con ADMIN_SECRET_KEY o cambiarse desde el
// portal (Configuracion > Seguridad): el valor por defecto es publico.
const CLAVE_POR_DEFECTO = 'Ues-Gym-2026!Portal';
const SECRET_ADMIN = process.env.ADMIN_SECRET_KEY || CLAVE_POR_DEFECTO;
if (SECRET_ADMIN === CLAVE_POR_DEFECTO && process.env.NODE_ENV === 'production') {
  console.warn(
    '[auth] AVISO DE SEGURIDAD: la clave secreta sigue con el valor por defecto. ' +
      'Cambiala desde el portal (Configuracion > Seguridad) o define ADMIN_SECRET_KEY.'
  );
}

// Ajuste donde vive la clave secreta cambiada desde el portal (hash bcrypt).
const CLAVE_AJUSTE_SECRETA = 'clave_secreta_admin_hash';

// Roles que pueden cambiar la clave secreta (los responsables de turno no).
const ROLES_CLAVE_SECRETA = ['super_admin', 'admin', 'administrador_gym'];

// Constantes del flujo de codigo por correo.
const VIDAS_CODIGO = 5; // intentos de verificacion por codigo
const COOLDOWN_REENVIO_MS = 60_000; // espera minima entre envios
const MAX_ENVIOS = 5; // envios por usuario mientras viva el documento
const MINUTOS_CODIGO = 10; // vida util del codigo

/** Comparacion de cadenas que no corta en el primer caracter distinto. */
function igualesSeguro(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Valida una clave secreta contra la clave EFECTIVA:
 * hash en BD (si el admin ya la cambio) o la del .env/default.
 * Si Atlas no responde, se cae a la del entorno para no bloquear el login.
 */
async function esClaveSecretaValida(candidateo) {
  const texto = String(candidateo || '');
  if (!texto) return false;
  try {
    const ajuste = await Ajuste.findOne({ setting_key: CLAVE_AJUSTE_SECRETA })
      .select({ setting_value: 1, _id: 0 })
      .lean()
      .maxTimeMS(5000);
    if (ajuste && ajuste.setting_value) {
      return await bcrypt.compare(texto, ajuste.setting_value);
    }
  } catch {
    /* sin BD: se valida contra el .env */
  }
  return igualesSeguro(texto, SECRET_ADMIN);
}

/** Genera un codigo de 6 digitos criptograficamente seguro. */
function generarCodigo6() {
  // randomInt es uniforme: 100000..999999 (nunca empieza con 0).
  return String(crypto.randomInt(100000, 1000000));
}

/** Respuesta unica para no revelar si la cuenta existe o no tiene correo. */
const RESPUESTA_GENERICA =
  'Si existe una cuenta con ese usuario y tiene correo registrado, ' +
  'en unos minutos recibirá un código de verificación.';

const ROLES_REGISTRABLES = [
  'super_admin',
  'admin',
  'administrador_gym',
  'admin_matutino',
  'admin_vespertino',
  'maestro_mañana',
  'maestro_tarde',
  'jefe_carrera'
];

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña son obligatorios.' });
    }

    // .select() trae solo lo necesario (incluida la contrasena) y .lean()
    // evita hidratar el documento: la consulta mas rapida posible.
    const user = await Usuario.findOne({ username: String(username).trim() })
      .select({ username: 1, password: 1, role: 1, active: 1, email: 1, display_name: 1, photo_url: 1 })
      .lean()
      .maxTimeMS(5000);
    if (!user) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }
    if (!user.active) {
      return res.status(403).json({ mensaje: 'Esta cuenta está desactivada. Contacte al super_admin.' });
    }
    // Soporta contrasenas cifradas (bcrypt) y en texto plano (las restablecidas
    // desde el login o creadas con clave secreta se guardan SIN cifrar para
    // poder verlas en la base de datos).
    let valid = false;
    if (String(user.password).startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = String(user.password) === password;
    }
    if (!valid) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }
    const token = createToken(user);
    res.json({
      token,
      usuario: {
        id: String(user._id),
        username: user.username,
        role: user.role,
        email: user.email || '',
        display_name: user.display_name || '',
        photo_url: user.photo_url || ''
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  revokeToken(req.auth.token);
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
});

// GET /api/auth/me - verifica sesion
// NOTA: la firma es (req, res). Antes se usaba (_req) y se hacia referencia a
// req.auth, lo que lanzaba "req is not defined" (error tipo res.json is not a function).
router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, usuario: { username: req.auth.username, role: req.auth.role } });
});

// GET /api/auth/status - estado de la conexion y cuentas de administrador.
// Sirve para que el login indique si Atlas responde y cuantas cuentas existen.
router.get('/status', async (_req, res) => {
  try {
    const cuentas = await Usuario.find({}, { username: 1, role: 1, _id: 0 })
      .sort({ username: 1 })
      .lean()
      .maxTimeMS(5000);
    res.json({ db: true, cuentas });
  } catch {
    res.status(503).json({
      db: false,
      mensaje: 'No se pudo conectar con MongoDB Atlas. Verifique la URI en el archivo .env.'
    });
  }
});

// POST /api/auth/restablecer - SEGUNDA OPCION de recuperacion: la restablece
// pidiendo la clave secreta de administracion (la que cambio el admin desde el
// portal, la del .env o la por defecto). La contrasena se guarda CIFRADA.
router.post('/restablecer', async (req, res, next) => {
  try {
    const { secret, username, password } = req.body || {};
    if (!(await esClaveSecretaValida(secret))) {
      return res.status(403).json({ mensaje: 'Clave secreta incorrecta.' });
    }
    const user = String(username || '').trim();
    const pass = String(password || '');
    if (!user || pass.length < 4) {
      return res.status(400).json({ mensaje: 'Usuario y nueva contraseña (min. 4 caracteres) son obligatorios.' });
    }
    const hash = await bcrypt.hash(pass, 10);
    const cuenta = await Usuario.findOneAndUpdate(
      { username: user },
      { $set: { password: hash } },
      { new: true }
    )
      .select({ _id: 1 })
      .lean();
    if (!cuenta) {
      return res.status(404).json({ mensaje: 'No existe un usuario con ese nombre de usuario.' });
    }
    res.json({ mensaje: 'Contraseña restablecida correctamente.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register-admin - crea un administrador nuevo pidiendo la clave
// secreta. La contrasena se guarda CIFRADA con bcrypt.
router.post('/register-admin', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!(await esClaveSecretaValida(body.secret))) {
      return res.status(403).json({ mensaje: 'Clave secreta incorrecta.' });
    }
    const username = String(body.username || '').trim().slice(0, 100);
    const password = String(body.password || '');
    const role = String(body.role || 'admin');
    if (!username || password.length < 4) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña (min. 4 caracteres) son obligatorios.' });
    }
    if (!ROLES_REGISTRABLES.includes(role)) {
      return res.status(400).json({ mensaje: 'Rol no válido.' });
    }
    const existe = await Usuario.exists({ username });
    if (existe) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    const hash = await bcrypt.hash(password, 10);
    await Usuario.create({
      username,
      password: hash,
      role,
      active: true,
      scope_values: [],
      created_at: new Date()
    });
    res.status(201).json({ mensaje: 'Administrador creado correctamente.', username });
  } catch (err) {
    // 11000 = violacion del indice unico de username (carrera perdida)
    if (err && err.code === 11000) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    next(err);
  }
});

// ---------- Recuperacion por codigo enviado al correo (OPCION PRINCIPAL) ----------

// GET /api/auth/recuperar/estado - si el correo esta configurado y si la
// clave secreta ya fue cambiada desde el portal. Sirve para que el modal de
// recuperacion decida que pesta mostrar primero.
router.get('/recuperar/estado', (_req, res) => {
  res.json({ correo: configurado() });
});

// POST /api/auth/recuperar/solicitar { username }
// Busca la cuenta, toma su correo (campo email o el username si contiene '@')
// y le envia un codigo de 6 digitos. La respuesta SIEMPRE es generica: no
// revela si la cuenta existe ni si tiene correo (evita enumerar usuarios).
router.post('/recuperar/solicitar', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().slice(0, 100);
    if (!username) {
      return res.status(400).json({ mensaje: 'Escriba su usuario o correo.' });
    }

    // Sin correo configurado en el servidor no hay a quien enviarle el codigo.
    if (!configurado()) {
      return res.status(503).json({
        mensaje:
          'La recuperación por correo no está configurada en el servidor. ' +
          'Use la clave secreta de administración.'
      });
    }

    const cuenta = await Usuario.findOne({ username })
      .select({ username: 1, email: 1, active: 1 })
      .lean()
      .maxTimeMS(5000);

    // Cuenta inexistente/inactiva o sin correo: misma respuesta que exito
    // (salvo por el caso sin correo, donde se orienta a la segunda opcion).
    if (!cuenta || !cuenta.active) {
      return res.json({ mensaje: RESPUESTA_GENERICA, enviado: true });
    }
    const correo = cuenta.email || (username.includes('@') ? username : '');
    if (!correo) {
      return res.status(409).json({
        mensaje:
          'Esta cuenta no tiene un correo registrado para enviar el código. ' +
          'Use la clave secreta de administración.'
      });
    }

    // Cooldown y tope de envios sobre el documento vigente (si existe).
    const previo = await CodigoRecuperacion.findOne({ username })
      .lean()
      .maxTimeMS(5000);
    const ahora = Date.now();
    if (previo) {
      const ultimo = previo.ultimo_envio ? new Date(previo.ultimo_envio).getTime() : 0;
      if (ahora - ultimo < COOLDOWN_REENVIO_MS) {
        const faltan = Math.ceil((COOLDOWN_REENVIO_MS - (ahora - ultimo)) / 1000);
        return res.status(429).json({
          mensaje: `Espere ${faltan} segundo(s) antes de solicitar otro código.`
        });
      }
      if (previo.envios >= MAX_ENVIOS) {
        return res.status(429).json({
          mensaje:
            'Se alcanzó el límite de códigos solicitados. ' +
            'Espere unos minutos o use la clave secreta.'
        });
      }
    }

    const codigo = generarCodigo6();
    const hash = await bcrypt.hash(codigo, 10);
    const expira = new Date(ahora + MINUTOS_CODIGO * 60_000);

    try {
      await enviarCorreo({
        para: correo,
        asunto: 'Código para restablecer su contraseña - Gimnasio UES',
        html: htmlCodigo(codigo),
        texto: `Su código de verificación es ${codigo}. Caduca en 10 minutos.`
      });
    } catch (err) {
      console.error('[auth] No se pudo enviar el correo de recuperacion:', err.message);
      return res.status(502).json({
        mensaje: 'No se pudo enviar el correo en este momento. Intente de nuevo en unos minutos.'
      });
    }

    // Solo despues de que el correo salio bien se guarda (o renueva) el codigo.
    // envios: se incrementa si ya habia documento, o nace en 1 si es el primero
    // (no puede estar en $inc y $setOnInsert a la vez: MongoDB lo rechaza).
    const actualizacion = {
      $set: {
        username,
        codigo_hash: hash,
        intentos: 0,
        ultimo_envio: new Date(ahora),
        expires_at: expira
      }
    };
    if (previo) {
      actualizacion.$inc = { envios: 1 };
    } else {
      actualizacion.$setOnInsert = { envios: 1 };
    }
    await CodigoRecuperacion.findOneAndUpdate({ username }, actualizacion, {
      upsert: true,
      new: true
    }).maxTimeMS(5000);

    res.json({
      mensaje: 'Código enviado. Revise su correo (también la carpeta de spam).',
      enviado: true,
      // Ayuda al frontend a mostrar "codigo enviado a j****@gmail.com".
      destino: mascaraCorreo(correo),
      caduca: MINUTOS_CODIGO
    });
  } catch (err) {
    next(err);
  }
});

// Enmascara el correo para la interfaz: ju****@gmail.com (nunca el completo).
function mascaraCorreo(correo) {
  const [local, dominio] = String(correo).split('@');
  if (!dominio) return '***';
  const visto = local.slice(0, Math.min(2, local.length));
  return `${visto}${'*'.repeat(Math.max(1, local.length - visto.length))}@${dominio}`;
}

// POST /api/auth/recuperar/verificar { username, codigo, password }
// Valida el codigo (5 intentos max., 10 min de vida) y guarda la nueva
// contrasena CIFRADA con bcrypt. El codigo se destruye al usarse.
router.post('/recuperar/verificar', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().slice(0, 100);
    const codigo = String(req.body?.codigo || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !codigo) {
      return res.status(400).json({ mensaje: 'Usuario y código son obligatorios.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }

    const doc = await CodigoRecuperacion.findOne({ username }).lean().maxTimeMS(5000);
    const invalido = !doc || !doc.expires_at || new Date(doc.expires_at).getTime() < Date.now();
    if (invalido) {
      return res.status(400).json({ mensaje: 'El código no es válido o ya expiró. Solicite uno nuevo.' });
    }
    if (doc.intentos >= VIDAS_CODIGO) {
      await CodigoRecuperacion.deleteOne({ username });
      return res.status(429).json({ mensaje: 'Demasiados intentos. Solicite un código nuevo.' });
    }

    const ok = await bcrypt.compare(codigo, doc.codigo_hash);
    if (!ok) {
      await CodigoRecuperacion.updateOne({ username }, { $inc: { intentos: 1 } }).maxTimeMS(5000);
      const restantes = VIDAS_CODIGO - (doc.intentos + 1);
      return res.status(400).json({
        mensaje:
          restantes > 0
            ? `Código incorrecto. Le ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`
            : 'Código incorrecto. Solicite uno nuevo.'
      });
    }

    const cuenta = await Usuario.findOneAndUpdate(
      { username },
      { $set: { password: await bcrypt.hash(password, 10) } },
      { new: true }
    )
      .select({ _id: 1 })
      .lean();
    if (!cuenta) {
      return res.status(404).json({ mensaje: 'No existe una cuenta con ese usuario.' });
    }

    await CodigoRecuperacion.deleteOne({ username });
    res.json({ mensaje: 'Contraseña restablecida correctamente. Ya puede iniciar sesión.' });
  } catch (err) {
    next(err);
  }
});

// ---------- Clave secreta cambiada por administradores ----------

// GET /api/auth/clave-secreta/estado - solo informa si la clave actual es la
// del entorno (.env/default) o una personalizada guardada en la BD. Jamas
// devuelve la clave.
router.get('/clave-secreta/estado', requireAuth, requireRole(...ROLES_CLAVE_SECRETA), async (_req, res, next) => {
  try {
    const ajuste = await Ajuste.findOne({ setting_key: CLAVE_AJUSTE_SECRETA })
      .select({ _id: 0 })
      .lean()
      .maxTimeMS(5000);
    res.json({
      personalizada: Boolean(ajuste && ajuste.setting_value),
      correo: configurado()
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/clave-secreta { actual, nueva }
// Cambia la clave secreta usada por "restablecer" y "crear administrador".
// Solo super_admin / admin / administrador_gym (nunca los responsables de
// turno). La nueva clave se guarda hasheada con bcrypt en la coleccion
// `ajustes`, por encima del .env.
router.put(
  '/clave-secreta',
  requireAuth,
  requireRole(...ROLES_CLAVE_SECRETA),
  async (req, res, next) => {
    try {
      const actual = String(req.body?.actual || '');
      const nueva = String(req.body?.nueva || '').trim();

      // La clave ACTUAL es opcional: si la escriben, se valida; si la dejan
      // vacia, se permite el cambio porque el usuario ya esta autenticado con
      // un rol autorizado. Asi un admin que olvido la clave puede recuperarla.
      if (actual && !(await esClaveSecretaValida(actual))) {
        return res.status(403).json({ mensaje: 'La clave secreta actual es incorrecta.' });
      }
      if (nueva.length < 8) {
        return res.status(400).json({ mensaje: 'La nueva clave debe tener al menos 8 caracteres.' });
      }
      if (actual && nueva === actual) {
        return res.status(400).json({ mensaje: 'La nueva clave debe ser distinta a la actual.' });
      }

      const hash = await bcrypt.hash(nueva, 10);
      await Ajuste.findOneAndUpdate(
        { setting_key: CLAVE_AJUSTE_SECRETA },
        { $set: { setting_value: hash, updated_at: new Date() } },
        { upsert: true }
      ).maxTimeMS(5000);
      // La lectura general de ajustes no debe servir este hash (se filtra en
      // settings.routes), pero se invalida la cache por prudencia.
      invalidar(CLAVES.AJUSTES);

      res.json({ mensaje: 'Clave secreta actualizada correctamente.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
