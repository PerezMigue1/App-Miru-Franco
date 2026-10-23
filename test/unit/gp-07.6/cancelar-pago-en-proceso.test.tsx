/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { anticipoPorConfirmarAlCancelar, avisoCancelacion } from '@/features/citas/models/gestionCitaModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  CITA_SIN_ANTICIPO,
  estadoAnticipoCrudo,
  ID_CITA,
  rutaCita,
  rutaEstadoAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import {
  citaComo,
  conReglas,
  enPausa,
  errorCon,
  hacer,
  normalizada,
  reiniciarRepositorios,
  servidorGestion,
  sinRedTurno,
  turnos,
  vecesRuta,
  type Turno,
} from '../../helpers/gestionCitas';
import { respuesta } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.6, revisión final (dinero). Una cita con anticipo en línea todavía sin pagar puede tener un
 * pago de Mercado Pago en proceso (GET /api/pagos-en-linea/citas/:id/estado responde 'pendiente'
 * cuando Mercado Pago tiene un pago que no está aprobado ni rechazado). La hoja de cancelar consulta
 * ese estado: mientras carga, texto de espera y el botón desactivado; con un pago en proceso, o si la
 * consulta falla, un texto neutro; nunca "cancelar no tiene costo" sin haberlo descartado.
 */

const SIN_COSTO = RESPALDO_TEXTOS['citas.cancelar.sinAnticipo'];
const EN_PROCESO = RESPALDO_TEXTOS['citas.cancelar.anticipoEnProceso'];
const SIN_CONFIRMAR = RESPALDO_TEXTOS['citas.cancelar.anticipoSinConfirmar'];
const REVISANDO = RESPALDO_TEXTOS['citas.detalle.cancelarRevisando'];

const PENDIENTE = conReglas(citaConAnticipo());
const estadoComo = (estado: string): Turno => () => respuesta(estadoAnticipoCrudo(estado));

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

/** Abre el detalle de la cita con el estado del anticipo indicado y abre la hoja de cancelar. */
async function abrirHoja(cruda: CitaCruda, estado: Turno) {
  const llamadas = await servidorGestion({ [rutaCita()]: turnos(citaComo(cruda)), [rutaEstadoAnticipo()]: turnos(estado) });
  const { result } = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(result.current.estado).toBe('listo'));
  await hacer(() => result.current.abrirCancelar());
  return { result, llamadas };
}

describe('hoja de cancelar con el anticipo en línea sin pagar', () => {
  it.each<[string, Turno, string]>([
    ['pago en proceso en Mercado Pago (pendiente)', estadoComo('pendiente'), EN_PROCESO],
    ['pago en revisión', estadoComo('revision'), EN_PROCESO],
    ['la consulta falla con un 500', errorCon(500, 'Internal server error'), SIN_CONFIRMAR],
    ['la consulta no tiene red', sinRedTurno, SIN_CONFIRMAR],
  ])('%s: texto neutro, nunca sin costo', async (_caso, estado, esperado) => {
    const { result, llamadas } = await abrirHoja(PENDIENTE, estado);
    await waitFor(() => expect(result.current.avisoCancelacion).toBe(esperado));
    expect(result.current.avisoCancelacion).not.toContain(SIN_COSTO);
    expect(result.current.puedeConfirmarCancelacion).toBe(true);
    expect(vecesRuta(llamadas, rutaEstadoAnticipo())).toBe(1);
  });

  it('sin pago en proceso: el texto de siempre (sin costo)', async () => {
    const { result } = await abrirHoja(PENDIENTE, estadoComo('sin_pago'));
    await waitFor(() => expect(result.current.avisoCancelacion).toContain(SIN_COSTO));
  });

  it('un pago recién aprobado que la cita aún no refleja cuenta como pagado', async () => {
    const { result } = await abrirHoja(PENDIENTE, estadoComo('aprobado'));
    await waitFor(() => expect(result.current.avisoCancelacion).not.toBe(REVISANDO));
    expect(result.current.avisoCancelacion).not.toContain(SIN_COSTO);
    expect(result.current.avisoCancelacion).toContain('$360');
  });

  it('mientras se consulta: texto de espera y no se puede confirmar', async () => {
    const pausa = enPausa();
    const { result } = await abrirHoja(PENDIENTE, pausa.turno);
    expect(result.current).toMatchObject({ avisoCancelacion: REVISANDO, puedeConfirmarCancelacion: false });
    await hacer(() => result.current.cancelar('Ya no puedo ir'));
    await pausa.soltar(respuesta(estadoAnticipoCrudo('sin_pago')));
    await waitFor(() => expect(result.current.puedeConfirmarCancelacion).toBe(true));
    expect(result.current.avisoCancelacion).toContain(SIN_COSTO);
  });

  it('una cita sin anticipo no consulta el estado', async () => {
    const { result, llamadas } = await abrirHoja(conReglas(CITA_SIN_ANTICIPO), estadoComo('sin_pago'));
    expect(result.current.avisoCancelacion).toContain(SIN_COSTO);
    expect(vecesRuta(llamadas, rutaEstadoAnticipo())).toBe(0);
  });
});

describe('avisoCancelacion y anticipoPorConfirmarAlCancelar (modelo)', () => {
  it.each<[string, CitaCruda, boolean]>([
    ['anticipo sin pagar', PENDIENTE, true],
    ['anticipo pagado', conReglas(citaAnticipoPagado()), false],
    ['sin anticipo', conReglas(CITA_SIN_ANTICIPO), false],
  ])('anticipoPorConfirmarAlCancelar: %s', (_caso, cruda, esperado) => {
    expect(anticipoPorConfirmarAlCancelar(normalizada(cruda))).toBe(esperado);
  });

  it.each<[Parameters<typeof avisoCancelacion>[4], string]>([
    ['cargando', REVISANDO],
    ['enProceso', EN_PROCESO],
    ['sinDatos', SIN_CONFIRMAR],
  ])('con el pago %s', (pago, esperado) => {
    expect(avisoCancelacion(normalizada(PENDIENTE), null, AHORA, undefined, pago)).toBe(esperado);
  });
});
