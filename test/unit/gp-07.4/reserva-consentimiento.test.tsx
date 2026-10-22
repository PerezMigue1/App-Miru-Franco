/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  conError,
  ERRORES,
  ID_CITA,
  llamadasDeRuta,
  RUTA_CREAR_CITA,
  RUTA_RENOVAR_MOVIL,
  sinRedEnRuta,
} from '../../helpers/citasFicticias';
import { HASH_VIGENTE, rutaSinVersion, rutaVigente } from '../../helpers/documentosFicticios';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConfirmar, CASILLA_FOTOS, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import {
  BOTON,
  CASILLA_POLITICA,
  confirmarConAnticipo,
  esperarRuta,
  marcarPolitica,
  OPCION_PAGO,
  PASO,
  retener,
  sinTextos,
  tocar,
} from '../../helpers/pantallasReserva';
import {
  consentimientoRegistrado,
  consentimientosEnviados,
  escrituras,
  RUTA_CONSENTIMIENTOS,
} from '../../helpers/reservaFicticia';
import type { Manejador } from '../../helpers/servidorSimulado';
import { sesionGuardada } from '../../helpers/sesionGuardada';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: los consentimientos al confirmar la reserva con las pantallas reales y el servidor
 * simulado. Con anticipo se registra primero la Política de anticipos (versión y hash vigentes),
 * luego la autorización de fotos si se marcó y solo entonces se crea la cita; si un registro falla
 * o no hay versión de la política, la cita no se crea y la clienta ve un mensaje claro.
 */

const ANTICIPOS = {
  items: [{ tipo: 'anticipos', documentoSlug: 'anticipos', version: '2.3', hash: HASH_VIGENTE, accion: 'aceptado' }],
  formulario: 'anticipo-cita',
  rutaOrigen: 'app/reservar',
};
const FOTOS = { items: [{ tipo: 'fotos_resultado', accion: 'aceptado' }], formulario: 'crear-cita', rutaOrigen: 'app/reservar' };

const NO_GUARDO_POLITICA =
  'No pudimos guardar tu aceptación de la Política de anticipos y cancelación, así que no continuamos.';
const NO_GUARDO_FOTOS =
  'No pudimos guardar tu autorización de fotos, así que tu cita no se agendó. Intenta de nuevo o desmarca esa casilla para continuar.';
const SIN_RED = 'Revisa tu conexión a internet e intenta de nuevo.';
const SIN_VERSION =
  'No pudimos confirmar la versión vigente de la Política de anticipos y cancelación, así que no continuamos. Revisa tu conexión a internet e intenta de nuevo.';

/** El registro de consentimientos responde con cada manejador en orden (el último se repite). */
function consentimientosEnOrden(...manejadores: Manejador[]): Manejador {
  let i = 0;
  return (cuerpo) => manejadores[Math.min(i++, manejadores.length - 1)](cuerpo);
}

/** Marca la casilla de fotos. */
async function marcarFotos(): Promise<void> {
  await fireEvent.press(screen.getByRole('checkbox', { name: CASILLA_FOTOS }));
}

/** Sigue en el paso Confirmar con el botón libre: la cita no se creó. */
function sinCita(llamadas: Parameters<typeof escrituras>[0], boton: string = BOTON.pagarEnLinea): void {
  expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(0);
  expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: boton })).toBeEnabled();
}

