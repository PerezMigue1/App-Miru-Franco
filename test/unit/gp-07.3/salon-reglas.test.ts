/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

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
 * GP-07.3: reglas de arquitectura y estilo de la pantalla El salón y de las piezas nuevas de Inicio,
 * revisadas sobre el código real con los detectores de test/helpers/reglasCodigo.ts (lectura con fs,
 * sin ejecutarlo).
 *
 * Regla 1: sin colores escritos, sin console y sin el guion largo.
 * Regla 2: vistas, componentes y viewmodels no hacen peticiones: no importan apiClient ni llaman
 * apiGet/apiPost/...; vistas y componentes tampoco importan de src/shared/api (los textos y la
 * configuración les llegan del viewmodel).
 * Regla 3: lo tocable declara su rol y su etiqueta para el lector de pantalla.
 * Regla 4: los textos del sitio que piden los viewmodels existen en el respaldo de la app.
 * Regla 5: la ruta pública solo vuelve a exportar la vista; el hero ya no escribe la frase a mano.
 */

const SALON = (...partes: string[]) => src('features', 'salon', ...partes);
const INICIO = (...partes: string[]) => src('features', 'inicio', ...partes);

const VISTAS = [SALON('views', 'SalonView.tsx'), INICIO('views', 'InicioView.tsx')];
const COMPONENTES = [
  SALON('components', 'PiezasSalon.tsx'),
  SALON('components', 'medidasSalon.ts'),
  INICIO('components', 'SeccionesContenido.tsx'),
  INICIO('components', 'medidasInicio.ts'),
  INICIO('components', 'GaleriaTrabajo.tsx'),
  INICIO('components', 'VisorFoto.tsx'),
  INICIO('components', 'HeroFluidos.tsx'),
  INICIO('components', 'SeccionCarrusel.tsx'),
];
const VIEWMODELS = [
  SALON('viewmodels', 'useSalonViewModel.ts'),
  INICIO('viewmodels', 'usePantallaInicio.ts'),
  INICIO('viewmodels', 'useContenidoInicio.ts'),
  INICIO('viewmodels', 'useInicioViewModel.ts'),
];
const MODELOS = [SALON('models', 'salonModel.ts'), INICIO('models', 'contenidoInicioModel.ts'), INICIO('models', 'FotoModel.ts')];
const RUTA = src('app', 'salon.tsx');
const TODOS = [...VISTAS, ...COMPONENTES, ...VIEWMODELS, ...MODELOS, RUTA];

const esApiClient = ({ modulo }: { modulo: string }) => /(^|\/)apiClient$/.test(modulo);
const deSharedApi = ({ modulo }: { modulo: string }) => modulo.includes('shared/api');

/** Etiquetas de apertura de Pressable con sus props (hasta el ">" que cierra la etiqueta). */
function pressables(codigo: string): string[] {
  return Array.from(codigo.matchAll(/<Pressable\b([\s\S]*?)\n\s*>/g), (m) => m[1]);
}

describe('reglas de El salón y de las piezas nuevas de Inicio', () => {
  it('existen todos los archivos que se revisan', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta))).toEqual([]);
  });

  it.each(conNombre(TODOS))('%s no escribe colores, no usa console ni el guion largo', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });

  it.each(conNombre([...VISTAS, ...COMPONENTES, ...VIEWMODELS]))(
    '%s no hace peticiones: no importa apiClient ni llama a la API',
    (_nombre, ruta) => {
      expect(importacionesProhibidas(ruta, esApiClient)).toEqual([]);
      expect(llamadasApi(leer(ruta))).toEqual([]);
      expect(sinComentarios(leer(ruta))).not.toMatch(/\bfetch\s*\(/);
    },
  );

  it.each(conNombre([...VISTAS, ...COMPONENTES]))('%s no importa de src/shared/api', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, deSharedApi)).toEqual([]);
  });

  it.each(conNombre([SALON('components', 'PiezasSalon.tsx'), INICIO('components', 'SeccionesContenido.tsx')]))(
    '%s: cada Pressable declara accessibilityRole y accessibilityLabel',
    (_nombre, ruta) => {
      const etiquetas = pressables(sinComentarios(leer(ruta)));
      expect(etiquetas.length).toBeGreaterThan(0);
      expect(etiquetas.filter((props) => !/accessibilityRole=/.test(props) || !/accessibilityLabel=/.test(props))).toEqual(
        [],
      );
    },
  );

  it.each(conNombre(VIEWMODELS))('%s solo pide textos que existen en RESPALDO_TEXTOS', (_nombre, ruta) => {
    const claves = Array.from(sinComentarios(leer(ruta)).matchAll(/\btexto\(\s*'([^']+)'/g), (m) => m[1]);
    expect(claves.filter((clave) => !Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, clave))).toEqual([]);
  });

  it('src/app/salon.tsx solo vuelve a exportar la vista', () => {
    expect(leer(RUTA).trim()).toBe("export { default } from '@/features/salon/views/SalonView';");
  });

  it('el hero no escribe la frase grande, el nombre del salón ni el botón del Goji a mano', () => {
    const codigo = sinComentarios(leer(INICIO('components', 'HeroFluidos.tsx')));
    expect(codigo).not.toMatch(/>\s*(?:Brillo|que se|nota)\s*</);
    expect(codigo).not.toContain('Mirú Franco Beauty Salón');
    expect(codigo).not.toContain('Ver Fluido Di Goji');
  });

  it('Inicio ya no arma la galería con los servicios', () => {
    const viewmodel = sinComentarios(leer(INICIO('viewmodels', 'useInicioViewModel.ts')));
    expect(viewmodel).not.toMatch(/fotosDeServicios|setFotos/);
    expect(sinComentarios(leer(INICIO('models', 'FotoModel.ts')))).not.toContain('fotosDeServicios');
  });
});
