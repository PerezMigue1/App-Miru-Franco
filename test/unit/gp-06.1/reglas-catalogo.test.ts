/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * GP-06.1: reglas de arquitectura y estilo del catálogo y detalle de servicios, revisadas sobre el
 * código real de src/ (lectura con fs, sin ejecutarlo).
 *
 * Regla 1: las vistas y las rutas no importan nada de models/ (ni tipos); lo reciben del viewmodel.
 * Regla 2: los componentes solo importan tipos de models/ (import type), nunca valores.
 * Regla 3: los models no importan components, views, viewmodels, react ni react-native.
 * Regla 4: servicioModel solo habla con el servidor por apiClient y con { publica: true }.
 * Regla 5: ningún archivo de GP-06.1 escribe colores, usa console ni el guion largo.
 */

const RAIZ = path.resolve(__dirname, '../../..');
const src = (...partes: string[]) => path.join(RAIZ, 'src', ...partes);

const VISTAS = [
  src('features', 'citas', 'views', 'CitasView.tsx'),
  src('features', 'citas', 'views', 'DetalleServicioView.tsx'),
  src('app', '(cliente)', 'citas.tsx'),
  src('app', 'servicio', '[id].tsx'),
];
const COMPONENTES = [
  src('features', 'citas', 'components', 'ListaServicios.tsx'),
  src('features', 'citas', 'components', 'TarjetaServicio.tsx'),
  src('features', 'citas', 'components', 'HojaFiltrosServicios.tsx'),
  src('features', 'inicio', 'components', 'GaleriaTrabajo.tsx'),
  src('features', 'inicio', 'components', 'VisorFoto.tsx'),
];
const SERVICIO_MODEL = src('features', 'citas', 'models', 'servicioModel.ts');
const MODELOS = [
  SERVICIO_MODEL,
  src('features', 'inicio', 'models', 'inicioService.ts'),
  src('features', 'inicio', 'models', 'FotoModel.ts'),
];
const VIEWMODELS = [
  src('features', 'citas', 'viewmodels', 'useCatalogoServiciosViewModel.ts'),
  src('features', 'citas', 'viewmodels', 'useDetalleServicioViewModel.ts'),
];
const TODOS = [...VISTAS, ...COMPONENTES, ...MODELOS, ...VIEWMODELS];

const nombre = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join('/');
const leer = (ruta: string) => fs.readFileSync(ruta, 'utf8');
const conNombre = (rutas: string[]) => rutas.map((ruta) => [nombre(ruta), ruta]);

// ── Detectores ───────────────────────────────────────────────────────────────────────────────

/**
 * Quita los comentarios (// y /* *\/) dejando los saltos de línea, sin tocar las cadenas: una URL
 * como 'https://...' no es comentario.
 */
function sinComentarios(texto: string): string {
  const patron = /(['"`])(?:(?!\1)[^\\]|\\[\s\S])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  return texto.replace(patron, (parte) =>
    parte.startsWith('/') ? parte.replace(/[^\n]/g, ' ') : parte,
  );
}

/** Contenido de las cadenas ('...', "..." y `...`) del código, con su línea. */
function cadenas(codigo: string): { linea: number; valor: string }[] {
  return Array.from(codigo.matchAll(/(['"`])((?:(?!\1)[^\\]|\\[\s\S])*)\1/g), (m) => ({
    linea: codigo.slice(0, m.index).split('\n').length,
    valor: m[2],
  }));
}

interface Importacion {
  linea: number;
  modulo: string;
  /** import type { ... }, o todas las piezas entre llaves marcadas con type. */
  soloTipos: boolean;
}

/** import/export ... from, import '...', import('...') y require('...'), con su línea. */
function importaciones(texto: string): Importacion[] {
  const codigo = sinComentarios(texto);
  const lineaDe = (indice = 0) => codigo.slice(0, indice).split('\n').length;
  const conFrom = Array.from(
    codigo.matchAll(/\b(?:import|export)\s+(type\s+)?([\w$*\s,{}]*?)\s*\bfrom\s+['"]([^'"]+)['"]/g),
    (m) => {
      const llaves = /^\{([\s\S]*)\}$/.exec(m[2].trim());
      const piezas = llaves ? llaves[1].split(',').map((p) => p.trim()).filter(Boolean) : [];
      const todasTipo = piezas.length > 0 && piezas.every((p) => p.startsWith('type '));
      return { indice: m.index ?? 0, modulo: m[3], soloTipos: Boolean(m[1]) || todasTipo };
    },
  );
  const sueltas = Array.from(
    codigo.matchAll(/\b(?:import\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g),
    (m) => ({ indice: m.index ?? 0, modulo: m[1], soloTipos: false }),
  );
  return [...conFrom, ...sueltas]
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, modulo, soloTipos }) => ({ linea: lineaDe(indice), modulo, soloTipos }));
}

