/**
 * PantallaCarga - cartel de carga a pantalla completa para las transiciones de
 * sesion del administrador (inicio y cierre).
 *
 * POR QUE EXISTE: al iniciar sesion, el portal cambia de golpe del formulario
 * de acceso al panel con sus cinco pestanas. Ese salto se lee como un parpadeo.
 * Al poner este cartel encima durante la transicion, el paso se vuelve
 * intencionado y el usuario sabe que la aplicacion esta trabajando.
 *
 * Es un sibling del contenido, nunca un contenedor: se monta al final del
 * arbol para que el z-index no dependa de donde se use. El fondo tapa todo y
 * el cartel usa los colores del tema, asi que funciona igual en modo oscuro.
 */
export default function PantallaCarga({
  visible,
  titulo = 'Gimnasio UES',
  mensaje = 'Cargando...'
}) {
  if (!visible) return null;

  return (
    <div className="gym-carga-fondo" role="status" aria-live="polite">
      <div className="gym-carga-caja">
        <div className="gym-carga-spinner" aria-hidden="true" />
        <p className="gym-carga-marca">{titulo}</p>
        <p className="gym-carga-mensaje">{mensaje}</p>
      </div>
    </div>
  );
}
