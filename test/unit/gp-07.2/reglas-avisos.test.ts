/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import {
  cadenas,
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
} from '../../helpers/reglasCodigo';

/**
 * GP-07.2 (avisos internos): reglas de arquitectura y estilo revisadas sobre el código real de src/
 * (lectura con fs, sin ejecutarlo), con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Regla 1: src/shared no importa nada de src/features (flujoEventos, la cabecera y la campana
 *          reciben lo de notificaciones por inyección desde src/app/_layout.tsx).
 * Regla 2: las vistas y los componentes no importan de models/; los models no dependen de la UI.
 * Regla 3: sin colores escritos, sin console, sin guion largo y sin toISOString.
 * Regla 4: la red solo se toca en src/shared/api (ni fetch ni expo/fetch en las features) y el
 *          token nunca va en una URL.
 * Regla 5: la raíz monta la conexión en vivo y el aviso en pantalla una sola vez.
 */

const NOTIFICACIONES = src('features', 'notificaciones');
const API = src('shared', 'api');

/** Archivos .ts y .tsx de una carpeta (sin .gitkeep). */
const codigoDe = (carpeta: string) =>
  fs
    .readdirSync(carpeta)
    .filter((archivo) => /\.tsx?$/.test(archivo))
    .map((archivo) => path.join(carpeta, archivo));

/** Todos los .ts y .tsx bajo una carpeta, con subcarpetas. */
function codigoBajo(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return codigoBajo(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const MODELS = codigoDe(path.join(NOTIFICACIONES, 'models'));
const VIEWMODELS = codigoDe(path.join(NOTIFICACIONES, 'viewmodels'));
const VISTAS = codigoDe(path.join(NOTIFICACIONES, 'views'));
const COMPONENTES = codigoDe(path.join(NOTIFICACIONES, 'components'));

const FLUJO_EVENTOS = src('shared', 'api', 'flujoEventos.ts');
const ACCIONES_CABECERA = src('shared', 'ui', 'AccionesCabecera.tsx');
const CABECERA_COMPACTA = src('shared', 'ui', 'CabeceraCompacta.tsx');
const LAYOUT = src('app', '_layout.tsx');
const RUTA_NOTIFICACIONES = src('app', 'notificaciones.tsx');
const CONEXION = path.join(NOTIFICACIONES, 'models', 'conexionAvisos.ts');

const SHARED_TOCADOS = [FLUJO_EVENTOS, ACCIONES_CABECERA, CABECERA_COMPACTA];
const TODOS = [...MODELS, ...VIEWMODELS, ...VISTAS, ...COMPONENTES, ...SHARED_TOCADOS, LAYOUT, RUTA_NOTIFICACIONES];

const ESPERADOS = [
  FLUJO_EVENTOS,
  CONEXION,
  ...['avisoModel', 'horaRelativa', 'lectorSse'].map((m) => path.join(NOTIFICACIONES, 'models', `${m}.ts`)),
  ...['avisosEstado', 'useAvisoEnPantalla', 'useAvisosEnVivo', 'useNotificaciones'].map((v) =>
    path.join(NOTIFICACIONES, 'viewmodels', `${v}.ts`),
  ),
  path.join(NOTIFICACIONES, 'views', 'NotificacionesView.tsx'),
  ...['AvisoEnPantalla', 'FilaAviso'].map((c) => path.join(NOTIFICACIONES, 'components', `${c}.tsx`)),
];

const deFeatures = ({ modulo }: { modulo: string }) =>
  modulo === '@/features' || modulo.startsWith('@/features/') || /(^|\/)features(\/|$)/.test(modulo);

/** Llamadas a fetch con cualquier nombre (fetch, fetchExpo...), sin contar comentarios. */
const LLAMADA_FETCH = /\bfetch\w*\s*\(/i;

describe('GP-07.2: archivos revisados', () => {
  it('existen todos los esperados', () => {
    expect(ESPERADOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });

  it('cada capa de notificaciones tiene código que revisar', () => {
    expect([MODELS, VIEWMODELS, VISTAS, COMPONENTES].map((lista) => lista.length > 0)).toEqual([true, true, true, true]);
  });
});

describe('Regla 1: src/shared no importa nada de src/features', () => {
  it.each(conNombre(SHARED_TOCADOS))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, deFeatures)).toEqual([]);
  });

  it('ningún archivo de src/shared/api importa de src/features', () => {
    expect(codigoBajo(API).flatMap((ruta) => importacionesProhibidas(ruta, deFeatures))).toEqual([]);
  });

  it('la cabecera recibe los avisos sin leer como un hook opcional de SesionCabecera', () => {
    const texto = sinComentarios(leer(ACCIONES_CABECERA));
    expect(texto).toMatch(/useNoLeidos\?\s*:\s*\(\)\s*=>\s*number/);
  });

  it('la raíz inyecta useNoLeidos de notificaciones en una constante de módulo', () => {
    const texto = sinComentarios(leer(LAYOUT));
    expect(texto).toMatch(/^const (\w+): SesionCabecera = \{ \.\.\.sesionCabecera, useNoLeidos \};$/m);
    const constante = /^const (\w+): SesionCabecera/m.exec(texto)?.[1];
    expect(texto).toContain(`<SesionCabeceraProvider sesion={${constante}}>`);
    expect(importaciones(leer(LAYOUT)).map((i) => i.modulo)).toContain('@/features/notificaciones/viewmodels/avisosEstado');
  });
});

