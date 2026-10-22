/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import type { PoliticaCancelacion } from '@/features/citas/models/citaModel';
import { LIMITE_DIAS_HABILES_EXCEPCION, MINIMO_DIAS_HABILES_REEMBOLSO } from '@/features/citas/models/formaPagoModel';
import { obtenerTexto, RESPALDO_TEXTOS, type ClaveTextoSitio } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  enHoraLocal,
  masMinutos,
  pagoCrudo,
  rutaCancelar,
  rutaEstadoAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { conReglas, estadoConPolitica, horas, REGLAS_CITA, turnos } from '../../helpers/gestionCitas';
import { abrirDetalleCon, cuerpoUnico, monto } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import { abrirHojaCancelar, cancelarConMotivo, revisarInsignias, TITULO_HOJA } from '../../helpers/pantallasMisCitas';
import { diaLegible, vecesEn } from '../../helpers/pantallasReserva';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: cancelar una cita con el anticipo pagado y horas de aviso en sus reglas (REGLAS_CITA), con
 * las pantallas reales, el servidor simulado con memoria y el reloj en el lunes 19 de octubre de 2026
 * a las 10:00 de México. La hoja dice qué pasa con el anticipo según la política que responde el
 * backend (estado del anticipo con `cancelacion`) y, dentro de las horas de aviso, que ya no se
 * reagenda desde la cuenta; cancelar sigue permitido en los dos casos y termina con su aviso.
 */

const ANTICIPO = monto(pagoCrudo().monto);
const HORAS_AVISO = horas(REGLAS_CITA.horasAvisoCancelarReagendar);
const MOTIVO = 'Cambio de planes';

/** Los textos del anticipo con los días de la cita, acotados como el backend. */
const tx = (clave: ClaveTextoSitio, extra: Record<string, string> = {}) =>
  obtenerTexto(clave, {
    anticipo: ANTICIPO,
    diasExcepcion: Math.min(LIMITE_DIAS_HABILES_EXCEPCION, REGLAS_CITA.diasHabilesExcepcionAnticipo),
    diasReembolso: Math.max(MINIMO_DIAS_HABILES_REEMBOLSO, REGLAS_CITA.diasHabilesCancelarConReembolso),
    ...extra,
  });

/** Fin del plazo para cancelar con reembolso: jueves 29 de octubre de 2026, 18:00 del teléfono. */
const DIA_LIMITE = '2026-10-29';
const HASTA = enHoraLocal(DIA_LIMITE, '18:00').toISOString();

/** La cita pagada con sus reglas, que empieza `horasAntes` horas después de AHORA. */
function pagadaEn(horasAntes: number): CitaCruda {
  const inicio = masMinutos(AHORA, horasAntes * 60).toISOString();
  return conReglas(citaAnticipoPagado({ fechaHoraInicio: inicio, fechaHoraFin: masMinutos(inicio, 150).toISOString() }));
}

interface CasoCancelar {
  cita: CitaCruda;
  politica: PoliticaCancelacion;
  aviso: string;
  /** Cuántos "Prefiero reprogramar" ofrece la hoja: solo fuera de las horas de aviso. */
  botonesReprogramar: number;
  avisoFinal: string;
}

const CASOS: [string, CasoCancelar][] = [
  [
    'fuera del plazo de aviso y reembolsable: dice que se devuelve y hasta qué día',
    {
      cita: pagadaEn(REGLAS_CITA.horasAvisoCancelarReagendar + 3),
      politica: { reembolsable: true, reembolsableHasta: HASTA, diasHabilesHastaCita: 12 },
      aviso: `${tx('citas.cancelar.anticipoReembolsable')} ${tx('citas.cancelar.anticipoHasta', { fechaLimite: `${diaLegible(DIA_LIMITE)} de 2026` })}`,
      botonesReprogramar: 1,
      avisoFinal: RESPALDO_TEXTOS['citas.cancelar.toastReembolso'],
    },
  ],
  [
    'dentro del plazo de aviso y no reembolsable: el anticipo no se devuelve y ya no se reagenda desde la cuenta',
    {
      cita: pagadaEn(REGLAS_CITA.horasAvisoCancelarReagendar - 1),
      politica: { reembolsable: false, reembolsableHasta: null, diasHabilesHastaCita: 0 },
      aviso: `${tx('citas.cancelar.anticipoNoReembolsable')} ${obtenerTexto('citas.detalle.cancelarSinReagendar', { horasAviso: HORAS_AVISO })}`,
      botonesReprogramar: 0,
      avisoFinal: RESPALDO_TEXTOS['citas.cancelar.toast'],
    },
  ],
];

describe('Cancelar con el anticipo pagado y las horas de aviso de la cita (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it.each(CASOS)(
    '%s; confirmar cancela y muestra el aviso final',
    async (_caso, { cita, politica, aviso, botonesReprogramar, avisoFinal }) => {
      const abierta = await abrirDetalleCon(cita, { [rutaEstadoAnticipo(cita.id)]: turnos(estadoConPolitica(politica)) });

      await abrirHojaCancelar(aviso);
      // Con anticipo pagado la hoja trae su enlace a la política, además del de la forma de pago.
      expect(screen.getAllByRole('link', { name: RESPALDO_TEXTOS['anticipos.enlacePolitica'] })).toHaveLength(2);
      expect(screen.queryAllByRole('button', { name: 'Prefiero reprogramar' })).toHaveLength(botonesReprogramar);
      expect(vecesEn(abierta, rutaEstadoAnticipo(cita.id))).toBe(1);

      await cancelarConMotivo(MOTIVO);
      expect(await screen.findByLabelText(avisoFinal)).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen());
      revisarInsignias('Cancelada');
      expect(cuerpoUnico(abierta.llamadas, rutaCancelar(cita.id))).toEqual({ motivoCancelacion: MOTIVO });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
