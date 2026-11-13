// Gym UES - Datos de contacto y responsables del proyecto.
//
// Se centralizan aqui para que el panel administrativo y el checador muestren
// exactamente la misma informacion sin duplicarla en cada pantalla.

export const CONTACTO_SOPORTE = {
  telefono: '6625374491',
  telefonoLegible: '662 537 4491',
  telefonoLlamada: '+526625374491',
  whatsapp: '526625374491',
  correo: 'Franciscoaguayo2005@gmail.com',
  responsable: 'Carlos Francisco Aguayo Villa'
};

export const EQUIPO_PROYECTO = [
  {
    nombre: 'Carlos Francisco Aguayo Villa',
    rol: 'Encargado principal y jefe de proyecto',
    insignia: 'Jefe de proyecto',
    destacado: true,
    telefono: '6625374491',
    telefonoLegible: '662 537 4491',
    correo: 'Franciscoaguayo2005@gmail.com',
    carrera: 'Ingeniería en Software',
    matricula: '23020220053'
  },
  {
    nombre: 'Karim Miranda De los Reyes',
    rol: 'Programador',
    telefono: '6628487598',
    telefonoLegible: '662 848 7598',
    correo: 'Karimmirandadelosreyes@gmail.com',
    carrera: 'Ingeniería en Software',
    matricula: '22020570040'
  },
  {
    nombre: 'Hugo Martínez Galaz',
    rol: 'Programador',
    carrera: 'Ingeniería en Software'
  },
  {
    nombre: 'Damián Alejandro Coronado Sierra',
    rol: 'Programador',
    carrera: 'Ingeniería en Software'
  },
  {
    nombre: 'Sergio Alan Valenzuela Pacheco',
    rol: 'Programador',
    carrera: 'Ingeniería en Software'
  },
  {
    nombre: 'Mtro. Jali Gerardo Espinoza Zepeda',
    rol: 'Asesor y encargado de la creación del proyecto',
    insignia: 'Asesor',
    asesor: true,
    carrera: 'Ingeniería en Software'
  }
];

/** Iniciales para el avatar de cada tarjeta (sin contar titulos como Mtro.). */
export function iniciales(nombre) {
  const palabras = String(nombre || '')
    .replace(/\b(Mtro|Mtra|Dr|Dra|Ing|Lic)\.?\s/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return `${palabras[0][0]}${palabras[palabras.length - 1][0]}`.toUpperCase();
}
