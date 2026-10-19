/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * GP-02: reglas de arquitectura MVVM por feature. Revisa el sistema de archivos real de src/ para
 * que la estructura no se degrade: features en su carpeta, capas separadas, llamadas a la API solo
 * desde src/shared/api y sin restos del proyecto de ejemplo de Expo.
 */

const RAIZ = path.resolve(__dirname, '../../..');
const SRC = path.join(RAIZ, 'src');
const FEATURES = path.join(SRC, 'features');

const FEATURES_ESPERADAS = ['auth', 'citas', 'inicio', 'notificaciones', 'tienda'];
const CAPAS = ['components', 'models', 'viewmodels', 'views'];
const ARCHIVO_MARCADOR = '.gitkeep';

function existe(ruta: string): boolean {
  return fs.existsSync(ruta);
}

function esCarpeta(ruta: string): boolean {
  return existe(ruta) && fs.statSync(ruta).isDirectory();
}

/** Ruta relativa a la raíz con diagonales normales, para mensajes legibles en cualquier sistema. */
function relativa(ruta: string): string {
  return path.relative(RAIZ, ruta).split(path.sep).join('/');
}

/** Lista todos los archivos bajo una carpeta, recorriendo subcarpetas. */
function archivosBajo(carpeta: string): string[] {
  if (!esCarpeta(carpeta)) return [];
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosBajo(ruta) : [ruta];
  });
}

/** Archivos de código (.ts o .tsx), sin el marcador .gitkeep. */
function codigoBajo(carpeta: string): string[] {
  return archivosBajo(carpeta).filter((ruta) => /\.tsx?$/.test(ruta));
}

/** Módulos que importa un archivo (import ... from, import '...', export ... from). */
function importsDe(ruta: string): string[] {
  const contenido = fs.readFileSync(ruta, 'utf8');
  const patrones = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g];
  return patrones.flatMap((patron) => Array.from(contenido.matchAll(patron), (m) => m[1]));
}

