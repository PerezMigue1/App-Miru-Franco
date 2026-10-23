/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { estadoPagoConocido, reiniciarVerificacion, verificarPago } from '@/features/tienda/models/verificacionPago';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { USUARIO } from '../../helpers/datosClienta';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, sinTextos } from '../../helpers/pantallasReserva';
import { abrirTienda, esperarPestanaCarrito, pestanaCarrito } from '../../helpers/pantallasTienda';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { CLAVE_SESION, sesionGuardada } from '../../helpers/sesionGuardada';
import { RUTA_LOGOUT, servidorSinRed } from '../../helpers/sesionLimites';
import { TEXTO_SESION_TERMINADA } from '../../helpers/textosError';
import { ID_PEDIDO, itemCarritoCrudo, SHAMPOO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6 con las pantallas reales (renderRouter sobre src/app), la sesión de una clienta con dos
 * piezas en el carrito y el servidor simulado (http://api.test, datos ficticios):
 * 1. Cerrar sesión desde Perfil, con red y sin red: revoca con POST /api/auth/logout (Bearer y
 *    refreshToken), borra la sesión del teléfono, olvida lo que la tienda sabía del pago y el número
 *    del carrito, y regresa a Inicio con la invitación sin sesión y sin ningún error.
 * 2. Las cinco pestañas de la barra inferior se encuentran por su etiqueta accesible (el Carrito
 *    anuncia sus piezas) y al tocarlas navegan. Sin sesión ya lo prueba gp-04/navegacion.test.tsx.
 */

const CARRITO = [itemCarritoCrudo(SHAMPOO, 2)];
const CARRITO_DOS = pestanaCarrito(2);
const FILA_CERRAR = 'Cerrar sesión, Sal de tu cuenta en este teléfono.';
const INVITACION_INICIO = 'Crea tu cuenta para reservar citas y comprar';

describe('GP-07.6: cerrar sesión y pestañas con las pantallas reales', () => {
  const revisarConsola = prepararPruebasReserva();

  // La verificación del pago y la memoria del carrito viven en sus módulos.
  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
  });

  it.each<[string, boolean]>([
    ['con red', false],
    ['sin red', true],
  ])(
    'cerrar sesión desde Perfil %s revoca, limpia la sesión, el pago y el carrito y regresa a Inicio sin sesión',
    async (_caso, cortarRed) => {
      const abierta = await abrirTienda('/perfil', {
        items: CARRITO,
        rutas: { [`POST ${RUTA_LOGOUT}`]: () => respuesta({ success: true }) },
      });
      expect(await screen.findByText(USUARIO.nombre)).toBeOnTheScreen();
      await esperarPestanaCarrito(2);
      // La tienda ya consultó el pago de un pedido de la clienta.
      await act(async () => {
        await verificarPago(ID_PEDIDO, { motivo: 'apertura' });
      });
      expect(estadoPagoConocido(ID_PEDIDO)).not.toBeNull();
      const guardada = sesionGuardada();
      expect(guardada?.refreshToken).toBeDefined();
      // Sin red, todo lo que se pide desde aquí falla como en el teléfono.
      const llamadas = cortarRed ? servidorSinRed() : abierta.llamadas;

      await fireEvent.press(screen.getByRole('button', { name: FILA_CERRAR }));
      expect(await screen.findByText('¿Cerrar sesión?')).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Cerrar sesión'));

      await esperarRuta(abierta.app, '/inicio');
      expect(await screen.findByText(INVITACION_INICIO)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      await esperarPestanaCarrito(0);
      expect(screen.queryByLabelText(CARRITO_DOS)).not.toBeOnTheScreen();
      sinTextos(RESPALDO_TEXTOS['perfil.cierreFallido'], TEXTO_SESION_TERMINADA);

      expect(sesionGuardada()).toBeNull();
      expect(Object.keys(leerSecureStore())).not.toContain(CLAVE_SESION);
      expect(estadoPagoConocido(ID_PEDIDO)).toBeNull();

      await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_LOGOUT)).toHaveLength(1));
      const [logout] = llamadasA(llamadas, 'POST', RUTA_LOGOUT);
      expect(logout.cabeceras.Authorization).toBe(`Bearer ${guardada?.token}`);
      expect(logout.cuerpo).toEqual({ logoutAll: false, refreshToken: guardada?.refreshToken });
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, string, string, () => Promise<unknown>]>([
    ['Inicio', '/inicio', '/perfil', () => screen.findByText('Nuestro trabajo')],
    ['Servicios', '/citas', '/inicio', () => screen.findByText('Explora nuestros servicios y agenda tu cita')],
    [
      CARRITO_DOS,
      '/carrito',
      '/inicio',
      () => screen.findByLabelText('Shampoo hidratante, Botánica Ficticia, 250ml, $380 cada uno, 2 piezas, total $760'),
    ],
    ['Productos', '/tienda', '/inicio', () => screen.findByText('Explora nuestro catálogo de productos profesionales')],
    ['Perfil', '/perfil', '/inicio', () => screen.findByText(USUARIO.nombre)],
  ])(
    'con sesión, la pestaña "%s" se encuentra por su etiqueta accesible y al tocarla abre %s',
    async (etiqueta, ruta, desde, verPantalla) => {
      const { app } = await abrirTienda(desde, { items: CARRITO });
      await esperarPestanaCarrito(2);
      const pestana = screen.getByLabelText(etiqueta);
      expect(pestana).not.toBeSelected();

      await fireEvent.press(pestana);
      await esperarRuta(app, ruta);
      expect(await verPantalla()).toBeOnTheScreen();
      expect(screen.getByLabelText(etiqueta)).toBeSelected();
      // El Carrito sigue anunciando sus piezas en cualquier pestaña.
      expect(screen.getByLabelText(CARRITO_DOS)).toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );
});
