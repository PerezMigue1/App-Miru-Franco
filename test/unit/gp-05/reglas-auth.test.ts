/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * GP-05: reglas de arquitectura de la feature auth revisadas sobre el código real de src/.
 *
 * Regla 1 (Repository): useAuth.tsx no hace peticiones HTTP por su cuenta. No importa apiGet,
 * apiPost, apiPatch, apiPut ni apiDelete de apiClient y no escribe la ruta '/api/auth/me' en una
 * cadena; la consulta del perfil con un token recién emitido vive en authService.ts
 * (obtenerPerfilConToken).
 *
 * Regla 2: AuthContainer.tsx y las vistas de acceso (LoginView, RegistroView, ActivarView y
 * RecuperarView) no importan nada de models/, ni valores ni tipos: lo reciben de su viewmodel.
 */

const RAIZ = path.resolve(__dirname, '../../..');
const AUTH = path.join(RAIZ, 'src', 'features', 'auth');
const ARCHIVO_USE_AUTH = path.join(AUTH, 'viewmodels', 'useAuth.tsx');
const ARCHIVO_AUTH_SERVICE = path.join(AUTH, 'models', 'authService.ts');

const FUNCIONES_HTTP = ['apiGet', 'apiPost', 'apiPatch', 'apiPut', 'apiDelete'];

const ARCHIVOS_SIN_MODELOS = [
  path.join(AUTH, 'components', 'AuthContainer.tsx'),
  path.join(AUTH, 'views', 'LoginView.tsx'),
  path.join(AUTH, 'views', 'RegistroView.tsx'),
  path.join(AUTH, 'views', 'ActivarView.tsx'),
  path.join(AUTH, 'views', 'RecuperarView.tsx'),
];

/** Ruta relativa a la raíz con diagonales normales, para mensajes legibles en cualquier sistema. */
function relativa(ruta: string): string {
  return path.relative(RAIZ, ruta).split(path.sep).join('/');
}

function leer(ruta: string): string {
  return fs.readFileSync(ruta, 'utf8');
}

/** Número de línea (desde 1) de una posición dentro del texto. */
function lineaDe(texto: string, indice: number): number {
  return texto.slice(0, indice).split('\n').length;
}

/**
 * Módulos que pide un archivo, con su línea: import ... from (también import type y los de varias
 * líneas), import '...', export ... from, import('...') y require('...').
 */
function importsDe(texto: string): { linea: number; modulo: string }[] {
  const patrones = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patrones
    .flatMap((patron) =>
      Array.from(texto.matchAll(patron), (m) => ({ indice: m.index ?? 0, modulo: m[1] })),
    )
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, modulo }) => ({ linea: lineaDe(texto, indice), modulo }));
}

/**
 * Nombres que un archivo trae de los módulos que cumplen `esModulo`: import { a, type B, c as d }
 * (en una o varias líneas, con o sin import type), export { ... } from, import X y import * as X.
 * Para los alias se devuelve el nombre original (el de la izquierda de "as").
 */
