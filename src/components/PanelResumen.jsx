import { useCallback, useEffect, useState } from 'react';
import { getPanelResumen, getPanelAdentro } from '../services/api.js';
import { texto } from '../services/catalogos.js';
import OverlayMensaje, { useMensaje } from './OverlayMensaje.jsx';
import useAutoRefresh, { INTERVALO_REFRESCO_MS } from '../hooks/useAutoRefresh.js';

/**
 * Tarjeta de indicador: valor grande + etiqueta + detalle opcional.
 * El borde superior conserva el color guinda de la identidad del gimnasio.
 */
function Kpi({ valor, etiqueta, detalle, destacado = false }) {
  return (
    <div className={`kpi ${destacado ? 'kpi-destacado' : ''}`}>
      <span className="kpi-valor">{valor}</span>
      <span className="kpi-etiqueta">{etiqueta}</span>
      {detalle && <span className="kpi-detalle">{detalle}</span>}
    </div>
  );
}

/**
 * Barra proporcional de un desglose (por unidad, por area, por turno...).
 * El backend devuelve TODAS las opciones del catalogo, incluidas las que estan
 * en cero, para que el administrador vea la cobertura completa y no solo lo que
 * tiene Capturado.
 */
function BarraLista({ titulo, items, total, color = 'guinda', vacio = 'Sin datos' }) {
  if (!items || items.length === 0) {
    return (
      <div className="resumen-bloque">
        <h3 className="resumen-titulo">{titulo}</h3>
        <p className="texto-suave">{vacio}</p>
      </div>
    );
  }
  return (
    <div className="resumen-bloque">
      <h3 className="resumen-titulo">{titulo}</h3>
      <ul className="resumen-barras">
        {items.map((it) => {
          const pct = total > 0 ? Math.round((it.total * 100) / total) : 0;
          const nombre = it.valor || 'Sin capturar';
          return (
            <li key={`${titulo}-${it.valor}`} className="resumen-barra-item">
              <span className="resumen-barra-nombre" title={nombre}>
                {nombre}
              </span>
              <span className="resumen-barra-pista">
                <span
                  className={`resumen-barra-relleno barra-${color}`}
                  style={{ width: `${Math.max(pct, it.total > 0 ? 3 : 0)}%` }}
                />
              </span>
              <span className="resumen-barra-valor">
                <b>{it.total}</b> <em>{pct}%</em>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Resumen ejecutivo del panel administrativo.
 *
 * Todos los numeros llegan ya filtrados por el alcance del rol desde
 * /api/panel/resumen: un jefe de carrera ve solo sus carreras y un responsable
 * de turno solo su turno, sin que esta vista tenga que recalcular nada.
 */
export default function PanelResumen({ onIrAlDirectorio }) {
  const [datos, setDatos] = useState(null);
  const [adentro, setAdentro] = useState([]);
  const [cargando, setCargando] = useState(true);
  const { mensaje, mostrar } = useMensaje();

  const cargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCargando(true);
      try {
        setDatos(await getPanelResumen());
        setAdentro((await getPanelAdentro())?.registros || []);
      } catch (err) {
        if (!silencioso) mostrar(err.message, 'error');
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [mostrar]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El conteo de adentro cambia cada vez que alguien marca entrada o salida, asi
  // que la pantalla se refresca cada 5 minutos como el resto del panel.
  useAutoRefresh(() => cargar({ silencioso: true }), INTERVALO_REFRESCO_MS);

  if (cargando && !datos) return <p className="texto-centrado">Cargando resumen...</p>;
  if (!datos) {
    return <p className="aviso-error">No se pudo cargar el resumen del panel.</p>;
  }

  const { personas, hoy, cuentas, alcance } = datos;
  const certTotal = personas.certificados.conCertificado + personas.certificados.sinCertificado;
  const pctCertificado = certTotal > 0
    ? Math.round((personas.certificados.conCertificado * 100) / certTotal)
    : 0;

  return (
    <div className="panel">
      <div className="encabezado-pagina">
        <div>
          <h2>Resumen del Panel</h2>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>
            Indicadores del directorio institucional
            {alcance?.tipo === 'todo'
              ? ' (vista completa)'
              : ` (limitado por su rol: ${alcance?.turno ? `turno ${alcance.turno}` : 'carreras asignadas'})`}
            .
          </p>
        </div>
        <div className="encabezado-acciones">
          <button type="button" className="btn btn-secundario" onClick={() => cargar()} disabled={cargando}>
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>
          {onIrAlDirectorio && (
            <button type="button" className="btn btn-primario" onClick={onIrAlDirectorio}>
              Ir al directorio
            </button>
          )}
        </div>
      </div>

      {/* ---- Indicadores del dia ---- */}
      <div className="kpi-fila">
        <Kpi valor={hoy.entradas} etiqueta="Entradas hoy" destacado />
        <Kpi valor={hoy.adentro} etiqueta="Adentro ahora" detalle="Sin registrar salida" />
        <Kpi valor={hoy.salidas} etiqueta="Salidas hoy" />
        <Kpi valor={hoy.total} etiqueta="Movimientos del día" />
      </div>

      {/* ---- Indicadores del directorio ---- */}
      <div className="kpi-fila">
        <Kpi valor={personas.total} etiqueta="Personas registradas" />
        <Kpi valor={personas.personal.total} etiqueta="Personal UES" />
        <Kpi valor={personas.altasMes} etiqueta="Altas del mes" />
        <Kpi
          valor={`${pctCertificado}%`}
          etiqueta="Con certificado médico"
          detalle={`${personas.certificados.sinCertificado} pendientes`}
        />
        {cuentas && <Kpi valor={cuentas.total} etiqueta="Cuentas del sistema" />}
      </div>

      {/* ---- Desgloses ---- */}
      <div className="resumen-grid">
        <BarraLista titulo="Por tipo de persona" items={personas.porTipo} total={personas.total} />
        <BarraLista titulo="Por unidad académica" items={personas.porUnidad} total={personas.total} />
        <BarraLista titulo="Por área laboral" items={personas.porArea} total={personas.personal.total} color="dorado" />
        <BarraLista titulo="Por turno" items={personas.porTurno} total={personas.total} color="azul" />
        <BarraLista titulo="Carreras y adscripciones con más registros" items={personas.porCarrera} total={personas.total} color="verde" />
        {cuentas?.porRol && (
          <BarraLista titulo="Cuentas por rol" items={cuentas.porRol} total={cuentas.total} color="azul" />
        )}
      </div>

      {/* ---- Quien sigue dentro del gimnasio ---- */}
      <div className="panel-seccion">
        <h3 className="resumen-titulo">Dentro del gimnasio ahora ({adentro.length})</h3>
        {adentro.length === 0 ? (
          <p className="texto-suave">
            No hay personas con entrada registrada y sin salida en la jornada de hoy.
          </p>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Nombre</th>
                  <th>Unidad académica</th>
                  <th>Área</th>
                  <th>Puesto</th>
                  <th>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {adentro.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.student_code}</td>
                    <td>{r.full_name}</td>
                    <td>{texto(r.academic_unit, 'Sin capturar')}</td>
                    <td>{texto(r.work_area, '—')}</td>
                    <td>{texto(r.job_title, '—')}</td>
                    <td>
                      {r.check_in
                        ? new Date(r.check_in).toLocaleTimeString('es-SV', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OverlayMensaje mensaje={mensaje} />
    </div>
  );
}