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
 * GP-07.3: reglas de arquitectura y estilo del catálogo de textos (src/shared/api/textosSitio.ts y
 * useTextos.ts), revisadas sobre el código real con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Regla 1: shared no importa nada de src/features.
 * Regla 2: sin colores escritos, sin console y sin el guion largo.
 * Regla 3: el catálogo no hace peticiones: lee la configuración pública que ya está en memoria.
 */

const CATALOGO = src('shared', 'api', 'textosSitio.ts');
const HOOK = src('shared', 'api', 'useTextos.ts');
const ARCHIVOS = [CATALOGO, HOOK];

const deFeatures = ({ modulo }: { modulo: string }) => /(^|\/)features(\/|$)/.test(modulo) || modulo.startsWith('@/features');

describe('reglas de los archivos del catálogo de textos', () => {
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

  it.each(conNombre(ARCHIVOS))('%s no hace peticiones ni importa apiClient', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(llamadasApi(texto)).toEqual([]);
    expect(texto).not.toMatch(/\bfetch\s*\(/);
    expect(importacionesProhibidas(ruta, ({ modulo }) => modulo.endsWith('apiClient'))).toEqual([]);
  });
});
