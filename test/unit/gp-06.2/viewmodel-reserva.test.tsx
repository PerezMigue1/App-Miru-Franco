/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { fechaLegible as fechaLegibleDelModelo, REDIRECCION_ANTICIPO } from '@/features/citas/models/citaModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { useAnticipoViewModel, type AnticipoViewModel } from '@/features/citas/viewmodels/useAnticipoViewModel';
import { useCitaConfirmadaViewModel } from '@/features/citas/viewmodels/useCitaConfirmadaViewModel';
import {
  fechaLegible,
  PASOS_RESERVA,
  useReservarCitaViewModel,
  type ReservarCitaViewModel,
} from '@/features/citas/viewmodels/useReservarCitaViewModel';
import { useCandado } from '@/shared/ui/useCandado';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  citaCruda,
  CLIENTA_CITAS,
  conError,
  conPromesa,
  cuerpoCita,
  cuerpoError,
  DIA_CITA,
  DIA_SABADO,
  disponibilidadesDe,
  enHoraLocal,
  ERRORES,
  estadoAnticipoCrudo,
  HOY,
  ID_CITA,
  initPointFicticio,
  deepLinkAnticipo,
  llamadasDeRuta,
  masMinutos,
  MENSAJES_BACKEND,
  RUTA_CREAR_CITA,
  RUTA_ESPECIALISTAS,
  rutaCita,
  rutaDisponibilidad,
  rutaEstadoAnticipo,
  rutaPreferencia,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  simularServidorReserva,
  sinRedEnRuta,
  type CitaCruda,
  type CuerpoError,
  type EstadoAnticipoBackend,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { abrirSesionSimulada, navegadorRegresa } from '../../helpers/google';
import { limite429, MENSAJE_LIMITE } from '../../helpers/limitesRed';
import { ESPECIALISTA_DOS, ESPECIALISTA_UNO, especialistaCruda, imagenServicio } from '../../helpers/serviciosFicticios';
import { rutasConsentimientos } from '../../helpers/reservaFicticia';
import { respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.2 (reservar cita con anticipo), viewmodels con renderHook en caja blanca:
 * useReservarCitaViewModel (tres pasos, horarios, envío y sus errores), useAnticipoViewModel (pago
 * con Mercado Pago, regreso por deep link o por AppState y estado real) y useCitaConfirmadaViewModel,
 * más useCandado. Solo se simulan fetch (http://api.test), expo-router, useAuth, expo-web-browser,
 * AppState y BackHandler; citaModel, servicioModel y apiClient son los reales. Reloj fijo en AHORA.
 */

jest.mock('expo-router', () => {
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return simulado.expoRouterSimulado();
});
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/** El router simulado con canGoBack (lo agrega el jest.mock de arriba). */
const router = routerSimulado as typeof routerSimulado & { canGoBack: jest.Mock<boolean, []> };

const ALACIADO = SERVICIO_CON_ANTICIPO;
const CORTE = SERVICIO_SIN_ANTICIPO;
const ID_ALACIADO = String(ALACIADO.id);
const ID_CORTE = String(CORTE.id);
const UNO = ESPECIALISTA_UNO.usuarioId;
const DOS = ESPECIALISTA_DOS.usuarioId;

const ERROR_RESERVA = 'No pudimos reservar tu cita. Intenta de nuevo.';
const ERROR_HORARIOS = 'No pudimos cargar los horarios de este día.';
// GP-07.4: el plazo vencido sale del catálogo (anticipos.liberada).
const MENSAJE_VENCIDO = RESPALDO_TEXTOS['anticipos.liberada'];
const MENSAJE_NO_VIGENTE = 'Esta cita ya no está vigente.';
const MENSAJE_NO_ABRIO = 'No pudimos abrir el pago. Intenta de nuevo.';
const MENSAJE_NO_REVISO = 'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.';
const MENSAJE_SIN_NAVEGADOR =
  'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.';

const RUTA_CONFIRMADA = `/cita-confirmada/${ID_CITA}`;
const RUTA_ANTICIPO_PAGAR = `/anticipo/${ID_CITA}?pagar=1`;

/** Plazo de hoy a las 18:30 locales y su texto: sigue por venir con el reloj fijo (16:00 UTC) en UTC y en México. */
const VENCE_HOY = enHoraLocal(HOY, '18:30').toISOString();
const LIMITE_HOY = 'Paga antes de las 6:30 p. m.';
/** Plazo del martes a las 10:45 locales. */
const VENCE_MARTES = enHoraLocal(DIA_CITA, '10:45').toISOString();
const LIMITE_MARTES = 'Paga antes del martes 20 de octubre, 10:45 a. m.';

// ── Andamiaje ────────────────────────────────────────────────────────────────────────────────

/**
 * Servidor de la reserva más la disponibilidad de hoy y del sábado (alaciado y corte) y del martes
 * para el corte. Las rutas de la prueba van encima.
 */
function servidor(rutas: Record<string, Manejador> = {}): Llamada[] {
  return simularServidorReserva({
    // GP-07.4: con anticipo se registra la Política de anticipos vigente antes de crear la cita.
    ...rutasConsentimientos(),
    ...rutasDisponibilidad([
      ...disponibilidadesDe(HOY, ALACIADO),
      ...disponibilidadesDe(DIA_SABADO, ALACIADO),
      ...disponibilidadesDe(HOY, CORTE),
      ...disponibilidadesDe(DIA_CITA, CORTE),
    ]),
    ...rutas,
  });
}

const veces = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).length;

/** Cada llamada responde con la siguiente salida (la última se repite), respuestas o promesas. */
function enOrden(...salidas: (() => Salida)[]): Manejador {
  const siguiente = enSecuencia(...salidas);
  return conPromesa(() => Promise.resolve(siguiente(undefined)));
}

/** Respuesta que la prueba suelta cuando quiere. */
function enEspera(): { manejador: Manejador; soltar: (r: Response) => Promise<void> } {
  const pendiente = diferida();
  return {
    manejador: conPromesa(() => pendiente.promesa),
    soltar: async (r) => {
      await act(async () => {
        pendiente.soltar(r);
      });
    },
  };
}

const errorRespuesta = (cuerpo: CuerpoError) => () => conError(cuerpo)(undefined);
const citaComo = (cita: CitaCruda): (() => Response) => () => respuesta(cuerpoCita(cita));
const estadoComo = (estado: EstadoAnticipoBackend): (() => Response) => () => respuesta(estadoAnticipoCrudo(estado));

/** Deja correr lo pendiente con los temporizadores falsos. */
async function asentar(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) {
      await jest.advanceTimersByTimeAsync(1);
    }
  });
}

/** Oyentes de AppState registrados por el viewmodel (simulados con jest.spyOn). */
let oyentesApp: { oyente: (estado: AppStateStatus) => void; quitar: () => void }[] = [];
let quitarApp: jest.Mock;
let alQuitarApp: () => void = () => undefined;
let espiaApp: jest.SpyInstance;
/** currentState del mock de react-native (es una función): se cambia a mano y se restaura. */
const ESTADO_APP_ORIGINAL: unknown = AppState.currentState;
function fijarEstadoApp(estado: AppStateStatus | unknown): void {
  (AppState as { currentState: unknown }).currentState = estado;
}
let atras: ReturnType<typeof espiarAtras>;

async function emitirApp(estado: AppStateStatus): Promise<void> {
  await act(async () => {
    [...oyentesApp].forEach(({ oyente }) => oyente(estado));
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
  abrirSesionSimulada().mockReset();
  abrirSesionSimulada().mockResolvedValue({ type: 'cancel' });

  oyentesApp = [];
  quitarApp = jest.fn();
  alQuitarApp = () => undefined;
  espiaApp = jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, oyente) => {
    const registro = {
      oyente: oyente as (estado: AppStateStatus) => void,
      quitar: () => {
        quitarApp();
        oyentesApp = oyentesApp.filter((r) => r !== registro);
        alQuitarApp();
      },
    };
    oyentesApp.push(registro);
    return { remove: registro.quitar };
  });
  fijarEstadoApp('active');
  atras = espiarAtras();
});

afterEach(() => {
  espiaApp.mockRestore();
  fijarEstadoApp(ESTADO_APP_ORIGINAL);
  atras.restaurar();
});

// Ninguna prueba debe dejar avisos de act() ni errores en consola; al final se desmonta y se
// vuelve a los temporizadores reales.
espiarConsola(cerrarConTemporizadores, true);

// ── useReservarCitaViewModel ─────────────────────────────────────────────────────────────────

type Resultado<T> = { current: T };

