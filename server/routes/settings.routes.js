/**
 * Gym UES - Rutas de configuracion: lectura publica y actualizacion (solo admin).
 * Almacena reglamento, horarios y URLs de PDFs en la coleccion `ajustes`.
 *
 * Sobre MongoDB Atlas la lectura se cachea en memoria durante
 * AJUSTES_CACHE_MS: el checador pide la configuracion al abrirse y el texto
 * institucional cambia muy rara vez, asi que no tiene sentido ir a Atlas en
 * cada visita. La escritura invalida la cache al instante.
 */
const express = require('express');
const { Ajuste } = require('../models');
const { requireAuth, requireRole } = require('../middleware');
const { leer, guardar, invalidar, CLAVES } = require('../cache');

const router = express.Router();

const AJUSTES_CACHE_MS = Number(process.env.AJUSTES_CACHE_MS || 60_000);

// Ajustes internos que NUNCA salen por el API general: el hash de la clave
// secreta solo se maneja desde /api/auth/clave-secreta (con su propio rol).
const CLAVES_PRIVADAS = new Set(['clave_secreta_admin_hash']);

async function leerAjustes() {
  const cacheado = leer(CLAVES.AJUSTES, AJUSTES_CACHE_MS);
  if (cacheado) return cacheado;
  const docs = await Ajuste.find({ setting_key: { $nin: [...CLAVES_PRIVADAS] } })
    .select({ setting_key: 1, setting_value: 1, _id: 0 })
    .lean()
    .maxTimeMS(5000);
  const result = {};
  for (const d of docs) result[d.setting_key] = d.setting_value;
  return guardar(CLAVES.AJUSTES, result, AJUSTES_CACHE_MS);
}

// GET /api/settings - devuelve todas las configuraciones como objeto
router.get('/', async (_req, res, next) => {
  try {
    res.json(await leerAjustes());
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings - actualiza una o varias configuraciones  { clave: valor }
// Restringido EXCLUSIVAMENTE a super_admin / admin. Los maestros de turno no
// tienen permisos sobre la configuracion institucional.
router.put(
  '/',
  requireAuth,
  requireRole('super_admin', 'admin'),
  async (req, res, next) => {
  try {
    const body = req.body || {};
    const keys = Object.keys(body);

    // La forma correcta es { clave: valor }, por ejemplo { reglamento: "..." }.
    // Si alguien manda el documento crudo ({ setting_key, setting_value }) se
    // crearian dos ajustes basura llamados "setting_key" y "setting_value",
    // asi que se rechaza con un mensaje claro en vez de guardar basura.
    if (keys.includes('setting_key') || keys.includes('setting_value')) {
      return res.status(400).json({
        mensaje:
          'Formato incorrecto. Envia { clave: valor }, por ejemplo { "reglamento": "texto" }.'
      });
    }

    const entries = Object.entries(body).filter(([k]) => /^[a-zA-Z0-9_]+$/.test(k));
    // La clave secreta (hash bcrypt) solo se cambia por su ruta dedicada,
    // que exige la clave actual y restringe los roles permitidos.
    if (entries.some(([k]) => CLAVES_PRIVADAS.has(k))) {
      return res.status(403).json({
        mensaje: 'Esa configuracion se cambia desde Seguridad del portal.'
      });
    }
    if (entries.length === 0) {
      return res.status(400).json({ mensaje: 'No hay configuraciones validas para guardar.' });
    }
    const ahora = new Date();
    // bulkWrite: una sola ida y vuelta a Atlas en vez de una por clave.
    await Ajuste.bulkWrite(
      entries.map(([clave, valor]) => ({
        updateOne: {
          filter: { setting_key: clave },
          update: { $set: { setting_value: String(valor), updated_at: ahora } },
          upsert: true
        }
      })),
      { ordered: false }
    );
    invalidar(CLAVES.AJUSTES);
    res.json({ mensaje: 'Configuracion guardada correctamente.' });
  } catch (err) {
    next(err);
  }
  }
);

module.exports = router;
