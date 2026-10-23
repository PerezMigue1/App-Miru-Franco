/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { fechaLargaLegible, type PoliticaCancelacion } from '@/features/citas/models/citaModel';
import { avisoCancelacion, avisoCitaCancelada, dentroDelAviso } from '@/features/citas/models/gestionCitaModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { obtenerTexto, RESPALDO_TEXTOS, type ClaveTextoSitio } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  citaCruda,
  enHoraLocal,
  ID_CITA,
  masMinutos,
  rutaCancelar,
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
  estadoConPolitica,
  hacer,
  horas,
  normalizada,
  REGLAS_CITA,
  reiniciarRepositorios,
  servidorGestion,
  turnos,
  vecesRuta,
} from '../../helpers/gestionCitas';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.4, aviso antes de cancelar con la regla de la cita (avisoCancelacion y el viewmodel del
 * detalle): sin anticipo pagado no tiene costo (más el aviso para reagendar si la regla lo pide);
 * con anticipo pagado se consulta la política del backend (estado del anticipo, `cancelacion`) y se
 * dice si se devuelve con su fecha, si el plazo terminó, si no se devuelve o, sin datos, la regla
 * general; el botón de confirmar espera la política. Cancelar no se bloquea por las horas de aviso.
 */

/** Los días de la cita, acotados como el backend (excepción hasta 10, reembolso desde 5). */
const DIAS = {
  diasExcepcion: Math.min(10, REGLAS_CITA.diasHabilesExcepcionAnticipo),
  diasReembolso: Math.max(5, REGLAS_CITA.diasHabilesCancelarConReembolso),
};
const tx = (clave: ClaveTextoSitio, extra: Record<string, string> = {}) =>
  obtenerTexto(clave, { anticipo: '$360', ...DIAS, ...extra });
const REPROGRAMAR = RESPALDO_TEXTOS['citas.cancelar.reprogramar'];

const PAGADA = conReglas(citaAnticipoPagado());
/** Fin del plazo para cancelar con reembolso: el jueves 29 de octubre de 2026 a las 18:00 del teléfono. */
const HASTA = enHoraLocal('2026-10-29', '18:00').toISOString();
const REEMBOLSABLE: PoliticaCancelacion = { reembolsable: true, reembolsableHasta: HASTA, diasHabilesHastaCita: 12 };
/** La cita empieza en 5 horas: dentro de las 12 de aviso de su regla. */
const PRONTO = masMinutos(AHORA, 5 * 60).toISOString();
const sinReagendar = obtenerTexto('citas.detalle.cancelarSinReagendar', { horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar) });

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

