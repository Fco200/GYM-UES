/**
 * Gym UES - Punto de entrada de los modelos (server/models).
 *
 * Un unico lugar que exporta todos los modelos ya compilados. Las rutas
 * importan de aqui y nunca de mongoose directamente, de modo que el motor de
 * base de datos queda encapsulado y se puede cambiar sin tocar el API.
 */
'use strict';

const Alumno = require('./alumno.model');
const Asistencia = require('./asistencia.model');
const Usuario = require('./usuario.model');
const Ajuste = require('./ajuste.model');
const CodigoRecuperacion = require('./codigo.model');
const { serializar, serializarVarios, hoy, rangoDelDia, rangoDeFechas, esId, aObjectId } = require('./serializador');
const { diagnostico: diagnosticoZona } = require('../zona');

module.exports = {
  Alumno,
  Asistencia,
  Usuario,
  Ajuste,
  CodigoRecuperacion,
  serializar,
  serializarVarios,
  hoy,
  rangoDelDia,
  rangoDeFechas,
  diagnosticoZona,
  esId,
  aObjectId
};
