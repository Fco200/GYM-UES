/**
 * Gym UES - Middleware de autenticacion por token en memoria.
 * Para una aplicacion de escritorio local de un solo admin es suficiente y
 * evita dependencias externas. El token lo emite el login.
 */
const crypto = require('crypto');

const tokens = new Map(); // token -> { username, role, expiresAt }

const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 horas

// Genera un token unico para un usuario
function createToken(user) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, {
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + TOKEN_TTL
  });
  return token;
}

// Invalida un token (logout)
function revokeToken(token) {
  tokens.delete(token);
}

// Middleware Express: exige token valido en Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ mensaje: 'No autorizado. Inicie sesion.' });
  }
  const session = tokens.get(token);
  if (!session || session.expiresAt < Date.now()) {
    tokens.delete(token);
    return res.status(401).json({ mensaje: 'Sesion expirada. Inicie sesion nuevamente.' });
  }
  req.auth = { ...session, token };
  next();
}

// Middleware de roles: exige que el usuario autenticado tenga uno de los roles
// indicados. La configuracion institucional (reglamento/horarios) queda
// EXCLUSIVAMENTE para super_admin / admin; los maestros de turno no la tocan.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req || !req.auth || !roles.includes(req.auth.role)) {
      return res
        .status(403)
        .json({ mensaje: 'No tiene permisos para realizar esta accion.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, createToken, revokeToken };