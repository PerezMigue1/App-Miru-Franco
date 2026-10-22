/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import type { Slot } from '@/features/citas/models/citaModel';
import { useDetalleCitaViewModel, type DetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { useMisCitasViewModel, type Cita, type MisCitasViewModel } from '@/features/citas/viewmodels/useMisCitasViewModel';
import {
  useReprogramarCitaViewModel,
  type ReprogramarCitaViewModel,
} from '@/features/citas/viewmodels/useReprogramarCitaViewModel';

import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AYER,
  CITA_CON_ANTICIPO,
  CITA_CON_ANTICIPO_NORMALIZADA,
  citaAnticipoPagado,
  citaCancelada,
  citaConAnticipo,
  citaNormalizada,
  CLIENTA_CITAS,
  cuerpoCita,
  cuerpoMisCitas,
  DIA_CITA,
  DIA_SABADO,
  disponibilidadCruda,
  ERRORES,
  ERRORES_MIS_CITAS,
  HOY,
  ID_CITA,
  INICIO_CITA_ISO,
  isoMexico,
  llamadasDeRuta,
  MENSAJES_BACKEND,
  MIS_CITAS_CRUDAS,
  MOTIVO_CANCELACION,
  PAGADO_EN_ISO,
  pagoCrudo,
  RETENIDO_EN_ISO,
  RUTA_MIS_CITAS,
  rutaCancelar,
  rutaCita,
  rutaDisponibilidad,
  rutaReprogramar,
  rutasDisponibilidad,
  simularServidorMisCitas,
  TEXTOS_MIS_CITAS,
  usarRelojFijo,
  type CitaCruda,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { rutasConsentimientos } from '../../helpers/reservaFicticia';
import { espiarConsola } from '../../helpers/consola';
import { cuerpoLista, ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  reiniciarSimulaciones,
  routerSimulado,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.3 (Mis citas), viewmodels con renderHook: useMisCitasViewModel (lista, recargas, pull to
 * refresh, sesión y "Reservar lo mismo"), useDetalleCitaViewModel (detalle, cancelar, aviso del
 * anticipo y navegación) y useReprogramarCitaViewModel (día inicial, horarios y confirmar). Solo se
 * simulan fetch (http://api.test), expo-router (con un enfoque que la prueba repite a mano) y
 * useAuth; citaModel, servicioModel y apiClient son los reales. Reloj fijo en AHORA (lunes 19 de
 * octubre de 2026, 10:00 en México).
 */

jest.mock('expo-router', () => {
  const react = require('react');
  const simulado = require('../../helpers/viewmodelsAuth');
  simulado.routerSimulado.canGoBack = jest.fn(() => true);
  return {
    useRouter: () => simulado.routerSimulado,
    // Como el real: corre al montar y cuando cambia el callback; la prueba lo repite con reenfocar().
    useFocusEffect: (efecto: () => void) => {
      react.useEffect(() => {
        mockEnfocadas.add(efecto);
        efecto();
        return () => {
          mockEnfocadas.delete(efecto);
        };
      }, [efecto]);
    },
  };
});
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

/** Efectos de enfoque de las pantallas montadas (los registra el useFocusEffect simulado). */
const mockEnfocadas = new Set<() => void>();

const router = routerSimulado as typeof routerSimulado & { canGoBack: jest.Mock<boolean, []> };

const UNO = ESPECIALISTA_UNO.usuarioId;
/** Servicio de CITA_CON_ANTICIPO (alaciado). */
const SERVICIO = CITA_CON_ANTICIPO.servicioId;
const ID = String(ID_CITA);
const RUTA_DETALLE = rutaCita(ID_CITA);
const RUTA_CATALOGO = 'GET /api/servicios';
const NOVIEMBRE = '2026-11-03';

const GENERICO_LISTA = 'Algo salió mal al traer tus citas. Intenta de nuevo en un momento.';
const AVISO_REFRESCO = 'No pudimos actualizar tus citas. Desliza hacia abajo para intentar de nuevo.';
// GP-07.4: los avisos de cancelar salen del catálogo con la regla de la cita (estas citas no guardan
// reglas: las de omisión, 10 días de excepción y 5 de reembolso). Con anticipo pagado y sin
// `cancelacion` en el estado del anticipo, el aviso es el de sin datos.
const RECOMENDACION = RESPALDO_TEXTOS['citas.cancelar.sinAnticipo'];
const AVISO_PAGADO = `${obtenerTexto('citas.cancelar.anticipoSinDatos', { anticipo: '$360', diasExcepcion: 10, diasReembolso: 5 })} ${RESPALDO_TEXTOS['citas.cancelar.reprogramar']}`;
const AVISO_CANCELADA = RESPALDO_TEXTOS['citas.cancelar.toast'];
const HORARIOS_FALLARON = 'No pudimos cargar los horarios de este día.';

// ── Andamiaje ────────────────────────────────────────────────────────────────────────────────

type Turno = () => Salida;
type Ref<T> = { current: T };

const sinRed: Turno = () => Promise.reject(new TypeError('Network request failed'));
const falla = (cuerpo: CuerpoError): Turno => () => respuesta(cuerpo, cuerpo.statusCode);
const listaCon = (citas: CitaCruda[] = MIS_CITAS_CRUDAS): Turno => () => respuesta(cuerpoMisCitas(citas));
const citaComo = (cita: CitaCruda): Turno => () => respuesta(cuerpoCita(cita));

/** Cada llamada a la ruta toma el siguiente turno (el último se repite); puede ser una promesa. */
const turnos = (...salidas: Turno[]): Manejador => enSecuencia(...salidas) as unknown as Manejador;

/** Un turno que no responde hasta que la prueba lo suelta. */
function enPausa(): { turno: Turno; soltar: (r: Response) => Promise<void> } {
  const pendiente = diferida();
  return {
    turno: () => pendiente.promesa,
    soltar: (r) => act(async () => pendiente.soltar(r)),
  };
}

const veces = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).length;

/** Corre una acción del viewmodel dentro de act. */
const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

/** Deja que terminen las promesas pendientes (para revisar que algo NO cambió). */
const vaciar = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(10);
  });

