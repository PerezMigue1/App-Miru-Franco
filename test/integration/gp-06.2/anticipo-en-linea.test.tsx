/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import {
  citaAnticipoPagado,
  citaConAnticipo,
  conError,
  deepLinkAnticipo,
  ERRORES,
  initPointFicticio,
  llamadasDeRuta,
  rutaCita,
  rutaEstadoAnticipo,
  rutaPreferencia,
  RUTA_CREAR_CITA,
  SERVICIO_CON_ANTICIPO,
  VENCE_ANTICIPO_ISO,
  type CuerpoError,
  type EstadoAnticipoBackend,
} from '../../helpers/citasFicticias';
import { abrirSesionSimulada, navegadorRegresa, navegadorSeCierra } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { marcarCasillaPolitica, TEXTOS_DETALLE } from '../../helpers/pantallasMisCitas';
import {
  abrirReserva,
  appVuelveAPrimerPlano,
  AVISO_APARTADA,
  BOTON,
  CASILLA_POLITICA,
  citasEnOrden,
  conEstado,
  confirmarConAnticipo,
  esperarPantallaDePago,
  esperarRuta,
  llegarAlResumen,
  navegadorFalla,
  navegadorQuedaAbierto,
  OPCION_PAGO,
  plazoEsperado,
  prepararPruebasReserva,
  reservarYPagar,
  retener,
  revisarCheckout,
  revisarPagoPendiente,
  sinTextos,
  tocar,
  tocarYEsperar,
  vecesEn,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

// En el teléfono, el arranque en frío entrega a +native-intent el deep link completo
// (appmirufranco://anticipo/501?retorno=mp). renderRouter lo lee como URL y solo pasa la ruta sin el
// host ("/501?retorno=mp"): aquí se le devuelve el esquema y se usa la función real.
jest.mock('../../../src/app/+native-intent', () => {
  const real = jest.requireActual<typeof import('../../../src/app/+native-intent')>('../../../src/app/+native-intent');
  return {
    redirectSystemPath: ({ path, initial }: { path: string; initial: boolean }) =>
      real.redirectSystemPath({
        path: path.replace(/^\/(\d+\?retorno=mp)$/, 'appmirufranco://anticipo/$1'),
        initial,
      }),
  };
});

/**
 * GP-06.2: pago del anticipo en línea con Mercado Pago, con las pantallas reales y el navegador
 * simulado (expo-web-browser): la reserva con "Confirmar y pagar anticipo" abre el checkout
 * sola, el regreso por deep link o por el respaldo de AppState consulta el estado real del pago y
 * la clienta ve el resultado (pagado, en proceso, no completado, plazo terminado o sin navegador).
 */

const NO_COMPLETADO = 'Tu pago no se ha completado';
const EN_PROCESO = 'Tu pago está en proceso';
const REVISAR_PAGO = 'Revisar mi pago';
const INTENTAR = 'Intentar de nuevo';
const PAGAR_MP = 'Pagar con Mercado Pago';

/** El estado del pago se consultó esas veces. */
async function esperarConsultas(abierta: PantallaReserva, veces: number): Promise<void> {
  await waitFor(() => expect(vecesEn(abierta, rutaEstadoAnticipo())).toBe(veces));
}

/** El pago sigue en proceso: nunca se trata como no pagado ni se pide pagar antes de una hora. */
function revisarEnProceso(): void {
  expect(
    screen.getByText(
      'Mercado Pago todavía lo está procesando. Si ya pagaste, espera unos minutos y revisa Mis citas antes de pagar de nuevo.',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Estado: Pago en revisión')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: REVISAR_PAGO })).toBeEnabled();
  sinTextos(NO_COMPLETADO, 'Pendiente de pago', /Paga antes de/, INTENTAR);
  expect(screen.queryByLabelText('Estado: Pendiente de pago')).not.toBeOnTheScreen();
}

/** Confirmación con el anticipo ya pagado. */
async function esperarAnticipoPagado(abierta: PantallaReserva): Promise<void> {
  await esperarRuta(abierta.app, '/cita-confirmada/501');
  expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
  expect(screen.getByText('Recibimos tu anticipo. Te esperamos en el salón.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Estado: Anticipo pagado')).toBeOnTheScreen();
  expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
  sinTextos('Pagar anticipo', /Paga antes/);
}

describe('Anticipo en línea con Mercado Pago y las pantallas reales (GP-06.2)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    '"Confirmar y pagar anticipo" (política aceptada) crea la cita, abre el checkout solo y el regreso por AppState revisa el pago',
    async () => {
      const retenida = retener();
      navegadorQuedaAbierto();
      const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, { crear: retenida.envolver });
      await llegarAlResumen();

      await confirmarConAnticipo('linea');
      expect(await screen.findByRole('button', { name: 'Abriendo Mercado Pago…' })).toBeBusy();
      // GP-07.4: mientras se envía, la otra opción y la casilla quedan bloqueadas.
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeDisabled();
      await retenida.soltar();

      await esperarPantallaDePago(abierta);
      await waitFor(() => revisarCheckout(1, initPointFicticio()));
      expect(llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA)[0].cuerpo).toMatchObject({ servicioId: 2, pagoAnticipo: 'linea' });
      expect(vecesEn(abierta, rutaPreferencia())).toBe(1);

      // Mientras Mercado Pago sigue abierto.
      expect(screen.getByText('Alaciado keratínico')).toBeOnTheScreen();
      revisarPagoPendiente();
      expect(screen.getByText('Abriendo Mercado Pago')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: PAGAR_MP })).toBeBusy();
      expect(vecesEn(abierta, rutaEstadoAnticipo())).toBe(0);

      // La clienta vuelve a la app sin deep link: el respaldo de AppState revisa el pago una vez.
      await appVuelveAPrimerPlano(abierta);
      expect(await screen.findByText(NO_COMPLETADO)).toBeOnTheScreen();
      await esperarConsultas(abierta, 1);
      expect(screen.getByRole('button', { name: INTENTAR })).toBeEnabled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el regreso con el pago aprobado (deep link) lleva a la confirmación con "Anticipo pagado"; con tema oscuro',
    async () => {
      navegadorRegresa(deepLinkAnticipo());
      const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, {
        oscuro: true,
        rutas: {
          [rutaCita()]: citasEnOrden(citaConAnticipo(), citaAnticipoPagado()),
          [rutaEstadoAnticipo()]: conEstado('aprobado'),
        },
      });
      await llegarAlResumen();
      await confirmarConAnticipo('linea');

      await esperarAnticipoPagado(abierta);
      revisarCheckout(1, initPointFicticio());
      expect(vecesEn(abierta, rutaEstadoAnticipo())).toBe(1);

      await tocarYEsperar(abierta.app, BOTON.volverAlInicio, '/inicio');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<EstadoAnticipoBackend>(['pendiente', 'revision'])(
    'corrección GP-06.2: con el pago en proceso (%s) dice que está en proceso y "Revisar mi pago" solo vuelve a consultar',
    async (estado) => {
      const segunda = retener();
      navegadorRegresa(deepLinkAnticipo());
      const abierta = await reservarYPagar({
        rutas: { [rutaEstadoAnticipo()]: enSecuencia(conEstado(estado), segunda.envolver(conEstado(estado))) },
      });

      expect(await screen.findByText(EN_PROCESO)).toBeOnTheScreen();
      revisarEnProceso();
      await tocar(REVISAR_PAGO);
      expect(await screen.findByText('Revisando tu pago')).toBeOnTheScreen();
      await segunda.soltar();

      expect(await screen.findByText(EN_PROCESO)).toBeOnTheScreen();
      revisarEnProceso();
      await esperarConsultas(abierta, 2);
      expect(vecesEn(abierta, rutaPreferencia())).toBe(1);
      revisarCheckout(1, initPointFicticio());
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, EstadoAnticipoBackend, () => void]>([
    ['rechazado', 'rechazado', () => navegadorRegresa(deepLinkAnticipo())],
    ['sin pagar (sin_pago)', 'sin_pago', () => navegadorRegresa(deepLinkAnticipo())],
    ["sin terminar porque se cerró el navegador ('cancel')", 'sin_pago', () => navegadorSeCierra('cancel')],
  ])(
    'con el pago %s: "Tu pago no se ha completado" e "Intentar de nuevo" vuelve a abrir el checkout',
    async (_caso, estado, regreso) => {
      regreso();
      const abierta = await reservarYPagar({ rutas: { [rutaEstadoAnticipo()]: conEstado(estado) } });

      expect(await screen.findByText(NO_COMPLETADO)).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Si cerraste Mercado Pago antes de terminar, puedes intentarlo de nuevo. Tu cita sigue apartada hasta la hora límite.',
        ),
      ).toBeOnTheScreen();
      revisarPagoPendiente();
      sinTextos(EN_PROCESO);

      // GP-07.4: volver a pagar con el botón pide antes la casilla de la política.
      await marcarCasillaPolitica();
      await tocar(INTENTAR);
      await waitFor(() => revisarCheckout(2, initPointFicticio()));
      await esperarConsultas(abierta, 2);
      expect(vecesEn(abierta, rutaPreferencia())).toBe(2);
      expect(await screen.findByRole('button', { name: INTENTAR })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, CuerpoError, string]>([
    ['el plazo terminó', ERRORES.plazoTerminado, TEXTOS_DETALLE.liberada],
    ['la cita ya no está vigente', ERRORES.citaNoVigente, 'Esta cita ya no está vigente.'],
  ])(
    'un 409 de la preferencia porque %s lo dice y "Ver mis citas" lleva a Mis citas',
    async (_caso, error, mensaje) => {
      const abierta = await reservarYPagar({ rutas: { [rutaPreferencia()]: conError(error) } });

      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sinTextos(String(error.message), AVISO_APARTADA, 'Pendiente de pago', /Paga antes/);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      await tocarYEsperar(abierta.app, BOTON.verMisCitas, '/mis-citas');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, () => void, Record<string, () => Response>, string]>([
    [
      'no hay navegador',
      navegadorFalla,
      {},
      'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.',
    ],
    ['la preferencia falla (500)', () => undefined, { [rutaPreferencia()]: errorDelServidor }, 'No pudimos abrir el pago. Intenta de nuevo.'],
  ])(
    'si %s lo dice sin el texto del servidor y deja "Pagar con Mercado Pago"',
    async (_caso, preparar, rutas, mensaje) => {
      preparar();
      const abierta = await reservarYPagar({ rutas });

      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sinTextos('Error interno ficticio', NO_COMPLETADO);
      revisarPagoPendiente();
      expect(screen.getByRole('button', { name: PAGAR_MP })).toBeEnabled();
      expect(vecesEn(abierta, rutaEstadoAnticipo())).toBe(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la confirmación con el anticipo pendiente muestra el plazo y "Pagar anticipo" abre el pago',
    async () => {
      navegadorQuedaAbierto();
      const abierta = await abrirReserva('/cita-confirmada/501');

      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      expect(screen.getByText('Tu lugar queda apartado mientras pagas el anticipo.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Estado: Pendiente de pago')).toBeOnTheScreen();
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      expect(screen.getByLabelText(plazoEsperado(VENCE_ANTICIPO_ISO))).toBeOnTheScreen();
      // GP-07.4: cómo pagarlo y el plazo salen del catálogo con la regla de la cita.
      expect(screen.getByText(TEXTOS_DETALLE.pendienteConfirmacion)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.verMisCitas })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.volverAlInicio })).toBeOnTheScreen();

      await tocarYEsperar(abierta.app, 'Pagar anticipo', '/anticipo/501');
      await waitFor(() => revisarCheckout(1, initPointFicticio()));
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la confirmación con el pago en revisión no pide pagar ni muestra plazo',
    async () => {
      await abrirReserva('/cita-confirmada/501', { rutas: { [rutaEstadoAnticipo()]: conEstado('pendiente') } });

      expect(await screen.findByLabelText('Estado: Pago en revisión')).toBeOnTheScreen();
      expect(
        screen.getByText('Mercado Pago está confirmando tu anticipo. Lo verás reflejado en Mis citas.'),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      sinTextos('Pagar anticipo', /Paga antes/, /Págalo en línea/);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'arranque en frío con ?retorno=mp consulta el estado una vez; si falla, "Revisar mi pago" consulta sin abrir otro pago',
    async () => {
      // Android cerró la app mientras la clienta pagaba: vuelve con el deep link de Mercado Pago.
      const abierta = await abrirReserva(deepLinkAnticipo(), {
        rutas: {
          [rutaCita()]: citasEnOrden(citaConAnticipo(), citaAnticipoPagado()),
          [rutaEstadoAnticipo()]: enSecuencia(errorDelServidor, conEstado('aprobado')),
        },
      });
      await esperarPantallaDePago(abierta);

      expect(
        await screen.findByText('No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.'),
      ).toBeOnTheScreen();
      await esperarConsultas(abierta, 1);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      expect(vecesEn(abierta, rutaPreferencia())).toBe(0);

      await tocar(REVISAR_PAGO);
      await esperarAnticipoPagado(abierta);
      expect(vecesEn(abierta, rutaEstadoAnticipo())).toBe(2);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
