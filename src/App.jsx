import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import PantallaPrincipal from './pages/PantallaPrincipal.jsx';
import ChecadorKiosco from './pages/ChecadorKiosco.jsx';
import RegistroAlumno from './pages/RegistroAlumno.jsx';
import AdminPortal from './pages/AdminPortal.jsx';
import Asistencia from './pages/Asistencia.jsx';

/**
 * Gym UES - Enrutador principal.
 * La raiz "/" es la PantallaPrincipal (launcher del .exe) que da paso al
 * ChecadorKiosco (/checador) y al Login del Administrador (/admin). El
 * ChecadorKiosco es fijo, sin scroll, con menu hamburguesa a la derecha
 * (consulta de asistencia + reglamento/horarios).
 */
export default function App() {
  
  // Mecanismo para evitar que Render entre en suspensión por inactividad
  useEffect(() => {
    const mantenerActivo = async () => {
      try {
        // Hace una petición ligera al backend en Render cada 5 minutos
        await fetch('https://gym-ues-3rx8.onrender.com/api/ping');
      } catch (error) {
        // Silenciamos errores menores de red para no interrumpir la interfaz
        console.error('Error en el ping de mantenimiento:', error);
      }
    };

    // Ejecutar inmediatamente al abrir la app y luego repetir cada 5 minutos (300,000 ms)
    mantenerActivo();
    const intervalo = setInterval(mantenerActivo, 300000);

    // Limpiar el intervalo cuando el componente se desmonte
    return () => clearInterval(intervalo);
  }, []);

  return (
    <div className="app">
      <main className="contenido">
        <Routes>
          <Route path="/" element={<PantallaPrincipal />} />
          <Route path="/checador" element={<ChecadorKiosco />} />
          <Route path="/registro" element={<RegistroAlumno />} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/asistencia" element={<Asistencia />} />
        </Routes>
      </main>
    </div>
  );
}