/** Sin argumentos abre el alaciado; con un undefined explícito, la ruta sin id. */
async function abrirReserva(...args: [servicioId?: string, inicial?: string]) {
  const [servicioId, inicial] = args.length === 0 ? [ID_ALACIADO] : args;
  const hook = await renderHook(() => useReservarCitaViewModel(servicioId, inicial));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return hook;
}

async function elegirEspecialista(result: Resultado<ReservarCitaViewModel>, id = UNO): Promise<void> {
  const elegida = result.current.especialistas.find((e) => e.id === id);
  if (!elegida) throw new Error(`Sin especialista ${id}`);
  await act(async () => {
    result.current.elegirEspecialista(elegida);
  });
  await waitFor(() => expect(result.current.estadoHorarios).not.toBe('cargando'));
}

async function elegirDia(result: Resultado<ReservarCitaViewModel>, dia: string): Promise<void> {
  await act(async () => {
    result.current.elegirDia(dia);
  });
  await waitFor(() => expect(result.current.estadoHorarios).not.toBe('cargando'));
}

async function elegirPrimerHorario(result: Resultado<ReservarCitaViewModel>, indice = 0): Promise<void> {
  const slot = result.current.disponibilidad?.slots[indice];
  if (!slot) throw new Error('Sin horarios');
  await act(async () => {
    result.current.elegirHorario(slot);
  });
}

/** Especialista UNO, el martes y su primer horario: queda en el paso 3. */
async function hastaConfirmar(result: Resultado<ReservarCitaViewModel>, id = UNO, dia = DIA_CITA): Promise<void> {
  await elegirEspecialista(result, id);
  await elegirDia(result, dia);
  await elegirPrimerHorario(result);
}

/**
 * GP-07.4: elige cómo pagar el anticipo y marca la Política de anticipos (sin anticipo no cambian
 * nada), como haría la clienta antes del botón final.
 */
async function prepararConfirmar(result: Resultado<ReservarCitaViewModel>, modo: 'linea' | 'salon'): Promise<void> {
  await act(async () => {
    result.current.elegirOpcion(modo);
    result.current.cambiarAceptaPolitica(true);
  });
}

async function confirmar(result: Resultado<ReservarCitaViewModel>, modo: 'linea' | 'salon' = 'linea'): Promise<void> {
  await prepararConfirmar(result, modo);
  await act(async () => {
    result.current.confirmar();
  });
}

describe('useReservarCitaViewModel: carga', () => {
  it('vuelve a exportar fechaLegible del modelo y nombra los tres pasos', () => {
    expect(fechaLegible).toBe(fechaLegibleDelModelo);
    expect(fechaLegible(DIA_CITA)).toBe('martes 20 de octubre');
    expect(PASOS_RESERVA).toEqual(['Especialista', 'Día y hora', 'Confirmar']);
  });

  it('empieza cargando y queda listo en el paso 1 con las especialistas de la agenda', async () => {
    const espera = enEspera();
    const llamadas = servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: espera.manejador });
    const hook = await renderHook(() => useReservarCitaViewModel(ID_ALACIADO));
    expect(hook.result.current.estado).toBe('cargando');
    await espera.soltar(respuesta({ success: true, data: ALACIADO }));
    await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
    const vm = hook.result.current;
    expect(vm.servicio?.id).toBe(ALACIADO.id);
    expect(vm.especialistas.map((e) => e.id)).toEqual([UNO, DOS]);
    expect(vm).toMatchObject({
      paso: 1,
      direccion: 1,
      especialista: null,
      fecha: null,
      slot: null,
      estadoHorarios: 'inactivo',
      disponibilidad: null,
      errorHorarios: '',
      horarioOcupado: false,
      enviando: false,
      modoEnvio: null,
      errorEnvio: null,
      mesVisible: { anio: 2026, mes: 9 },
    });
    expect(veces(llamadas, `GET /api/servicios/${ID_ALACIADO}`)).toBe(1);
    expect(veces(llamadas, RUTA_ESPECIALISTAS)).toBe(1);
  });

  it.each([
    ['vacío', ''],
    ['con espacios', '   '],
    ['sin valor', undefined],
  ])('id %s: noEncontrado sin pedir nada; verServicios va al catálogo', async (_caso, id) => {
    const llamadas = servidor();
    const { result } = await abrirReserva(id);
    expect(result.current.estado).toBe('noEncontrado');
    expect(result.current.servicio).toBeNull();
    expect(llamadas).toHaveLength(0);
    await act(async () => {
      result.current.verServicios();
    });
    expect(router.replace).toHaveBeenCalledWith('/citas');
  });

  it('servicio 404: noEncontrado', async () => {
    servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: conError(cuerpoError(404, 'Servicio no encontrado')) });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('noEncontrado');
  });

  it('servicio inactivo: noEncontrado', async () => {
    servidor({
      [`GET /api/servicios/${ID_ALACIADO}`]: () => respuesta({ success: true, data: { ...ALACIADO, activo: false } }),
    });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('noEncontrado');
    expect(result.current.servicio).toBeNull();
  });

  it.each<[string, Manejador]>([
    ['un 500', conError(ERRORES.interno)],
    ['sin red', sinRedEnRuta],
  ])('servicio con %s: error, y recargar sí carga después', async (_caso, falla) => {
    const llamadas = servidor({
      [`GET /api/servicios/${ID_ALACIADO}`]: enOrden(() => falla(undefined), () => respuesta({ success: true, data: ALACIADO })),
    });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('error');
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(veces(llamadas, `GET /api/servicios/${ID_ALACIADO}`)).toBe(2);
  });

  it('la agenda falla y el servicio no trae especialistas propias: error', async () => {
    servidor({ [RUTA_ESPECIALISTAS]: conError(ERRORES.interno) });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('error');
    expect(result.current.servicio).toBeNull();
  });

  it('la agenda falla y el servicio solo trae especialistas sin id: error', async () => {
    servidor({
      [RUTA_ESPECIALISTAS]: sinRedEnRuta,
      [`GET /api/servicios/${ID_ALACIADO}`]: () =>
        respuesta({ success: true, data: { ...ALACIADO, especialistas: [{ nombre: 'Persona sin id' }] } }),
    });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('error');
  });

  it('la agenda falla pero el servicio trae sus especialistas: bastan esas, sin especialidades', async () => {
    servidor({
      [RUTA_ESPECIALISTAS]: conError(ERRORES.interno),
      [`GET /api/servicios/${ID_ALACIADO}`]: () =>
        respuesta({ success: true, data: { ...ALACIADO, especialistas: [especialistaCruda(21, 2, ESPECIALISTA_UNO)] } }),
    });
    const { result } = await abrirReserva();
    expect(result.current.estado).toBe('listo');
    expect(result.current.especialistas).toEqual([
      { id: UNO, nombre: ESPECIALISTA_UNO.nombre, foto: undefined, especialidades: [] },
    ]);
  });

  it('las especialistas del servicio se cruzan con la agenda (puesto, especialidades y foto)', async () => {
    const fotoPropia = imagenServicio('foto-propia-dos');
    const fuera = { usuarioId: 'especialista-fuera-de-agenda', nombre: 'Especialista Fuera De Agenda' };
    servidor({
      [`GET /api/servicios/${ID_ALACIADO}`]: () =>
        respuesta({
          success: true,
          data: {
            ...ALACIADO,
            especialistas: [
              especialistaCruda(21, 2, ESPECIALISTA_UNO),
              { ...especialistaCruda(22, 2, ESPECIALISTA_DOS), foto: fotoPropia },
              especialistaCruda(23, 2, fuera),
              { nombre: 'Persona sin id' },
            ],
          },
        }),
    });
    const { result } = await abrirReserva();
    const [uno, dos, tercera] = result.current.especialistas;
    expect(result.current.especialistas).toHaveLength(3);
    // UNO trae foto, puesto y especialidades de la agenda.
    expect(uno).toMatchObject({ id: UNO, puesto: 'Estilista', especialidades: ['Corte', 'Color'] });
    expect(uno.foto).toMatch(/^https:/);
    // DOS no tiene foto en la agenda: se queda la del servicio.
    expect(dos).toMatchObject({ id: DOS, foto: fotoPropia, especialidades: [] });
    // La que no está en la agenda se queda con lo del servicio y sin especialidades.
    expect(tercera).toEqual({ id: fuera.usuarioId, nombre: fuera.nombre, foto: undefined, especialidades: [] });
  });

  it.each<[string, Response, Response, string]>([
    ['la primera llega tarde con éxito', respuesta(cuerpoError(500, 'x'), 500), respuesta({ success: true, data: ALACIADO }), 'error'],
    ['la primera llega tarde con error', respuesta({ success: true, data: ALACIADO }), respuesta(cuerpoError(404, 'x'), 404), 'listo'],
  ])('recargar dos veces: solo escribe la última (%s)', async (_caso, ultima, tardia, esperado) => {
    const primera = enEspera();
    const segunda = enEspera();
    let vez = 0;
    servidor({
      [`GET /api/servicios/${ID_ALACIADO}`]: (cuerpo) => {
        vez += 1;
        if (vez === 1) return respuesta({ success: true, data: ALACIADO });
        return (vez === 2 ? primera : segunda).manejador(cuerpo);
      },
    });
    const { result } = await abrirReserva();
    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    await segunda.soltar(ultima);
    await waitFor(() => expect(result.current.estado).toBe(esperado));
    await primera.soltar(tardia);
    await asentar();
    expect(result.current.estado).toBe(esperado);
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta({ success: true, data: ALACIADO })],
    ['con error', () => respuesta(cuerpoError(500, 'x'), 500)],
  ])('desmontar mientras carga: la respuesta tardía (%s) no escribe nada', async (_caso, tardia) => {
    const espera = enEspera();
    servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: espera.manejador });
    const hook = await renderHook(() => useReservarCitaViewModel(ID_ALACIADO));
    await hook.unmount();
    await espera.soltar(tardia());
    await asentar();
    expect(hook.result.current.estado).toBe('cargando');
  });
});