function featuresActuales(): string[] {
  return fs
    .readdirSync(FEATURES, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

function carpetasDeCapa(capa: string): string[] {
  return FEATURES_ESPERADAS.map((feature) => path.join(FEATURES, feature, capa));
}

describe('features en src/features', () => {
  it('contiene exactamente las features auth, citas, inicio, notificaciones y tienda', () => {
    expect(featuresActuales()).toEqual(FEATURES_ESPERADAS);
  });

  it('no hay archivos sueltos en src/features fuera de una feature', () => {
    const sueltos = fs
      .readdirSync(FEATURES, { withFileTypes: true })
      .filter((entrada) => !entrada.isDirectory())
      .map((entrada) => `src/features/${entrada.name}`);
    expect(sueltos).toEqual([]);
  });

  it.each(FEATURES_ESPERADAS)('%s tiene las carpetas components, models, viewmodels y views', (feature) => {
    const faltantes = CAPAS.filter((capa) => !esCarpeta(path.join(FEATURES, feature, capa)));
    expect(faltantes).toEqual([]);
  });

  it.each(FEATURES_ESPERADAS)('%s solo contiene las carpetas de sus capas, sin archivos ni carpetas extra', (feature) => {
    const extra = fs
      .readdirSync(path.join(FEATURES, feature), { withFileTypes: true })
      .filter((entrada) => !(entrada.isDirectory() && CAPAS.includes(entrada.name)))
      .map((entrada) => `src/features/${feature}/${entrada.name}`);
    expect(extra).toEqual([]);
  });

  it.each(FEATURES_ESPERADAS)('%s tiene al menos una vista .tsx en views/', (feature) => {
    const vistas = codigoBajo(path.join(FEATURES, feature, 'views')).filter((ruta) =>
      ruta.endsWith('.tsx'),
    );
    expect(vistas.length).toBeGreaterThan(0);
  });

  it('las capas no tienen subcarpetas anidadas', () => {
    const anidadas = FEATURES_ESPERADAS.flatMap((feature) =>
      CAPAS.flatMap((capa) => {
        const carpeta = path.join(FEATURES, feature, capa);
        return fs
          .readdirSync(carpeta, { withFileTypes: true })
          .filter((entrada) => entrada.isDirectory())
          .map((entrada) => relativa(path.join(carpeta, entrada.name)));
      }),
    );
    expect(anidadas).toEqual([]);
  });

  it('las capas solo guardan archivos .ts, .tsx o el marcador .gitkeep', () => {
    const ajenos = FEATURES_ESPERADAS.flatMap((feature) =>
      archivosBajo(path.join(FEATURES, feature)),
    )
      .filter((ruta) => !/\.tsx?$/.test(ruta) && path.basename(ruta) !== ARCHIVO_MARCADOR)
      .map(relativa);
    expect(ajenos).toEqual([]);
  });
});

describe('separación entre capas', () => {
  it('las vistas en views/ son archivos .tsx', () => {
    const noTsx = carpetasDeCapa('views')
      .flatMap(codigoBajo)
      .filter((ruta) => !ruta.endsWith('.tsx'))
      .map(relativa);
    expect(noTsx).toEqual([]);
  });

  it('los modelos en models/ son .ts y no pintan nada (sin .tsx)', () => {
    const tsx = carpetasDeCapa('models')
      .flatMap(codigoBajo)
      .filter((ruta) => ruta.endsWith('.tsx'))
      .map(relativa);
    expect(tsx).toEqual([]);
  });

  it('los modelos no importan react ni react-native', () => {
    const violaciones = carpetasDeCapa('models')
      .flatMap(codigoBajo)
      .flatMap((ruta) =>
        importsDe(ruta)
          .filter((modulo) => modulo === 'react' || modulo === 'react-native')
          .map((modulo) => `${relativa(ruta)} importa ${modulo}`),
      );
    expect(violaciones).toEqual([]);
  });

  it('los modelos no importan de viewmodels/ ni de views/', () => {
    const violaciones = carpetasDeCapa('models')
      .flatMap(codigoBajo)
      .flatMap((ruta) =>
        importsDe(ruta)
          .filter((modulo) => /(^|\/)(viewmodels|views)\//.test(modulo))
          .map((modulo) => `${relativa(ruta)} importa ${modulo}`),
      );
    expect(violaciones).toEqual([]);
  });

  it('las vistas y los componentes no llaman a la API: no importan de src/shared/api', () => {
    const violaciones = [...carpetasDeCapa('views'), ...carpetasDeCapa('components')]
      .flatMap(codigoBajo)
      .flatMap((ruta) =>
        importsDe(ruta)
          .filter((modulo) => modulo.includes('shared/api'))
          .map((modulo) => `${relativa(ruta)} importa ${modulo}`),
      );
    expect(violaciones).toEqual([]);
  });

  it('fetch solo se usa dentro de src/shared/api', () => {
    const carpetaApi = path.join(SRC, 'shared', 'api') + path.sep;
    const violaciones = codigoBajo(SRC)
      .filter((ruta) => !ruta.startsWith(carpetaApi))
      .filter((ruta) => /\bfetch\s*\(/.test(fs.readFileSync(ruta, 'utf8')))
      .map(relativa);
    expect(violaciones).toEqual([]);
  });
});

describe('carpetas compartidas', () => {
  it('existen src/shared/api y src/shared/ui', () => {
    expect(esCarpeta(path.join(SRC, 'shared', 'api'))).toBe(true);
    expect(esCarpeta(path.join(SRC, 'shared', 'ui'))).toBe(true);
  });

  it('src/shared/api tiene apiClient.ts y tokenStorage.ts', () => {
    const faltantes = ['apiClient.ts', 'tokenStorage.ts'].filter(
      (archivo) => !existe(path.join(SRC, 'shared', 'api', archivo)),
    );
    expect(faltantes).toEqual([]);
  });

  it('src/shared/ui tiene tokens.ts, colores.ts y useTheme.ts', () => {
    const faltantes = ['tokens.ts', 'colores.ts', 'useTheme.ts'].filter(
      (archivo) => !existe(path.join(SRC, 'shared', 'ui', archivo)),
    );
    expect(faltantes).toEqual([]);
  });

  it('no existe ninguna carpeta services/ en src (las llamadas viven en models/)', () => {
    const carpetasServices: string[] = [];
    const recorrer = (carpeta: string): void => {
      for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
        if (!entrada.isDirectory()) continue;
        const ruta = path.join(carpeta, entrada.name);
        if (entrada.name === 'services') carpetasServices.push(relativa(ruta));
        recorrer(ruta);
      }
    };
    recorrer(SRC);
    expect(carpetasServices).toEqual([]);
  });

  it('src solo contiene app, features y shared', () => {
    const entradas = fs.readdirSync(SRC).sort();
    expect(entradas).toEqual(['app', 'features', 'shared']);
  });
});

describe('sin restos del proyecto de ejemplo de Expo', () => {
  const RESTOS = [
    'scripts/reset-project.js',
    'app-example',
    'app',
    'components',
    'constants',
    'hooks',
    'src/components',
    'src/constants',
    'src/hooks',
    'src/app/explore.tsx',
    'src/app/(tabs)',
  ];

  it('no existe ninguno de los archivos o carpetas del scaffold', () => {
    const presentes = RESTOS.filter((resto) => existe(path.join(RAIZ, resto)));
    expect(presentes).toEqual([]);
  });
});
