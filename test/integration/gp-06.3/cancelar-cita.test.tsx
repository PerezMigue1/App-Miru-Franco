/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  conError,
  ERRORES_MIS_CITAS,
  ID_CITA,
  llamadasDeRuta,
  MENSAJES_MIS_CITAS,
  MOTIVO_CANCELACION,
  rutaCancelar,
  rutaCita,
  sinRedEnRuta,
  TEXTOS_MIS_CITAS,
} from '../../helpers/citasFicticias';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import {
  abrirConCitas,
  abrirHojaCancelar,
  abrirTarjeta,
  cancelarConMotivo,
  cerrarHoja,
  esperarDetalle,
  esperarTarjetas,
  revisarInsignias,
  TARJETAS,
  TITULO_HOJA,
  verPestana,
} from '../../helpers/pantallasMisCitas';
import {
  esperarRuta,
  prepararPruebasReserva,
  sinTextos,
  tocar,
  tocarYEsperar,
  vecesEn,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import type { Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.3: cancelar una cita desde su detalle con las pantallas reales y el servidor simulado con
 * memoria (la lista y el detalle devuelven la cita como quedó). La hoja de cancelar con su aviso,
 * el motivo que recibe el servidor, la confirmación, el anticipo pagado que el salón retiene, cerrar
 * la hoja sin cancelar, los errores en palabras de la clienta y el paso a reprogramar.
 */

const RECOMENDACION = 'Te recomendamos reprogramar tu cita en lugar de cancelarla.';
const AVISO_PAGADO =
  'El anticipo de $360 que pagaste no se devuelve si cancelas. Si reprogramas tu cita con aviso, tu anticipo se respeta.';
const CONFIRMACION = 'Cancelamos tu cita.';
const ID_PAGADA = 502;

/** Cuerpos que recibió PATCH /api/citas/:id/cancelar. */
function cancelaciones(abierta: PantallaReserva, id: number = ID_CITA): unknown[] {
  return llamadasDeRuta(abierta.llamadas, rutaCancelar(id)).map((l) => l.cuerpo);
}

/** Abre directo el detalle de la cita y su hoja de cancelar. */
async function abrirHojaDe(id: number, aviso: string, rutas: Record<string, Manejador> = {}): Promise<PantallaReserva> {
  const abierta = await abrirConCitas(`/cita/${id}`, { rutas });
  await esperarDetalle(abierta.app, id);
  await abrirHojaCancelar(aviso);
  return abierta;
}

describe('Cancelar una cita con las pantallas reales (GP-06.3)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'sin anticipo pagado: recomienda reprogramar, envía el motivo, confirma y la cita pasa al historial',
    async () => {
      const abierta = await abrirConCitas('/mis-citas');
      await abrirTarjeta(abierta.app, ID_CITA);
      await abrirHojaCancelar(RECOMENDACION);
      expect(screen.getByText('¿Por qué cancelas?')).toBeOnTheScreen();

      await cancelarConMotivo('Cambio de planes');
      expect(await screen.findByText(CONFIRMACION)).toBeOnTheScreen();
      expect(cancelaciones(abierta)).toEqual([{ motivoCancelacion: 'Cambio de planes' }]);
      await waitFor(() => expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen());
      revisarInsignias('Cancelada', 'Anticipo liberado');
      expect(screen.getByRole('header', { name: 'Motivo de la cancelación' })).toBeOnTheScreen();
      expect(screen.getByText('Cambio de planes')).toBeOnTheScreen();
      for (const boton of ['Pagar anticipo', 'Reprogramar', 'Cancelar cita']) {
        expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
      }

      // Al volver, la lista se recarga al enfocarse y la cita ya está en el historial.
      await tocarYEsperar(abierta.app, 'Volver', '/mis-citas');
      await esperarTarjetas([TARJETAS[505], TARJETAS[502]]);
      await verPestana('Historial');
      const cancelada = { ...TARJETAS[ID_CITA], estado: 'Cancelada', anticipo: 'Anticipo liberado', plazo: undefined };
      await esperarTarjetas([cancelada, TARJETAS[504], TARJETAS[503]]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con anticipo pagado: avisa que no se devuelve, cancela con otro motivo y el detalle releído dice "Anticipo retenido"',
    async () => {
      const abierta = await abrirHojaDe(ID_PAGADA, AVISO_PAGADO);
      await cancelarConMotivo('Otro', `  ${MOTIVO_CANCELACION}  `);

      expect(await screen.findByText(CONFIRMACION)).toBeOnTheScreen();
      expect(cancelaciones(abierta, ID_PAGADA)).toEqual([{ motivoCancelacion: MOTIVO_CANCELACION }]);
      // La respuesta de cancelar no trae la retención: la app vuelve a leer la cita.
      expect(vecesEn(abierta, rutaCita(ID_PAGADA))).toBe(2);
      revisarInsignias('Cancelada', 'Anticipo retenido');
      expect(screen.getByText('El salón conservó tu anticipo, así que ya no se devuelve.')).toBeOnTheScreen();
      expect(screen.getByText(MOTIVO_CANCELACION)).toBeOnTheScreen();
      sinTextos('Anticipo pagado');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si cierra la hoja sin confirmar no envía nada, la cita sigue igual y el motivo empieza de cero',
    async () => {
      const abierta = await abrirHojaDe(ID_CITA, RECOMENDACION);
      await fireEvent.press(screen.getByRole('radio', { name: 'Emergencia personal' }));
      await cerrarHoja();

      expect(cancelaciones(abierta)).toEqual([]);
      revisarInsignias('Pendiente', 'Anticipo pendiente');
      sinTextos(CONFIRMACION);

      await abrirHojaCancelar(RECOMENDACION);
      expect(screen.getByRole('radio', { name: 'Emergencia personal' })).not.toBeChecked();
      expect(ultimoBoton('Cancelar cita')).toBeDisabled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string, string]>([
    [
      'un 400 porque la cita ya no se puede cancelar',
      conError(ERRORES_MIS_CITAS.cancelarCancelada),
      TEXTOS_MIS_CITAS.cancelarNoSePuede,
      MENSAJES_MIS_CITAS.cancelarCancelada,
    ],
    ['la red caída', sinRedEnRuta, TEXTOS_MIS_CITAS.sinConexion, 'Network request failed'],
  ])(
    'con %s la hoja sigue abierta con el mensaje para la clienta y sin el texto técnico',
    async (_caso, falla, mensaje, tecnico) => {
      const abierta = await abrirHojaDe(ID_CITA, RECOMENDACION, { [rutaCancelar()]: falla });
      await cancelarConMotivo('Conflicto de horario');

      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sinTextos(tecnico, CONFIRMACION);
      expect(screen.getByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
      expect(ultimoBoton('Cancelar cita')).toBeEnabled();
      expect(cancelaciones(abierta)).toEqual([{ motivoCancelacion: 'Conflicto de horario' }]);
      revisarInsignias('Pendiente');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    '"Prefiero reprogramar" cierra la hoja y abre la reprogramación de la cita',
    async () => {
      const abierta = await abrirHojaDe(ID_CITA, RECOMENDACION);
      await tocar('Prefiero reprogramar');

      await esperarRuta(abierta.app, `/cita/${ID_CITA}/reprogramar`);
      expect(await screen.findByRole('header', { name: 'Reprogramar cita' })).toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen();
      expect(cancelaciones(abierta)).toEqual([]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