describe('useReservarCitaViewModel: especialista inicial ("Reservar lo mismo")', () => {
  it('válida: arranca en Día y hora con ella y los horarios de hoy', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva(ID_ALACIADO, ` ${DOS} `);
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current).toMatchObject({ paso: 2, direccion: 1, fecha: HOY });
    expect(result.current.especialista?.id).toBe(DOS);
    expect(veces(llamadas, rutaDisponibilidad(DOS, HOY, ALACIADO.id))).toBe(1);
    // Atrás regresa al paso de especialista para cambiarla.
    await act(async () => {
      result.current.atras();
    });
    expect(result.current.paso).toBe(1);
  });

  it.each([
    ['que no es del servicio', 'especialista-que-no-existe'],
    ['vacía', '   '],
  ])('%s: se queda en el paso 1', async (_caso, inicial) => {
    const llamadas = servidor();
    const { result } = await abrirReserva(ID_ALACIADO, inicial);
    expect(result.current.paso).toBe(1);
    expect(result.current.especialista).toBeNull();
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it('se aplica una sola vez: recargar en el paso 1 no vuelve a saltar al paso 2', async () => {
    servidor();
    const { result } = await abrirReserva(ID_ALACIADO, UNO);
    await waitFor(() => expect(result.current.paso).toBe(2));
    await act(async () => {
      result.current.atras();
    });
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.paso).toBe(1);
  });
});

describe('useReservarCitaViewModel: paso 1 Especialista', () => {
  it('elegir especialista pasa a Día y hora con hoy y sus horarios', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    expect(result.current).toMatchObject({ paso: 2, direccion: 1, fecha: HOY, estadoHorarios: 'listo', slot: null });
    expect(result.current.disponibilidad?.abierto).toBe(true);
    expect(result.current.disponibilidad?.slots.length).toBeGreaterThan(0);
    expect(veces(llamadas, rutaDisponibilidad(UNO, HOY, ALACIADO.id))).toBe(1);
  });

  it('antes de cargar el servicio no hace nada', async () => {
    const espera = enEspera();
    const llamadas = servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: espera.manejador });
    const hook = await renderHook(() => useReservarCitaViewModel(ID_ALACIADO));
    await asentar();
    await act(async () => {
      hook.result.current.elegirEspecialista({ id: UNO, nombre: ESPECIALISTA_UNO.nombre, especialidades: [] });
    });
    expect(hook.result.current.paso).toBe(1);
    expect(hook.result.current.especialista).toBeNull();
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
    await espera.soltar(respuesta({ success: true, data: ALACIADO }));
    await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  });

  it('la misma especialista con horarios listos conserva día y horario sin volver a pedir', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    await elegirDia(result, DIA_CITA);
    await act(async () => {
      result.current.atras();
    });
    await elegirEspecialista(result);
    expect(result.current).toMatchObject({ paso: 2, fecha: DIA_CITA, estadoHorarios: 'listo' });
    expect(veces(llamadas, rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id))).toBe(1);
  });

  it('la misma especialista con error en horarios los vuelve a pedir', async () => {
    const llamadas = servidor({
      [rutaDisponibilidad(UNO, HOY, ALACIADO.id)]: enOrden(errorRespuesta(ERRORES.interno), () =>
        respuesta(disponibilidadesDe(HOY, ALACIADO)[0]),
      ),
    });
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    expect(result.current.estadoHorarios).toBe('error');
    await act(async () => {
      result.current.atras();
    });
    await elegirEspecialista(result);
    expect(result.current.estadoHorarios).toBe('listo');
    expect(veces(llamadas, rutaDisponibilidad(UNO, HOY, ALACIADO.id))).toBe(2);
  });

  it('otra especialista limpia día y horario y vuelve a hoy, en el mes actual', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await act(async () => {
      result.current.cambiarMes(1);
    });
    await act(async () => {
      result.current.atras();
    });
    await act(async () => {
      result.current.atras();
    });
    expect(result.current.paso).toBe(1);
    await elegirEspecialista(result, DOS);
    expect(result.current).toMatchObject({ paso: 2, fecha: HOY, slot: null, mesVisible: { anio: 2026, mes: 9 } });
    expect(result.current.especialista?.id).toBe(DOS);
    expect(veces(llamadas, rutaDisponibilidad(DOS, HOY, ALACIADO.id))).toBe(1);
  });
});

describe('useReservarCitaViewModel: paso 2 Día y hora', () => {
  it('elegirDia pide los horarios de ese día', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    await elegirDia(result, DIA_CITA);
    expect(result.current).toMatchObject({ fecha: DIA_CITA, estadoHorarios: 'listo', slot: null });
    expect(veces(llamadas, rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id))).toBe(1);
  });

  it('el mismo día, un día pasado o sin especialista no piden nada', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    const disponibilidades = () => llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad')).length;
    await act(async () => {
      result.current.elegirDia(DIA_CITA);
    });
    expect(result.current.fecha).toBeNull();
    expect(disponibilidades()).toBe(0);

    await elegirEspecialista(result);
    expect(disponibilidades()).toBe(1);
    await act(async () => {
      result.current.elegirDia(HOY);
    });
    await act(async () => {
      result.current.elegirDia('2026-10-18');
    });
    expect(result.current.fecha).toBe(HOY);
    expect(disponibilidades()).toBe(1);
  });

  it('sin servicio (carga con error) elegirDia y recargarHorarios no hacen nada', async () => {
    const llamadas = servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: conError(ERRORES.interno) });
    const { result } = await abrirReserva();
    await act(async () => {
      result.current.elegirDia(DIA_CITA);
      result.current.recargarHorarios();
    });
    expect(result.current.fecha).toBeNull();
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it('cambiarMes nunca va antes del mes actual y cambia de año', async () => {
    servidor();
    const { result } = await abrirReserva();
    const mover = async (delta: 1 | -1) => {
      await act(async () => {
        result.current.cambiarMes(delta);
      });
    };
    await mover(-1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 9 });
    await mover(1);
    await mover(1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 11 });
    await mover(1);
    expect(result.current.mesVisible).toEqual({ anio: 2027, mes: 0 });
    await mover(-1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 11 });
    // Cambiar el mes no cambia el día elegido.
    expect(result.current.fecha).toBeNull();
  });

  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, MENSAJE_SIN_CONEXION],
    ['un 500', conError(ERRORES.interno), ERROR_HORARIOS],
  ])('horarios con %s: error con mensaje propio y recargarHorarios los vuelve a pedir', async (_caso, falla, mensaje) => {
    const ruta = rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id);
    const llamadas = servidor({
      [ruta]: enOrden(() => falla(undefined), () => respuesta(disponibilidadesDe(DIA_CITA, ALACIADO)[0])),
    });
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    await elegirDia(result, DIA_CITA);
    expect(result.current).toMatchObject({ estadoHorarios: 'error', errorHorarios: mensaje, disponibilidad: null });
    expect(result.current.errorHorarios).not.toContain(MENSAJES_BACKEND.interno);
    await act(async () => {
      result.current.recargarHorarios();
    });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(result.current.errorHorarios).toBe('');
    expect(veces(llamadas, ruta)).toBe(2);
  });

  it('recargarHorarios sin especialista no pide nada', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await act(async () => {
      result.current.recargarHorarios();
    });
    expect(result.current.estadoHorarios).toBe('inactivo');
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it.each<[string, () => Response, string]>([
    ['con éxito', () => respuesta(disponibilidadesDe(DIA_CITA, ALACIADO)[0]), 'listo'],
    ['con error', () => respuesta(cuerpoError(500, 'x'), 500), 'listo'],
  ])('cambiar de día rápido: la respuesta vieja que llega tarde (%s) se descarta', async (_caso, tardia, esperado) => {
    const martes = enEspera();
    servidor({ [rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id)]: martes.manejador });
    const { result } = await abrirReserva();
    await elegirEspecialista(result);
    await act(async () => {
      result.current.elegirDia(DIA_CITA);
    });
    await elegirDia(result, DIA_SABADO);
    const delSabado = result.current.disponibilidad;
    expect(result.current.fecha).toBe(DIA_SABADO);
    await martes.soltar(tardia());
    await asentar();
    expect(result.current.estadoHorarios).toBe(esperado);
    expect(result.current.disponibilidad).toBe(delSabado);
  });

  it('desmontar con los horarios en camino: la respuesta tardía no escribe nada', async () => {
    const martes = enEspera();
    servidor({ [rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id)]: martes.manejador });
    const hook = await abrirReserva();
    await elegirEspecialista(hook.result);
    await act(async () => {
      hook.result.current.elegirDia(DIA_CITA);
    });
    await hook.unmount();
    await martes.soltar(respuesta(disponibilidadesDe(DIA_CITA, ALACIADO)[0]));
    await asentar();
    expect(hook.result.current.estadoHorarios).toBe('cargando');
  });

  it('elegir horario pasa a Confirmar con ese slot', async () => {
    servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    expect(result.current).toMatchObject({ paso: 3, direccion: 1, errorEnvio: null, horarioOcupado: false });
    expect(result.current.slot).toEqual(result.current.disponibilidad?.slots[0]);
  });
});

