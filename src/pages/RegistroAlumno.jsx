import BarraUES from '../components/BarraUES.jsx';
import OverlayMensaje, { useMensaje } from '../components/OverlayMensaje.jsx';
import FormularioRegistro from '../components/FormularioRegistro.jsx';
import { createStudent } from '../services/api.js';

// Registro de alta publica (alumno / personal UES / exterior). Para 'exterior'
// la clave GYM-XXXXXX se genera sola. Reutiliza FormularioRegistro (mismo
// formulario que el modal del panel admin y el auto-registro del checador).
export default function RegistroAlumno() {
  const { mensaje, mostrar } = useMensaje();

  const guardar = async (payload) => {
    const res = await createStudent(payload);
    const generada = res.estudiante?.student_code;
    mostrar(
      res.mensaje + (generada ? ` Clave asignada: ${generada}.` : ''),
      'exito'
    );
  };

  return (
    <div className="panel">
      <BarraUES />
      <div className="encabezado-pagina">
        <h1>Registro de Personas</h1>
        <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
          Elija el tipo de registro. Si es personal de la UES, indique su unidad
          académica, área laboral y puesto.
        </p>
      </div>

      <FormularioRegistro
        onGuardar={guardar}
        botonTexto="Guardar registro"
        tituloGratis="Conserve la clave que se le muestre al final; servirá para checar su asistencia."
      />

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}