describe.each([
  ['Regla 2: vistas y componentes no importan nada de models/', [...VISTAS, ...COMPONENTES, RUTA_NOTIFICACIONES], deModels],
  ['Regla 2: los models no dependen de la interfaz', MODELS, prohibidoEnModels],
])('%s', (_regla, rutas, prohibido) => {
  it.each(conNombre(rutas))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => prohibido(modulo))).toEqual([]);
  });
});

describe('Regla 3: sin colores escritos, sin console, sin guion largo y sin toISOString', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect({
      colores: colores(texto),
      console: usosDeConsola(texto),
      guionLargo: texto.includes(GUION_LARGO),
      toISOString: /\btoISOString\b/.test(sinComentarios(texto)),
    }).toEqual({ colores: [], console: [], guionLargo: false, toISOString: false });
  });
});

describe('Regla 4: la red solo en src/shared/api y el token nunca en la URL', () => {
  const FUERA_DE_API = codigoBajo(src()).filter((ruta) => !ruta.startsWith(API + path.sep));

  it.each(conNombre([...MODELS, ...VIEWMODELS, ...VISTAS, ...COMPONENTES]))('%s no llama a fetch', (_nombre, ruta) => {
    expect(LLAMADA_FETCH.test(sinComentarios(leer(ruta)))).toBe(false);
  });

  it('fuera de src/shared/api nadie importa expo/fetch', () => {
    const hallazgos = FUERA_DE_API.flatMap((ruta) =>
      importacionesProhibidas(ruta, ({ modulo }) => modulo === 'expo/fetch' || modulo.startsWith('expo/fetch/')),
    );
    expect(hallazgos).toEqual([]);
  });

  it('conexionAvisos abre el flujo con abrirFlujoEventos de src/shared/api', () => {
    const texto = sinComentarios(leer(CONEXION));
    expect(importaciones(leer(CONEXION)).map((i) => i.modulo)).toContain('@/shared/api/flujoEventos');
    expect(texto).toMatch(/abrirFlujoEventos\(RUTA_FLUJO_AVISOS, token, signal\)/);
  });

  it('flujoEventos usa expo/fetch con el token en Authorization y pide text/event-stream', () => {
    const texto = sinComentarios(leer(FLUJO_EVENTOS));
    expect(importaciones(leer(FLUJO_EVENTOS)).map((i) => i.modulo)).toEqual(['expo/fetch', './apiClient']);
    expect(texto).toContain('Authorization: `Bearer ${token}`');
    expect(texto).toContain("Accept: 'text/event-stream'");
    expect(texto).toContain('`${getBaseUrl()}${ruta}`');
  });

  it.each(conNombre([...TODOS, src('shared', 'api', 'apiClient.ts')]))('%s no pone el token en una URL', (_nombre, ruta) => {
    const sospechosas = cadenas(sinComentarios(leer(ruta))).filter(({ valor }) =>
      /[?&](?:access_?)?token(?==)|\?token\b|token(?==\$\{)/i.test(valor),
    );
    expect(sospechosas).toEqual([]);
  });
});

describe('Regla 5: la raíz monta los avisos en vivo una sola vez', () => {
  const layout = sinComentarios(leer(LAYOUT));
  /** Llamadas a useAvisosEnVivo( que no son su definición. */
  const LLAMADA_EN_VIVO = /(?<!function\s)\buseAvisosEnVivo\s*\(/g;

  it('_layout.tsx llama a useAvisosEnVivo una vez, con la sesión autenticada', () => {
    expect(layout.match(LLAMADA_EN_VIVO)).toHaveLength(1);
    expect(layout).toContain("useAvisosEnVivo(estado === 'autenticado', avisosEnApp);");
  });

  it('ningún otro archivo de src monta useAvisosEnVivo', () => {
    const otros = codigoBajo(src())
      .filter((ruta) => ruta !== LAYOUT)
      .filter((ruta) => (sinComentarios(leer(ruta)).match(LLAMADA_EN_VIVO) ?? []).length > 0)
      .map(nombre);
    expect(otros).toEqual([]);
  });

  it('el aviso en pantalla se monta una sola vez, en _layout.tsx, después de FondoBarraEstado', () => {
    expect(layout.match(/<AvisoEnPantalla\s*\/>/g)).toHaveLength(1);
    expect(layout.indexOf('<FondoBarraEstado />')).toBeLessThan(layout.indexOf('<AvisoEnPantalla />'));
    expect(layout.indexOf('<AvisoEnPantalla />')).toBeLessThan(layout.indexOf('<IntroGrieta'));
    const otros = codigoBajo(src())
      .filter((ruta) => ruta !== LAYOUT)
      .filter((ruta) => /<AvisoEnPantalla\b/.test(sinComentarios(leer(ruta))))
      .map(nombre);
    expect(otros).toEqual([]);
  });
});
