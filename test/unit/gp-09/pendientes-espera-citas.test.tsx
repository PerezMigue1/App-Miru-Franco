/// <reference types="jest" />

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { HojaCancelarCita } from '@/features/citas/components/HojaCancelarCita';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaCruda,
  CLIENTA_CITAS,
  DIA_CITA,
  disponibilidadesDe,
  HOY,
  ID_CITA,
  llamadasDeRuta,
  RUTA_CREAR_CITA,
  rutaCancelar,
  rutaCita,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  simularServidorReserva,
} from '../../helpers/citasFicticias';
import { ConAreaSegura } from '../../helpers/areaSegura';
import { espiarConsola } from '../../helpers/consola';
import { citaComo, conReglas, hacer, reiniciarRepositorios, servidorGestion, turnos, vecesRuta } from '../../helpers/gestionCitas';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { consentimientoRegistrado, rutasConsentimientos, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { abrirReservaVm, hacerEnReserva, hastaConfirmarReserva } from '../../helpers/reservaViewModel';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-09, pendientes del prompt 3 (bloque E1): un 429 al reservar una cita (POST /api/citas?propios=true
 * o el registro de sus casillas) y al cancelarla (PATCH .../cancelar?propios=true) muestra el message
 * del backend y deja el botón deshabilitado con "Intenta de nuevo en N s" mientras dura la espera; en
 * ese tiempo no se envía nada otra vez y al terminar se puede reintentar. Un 429 no es "sin respuesta":
 * la reserva no busca la cita en Mis citas. fetch simulado (http://api.test), datos ficticios y reloj
 * falso fijo en AHORA.
 */

const ESPERA = RESPALDO_TEXTOS['errores.esperaLimite'];
const esperaDe = (segundos: number) => ESPERA.replace('{segundos}', String(segundos));
const ALACIADO = SERVICIO_CON_ANTICIPO;

const avanzar = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});
espiarConsola(cerrarConTemporizadores, true);

/** Servidor de la reserva con la creación y el registro de casillas indicados. */
function servidorReserva(crear: Manejador, consentimientos: Manejador = consentimientoRegistrado) {
  return simularServidorReserva({
    ...rutasConsentimientos(),
    [RUTA_CONSENTIMIENTOS]: consentimientos,
    ...rutasDisponibilidad([HOY, DIA_CITA].flatMap((fecha) => disponibilidadesDe(fecha, ALACIADO))),
    [RUTA_CREAR_CITA]: crear,
  });
}

/** Respuestas en orden: cada llamada toma la siguiente y la última se repite. */
function enOrden(...salidas: Manejador[]): Manejador {
  let vez = 0;
  return (cuerpo) => {
    const salida = salidas[Math.min(vez, salidas.length - 1)];
    vez += 1;
    return salida(cuerpo);
  };
}

const citaCreada: Manejador = () => respuesta({ success: true, data: citaCruda({ id: 901, estado: 'pendiente' }) }, 201);

describe('reservar una cita con un 429', () => {
  it('al crear la cita: el message del backend, el botón en espera, sin segundo POST ni búsqueda; al terminar, reintenta', async () => {
    const llamadas = servidorReserva(enOrden(() => limite429(30), citaCreada));
    const { result } = await abrirReservaVm(ALACIADO.id);
    await hastaConfirmarReserva(result, 'salon');
    const textoNormal = result.current.textoBoton;

    await hacerEnReserva(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({ enEspera: true, textoBoton: esperaDe(30), enviando: false, revisarMisCitas: false });
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
    // Un 429 no es "sin respuesta": no se busca la cita en Mis citas.
    expect(llamadas.filter((l) => l.metodo === 'GET' && l.ruta.startsWith('/api/citas?propios=true'))).toHaveLength(0);

    // Durante la espera, confirmar no envía nada (ni las casillas).
    const casillasAntes = llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS).length;
    await hacerEnReserva(() => result.current.confirmar());
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
    expect(llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS)).toHaveLength(casillasAntes);

    await avanzar(10_000);
    expect(result.current.textoBoton).toBe(esperaDe(20));
    await avanzar(20_000);
    expect(result.current).toMatchObject({ enEspera: false, textoBoton: textoNormal });

    await hacerEnReserva(() => result.current.confirmar());
    await waitFor(() => expect(routerSimulado.replace).toHaveBeenCalledWith('/cita-confirmada/901'));
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(2);
  });

  it('al registrar las casillas: el message del backend y la espera, sin crear la cita', async () => {
    const llamadas = servidorReserva(citaCreada, () => limite429(15));
    const { result } = await abrirReservaVm(ALACIADO.id);
    await hastaConfirmarReserva(result, 'linea');

    await hacerEnReserva(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({ enEspera: true, textoBoton: esperaDe(15) });
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(0);
    await hacerEnReserva(() => result.current.confirmar());
    expect(llamadasDeRuta(llamadas, RUTA_CONSENTIMIENTOS)).toHaveLength(1);
  });

  it('otro error (400 del horario) no deja la reserva en espera', async () => {
    servidorReserva(() => respuesta({ statusCode: 400, message: 'Ese horario ya pasó.' }, 400));
    const { result } = await abrirReservaVm(ALACIADO.id);
    await hastaConfirmarReserva(result, 'salon');
    await hacerEnReserva(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).not.toBeNull());
    expect(result.current.enEspera).toBe(false);
  });
});

