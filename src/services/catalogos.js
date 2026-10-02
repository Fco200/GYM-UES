// Gym UES - Catalogos institucionales en el navegador.
//
// Importa el MISMO archivo JSON que valida el servidor (shared/catalogos.json),
// de modo que un desplegable nunca puede ofrecer una opcion que el backend
// va a rechazar. Solo se adaptan los nombres de las claves a camelCase para que
// el codigo del componente se lea igual que el resto del frontend.
import datos from '../../shared/catalogos.json';

const soloValor = (lista) => (lista || []).map((o) => o.valor);

// Tipos de persona: alumno, personal UES y exterior.
export const TIPOS_PERSONA = datos.tipos;
export const IDS_TIPO = TIPOS_PERSONA.map((t) => t.id);

// Areas laborales del personal UES.
export const AREAS_TRABAJO = soloValor(datos.areasTrabajo);

// Unidades academicas (campus de la UES).
export const UNIDADES_ACADEMICAS = soloValor(datos.unidadesAcademicas);

// Turnos y generos.
export const TURNOS = soloValor(datos.turnos);
export const GENEROS = soloValor(datos.generos);

// Valor de la unidad cuando la persona no pertenece a ningun campus o el dato
// todavia no se ha capturado. El backend acepta ambas formas.
export const SIN_UNIDAD = '';

/** Devuelve la configuracion del tipo de persona, o la de 'alumno' como base. */
export function configTipo(id) {
  return TIPOS_PERSONA.find((t) => t.id === id) || TIPOS_PERSONA[0];
}

/** Etiqueta corta para chips y tablas: 'Alumno', 'Personal UES', 'Exterior'. */
export function etiquetaTipo(id) {
  return configTipo(id).etiquetaCorta;
}

/** Nombre del campo de adscripcion segun el tipo: Carrera / Departamento / Empresa. */
export function etiquetaCarrera(id) {
  return configTipo(id).campoCarrera;
}

/**
 * Une una opcion vacia ('Seleccione...') con la lista del catalogo.
 * Se usa en todos los <select> para que ningun campo quede inconsistente.
 */
export function opcionesConVacio(lista, vacio = 'Seleccione...') {
  return [{ valor: '', etiqueta: vacio }, ...lista.map((v) => ({ valor: v, etiqueta: v }))];
}

/** Texto legible de un valor de catalogo, tolerante a vacios. */
export function texto(valor, porDefecto = '—') {
  const v = String(valor || '').trim();
  return v || porDefecto;
}