const deModels = (modulo: string) => /(^|\/)models\//.test(modulo);
const prohibidoEnModels = (modulo: string) =>
  /(^|\/)(components|views|viewmodels)(\/|$)/.test(modulo) || /^react(-native)?(\/|$)/.test(modulo);

const COLOR_EN_CADENA = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})\b|\b(?:rgba?|hsla?)\s*\(|\b(?:white|black|transparent)\b/i;

/** Cadenas con colores escritos a mano (hex, rgb/rgba/hsl o nombres), sin contar comentarios. */
function colores(texto: string): string[] {
  return cadenas(sinComentarios(texto))
    .filter(({ valor }) => COLOR_EN_CADENA.test(valor))
    .map(({ linea, valor }) => `${linea}: '${valor}'`);
}

/** Usos de console en el código (los comentarios no cuentan). */
function usosDeConsola(texto: string): number[] {
  return Array.from(sinComentarios(texto).matchAll(/\bconsole\s*\.\s*(?:log|warn|error|info|debug)\b/g), (m) =>
    texto.slice(0, m.index).split('\n').length,
  );
}

/** Llamadas apiGet/apiPost/... con sus argumentos completos (paréntesis balanceados). */
function llamadasApi(texto: string): string[] {
  const codigo = sinComentarios(texto);
  return Array.from(codigo.matchAll(/\bapi(?:Get|Post|Put|Patch|Delete)\s*(?:<[^>(]*>)?\s*\(/g), (m) => {
    const inicio = (m.index ?? 0) + m[0].length;
    let profundidad = 1;
    let fin = inicio;
    while (fin < codigo.length && profundidad > 0) {
      profundidad += ({ '(': 1, ')': -1 } as Record<string, number>)[codigo[fin]] ?? 0;
      fin++;
    }
    return codigo.slice(inicio, fin - 1);
  });
}

/** Guion largo (U+2014), armado por su código para que este archivo tampoco lo contenga. */
const GUION_LARGO = String.fromCodePoint(0x2014);

describe('detectores de reglas-catalogo', () => {
  it('importaciones distingue import type, piezas con type, valores mezclados y los sueltos', () => {
    const texto = [
      "import type { Servicio } from '../models/servicioModel';",
      'import {',
      '  type Servicio,',
      '  type Especialista,',
      "} from '../models/servicioModel';",
      "import { obtenerServicios, type Servicio } from '../models/servicioModel';",
      "export type { Servicio } from '../models/servicioModel';",
      "import * as modelo from '../models/servicioModel';",
      "// import { obtenerServicio } from '../models/servicioModel';",
      "const m = require('../models/servicioModel');",
      "import '../models/efectos';",
    ].join('\n');
    expect(importaciones(texto)).toEqual([
      { linea: 1, modulo: '../models/servicioModel', soloTipos: true },
      { linea: 2, modulo: '../models/servicioModel', soloTipos: true },
      { linea: 6, modulo: '../models/servicioModel', soloTipos: false },
      { linea: 7, modulo: '../models/servicioModel', soloTipos: true },
      { linea: 8, modulo: '../models/servicioModel', soloTipos: false },
      { linea: 10, modulo: '../models/servicioModel', soloTipos: false },
      { linea: 11, modulo: '../models/efectos', soloTipos: false },
    ]);
  });

  it('deModels y prohibidoEnModels reconocen las rutas que vigilan', () => {
    expect(['../models/a', '@/features/citas/models/servicioModel', './modelos/a'].map(deModels)).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      ['react', 'react-native', '../components/X', '@/features/citas/viewmodels/useX', 'react-native-reanimated', '@/shared/api/apiClient'].map(
        prohibidoEnModels,
      ),
    ).toEqual([true, true, true, true, false, false]);
  });

  it('colores encuentra hex, rgb, hsl y nombres en cadenas, pero no en comentarios ni en props sin cadena', () => {
    // Las muestras se arman por partes: así este archivo tampoco tiene colores escritos.
    const gato = String.fromCodePoint(0x23);
    const rgba = ['rgb', 'a'].join('');
    const muestras = [
      `${gato}fff`,
      `${gato}A1B2C3`,
      `${gato}11223344`,
      `${rgba}(0, 0, 0, 0.5)`,
      ['hs', 'l(10, 20%, 30%)'].join(''),
      ['whi', 'te'].join(''),
      ['Trans', 'parent'].join(''),
    ];
    const texto = [
      `const a = '${muestras[0]}';`,
      `const b = { color: "${muestras[1]}" };`,
      `const c = \`${muestras[2]}\`;`,
      `const d = '${muestras[3]}';`,
      `const e = '${muestras[4]}';`,
      `const f = '${muestras[5]}';`,
      `const g = '${muestras[6]}';`,
      `// color: ${gato}000000 y ${muestras[5]} en un comentario`,
      `/* ${rgba}(1, 2, 3, 1) */`,
      '<Modal transparent visible />',
      "const h = 'https://img.test/a.jpg#seccion';",
      'const i = colores.transparente;',
    ].join('\n');
    expect(colores(texto)).toEqual(muestras.map((muestra, i) => `${i + 1}: '${muestra}'`));
  });

  it('usosDeConsola encuentra console en el código y no en comentarios', () => {
    const texto = ["// console.log('nada')", 'console.warn(x);', 'console . error(x);', 'consola.log(x);'].join('\n');
    expect(usosDeConsola(texto)).toEqual([2, 3]);
  });

  it('llamadasApi devuelve los argumentos completos de cada llamada', () => {
    const texto = [
      "apiGet<unknown>('/api/a', { publica: true });",
      'apiPost(`/api/b/${encodeURIComponent(id)}`, cuerpo);',
      "// apiGet('/api/comentario');",
    ].join('\n');
    expect(llamadasApi(texto)).toEqual(["'/api/a', { publica: true }", '`/api/b/${encodeURIComponent(id)}`, cuerpo']);
  });
});

// ── Reglas sobre src ─────────────────────────────────────────────────────────────────────────

/** Importaciones de un archivo que no cumplen la regla, como "archivo:línea importa 'módulo'". */
function importacionesProhibidas(ruta: string, prohibida: (importacion: Importacion) => boolean): string[] {
  return importaciones(leer(ruta))
    .filter(prohibida)
    .map(({ linea, modulo }) => `${nombre(ruta)}:${linea} importa '${modulo}'`);
}

describe('GP-06.1: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });
});

describe('Regla 1: vistas y rutas no importan nada de models/', () => {
  it.each(conNombre(VISTAS))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => deModels(modulo))).toEqual([]);
  });

  it('corrección GP-06.1: DetalleServicioView toma Servicio y Especialista de su viewmodel', () => {
    const vista = importaciones(leer(VISTAS[1]));
    expect(vista).toContainEqual(
      expect.objectContaining({ modulo: '../viewmodels/useDetalleServicioViewModel', soloTipos: false }),
    );
    expect(vista.filter(({ modulo }) => deModels(modulo))).toEqual([]);
    // El viewmodel vuelve a exportar los tipos del modelo, solo como tipos.
    expect(importaciones(leer(VIEWMODELS[1]))).toContainEqual(
      expect.objectContaining({ modulo: '../models/servicioModel', soloTipos: true }),
    );
  });
});

