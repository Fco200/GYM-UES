/**
 * Revision estatica dirigida a la clase de error mas comun al limpiar imports:
 * usar una constante o un componente que NO esta importado ni definido en el
 * archivo. esbuild transforma el codigo sin avisar, asi que el fallo solo aparece
 * en pantalla ("Ocurrio un error en la aplicacion") cuando el usuario llega a
 * esa parte. Asi paso con TIPOS_PERSONA en el directorio de personas.
 *
 * Solo se reportan identificadores en MAYUSCULAS_CON_BARRA (catalagos como
 * TIPOS_PERSONA o TURNOS) y componentes PascalCase, que es donde se concentran
 * estos errores. Las etiquetas y atributos JSX se eliminan antes de buscar.
 *
 *   node temp/revisar-identificadores.cjs
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/** Componentes que el propio JSX usa y que no hay que importar. */
const ETIQUETAS_HTML = new Set([
  'div', 'span', 'p', 'a', 'b', 'strong', 'i', 'em', 'u', 'small', 'label', 'form', 'input',
  'button', 'select', 'option', 'optgroup', 'textarea', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'th', 'td', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'main',
  'nav', 'aside', 'section', 'article', 'img', 'iframe', 'dialog', 'fieldset', 'legend',
  'details', 'summary', 'progress', 'meter', 'canvas', 'video', 'audio', 'picture', 'template'
]);

const GLOBALES = new Set([
  'React', 'Fragment', 'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useRef',
  'useContext', 'useReducer', 'useId', 'Component', 'Fragment', 'JSON', 'Math', 'Date', 'Number',
  'String', 'Boolean', 'Object', 'Array', 'Error', 'Promise', 'Set', 'Map', 'URL', 'Blob',
  'FileReader', 'FormData', 'Intl', 'RegExp', 'NaN', 'Infinity', 'console', 'window', 'document',
  'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'alert', 'confirm',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'process', 'globalThis'
]);

/** Elimina comentarios, el texto de JSX y los valores de atributos. */
function limpiar(codigo) {
  let c = codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  // Textos de JSX: todo lo que va entre > y < que no sea una expresion {...}.
  c = c.replace(/>([^<>{}]+)</g, '><');

  // Atributos con valor de texto: name="texto" -> name=""
  c = c.replace(/=\s*"[^"]*"/g, '=""').replace(/=\s*'[^']*'/g, "=''");
  // Atributos con expresion: conservamos el contenido de { ... }
  c = c.replace(/=\s*\{\s*`[^`]*`\s*\}/g, '={""}');

  // Etiquetas de cierre/abertura simples.
  c = c.replace(/<\/?[A-Za-z][A-Za-z0-9._]*/g, ' ');

  // Cadenas de texto: acentos como "PDF", "UES" o "CSV" en prosa no son
  // identificadores, asi que se eliminan antes de buscar nombres.
  c = c.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  c = c.replace(/`(?:[^`\\]|\\.)*`/g, '``');

  return c;
}

function declarados(codigo) {
  const nombres = new Set();
  const patrones = [
    /import\s+([\w$]+)\s*(?:,\s*\{([^}]*)\})?\s*from/g,
    /import\s*\{([^}]*)\}\s*from/g,
    /import\s+([\w$]+)\s+from/g,
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([\w$]+)/g,
    /export\s+(?:default\s+)?class\s+([\w$]+)/g,
    /function\s+([\w$]+)/g,
    /class\s+([\w$]+)/g,
    /(?:const|let|var)\s+([\w$]+)/g,
    /(?:const|let|var)\s*\{([^}]*)\}\s*=/g,
    /(?:const|let|var)\s*\[([^\]]*)\]\s*=/g,
    /\(([^()]*)\)\s*=>/g,
    /function\s+[\w$]*\s*\(([^()]*)\)/g,
    /\(([^()]*)\)\s*\{/g
  ];
  for (const patron of patrones) {
    let m;
    while ((m = patron.exec(codigo)) !== null) {
      for (const grupo of m.slice(1)) {
        if (!grupo) continue;
        for (const parte of grupo.split(',')) {
          const n = parte
            .trim()
            .replace(/\/\/.*$/, '')
            .split(':')
            .pop()
            .replace(/^\.\.\./, '')
            .split('=')[0]
            .replace(/[{}[\]]/g, '')
            .trim();
          if (/^[A-Za-z_$][\w$]*$/.test(n)) nombres.add(n);
        }
      }
    }
  }
  return nombres;
}

function sospechosos(codigo) {
  const nombres = new Set();
  // Constantes de catalogo: deben llevar guion bajo (TIPOS_PERSONA, AREAS_TRABAJO,
  // UNIDADES_ACADEMICAS, TURNOS). Ese es el patron que se rompe al limpiar
  // imports; exigir el guion bajo evita confusiones con siglas en prosa como
  // "PDF", "UES" o "CSV", que viven dentro de textos.
  const reConst = /(?<![.\w$'"`])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?![.\w$(])/g;
  // Componentes: PascalCase, excluyendo las etiquetas HTML conocidas.
  const reComp = /(?<![.\w$'"`])<([A-Z][A-Za-z0-9_]*)/g;
  let m;
  while ((m = reConst.exec(codigo)) !== null) {
    const n = m[1];
    if (!GLOBALES.has(n)) nombres.add(n);
  }
  while ((m = reComp.exec(codigo)) !== null) {
    const n = m[1];
    if (!ETIQUETAS_HTML.has(n) && !GLOBALES.has(n)) nombres.add(n);
  }
  return nombres;
}

function listar(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...listar(completo));
    else if (/\.jsx?$/.test(e.name)) salida.push(completo);
  }
  return salida;
}

const solo = process.argv[2];
const archivos = solo
  ? listar(RAIZ).filter((f) => f.endsWith(solo))
  : listar(RAIZ);

let conProblemas = 0;
for (const archivo of archivos) {
  const codigo = limpiar(fs.readFileSync(archivo, 'utf8'));
  const definidos = declarados(codigo);
  const faltan = [...sospechosos(codigo)].filter((n) => !definidos.has(n)).sort();
  if (faltan.length) {
    conProblemas += 1;
    console.log(`\n${path.relative(path.join(__dirname, '..'), archivo)}`);
    console.log(`  NO DEFINIDOS: ${faltan.join(', ')}`);
  }
}

console.log(
  `\n${archivos.length} archivos revisados, ${conProblemas} con identificadores no definidos.`
);

// Sale con codigo de error para que npm test frene si algo quedo sin importar.
process.exit(conProblemas ? 1 : 0);