/** La pantalla vuelve a quedar enfocada (al regresar de otra). */
const reenfocar = () => hacer(() => mockEnfocadas.forEach((efecto) => efecto()));

const esperarEstado = (r: Ref<{ estado: string }>, estado: string) =>
  waitFor(() => expect(r.current.estado).toBe(estado));

beforeEach(() => {
  reiniciarSimulaciones();
  router.canGoBack.mockReturnValue(true);
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

// Sin avisos de act() ni errores en consola; al final se desmonta con los temporizadores falsos y
// después usarRelojFijo vuelve a los reales.
espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

// ── useMisCitasViewModel ─────────────────────────────────────────────────────────────────────

async function abrirMisCitas(rutas: Record<string, Manejador> = {}) {
  const llamadas = simularServidorMisCitas(rutas);
  const hook = await renderHook(() => useMisCitasViewModel());
  return { ...hook, llamadas };
}

const ids = (citas: Cita[]) => citas.map((cita) => cita.id);

/** Próximas e historial de MIS_CITAS_CRUDAS ya separados y ordenados. */
const SEPARADAS = { proximas: [501, 502], historial: [504, 503] };

function separadas(vm: MisCitasViewModel) {
  return { proximas: ids(vm.proximas), historial: ids(vm.historial) };
}

describe('useMisCitasViewModel: carga', () => {
  it('primera carga: cargando y luego listo con próximas e historial separados y ordenados', async () => {
    const lista = enPausa();
    const { result, llamadas } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(lista.turno) });
    expect(result.current).toMatchObject({ estado: 'cargando', proximas: [], historial: [], mensajeError: null });
    await lista.soltar(respuesta(cuerpoMisCitas()));
    await esperarEstado(result, 'listo');
    expect(separadas(result.current)).toEqual(SEPARADAS);
    expect(result.current).toMatchObject({ mensajeError: null, avisoRefresco: null, refrescando: false });
    expect(veces(llamadas, RUTA_MIS_CITAS)).toBe(1);
    expect(veces(llamadas, RUTA_CATALOGO)).toBe(1);
  });

  it('sin citas: listo con las dos listas vacías', async () => {
    const { result } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(listaCon([])) });
    await esperarEstado(result, 'listo');
    expect(separadas(result.current)).toEqual({ proximas: [], historial: [] });
    expect(result.current.mensajeError).toBeNull();
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['un 500', falla(ERRORES.interno), GENERICO_LISTA],
  ])('%s: error con mensaje para la clienta; recargar vuelve a cargando y luego a listo', async (_caso, error, mensaje) => {
    const reintento = enPausa();
    const { result } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(error, reintento.turno) });
    await esperarEstado(result, 'error');
    expect(result.current.mensajeError).toBe(mensaje);
    expect(result.current.mensajeError).not.toContain(MENSAJES_BACKEND.interno);
    await hacer(() => result.current.recargar());
    expect(result.current).toMatchObject({ estado: 'cargando', mensajeError: null });
    await reintento.soltar(respuesta(cuerpoMisCitas()));
    await esperarEstado(result, 'listo');
    expect(separadas(result.current)).toEqual(SEPARADAS);
  });

  it('refrescar conserva la lista mientras carga y apaga refrescando al terminar', async () => {
    const refresco = enPausa();
    const { result } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(listaCon(), refresco.turno) });
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.refrescar());
    expect(result.current).toMatchObject({ estado: 'listo', refrescando: true });
    expect(separadas(result.current)).toEqual(SEPARADAS);
    await refresco.soltar(respuesta(cuerpoMisCitas([MIS_CITAS_CRUDAS[2]])));
    await waitFor(() => expect(result.current.refrescando).toBe(false));
    expect(separadas(result.current)).toEqual({ proximas: [], historial: [503] });
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['un 500', falla(ERRORES.interno), AVISO_REFRESCO],
  ])('refrescar %s: la lista se conserva con avisoRefresco; el siguiente refresco lo quita', async (_caso, error, aviso) => {
    const { result } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(listaCon(), error, listaCon()) });
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.avisoRefresco).toBe(aviso));
    expect(result.current).toMatchObject({ estado: 'listo', refrescando: false, mensajeError: null });
    expect(separadas(result.current)).toEqual(SEPARADAS);
    await hacer(() => result.current.refrescar());
    await waitFor(() => expect(result.current.avisoRefresco).toBeNull());
    expect(result.current.refrescando).toBe(false);
  });

  it('al volver a enfocar recarga en silencio; si esa recarga falla, la lista se queda sin aviso', async () => {
    const silenciosa = enPausa();
    const { result, llamadas } = await abrirMisCitas({
      [RUTA_MIS_CITAS]: turnos(listaCon(), silenciosa.turno, sinRed),
    });
    await esperarEstado(result, 'listo');
    await reenfocar();
    expect(result.current).toMatchObject({ estado: 'listo', refrescando: false });
    expect(separadas(result.current)).toEqual(SEPARADAS);
    await silenciosa.soltar(respuesta(cuerpoMisCitas([MIS_CITAS_CRUDAS[1]])));
    await waitFor(() => expect(ids(result.current.proximas)).toEqual([502]));
    await reenfocar();
    await vaciar();
    expect(veces(llamadas, RUTA_MIS_CITAS)).toBe(3);
    expect(result.current).toMatchObject({ estado: 'listo', avisoRefresco: null, mensajeError: null });
    expect(ids(result.current.proximas)).toEqual([502]);
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoMisCitas())],
    ['con error', () => respuesta(ERRORES.interno, 500)],
  ])('una respuesta vieja que llega tarde (%s) no pisa a la nueva, ni la lista ni el catálogo', async (_caso, tardia) => {
    const lista = enPausa();
    const catalogo = enPausa();
    const { result } = await abrirMisCitas({
      [RUTA_MIS_CITAS]: turnos(lista.turno, listaCon([MIS_CITAS_CRUDAS[2]])),
      [RUTA_CATALOGO]: turnos(catalogo.turno, () => respuesta(cuerpoLista([]))),
    });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    const [completada] = result.current.historial;
    expect(ids(result.current.historial)).toEqual([503]);
    await lista.soltar(tardia());
    await catalogo.soltar(respuesta(cuerpoLista()));
    await vaciar();
    expect(result.current.estado).toBe('listo');
    expect(separadas(result.current)).toEqual({ proximas: [], historial: [503] });
    expect(result.current.puedeReservarIgual(completada)).toBe(false);
  });
});

