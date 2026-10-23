/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { limiteAnticipo } from '@/features/citas/models/citaModel';
import { avisoAnticipoAlReprogramar, esEspecialistaInactiva } from '@/features/citas/models/gestionCitaModel';
import { useReprogramarCitaViewModel } from '@/features/citas/viewmodels/useReprogramarCitaViewModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  citaCruda,
  citaEnSalon,
  DIA_CITA,
  disponibilidadCruda,
  ID_CITA,
  masMinutos,
  pagoCrudo,
  rutaCita,
  rutaDisponibilidad,
  rutaReprogramar,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import {
  citaComo,
  configVigente,
  conReglas,
  errorCon,
  hacer,
  horas,
  normalizada,
  REGLAS_CITA,
  reiniciarRepositorios,
  servidorGestion,
  turnos,
} from '../../helpers/gestionCitas';
import { REGLAS_FICTICIAS } from '../../helpers/reservaFicticia';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.4, reprogramar con la regla de la cita (useReprogramarCitaViewModel y gestionCitaModel): con
 * menos horas que las de aviso no se elige horario y se ofrece hablar con el salón (también si el
 * backend lo dice al confirmar); qué pasa con el anticipo al reprogramar; y la especialista que ya
 * no atiende (404 de la disponibilidad) con su aviso propio. fetch y expo-router simulados.
 */

/** La cita empieza en 5 horas: dentro de las 12 de aviso de su regla (la vigente pide 6). */
const PRONTO = masMinutos(AHORA, 5 * 60).toISOString();
const DISPONIBILIDAD = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 2);
const AVISO_CITA = obtenerTexto('citas.reprogramar.avisoMinimo', { horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar) });

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

async function abrir(cita: CitaCruda, rutas: Record<string, Manejador> = {}) {
  const llamadas = await servidorGestion({ [rutaCita()]: turnos(citaComo(cita)), ...rutas });
  const hook = await renderHook(() => useReprogramarCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}


/** El primer horario libre ya cargado (falla si no hay). */
function primerSlot(vm: ReturnType<typeof useReprogramarCitaViewModel>) {
  const slot = vm.disponibilidad?.slots[0];
  if (!slot) {
    throw new Error('Sin horarios.');
  }
  return slot;
}

const disponibilidadesPedidas = (llamadas: { ruta: string }[]) =>
  llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'));

describe('horas de aviso de la regla de la cita', () => {
  it('dentro del aviso: no deja elegir horario, lo explica con las horas de la cita y ofrece el salón', async () => {
    const abrirUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { result, llamadas } = await abrir(conReglas(citaConAnticipo({ fechaHoraInicio: PRONTO })));

    expect(result.current.estado).toBe('fueraDeAviso');
    expect(result.current.avisoFueraDePlazo).toBe(AVISO_CITA);
    expect(result.current.avisoFueraDePlazo).not.toContain(horas(REGLAS_FICTICIAS.horasAvisoCancelarReagendar));
    expect(disponibilidadesPedidas(llamadas)).toEqual([]);
    expect(result.current.contacto.map((c) => c.tipo)).toEqual(['telefono', 'whatsapp']);

    await hacer(() => result.current.abrirContacto(result.current.contacto[0].url));
    expect(abrirUrl).toHaveBeenCalledWith(result.current.contacto[0].url);
    abrirUrl.mockRestore();
  });

  it('fuera del aviso (la cita empieza en más horas): se eligen horarios como siempre', async () => {
    const { result, llamadas } = await abrir(conReglas(citaConAnticipo()));
    expect(result.current.estado).toBe('listo');
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(disponibilidadesPedidas(llamadas)).toHaveLength(1);
  });

  it('si el backend cuenta menos aviso al confirmar, pasa a hablar con el salón con sus horas', async () => {
    const delServidor = 'Para reagendar con menos de 48 horas de anticipación, comunícate con el salón.';
    const { result } = await abrir(conReglas(citaConAnticipo()), { [rutaReprogramar()]: turnos(errorCon(400, delServidor)) });
    await waitFor(() => expect(result.current.disponibilidad?.slots.length).toBeGreaterThan(0));
    await hacer(() => result.current.elegirHorario(primerSlot(result.current)));
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.estado).toBe('fueraDeAviso'));
    expect(result.current.avisoFueraDePlazo).toBe(obtenerTexto('citas.reprogramar.avisoMinimo', { horasAviso: horas(48) }));
  });
});