describe('cancelar una cita con un 429', () => {
  const PATCH = rutaCancelar();
  const SIN_ANTICIPO = conReglas(citaCruda());
  const cancelada = () => respuesta({ success: true, data: { ...SIN_ANTICIPO, estado: 'cancelada' } });

  async function abrir(cancelar: Manejador) {
    const llamadas = await servidorGestion({ [rutaCita()]: turnos(citaComo(SIN_ANTICIPO)), [PATCH]: cancelar });
    const hook = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
    return { ...hook, llamadas };
  }

  it('el message en la hoja, el botón deshabilitado con la espera y sin segundo PATCH; al terminar cancela', async () => {
    const { result, llamadas } = await abrir(enOrden(() => limite429(20), cancelada));
    await hacer(() => result.current.abrirCancelar());
    expect(result.current.textoEsperaCancelar).toBeNull();

    await hacer(() => result.current.cancelar('Cambio de planes'));
    await waitFor(() => expect(result.current.errorCancelacion).toBe(MENSAJE_LIMITE));
    expect(result.current).toMatchObject({
      textoEsperaCancelar: esperaDe(20),
      puedeConfirmarCancelacion: false,
      cancelando: false,
      hojaCancelarVisible: true,
    });

    await hacer(() => result.current.cancelar('Cambio de planes'));
    expect(vecesRuta(llamadas, PATCH)).toBe(1);

    await avanzar(20_000);
    expect(result.current).toMatchObject({ textoEsperaCancelar: null, puedeConfirmarCancelacion: true });
    await hacer(() => result.current.cancelar('Cambio de planes'));
    await waitFor(() => expect(result.current.avisoCancelada).toBe(RESPALDO_TEXTOS['citas.cancelar.toast']));
    expect(vecesRuta(llamadas, PATCH)).toBe(2);
  });
});

describe('HojaCancelarCita con la espera', () => {
  const base = {
    visible: true,
    onCerrar: jest.fn(),
    aviso: 'Cancelar no tiene costo.',
    puedeConfirmar: true,
    puedeReprogramar: false,
    cancelando: false,
    error: null,
    onCancelar: jest.fn(),
    onReprogramar: jest.fn(),
  };

  it('sin espera dice "Cancelar cita"; con espera muestra "Intenta de nuevo en N s" deshabilitado', async () => {
    const vista = await render(<HojaCancelarCita {...base} />, { wrapper: ConAreaSegura });
    expect(screen.getByRole('button', { name: 'Cancelar cita' })).toBeOnTheScreen();

    await vista.rerender(<HojaCancelarCita {...base} puedeConfirmar={false} textoEspera={esperaDe(9)} error={MENSAJE_LIMITE} />);
    const boton = screen.getByRole('button', { name: esperaDe(9) });
    expect(boton).toBeDisabled();
    expect(screen.getByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Otro' }));
    await fireEvent.press(boton);
    expect(base.onCancelar).not.toHaveBeenCalled();
  });
});