describe('useMisCitasViewModel: sesión', () => {
  it('sin sesión no pide nada y recargar o refrescar no hacen nada', async () => {
    authSimulada.estado = 'anonimo';
    authSimulada.usuario = null;
    const { result, llamadas } = await abrirMisCitas();
    await hacer(() => result.current.recargar());
    await hacer(() => result.current.refrescar());
    await vaciar();
    expect(llamadas).toHaveLength(0);
    expect(result.current).toMatchObject({ estado: 'cargando', proximas: [], historial: [], refrescando: false });
  });

  it('al cerrar sesión limpia lo cargado y descarta la respuesta que seguía en camino', async () => {
    const refresco = enPausa();
    const { result, rerender } = await abrirMisCitas({ [RUTA_MIS_CITAS]: turnos(listaCon(), refresco.turno) });
    await esperarEstado(result, 'listo');
    const [cancelada] = result.current.historial;
    expect(result.current.puedeReservarIgual(cancelada)).toBe(true);
    await hacer(() => result.current.refrescar());
    authSimulada.estado = 'anonimo';
    await rerender({});
    await refresco.soltar(respuesta(cuerpoMisCitas()));
    await vaciar();
    expect(result.current).toMatchObject({
      estado: 'cargando',
      proximas: [],
      historial: [],
      mensajeError: null,
      avisoRefresco: null,
      refrescando: false,
    });
    expect(result.current.puedeReservarIgual(cancelada)).toBe(false);
  });
});

describe('useMisCitasViewModel: navegación y "Reservar lo mismo"', () => {
  it.each<[string, string | number, string]>([
    ['número', ID_CITA, `/cita/${ID_CITA}`],
    ['texto que se codifica', 'a/b c', '/cita/a%2Fb%20c'],
  ])('abrirCita con id %s navega al detalle', async (_caso, id, destino) => {
    const { result } = await abrirMisCitas();
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.abrirCita(citaNormalizada({ id })));
    expect(router.push).toHaveBeenCalledWith(destino);
  });

  it('con el catálogo (GET /api/servicios) solo ofrece reservar lo mismo si el servicio sigue activo', async () => {
    const { result } = await abrirMisCitas();
    await esperarEstado(result, 'listo');
    const [cancelada, completada] = result.current.historial;
    await waitFor(() => expect(result.current.puedeReservarIgual(completada)).toBe(true));
    expect(result.current.puedeReservarIgual(cancelada)).toBe(true);
    // El servicio 5 del catálogo está inactivo; sin servicio no hay nada que reservar.
    expect(result.current.puedeReservarIgual(citaNormalizada({ servicioId: 5 }))).toBe(false);
    expect(result.current.puedeReservarIgual(citaNormalizada({ servicioId: '' }))).toBe(false);
  });

  it('sin catálogo (falla) la lista se muestra igual y no ofrece reservar lo mismo', async () => {
    const { result } = await abrirMisCitas({ [RUTA_CATALOGO]: turnos(falla(ERRORES.interno)) });
    await esperarEstado(result, 'listo');
    await vaciar();
    expect(separadas(result.current)).toEqual(SEPARADAS);
    expect([...result.current.proximas, ...result.current.historial].some(result.current.puedeReservarIgual)).toBe(
      false,
    );
  });

  it.each<[string, Partial<Cita>, string | null]>([
    ['con especialista', { servicioId: 1 }, `/reservar/1?especialistaId=${encodeURIComponent(UNO)}`],
    ['sin especialista', { servicioId: 1, especialistaId: '' }, '/reservar/1'],
    ['con ids que se codifican', { servicioId: 'a b', especialistaId: 'x/y' }, '/reservar/a%20b?especialistaId=x%2Fy'],
    ['sin servicio', { servicioId: '' }, null],
  ])('reservarIgual %s', async (_caso, cambios, destino) => {
    const { result } = await abrirMisCitas();
    await esperarEstado(result, 'listo');
    await hacer(() => result.current.reservarIgual(citaNormalizada(cambios)));
    if (destino) {
      expect(router.push).toHaveBeenCalledWith(destino);
    } else {
      expect(router.push).not.toHaveBeenCalled();
    }
  });
});