describe('especialista que ya no atiende', () => {
  it('404 de la disponibilidad: aviso propio y contacto con el salón, sin Reintentar', async () => {
    const { result } = await abrir(conReglas(citaConAnticipo()), {
      [DISPONIBILIDAD]: turnos(errorCon(404, 'Especialista no encontrado o inactivo')),
    });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('sinAgenda'));
    expect(result.current.errorHorarios).toBe(RESPALDO_TEXTOS['citas.reprogramar.especialistaInactiva']);
  });

  // GP-07.6: el servicio inactivo ya tiene su propio aviso (test/unit/gp-07.6); otro 404 sigue con el error.
  it('otro 404 (ni especialista ni servicio) sigue con el error de horarios', async () => {
    const { result } = await abrir(conReglas(citaConAnticipo()), {
      [DISPONIBILIDAD]: turnos(errorCon(404, 'Cita no encontrada')),
    });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('error'));
    expect(esEspecialistaInactiva(new ApiError(404, 'Especialista no encontrado o inactivo'))).toBe(true);
    expect(esEspecialistaInactiva(new ApiError(400, 'Especialista no encontrado o inactivo'))).toBe(false);
  });
});

describe('qué pasa con el anticipo al reprogramar', () => {
  const vigentes = REGLAS_FICTICIAS.minutosAntesPagoSalon;
  const config = configVigente(undefined, {
    'citas.reprogramar.anticipoSalon': `Texto del servidor con ${vigentes} minutos.`,
  });

  it.each<[string, CitaCruda, string | null]>([
    ['pagado: se respeta para la nueva fecha', citaAnticipoPagado(), obtenerTexto('citas.reprogramar.anticipoPagado', { anticipo: '$360' })],
    [
      'en el salón sin pagar: el plazo pasa a los minutos de la cita antes del nuevo horario',
      conReglas(citaEnSalon()),
      obtenerTexto('citas.reprogramar.anticipoSalon', { minutosAntesPagoSalon: REGLAS_CITA.minutosAntesPagoSalon }),
    ],
    ['en línea sin plazo: conserva el que tenía', citaConAnticipo({ anticipoVenceEn: null }), RESPALDO_TEXTOS['citas.reprogramar.anticipoLineaSinPlazo']],
    ['sin anticipo', citaCruda(), null],
    ['en revisión', citaConAnticipo({ pagos: [pagoCrudo({ estado: 'en_revision' })] }), null],
  ])('%s', (_caso, cruda, esperado) => {
    expect(avisoAnticipoAlReprogramar(normalizada(cruda), AHORA, config)).toBe(esperado);
  });

  it('en línea sin pagar: conserva su plazo con la hora límite', () => {
    const cita = normalizada(citaConAnticipo());
    expect(avisoAnticipoAlReprogramar(cita, AHORA, config)).toBe(
      obtenerTexto('citas.reprogramar.anticipoLinea', { limite: limiteAnticipo(cita.anticipoVenceEn, AHORA) }),
    );
  });

  it('el viewmodel lo entrega con el enlace a la política', async () => {
    const { result } = await abrir(conReglas(citaConAnticipo()));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current.avisoAnticipo).toContain(RESPALDO_TEXTOS['citas.reprogramar.anticipoLinea'].split('{')[0]);
    expect(result.current.enlacePolitica).toBe(RESPALDO_TEXTOS['anticipos.enlacePolitica']);
    await hacer(() => result.current.abrirPolitica());
    expect(routerSimulado.push).toHaveBeenCalledWith('/legal/anticipos');
  });

  it('sin anticipo, ni aviso ni enlace', async () => {
    const { result } = await abrir(conReglas(citaCruda()), {
      [rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 1)]: turnos(() =>
        respuesta(disponibilidadCruda({ servicioId: 1, duracionMinutos: 45 })),
      ),
    });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ avisoAnticipo: null, enlacePolitica: null });
  });
});