describe('Regla 2: los componentes solo importan tipos de models/', () => {
  it.each(conNombre(COMPONENTES))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo, soloTipos }) => deModels(modulo) && !soloTipos)).toEqual([]);
  });

  it('la regla tiene algo que revisar: TarjetaServicio y GaleriaTrabajo sí importan tipos de models/', () => {
    for (const ruta of [COMPONENTES[1], COMPONENTES[3]]) {
      expect(importaciones(leer(ruta)).filter(({ modulo }) => deModels(modulo)).length).toBeGreaterThan(0);
    }
  });
});

describe('Regla 3: los models no dependen de la interfaz', () => {
  it.each(conNombre(MODELOS))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => prohibidoEnModels(modulo))).toEqual([]);
  });
});

describe('Regla 4: servicioModel lee el catálogo por apiClient y como pública', () => {
  const texto = leer(SERVICIO_MODEL);

  it('importa de apiClient y no usa fetch ni XMLHttpRequest', () => {
    expect(importaciones(texto).map(({ modulo }) => modulo)).toContain('@/shared/api/apiClient');
    expect(sinComentarios(texto)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest/);
  });

  it('cada llamada lleva { publica: true }', () => {
    const llamadas = llamadasApi(texto);
    expect(llamadas).toHaveLength(2);
    expect(llamadas.filter((args) => !/\{\s*publica:\s*true\s*\}/.test(args))).toEqual([]);
  });
});

describe('Regla 5: sin colores escritos, sin console y sin guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });
});
