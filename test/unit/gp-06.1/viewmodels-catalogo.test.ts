/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  FILTROS_VACIOS,
  useCatalogoServiciosViewModel,
  type CatalogoServiciosViewModel,
  type FiltrosServicios,
} from '@/features/citas/viewmodels/useCatalogoServiciosViewModel';
import { useDetalleServicioViewModel } from '@/features/citas/viewmodels/useDetalleServicioViewModel';

import { espiarConsola } from '../../helpers/consola';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  CATALOGO_CRUDO,
  CATALOGO_NORMALIZADO,
  cuerpoDetalle,
  cuerpoLista,
  rutasServicios,
  servicioCrudo,
  servicioEsperado,
  servicioNoEncontrado,
} from '../../helpers/serviciosFicticios';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  errorServidor,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.1 (catálogo y detalle de servicios), viewmodels con renderHook en caja blanca:
 * useCatalogoServiciosViewModel (carga, búsqueda, categorías y filtros avanzados) y
 * useDetalleServicioViewModel (carga por id y Reservar con o sin sesión). Solo se simulan fetch
 * (API en http://api.test), expo-router y useAuth; servicioModel y apiClient son los reales.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

const RUTA_LISTA = 'GET /api/servicios';
/** Alaciado keratínico: activo, con anticipo y dos especialistas. */
const ALACIADO = CATALOGO_CRUDO[1];
const RUTA_ALACIADO = `GET /api/servicios/${ALACIADO.id}`;

const lista = (crudos: unknown[] = CATALOGO_CRUDO): Response => respuesta(cuerpoLista(crudos));
const detalleAlaciado = (): Response => respuesta(cuerpoDetalle(ALACIADO));
const fallaInterna = (): Response => errorServidor(500, 'Fallo interno ficticio');

/** Ids de los servicios activos de CATALOGO_CRUDO, en orden. */
const IDS_ACTIVOS = [1, 2, 3, 4];

/** Deja correr las promesas pendientes (con los temporizadores falsos). */
async function asentar(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });
}

function veces(llamadas: LlamadaVm[], ruta: string): number {
  const [metodo, camino] = ruta.split(' ');
  return llamadasA(llamadas, metodo, camino).length;
}

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
});

// Ninguna prueba debe dejar avisos de act() ni errores en consola.
espiarConsola(cerrarConTemporizadores, true);

// ── Carga compartida por los dos viewmodels ──────────────────────────────────────────────────

interface CasoCarga {
  ruta: string;
  exito: () => Response;
  usar: () => { estado: string; recargar: () => void };
}

