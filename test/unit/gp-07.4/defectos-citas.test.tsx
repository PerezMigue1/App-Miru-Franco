/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { estadoAnticipo, fechaHoraLegible, limitePagoCorto } from '@/features/citas/models/citaModel';
import { useAnticipoViewModel } from '@/features/citas/viewmodels/useAnticipoViewModel';
import { useCitaConfirmadaViewModel } from '@/features/citas/viewmodels/useCitaConfirmadaViewModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { useReprogramarCitaViewModel } from '@/features/citas/viewmodels/useReprogramarCitaViewModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaConAnticipo,
  citaEnSalon,
  DIA_CITA,
  disponibilidadCruda,
  ID_CITA,
  isoMexico,
  masMinutos,
  rutaCancelar,
  rutaCita,
  rutaDisponibilidad,
  rutaEstadoAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import {
  citaComo,
  conReglas,
  enPausa,
  escriturasDe,
  hacer,
  normalizada,
  REGLAS_CITA,
  reiniciarRepositorios,
  rutaAnticipoEnSalon,
  servidorGestion,
  turnos,
} from '../../helpers/gestionCitas';
import { diaConMayuscula, horaEnTelefono } from '../../helpers/pantallasReserva';
import { REGLAS_FICTICIAS } from '../../helpers/reservaFicticia';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4, defectos de citas, cada uno con su prueba (deben pasar con TZ=UTC y con
 * TZ=America/Mexico_City):
 * 1. Reprogramar: "De" y "A" con el mismo formato y la misma zona (la del teléfono), nunca la
 *    horaLocal del servidor.
 * 2. Pagar el anticipo no hace nada mientras se cancela la cita.
 * 3. El anticipo vencido lo decide el backend (cancelada por anticipo_no_pagado), no el reloj.
 * 4. La pantalla del anticipo no da fecha límite con la cita cerrada.
 * 5. El id de la especialista se recorta al normalizar y al pedir la disponibilidad.
 * 6. El aviso del anticipo en el salón usa los minutos de la regla de la cita.
 */

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);


/** Día y hora como los debe ver la clienta: componentes locales del instante en el teléfono. */
function esperadoEnTelefono(iso: string): string {
  const fecha = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  return `${diaConMayuscula(dia)}, ${horaEnTelefono(iso)}`;
}

async function servidorConCita(cita: CitaCruda, rutas: Record<string, Manejador> = {}) {
  return servidorGestion({ [rutaCita()]: turnos(citaComo(cita)), ...rutas });
}

describe('1. "De" y "A" al reprogramar', () => {
  it('salen de la misma función, con la zona del teléfono, aunque el servidor mande otra horaLocal', async () => {
    const slots = disponibilidadCruda().slots.map((slot) => ({ ...slot, horaLocal: 'hora del servidor' }));
    await servidorConCita(conReglas(citaConAnticipo()), {
      [rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 2)]: turnos(() => respuesta(disponibilidadCruda({ slots }))),
    });
    const { result } = await renderHook(() => useReprogramarCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    const elegido = result.current.disponibilidad?.slots[0];
    if (!elegido) {
      throw new Error('Sin horarios.');
    }
    await hacer(() => result.current.elegirHorario(elegido));

    const resumen = result.current.resumenCambio;
    expect(resumen).toEqual({
      de: esperadoEnTelefono(citaConAnticipo().fechaHoraInicio),
      a: esperadoEnTelefono(elegido.inicio),
    });
    expect(resumen?.a).not.toContain('hora del servidor');
  });

  it('el mismo instante da el mismo texto en "De" y en "A"', () => {
    const instante = isoMexico(DIA_CITA, '17:30');
    expect(fechaHoraLegible(instante)).toBe(esperadoEnTelefono(instante));
    expect(fechaHoraLegible(new Date(instante))).toBe(fechaHoraLegible(instante));
    expect(fechaHoraLegible('no es fecha')).toBe('');
  });
});

describe('2. pagar mientras se cancela', () => {
  it('pagar en línea o en el salón no hacen nada con la cancelación en curso', async () => {
    const cancelar = enPausa();
    const cita = conReglas(citaConAnticipo());
    const llamadas = await servidorConCita(cita, { [rutaCancelar()]: turnos(cancelar.turno) });
    const { result } = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    await hacer(() => result.current.casilla.cambiar(true));
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => result.current.cancelar('Cambio de planes'));
    expect(result.current.cancelando).toBe(true);

    await hacer(() => result.current.pagarAnticipo());
    await hacer(() => result.current.pagarEnSalon());
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(result.current.pagando).toBeNull();
    expect(escriturasDe(llamadas)).toEqual([`PATCH /api/citas/${ID_CITA}/cancelar?propios=true`]);
    expect(escriturasDe(llamadas)).not.toContain(rutaAnticipoEnSalon());

    await cancelar.soltar(respuesta({ success: true, data: { ...cita, estado: 'cancelada' } }));
    await waitFor(() => expect(result.current.cancelando).toBe(false));
  });
});