describe('avisoCancelacion (modelo)', () => {
  const pagada = normalizada(PAGADA);

  it('la fecha límite se escribe con el día, el mes y el año del teléfono', () => {
    expect(fechaLargaLegible(HASTA)).toBe('jueves 29 de octubre de 2026');
    expect(fechaLargaLegible('no es fecha')).toBe('');
  });

  it.each<[string, PoliticaCancelacion | null, string]>([
    [
      'reembolsable: se devuelve, hasta qué día',
      REEMBOLSABLE,
      `${tx('citas.cancelar.anticipoReembolsable')} ${tx('citas.cancelar.anticipoHasta', { fechaLimite: fechaLargaLegible(HASTA) })}`,
    ],
    [
      'el backend dijo reembolsable pero el plazo ya pasó en el teléfono: terminó',
      { ...REEMBOLSABLE, reembolsableHasta: masMinutos(AHORA, -1).toISOString() },
      `${tx('citas.cancelar.anticipoPlazoTerminado', { fechaLimite: fechaLargaLegible(masMinutos(AHORA, -1)) })} ${REPROGRAMAR}`,
    ],
    [
      'no reembolsable con fecha: el plazo terminó',
      { reembolsable: false, reembolsableHasta: HASTA, diasHabilesHastaCita: 3 },
      `${tx('citas.cancelar.anticipoPlazoTerminado', { fechaLimite: fechaLargaLegible(HASTA) })} ${REPROGRAMAR}`,
    ],
    [
      'no reembolsable sin fecha: muy cerca del pago',
      { reembolsable: false, reembolsableHasta: null, diasHabilesHastaCita: 3 },
      `${tx('citas.cancelar.anticipoNoReembolsable')} ${REPROGRAMAR}`,
    ],
    ['sin datos de la política: la regla general', null, `${tx('citas.cancelar.anticipoSinDatos')} ${REPROGRAMAR}`],
  ])('%s', (_caso, politica, esperado) => {
    expect(avisoCancelacion(pagada, politica, AHORA)).toBe(esperado);
  });

  it('mientras se consulta la política: un texto de espera', () => {
    expect(avisoCancelacion(pagada, 'cargando', AHORA)).toBe(RESPALDO_TEXTOS['citas.detalle.cancelarRevisando']);
  });

  it.each<[string, CitaCruda, string]>([
    [
      'sin anticipo y con horas de aviso: no cuesta y avisa para reagendar',
      conReglas(citaCruda()),
      `${RESPALDO_TEXTOS['citas.cancelar.sinAnticipo']} ${obtenerTexto('citas.cancelar.avisoReagendar', { horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar) })}`,
    ],
    ['sin anticipo ni horas de aviso (cita sin reglas)', citaConAnticipo(), RESPALDO_TEXTOS['citas.cancelar.sinAnticipo']],
    [
      'sin anticipo y dentro de las horas de aviso: ya no se reagenda desde la cuenta',
      conReglas(citaCruda({ fechaHoraInicio: PRONTO })),
      `${RESPALDO_TEXTOS['citas.cancelar.sinAnticipo']} ${sinReagendar}`,
    ],
    [
      'pagado, no reembolsable y dentro del aviso: en lugar de reprogramar, comunicarse con el salón',
      conReglas(citaAnticipoPagado({ fechaHoraInicio: PRONTO })),
      `${tx('citas.cancelar.anticipoNoReembolsable')} ${sinReagendar}`,
    ],
  ])('%s', (_caso, cruda, esperado) => {
    const politica = { reembolsable: false, reembolsableHasta: null, diasHabilesHastaCita: 0 };
    expect(avisoCancelacion(normalizada(cruda), politica, AHORA)).toBe(esperado);
  });

  it('reembolsable dentro del aviso: se devuelve y además ya no se reagenda desde la cuenta', () => {
    const cita = normalizada(conReglas(citaAnticipoPagado({ fechaHoraInicio: PRONTO })));
    expect(avisoCancelacion(cita, REEMBOLSABLE, AHORA)).toMatch(new RegExp(`${sinReagendar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(dentroDelAviso(cita, AHORA)).toBe(true);
    expect(dentroDelAviso(cita, masMinutos(PRONTO, -13 * 60))).toBe(false);
  });

  it('el aviso al terminar dice si se devuelve el anticipo', () => {
    expect(avisoCitaCancelada(REEMBOLSABLE, AHORA)).toBe(RESPALDO_TEXTOS['citas.cancelar.toastReembolso']);
    expect(avisoCitaCancelada(null, AHORA)).toBe(RESPALDO_TEXTOS['citas.cancelar.toast']);
    expect(avisoCitaCancelada('cargando', AHORA)).toBe(RESPALDO_TEXTOS['citas.cancelar.toast']);
  });
});

// ── Viewmodel del detalle ────────────────────────────────────────────────────────────────────

async function abrir(cita: CitaCruda, rutas: Record<string, Manejador> = {}) {
  const llamadas = await servidorGestion({ [rutaCita()]: turnos(citaComo(cita)), ...rutas });
  const hook = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}


const PATCH = rutaCancelar();

const cancelada = (cita: CitaCruda) => () => respuesta({ success: true, data: { ...cita, estado: 'cancelada' } });

describe('cancelar desde el detalle (viewmodel)', () => {
  it('con anticipo pagado: el botón espera la política, después dice que se devuelve y avisa del reembolso', async () => {
    const estado = enPausa();
    const { result, llamadas } = await abrir(PAGADA, {
      [rutaEstadoAnticipo()]: turnos(estado.turno),
      [PATCH]: turnos(cancelada(PAGADA)),
    });
    await hacer(() => result.current.abrirCancelar());
    expect(result.current).toMatchObject({
      hojaCancelarVisible: true,
      avisoConPolitica: true,
      puedeConfirmarCancelacion: false,
      avisoCancelacion: RESPALDO_TEXTOS['citas.detalle.cancelarRevisando'],
    });
    // Mientras carga, confirmar no hace nada.
    await hacer(() => result.current.cancelar('Cambio de planes'));
    expect(vecesRuta(llamadas, PATCH)).toBe(0);

    await estado.soltar(await estadoConPolitica(REEMBOLSABLE)());
    await waitFor(() => expect(result.current.puedeConfirmarCancelacion).toBe(true));
    expect(result.current.avisoCancelacion).toContain(tx('citas.cancelar.anticipoReembolsable'));

    await hacer(() => result.current.cancelar('Cambio de planes'));
    await waitFor(() => expect(result.current.avisoCancelada).toBe(RESPALDO_TEXTOS['citas.cancelar.toastReembolso']));
    expect(vecesRuta(llamadas, PATCH)).toBe(1);
  });

  it('si la política no se puede consultar: la regla general, y se puede confirmar', async () => {
    const { result } = await abrir(PAGADA, { [rutaEstadoAnticipo()]: turnos(errorCon(500, 'Internal server error')) });
    await hacer(() => result.current.abrirCancelar());
    await waitFor(() => expect(result.current.avisoCancelacion).toBe(`${tx('citas.cancelar.anticipoSinDatos')} ${REPROGRAMAR}`));
    expect(result.current.puedeConfirmarCancelacion).toBe(true);
  });

  // GP-07.6: con el anticipo sin pagar la hoja sí consulta si hay un pago en línea en proceso
  // (test/unit/gp-07.6/cancelar-pago-en-proceso.test.tsx); sin anticipo no consulta nada.
  it('sin anticipo no consulta la política ni el pago', async () => {
    const { result, llamadas } = await abrir(conReglas(citaCruda()));
    await hacer(() => result.current.abrirCancelar());
    expect(result.current).toMatchObject({ avisoConPolitica: false, puedeConfirmarCancelacion: true });
    expect(llamadas.filter((l) => l.ruta.includes('/estado'))).toEqual([]);
  });

  it('dentro de las horas de aviso no ofrece reprogramar pero sí deja cancelar (el backend lo permite)', async () => {
    const pronto = conReglas(citaCruda({ fechaHoraInicio: PRONTO, fechaHoraFin: masMinutos(PRONTO, 45).toISOString() }));
    const { result, llamadas } = await abrir(pronto, { [PATCH]: turnos(cancelada(pronto)) });
    await hacer(() => result.current.abrirCancelar());
    expect(result.current.puedeReprogramar).toBe(false);
    expect(result.current.avisoCancelacion).toContain(sinReagendar);
    await hacer(() => result.current.cancelar('Emergencia personal'));
    await waitFor(() => expect(result.current.avisoCancelada).toBe(RESPALDO_TEXTOS['citas.cancelar.toast']));
    expect(vecesRuta(llamadas, PATCH)).toBe(1);
  });
});