describe.each<[string, CasoCarga]>([
  ['catálogo', { ruta: RUTA_LISTA, exito: () => lista(), usar: () => useCatalogoServiciosViewModel() }],
  [
    'detalle',
    { ruta: RUTA_ALACIADO, exito: detalleAlaciado, usar: () => useDetalleServicioViewModel(String(ALACIADO.id)) },
  ],
])('%s: carga', (_nombre, { ruta, exito, usar }) => {
  it('empieza en "cargando", pide una sola vez y queda "listo"', async () => {
    const pendiente = diferida();
    const llamadas = servidorVm({ [ruta]: () => pendiente.promesa });
    const { result } = await renderHook(usar);

    expect(result.current.estado).toBe('cargando');
    await act(async () => {
      pendiente.soltar(exito());
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(veces(llamadas, ruta)).toBe(1);
  });

  it.each<[string, () => Salida]>([
    ['un error 500', fallaInterna],
    ['sin conexión', sinRed],
  ])('con %s queda en "error" y recargar sí carga después', async (_caso, falla) => {
    const reintento = diferida();
    const llamadas = servidorVm({ [ruta]: enSecuencia(falla, () => reintento.promesa) });
    const { result } = await renderHook(usar);

    await waitFor(() => expect(result.current.estado).toBe('error'));
    await act(async () => {
      result.current.recargar();
    });
    expect(result.current.estado).toBe('cargando');
    await act(async () => {
      reintento.soltar(exito());
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(veces(llamadas, ruta)).toBe(2);
  });

  it.each<[string, () => Response, () => Response, string]>([
    ['la primera llega tarde con éxito', fallaInterna, exito, 'error'],
    ['la primera llega tarde con error', exito, fallaInterna, 'listo'],
  ])('doble toque en recargar: solo escribe la última respuesta (%s)', async (_caso, ultima, tardia, esperado) => {
    const primera = diferida();
    const segunda = diferida();
    const llamadas = servidorVm({
      [ruta]: enSecuencia(fallaInterna, () => primera.promesa, () => segunda.promesa),
    });
    const { result } = await renderHook(usar);
    await waitFor(() => expect(result.current.estado).toBe('error'));

    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    expect(veces(llamadas, ruta)).toBe(3);
    await act(async () => {
      segunda.soltar(ultima());
    });
    await asentar();
    expect(result.current.estado).toBe(esperado);

    await act(async () => {
      primera.soltar(tardia());
    });
    await asentar();
    expect(result.current.estado).toBe(esperado);
  });

  it('si se desmonta antes de la respuesta no escribe el estado', async () => {
    const pendiente = diferida();
    servidorVm({ [ruta]: () => pendiente.promesa });
    const { result, unmount } = await renderHook(usar);

    await unmount();
    await act(async () => {
      pendiente.soltar(exito());
    });
    await asentar();
    expect(result.current.estado).toBe('cargando');
  });
});

// ── useCatalogoServiciosViewModel ────────────────────────────────────────────────────────────

describe('useCatalogoServiciosViewModel', () => {
  type Resultado = { current: CatalogoServiciosViewModel };

  async function montarCatalogo(crudos: unknown[] = CATALOGO_CRUDO) {
    servidorVm({ [RUTA_LISTA]: () => lista(crudos) });
    const vista = await renderHook(() => useCatalogoServiciosViewModel());
    await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
    return vista.result;
  }

  const ids = (result: Resultado) => result.current.serviciosVisibles.map((s) => s.id);

  /** Abre la hoja, cambia el borrador y lo aplica. */
  async function aplicar(result: Resultado, cambios: Partial<FiltrosServicios>): Promise<void> {
    await act(async () => {
      result.current.abrirFiltros();
    });
    await act(async () => {
      result.current.cambiarBorrador(cambios);
    });
    await act(async () => {
      result.current.aplicarFiltros();
    });
  }

  it('muestra solo los servicios activos, ya normalizados, y sin filtros', async () => {
    const result = await montarCatalogo();

    expect(result.current.serviciosVisibles).toEqual(CATALOGO_NORMALIZADO.filter((s) => s.activo));
    expect(result.current.hayServicios).toBe(true);
    expect(result.current.busqueda).toBe('');
    expect(result.current.categoria).toBeNull();
    expect(result.current.filtros).toEqual(FILTROS_VACIOS);
    expect(result.current.filtrosActivos).toBe(0);
    expect(result.current.hojaFiltrosVisible).toBe(false);
  });

  it('con data vacía queda "listo" sin servicios ni categorías', async () => {
    const result = await montarCatalogo([]);

    expect(result.current.serviciosVisibles).toEqual([]);
    expect(result.current.hayServicios).toBe(false);
    expect(result.current.categorias).toEqual([]);
  });

  it('las categorías salen sin repetir, en orden de llegada, sin vacías ni de inactivos', async () => {
    const result = await montarCatalogo([
      ...CATALOGO_CRUDO,
      servicioCrudo({ id: 6, nombre: 'Corte de caballero', categoria: 'Cabello' }),
      servicioCrudo({ id: 7, nombre: 'Sin categoría', categoria: '' }),
    ]);

    expect(result.current.categorias).toEqual(['Cabello', 'Tratamientos', 'Uñas', 'Color']);
    expect(ids(result)).toEqual([...IDS_ACTIVOS, 6, 7]);
  });

  it.each<[string, number[]]>([
    ['alaciado', [2]],
    ['unas', [3]],
    ['UÑAS', [3]],
    ['keratinico', [2]],
    ['  Balayage  ', [4]],
    ['CORTE', [1]],
    ['tinte', []],
    ['   ', IDS_ACTIVOS],
  ])('buscar %p muestra %p (sin acentos ni mayúsculas)', async (texto, esperados) => {
    const result = await montarCatalogo();

    await act(async () => {
      result.current.setBusqueda(texto);
    });
    expect(result.current.busqueda).toBe(texto);
    expect(ids(result)).toEqual(esperados);
  });

  it('filtra por categoría, se combina con la búsqueda y vuelve a Todas con null', async () => {
    const result = await montarCatalogo();

    await act(async () => {
      result.current.setCategoria('Color');
    });
    expect(result.current.categoria).toBe('Color');
    expect(ids(result)).toEqual([4]);

    await act(async () => {
      result.current.setBusqueda('alaciado');
    });
    expect(ids(result)).toEqual([]);

    await act(async () => {
      result.current.setCategoria(null);
    });
    expect(ids(result)).toEqual([2]);
  });

  it.each<[string, Partial<FiltrosServicios>, number[], number]>([
    ['precio mínimo', { precioMinimo: '400' }, [2, 4], 1],
    ['precio máximo (sin precio cuenta como 0)', { precioMaximo: '1200' }, [1, 2, 3], 1],
    ['precio entre 350 y 1200, inclusivo', { precioMinimo: '350', precioMaximo: '1200' }, [1, 2], 1],
    ['precio con decimales', { precioMinimo: '1800.5' }, [4], 1],
    ['duración mínima', { duracionMinima: '60' }, [2, 3, 4], 1],
    ['duración máxima', { duracionMaxima: '60' }, [1, 3], 1],
    ['duración en horas y minutos', { duracionMinima: '150', duracionMaxima: '150' }, [2], 1],
    ['solo evaluación', { soloEvaluacion: true }, [4], 1],
    ['los tres a la vez', { precioMinimo: '1', duracionMaxima: '200', soloEvaluacion: true }, [4], 3],
    ['valores no numéricos (cuentan, pero no filtran)', { precioMinimo: 'abc', duracionMaxima: 'mucho' }, IDS_ACTIVOS, 2],
    ['solo espacios (no cuentan ni filtran)', { precioMinimo: '  ', duracionMinima: ' ' }, IDS_ACTIVOS, 0],
  ])('filtro de %s', async (_caso, cambios, esperados, activos) => {
    const result = await montarCatalogo();

    await aplicar(result, cambios);
    expect(result.current.filtros).toEqual({ ...FILTROS_VACIOS, ...cambios });
    expect(result.current.hojaFiltrosVisible).toBe(false);
    expect(ids(result)).toEqual(esperados);
    expect(result.current.filtrosActivos).toBe(activos);
  });

  it('un servicio sin duración ni precio cuenta como 0 en los dos rangos', async () => {
    const result = await montarCatalogo([
      ...CATALOGO_CRUDO,
      servicioCrudo({ id: 8, nombre: 'Consulta', precio: '', duracionMinutos: 0 }),
    ]);

    await aplicar(result, { precioMaximo: '0', duracionMaxima: '0' });
    expect(ids(result)).toEqual([8]);
  });

  it('la hoja edita un borrador: cerrar lo descarta y abrir parte de lo aplicado', async () => {
    const result = await montarCatalogo();
    await aplicar(result, { precioMinimo: '400' });

    await act(async () => {
      result.current.abrirFiltros();
    });
    expect(result.current.hojaFiltrosVisible).toBe(true);
    expect(result.current.borradorFiltros).toEqual({ ...FILTROS_VACIOS, precioMinimo: '400' });
    expect(result.current.borradorActivos).toBe(1);

    await act(async () => {
      result.current.cambiarBorrador({ duracionMaxima: '60' });
    });
    await act(async () => {
      result.current.cambiarBorrador({ soloEvaluacion: true });
    });
    expect(result.current.borradorFiltros).toEqual({
      ...FILTROS_VACIOS,
      precioMinimo: '400',
      duracionMaxima: '60',
      soloEvaluacion: true,
    });
    expect(result.current.borradorActivos).toBe(3);
    // El borrador todavía no filtra.
    expect(result.current.filtrosActivos).toBe(1);
    expect(ids(result)).toEqual([2, 4]);

    await act(async () => {
      result.current.cerrarFiltros();
    });
    expect(result.current.hojaFiltrosVisible).toBe(false);
    expect(result.current.filtros).toEqual({ ...FILTROS_VACIOS, precioMinimo: '400' });
    expect(ids(result)).toEqual([2, 4]);

    await act(async () => {
      result.current.abrirFiltros();
    });
    expect(result.current.borradorFiltros).toEqual(result.current.filtros);
  });

  it('limpiar vacía lo aplicado y el borrador y cierra la hoja', async () => {
    const result = await montarCatalogo();
    await aplicar(result, { precioMinimo: '400', soloEvaluacion: true });
    await act(async () => {
      result.current.abrirFiltros();
    });

    await act(async () => {
      result.current.limpiarFiltros();
    });
    expect(result.current.filtros).toEqual(FILTROS_VACIOS);
    expect(result.current.borradorFiltros).toEqual(FILTROS_VACIOS);
    expect(result.current.filtrosActivos).toBe(0);
    expect(result.current.borradorActivos).toBe(0);
    expect(result.current.hojaFiltrosVisible).toBe(false);
    expect(ids(result)).toEqual(IDS_ACTIVOS);
  });
});

// ── useDetalleServicioViewModel ──────────────────────────────────────────────────────────────

describe('useDetalleServicioViewModel', () => {
  async function montarDetalle(id: string | undefined, rutas: Record<string, ManejadorVm> = {}) {
    const llamadas = servidorVm({ ...rutasServicios(), ...rutas });
    const vista = await renderHook((props: { id: string | undefined }) => useDetalleServicioViewModel(props.id), {
      initialProps: { id },
    });
    await asentar();
    return { ...vista, llamadas };
  }

  function conSesion(): void {
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = { id: 'clienta-ficticia-1', nombre: 'Clienta Ficticia', email: 'c@ejemplo.test', rol: 'cliente' };
  }

  it.each<[string, string | undefined]>([
    ['undefined', undefined],
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('con id %s queda "noEncontrado" sin pedir nada', async (_caso, id) => {
    const { result, llamadas } = await montarDetalle(id);

    expect(result.current.estado).toBe('noEncontrado');
    expect(result.current.servicio).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it('con éxito queda "listo" con el servicio normalizado (sin especialistas en el detalle)', async () => {
    const { result, llamadas } = await montarDetalle(` ${ALACIADO.id} `);

    expect(result.current.estado).toBe('listo');
    expect(result.current.servicio).toEqual({ ...servicioEsperado(ALACIADO.id), especialistas: [] });
    expect(veces(llamadas, RUTA_ALACIADO)).toBe(1);
  });

  it.each<[string, () => Salida, string]>([
    ['un 404', servicioNoEncontrado, 'noEncontrado'],
    ['un servicio con activo false', () => respuesta(cuerpoDetalle(servicioCrudo({ activo: false }))), 'noEncontrado'],
    ['una respuesta sin data', () => respuesta({ success: true }), 'error'],
    ['un error 500', fallaInterna, 'error'],
    ['sin conexión', sinRed, 'error'],
  ])('con %s queda en %p y sin servicio', async (_caso, salida, esperado) => {
    const { result } = await montarDetalle('900', { 'GET /api/servicios/900': salida });

    expect(result.current.estado).toBe(esperado);
    expect(result.current.servicio).toBeNull();
  });

  it('el servicio inactivo del catálogo responde 404 y queda "noEncontrado"', async () => {
    const { result } = await montarDetalle('5');

    expect(result.current.estado).toBe('noEncontrado');
  });

  it('un error en una recarga borra el servicio que ya se mostraba', async () => {
    const { result } = await montarDetalle(String(ALACIADO.id), {
      [RUTA_ALACIADO]: enSecuencia(detalleAlaciado, fallaInterna),
    });
    expect(result.current.servicio?.nombre).toBe(ALACIADO.nombre);

    await act(async () => {
      result.current.recargar();
    });
    await asentar();
    expect(result.current.estado).toBe('error');
    expect(result.current.servicio).toBeNull();
  });

  it('al cambiar el id pide el nuevo servicio', async () => {
    const { result, rerender, llamadas } = await montarDetalle(String(ALACIADO.id));

    await rerender({ id: '4' });
    await asentar();
    expect(result.current.servicio?.nombre).toBe('Balayage');
    expect(veces(llamadas, 'GET /api/servicios/4')).toBe(1);
  });

  it('Reservar sin sesión muestra la invitación y no navega', async () => {
    const { result } = await montarDetalle(String(ALACIADO.id));

    expect(result.current.sesion).toBe(false);
    expect(result.current.invitacionVisible).toBe(false);
    await act(async () => {
      result.current.reservar();
    });
    expect(result.current.invitacionVisible).toBe(true);
    expect(routerSimulado.push).not.toHaveBeenCalled();
  });

  it('al iniciar sesión la invitación se oculta', async () => {
    const { result, rerender } = await montarDetalle(String(ALACIADO.id));
    await act(async () => {
      result.current.reservar();
    });
    expect(result.current.invitacionVisible).toBe(true);

    conSesion();
    await rerender({ id: String(ALACIADO.id) });
    expect(result.current.sesion).toBe(true);
    expect(result.current.invitacionVisible).toBe(false);
  });

  it('Reservar con sesión abre la reserva con el id del servicio cargado', async () => {
    conSesion();
    const { result } = await montarDetalle(` ${ALACIADO.id} `);

    await act(async () => {
      result.current.reservar();
    });
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
    expect(routerSimulado.push).toHaveBeenCalledWith(`/reservar/${ALACIADO.id}`);
    expect(result.current.invitacionVisible).toBe(false);
  });

  it('Reservar con sesión pero sin servicio cargado usa el id recibido, codificado', async () => {
    conSesion();
    const { result } = await montarDetalle(' corte a/b ');
    expect(result.current.servicio).toBeNull();

    await act(async () => {
      result.current.reservar();
    });
    expect(routerSimulado.push).toHaveBeenCalledWith('/reservar/corte%20a%2Fb');
  });

  it.each<[string, string | undefined]>([
    ['undefined', undefined],
    ['vacío', '  '],
  ])('Reservar con sesión e id %s no navega', async (_caso, id) => {
    conSesion();
    const { result } = await montarDetalle(id);

    await act(async () => {
      result.current.reservar();
    });
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(result.current.invitacionVisible).toBe(false);
  });
});
