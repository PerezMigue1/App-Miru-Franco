/// <reference types="jest" />

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
  llamadasApi,
  nombre,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-07.5: reglas de arquitectura de la tienda revisadas sobre el código real (lectura con fs, sin
 * ejecutarlo): las vistas y los componentes no importan models/, las vistas no usan el router ni la
 * sesión (todo pasa por su viewmodel), nadie escribe colores, console ni el guion largo, toda llamada
 * pasa por apiClient y no quedan datos del salón ni cifras de plazo escritas a mano (salen de la
 * configuración y del catálogo; la única excepción es la constante de Profeco).
 */

const TIENDA = src('features', 'tienda');
const codigoDe = (carpeta: string) =>
  fs
    .readdirSync(path.join(TIENDA, carpeta))
    .filter((archivo) => /\.tsx?$/.test(archivo))
    .map((archivo) => path.join(TIENDA, carpeta, archivo));

const VISTAS = codigoDe('views');
const COMPONENTES = codigoDe('components');
const MODELS = codigoDe('models');
const VIEWMODELS = codigoDe('viewmodels');
const TODOS = [...VISTAS, ...COMPONENTES, ...MODELS, ...VIEWMODELS];

/** Los archivos nuevos de GP-07.5 que estas reglas deben cubrir. */
const NUEVOS = [
  path.join(TIENDA, 'models', 'revocacionModel.ts'),
  path.join(TIENDA, 'models', 'devolucionesModel.ts'),
  path.join(TIENDA, 'viewmodels', 'detallePedido.ts'),
  path.join(TIENDA, 'components', 'AvisoTienda.tsx'),
  path.join(TIENDA, 'components', 'HojaRevocarCompra.tsx'),
  path.join(TIENDA, 'components', 'SeccionDevoluciones.tsx'),
];

/**
 * Cadenas con datos del salón o cifras de plazo escritas a mano: teléfonos, la ciudad, horarios, "24
 * horas", "15 días" y parecidas. Los de Profeco (compraLegal.ts, constante PROFECO) son la excepción.
 */
const DATO_ESCRITO = /\+52|\b771\b|Huejutla|\d{1,2}:\d{2} ?h|\b\d+ (horas?|d[ií]as?( h[aá]biles)?)\b/i;
const PROFECO = /^(55 5568 8722|800 468 8722|tel:\+52(5555688722|8004688722))$/;

describe('GP-07.5: los archivos nuevos existen y se revisan', () => {
  it('cada uno está en la carpeta que le toca', () => {
    expect(NUEVOS.filter((ruta) => !TODOS.includes(ruta)).map(nombre)).toEqual([]);
  });
});

describe('vistas y componentes de la tienda sin models/ y vistas sin router ni sesión', () => {
  it.each(conNombre([...VISTAS, ...COMPONENTES]))('%s no importa nada de models/', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => deModels(modulo))).toEqual([]);
  });

  it.each(conNombre(VISTAS))('%s no usa useRouter ni useAuth', (_nombre, ruta) => {
    const codigo = sinComentarios(leer(ruta));
    expect(codigo).not.toMatch(/\buseRouter\s*\(|\buseAuth\s*\(/);
    expect(importaciones(leer(ruta)).filter(({ modulo }) => /useAuth$/.test(modulo))).toEqual([]);
  });
});

describe('sin colores, console ni guion largo, y toda llamada por apiClient', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect({
      colores: colores(texto),
      console: usosDeConsola(texto),
      guionLargo: texto.includes(GUION_LARGO),
      fetch: /\bfetch\s*\(/.test(sinComentarios(texto)),
    }).toEqual({ colores: [], console: [], guionLargo: false, fetch: false });
  });

  it.each(conNombre(MODELS))('%s: cada llamada a la API usa una ruta /api/', (_nombre, ruta) => {
    for (const llamada of llamadasApi(leer(ruta))) {
      expect(llamada.trim()).toMatch(/^[`'"]\/api\//);
    }
  });
});

describe('sin datos del salón ni cifras de plazo escritos a mano', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const escritos = cadenas(sinComentarios(leer(ruta)))
      .filter(({ valor }) => DATO_ESCRITO.test(valor) && !PROFECO.test(valor))
      .map(({ linea, valor }) => `${linea}: '${valor}'`);
    expect(escritos).toEqual([]);
  });

  it('no queda SALON_RECOGER, VIGENCIA_PAGO_EN_LINEA_MS ni TEXTO_PAGO_EN_PROCESO en la tienda', () => {
    const conRestos = TODOS.filter((ruta) =>
      /\b(SALON_RECOGER|VIGENCIA_PAGO_EN_LINEA_MS|TEXTO_PAGO_EN_PROCESO|MENSAJE_CANCELADO)\b/.test(sinComentarios(leer(ruta))),
    ).map(nombre);
    expect(conRestos).toEqual([]);
  });

  it('el detector sí encuentra un dato escrito (control)', () => {
    expect(DATO_ESCRITO.test('Tienes 24 horas para pagar')).toBe(true);
    expect(DATO_ESCRITO.test('Llámanos al +52 771 000 0000')).toBe(true);
    expect(DATO_ESCRITO.test('tienda.pedido.estado.plazoTerminado')).toBe(false);
  });
});
