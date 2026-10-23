/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { conError, ERRORES } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos, veces } from '../../helpers/pantallasTienda';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  ACONDICIONADOR,
  cuerpoListaTienda,
  ERRORES_TIENDA,
  idItemCarrito,
  itemCarritoCrudo,
  RUTA_CARRITO,
  rutaProducto,
  rutaQuitarDelCarrito,
  SHAMPOO,
  type ItemCarritoCrudo,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: con las pantallas reales, si un producto del carrito se desactiva mientras la clienta
 * compra, el checkout la regresa al carrito, que avisa por su nombre (región en vivo para TalkBack)
 * que ya no está a la venta y lo quita con DELETE antes de pagar; el aviso se cierra con su botón.
 */

const ID_SHAMPOO = idItemCarrito(SHAMPOO.presentaciones[0].id);
const AVISO = obtenerTexto('tienda.carrito.productoRetirado', { producto: 'Shampoo hidratante, 250ml' });

/**
 * Carrito con shampoo y acondicionador cuyo shampoo, a mitad de la prueba, se desactiva (desde
 * entonces GET /api/carrito ya no lo lista, como el backend, y su detalle responde 404) o se quita en
 * otro lado (deja de listarse, pero sigue a la venta).
 */
function carritoConRetiro(borrar: Manejador = () => respuesta({ success: true, message: 'Ítem eliminado' })) {
  const estado = { retirado: false, quitadoEnOtroLado: false };
  const items: ItemCarritoCrudo[] = [itemCarritoCrudo(SHAMPOO, 2), itemCarritoCrudo(ACONDICIONADOR, 1)];
  const sinShampoo = () => estado.retirado || estado.quitadoEnOtroLado;
  const rutas: Record<string, Manejador> = {
    [RUTA_CARRITO]: () =>
      respuesta(cuerpoListaTienda(items.filter((item) => !(sinShampoo() && item.productoId === SHAMPOO.id)))),
    [rutaProducto(SHAMPOO.id)]: (cuerpo) =>
      estado.retirado ? conError(ERRORES_TIENDA.productoNoEncontrado)(cuerpo) : respuesta({ success: true, data: SHAMPOO }),
    [rutaQuitarDelCarrito(ID_SHAMPOO)]: borrar,
  };
  return { estado, rutas };
}

describe('Carrito con un producto que se dejó de vender (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
  });

  it.each<[string, Manejador | undefined]>([
    ['el DELETE sale bien', undefined],
    ['aunque el DELETE falle', conError(ERRORES.interno)],
  ])(
    'al ir a pagar, el checkout regresa al carrito, que avisa y lo quita antes de pagar (%s)',
    async (_caso, borrar) => {
      const carrito = carritoConRetiro(borrar);
      const abierta = await abrirTienda('/carrito', { rutas: carrito.rutas });
      expect(await screen.findByLabelText(/^Shampoo hidratante, /)).toBeOnTheScreen();
      sinTextos(AVISO);

      carrito.estado.retirado = true;
      await tocar('Continuar compra');
      await esperarRuta(abierta.app, '/carrito');
      expect(await screen.findByText(AVISO)).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Shampoo hidratante, /)).not.toBeOnTheScreen();
      expect(screen.getByLabelText(/^Acondicionador reparación, /)).toBeOnTheScreen();
      expect(veces(abierta, rutaQuitarDelCarrito(ID_SHAMPOO))).toBe(1);
      // El aviso vive en una región en vivo: TalkBack lo anuncia al aparecer.
      const region = screen.getByText(AVISO);
      let nodo = region.parent;
      while (nodo && nodo.props.accessibilityLiveRegion !== 'polite') {
        nodo = nodo.parent;
      }
      expect(nodo?.props.accessibilityLiveRegion).toBe('polite');

      await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('tienda.carrito.cerrarAviso') }));
      await waitFor(() => expect(screen.queryByText(AVISO)).not.toBeOnTheScreen());
      conTextos('Recoges tu pedido en el salón. Pagas en línea o al recogerlo.');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'si el producto sigue a la venta (se quitó en otro lado), no se avisa nada',
    async () => {
      const carrito = carritoConRetiro();
      const abierta = await abrirTienda('/carrito', { rutas: carrito.rutas });
      expect(await screen.findByLabelText(/^Shampoo hidratante, /)).toBeOnTheScreen();
      // Sin desactivarlo, el carrito ya no lo trae (se quitó desde la web).
      carrito.estado.quitadoEnOtroLado = true;
      await tocar('Continuar compra');
      await esperarRuta(abierta.app, '/checkout');
      await waitFor(() => expect(veces(abierta, rutaProducto(SHAMPOO.id))).toBe(1));
      expect(await screen.findByRole('header', { name: 'Recoges tu pedido en el salón' })).toBeOnTheScreen();
      sinTextos(AVISO);
      expect(veces(abierta, rutaQuitarDelCarrito(ID_SHAMPOO))).toBe(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
