import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { iniciarTema } from './services/tema.js';
import './styles/global.css';

// Aplica el tema guardado y se queda escuchando los cambios de tema del
// sistema operativo. El script inline de index.html ya habia puesto el valor
// inicial para evitar el parpadeo; esto lo deja sincronizado con React.
iniciarTema();

// ErrorBoundary: evita pantallas en blanco. Si un componente lanza un error se
// muestra un aviso con el mensaje y la opcion de recargar en lugar de un fondo
// blanco sin contenido visible.
class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  recargar = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>Ocurrió un error en la aplicación</h1>
          <p>{String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}</p>
          <button type="button" className="btn btn-primario" onClick={this.recargar}>
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// HashRouter: robusto para Electron (file://) y para Vite en desarrollo
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Boundary>
        <App />
      </Boundary>
    </HashRouter>
  </React.StrictMode>
);