// ── useDetalleCitaViewModel ──────────────────────────────────────────────────────────────────

/** Con id null abre la ruta sin id. */
async function abrirDetalle(rutas: Record<string, Manejador> = {}, id: string | null = ID) {
  const llamadas = simularServidorMisCitas(rutas);
  const hook = await renderHook(() => useDetalleCitaViewModel(id ?? undefined));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}

/** Abre la hoja y cancela con el motivo (por omisión, MOTIVO_CANCELACION con espacios de más). */
async function cancelarCon(r: Ref<DetalleCitaViewModel>, motivo = `  ${MOTIVO_CANCELACION}  `): Promise<void> {
  await hacer(() => r.current.abrirCancelar());
  await hacer(() => r.current.cancelar(motivo));
}

const PATCH_CANCELAR = rutaCancelar(ID_CITA);

describe('useDetalleCitaViewModel: carga', () => {
  it('cargando y luego listo con la cita normalizada', async () => {
    const detalle = enPausa();
    simularServidorMisCitas({ [RUTA_DETALLE]: turnos(detalle.turno) });
    const { result } = await renderHook(() => useDetalleCitaViewModel(` ${ID} `));
    expect(result.current).toMatchObject({ estado: 'cargando', cita: null, avisoCancelacion: '' });
    await detalle.soltar(respuesta(cuerpoCita()));
    await esperarEstado(result, 'listo');
    expect(result.current.cita).toEqual(CITA_CON_ANTICIPO_NORMALIZADA);
    expect(result.current).toMatchObject({ hojaCancelarVisible: false, cancelando: false, avisoCancelada: null });
  });

  it.each<[string, string, Turno]>([
    ['404', 'noEncontrado', falla(ERRORES_MIS_CITAS.citaNoEncontrada)],
    ['un 500', 'error', falla(ERRORES.interno)],
    ['sin red', 'error', sinRed],
  ])('%s: estado %s sin cita; recargar la trae', async (_caso, estado, error) => {
    const { result } = await abrirDetalle({ [RUTA_DETALLE]: turnos(error, citaComo(CITA_CON_ANTICIPO)) });
    expect(result.current).toMatchObject({ estado, cita: null });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    expect(result.current.cita?.id).toBe(ID_CITA);
  });

  it.each([['vacío', ''], ['con espacios', '   '], ['sin valor', null]])(
    'id %s: noEncontrado sin pedir nada, y pagar, reprogramar o cancelar no hacen nada',
    async (_caso, id) => {
      const { result, llamadas } = await abrirDetalle({}, id);
      expect(result.current).toMatchObject({ estado: 'noEncontrado', cita: null, avisoCancelacion: '' });
      await hacer(() => result.current.pagarAnticipo());
      await hacer(() => result.current.reprogramar());
      await hacer(() => result.current.cancelar(MOTIVO_CANCELACION));
      await vaciar();
      expect(llamadas).toHaveLength(0);
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it.each<[string, Turno, string, boolean]>([
    ['sin red deja la cita', sinRed, 'listo', true],
    ['un 404 la quita', falla(ERRORES_MIS_CITAS.citaNoEncontrada), 'noEncontrado', false],
  ])('al volver a enfocar recarga en silencio: %s', async (_caso, error, estado, conCita) => {
    const { result, llamadas } = await abrirDetalle({ [RUTA_DETALLE]: turnos(citaComo(CITA_CON_ANTICIPO), error) });
    await reenfocar();
    expect(result.current.estado).not.toBe('cargando');
    await vaciar();
    await esperarEstado(result, estado);
    expect(result.current.cita !== null).toBe(conCita);
    expect(veces(llamadas, RUTA_DETALLE)).toBe(2);
  });
});

describe('useDetalleCitaViewModel: cancelar', () => {
  it('abrir y cerrar la hoja (desistir) no envía nada', async () => {
    const { result, llamadas } = await abrirDetalle();
    await hacer(() => result.current.abrirCancelar());
    expect(result.current.hojaCancelarVisible).toBe(true);
    await hacer(() => result.current.cerrarCancelar());
    expect(result.current).toMatchObject({ hojaCancelarVisible: false, errorCancelacion: null, cancelando: false });
    expect(veces(llamadas, PATCH_CANCELAR)).toBe(0);
  });

  it('confirmar envía el motivo recortado, relee la cita y la muestra cancelada con la hoja cerrada', async () => {
    const { result, llamadas } = await abrirDetalle({
      [RUTA_DETALLE]: turnos(citaComo(CITA_CON_ANTICIPO), citaComo(citaCancelada())),
    });
    await cancelarCon(result);
    await waitFor(() => expect(result.current.avisoCancelada).toBe(AVISO_CANCELADA));
    expect(result.current).toMatchObject({
      estado: 'listo',
      hojaCancelarVisible: false,
      cancelando: false,
      errorCancelacion: null,
    });
    expect(result.current.cita).toMatchObject({ estado: 'cancelada', motivoCancelacion: MOTIVO_CANCELACION });
    expect(llamadasDeRuta(llamadas, PATCH_CANCELAR).map((l) => l.cuerpo)).toEqual([
      { motivoCancelacion: MOTIVO_CANCELACION },
    ]);
    expect(veces(llamadas, RUTA_DETALLE)).toBe(2);
  });

  it('doble toque envía un solo PATCH; mientras cancela, cerrar la hoja y reprogramar no hacen nada', async () => {
    const patch = enPausa();
    const { result, llamadas } = await abrirDetalle({ [PATCH_CANCELAR]: turnos(patch.turno) });
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => {
      result.current.cancelar(MOTIVO_CANCELACION);
      result.current.cancelar(MOTIVO_CANCELACION);
    });
    expect(result.current.cancelando).toBe(true);
    await hacer(() => result.current.cerrarCancelar());
    await hacer(() => result.current.reprogramar());
    expect(result.current.hojaCancelarVisible).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    await patch.soltar(respuesta(cuerpoCita(citaCancelada())));
    await waitFor(() => expect(result.current.hojaCancelarVisible).toBe(false));
    expect(veces(llamadas, PATCH_CANCELAR)).toBe(1);
  });

  it('un motivo vacío no envía nada', async () => {
    const { result, llamadas } = await abrirDetalle();
    await cancelarCon(result, '   ');
    await vaciar();
    expect(veces(llamadas, PATCH_CANCELAR)).toBe(0);
    expect(result.current).toMatchObject({ cancelando: false, hojaCancelarVisible: true });
  });

  it.each<[string, CuerpoError, string]>([
    ['la cita ya estaba cancelada', ERRORES_MIS_CITAS.cancelarCancelada, TEXTOS_MIS_CITAS.cancelarNoSePuede],
    ['un 500', ERRORES.interno, TEXTOS_MIS_CITAS.cancelarGenerico],
  ])('error del servidor (%s): la hoja sigue abierta con un mensaje legible', async (_caso, cuerpo, mensaje) => {
    const { result } = await abrirDetalle({ [PATCH_CANCELAR]: turnos(falla(cuerpo)) });
    await cancelarCon(result);
    await waitFor(() => expect(result.current.errorCancelacion).toBe(mensaje));
    expect(result.current.errorCancelacion).not.toContain(String(cuerpo.message));
    expect(result.current).toMatchObject({ hojaCancelarVisible: true, cancelando: false, avisoCancelada: null });
    expect(result.current.cita?.estado).toBe('pendiente');
    // Cerrar la hoja borra el error.
    await hacer(() => result.current.cerrarCancelar());
    expect(result.current).toMatchObject({ hojaCancelarVisible: false, errorCancelacion: null });
  });

  it('si la relectura falla tras cancelar, muestra la cita como cancelada con el motivo', async () => {
    const { result } = await abrirDetalle({ [RUTA_DETALLE]: turnos(citaComo(CITA_CON_ANTICIPO), sinRed) });
    await cancelarCon(result);
    await waitFor(() => expect(result.current.avisoCancelada).toBe(AVISO_CANCELADA));
    expect(result.current.cita).toEqual({
      ...CITA_CON_ANTICIPO_NORMALIZADA,
      estado: 'cancelada',
      motivoCancelacion: MOTIVO_CANCELACION,
    });
    expect(result.current.hojaCancelarVisible).toBe(false);
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoCita(citaCancelada()))],
    ['con error', () => respuesta(ERRORES.interno, 500)],
  ])('desmontar mientras cancela: la respuesta tardía (%s) no escribe nada', async (_caso, tardia) => {
    const patch = enPausa();
    const { result, unmount } = await abrirDetalle({ [PATCH_CANCELAR]: turnos(patch.turno) });
    await cancelarCon(result);
    await unmount();
    await patch.soltar(tardia());
    await vaciar();
    expect(result.current).toMatchObject({ cancelando: true, avisoCancelada: null, errorCancelacion: null });
  });
});

