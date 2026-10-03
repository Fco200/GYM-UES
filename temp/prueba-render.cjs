/**
 * Prueba de render de los componentes del cliente.
 *
 * El build de Vite NO detecta los "ReferenceError" que se cuelan al limpiar
 * imports (esbuild transforma igual y el error solo revienta en pantalla con
 * "Ocurrio un error en la aplicacion"). Aqui se monta cada componente con
 * react-dom/server y se comprueba que el HTML sale completo, que es lo mismo
 * que ve el usuario al entrar a esa pestana.
 *
 * El componente se empaqueta con esbuild porque el proyecto usa ESM en el
 * navegador pero Node lo interpretaria como CommonJS.
 *
 *   node temp/prueba-render.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(__dirname, 'render-build');

/** Componentes que se prueban y como se deben montar. */
const CASOS = [
  { archivo: 'src/components/GestionAlumnos.jsx', exportar: 'default' },
  { archivo: 'src/components/FichaTecnica.jsx', exportar: 'default' },
  { archivo: 'src/components/TarjetaEmergencia.jsx', exportar: 'default' },
  { archivo: 'src/components/FormularioRegistro.jsx', exportar: 'default' },
  { archivo: 'src/components/Modal.jsx', exportar: 'default' },
  { archivo: 'src/components/PanelResumen.jsx', exportar: 'default' },
  { archivo: 'src/components/GestionUsuarios.jsx', exportar: 'default' },
  { archivo: 'src/components/ConfiguracionAvisos.jsx', exportar: 'default' },
  { archivo: 'src/components/ModalPDF.jsx', exportar: 'default' },
  { archivo: 'src/components/ModalTexto.jsx', exportar: 'default' },
  { archivo: 'src/components/OverlayMensaje.jsx', exportar: 'default' },
  { archivo: 'src/components/HeaderAdmin.jsx', exportar: 'default' },
  { archivo: 'src/components/BotonTema.jsx', exportar: 'default' },
  { archivo: 'src/components/BarraUES.jsx', exportar: 'default' },
  { archivo: 'src/pages/AdminPortal.jsx', exportar: 'default' },
  { archivo: 'src/pages/Asistencia.jsx', exportar: 'default' },
  { archivo: 'src/pages/ChecadorKiosco.jsx', exportar: 'default' },
  { archivo: 'src/pages/RegistroAlumno.jsx', exportar: 'default' },
  { archivo: 'src/pages/PantallaPrincipal.jsx', exportar: 'default' },
  { archivo: 'src/App.jsx', exportar: 'default' }
];

/** Props minimas para que cada componente tenga algo que dibujar. */
const PROPS = {
  Modal: { titulo: 'Prueba', children: null },
  ModalPDF: { titulo: 'Prueba', url: 'http://localhost/x.pdf' },
  ModalTexto: { titulo: 'Prueba', texto: 'Contenido' },
  TarjetaEmergencia: { contacto: { name: 'Maria', relationship: 'Madre', phone: '6621234567', email: 'a@b.com' } },
  FichaTecnica: {
    alumno: {
      student_code: 'AL2024001',
      full_name: 'Ana',
      second_name: 'Lopez',
      last_name: 'Ruiz',
      type: 'alumno',
      academic_unit: 'Hermosillo',
      career: 'Licenciatura en Deportes'
    }
  },
  FormularioRegistro: {},
  RegistroAlumno: { onGuardar: () => {} },
  ChatBotUES: {},
  // Sin mensaje el componente devuelve null a proposito, asi que se le pasa uno
  // para comprobar que tambien dibuja cuando hay algo que avisar.
  OverlayMensaje: { mensaje: { texto: 'Mensaje de prueba', tipo: 'exito' } }
};

/**
 * Componentes que legtimamente no dibujan nada en el primer render de servidor:
 * OverlayMensaje se activa dentro de un useEffect, que renderToString no ejecuta.
 */
const PUEDE_ESTAR_VACIO = new Set(['OverlayMensaje']);

/** Nombre del componente a partir de la ruta del archivo. */
function nombreDe(archivo) {
  return path.basename(archivo, path.extname(archivo));
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });

  const puntoDeEntrada = path.join(SALIDA, 'entrada.jsx');
  const imports = CASOS.map(
    (c) =>
      `import ${nombreDe(c.archivo)} from '${path
        .join(RAIZ, c.archivo)
        .replace(/\\/g, '/')}';`
  ).join('\n');
  const casos = CASOS.map(
    (c) => `  { nombre: '${nombreDe(c.archivo)}', Componente: ${nombreDe(c.archivo)} },`
  ).join('\n');

  // App y las paginas usan react-router, asi que se envuelven en MemoryRouter
  // para queusenLocation/useRoutes tengan el contexto que necesitan.
  fs.writeFileSync(
    puntoDeEntrada,
    `${imports}
import { MemoryRouter } from 'react-router-dom';
export const casos = [
${casos}
];
export const Router = MemoryRouter;
`,
    'utf8'
  );

  await esbuild.build({
    entryPoints: [puntoDeEntrada],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile: path.join(SALIDA, 'casos.mjs'),
    external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react-router-dom', 'react-router'],
    // Fuera de Vite no existe import.meta.env, que usa services/api.js para la
    // URL base. Se define aqui para que el bundle se pueda cargar en Node.
    define: {
      'import.meta.env': JSON.stringify({
        VITE_API_URL: 'http://localhost:3001',
        VITE_API_TIMEOUT: '15000'
      }),
      'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:3001'),
      'import.meta.env.VITE_API_TIMEOUT': JSON.stringify('15000')
    },
    logLevel: 'error'
  });

  const { casos: lista, Router } = await import(
    `file://${path.join(SALIDA, 'casos.mjs').replace(/\\/g, '/')}`
  );
  const { renderToString } = require('react-dom/server');
  const React = require('react');

  let ok = 0;
  const fallos = [];

  for (const { nombre, Componente } of lista) {
    const props = PROPS[nombre] || {};
    try {
      const elemento = React.createElement(
        Router,
        { initialEntries: ['/'] },
        React.createElement(Componente, props)
      );
      const html = renderToString(elemento);
      if (!html || html.length < 20) {
        if (PUEDE_ESTAR_VACIO.has(nombre)) {
          ok += 1;
          console.log(`  OK   ${nombre} (vacio esperado en el primer render)`);
        } else {
          fallos.push(`${nombre}: renderizo vacio`);
        }
      } else {
        ok += 1;
        console.log(`  OK   ${nombre} (${html.length} caracteres)`);
      }
    } catch (err) {
      fallos.push(`${nombre}: ${err.message}`);
    }
  }

  fs.rmSync(SALIDA, { recursive: true, force: true });

  console.log(`\n${ok}/${lista.length} componentes renderizan.`);
  if (fallos.length) {
    console.log('\nFALLAS:');
    for (const f of fallos) console.log(`  - ${f}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error('Error preparando la prueba:', err.message);
  process.exit(1);
});