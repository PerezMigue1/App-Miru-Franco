/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { MAXIMO_CONSULTAS_SIN_PAGO, reiniciarVerificacion, verificarPago } from '@/features/tienda/models/verificacionPago';
import { RESPALDO_TEXTOS, type ClaveTexto } from '@/shared/api/textosSitio';

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';

import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  appVuelveAPrimerPlano,
  navegadorQuedaAbierto,
  prepararPruebasReserva,
  sinTextos,
  tocar,
  vecesEn,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  cuerpoPedido,
  deepLinkPedido,
  estadoPagoPedidoCrudo,
  ID_PEDIDO,
  pedidoCrudo,
  preferenciaPedidoCruda,
  RUTA_PREFERENCIA_PEDIDO,
  rutaEstadoPagoPedido,
  rutaPedido,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

// En el teléfono, el arranque en frío entrega a +native-intent el deep link completo
// (appmirufranco://pedido/701?retorno=mp). renderRouter lo lee como URL y solo pasa la ruta sin el
// host ("/701?retorno=mp"): aquí se le devuelve el esquema y se usa la función real (como en GP-06.2).
jest.mock('../../../src/app/+native-intent', () => {
  const real = jest.requireActual<typeof import('../../../src/app/+native-intent')>('../../../src/app/+native-intent');
  return {
    redirectSystemPath: ({ path, initial }: { path: string; initial: boolean }) =>
      real.redirectSystemPath({
        path: path.replace(/^\/(\d+\?retorno=mp)$/, 'appmirufranco://pedido/$1'),
        initial,
      }),
  };
});

/**
 * GP-07.5: la confirmación del pedido con el registro de la verificación del pago, con las
 * pantallas reales (renderRouter), la sesión de CLIENTA_CITAS, el reloj fijo y el servidor simulado
 * (http://api.test, pedido ficticio 701 en línea por pagar). Mercado Pago nunca se abre de verdad:
 * expo-web-browser está simulado. Los textos que se esperan son los del catálogo (RESPALDO_TEXTOS).
 */

const RUTA_ESTADO = rutaEstadoPagoPedido();
const CONFIRMACION = `/pedido-confirmado/${ID_PEDIDO}`;
/**
 * Regreso de Mercado Pago en arranque en frío: +native-intent lo abre como
 * /pedido-confirmado/701?retorno=mp (un enlace directo a la confirmación llega sin parámetros).
 */
const REGRESO = deepLinkPedido();
const PAGOS = ['Pagar con Mercado Pago', 'Reintentar pago', 'Pagar de nuevo'];

const texto = (clave: ClaveTexto) => RESPALDO_TEXTOS[clave];
const pago = (estado: string): Manejador => () => respuesta(estadoPagoPedidoCrudo(estado));

/** El estado del pago responde cada salida en orden (la última se repite). */
function rutas(...estados: Manejador[]): Record<string, Manejador> {
  return {
    [rutaPedido()]: () => respuesta(cuerpoPedido(pedidoCrudo())),
    [RUTA_ESTADO]: enSecuencia(...estados),
    [RUTA_PREFERENCIA_PEDIDO]: () => respuesta(preferenciaPedidoCruda(), 201),
  };
}