describe('useDetalleCitaViewModel: aviso de cancelación', () => {
  const aprobado = pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO });

  it.each<[string, CitaCruda, string]>([
    ['anticipo pagado: no se devuelve, con el monto', citaAnticipoPagado(), AVISO_PAGADO],
    [
      'pago aprobado en revisión: también dice que se pagó',
      citaConAnticipo({ pagos: [aprobado, pagoCrudo({ id: 802, estado: 'en_revision' })] }),
      AVISO_PAGADO,
    ],
    ['sin pago: recomienda reprogramar', CITA_CON_ANTICIPO, RECOMENDACION],
    [
      'anticipo retenido: no dice que se pagó',
      citaAnticipoPagado({ pagos: [pagoCrudo({ estado: 'aprobado', pagadoEn: PAGADO_EN_ISO, retenidoEn: RETENIDO_EN_ISO })] }),
      RECOMENDACION,
    ],
    [
      'anticipo reembolsado: no dice que se pagó',
      citaConAnticipo({ pagos: [aprobado, pagoCrudo({ id: 802, estado: 'reembolsado' })] }),
      RECOMENDACION,
    ],
  ])('%s', async (_caso, cita, aviso) => {
    const { result } = await abrirDetalle({ [RUTA_DETALLE]: turnos(citaComo(cita)) });
    // El aviso con anticipo pagado se decide al abrir la hoja, con la política del backend.
    await hacer(() => result.current.abrirCancelar());
    await waitFor(() => expect(result.current.avisoCancelacion).toBe(aviso));
  });
});