describe('useReservarCitaViewModel: atrás y salir', () => {
  it('atras regresa del 3 al 2 y del 2 al 1, con dirección -1', async () => {
    servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await act(async () => {
      result.current.atras();
    });
    expect(result.current).toMatchObject({ paso: 2, direccion: -1 });
    await act(async () => {
      result.current.atras();
    });
    expect(result.current).toMatchObject({ paso: 1, direccion: -1 });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('en el paso 1 con historial: router.back', async () => {
    servidor();
    const { result } = await abrirReserva();
    await act(async () => {
      result.current.atras();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each<[string, string | undefined, string]>([
    ['con id', ` ${ID_ALACIADO} `, `/servicio/${ID_ALACIADO}`],
    ['con un id que se codifica', 'a b', '/servicio/a%20b'],
    ['sin id', '', '/citas'],
    ['sin valor', undefined, '/citas'],
  ])('en el paso 1 sin historial %s: reemplaza por %s', async (_caso, id, destino) => {
    router.canGoBack.mockReturnValue(false);
    servidor();
    const { result } = await abrirReserva(id);
    await act(async () => {
      result.current.atras();
    });
    expect(router.replace).toHaveBeenCalledWith(destino);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('el Atrás de Android se consume siempre y regresa un paso', async () => {
    servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    let consumido = false;
    await act(async () => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(result.current.paso).toBe(2);
    await act(async () => {
      consumido = atras.pulsar();
    });
    await act(async () => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('al desmontar quita la suscripción del Atrás de Android', async () => {
    servidor();
    const hook = await abrirReserva();
    await hook.unmount();
    expect(atras.quitar).toHaveBeenCalledTimes(1);
  });
});

describe('useReservarCitaViewModel: confirmar', () => {
  it('validaciones: sin especialista, sin horario o sin servicio no envía nada', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await confirmar(result);
    await elegirEspecialista(result);
    await confirmar(result);
    await asentar();
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(0);
    expect(result.current.enviando).toBe(false);
    expect(result.current.paso).toBe(2);
  });

  it('sin servicio cargado no envía', async () => {
    const llamadas = servidor({ [`GET /api/servicios/${ID_ALACIADO}`]: conError(ERRORES.interno) });
    const { result } = await abrirReserva();
    await confirmar(result);
    await asentar();
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(0);
  });

  it('sin clienta en sesión no envía aunque haya horario', async () => {
    const llamadas = servidor();
    const { result, rerender } = await abrirReserva();
    await hastaConfirmar(result);
    authSimulada.usuario = null;
    await rerender({});
    await confirmar(result);
    await asentar();
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(0);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('servicio con anticipo en línea: manda pagoAnticipo linea y abre el anticipo con pagar=1', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    const slot = result.current.slot;
    await act(async () => {
      result.current.setNotas('  Traer fotos de referencia  ');
    });
    await confirmar(result, 'linea');
    expect(result.current).toMatchObject({ enviando: true, modoEnvio: 'linea' });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_ANTICIPO_PAGAR));
    const [envio] = llamadasDeRuta(llamadas, RUTA_CREAR_CITA);
    expect(envio.cuerpo).toEqual({
      clienteId: CLIENTA_CITAS.id,
      especialistaId: UNO,
      servicioId: ALACIADO.id,
      fechaHoraInicio: slot?.inicio,
      fechaHoraFin: slot?.fin,
      notas: 'Traer fotos de referencia',
      pagoAnticipo: 'linea',
    });
  });

  it('servicio con anticipo en el salón (GP-06.5): hoy manda pagoAnticipo salon y va a la confirmación', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result, 'salon');
    expect(result.current.modoEnvio).toBe('salon');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo).toMatchObject({ pagoAnticipo: 'salon' });
  });

  it('en línea, pero la cita que crea el backend ya no pide anticipo: va a la confirmación', async () => {
    servidor({ [RUTA_CREAR_CITA]: () => respuesta(cuerpoCita(citaCruda()), 201) });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result, 'linea');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
  });

  it('servicio sin anticipo: no manda pagoAnticipo y va a la confirmación', async () => {
    const llamadas = servidor();
    const { result } = await abrirReserva(ID_CORTE);
    expect(result.current.servicio?.anticipo).toBeNull();
    await hastaConfirmar(result);
    await confirmar(result, 'linea');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    const cuerpo = llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo as Record<string, unknown>;
    expect(cuerpo).not.toHaveProperty('pagoAnticipo');
    expect(cuerpo).not.toHaveProperty('notas');
    expect(cuerpo.servicioId).toBe(CORTE.id);
  });

  it('doble toque: dos confirmar seguidos (y un tercero en vuelo) crean una sola cita', async () => {
    const espera = enEspera();
    const llamadas = servidor({ [RUTA_CREAR_CITA]: espera.manejador });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await prepararConfirmar(result, 'linea');
    await act(async () => {
      result.current.confirmar();
      result.current.confirmar();
    });
    await act(async () => {
      result.current.confirmar();
    });
    expect(result.current.modoEnvio).toBe('linea');
    await espera.soltar(respuesta(cuerpoCita(citaConAnticipo()), 201));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(1);
  });

  it('mientras envía, elegir especialista, día u horario y atrás no hacen nada', async () => {
    const espera = enEspera();
    const llamadas = servidor({ [RUTA_CREAR_CITA]: espera.manejador });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    const slot = result.current.slot;
    await confirmar(result);
    const otraEspecialista = result.current.especialistas[1];
    const otroSlot = result.current.disponibilidad?.slots[1];
    await act(async () => {
      result.current.elegirEspecialista(otraEspecialista);
      result.current.elegirDia(DIA_SABADO);
      if (otroSlot) result.current.elegirHorario(otroSlot);
      result.current.atras();
    });
    let consumido = false;
    await act(async () => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(result.current).toMatchObject({ paso: 3, fecha: DIA_CITA, enviando: true });
    expect(result.current.especialista?.id).toBe(UNO);
    expect(result.current.slot).toBe(slot);
    expect(veces(llamadas, rutaDisponibilidad(UNO, DIA_SABADO, ALACIADO.id))).toBe(0);
    await espera.soltar(respuesta(cuerpoCita(citaConAnticipo()), 201));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it('400 de horario ocupado (no 409): regresa al paso 2 con horarioOcupado y recarga la disponibilidad', async () => {
    expect(ERRORES.horarioOcupado.statusCode).toBe(400);
    expect(MENSAJES_BACKEND.horarioOcupado).toMatch(/^El especialista ya tiene una cita en ese horario \(cita #\d+\)$/);
    const rutaMartes = rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id);
    const llamadas = servidor({
      [RUTA_CREAR_CITA]: enOrden(errorRespuesta(ERRORES.horarioOcupado), () =>
        respuesta(cuerpoCita(citaConAnticipo()), 201),
      ),
    });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result);
    await waitFor(() => expect(result.current.horarioOcupado).toBe(true));
    expect(result.current).toMatchObject({ paso: 2, direccion: -1, slot: null, enviando: false, errorEnvio: null });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    expect(veces(llamadas, rutaMartes)).toBe(2);
    // Elegir otro horario quita el aviso y deja confirmar de nuevo.
    await elegirPrimerHorario(result, 1);
    expect(result.current).toMatchObject({ paso: 3, horarioOcupado: false });
    await confirmar(result);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_ANTICIPO_PAGAR));
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(2);
  });

  it('elegir otro día después del horario ocupado quita el aviso', async () => {
    servidor({ [RUTA_CREAR_CITA]: conError(ERRORES.horarioOcupado) });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result);
    await waitFor(() => expect(result.current.horarioOcupado).toBe(true));
    await waitFor(() => expect(result.current.estadoHorarios).toBe('listo'));
    await elegirDia(result, DIA_SABADO);
    expect(result.current.horarioOcupado).toBe(false);
  });

  it.each<[string, CuerpoError]>([
    ['un 409 cualquiera', cuerpoError(409, 'Conflicto ficticio del servidor')],
    ['un 500', ERRORES.interno],
    ['un 422 de validación', ERRORES.validacion],
    ['un 400 que no es del anticipo', ERRORES.horarioPasado],
  ])('%s: mensaje genérico, sin el texto técnico, y se queda en Confirmar', async (_caso, error) => {
    servidor({ [RUTA_CREAR_CITA]: conError(error) });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result);
    await waitFor(() => expect(result.current.errorEnvio).toBe(ERROR_RESERVA));
    expect(result.current).toMatchObject({ paso: 3, enviando: false, horarioOcupado: false });
    const tecnico = Array.isArray(error.message) ? error.message.join(', ') : error.message;
    expect(result.current.errorEnvio).not.toContain(tecnico);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each<[string, CuerpoError]>([
    ['sin tiempo para el anticipo', ERRORES.sinTiempoAnticipo],
    ['sin tiempo para pagar en el salón', ERRORES.sinTiempoSalon],
    ['otra cita por pagar en el salón', ERRORES.unaPorPagarEnSalon],
    ['solo en línea', ERRORES.soloEnLinea],
    ['corrección GP-06.2: anticipo en línea no disponible', ERRORES.anticipoEnLineaNoDisponible],
  ])('400 del anticipo (%s): el mensaje del backend se muestra tal cual', async (_caso, error) => {
    servidor({ [RUTA_CREAR_CITA]: conError(error) });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result, 'salon');
    await waitFor(() => expect(result.current.errorEnvio).toBe(error.message));
    expect(result.current).toMatchObject({ paso: 3, enviando: false, modoEnvio: null });
  });

  it('el mensaje nuevo de anticipo en línea no disponible es el que manda el backend', () => {
    expect(ERRORES.anticipoEnLineaNoDisponible).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'El pago del anticipo en línea no está disponible por ahora. Elige pagarlo en el salón.',
    });
  });

  it('sin red: mensaje de sin conexión; reintentar sí crea la cita', async () => {
    const llamadas = servidor({
      [RUTA_CREAR_CITA]: enOrden(
        () => sinRedEnRuta(undefined),
        () => respuesta(cuerpoCita(citaConAnticipo()), 201),
      ),
    });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result);
    await waitFor(() => expect(result.current.errorEnvio).toBe(MENSAJE_SIN_CONEXION));
    expect(result.current.enviando).toBe(false);
    // Regresar al paso 2 limpia el error; volver a elegir el horario y reintentar.
    await act(async () => {
      result.current.atras();
    });
    expect(result.current.errorEnvio).toBeNull();
    await elegirPrimerHorario(result);
    await confirmar(result);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_ANTICIPO_PAGAR));
    expect(veces(llamadas, RUTA_CREAR_CITA)).toBe(2);
  });

  it('elegir especialista limpia el error del envío', async () => {
    servidor({ [RUTA_CREAR_CITA]: conError(ERRORES.interno) });
    const { result } = await abrirReserva();
    await hastaConfirmar(result);
    await confirmar(result);
    await waitFor(() => expect(result.current.errorEnvio).toBe(ERROR_RESERVA));
    await act(async () => {
      result.current.atras();
    });
    await act(async () => {
      result.current.atras();
    });
    await elegirEspecialista(result);
    expect(result.current.errorEnvio).toBeNull();
  });

  it.each<[string, () => Response]>([
    ['con la cita creada', () => respuesta(cuerpoCita(citaConAnticipo()), 201)],
    ['con error', () => respuesta(ERRORES.horarioOcupado, 400)],
  ])('desmontar mientras envía: la respuesta tardía (%s) no navega ni escribe', async (_caso, tardia) => {
    const espera = enEspera();
    const llamadas = servidor({ [RUTA_CREAR_CITA]: espera.manejador });
    const hook = await abrirReserva();
    await hastaConfirmar(hook.result);
    await confirmar(hook.result);
    await hook.unmount();
    await espera.soltar(tardia());
    await asentar();
    expect(router.replace).not.toHaveBeenCalled();
    expect(hook.result.current.enviando).toBe(true);
    expect(veces(llamadas, rutaDisponibilidad(UNO, DIA_CITA, ALACIADO.id))).toBe(1);
  });
});

// ── useCandado ───────────────────────────────────────────────────────────────────────────────

describe('useCandado', () => {
  it('ignora las llamadas mientras la acción corre y se suelta aunque la acción falle', async () => {
    const { result } = await renderHook(() => useCandado());
    let fallar: (error: Error) => void = () => undefined;
    const primera = jest.fn(
      () =>
        new Promise<void>((_resolver, rechazar) => {
          fallar = rechazar;
        }),
    );
    const segunda = jest.fn(() => Promise.resolve());
    await act(async () => {
      result.current(primera);
      result.current(segunda);
    });
    expect(primera).toHaveBeenCalledTimes(1);
    expect(segunda).not.toHaveBeenCalled();
    await act(async () => {
      fallar(new Error('Fallo ficticio de la acción'));
    });
    await act(async () => {
      result.current(segunda);
    });
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});

// ── useAnticipoViewModel ─────────────────────────────────────────────────────────────────────

/** Sin argumentos abre la cita ficticia; con un undefined explícito, la ruta sin id. */
async function abrirAnticipo(...args: [id?: string, pagar?: boolean, revisar?: boolean]) {
  const [id, pagar = false, revisar = false] = args.length === 0 ? [String(ID_CITA)] : args;
  const hook = await renderHook(() => useAnticipoViewModel(id, pagar, revisar));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return hook;
}

/**
 * Toca el botón principal. GP-07.4: pagar con el botón pide antes la casilla de la Política de
 * anticipos (y registra el consentimiento con rutasConsentimientos), así que se marca primero.
 */
async function accion(result: Resultado<AnticipoViewModel>): Promise<void> {
  await act(async () => {
    result.current.casilla.cambiar(true);
  });
  await act(async () => {
    result.current.accionPrincipal();
  });
}

/** La cita con anticipo pendiente y plazo de hoy a las 18:30 locales. */
const CITA_PENDIENTE = citaConAnticipo({ anticipoVenceEn: VENCE_HOY });

describe('useAnticipoViewModel: carga', () => {
  it.each([
    ['vacío', ''],
    ['con espacios', '  '],
    ['sin valor', undefined],
  ])('id %s: noEncontrado sin pedir nada', async (_caso, id) => {
    const llamadas = servidor();
    const { result } = await abrirAnticipo(id);
    expect(result.current).toMatchObject({ estado: 'noEncontrado', cita: null, limite: null, avisoSalon: null });
    expect(llamadas).toHaveLength(0);
    // Sin cita, la acción principal no hace nada.
    await accion(result);
    expect(llamadas).toHaveLength(0);
  });

  it('cita con anticipo pendiente: listo con el pago inicial y el plazo de hoy', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await abrirAnticipo(` ${ID_CITA} `);
    expect(result.current).toMatchObject({ estado: 'listo', pago: { tipo: 'inicial' }, limite: LIMITE_HOY, avisoSalon: null });
    expect(result.current.cita?.id).toBe(ID_CITA);
  });

  it('plazo de otro día: "Paga antes del martes ..."; sin plazo: limite null', async () => {
    servidor({ [rutaCita()]: enOrden(citaComo(citaConAnticipo({ anticipoVenceEn: VENCE_MARTES })), citaComo(citaConAnticipo({ anticipoVenceEn: null }))) });
    const { result } = await abrirAnticipo();
    expect(result.current.limite).toBe(LIMITE_MARTES);
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.limite).toBeNull();
  });

  it('404: noEncontrado', async () => {
    servidor({ [rutaCita()]: conError(ERRORES.citaNoEncontrada) });
    const { result } = await abrirAnticipo();
    expect(result.current.estado).toBe('noEncontrado');
  });

  it.each<[string, Manejador]>([
    ['un 500', conError(ERRORES.interno)],
    ['sin red', sinRedEnRuta],
  ])('%s: error, sin acción, y recargar sí carga después', async (_caso, falla) => {
    const llamadas = servidor({ [rutaCita()]: enOrden(() => falla(undefined), citaComo(CITA_PENDIENTE)) });
    const { result } = await abrirAnticipo();
    expect(result.current).toMatchObject({ estado: 'error', cita: null });
    await accion(result);
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
  });

  it.each<[string, CitaCruda]>([
    ['sin anticipo', citaCruda()],
    ['con el anticipo ya pagado', citaAnticipoPagado()],
  ])('cita %s: reemplaza por la confirmación', async (_caso, cita) => {
    servidor({ [rutaCita()]: citaComo(cita) });
    const hook = await renderHook(() => useAnticipoViewModel(String(ID_CITA), true));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(hook.result.current.estado).toBe('cargando');
    expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<CitaCruda>, string]>([
    // GP-07.4: el plazo vencido lo dice el backend con el motivo de la barrida, no el reloj del teléfono.
    ['cancelada por la barrida (anticipo_no_pagado)', { estado: 'cancelada', motivoCancelacion: 'anticipo_no_pagado' }, MENSAJE_VENCIDO],
    ['cancelada por la clienta con el plazo vencido', { estado: 'cancelada', anticipoVenceEn: masMinutos(AHORA, -1).toISOString() }, MENSAJE_NO_VIGENTE],
    ['cancelada con plazo por venir', { estado: 'cancelada', anticipoVenceEn: masMinutos(AHORA, 30).toISOString() }, MENSAJE_NO_VIGENTE],
    ['cancelada sin plazo', { estado: 'cancelada', anticipoVenceEn: null }, MENSAJE_NO_VIGENTE],
    ['completada', { estado: 'completada' }, MENSAJE_NO_VIGENTE],
    ['no asistió', { estado: 'no_asistio' }, MENSAJE_NO_VIGENTE],
  ])('%s: cerrada, no abre el pago y la acción va a Mis citas', async (_caso, cambios, mensaje) => {
    const llamadas = servidor({ [rutaCita()]: citaComo(citaConAnticipo(cambios)) });
    const { result } = await abrirAnticipo(String(ID_CITA), true);
    expect(result.current.pago).toEqual({ tipo: 'cerrada', mensaje });
    await asentar();
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
    await accion(result);
    expect(router.replace).toHaveBeenCalledWith('/mis-citas');
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
  });

  it('recargar dos veces: solo escribe la última respuesta', async () => {
    const primera = enEspera();
    const segunda = enEspera();
    let vez = 0;
    servidor({
      [rutaCita()]: (cuerpo) => {
        vez += 1;
        if (vez === 1) return respuesta(cuerpoCita(CITA_PENDIENTE));
        return (vez === 2 ? primera : segunda).manejador(cuerpo);
      },
    });
    const { result } = await abrirAnticipo();
    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    await segunda.soltar(respuesta(ERRORES.interno, 500));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    await primera.soltar(respuesta(cuerpoCita(CITA_PENDIENTE)));
    await asentar();
    expect(result.current.estado).toBe('error');
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoCita(CITA_PENDIENTE))],
    ['con error', () => respuesta(ERRORES.interno, 500)],
  ])('desmontar mientras carga: la respuesta tardía (%s) no escribe ni navega', async (_caso, tardia) => {
    const espera = enEspera();
    servidor({ [rutaCita()]: espera.manejador });
    const hook = await renderHook(() => useAnticipoViewModel(String(ID_CITA), true));
    await hook.unmount();
    await espera.soltar(tardia());
    await asentar();
    expect(hook.result.current.estado).toBe('cargando');
    expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  });

  it('regresar: back con historial, Mis citas sin él; verMisCitas reemplaza', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await abrirAnticipo();
    await act(async () => {
      result.current.regresar();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    router.canGoBack.mockReturnValue(false);
    await act(async () => {
      result.current.regresar();
    });
    expect(router.replace).toHaveBeenLastCalledWith('/mis-citas');
    router.replace.mockClear();
    await act(async () => {
      result.current.verMisCitas();
    });
    expect(router.replace).toHaveBeenCalledWith('/mis-citas');
  });
});

describe('useAnticipoViewModel: pagar', () => {
  it('pide la preferencia, abre Mercado Pago con REDIRECCION_ANTICIPO y, al regresar por el deep link aprobado, va a la confirmación', async () => {
    expect(REDIRECCION_ANTICIPO).toBe('appmirufranco://anticipo');
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('aprobado') });
    navegadorRegresa(deepLinkAnticipo());
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
    expect(abrirSesionSimulada()).toHaveBeenCalledWith(initPointFicticio(), REDIRECCION_ANTICIPO);
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(1);
    // La espera del regreso por AppState se suelta.
    expect(quitarApp).toHaveBeenCalled();
    expect(oyentesApp).toHaveLength(0);
  });

  it('respaldo de AppState: el navegador no avisa, la app pasa a segundo plano y vuelve, y se consulta una vez', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('aprobado') });
    abrirSesionSimulada().mockReturnValueOnce(new Promise(() => undefined));
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
    expect(result.current.pago).toEqual({ tipo: 'abriendo' });
    // Activa sin haber salido: no cuenta como regreso.
    await emitirApp('active');
    await asentar();
    expect(result.current.pago).toEqual({ tipo: 'abriendo' });
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
    await emitirApp('background');
    await emitirApp('active');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(1);
  });

  it('respaldo de AppState: si la app ya no estaba activa al abrir, basta con volver a activa', async () => {
    fijarEstadoApp('background');
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('pendiente') });
    abrirSesionSimulada().mockReturnValueOnce(new Promise(() => undefined));
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
    await emitirApp('active');
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: true }));
  });

  it('el navegador no se puede abrir: error de sin navegador', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    abrirSesionSimulada().mockRejectedValueOnce(new Error('No hay navegador ficticio'));
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'error', mensaje: MENSAJE_SIN_NAVEGADOR }));
    expect(oyentesApp).toHaveLength(0);
  });

  it('estado pendiente: noCompletado en proceso, sin límite; la acción vuelve a consultar y NO pide otra preferencia', async () => {
    const llamadas = servidor({
      [rutaCita()]: citaComo(CITA_PENDIENTE),
      [rutaEstadoAnticipo()]: enOrden(estadoComo('pendiente'), estadoComo('aprobado')),
    });
    const { result } = await abrirAnticipo();
    expect(result.current.limite).toBe(LIMITE_HOY);
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: true }));
    expect(result.current.limite).toBeNull();
    await accion(result);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(2);
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
  });

  it('estado sin_pago: noCompletado sin proceso, con "Paga antes de ..."; la acción sí pide otra preferencia', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('sin_pago') });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: false }));
    expect(result.current.limite).toBe(LIMITE_HOY);
    await accion(result);
    await waitFor(() => expect(veces(llamadas, rutaPreferencia())).toBe(2));
    await waitFor(() => expect(result.current.pago.tipo).toBe('noCompletado'));
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(2);
  });

  it('pasa por abriendo y revisando', async () => {
    const preferencia = enEspera();
    const estado = enEspera();
    servidor({
      [rutaCita()]: citaComo(CITA_PENDIENTE),
      [rutaPreferencia()]: preferencia.manejador,
      [rutaEstadoAnticipo()]: estado.manejador,
    });
    const { result } = await abrirAnticipo();
    await accion(result);
    expect(result.current.pago).toEqual({ tipo: 'abriendo' });
    await preferencia.soltar(respuesta({ initPoint: initPointFicticio() }, 201));
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'revisando' }));
    await estado.soltar(respuesta(estadoAnticipoCrudo('rechazado')));
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: false }));
  });

  it('doble toque en la acción: una sola preferencia', async () => {
    const preferencia = enEspera();
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaPreferencia()]: preferencia.manejador });
    const { result } = await abrirAnticipo();
    await act(async () => {
      result.current.accionPrincipal();
      result.current.accionPrincipal();
    });
    await accion(result);
    await preferencia.soltar(respuesta({ initPoint: initPointFicticio() }, 201));
    await waitFor(() => expect(result.current.pago.tipo).toBe('noCompletado'));
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
  });

  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, MENSAJE_SIN_CONEXION],
    ['un 500', conError(ERRORES.interno), MENSAJE_NO_ABRIO],
    ['un 409 sin motivo conocido', conError(cuerpoError(409, 'Conflicto ficticio')), MENSAJE_NO_ABRIO],
    ['un 400 de cita sin anticipo', conError(ERRORES.noPideAnticipo), MENSAJE_NO_ABRIO],
  ])('la preferencia falla con %s: error propio, sin abrir el navegador', async (_caso, falla, mensaje) => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaPreferencia()]: falla });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'error', mensaje }));
    expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  });

  it('la preferencia con 429 (GP-09): el message del backend y el botón en espera hasta su retryAfter', async () => {
    const llamadas = servidor({
      [rutaCita()]: citaComo(CITA_PENDIENTE),
      [rutaPreferencia()]: enOrden(() => limite429(3), errorRespuesta(ERRORES.interno)),
    });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'error', mensaje: MENSAJE_LIMITE }));
    expect(result.current).toMatchObject({ enEspera: true, textoEspera: 'Intenta de nuevo en 3 s' });

    // Durante la espera el botón no pide otra preferencia.
    await accion(result);
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.textoEspera).toBe('Intenta de nuevo en 2 s');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(result.current).toMatchObject({ enEspera: false, textoEspera: null });

    await accion(result);
    await waitFor(() => expect(veces(llamadas, rutaPreferencia())).toBe(2));
    expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  });

  it('la preferencia sin initPoint https: no pudimos abrir el pago', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaPreferencia()]: () => respuesta({ initPoint: 'http://pago.test/x' }, 201) });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'error', mensaje: MENSAJE_NO_ABRIO }));
  });

  describe.each<[string, (falla: Manejador) => Record<string, Manejador>]>([
    ['en la preferencia', (falla) => ({ [rutaPreferencia()]: falla })],
    ['en el estado', (falla) => ({ [rutaEstadoAnticipo()]: falla })],
  ])('409 %s', (_donde, rutas) => {
    it('pagado: va a la confirmación', async () => {
      servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), ...rutas(conError(ERRORES.anticipoPagado)) });
      const { result } = await abrirAnticipo();
      await accion(result);
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    });

    it.each<[string, CuerpoError, string]>([
      ['vencido', ERRORES.plazoTerminado, MENSAJE_VENCIDO],
      ['noVigente', ERRORES.citaNoVigente, MENSAJE_NO_VIGENTE],
    ])('%s: cerrada y la acción va a Mis citas', async (_motivo, error, mensaje) => {
      const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), ...rutas(conError(error)) });
      const { result } = await abrirAnticipo();
      await accion(result);
      await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'cerrada', mensaje }));
      const preferencias = veces(llamadas, rutaPreferencia());
      await accion(result);
      expect(router.replace).toHaveBeenCalledWith('/mis-citas');
      expect(veces(llamadas, rutaPreferencia())).toBe(preferencias);
    });
  });

  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, MENSAJE_SIN_CONEXION],
    ['un 500', conError(ERRORES.interno), MENSAJE_NO_REVISO],
  ])('el estado falla con %s: errorRevision; la acción vuelve a consultar sin pedir preferencia', async (_caso, falla, mensaje) => {
    const llamadas = servidor({
      [rutaCita()]: citaComo(CITA_PENDIENTE),
      [rutaEstadoAnticipo()]: enOrden(() => falla(undefined), () => respuesta(estadoAnticipoCrudo('aprobado'))),
    });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'errorRevision', mensaje }));
    await accion(result);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(2);
  });
});