/** Un estado del pago que no responde hasta soltarlo. */
function retenido(estado: string): { manejador: Manejador; soltar: () => Promise<void> } {
  let liberar: () => void = () => undefined;
  const llegada = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  return {
    manejador: () => llegada.then(() => respuesta(estadoPagoPedidoCrudo(estado))) as unknown as Response,
    soltar: () =>
      act(async () => {
        liberar();
      }),
  };
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const consultas = (abierta: PantallaReserva) => vecesEn(abierta, RUTA_ESTADO);

function sinPagarOtraVez(abierta: PantallaReserva): void {
  expect(vecesEn(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(0);
  expect(abrirSesionSimulada()).not.toHaveBeenCalled();
}

const verificando = () => screen.queryByRole('progressbar', { name: texto('tienda.pago.verificandoTitulo') });

describe('Confirmación del pedido con la verificación del pago (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    // El registro es de módulo: cada prueba empieza sin pedidos conocidos.
    reiniciarVerificacion();
  });

  it.each<[string, string, string, ClaveTexto, () => void]>([
    [
      'aprobado',
      'aprobado',
      texto('tienda.pago.aprobadoTitulo'),
      'tienda.pagoRecibidoTexto',
      () => {
        expect(screen.getByLabelText('Estado: Pagado')).toBeOnTheScreen();
        sinTextos(/Paga antes del/);
      },
    ],
    [
      'pendiente',
      'pendiente',
      texto('tienda.pago.enProcesoTitulo'),
      'tienda.pagoEnProcesoTexto',
      () => {
        // Sigue verificando con sus reintentos: el indicador se ve aparte y nunca dice "no pagado".
        expect(verificando()).toBeOnTheScreen();
        sinTextos(texto('tienda.pago.noCompletadoTitulo'), /Paga antes del/);
      },
    ],
    [
      'en revisión',
      'revision',
      texto('tienda.pago.revisionTitulo'),
      'tienda.pago.revisionTexto',
      () => expect(verificando()).not.toBeOnTheScreen(),
    ],
    [
      'rechazado',
      'rechazado',
      texto('tienda.pago.noCompletadoTitulo'),
      'tienda.pago.rechazadoTexto',
      () => expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeEnabled(),
    ],
  ])(
    'al volver de Mercado Pago dice "Verificando tu pago" y luego el pago %s con el texto del catálogo',
    async (_caso, estado, titulo, clave, revisar) => {
      const respuestaPago = retenido(estado);
      const abierta = await abrirReserva(REGRESO, { rutas: rutas(respuestaPago.manejador) });
      expect(await screen.findByRole('header', { name: texto('tienda.pago.verificandoTitulo') })).toBeOnTheScreen();
      expect(screen.getByText(texto('tienda.pago.verificandoTexto'))).toBeOnTheScreen();
      expect(verificando()).toBeOnTheScreen();
      for (const boton of PAGOS) {
        expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
      }

      await respuestaPago.soltar();
      expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
      expect(screen.getByText(new RegExp(`^${texto(clave).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeOnTheScreen();
      revisar();
      if (estado !== 'rechazado') {
        for (const boton of PAGOS) {
          expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
        }
      }
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'reintentos agotados sin ver el pago: "Todavía no vemos tu pago" y "Revisar mi pago" primero',
    async () => {
      const abierta = await abrirReserva(REGRESO, { rutas: rutas(pago('sin_pago'), pago('sin_pago'), pago('sin_pago'), pago('aprobado')) });
      expect(await screen.findByRole('header', { name: texto('tienda.pago.verificandoTitulo') })).toBeOnTheScreen();
      await avanzar(60_000);
      expect(await screen.findByRole('header', { name: texto('tienda.pago.porConfirmarTitulo') })).toBeOnTheScreen();
      expect(screen.getByText(/^Si ya pagaste, no pagues de nuevo: puede tardar unos minutos en verse\. Toca Revisar mi pago\. Tu pedido sigue apartado hasta el /)).toBeOnTheScreen();
      expect(consultas(abierta)).toBe(MAXIMO_CONSULTAS_SIN_PAGO);
      expect(screen.getByRole('button', { name: 'Revisar mi pago' })).toBeEnabled();
      // Pagar otra vez solo queda como opción secundaria, con su advertencia.
      expect(screen.getByRole('button', { name: 'Pagar de nuevo' })).toBeOnTheScreen();
      sinTextos(texto('tienda.pago.noCompletadoTitulo'));

      await tocar('Revisar mi pago');
      expect(await screen.findByRole('header', { name: texto('tienda.pago.aprobadoTitulo') })).toBeOnTheScreen();
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string]>([
    ['un 500', () => respuesta({ statusCode: 500, message: 'Error interno ficticio' }, 500), texto('tienda.pago.noSePudoRevisar')],
    ['sin red', () => Promise.reject(new TypeError('Network request failed')) as unknown as Response, MENSAJE_SIN_CONEXION],
  ])(
    'si la verificación falla (%s) lo dice sin el mensaje del servidor y "Revisar mi pago" no abre otro pago',
    async (_caso, falla, mensaje) => {
      const abierta = await abrirReserva(REGRESO, { rutas: rutas(falla, pago('pendiente')) });
      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sinTextos('Error interno ficticio');
      for (const boton of PAGOS) {
        expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
      }
      await tocar('Revisar mi pago');
      expect(await screen.findByRole('header', { name: texto('tienda.pago.enProcesoTitulo') })).toBeOnTheScreen();
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, string, string]>([
    ['en proceso', 'pendiente', texto('tienda.pago.enProcesoTitulo')],
    ['en revisión', 'revision', texto('tienda.pago.revisionTitulo')],
    ['aprobado', 'aprobado', texto('tienda.pago.aprobadoTitulo')],
  ])(
    'sin cobros dobles: si al tocar "Reintentar pago" el pago ya está %s, no pide preferencia ni abre Mercado Pago',
    async (_caso, estado, titulo) => {
      // Al abrir no hay pago; mientras tanto la clienta pagó (por ejemplo, desde otra pestaña).
      const abierta = await abrirReserva(CONFIRMACION, { rutas: rutas(pago('sin_pago'), pago(estado)) });
      await tocar('Reintentar pago');
      expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
      await avanzar(60_000);
      expect(consultas(abierta)).toBeGreaterThanOrEqual(2);
      for (const boton of PAGOS) {
        expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
      }
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un doble toque en "Reintentar pago" abre Mercado Pago una sola vez',
    async () => {
      navegadorQuedaAbierto();
      const abierta = await abrirReserva(CONFIRMACION, { rutas: rutas(pago('sin_pago')) });
      const boton = await screen.findByRole('button', { name: 'Reintentar pago' });
      await fireEvent.press(boton);
      await fireEvent.press(boton);
      expect(await screen.findByText(texto('tienda.pago.abriendo'))).toBeOnTheScreen();
      await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
      await fireEvent.press(screen.getByRole('button', { name: /Abriendo|Reintentar pago/ }));
      await avanzar(1_000);
      expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
      expect(vecesEn(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'mientras otra verificación del mismo pedido va en curso no se ofrece pagar y se ve "Verificando tu pago"',
    async () => {
      const segunda = retenido('aprobado');
      const abierta = await abrirReserva(CONFIRMACION, { rutas: rutas(pago('sin_pago'), segunda.manejador) });
      expect(await screen.findByRole('button', { name: 'Reintentar pago' })).toBeOnTheScreen();
      // Por ejemplo, la del regreso a primer plano o la de Mis pedidos.
      await act(async () => {
        void verificarPago(ID_PEDIDO, { motivo: 'revisar' });
      });
      expect(await screen.findByRole('progressbar', { name: texto('tienda.pago.verificandoTitulo') })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Reintentar pago' })).not.toBeOnTheScreen();
      await segunda.soltar();
      expect(await screen.findByRole('header', { name: texto('tienda.pago.aprobadoTitulo') })).toBeOnTheScreen();
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'en segundo plano deja de consultar y al volver a primer plano verifica el pago pendiente',
    async () => {
      const abierta = await abrirReserva(CONFIRMACION, { rutas: rutas(pago('pendiente'), pago('aprobado')) });
      expect(await screen.findByRole('header', { name: texto('tienda.pago.enProcesoTitulo') })).toBeOnTheScreen();
      expect(consultas(abierta)).toBe(1);
      await avanzar(60_000);
      expect(consultas(abierta)).toBe(1);

      await appVuelveAPrimerPlano(abierta);
      expect(await screen.findByRole('header', { name: texto('tienda.pago.aprobadoTitulo') })).toBeOnTheScreen();
      expect(consultas(abierta)).toBe(2);
      sinPagarOtraVez(abierta);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
