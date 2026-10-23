/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { conUnidad } from '@/features/citas/models/formaPagoModel';
import { esServicioInactivo, textoAnticipoPendiente } from '@/features/citas/models/gestionCitaModel';
import { useReprogramarCitaViewModel } from '@/features/citas/viewmodels/useReprogramarCitaViewModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, citaConAnticipo, DIA_CITA, ID_CITA, masMinutos, rutaCita, rutaDisponibilidad } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import {
  citaComo,
  configVigente,
  conReglas,
  errorCon,
  normalizada,
  REGLAS_CITA,
  reiniciarRepositorios,
  servidorGestion,
  turnos,
} from '../../helpers/gestionCitas';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.6, dos defectos de citas:
 * 1. textoAnticipoPendiente sin ninguna forma de pago a la mano ya no queda "Págalo. Si no..."
 *    (anticipos.pendiente sin {formasPago}): usa anticipos.pendienteSinFormas, del servidor o del
 *    respaldo, sin llaves.
 * 2. Reprogramar con el servicio inactivo (404 "Servicio no encontrado o inactivo" de la
 *    disponibilidad) da un aviso propio con el contacto del salón, no el error genérico.
 */

const PLAZO = conUnidad(REGLAS_CITA.plazoAnticipoHoras, 'hora', 'horas');
const PENDIENTE = normalizada(conReglas(citaConAnticipo()));
/** Solo el salón y la cita en 30 minutos: ya no da tiempo de pagarlo en el salón. */
const CERCANA = normalizada(conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 30).toISOString() })));
const SOLO_SALON = { mercadoPagoAnticipos: false } as const;

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

describe('textoAnticipoPendiente con y sin formas de pago', () => {
  it('con formas: la plantilla de siempre', () => {
    const config = configVigente();
    expect(textoAnticipoPendiente(PENDIENTE, AHORA, config)).toBe(
      obtenerTexto('anticipos.pendiente', { formasPago: 'en línea o en el salón', plazoAnticipo: PLAZO }, config),
    );
  });

  it('sin formas: la frase completa, sin "Págalo." suelto ni llaves', () => {
    const texto = textoAnticipoPendiente(CERCANA, AHORA, configVigente(SOLO_SALON));
    expect(texto).toBe(obtenerTexto('anticipos.pendienteSinFormas', { plazoAnticipo: PLAZO }));
    expect(texto).toMatch(/^Paga tu anticipo\. Si no se paga en /);
    expect(texto).not.toMatch(/Págalo\s*\.|[{}]/);
  });

  it.each<[string, Record<string, string>, string]>([
    [
      'la del servidor',
      { 'anticipos.pendienteSinFormas': 'Anticipo ficticio: {plazoAnticipo}.' },
      `Anticipo ficticio: ${PLAZO}.`,
    ],
    [
      'rota en el servidor: el respaldo',
      { 'anticipos.pendienteSinFormas': 'Anticipo {variableQueNoExiste}' },
      obtenerTexto('anticipos.pendienteSinFormas', { plazoAnticipo: PLAZO }),
    ],
    [
      'el servidor solo manda la de con formas: igual sin "Págalo."',
      { 'anticipos.pendiente': 'Págalo ya {formasPago}. Plazo {plazoAnticipo}.' },
      obtenerTexto('anticipos.pendienteSinFormas', { plazoAnticipo: PLAZO }),
    ],
  ])('sin formas, plantilla %s', (_caso, textos, esperado) => {
    expect(textoAnticipoPendiente(CERCANA, AHORA, configVigente(SOLO_SALON, textos))).toBe(esperado);
  });
});

describe('reprogramar con el servicio inactivo', () => {
  const disponibilidad = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 2);

  it('404 del servicio en la disponibilidad: aviso propio y contacto con el salón, sin Reintentar', async () => {
    await servidorGestion({
      [rutaCita()]: turnos(citaComo(conReglas(citaConAnticipo()))),
      [disponibilidad]: turnos(errorCon(404, 'Servicio no encontrado o inactivo')),
    });
    const { result } = await renderHook(() => useReprogramarCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('sinAgenda'));
    expect(result.current.errorHorarios).toBe(RESPALDO_TEXTOS['citas.reprogramar.servicioInactivo']);
    expect(result.current.contacto.length).toBeGreaterThan(0);
  });

  it.each<[string, unknown, boolean]>([
    ['404 del servicio', new ApiError(404, 'Servicio no encontrado o inactivo'), true],
    ['404 de la especialista', new ApiError(404, 'Especialista no encontrado o inactivo'), false],
    ['400 con la palabra servicio', new ApiError(400, 'Servicio no encontrado o inactivo'), false],
    ['un error que no es ApiError', new Error('Servicio no encontrado'), false],
  ])('esServicioInactivo: %s', (_caso, error, esperado) => {
    expect(esServicioInactivo(error)).toBe(esperado);
  });
});