describe('useAnticipoViewModel: abrir con ?pagar=1 o ?retorno=mp', () => {
  it('sin pagar ni retorno en la ruta: no abre Mercado Pago ni consulta el estado solo', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await renderHook(() => useAnticipoViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await asentar();
    expect(result.current.pago).toEqual({ tipo: 'inicial' });
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
  });

  it('pagarAlAbrir abre Mercado Pago una sola vez, aunque se recargue', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await abrirAnticipo(String(ID_CITA), true);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: false }));
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await asentar();
    expect(result.current.pago).toEqual({ tipo: 'inicial' });
    expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1);
    expect(veces(llamadas, rutaPreferencia())).toBe(1);
  });

  it('revisarAlAbrir consulta el estado una sola vez, sin pedir preferencia', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('pendiente') });
    const { result } = await abrirAnticipo(String(ID_CITA), false, true);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: true }));
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await asentar();
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(1);
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
  });

  it('revisarAlAbrir con estado aprobado va a la confirmación', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estadoComo('aprobado') });
    await renderHook(() => useAnticipoViewModel(String(ID_CITA), false, true));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
  });

  it('revisarAlAbrir con la cita cerrada no consulta', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(citaConAnticipo({ estado: 'completada' })) });
    const { result } = await abrirAnticipo(String(ID_CITA), false, true);
    await asentar();
    expect(result.current.pago.tipo).toBe('cerrada');
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
  });

  it('cita sin id: ni pagarAlAbrir ni revisarAlAbrir ni la acción piden nada', async () => {
    const sinId: Partial<CitaCruda> = { id: undefined as unknown as number };
    const llamadas = servidor({ [rutaCita()]: citaComo(citaConAnticipo(sinId)) });
    const { result } = await abrirAnticipo(String(ID_CITA), true, true);
    expect(result.current.cita?.id).toBe('');
    await accion(result);
    await asentar();
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
  });
});

