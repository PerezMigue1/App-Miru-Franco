/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * GP-04: reglas del sistema de diseño revisadas sobre el código real de src/.
 *
 * Regla 1: los colores solo se escriben en src/shared/ui/colores.ts. Ningún otro archivo tiene un
 * hex (#rgb, #rgba, #rrggbb o #rrggbbaa) ni rgb( o rgba(.
 *
 * Regla 2: src/shared no depende de src/features (ni con '@/features/...' ni con rutas relativas
 * que caigan dentro de src/features). Lo que una pieza compartida necesite de una feature se lo inyecta
 * la raíz src/app/_layout.tsx (por ejemplo, la sesión de AccionesCabecera con SesionCabeceraProvider).
 */

const RAIZ = path.resolve(__dirname, '../../..');
const SRC = path.join(RAIZ, 'src');
const SHARED = path.join(SRC, 'shared');
const FEATURES = path.join(SRC, 'features');
const ARCHIVO_COLORES = path.join(SRC, 'shared', 'ui', 'colores.ts');

/** Ruta relativa a la raíz con diagonales normales, para mensajes legibles en cualquier sistema. */
function relativa(ruta: string): string {
  return path.relative(RAIZ, ruta).split(path.sep).join('/');
}

/** Archivos .ts y .tsx bajo una carpeta, recorriendo subcarpetas. */
function codigoBajo(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return codigoBajo(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Número de línea (desde 1) de una posición dentro del texto. */
function lineaDe(texto: string, indice: number): number {
  return texto.slice(0, indice).split('\n').length;
}

// ---------------------------------------------------------------------------------------------
// Regla 1: colores literales
// ---------------------------------------------------------------------------------------------

/**
 * Hex de color: '#' con 3, 4, 6 u 8 dígitos hex.
 * - Antes no puede ir una letra, dígito, '_' ni '&' (evita 'a#fff' y entidades como '&#123;').
 * - Después no puede seguir otra letra, dígito, '_' ni '-' (evita '#fade-in' o '#bad-id', que son
 *   ids de SVG como url(#fondo-hero), y '#12345' de 5 dígitos).
 */
const PATRON_HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
/** rgb( o rgba(, con o sin espacio antes del paréntesis. */
const PATRON_RGB = /\brgba?\s*\(/gi;
/** Comilla o acento grave justo antes del '#': el hex está al inicio de una cadena. */
const INICIO_DE_CADENA = /['"`]$/;

/**
 * Colores literales de un texto, con su línea. Un hex solo de dígitos decimales (#123, #2026) se
 * cuenta únicamente si abre una cadena ('#123', "#123" o `#123`): así se ignoran las referencias a
 * issues y PRs en comentarios ("(#48)", "issue #123") y un color de verdad en el código, que en
 * React Native siempre es una cadena, se sigue detectando. Un hex con alguna letra a-f se cuenta
 * siempre, esté donde esté.
 */
function coloresLiterales(texto: string): { linea: number; color: string }[] {
  const hallazgos: { indice: number; color: string }[] = [];
  for (const m of texto.matchAll(PATRON_HEX)) {
    const indice = m.index ?? 0;
    const soloDecimal = /^#\d+$/.test(m[0]);
    if (!soloDecimal || INICIO_DE_CADENA.test(texto.slice(0, indice))) {
      hallazgos.push({ indice, color: m[0] });
    }
  }
  for (const m of texto.matchAll(PATRON_RGB)) {
    hallazgos.push({ indice: m.index ?? 0, color: m[0] });
  }
  return hallazgos
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, color }) => ({ linea: lineaDe(texto, indice), color }));
}

describe('detector de colores literales', () => {
  it.each([
    ["color: '#fff'", '#fff'],
    ["color: '#FFFA'", '#FFFA'],
    ["color: '#B38E6F',", '#B38E6F'],
    ["color: '#710014cc'", '#710014cc'],
    ['fill="#161616"', '#161616'],
    ["color: '#123'", '#123'],
    ['const c = `#600011`;', '#600011'],
    ['// fondo #2a2a2a', '#2a2a2a'],
    ["backgroundColor: 'rgba(0, 0, 0, 0.5)'", 'rgba('],
    ["backgroundColor: 'rgb(1,2,3)'", 'rgb('],
    ["backgroundColor: 'RGBA (1,2,3,1)'", 'RGBA ('],
  ])('detecta el color en %s', (texto, color) => {
    expect(coloresLiterales(texto).map((h) => h.color)).toEqual([color]);
  });

  it.each([
    ['// GP-05 cerrado (#5, #18, #20)'],
    ['/** Ver issue #123 y PR #2026. */'],
    ['* (#100)'],
    ['fill="url(#fondo-hero-abajo)"'],
    ['fill="url(#fade-in)"'],
    ["const id = 'a#fff';"],
    ['texto &#123; entidad'],
    ["const id = '#12345';"],
    ["const id = '#abcdefg';"],
    ["const nombre = 'rgbaColor';"],
    ['const ref = useRef<View>(null);'],
  ])('no confunde con un color: %s', (texto) => {
    expect(coloresLiterales(texto)).toEqual([]);
  });

  it('reporta la línea correcta', () => {
    const texto = ['const a = 1;', '', "const b = { color: '#abc' };"].join('\n');
    expect(coloresLiterales(texto)).toEqual([{ linea: 3, color: '#abc' }]);
  });

  it('sí encuentra los colores reales de src/shared/ui/colores.ts (la expresión funciona)', () => {
    const contenido = fs.readFileSync(ARCHIVO_COLORES, 'utf8');
    const colores = coloresLiterales(contenido).map((h) => h.color);
    expect(colores).toEqual(expect.arrayContaining(['#DCC8B6', '#710014', 'rgba(']));
  });
});

describe('Regla 1: colores solo en src/shared/ui/colores.ts', () => {
  const archivos = codigoBajo(SRC).filter((ruta) => ruta !== ARCHIVO_COLORES);

  it('hay archivos de código que revisar en src/', () => {
    expect(archivos.length).toBeGreaterThan(0);
    expect(fs.existsSync(ARCHIVO_COLORES)).toBe(true);
  });

  it('ningún archivo de src/ fuera de colores.ts tiene un hex, rgb( o rgba(', () => {
    const hallazgos = archivos.flatMap((ruta) =>
      coloresLiterales(fs.readFileSync(ruta, 'utf8')).map(
        ({ linea, color }) => `${relativa(ruta)}:${linea} tiene el color literal ${color}`,
      ),
    );
    expect(hallazgos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Regla 2: src/shared no importa de src/features
// ---------------------------------------------------------------------------------------------

/**
 * Módulos que pide un archivo, con su línea: import ... from, import '...', export ... from,
 * import('...') y require('...').
 */
function importsDe(texto: string): { linea: number; modulo: string }[] {
  const patrones = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patrones
    .flatMap((patron) =>
      Array.from(texto.matchAll(patron), (m) => ({ indice: m.index ?? 0, modulo: m[1] })),
    )
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, modulo }) => ({ linea: lineaDe(texto, indice), modulo }));
}

/** true si el módulo pedido desde `origen` cae dentro de src/features. */
function apuntaAFeatures(origen: string, modulo: string): boolean {
  if (modulo === '@/features' || modulo.startsWith('@/features/')) {
    return true;
  }
  if (modulo.startsWith('.')) {
    const destino = path.resolve(path.dirname(origen), modulo);
    return destino === FEATURES || destino.startsWith(FEATURES + path.sep);
  }
  return false;
}

describe('detector de imports hacia src/features', () => {
  const ORIGEN = path.join(SHARED, 'ui', 'Ejemplo.tsx');

  it('encuentra import, export from, import(), require() y el import de solo efecto, con su línea', () => {
    const texto = [
      "import { a } from '@/features/auth/models/a';",
      "export { b } from '../../features/citas/b';",
      'const c = require("@/features/tienda/c");',
      "const d = import('@/features/inicio/d');",
      "import '@/features/notificaciones/e';",
      'import {',
      '  f,',
      "} from '@/features/auth/f';",
    ].join('\n');
    expect(importsDe(texto)).toEqual([
      { linea: 1, modulo: '@/features/auth/models/a' },
      { linea: 2, modulo: '../../features/citas/b' },
      { linea: 3, modulo: '@/features/tienda/c' },
      { linea: 4, modulo: '@/features/inicio/d' },
      { linea: 5, modulo: '@/features/notificaciones/e' },
      { linea: 8, modulo: '@/features/auth/f' },
    ]);
  });

  it.each([
    '@/features/auth/viewmodels/useAuth',
    '@/features',
    '../../features/auth/viewmodels/useAuth',
    '../../features',
  ])('marca %s desde src/shared/ui', (modulo) => {
    expect(apuntaAFeatures(ORIGEN, modulo)).toBe(true);
  });

  it.each([
    '@/shared/ui/tokens',
    '../api/apiClient',
    './tokens',
    'react-native',
    '@/assets/images/logo.png',
    '../../featuresExtra/algo',
    '@/featuresExtra/algo',
  ])('no marca %s desde src/shared/ui', (modulo) => {
    expect(apuntaAFeatures(ORIGEN, modulo)).toBe(false);
  });
});

describe('Regla 2: src/shared no importa de src/features', () => {
  const archivos = codigoBajo(SHARED);

  it('hay archivos de código que revisar en src/shared', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún archivo de src/shared importa algo de src/features', () => {
    const hallazgos = archivos.flatMap((ruta) =>
      importsDe(fs.readFileSync(ruta, 'utf8'))
        .filter(({ modulo }) => apuntaAFeatures(ruta, modulo))
        .map(({ linea, modulo }) => `${relativa(ruta)}:${linea} importa '${modulo}'`),
    );
    expect(hallazgos).toEqual([]);
  });
});
