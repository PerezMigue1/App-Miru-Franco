/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import * as citaModel from '@/features/citas/models/citaModel';
import * as presentacionCita from '@/features/citas/viewmodels/presentacionCita';

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
  importaciones,
  importacionesProhibidas,
  leer,
  nombre,
  prohibidoEnModels,
  sinComentarios,
  src,
  usosDeConsola,
  type Importacion,
} from '../../helpers/reglasCodigo';

/**
 * GP-06.3 (Mis citas, detalle, reprogramar y cancelar): reglas de arquitectura y estilo revisadas
 * sobre el código real de src/ (lectura con fs, sin ejecutarlo), con los detectores de
 * test/helpers/reglasCodigo.ts.
 *
 * Regla 1: las vistas y las rutas de Mis citas no importan nada de models/ (ni tipos).
 * Regla 2: los componentes que usan solo importan tipos de models/ (import type).
 * Regla 3: citaModel no importa components, views, viewmodels, react ni react-native.
 * Regla 4: ningún archivo de GP-06.3 escribe colores, usa console ni el guion largo.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);
const vista = (archivo: string) => citas('views', `${archivo}.tsx`);
const viewmodel = (archivo: string) => citas('viewmodels', `${archivo}.ts`);
const componente = (archivo: string) => citas('components', `${archivo}.tsx`);

const RUTAS = [
  src('app', 'mis-citas.tsx'),
  src('app', 'cita', '[id].tsx'),
  src('app', 'cita', '[id]', 'reprogramar.tsx'),
];
const VISTAS = ['MisCitasView', 'DetalleCitaView', 'ReprogramarCitaView'].map(vista);
const VIEWMODELS = [
  'useMisCitasViewModel',
  'useDetalleCitaViewModel',
  'useReprogramarCitaViewModel',
  'presentacionCita',
].map(viewmodel);
const CITA_MODEL = citas('models', 'citaModel.ts');
const PRESENTACION = viewmodel('presentacionCita');
const COMPONENTES = [
  'TarjetaCita',
  'HojaCancelarCita',
  'BadgeEstado',
  'CalendarioMensual',
  'ResumenCita',
  'SelectorHorario',
].map(componente);
const TODOS = [...RUTAS, ...VISTAS, ...VIEWMODELS, CITA_MODEL, ...COMPONENTES];

const MODULO_CITA = '../models/citaModel';
const MODULO_PRESENTACION = '../viewmodels/presentacionCita';

// ── Lectura de importaciones y re-exportaciones por nombre ───────────────────────────────────

interface Piezas {
  valores: string[];
  tipos: string[];
}

/**
 * Nombres entre llaves de los `import` o `export` que vienen de `modulo`, separados en valores y
 * tipos (los de `import type { }` o los marcados con type).
 */
function piezasDe(texto: string, palabra: 'import' | 'export', modulo: string): Piezas {
  const patron = new RegExp(String.raw`\b${palabra}\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'`, 'g');
  const piezas: Piezas = { valores: [], tipos: [] };
  for (const m of sinComentarios(texto).matchAll(patron)) {
    if (m[3] !== modulo) {
      continue;
    }
    for (const pieza of m[2].split(',').map((p) => p.trim()).filter(Boolean)) {
      const esTipo = Boolean(m[1]) || pieza.startsWith('type ');
      (esTipo ? piezas.tipos : piezas.valores).push(pieza.replace(/^type\s+/, ''));
    }
  }
  return piezas;
}

const soloModels = ({ modulo }: Importacion) => deModels(modulo);
const valorDeModels = ({ modulo, soloTipos }: Importacion) => deModels(modulo) && !soloTipos;
const ajenoAModels = ({ modulo }: Importacion) => prohibidoEnModels(modulo);

/** Lo que la regla 4 no permite en el texto de un archivo, como lista de hallazgos. */
function problemasDeEstilo(texto: string): string[] {
  return [
    ...colores(texto).map((color) => `color ${color}`),
    ...usosDeConsola(texto).map((linea) => `console en la línea ${linea}`),
    ...(texto.includes(GUION_LARGO) ? ['guion largo'] : []),
  ];
}

describe('GP-06.3: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });
});