function nombresImportados(texto: string, esModulo: (modulo: string) => boolean): string[] {
  const patron =
    /\b(?:import|export)\s+(?:type\s+)?([\w$*\s,{}]*?)\s*\bfrom\s+['"]([^'"]+)['"]/g;
  return Array.from(texto.matchAll(patron)).flatMap((m) => {
    if (!esModulo(m[2])) {
      return [];
    }
    const clausula = m[1];
    const llaves = clausula.match(/\{([\s\S]*)\}/);
    const nombres = llaves
      ? llaves[1]
          .split(',')
          .map((parte) => parte.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
      : [];
    // Lo que va antes de las llaves: import X o import * as X.
    const resto = clausula.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
    if (resto) {
      nombres.push(resto.startsWith('*') ? '*' : resto);
    }
    return nombres;
  });
}

/** true si el módulo es src/shared/api/apiClient (por alias o por ruta relativa). */
function esApiClient(modulo: string): boolean {
  return /(^|\/)apiClient$/.test(modulo);
}

/** Cadenas ('...', "..." o `...`) que contienen la ruta indicada; ignora los comentarios. */
function cadenasConRuta(texto: string, ruta: string): string[] {
  const patron = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
  return Array.from(texto.matchAll(patron), (m) => m[2]).filter((cadena) => cadena.includes(ruta));
}

// ---------------------------------------------------------------------------------------------
// Detectores
// ---------------------------------------------------------------------------------------------

describe('detectores de reglas-auth', () => {
  it('nombresImportados lee import, import type, varias líneas, alias, export from y import *', () => {
    const texto = [
      "import { apiGet } from '@/shared/api/apiClient';",
      'import {',
      '  ApiError,',
      '  apiPost as enviar,',
      '  type OpcionesSolicitud,',
      "} from '../../shared/api/apiClient';",
      "import type { ApiError as E } from '@/shared/api/apiClient';",
      "export { apiPatch } from '@/shared/api/apiClient';",
      "import * as cliente from '@/shared/api/apiClient';",
      "import { otra } from '@/shared/api/tokenStorage';",
    ].join('\n');
    expect(nombresImportados(texto, esApiClient)).toEqual([
      'apiGet',
      'ApiError',
      'apiPost',
      'OpcionesSolicitud',
      'ApiError',
      'apiPatch',
      '*',
    ]);
  });

  it('importsDe encuentra import type de varias líneas hacia models/ (en la línea del from)', () => {
    const texto = [
      'import type {',
      '  PreguntaSeguridad,',
      '  RequisitoClave,',
      "} from '../models/AuthModel';",
      "import { useLoginViewModel } from '../viewmodels/useLoginViewModel';",
    ].join('\n');
    expect(importsDe(texto)).toEqual([
      { linea: 4, modulo: '../models/AuthModel' },
      { linea: 5, modulo: '../viewmodels/useLoginViewModel' },
    ]);
  });

  it('cadenasConRuta encuentra la ruta en cadenas y no en comentarios', () => {
    const texto = [
      '// Valida la sesión con /api/auth/me.',
      "apiGet('/api/auth/me', { token });",
      'apiGet(`/api/auth/me?x=${1}`);',
      "apiGet('/api/servicios');",
    ].join('\n');
    expect(cadenasConRuta(texto, '/api/auth/me')).toEqual(['/api/auth/me', '/api/auth/me?x=${1}']);
  });
});

// ---------------------------------------------------------------------------------------------
// Regla 1: useAuth no hace peticiones HTTP directas
// ---------------------------------------------------------------------------------------------

describe('Regla 1: useAuth.tsx usa authService.ts para hablar con el servidor', () => {
  const useAuth = leer(ARCHIVO_USE_AUTH);
  const authService = leer(ARCHIVO_AUTH_SERVICE);

  it('useAuth.tsx sí importa de apiClient (el detector tiene algo que revisar)', () => {
    expect(nombresImportados(useAuth, esApiClient)).toContain('ApiError');
  });

  it('useAuth.tsx no importa apiGet, apiPost, apiPatch, apiPut ni apiDelete de apiClient', () => {
    const nombres = nombresImportados(useAuth, esApiClient);
    const prohibidos = nombres.filter((nombre) => FUNCIONES_HTTP.includes(nombre) || nombre === '*');
    expect(prohibidos).toEqual([]);
  });

  it("useAuth.tsx no escribe la ruta '/api/auth/me' en ninguna cadena", () => {
    expect(cadenasConRuta(useAuth, '/api/auth/me')).toEqual([]);
  });

  it('authService.ts expone obtenerPerfilConToken y consulta GET /api/auth/me con ese token', () => {
    expect(authService).toMatch(
      /export function obtenerPerfilConToken\(token: string\): Promise<RespuestaPerfil> \{\s*return apiGet<RespuestaPerfil>\('\/api\/auth\/me', \{ token \}\);\s*\}/,
    );
  });

  it('useAuth.tsx trae obtenerPerfilConToken desde ../models/authService', () => {
    const nombres = nombresImportados(useAuth, (modulo) => modulo === '../models/authService');
    expect(nombres).toContain('obtenerPerfilConToken');
  });
});

// ---------------------------------------------------------------------------------------------
// Regla 2: AuthContainer y las vistas de acceso no importan de models/
// ---------------------------------------------------------------------------------------------

describe('Regla 2: AuthContainer y las vistas de acceso reciben todo de su viewmodel', () => {
  it('existen los archivos que se revisan', () => {
    const faltantes = ARCHIVOS_SIN_MODELOS.filter((ruta) => !fs.existsSync(ruta)).map(relativa);
    expect(faltantes).toEqual([]);
  });

  it.each(ARCHIVOS_SIN_MODELOS.map((ruta) => [relativa(ruta), ruta]))(
    '%s no importa nada de una ruta con /models/',
    (_nombre, ruta) => {
      const hallazgos = importsDe(leer(ruta))
        .filter(({ modulo }) => modulo.includes('/models/'))
        .map(({ linea, modulo }) => `${relativa(ruta)}:${linea} importa '${modulo}'`);
      expect(hallazgos).toEqual([]);
    },
  );
});
