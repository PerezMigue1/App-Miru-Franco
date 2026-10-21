/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import {
  colores,
  conNombre,
  GUION_LARGO,
  importacionesProhibidas,
  leer,
  llamadasApi,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-07.1: reglas de arquitectura y estilo de los archivos nuevos de src/shared/api, revisadas sobre
 * el código real con los detectores de test/helpers/reglasCodigo.ts (lectura con fs, sin ejecutarlo).
 *
 * Regla 1: shared no importa nada de src/features (ni con ruta relativa ni con '@/features').
 * Regla 2: sin colores escritos, sin console y sin el guion largo.
 * Regla 3: la única petición es pública (lleva { publica: true }) y pasa por apiClient.
 */

const REPOSITORIO = src('shared', 'api', 'configuracionPublica.ts');
const HOOK = src('shared', 'api', 'useConfiguracionPublica.ts');
const ARCHIVOS = [REPOSITORIO, HOOK];

const deFeatures = ({ modulo }: { modulo: string }) => /(^|\/)features(\/|$)/.test(modulo) || modulo.startsWith('@/features');

describe('reglas de los archivos de la configuración pública', () => {
  it('los dos archivos existen', () => {
    expect(ARCHIVOS.filter((ruta) => !fs.existsSync(ruta))).toEqual([]);
  });

  it.each(conNombre(ARCHIVOS))('%s no importa nada de src/features', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, deFeatures)).toEqual([]);
  });

  it.each(conNombre(ARCHIVOS))('%s no escribe colores, no usa console ni el guion largo', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });

  it('el repositorio hace una sola petición, pública, con apiGet de apiClient', () => {
    const texto = leer(REPOSITORIO);
    expect(llamadasApi(texto)).toEqual(['RUTA, { publica: true }']);
    expect(texto).toMatch(/from '\.\/apiClient'/);
    expect(texto).not.toMatch(/\bfetch\s*\(/);
  });
});