describe.each([
  ['Regla 1: vistas y rutas no importan nada de models/', [...VISTAS, ...RUTAS], soloModels],
  ['Regla 2: los componentes solo importan tipos de models/', COMPONENTES, valorDeModels],
  ['Regla 3: citaModel no depende de la interfaz', [CITA_MODEL], ajenoAModels],
])('%s', (_regla, rutas, prohibida) => {
  it.each(conNombre(rutas))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, prohibida)).toEqual([]);
  });
});

describe('Regla 4: sin colores escritos, sin console y sin guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    expect(problemasDeEstilo(leer(ruta))).toEqual([]);
  });
});

describe('Corrección A: cada vista toma de su viewmodel lo que antes leía de models/', () => {
  it.each([
    ['MisCitasView', 'useMisCitasViewModel', [], ['Cita']],
    [
      'DetalleCitaView',
      'useDetalleCitaViewModel',
      [
        'admiteCambios',
        'avisoAnticipoEnSalon',
        'duracionParaMostrar',
        'estadoAnticipo',
        'etiquetaEstadoAnticipo',
        'etiquetaEstadoCita',
        'limitePagoCorto',
        'motivoCancelacionParaClienta',
      ],
      ['Cita', 'EstadoAnticipoCita'],
    ],
    ['ReprogramarCitaView', 'useReprogramarCitaViewModel', ['fechaLegible', 'horaLegible'], []],
  ])('%s importa de %s, que lo vuelve a exportar', (archivo, vm, valores, tipos) => {
    const importado = piezasDe(leer(vista(archivo)), 'import', `../viewmodels/${vm}`);
    expect(importado.valores).toEqual(expect.arrayContaining(valores));
    expect(importado.tipos).toEqual(expect.arrayContaining(tipos));

    // Lo que viene de servicioModel (duracionParaMostrar) se re-exporta desde ese model.
    const textoVm = leer(viewmodel(vm));
    const reexportado = ['../models/citaModel', '../models/servicioModel'].map((m) =>
      piezasDe(textoVm, 'export', m),
    );
    expect(reexportado.flatMap((p) => p.valores)).toEqual(expect.arrayContaining(valores));
    expect(reexportado.flatMap((p) => p.tipos)).toEqual(expect.arrayContaining(tipos));
  });
});

describe('Corrección B: los componentes toman las funciones de presentación de presentacionCita', () => {
  const COMPONENTES_CON_FUNCIONES = ['CalendarioMensual', 'ResumenCita', 'SelectorHorario', 'TarjetaCita'];
  const reexportadas = piezasDe(leer(PRESENTACION), 'export', MODULO_CITA);

  it('presentacionCita solo importa de citaModel (sin React ni la interfaz)', () => {
    expect(importaciones(leer(PRESENTACION)).map(({ modulo }) => modulo)).toEqual([MODULO_CITA]);
    expect(reexportadas.valores.length).toBeGreaterThan(0);
  });

  it('cada valor que exporta presentacionCita es el mismo de citaModel', () => {
    const modelo = citaModel as Record<string, unknown>;
    const distintos = Object.entries(presentacionCita).filter(([clave, valor]) => modelo[clave] !== valor);
    expect(distintos.map(([clave]) => clave)).toEqual([]);
    expect(Object.keys(presentacionCita).sort()).toEqual([...reexportadas.valores].sort());
  });

  it.each(COMPONENTES_CON_FUNCIONES)('%s importa sus funciones de presentacionCita', (archivo) => {
    const texto = leer(componente(archivo));
    const desdePresentacion = piezasDe(texto, 'import', MODULO_PRESENTACION);
    expect(desdePresentacion.valores.length).toBeGreaterThan(0);
    expect(reexportadas.valores).toEqual(expect.arrayContaining(desdePresentacion.valores));
    expect(piezasDe(texto, 'import', MODULO_CITA).valores).toEqual([]);
  });

  it('BadgeEstado sigue tomando TonoBadge de citaModel solo como tipo', () => {
    expect(piezasDe(leer(componente('BadgeEstado')), 'import', MODULO_CITA)).toEqual({
      valores: [],
      tipos: ['TonoBadge'],
    });
  });
});