describe('useDetalleCitaViewModel: navegación', () => {
  // GP-07.4: pagar pide la casilla de la política y registra el consentimiento; después abre el pago,
  // que lanza Mercado Pago solo (?pagar=1).
  it('pagarAnticipo abre el anticipo una sola vez aunque se toque dos veces; al volver se puede de nuevo', async () => {
    const { result } = await abrirDetalle(rutasConsentimientos());
    await hacer(() => result.current.casilla.cambiar(true));
    await hacer(() => {
      result.current.pagarAnticipo();
      result.current.pagarAnticipo();
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledWith(`/anticipo/${ID_CITA}?pagar=1`);
    await reenfocar();
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(2));
  });

  it('reprogramar abre la reprogramación una vez y cierra la hoja de cancelar', async () => {
    const { result } = await abrirDetalle();
    await hacer(() => result.current.abrirCancelar());
    await hacer(() => result.current.reprogramar());
    await hacer(() => result.current.reprogramar());
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/cita/${ID_CITA}/reprogramar`);
    expect(result.current.hojaCancelarVisible).toBe(false);
  });

  it.each<[string, boolean]>([
    ['con pantalla anterior regresa', true],
    ['sin pantalla anterior va a Mis citas', false],
  ])('regresar %s; verMisCitas siempre reemplaza por Mis citas', async (_caso, hayAnterior) => {
    router.canGoBack.mockReturnValue(hayAnterior);
    const { result } = await abrirDetalle();
    await hacer(() => result.current.regresar());
    expect(router.back).toHaveBeenCalledTimes(hayAnterior ? 1 : 0);
    expect(router.replace).toHaveBeenCalledTimes(hayAnterior ? 0 : 1);
    await hacer(() => result.current.verMisCitas());
    expect(router.replace).toHaveBeenLastCalledWith('/mis-citas');
  });
});

// ── useReprogramarCitaViewModel ──────────────────────────────────────────────────────────────

const horariosDe = (fecha: string) => rutaDisponibilidad(UNO, fecha, SERVICIO);
/** Disponibilidad abierta de la especialista para el alaciado en los días que usan las pruebas. */
const RUTAS_HORARIOS = rutasDisponibilidad([HOY, DIA_CITA, DIA_SABADO, NOVIEMBRE].map((fecha) => disponibilidadCruda({ fecha })));
const PATCH_REPROGRAMAR = rutaReprogramar(ID_CITA);

async function abrirReprogramar(opciones: { cita?: CitaCruda; rutas?: Record<string, Manejador>; id?: string } = {}) {
  const cita = opciones.cita ?? CITA_CON_ANTICIPO;
  const llamadas = simularServidorMisCitas({
    ...RUTAS_HORARIOS,
    [rutaCita(cita.id)]: turnos(citaComo(cita)),
    ...opciones.rutas,
  });
  const id = 'id' in opciones ? opciones.id : String(cita.id);
  const hook = await renderHook(() => useReprogramarCitaViewModel(id));
  await waitFor(() => expect(hook.result.current.estado).not.toBe('cargando'));
  return { ...hook, llamadas };
}

const horariosListos = (r: Ref<ReprogramarCitaViewModel>) =>
  waitFor(() => expect(r.current.estadoHorarios).toBe('listo'));

function horario(r: Ref<ReprogramarCitaViewModel>, indice = 0): Slot {
  const slot = r.current.disponibilidad?.slots[indice];
  if (!slot) throw new Error(`Sin horario ${indice}`);
  return slot;
}

/** Abre la cita del martes con sus horarios y elige el primero. */
async function conHorarioElegido(rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirReprogramar({ rutas });
  await horariosListos(abierta.result);
  const slot = horario(abierta.result);
  await hacer(() => abierta.result.current.elegirHorario(slot));
  return { ...abierta, slot };
}

const conInicio = (fecha: string, hora = '12:00') => citaConAnticipo({ fechaHoraInicio: isoMexico(fecha, hora) });

describe('useReprogramarCitaViewModel: carga', () => {
  it.each<[string, CitaCruda, string, number, number]>([
    ['la cita es mañana: su día', CITA_CON_ANTICIPO, DIA_CITA, 9, 4],
    ['la cita es hoy más tarde: hoy', conInicio(HOY), HOY, 9, 5],
    ['la cita es el mes siguiente: su día y su mes', conInicio(NOVIEMBRE), NOVIEMBRE, 10, 5],
  ])('%s, y pide su disponibilidad', async (_caso, cita, dia, mes, ofrecidos) => {
    const { result, llamadas } = await abrirReprogramar({ cita });
    expect(result.current).toMatchObject({ estado: 'listo', fecha: dia, mesVisible: { anio: 2026, mes }, slot: null });
    await horariosListos(result);
    expect(veces(llamadas, horariosDe(dia))).toBe(1);
    expect(result.current.disponibilidad?.slots).toHaveLength(ofrecidos);
    expect(result.current.errorHorarios).toBe('');
  });

  it('el horario que la cita ya tiene no se ofrece ni se puede elegir', async () => {
    const { result } = await abrirReprogramar();
    await horariosListos(result);
    expect(result.current.disponibilidad?.slots.map((s) => s.inicio)).not.toContain(INICIO_CITA_ISO);
    const actual = disponibilidadCruda().slots.find((s) => s.inicio === INICIO_CITA_ISO);
    expect(actual).toBeDefined();
    if (actual) await hacer(() => result.current.elegirHorario(actual));
    expect(result.current.slot).toBeNull();
  });

  it.each<[string, CitaCruda]>([
    ['completada', citaConAnticipo({ estado: 'completada' })],
    ['cancelada', citaCancelada()],
    ['sin especialista', citaConAnticipo({ especialistaId: '' })],
    // Como la web: una cita que ya empezó (o sin inicio legible) no se reprograma aunque siga pendiente.
    ['que ya pasó', conInicio(AYER)],
    ['sin inicio legible', citaConAnticipo({ fechaHoraInicio: '' })],
  ])('cita %s: sinCambios sin pedir horarios', async (_caso, cita) => {
    const { result, llamadas } = await abrirReprogramar({ cita });
    expect(result.current.estado).toBe('sinCambios');
    expect(result.current.cita).not.toBeNull();
    expect(result.current.estadoHorarios).toBe('inactivo');
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toHaveLength(0);
  });

  it.each<[string, string, Turno]>([
    ['404', 'noEncontrado', falla(ERRORES_MIS_CITAS.citaNoEncontrada)],
    ['un 500', 'error', falla(ERRORES.interno)],
  ])('%s: estado %s; recargar la trae con sus horarios', async (_caso, estado, error) => {
    const { result } = await abrirReprogramar({ rutas: { [RUTA_DETALLE]: turnos(error, citaComo(CITA_CON_ANTICIPO)) } });
    expect(result.current).toMatchObject({ estado, cita: null, estadoHorarios: 'inactivo' });
    await hacer(() => result.current.recargar());
    await esperarEstado(result, 'listo');
    await horariosListos(result);
  });

  it('id vacío: noEncontrado; nada pide ni envía, y regresar sin pantalla anterior va a Mis citas', async () => {
    router.canGoBack.mockReturnValue(false);
    const { result, llamadas } = await abrirReprogramar({ id: '  ' });
    expect(result.current.estado).toBe('noEncontrado');
    await hacer(() => {
      result.current.elegirDia(DIA_SABADO);
      result.current.recargarHorarios();
      result.current.confirmar();
    });
    await vaciar();
    expect(llamadas).toHaveLength(0);
    expect(result.current.fecha).toBeNull();
    await hacer(() => result.current.regresar());
    expect(router.replace).toHaveBeenCalledWith('/mis-citas');
  });
});

describe('useReprogramarCitaViewModel: día, mes y horarios', () => {
  it('elegirDia cambia el día, limpia el horario y pide la nueva disponibilidad; el mismo día o uno pasado no', async () => {
    const { result, llamadas } = await conHorarioElegido();
    expect(result.current.slot).not.toBeNull();
    await hacer(() => result.current.elegirDia(DIA_SABADO));
    expect(result.current).toMatchObject({ fecha: DIA_SABADO, slot: null, errorEnvio: null });
    await horariosListos(result);
    await hacer(() => result.current.elegirDia(DIA_SABADO));
    await hacer(() => result.current.elegirDia(AYER));
    await vaciar();
    expect(result.current.fecha).toBe(DIA_SABADO);
    expect(veces(llamadas, horariosDe(DIA_SABADO))).toBe(1);
    expect(veces(llamadas, horariosDe(AYER))).toBe(0);
  });

  it('cambiarMes no deja ir antes del mes actual y no cambia el día elegido', async () => {
    const { result } = await abrirReprogramar();
    const mover = (delta: 1 | -1) => hacer(() => result.current.cambiarMes(delta));
    await mover(-1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 9 });
    await mover(1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 10 });
    await mover(-1);
    await mover(-1);
    expect(result.current.mesVisible).toEqual({ anio: 2026, mes: 9 });
    expect(result.current.fecha).toBe(DIA_CITA);
  });

  it.each<[string, Turno, string]>([
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
    ['un 500', falla(ERRORES.interno), HORARIOS_FALLARON],
  ])('horarios %s: error con mensaje propio y recargarHorarios los trae', async (_caso, error, mensaje) => {
    const { result, llamadas } = await abrirReprogramar({
      rutas: { [horariosDe(DIA_CITA)]: turnos(error, () => respuesta(disponibilidadCruda())) },
    });
    await waitFor(() => expect(result.current.estadoHorarios).toBe('error'));
    expect(result.current).toMatchObject({ errorHorarios: mensaje, disponibilidad: null });
    await hacer(() => result.current.recargarHorarios());
    await horariosListos(result);
    expect(result.current.errorHorarios).toBe('');
    expect(veces(llamadas, horariosDe(DIA_CITA))).toBe(2);
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(disponibilidadCruda())],
    ['con error', () => respuesta(ERRORES.interno, 500)],
  ])('los horarios viejos que llegan tarde (%s) no pisan los del día nuevo', async (_caso, tardia) => {
    const martes = enPausa();
    const { result } = await abrirReprogramar({ rutas: { [horariosDe(DIA_CITA)]: turnos(martes.turno) } });
    await hacer(() => result.current.elegirDia(DIA_SABADO));
    await horariosListos(result);
    const delSabado = result.current.disponibilidad;
    await martes.soltar(tardia());
    await vaciar();
    expect(result.current).toMatchObject({ fecha: DIA_SABADO, estadoHorarios: 'listo', errorHorarios: '' });
    expect(result.current.disponibilidad).toBe(delSabado);
  });
});

describe('useReprogramarCitaViewModel: confirmar', () => {
  it.each<[string, boolean]>([
    ['con pantalla anterior regresa', true],
    ['sin pantalla anterior va al detalle', false],
  ])('éxito: envía el horario elegido y %s', async (_caso, hayAnterior) => {
    router.canGoBack.mockReturnValue(hayAnterior);
    const { result, llamadas, slot } = await conHorarioElegido();
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(router.back.mock.calls.length + router.replace.mock.calls.length).toBe(1));
    if (hayAnterior) {
      expect(router.back).toHaveBeenCalledTimes(1);
    } else {
      expect(router.replace).toHaveBeenCalledWith(`/cita/${ID_CITA}`);
    }
    expect(llamadasDeRuta(llamadas, PATCH_REPROGRAMAR).map((l) => l.cuerpo)).toEqual([
      { fechaHoraInicio: slot.inicio, fechaHoraFin: slot.fin },
    ]);
  });

  it('sin horario elegido no envía nada', async () => {
    const { result, llamadas } = await abrirReprogramar();
    await hacer(() => result.current.confirmar());
    await vaciar();
    expect(veces(llamadas, PATCH_REPROGRAMAR)).toBe(0);
    expect(result.current.enviando).toBe(false);
  });

  it('horario ocupado (400, no 409): avisa, limpia el horario, recarga la disponibilidad y deja elegir otro', async () => {
    expect(ERRORES.horarioOcupado).toMatchObject({ statusCode: 400, message: MENSAJES_BACKEND.horarioOcupado });
    const { result, llamadas } = await conHorarioElegido({
      [PATCH_REPROGRAMAR]: turnos(falla(ERRORES.horarioOcupado), citaComo(CITA_CON_ANTICIPO)),
    });
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(TEXTOS_MIS_CITAS.horarioOcupado));
    expect(result.current).toMatchObject({ slot: null, enviando: false });
    await horariosListos(result);
    expect(veces(llamadas, horariosDe(DIA_CITA))).toBe(2);
    const otro = horario(result, 1);
    await hacer(() => result.current.elegirHorario(otro));
    expect(result.current).toMatchObject({ slot: otro, errorEnvio: null });
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(llamadasDeRuta(llamadas, PATCH_REPROGRAMAR).map((l) => l.cuerpo)).toEqual([
      expect.anything(),
      { fechaHoraInicio: otro.inicio, fechaHoraFin: otro.fin },
    ]);
  });

  it.each<[string, Turno, string]>([
    ['la cita ya no admite cambios', falla(ERRORES_MIS_CITAS.reprogramarCompletada), TEXTOS_MIS_CITAS.reprogramarNoSePuede],
    ['sin red', sinRed, TEXTOS_MIS_CITAS.sinConexion],
  ])('otro error (%s): mensaje legible, conserva el horario y no recarga', async (_caso, error, mensaje) => {
    const { result, llamadas, slot } = await conHorarioElegido({ [PATCH_REPROGRAMAR]: turnos(error) });
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(result.current.errorEnvio).toBe(mensaje));
    expect(result.current).toMatchObject({ slot, enviando: false, estadoHorarios: 'listo' });
    expect(veces(llamadas, horariosDe(DIA_CITA))).toBe(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('doble toque envía un solo PATCH; mientras envía no sale ni cambia día u horario', async () => {
    const patch = enPausa();
    const { result, llamadas, slot } = await conHorarioElegido({ [PATCH_REPROGRAMAR]: turnos(patch.turno) });
    const otro = horario(result, 1);
    await hacer(() => {
      result.current.confirmar();
      result.current.confirmar();
    });
    expect(result.current.enviando).toBe(true);
    await hacer(() => {
      result.current.regresar();
      result.current.elegirDia(DIA_SABADO);
      result.current.elegirHorario(otro);
    });
    expect(result.current).toMatchObject({ fecha: DIA_CITA, slot, enviando: true });
    expect(router.back).not.toHaveBeenCalled();
    await patch.soltar(respuesta(cuerpoCita(CITA_CON_ANTICIPO)));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(veces(llamadas, PATCH_REPROGRAMAR)).toBe(1);
  });

  it.each<[string, () => Response]>([
    ['con éxito', () => respuesta(cuerpoCita(CITA_CON_ANTICIPO))],
    ['con horario ocupado', () => respuesta(ERRORES.horarioOcupado, 400)],
  ])('desmontar mientras envía: la respuesta tardía (%s) no navega ni recarga', async (_caso, tardia) => {
    const patch = enPausa();
    const { result, llamadas, unmount } = await conHorarioElegido({ [PATCH_REPROGRAMAR]: turnos(patch.turno) });
    await hacer(() => result.current.confirmar());
    await unmount();
    await patch.soltar(tardia());
    await vaciar();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(veces(llamadas, horariosDe(DIA_CITA))).toBe(1);
  });
});
