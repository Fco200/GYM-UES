// Gym UES - Validaciones compartidas del formulario de alumnos.
//
// Las usan el autoregistro publico y el modal de "actualizar mis datos" para
// que un mismo dato se valide igual sin importar desde donde se capture.

const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_TELEFONO = /^\+?[\d\s().-]{6,24}$/;

/** Deja el expediente en mayusculas y sin espacios, como se guarda en la BD. */
export function normalizarExpediente(valor) {
  return String(valor || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 20);
}

export function validarNombre(valor, etiqueta) {
  const limpio = String(valor || '').trim();
  if (!limpio) return `Ingresa tu ${etiqueta}.`;
  if (limpio.length < 2 || !RE_NOMBRE.test(limpio)) {
    return `El ${etiqueta} solo debe contener letras y espacios.`;
  }
  return '';
}

export function validarCorreo(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return 'Ingresa tu correo electrónico.';
  if (!RE_CORREO.test(limpio)) return 'Escribe un correo electrónico válido.';
  return '';
}

export function validarTelefono(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return 'Ingresa tu teléfono.';
  if (!RE_TELEFONO.test(limpio)) return 'Usa solo números, espacios, guiones o paréntesis.';
  const digitos = limpio.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 15) {
    return 'El teléfono debe tener entre 7 y 15 dígitos.';
  }
  return '';
}

export function validarSeleccion(valor, etiqueta) {
  if (!String(valor || '').trim()) return `Selecciona tu ${etiqueta}.`;
  return '';
}
