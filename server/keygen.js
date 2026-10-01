/**
 * Gym UES - Generacion de claves unicas para personas exteriores (GYM-XXXXXX).
 * Compartido por students.routes y public.routes para no duplicar logica.
 */
'use strict';

const { Alumno } = require('./models');
const { serializar } = require('./models/serializador');

function generarClaveExterior() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'GYM-';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Genera una clave exterior verificando en MongoDB que no este en uso.
async function generarClaveUnica() {
  for (let i = 0; i < 10; i += 1) {
    const code = generarClaveExterior();
    // exists() solo responde si/no sobre el indice unico: es la consulta mas
    // barata posible para comprobar disponibilidad.
    const existe = await Alumno.exists({ student_code: code }).maxTimeMS(5000);
    if (!existe) return code;
  }
  return `GYM-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { generarClaveExterior, generarClaveUnica };
