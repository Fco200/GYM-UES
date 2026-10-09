import { urlArchivo } from '../services/api.js';

// Iniciales del nombre: hasta dos letras. Con "Juan Pérez López" devuelve "JL".
function iniciales(texto) {
  const partes = String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * AvatarUsuario - Muestra la foto de perfil de una cuenta. Si la cuenta no
 * tiene foto (o la imagen no carga) quedan visibles las iniciales del nombre
 * sobre un fondo discreto, de modo que el header nunca queda vacio.
 */
export default function AvatarUsuario({ nombre, foto = '', tamano = '' }) {
  const clases = ['avatar-usuario', tamano ? `avatar-usuario-${tamano}` : '']
    .filter(Boolean)
    .join(' ');
  const url = foto ? urlArchivo(foto) : '';

  return (
    <span className={clases} aria-hidden="true">
      <span className="avatar-usuario-iniciales">{iniciales(nombre)}</span>
      {url ? (
        <img
          src={url}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
    </span>
  );
}
