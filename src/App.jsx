import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import PantallaPrincipal from './pages/PantallaPrincipal.jsx';
import ChecadorKiosco from './pages/ChecadorKiosco.jsx';
import RegistroAlumno from './pages/RegistroAlumno.jsx';
import AdminPortal from './pages/AdminPortal.jsx';
import Asistencia from './pages/Asistencia.jsx';
import { iniciarKeepAlive } from './services/keepAlive.js';

/**
 * Gym UES - Enrutador principal.
 * La raiz "/" es la PantallaPrincipal (launcher del .exe) que da paso al
 * ChecadorKiosco (/checador) y al Login del Administrador (/admin). El
 * ChecadorKiosco es fijo, sin scroll, con menu hamburguesa a la derecha
 * (consulta de asistencia + reglamento/horarios).
 */
export default function App() {
  
  // Mantiene despierto al servidor: con el plan gratuito de Render, el servicio
  // se apaga tras unos minutos sin peticiones. La senal se envia cada pocos
  // minutos mientras la aplicacion este abierta (ver services/keepAlive.js).
  useEffect(() => iniciarKeepAlive(), []);

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