describe('useAnticipoViewModel: desmontar a mitad del pago', () => {
  it.each<[string, () => Response]>([
    ['con la preferencia', () => respuesta({ initPoint: initPointFicticio() }, 201)],
    ['con un error de la preferencia', () => respuesta(ERRORES.interno, 500)],
  ])('la preferencia llega tarde (%s): no abre el navegador ni escribe', async (_caso, tardia) => {
    const preferencia = enEspera();
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaPreferencia()]: preferencia.manejador });
    const hook = await abrirAnticipo();
    await accion(hook.result);
    await hook.unmount();
    await preferencia.soltar(tardia());
    await asentar();
    expect(abrirSesionSimulada()).not.toHaveBeenCalled();
    expect(hook.result.current.pago).toEqual({ tipo: 'abriendo' });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('con el navegador abierto: suelta la espera y no consulta el estado', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    abrirSesionSimulada().mockReturnValueOnce(new Promise(() => undefined));
    const hook = await abrirAnticipo();
    await accion(hook.result);
    await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
    await hook.unmount();
    await asentar();
    expect(quitarApp).toHaveBeenCalled();
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('el navegador falla justo al cerrar la pantalla: no escribe el error', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    let fallarNavegador: (error: Error) => void = () => undefined;
    abrirSesionSimulada().mockReturnValueOnce(
      new Promise((_resolver, rechazar) => {
        fallarNavegador = rechazar;
      }),
    );
    const hook = await abrirAnticipo();
    await accion(hook.result);
    await waitFor(() => expect(abrirSesionSimulada()).toHaveBeenCalledTimes(1));
    // Al soltar la espera (desmontaje), el navegador rechaza antes de que la espera se cumpla.
    alQuitarApp = () => fallarNavegador(new Error('Navegador ficticio cerrado'));
    await hook.unmount();
    await asentar();
    expect(hook.result.current.pago).toEqual({ tipo: 'abriendo' });
  });

  it.each<[string, () => Response]>([
    ['con el estado', () => respuesta(estadoAnticipoCrudo('aprobado'))],
    ['con un error del estado', () => respuesta(ERRORES.interno, 500)],
  ])('el estado llega tarde (%s): no navega ni escribe', async (_caso, tardia) => {
    const estado = enEspera();
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estado.manejador });
    const hook = await abrirAnticipo();
    await accion(hook.result);
    await waitFor(() => expect(hook.result.current.pago).toEqual({ tipo: 'revisando' }));
    await hook.unmount();
    await estado.soltar(tardia());
    await asentar();
    expect(router.replace).not.toHaveBeenCalled();
    expect(hook.result.current.pago).toEqual({ tipo: 'revisando' });
  });
});

