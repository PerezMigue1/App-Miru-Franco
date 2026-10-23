/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { formatoPrecio } from '@/features/tienda/models/productoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { conError } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, conEtiquetas, conTextos, esperarPasoCompra, PASO_CONFIRMAR, PASO_PAGO, PASO_RECOGER, veces } from '../../helpers/pantallasTienda';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  ACONDICIONADOR,
  cuerpoListaTienda,
  ERRORES_TIENDA,
  ESMALTE,
  itemCarritoCrudo,
  presentacionCruda,
  RUTA_CARRITO,
  RUTA_CREAR_PEDIDO,
  rutaProducto,
  rutaQuitarDelCarrito,
  SHAMPOO,
  type ItemCarritoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: el carrito con artículos que se dejan de vender mientras la clienta compra, con la app
 * real (renderRouter), la sesión de CLIENTA_CITAS, el reloj fijo y el servidor simulado
 * (http://api.test). La primera lectura trae el shampoo, el acondicionador y el esmalte; en la
 * siguiente el shampoo desapareció (su producto se desactivó: el carrito ya no lo lista y su detalle
 * responde 404) y la presentación del acondicionador ya no está disponible. El carrito avisa cada uno
 * por su nombre, manda un DELETE por cada uno y el checkout no se abre con ellos: sigue solo con el
 * esmalte, que sí está a la venta.
 */

const SHAMPOO_ITEM = itemCarritoCrudo(SHAMPOO, 1);
const ACONDICIONADOR_ITEM = itemCarritoCrudo(ACONDICIONADOR, 1);
const ESMALTE_ITEM = itemCarritoCrudo(ESMALTE, 1);
const RETIRADOS = [SHAMPOO_ITEM, ACONDICIONADOR_ITEM];
const nombre = (item: ItemCarritoCrudo) => `${item.producto.nombre}, ${item.presentacion.tamanio}`;
const AVISO_PRODUCTO = obtenerTexto('tienda.carrito.productoRetirado', { producto: nombre(SHAMPOO_ITEM) });
const AVISO_PRESENTACION = obtenerTexto('tienda.carrito.presentacionRetirada', { producto: nombre(ACONDICIONADOR_ITEM) });

/**
 * Carrito del servidor con estado: hasta que `cambiar()` se llama lista los tres artículos; desde
 * entonces el shampoo ya no aparece (producto desactivado) y el acondicionador llega con la
 * presentación no disponible. DELETE quita el artículo de verdad.
 */
function carritoQueCambia() {
  let cambiado = false;
  let items: ItemCarritoCrudo[] = [SHAMPOO_ITEM, ACONDICIONADOR_ITEM, ESMALTE_ITEM];
  const comoLoLista = (item: ItemCarritoCrudo): ItemCarritoCrudo =>
    cambiado && item.id === ACONDICIONADOR_ITEM.id
      ? { ...item, presentacion: presentacionCruda({ ...item.presentacion, disponible: false }) }
      : item;
  const quitar = (id: number): Manejador => () => {
    items = items.filter((item) => item.id !== id);
    return respuesta({ success: true, message: 'Ítem eliminado del carrito' });
  };
  const rutas: Record<string, Manejador> = {
    [RUTA_CARRITO]: () =>
      respuesta(
        cuerpoListaTienda(items.filter((item) => !(cambiado && item.productoId === SHAMPOO.id)).map(comoLoLista)),
      ),
    [rutaProducto(SHAMPOO.id)]: (cuerpo) =>
      cambiado ? conError(ERRORES_TIENDA.productoNoEncontrado)(cuerpo) : respuesta({ success: true, data: SHAMPOO }),
    ...Object.fromEntries(RETIRADOS.map((item) => [rutaQuitarDelCarrito(item.id), quitar(item.id)])),
  };
  return {
    rutas,
    cambiar: () => {
      cambiado = true;
    },
  };
}

describe('Carrito con productos que se dejaron de vender (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
    reiniciarConfiguracionPublica();
  });

  it(
    'avisa por nombre el producto desactivado y la presentación no disponible, los quita con DELETE y el checkout sigue sin ellos',
    async () => {
      const carrito = carritoQueCambia();
      const abierta = await abrirTienda('/carrito', { rutas: carrito.rutas });
      expect(await screen.findByLabelText(/^Shampoo hidratante, /)).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Acondicionador reparación, /)).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Esmalte en gel, /)).toBeOnTheScreen();

      carrito.cambiar();
      await tocar('Continuar compra');
      // El checkout revisa el carrito, encuentra lo retirado y regresa al carrito sin abrirse.
      await esperarRuta(abierta.app, '/carrito');
      expect(await screen.findByText(AVISO_PRODUCTO)).toBeOnTheScreen();
      conTextos(AVISO_PRESENTACION);
      for (const item of RETIRADOS) {
        expect(veces(abierta, rutaQuitarDelCarrito(item.id))).toBe(1);
      }
      expect(screen.queryByLabelText(/^Shampoo hidratante, /)).not.toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Acondicionador reparación, /)).not.toBeOnTheScreen();
      expect(screen.getByLabelText(/^Esmalte en gel, /)).toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: PASO_RECOGER })).not.toBeOnTheScreen();

      // Con lo que sigue a la venta el checkout sí se abre, solo con el esmalte.
      await tocar('Continuar compra');
      await esperarRuta(abierta.app, '/checkout');
      await esperarPasoCompra(PASO_RECOGER);
      await tocar('Continuar');
      await esperarPasoCompra(PASO_PAGO);
      await tocar('Continuar');
      await esperarPasoCompra(PASO_CONFIRMAR);
      const precio = formatoPrecio(Number(ESMALTE_ITEM.presentacion.precio) * 100);
      conEtiquetas(`${nombre(ESMALTE_ITEM)}, 1 pieza, ${precio}`, `Total: ${precio}`);
      expect(screen.queryByLabelText(/^Shampoo hidratante, /)).not.toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Acondicionador reparación, /)).not.toBeOnTheScreen();
      expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(0);
      for (const item of RETIRADOS) {
        expect(veces(abierta, rutaQuitarDelCarrito(item.id))).toBe(1);
      }
      revisarConsola();
    },
    LIMITE_MS,
  );
});
