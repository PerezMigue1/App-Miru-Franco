/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  colores,
  conNombre,
  GUION_LARGO,
  importaciones,
  importacionesProhibidas,
  leer,
  llamadasApi,
  nombre,
  piezasDe,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-07.3 (días sin citas y especialistas visibles): reglas de arquitectura y estilo de lo que se
 * agregó o cambió, revisadas sobre el código real con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Regla 1: ningún archivo escribe colores, usa console ni el guion largo.
 * Regla 2: los viewmodels no llaman a la API (sin apiGet ni las demás de apiClient; ApiError solo
 *   para leer el status): la configuración llega por useConfiguracionPublica y los textos por useTextos.
 * Regla 3: las vistas y el calendario no importan de src/shared/api ni valores de models/; el
 *   calendario toma de useCalendarioCitas solo el tipo de los bloqueos.
 * Regla 4: citaModel solo toma tipos de la configuración pública (no lee el repositorio).
 * Regla 5: los textos de los días sin citas salen del catálogo, no de textos fijos en las vistas.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);

const CITA_MODEL = citas('models', 'citaModel.ts');
const SERVICIO_MODEL = citas('models', 'servicioModel.ts');
const HOOK_CALENDARIO = citas('viewmodels', 'useCalendarioCitas.ts');
const VIEWMODELS = [HOOK_CALENDARIO, citas('viewmodels', 'useReservarCitaViewModel.ts'), citas('viewmodels', 'useReprogramarCitaViewModel.ts')];
const CALENDARIO = citas('components', 'CalendarioMensual.tsx');
const VISTAS = [citas('views', 'ReservarCitaView.tsx'), citas('views', 'ReprogramarCitaView.tsx')];
const TODOS = [CITA_MODEL, SERVICIO_MODEL, ...VIEWMODELS, CALENDARIO, ...VISTAS];

const CLAVES_CALENDARIO = [
  'citas.calendario.cerrado',
  'citas.calendario.inhabil',
  'citas.calendario.inhabilSinMotivo',
  'citas.calendario.leyenda',
];

describe('GP-07.3 calendario: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });
});

describe('Regla 1: sin colores escritos, sin console y sin guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });
});

describe('Regla 2: los viewmodels no llaman a la API', () => {
  it.each(conNombre(VIEWMODELS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(llamadasApi(texto)).toEqual([]);
    expect(sinComentarios(texto)).not.toMatch(/\bfetch\s*\(/);
    const deApiClient = piezasDe(texto, 'import', '@/shared/api/apiClient').valores;
    expect(deApiClient.filter((pieza) => /^api[A-Z]/.test(pieza))).toEqual([]);
  });

  it('useCalendarioCitas toma la configuración de useConfiguracionPublica y los textos de useTextos', () => {
    const modulos = importaciones(leer(HOOK_CALENDARIO)).map(({ modulo }) => modulo);
    expect(modulos).toEqual(expect.arrayContaining(['@/shared/api/useConfiguracionPublica', '@/shared/api/useTextos']));
  });
});

describe('Regla 3: vistas y calendario sin src/shared/api ni valores de models/', () => {
  it.each(conNombre([CALENDARIO, ...VISTAS]))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => modulo.includes('shared/api'))).toEqual([]);
    expect(importacionesProhibidas(ruta, ({ modulo, soloTipos }) => /(^|\/)models\//.test(modulo) && !soloTipos)).toEqual([]);
  });

  it('el calendario toma de useCalendarioCitas solo el tipo BloqueosCalendario', () => {
    const delHook = importaciones(leer(CALENDARIO)).filter(({ modulo }) => modulo.endsWith('useCalendarioCitas'));
    expect(delHook).toEqual([expect.objectContaining({ soloTipos: true })]);
  });
});

describe('Regla 4: citaModel solo toma tipos de la configuración pública', () => {
  it('importa configuracionPublica con import type y nada de useConfiguracionPublica', () => {
    const deConfiguracion = importaciones(leer(CITA_MODEL)).filter(({ modulo }) => /configuracionPublica/i.test(modulo));
    expect(deConfiguracion).toEqual([
      { linea: expect.any(Number), modulo: '@/shared/api/configuracionPublica', soloTipos: true },
    ]);
  });
});

describe('Regla 5: los textos de los días sin citas salen del catálogo', () => {
  it('las cuatro claves existen en el catálogo y useCalendarioCitas las usa', () => {
    const catalogo = RESPALDO_TEXTOS as Record<string, string>;
    expect(CLAVES_CALENDARIO.filter((clave) => !catalogo[clave])).toEqual([]);
    const texto = sinComentarios(leer(HOOK_CALENDARIO));
    expect(CLAVES_CALENDARIO.filter((clave) => !texto.includes(`'${clave}'`))).toEqual([]);
  });

  it.each(conNombre(VISTAS))('%s ya no trae el texto fijo del día cerrado', (_nombre, ruta) => {
    expect(sinComentarios(leer(ruta))).not.toMatch(/El salón no abre este día/);
  });
});