describe('Consentimientos al confirmar la reserva (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'en línea: primero la Política de anticipos con su versión y hash, después la cita, y abre el pago',
    async () => {
      const { app, llamadas } = await abrirConfirmar();

      await confirmarConAnticipo('linea');
      await esperarRuta(app, `/anticipo/${ID_CITA}`);
      expect(escrituras(llamadas).slice(0, 2)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      // Sin la casilla de fotos marcada, solo se registra la política.
      expect(consentimientosEnviados(llamadas)).toEqual([ANTICIPOS]);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo).toMatchObject({ pagoAnticipo: 'linea' });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'en el salón y con fotos: política, fotos y cita, en ese orden, y va a la confirmación',
    async () => {
      const { app, llamadas } = await abrirConfirmar();

      await marcarFotos();
      await confirmarConAnticipo('salon');
      await esperarRuta(app, `/cita-confirmada/${ID_CITA}`);
      expect(escrituras(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      expect(consentimientosEnviados(llamadas)).toEqual([ANTICIPOS, FOTOS]);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo).toMatchObject({ pagoAnticipo: 'salon' });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin anticipo y con fotos: solo la autorización de fotos y luego la cita',
    async () => {
      const { app, llamadas } = await abrirConfirmar({ conAnticipo: false });

      await marcarFotos();
      await tocar(BOTON.confirmar);
      await esperarRuta(app, `/cita-confirmada/${ID_CITA}`);
      expect(escrituras(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      expect(consentimientosEnviados(llamadas)).toEqual([FOTOS]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string]>([
    ['un 500', conError(ERRORES.interno), 'Intenta de nuevo en un momento.'],
    ['sin red', sinRedEnRuta, SIN_RED],
  ])(
    'si guardar la política falla con %s, no crea la cita, lo explica sin texto técnico y el reintento sí la crea',
    async (_caso, falla, detalle) => {
      const { app, llamadas } = await abrirConfirmar({
        rutas: { [RUTA_CONSENTIMIENTOS]: consentimientosEnOrden(falla, consentimientoRegistrado) },
      });

      await confirmarConAnticipo('linea');
      expect(await screen.findByText(`${NO_GUARDO_POLITICA} ${detalle}`)).toBeOnTheScreen();
      sinCita(llamadas);
      sinTextos(/Internal|Network request failed/);
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeChecked();

      await tocar(BOTON.pagarEnLinea);
      await esperarRuta(app, `/anticipo/${ID_CITA}`);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la versión ya no está publicada (400), pide la vigente, desmarca la casilla y no crea la cita',
    async () => {
      const versionVieja = conError({
        statusCode: 400,
        message: 'La versión 2.3 del documento "anticipos" no está publicada o su hash no coincide.',
      });
      const { llamadas } = await abrirConfirmar({ rutas: { [RUTA_CONSENTIMIENTOS]: versionVieja } });
      const lecturasAntes = llamadasDeRuta(llamadas, `GET ${rutaVigente('anticipos')}`).length;

      await confirmarConAnticipo('linea');
      expect(
        await screen.findByText(
          `${NO_GUARDO_POLITICA} La política se actualizó hace un momento: revisa la versión vigente, vuelve a marcar la casilla y confirma de nuevo.`,
        ),
      ).toBeOnTheScreen();
      sinCita(llamadas);
      sinTextos(/no está publicada/);
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeChecked();
      await waitFor(() =>
        expect(llamadasDeRuta(llamadas, `GET ${rutaVigente('anticipos')}`).length).toBeGreaterThan(lecturasAntes),
      );
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin versión publicada de la política no registra nada ni crea la cita y pide reintentar con conexión',
    async () => {
      const { llamadas } = await abrirConfirmar({ rutas: rutaSinVersion('anticipos') });

      await confirmarConAnticipo('linea');
      expect(await screen.findByText(SIN_VERSION)).toBeOnTheScreen();
      expect(escrituras(llamadas)).toEqual([]);
      sinCita(llamadas);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si guardar la autorización de fotos falla, no crea la cita y explica que puede desmarcarla',
    async () => {
      const { llamadas } = await abrirConfirmar({
        rutas: { [RUTA_CONSENTIMIENTOS]: consentimientosEnOrden(consentimientoRegistrado, conError(ERRORES.interno)) },
      });

      await marcarFotos();
      await confirmarConAnticipo('salon');
      expect(await screen.findByText(`${NO_GUARDO_FOTOS} Intenta de nuevo en un momento.`)).toBeOnTheScreen();
      expect(consentimientosEnviados(llamadas)).toEqual([ANTICIPOS, FOTOS]);
      sinCita(llamadas, BOTON.apartarEnSalon);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un doble toque registra la política y crea la cita una sola vez; mientras tanto todo queda bloqueado',
    async () => {
      const retenida = retener();
      const { app, llamadas } = await abrirConfirmar({
        rutas: { [RUTA_CONSENTIMIENTOS]: retenida.envolver(consentimientoRegistrado) },
      });

      await marcarPolitica();
      const boton = screen.getByRole('button', { name: BOTON.pagarEnLinea });
      await fireEvent.press(boton);
      await fireEvent.press(boton);
      expect(await screen.findByRole('button', { name: 'Abriendo Mercado Pago…' })).toBeBusy();
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: CASILLA_FOTOS })).toBeDisabled();

      await retenida.soltar();
      await esperarRuta(app, `/anticipo/${ID_CITA}`);
      expect(consentimientosEnviados(llamadas)).toHaveLength(1);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la sesión terminó al registrar la política (401 y la renovación también), no crea la cita y queda en Inicio con el aviso',
    async () => {
      const { app, llamadas } = await abrirConfirmar({
        rutas: {
          [RUTA_CONSENTIMIENTOS]: conError(ERRORES.noAutorizado),
          [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida),
        },
      });

      await confirmarConAnticipo('linea');
      await esperarRuta(app, '/inicio');
      expect(await screen.findByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeOnTheScreen();
      expect(sesionGuardada()).toBeNull();
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(0);
      sinTextos('Unauthorized', 'SESION_VENCIDA');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
