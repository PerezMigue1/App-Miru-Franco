/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
  importaciones,
  importacionesProhibidas,
  leer,
  llamadasApi,
  nombre,
  prohibidoEnModels,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

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
