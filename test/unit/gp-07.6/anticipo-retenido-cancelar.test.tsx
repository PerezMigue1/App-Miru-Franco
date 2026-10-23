/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { avisoCancelacion, anticipoComprometidoAlCancelar } from '@/features/citas/models/gestionCitaModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  ID_CITA,
  masMinutos,
  PAGADO_EN_ISO,
  pagoCrudo,
  RETENIDO_EN_ISO,
  rutaCita,
  rutaEstadoAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import {
  citaComo,
  conReglas,
  configVigente,
  hacer,
  horas,
  normalizada,
  REGLAS_CITA,
  reiniciarRepositorios,
  servidorGestion,
  turnos,
  vecesRuta,
} from '../../helpers/gestionCitas';
import { cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.6, defecto de dinero en el aviso antes de cancelar: una cita vigente con el anticipo
 * RETENIDO (pago aprobado con retenidoEn) o con un pago EN REVISIÓN no debe decir "Como no has
 * pagado anticipo, cancelar no tiene costo": la clienta sí pagó. Retenido: el anticipo de $X ya no se
 * devuelve (decisión firme del backend). En revisión: el salón decide si se devuelve. Los dos
 * ofrecen el enlace a la política y no esperan la consulta de reembolso (el backend no la da).
 */

const SIN_ANTICIPO = RESPALDO_TEXTOS['citas.cancelar.sinAnticipo'];
const RETENIDO = obtenerTexto('citas.cancelar.anticipoRetenido', { anticipo: '$360' });
const EN_REVISION = RESPALDO_TEXTOS['citas.cancelar.anticipoEnRevision'];

const retenida = (cambios: Partial<CitaCruda> = {}) =>
  conReglas(
    citaAnticipoPagado({
      pagos: [pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO, retenidoEn: RETENIDO_EN_ISO })],
      ...cambios,
    }),
  );
const enRevision = (cambios: Partial<CitaCruda> = {}) =>
  conReglas(citaConAnticipo({ pagos: [pagoCrudo({ estado: 'en_revision', pagadoEn: PAGADO_EN_ISO })], ...cambios }));

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

describe('avisoCancelacion con el anticipo retenido o en revisión (modelo)', () => {
  it.each<[string, CitaCruda, string]>([
    ['retenido: dice el monto y que no se devuelve', retenida(), RETENIDO],
    ['en revisión: el salón decide si se devuelve', enRevision(), EN_REVISION],
  ])('%s, nunca que no tiene costo', (_caso, cruda, esperado) => {
    const aviso = avisoCancelacion(normalizada(cruda), null, AHORA);
    expect(aviso).toBe(esperado);
    expect(aviso).not.toContain(SIN_ANTICIPO);
  });

  it('un pago en revisión junto a uno aprobado sigue como pagado: se consulta si se devuelve', () => {
    const cruda = enRevision({
      pagos: [pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO }), pagoCrudo({ id: 802, estado: 'en_revision' })],
    });
    const aviso = avisoCancelacion(normalizada(cruda), 'cargando', AHORA);
    expect(aviso).toBe(RESPALDO_TEXTOS['citas.detalle.cancelarRevisando']);
  });

  it('el retenido usa el monto que se pagó, no el del servicio', () => {
    const cruda = retenida({
      pagos: [pagoCrudo({ estado: 'aprobado', monto: '420.00', pagadoEn: PAGADO_EN_ISO, retenidoEn: RETENIDO_EN_ISO })],
    });
    expect(avisoCancelacion(normalizada(cruda), null, AHORA)).toBe(
      obtenerTexto('citas.cancelar.anticipoRetenido', { anticipo: '$420' }),
    );
  });

  it('dentro de las horas de aviso se agrega que ya no se reagenda desde la cuenta', () => {
    const pronto = masMinutos(AHORA, 5 * 60).toISOString();
    const sinReagendar = obtenerTexto('citas.detalle.cancelarSinReagendar', {
      horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar),
    });
    expect(avisoCancelacion(normalizada(retenida({ fechaHoraInicio: pronto })), null, AHORA)).toBe(`${RETENIDO} ${sinReagendar}`);
  });

  it('con la plantilla del servidor la usa; rota, cae al respaldo sin llaves', () => {
    const cita = normalizada(retenida());
    const delServidor = configVigente(undefined, { 'citas.cancelar.anticipoRetenido': 'Retenido ficticio de {anticipo}.' });
    expect(avisoCancelacion(cita, null, AHORA, delServidor)).toBe('Retenido ficticio de $360.');
    const rota = configVigente(undefined, { 'citas.cancelar.anticipoRetenido': 'Retenido {desconocida} roto' });
    expect(avisoCancelacion(cita, null, AHORA, rota)).toBe(RETENIDO);
  });

  it.each<[string, CitaCruda, boolean]>([
    ['retenido', retenida(), true],
    ['en revisión', enRevision(), true],
    ['pagado', conReglas(citaAnticipoPagado()), true],
    ['pendiente sin pago', conReglas(citaConAnticipo()), false],
  ])('anticipoComprometidoAlCancelar: %s', (_caso, cruda, esperado) => {
    expect(anticipoComprometidoAlCancelar(normalizada(cruda))).toBe(esperado);
  });
});

describe('useDetalleCitaViewModel: hoja de cancelar con el anticipo retenido', () => {
  it.each<[string, CitaCruda, string]>([
    ['retenido', retenida(), RETENIDO],
    ['en revisión', enRevision(), EN_REVISION],
  ])('%s: aviso honesto, enlace a la política y sin esperar la consulta de reembolso', async (_caso, cruda, esperado) => {
    const llamadas = await servidorGestion({ [rutaCita()]: turnos(citaComo(cruda)) });
    const { result } = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await hacer(() => result.current.abrirCancelar());
    expect(result.current).toMatchObject({
      avisoCancelacion: esperado,
      avisoConPolitica: true,
      puedeConfirmarCancelacion: true,
    });
    expect(vecesRuta(llamadas, rutaEstadoAnticipo())).toBe(0);
  });
});
