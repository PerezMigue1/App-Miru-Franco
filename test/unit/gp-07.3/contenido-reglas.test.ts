/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import {
  colores,
  conNombre,
  GUION_LARGO,
  importacionesProhibidas,
  leer,
  llamadasApi,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-07.3: reglas de arquitectura y estilo de la feature salon, revisadas sobre el código real con
 * los detectores de test/helpers/reglasCodigo.ts (lectura con fs, sin ejecutarlo). Se recorren todos
 * los archivos de src/features/salon, también los que se agreguen después.
 *
 * Regla 1: los models solo piden con apiGet y { publica: true } (el contenido es público).
 * Regla 2: los viewmodels no hacen peticiones: no importan apiClient ni llaman apiGet/apiPost/...
 * Regla 3: ningún archivo escribe colores, usa console ni el guion largo.
 */

const SALON = src('features', 'salon');

/** Archivos .ts y .tsx bajo una carpeta, recorriendo subcarpetas. */
function codigoBajo(carpeta: string): string[] {
  if (!fs.existsSync(carpeta)) {
    return [];
  }
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return codigoBajo(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const MODELS = codigoBajo(path.join(SALON, 'models'));
const VIEWMODELS = codigoBajo(path.join(SALON, 'viewmodels'));
const TODOS = codigoBajo(SALON);

const esApiClient = ({ modulo }: { modulo: string }) => /(^|\/)apiClient$/.test(modulo);

describe('reglas de la feature salon', () => {
  it('existen el model del contenido y el viewmodel de las listas', () => {
    expect(MODELS.map((ruta) => path.basename(ruta))).toContain('contenidoSalonModel.ts');
    expect(VIEWMODELS.map((ruta) => path.basename(ruta))).toContain('useListaContenido.ts');
  });

  it.each(conNombre(MODELS))('%s solo pide con apiGet y { publica: true }', (_nombre, ruta) => {
    const codigo = sinComentarios(leer(ruta));
    expect(codigo.match(/\bapi(?:Post|Put|Patch|Delete)\b/g)).toBeNull();
    expect(codigo).not.toMatch(/\bfetch\s*\(/);
    expect(llamadasApi(codigo).filter((argumentos) => !/,\s*\{\s*publica:\s*true\s*\}$/.test(argumentos))).toEqual([]);
  });

  it.each(conNombre(VIEWMODELS))('%s no hace peticiones: no importa apiClient ni llama a la API', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, esApiClient)).toEqual([]);
    expect(llamadasApi(leer(ruta))).toEqual([]);
  });

  it.each(conNombre(TODOS))('%s no escribe colores, no usa console ni el guion largo', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });
});
