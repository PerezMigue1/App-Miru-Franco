/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import * as carritoModel from '@/features/tienda/models/carritoModel';
import * as pedidoModel from '@/features/tienda/models/pedidoModel';
import * as productoModel from '@/features/tienda/models/productoModel';
import * as presentacionTienda from '@/features/tienda/viewmodels/presentacionTienda';

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
  importaciones,
  importacionesProhibidas,
  leer,
  nombre,
  piezasDe,
  prohibidoEnModels,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-06.4 (tienda: catálogo, carrito, checkout, confirmación y Mis pedidos): reglas de arquitectura
 * y estilo revisadas sobre el código real de src/ (lectura con fs, sin ejecutarlo), con los
 * detectores de test/helpers/reglasCodigo.ts. Cubre todo src/features/tienda y sus siete rutas.
 *
 * Regla 1: las vistas y las rutas no importan nada de models/ (ni tipos).
 * Regla 2: los componentes no importan nada de models/ (ni tipos).
 * Regla 3: los models no importan components, views, viewmodels, react ni react-native.
 * Regla 4: ningún archivo escribe colores, usa console ni el guion largo.
 * Además, presentacionTienda solo vuelve a exportar, tal cual, lo de los models (sin lógica).
 */

const TIENDA = src('features', 'tienda');

/** Archivos .ts y .tsx de una carpeta de la tienda (sin .gitkeep). */
const codigoDe = (carpeta: string) =>
  fs
    .readdirSync(path.join(TIENDA, carpeta))
    .filter((archivo) => /\.tsx?$/.test(archivo))
    .map((archivo) => path.join(TIENDA, carpeta, archivo));

const RUTAS = [
  ['producto', '[id].tsx'],
  ['pedido', '[id].tsx'],
  ['pedido-confirmado', '[pedidoId].tsx'],
  ['checkout.tsx'],
  ['mis-pedidos.tsx'],
  ['(cliente)', 'tienda.tsx'],
  ['(cliente)', 'carrito.tsx'],
].map((partes) => src('app', ...partes));

const VISTAS = codigoDe('views');
const COMPONENTES = codigoDe('components');
const MODELS = codigoDe('models');
const VIEWMODELS = codigoDe('viewmodels');
const TODOS = [...RUTAS, ...VISTAS, ...COMPONENTES, ...MODELS, ...VIEWMODELS];

const PRESENTACION = path.join(TIENDA, 'viewmodels', 'presentacionTienda.ts');
const MODELOS: Record<string, Record<string, unknown>> = {
  '../models/carritoModel': carritoModel,
  '../models/pedidoModel': pedidoModel,
  '../models/productoModel': productoModel,
};

/** Los archivos que la tienda debe tener: si falta uno, las reglas no lo revisarían. */
const ESPERADOS = [
  ...RUTAS,
  PRESENTACION,
  ...['carritoModel', 'pedidoModel', 'productoModel'].map((m) => path.join(TIENDA, 'models', `${m}.ts`)),
  ...['CarritoView', 'CheckoutView', 'DetallePedidoView', 'DetalleProductoView', 'MisPedidosView', 'PedidoConfirmadoView', 'TiendaView'].map(
    (v) => path.join(TIENDA, 'views', `${v}.tsx`),
  ),
  ...['BadgePedido', 'DatosRecogerSalon', 'FilaArticuloPedido', 'FilaCarrito', 'ResumenCompra', 'TarjetaPedido', 'TarjetaProducto'].map(
    (c) => path.join(TIENDA, 'components', `${c}.tsx`),
  ),
];

describe('GP-06.4: archivos revisados', () => {
  it('existen todos los esperados', () => {
    expect(ESPERADOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });

  it('cada carpeta de la tienda tiene código que revisar', () => {
    expect([VISTAS, COMPONENTES, MODELS, VIEWMODELS].map((lista) => lista.length > 0)).toEqual([true, true, true, true]);
  });
});

describe.each([
  ['Regla 1: vistas y rutas no importan nada de models/', [...VISTAS, ...RUTAS], deModels],
  ['Regla 2: los componentes no importan nada de models/', COMPONENTES, deModels],
  ['Regla 3: los models no dependen de la interfaz', MODELS, prohibidoEnModels],
])('%s', (_regla, rutas, prohibido) => {
  it.each(conNombre(rutas))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => prohibido(modulo))).toEqual([]);
  });
});

describe('Regla 4: sin colores escritos, sin console y sin guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect({
      colores: colores(texto),
      console: usosDeConsola(texto),
      guionLargo: texto.includes(GUION_LARGO),
    }).toEqual({ colores: [], console: [], guionLargo: false });
  });
});

describe('presentacionTienda solo vuelve a exportar lo de los models', () => {
  const texto = leer(PRESENTACION);
  const reexportadas = Object.keys(MODELOS).map((modulo) => piezasDe(texto, 'export', modulo));

  it('no tiene lógica: solo export { ... } from los models de la tienda', () => {
    const sinReexportaciones = sinComentarios(texto).replace(/\bexport\s*\{[^}]*\}\s*from\s*'[^']+';/g, '');
    expect(sinReexportaciones.trim()).toBe('');
    const modulos = importaciones(texto).map(({ modulo }) => modulo);
    expect(modulos.length).toBeGreaterThan(0);
    expect(modulos.filter((modulo) => !(modulo in MODELOS))).toEqual([]);
  });

  it('cada valor que exporta es el mismo del model de donde viene', () => {
    const distintos = Object.keys(MODELOS).flatMap((modulo, i) =>
      reexportadas[i].valores.filter(
        (clave) => (presentacionTienda as Record<string, unknown>)[clave] !== MODELOS[modulo][clave],
      ),
    );
    expect(distintos).toEqual([]);
    expect(Object.keys(presentacionTienda).sort()).toEqual(reexportadas.flatMap((p) => p.valores).sort());
  });
});