describe('3. anticipo vencido según el backend', () => {
  it.each<[string, Partial<CitaCruda>, string]>([
    ['cancelada por la barrida (anticipo_no_pagado)', { estado: 'cancelada', motivoCancelacion: 'anticipo_no_pagado' }, 'vencido'],
    ['cancelada por la clienta con el plazo pasado', { estado: 'cancelada', motivoCancelacion: 'Cambio de planes', anticipoVenceEn: masMinutos(AHORA, -60).toISOString() }, 'liberada'],
    ['vigente con el plazo pasado en el teléfono', { anticipoVenceEn: masMinutos(AHORA, -60).toISOString() }, 'pendiente'],
  ])('%s: %s', (_caso, cambios, esperado) => {
    expect(estadoAnticipo(normalizada(citaConAnticipo(cambios)))).toBe(esperado);
  });

  it('la vigente con el plazo pasado no muestra una hora límite que ya pasó (ni en la tarjeta ni en el pago)', async () => {
    const pasada = citaConAnticipo({ anticipoVenceEn: masMinutos(AHORA, -60).toISOString() });
    expect(limitePagoCorto(pasada.anticipoVenceEn, AHORA)).toBeNull();
    await servidorConCita(pasada);
    const { result } = await renderHook(() => useAnticipoViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current).toMatchObject({ pago: { tipo: 'inicial' }, limite: null });
  });
});

describe('4. sin fecha límite con la cita cerrada', () => {
  it.each(['cancelada', 'completada', 'no_asistio', 'expirada'])('cita %s: cerrada y sin límite ni plazo', async (estado) => {
    await servidorConCita(citaConAnticipo({ estado, anticipoVenceEn: masMinutos(AHORA, 60).toISOString() }));
    const { result } = await renderHook(() => useAnticipoViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current).toMatchObject({
      pago: { tipo: 'cerrada', mensaje: 'Esta cita ya no está vigente.' },
      limite: null,
      plazo: null,
      consecuencia: null,
      avisoSalon: null,
      pideCasilla: false,
    });
  });

  it('cancelada por la barrida: el mensaje del catálogo de anticipo no pagado', async () => {
    await servidorConCita(citaConAnticipo({ estado: 'cancelada', motivoCancelacion: 'anticipo_no_pagado' }));
    const { result } = await renderHook(() => useAnticipoViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.pago).toEqual({ tipo: 'cerrada', mensaje: RESPALDO_TEXTOS['anticipos.liberada'] });
  });
});

describe('5. id de la especialista recortado', () => {
  it('al normalizar y al pedir la disponibilidad para reprogramar', async () => {
    const conEspacios = conReglas(citaConAnticipo({ especialistaId: `  ${ESPECIALISTA_UNO.usuarioId}  ` }));
    expect(normalizada(conEspacios).especialistaId).toBe(ESPECIALISTA_UNO.usuarioId);
    const llamadas = await servidorConCita(conEspacios);
    const { result } = await renderHook(() => useReprogramarCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    const pedida = llamadas.find((l) => l.ruta.startsWith('/api/citas/disponibilidad'));
    expect(pedida?.ruta).toContain(`especialistaId=${encodeURIComponent(ESPECIALISTA_UNO.usuarioId)}&`);
  });
});

describe('6. minutos del anticipo en el salón de la regla de la cita', () => {
  const minutos = `(${REGLAS_CITA.minutosAntesPagoSalon} minutos antes de tu cita)`;
  const vigentes = `${REGLAS_FICTICIAS.minutosAntesPagoSalon} minutos`;

  it('pantalla del anticipo', async () => {
    await servidorConCita(conReglas(citaEnSalon()));
    const { result } = await renderHook(() => useAnticipoViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.avisoSalon).toContain(minutos);
    expect(result.current.avisoSalon).not.toContain(vigentes);
    expect(result.current.plazo).toBeNull();
    // La cita no retiene el anticipo si no llega (la regla vigente sí): qué pasa sale de la cita.
    expect(result.current.consecuencia).toContain(RESPALDO_TEXTOS['citas.formaPago.noAsisteRevisa']);
  });

  it('confirmación de la cita (con el recordatorio del catálogo)', async () => {
    await servidorConCita(conReglas(citaEnSalon()), {
      [rutaEstadoAnticipo()]: turnos(() => respuesta({ estado: 'sin_pago' })),
    });
    const { result } = await renderHook(() => useCitaConfirmadaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.avisoSalon).toContain(minutos);
    expect(result.current).toMatchObject({ textoPendiente: null, recordatorio: RESPALDO_TEXTOS['citas.recordatorio'] });
  });

  it('confirmación en línea: cómo pagarlo con el plazo de la cita', async () => {
    await servidorConCita(conReglas(citaConAnticipo()), {
      [rutaEstadoAnticipo()]: turnos(() => respuesta({ estado: 'sin_pago' })),
    });
    const { result } = await renderHook(() => useCitaConfirmadaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.textoPendiente).toContain(`${REGLAS_CITA.plazoAnticipoHoras} horas`);
    expect(result.current.avisoSalon).toBeNull();
  });
});