describe('useAnticipoViewModel: anticipo en el salón (GP-06.5, solo lo que hoy decide el código)', () => {
  const CITA_SALON = citaConAnticipo({ anticipoEnSalon: true, anticipoVenceEn: VENCE_MARTES });
  const AVISO_MARTES =
    'Paga tu anticipo en el salón antes del martes 20 de octubre, 10:45 a. m. (15 minutos antes de tu cita). También puedes pagarlo en línea.';

  it('pendiente en el salón: avisoSalon con el plazo y sin limite', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_SALON) });
    const { result } = await abrirAnticipo();
    expect(result.current.avisoSalon).toBe(AVISO_MARTES);
    expect(result.current.limite).toBeNull();
  });

  it('en el salón sin plazo: aviso genérico de 15 minutos antes', async () => {
    servidor({ [rutaCita()]: citaComo(citaConAnticipo({ anticipoEnSalon: true, anticipoVenceEn: null })) });
    const { result } = await abrirAnticipo();
    expect(result.current.avisoSalon).toBe(
      'Paga tu anticipo en el salón a más tardar 15 minutos antes de tu cita. También puedes pagarlo en línea.',
    );
  });

  it('en el salón con el pago en proceso: sin aviso ni limite', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_SALON), [rutaEstadoAnticipo()]: estadoComo('pendiente') });
    const { result } = await abrirAnticipo();
    await accion(result);
    await waitFor(() => expect(result.current.pago).toEqual({ tipo: 'noCompletado', enProceso: true }));
    expect(result.current.avisoSalon).toBeNull();
    expect(result.current.limite).toBeNull();
  });

  it('en el salón con la cita cerrada: sin aviso', async () => {
    servidor({ [rutaCita()]: citaComo({ ...CITA_SALON, estado: 'completada' }) });
    const { result } = await abrirAnticipo();
    expect(result.current.pago.tipo).toBe('cerrada');
    expect(result.current.avisoSalon).toBeNull();
  });

  it('en línea: sin aviso del salón', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await abrirAnticipo();
    expect(result.current.avisoSalon).toBeNull();
  });
});

