/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
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
 * GP-07.4: reglas de arquitectura y estilo de la base compartida de citas y forma de pago,
 * revisadas sobre el código real con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Regla 1: los archivos nuevos de shared no importan nada de src/features.
 * Regla 2: los models no dependen de la interfaz; el componente no importa models ni shared/api.
 * Regla 3: ningún archivo nuevo o cambiado escribe colores, usa console, el guion largo ni toISOString.
 * Regla 4: documentos y consentimientos hablan con el servidor solo por apiClient; los documentos son
 * públicos y los consentimientos van con sesión.
 * Regla 5: la ruta del visor está registrada en la pila, fuera de las pantallas con sesión.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);

const DOCUMENTOS = src('shared', 'api', 'documentosLegales.ts');
const CONSENTIMIENTOS = src('shared', 'api', 'consentimientos.ts');
const SHARED_NUEVOS = [
  DOCUMENTOS,
  CONSENTIMIENTOS,
  src('shared', 'api', 'useDocumentoLegal.ts'),
  src('shared', 'ui', 'Casilla.tsx'),
  src('shared', 'ui', 'VisorDocumentoLegal.tsx'),
];
const SHARED_CAMBIADOS = [src('shared', 'api', 'configuracionPublica.ts'), src('shared', 'api', 'textosSitio.ts')];
const MODELS = [citas('models', 'formaPagoModel.ts'), citas('models', 'reglasCitaModel.ts'), citas('models', 'citaModel.ts')];
const COMPONENTE = citas('components', 'CasillaPoliticaAnticipos.tsx');
const VIEWMODEL = citas('viewmodels', 'useCasillaPoliticaAnticipos.ts');
const LAYOUT = src('app', '_layout.tsx');
const RUTA = src('app', 'legal', '[slug].tsx');
const TODOS = [...SHARED_NUEVOS, ...SHARED_CAMBIADOS, ...MODELS, COMPONENTE, VIEWMODEL, RUTA, LAYOUT];

const deFeatures = ({ modulo }: { modulo: string }) => /(^|\/)features(\/|$)/.test(modulo);

describe('GP-07.4: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });
});

describe('Regla 1: shared no importa de features', () => {
  it.each(conNombre([...SHARED_NUEVOS, ...SHARED_CAMBIADOS]))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, deFeatures)).toEqual([]);
  });
});

describe('Regla 2: capas', () => {
  it.each(conNombre(MODELS))('%s no depende de la interfaz', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => prohibidoEnModels(modulo))).toEqual([]);
  });

  it('el componente toma todo de su viewmodel: no importa models ni shared/api', () => {
    expect(
      importacionesProhibidas(COMPONENTE, ({ modulo }) => deModels(modulo) || modulo.includes('shared/api')),
    ).toEqual([]);
  });

  it('el viewmodel vuelve a exportar el tipo ReglasCita solo como tipo', () => {
    expect(sinComentarios(leer(VIEWMODEL))).toMatch(/export\s+type\s*\{\s*ReglasCita\s*\}\s*from\s*'\.\.\/models\/formaPagoModel'/);
  });
});

describe('Regla 3: sin colores escritos, sin console, sin guion largo ni toISOString', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });

  it.each(conNombre([...SHARED_NUEVOS, MODELS[0], MODELS[1], COMPONENTE, VIEWMODEL, RUTA]))(
    '%s no usa toISOString',
    (_nombre, ruta) => {
      expect(sinComentarios(leer(ruta))).not.toMatch(/\btoISOString\s*\(/);
    },
  );
});

describe('Regla 4: solo por apiClient', () => {
  it.each(conNombre([DOCUMENTOS, CONSENTIMIENTOS]))('%s no usa fetch', (_nombre, ruta) => {
    expect(sinComentarios(leer(ruta))).not.toMatch(/\bfetch\s*\(|XMLHttpRequest/);
  });

  it('los documentos se piden sin sesión ({ publica: true })', () => {
    const llamadas = llamadasApi(leer(DOCUMENTOS));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatch(/publica:\s*true/);
  });

  it('los consentimientos van con la sesión de la clienta', () => {
    const llamadas = llamadasApi(leer(CONSENTIMIENTOS));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).not.toMatch(/publica/);
  });
});

describe('Regla 5: ruta del visor', () => {
  it('está en la pila antes de las pantallas protegidas', () => {
    const layout = sinComentarios(leer(LAYOUT));
    const visor = layout.indexOf('<Stack.Screen name="legal/[slug]" />');

    expect(visor).toBeGreaterThan(-1);
    expect(visor).toBeLessThan(layout.indexOf('<Stack.Protected'));
  });
});