// ── useCitaConfirmadaViewModel ───────────────────────────────────────────────────────────────

/** Sin argumentos abre la cita ficticia; con un undefined explícito, la ruta sin id. */
async function abrirConfirmada(...args: [id?: string]) {
  const [id] = args.length === 0 ? [String(ID_CITA)] : args;
  const hook = await renderHook(() => useCitaConfirmadaViewModel(id));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return hook;
}

describe('useCitaConfirmadaViewModel', () => {
  it.each([
    ['vacío', ''],
    ['sin valor', undefined],
  ])('id %s: noEncontrado sin pedir nada; pagarAnticipo no navega', async (_caso, id) => {
    const llamadas = servidor();
    const { result } = await abrirConfirmada(id);
    expect(result.current).toMatchObject({ estado: 'noEncontrado', cita: null, anticipo: 'noAplica' });
    expect(llamadas).toHaveLength(0);
    await act(async () => {
      result.current.pagarAnticipo();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('404: noEncontrado', async () => {
    servidor({ [rutaCita()]: conError(ERRORES.citaNoEncontrada) });
    const { result } = await abrirConfirmada();
    expect(result.current.estado).toBe('noEncontrado');
  });

  it('500: error, y recargar sí carga después', async () => {
    servidor({ [rutaCita()]: enOrden(errorRespuesta(ERRORES.interno), citaComo(citaCruda())) });
    const { result } = await abrirConfirmada();
    expect(result.current).toMatchObject({ estado: 'error', cita: null });
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
  });

  it('sin anticipo: noAplica, sin consultar el estado', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(citaCruda()) });
    const { result } = await abrirConfirmada();
    expect(result.current).toMatchObject({ estado: 'listo', anticipo: 'noAplica', limite: null, avisoSalon: null });
    expect(veces(llamadas, rutaEstadoAnticipo(ID_CITA))).toBe(0);
  });

  it('anticipo ya pagado: pagado, sin consultar el estado', async () => {
    const llamadas = servidor({ [rutaCita()]: citaComo(citaAnticipoPagado()) });
    const { result } = await abrirConfirmada();
    expect(result.current).toMatchObject({ anticipo: 'pagado', limite: null });
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
  });

  it.each<[string, Manejador, string, string | null]>([
    ['aprobado', estadoComo('aprobado'), 'pagado', null],
    ['pendiente (en revisión)', estadoComo('pendiente'), 'enRevision', null],
    ['sin_pago', estadoComo('sin_pago'), 'pendiente', LIMITE_HOY],
    ['con error del estado', conError(ERRORES.interno), 'pendiente', LIMITE_HOY],
  ])('pendiente con estado real %s: %s', async (_caso, estado, anticipo, limite) => {
    const llamadas = servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE), [rutaEstadoAnticipo()]: estado });
    const { result } = await abrirConfirmada();
    expect(result.current).toMatchObject({ estado: 'listo', anticipo, limite, avisoSalon: null });
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(1);
  });

  it('pendiente sin plazo: limite null', async () => {
    servidor({ [rutaCita()]: citaComo(citaConAnticipo({ anticipoVenceEn: null })) });
    const { result } = await abrirConfirmada();
    expect(result.current).toMatchObject({ anticipo: 'pendiente', limite: null });
  });

  it('pendiente en el salón (GP-06.5): avisoSalon y sin limite', async () => {
    servidor({ [rutaCita()]: citaComo(citaConAnticipo({ anticipoEnSalon: true, anticipoVenceEn: VENCE_MARTES })) });
    const { result } = await abrirConfirmada();
    expect(result.current.limite).toBeNull();
    expect(result.current.avisoSalon).toBe(
      'Paga tu anticipo en el salón antes del martes 20 de octubre, 10:45 a. m. (15 minutos antes de tu cita). También puedes pagarlo en línea.',
    );
  });

  it('pagarAnticipo: doble toque navega una sola vez al anticipo con pagar=1', async () => {
    servidor({ [rutaCita()]: citaComo(CITA_PENDIENTE) });
    const { result } = await abrirConfirmada();
    await act(async () => {
      result.current.pagarAnticipo();
      result.current.pagarAnticipo();
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(RUTA_ANTICIPO_PAGAR);
  });

  it('pagarAnticipo con una cita sin id no navega', async () => {
    servidor({ [rutaCita()]: citaComo(citaCruda({ id: undefined as unknown as number })) });
    const { result } = await abrirConfirmada();
    expect(result.current.cita?.id).toBe('');
    await act(async () => {
      result.current.pagarAnticipo();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('verMisCitas reemplaza por Mis citas y volverAlInicio usa dismissTo', async () => {
    servidor({ [rutaCita()]: citaComo(citaCruda()) });
    const { result } = await abrirConfirmada();
    await act(async () => {
      result.current.verMisCitas();
    });
    expect(router.replace).toHaveBeenCalledWith('/mis-citas');
    await act(async () => {
      result.current.volverAlInicio();
    });
    expect(router.dismissTo).toHaveBeenCalledWith('/inicio');
  });

  it('el Atrás de Android lleva al inicio y se consume; al desmontar se quita', async () => {
    servidor({ [rutaCita()]: citaComo(citaCruda()) });
    const hook = await abrirConfirmada();
    let consumido = false;
    await act(async () => {
      consumido = atras.pulsar();
    });
    expect(consumido).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledWith('/inicio');
    expect(router.back).not.toHaveBeenCalled();
    await hook.unmount();
    expect(atras.quitar).toHaveBeenCalled();
  });

  it('recargar dos veces: solo escribe la última respuesta', async () => {
    const primera = enEspera();
    const segunda = enEspera();
    let vez = 0;
    servidor({
      [rutaCita()]: (cuerpo) => {
        vez += 1;
        if (vez === 1) return respuesta(cuerpoCita(citaCruda()));
        return (vez === 2 ? primera : segunda).manejador(cuerpo);
      },
    });
    const { result } = await abrirConfirmada();
    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    await segunda.soltar(respuesta(cuerpoCita(citaAnticipoPagado())));
    await waitFor(() => expect(result.current.anticipo).toBe('pagado'));
    await primera.soltar(respuesta(ERRORES.citaNoEncontrada, 404));
    await asentar();
    expect(result.current).toMatchObject({ estado: 'listo', anticipo: 'pagado' });
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoCita(citaCruda()))],
    ['con error', () => respuesta(ERRORES.interno, 500)],
  ])('desmontar mientras carga: la respuesta tardía (%s) no escribe', async (_caso, tardia) => {
    const espera = enEspera();
    servidor({ [rutaCita()]: espera.manejador });
    const hook = await renderHook(() => useCitaConfirmadaViewModel(String(ID_CITA)));
    await hook.unmount();
    await espera.soltar(tardia());
    await asentar();
    expect(hook.result.current.estado).toBe('cargando');
  });
});
