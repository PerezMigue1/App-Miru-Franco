/// <reference types="jest" />

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import { useMiCuentaViewModel, type MiCuentaViewModel } from '@/features/auth/viewmodels/useMiCuentaViewModel';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';

import {
  BLOQUEO_CITA,
  BLOQUEO_PEDIDO,
  BLOQUEO_SIN_DATOS,
  CLAVE_FICTICIA,
  CODIGO_FICTICIO,
  ERRORES_CODIGO,
  ERRORES_PASSWORD,
  FOLIO_FICTICIO,
  MENSAJE_DESACTIVADA,
  MENSAJE_ELIMINADA,
  RUTA_CODIGO_CUENTA,
  RUTA_DESACTIVAR,
  RUTA_ELIMINAR,
  RUTA_REVISION,
  SE_CANCELA_CITA,
  SE_CANCELA_PEDIDO,
  errorCuenta,
  respuestaBaja,
  respuestaRevision,
} from '../../helpers/miCuenta';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  diferida,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B: viewmodel de Perfil > Mi cuenta con renderHook. Elegir, revisar pendientes y
 * confirmar con contraseña o código; cada code del contrato (CONTRATO_APP_CUENTA.md) en este flujo,
 * los límites, el doble toque y que la sesión se cierra solo con el 200. expo-router y useAuth
 * simulados; fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

const CLIENTA = { id: 'clienta-cuenta-1', nombre: 'Clienta Cuenta', email: 'cuenta@ejemplo.test', rol: 'cliente' };

beforeEach(() => {
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cleanup();
});

type Resultado = { current: MiCuentaViewModel };

async function montar(): Promise<Resultado> {
  const { result } = await renderHook(() => useMiCuentaViewModel());
  return result;
}

/** Paso 1 → paso 2: elige la acción y espera la revisión. */
async function elegir(result: Resultado, accion: 'desactivar' | 'eliminar' = 'desactivar'): Promise<void> {
  const opcion = result.current.opciones.find((o) => o.accion === accion);
  await act(async () => {
    opcion?.elegir();
  });
  await waitFor(() => expect(result.current.revision.estado).not.toBe('cargando'));
}

/** Hasta el paso 3 con la revisión sin bloqueos. */
async function hastaConfirmar(result: Resultado, accion: 'desactivar' | 'eliminar' = 'desactivar'): Promise<void> {
  await elegir(result, accion);
  await act(async () => {
    result.current.revision.continuar();
  });
  expect(result.current.paso).toBe('confirmar');
}

async function escribirYConfirmar(result: Resultado): Promise<void> {
  await act(async () => {
    if (result.current.confirmacion.metodo === 'password') {
      result.current.confirmacion.setPassword(CLAVE_FICTICIA);
    } else {
      result.current.confirmacion.setCodigo(CODIGO_FICTICIO);
    }
    result.current.confirmacion.setCasilla(true);
  });
  await act(async () => {
    result.current.confirmacion.confirmar();
  });
  await waitFor(() => expect(result.current.confirmacion.enviando).toBe(false));
}

function servidor(rutas: Record<string, ManejadorVm> = {}) {
  return servidorVm({ [`GET ${RUTA_REVISION}`]: () => respuestaRevision(), ...rutas });
}

describe('paso 1: elegir', () => {
  it('muestra las dos opciones con sus textos del catálogo y el paso 1 de 3', async () => {
    servidor();
    const result = await montar();
    expect(result.current.titulo).toBe(obtenerTexto('cuenta.app.titulo'));
    expect(result.current.mensajePersonal).toBeNull();
    expect(result.current.paso).toBe('elegir');
    expect(result.current.encabezadoPaso).toBe('Paso 1 de 3: Elige qué hacer');
    expect(result.current.opciones.map((o) => [o.accion, o.titulo, o.explicacion])).toEqual([
      ['desactivar', obtenerTexto('cuenta.desactivar.titulo'), obtenerTexto('cuenta.desactivar.explicacion')],
      ['eliminar', obtenerTexto('cuenta.eliminar.titulo'), obtenerTexto('cuenta.eliminar.explicacion')],
    ]);
  });

  it('con rol del personal solo muestra cuenta.personal y no pide nada', async () => {
    const llamadas = servidor();
    authSimulada.usuario = { ...CLIENTA, rol: 'estilista' };
    const result = await montar();
    expect(result.current.mensajePersonal).toBe(obtenerTexto('cuenta.personal'));
    await act(async () => {
      result.current.opciones[0].elegir();
    });
    expect(result.current.paso).toBe('elegir');
    expect(llamadas).toHaveLength(0);
  });

  it('volver en el paso 1 sale de la pantalla', async () => {
    servidor();
    const result = await montar();
    await act(async () => {
      result.current.volver();
    });
    expect(routerSimulado.back).toHaveBeenCalledTimes(1);
  });
});

describe('paso 2: revisión', () => {
  it('sin pendientes: paso 2 de 3, sin listas y puede continuar', async () => {
    const espera = diferida();
    const llamadas = servidor({ [`GET ${RUTA_REVISION}`]: () => espera.promesa });
    const result = await montar();
    await act(async () => {
      result.current.opciones[0].elegir();
    });
    expect(result.current.paso).toBe('revision');
    expect(result.current.revision.estado).toBe('cargando');
    expect(result.current.revision.textoRevisando).toBe(obtenerTexto('cuenta.app.revisando'));
    expect(result.current.revision.puedeContinuar).toBe(false);
    await act(async () => {
      espera.soltar(respuestaRevision());
    });
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(result.current.encabezadoPaso).toBe('Paso 2 de 3: Revisa tus pendientes');
    expect(result.current.revision.bloqueos).toEqual([]);
    expect(result.current.revision.seResuelveSolo).toEqual([]);
    expect(result.current.revision.sinPendientes).toBe(obtenerTexto('cuenta.revision.sinPendientes'));
    expect(result.current.revision.puedeContinuar).toBe(true);
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(1);
  });

  it('lo que se cancela solo se lista sin abrir nada', async () => {
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ seResuelveSolo: [SE_CANCELA_CITA, SE_CANCELA_PEDIDO] }),
    });
    const result = await montar();
    await elegir(result);
    expect(result.current.revision.encabezadoSeResuelve).toBe(obtenerTexto('cuenta.revision.seResuelve'));
    expect(result.current.revision.seResuelveSolo.map((p) => [p.mensaje, p.entidad, p.destino])).toEqual([
      [SE_CANCELA_CITA.mensaje, 'cita', null],
      [SE_CANCELA_PEDIDO.mensaje, 'pedido', null],
    ]);
    expect(result.current.revision.puedeContinuar).toBe(true);
  });

  it('con bloqueos: cada uno abre su cita o su pedido, el que no trae datos no abre nada y no deja continuar', async () => {
    const llamadas = servidor({
      [`GET ${RUTA_REVISION}`]: () =>
        respuestaRevision({ bloqueos: [BLOQUEO_CITA, BLOQUEO_PEDIDO, BLOQUEO_SIN_DATOS], puedeContinuar: true }),
    });
    const result = await montar();
    await elegir(result);
    const { bloqueos } = result.current.revision;
    expect(result.current.revision.encabezadoBloqueos).toBe(obtenerTexto('cuenta.revision.bloquea'));
    expect(bloqueos.map((p) => [p.mensaje, p.destino?.pista ?? null])).toEqual([
      [BLOQUEO_CITA.mensaje, obtenerTexto('cuenta.app.pistaCita')],
      [BLOQUEO_PEDIDO.mensaje, obtenerTexto('cuenta.app.pistaPedido')],
      [obtenerTexto('cuenta.app.pendienteSinTexto'), null],
    ]);
    expect(new Set(bloqueos.map((p) => p.clave)).size).toBe(3);
    expect(bloqueos[2].destino).toBeNull();
    // El servidor dijo puedeContinuar, pero con bloqueos nunca se continúa.
    expect(result.current.revision.puedeContinuar).toBe(false);
    await act(async () => {
      result.current.revision.continuar();
    });
    expect(result.current.paso).toBe('revision');

    await act(async () => {
      bloqueos[0].destino?.abrir();
      bloqueos[1].destino?.abrir();
    });
    expect(routerSimulado.push.mock.calls).toEqual([['/cita/130'], ['/pedido/58']]);

    // Revisar de nuevo pide otra revisión.
    await act(async () => {
      result.current.revision.revisarDeNuevo();
    });
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(2);
  });

  it('si falla muestra cuenta.app.errorRevision y Revisar de nuevo la vuelve a pedir', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_REVISION}`]: () => {
        vez += 1;
        return vez === 1 ? sinRed() : respuestaRevision();
      },
    });
    const result = await montar();
    await elegir(result);
    expect(result.current.revision.estado).toBe('error');
    expect(result.current.revision.error).toBe(MENSAJE_SIN_CONEXION);
    await act(async () => {
      result.current.revision.revisarDeNuevo();
    });
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(result.current.revision.error).toBeNull();
  });

  it('un 500 sin texto para la clienta usa el respaldo cuenta.app.errorRevision', async () => {
    servidor({ [`GET ${RUTA_REVISION}`]: () => errorCuenta(500, undefined, 'Internal server error') });
    const result = await montar();
    await elegir(result);
    expect(result.current.revision.error).toBe(obtenerTexto('cuenta.app.errorRevision'));
  });

  it('un 403 CUENTA_DE_PERSONAL en la revisión muestra su mensaje y no deja continuar', async () => {
    servidor({
      [`GET ${RUTA_REVISION}`]: () => errorCuenta(403, 'CUENTA_DE_PERSONAL', 'Solo la administración maneja tu cuenta.'),
    });
    const result = await montar();
    await elegir(result);
    expect(result.current.mensajePersonal).toBe('Solo la administración maneja tu cuenta.');
    expect(result.current.revision.puedeContinuar).toBe(false);
    await act(async () => {
      result.current.opciones[1].elegir();
    });
    expect(result.current.paso).toBe('revision');
  });

  it('una revisión que llega después de volver a elegir se descarta', async () => {
    const espera = diferida();
    servidor({ [`GET ${RUTA_REVISION}`]: () => espera.promesa });
    const result = await montar();
    await act(async () => {
      result.current.opciones[0].elegir();
    });
    await act(async () => {
      result.current.revision.volverAElegir();
    });
    expect(result.current.paso).toBe('elegir');
    await act(async () => {
      espera.soltar(respuestaRevision({ bloqueos: [BLOQUEO_CITA] }));
    });
    expect(result.current.revision.bloqueos).toEqual([]);
    expect(result.current.revision.estado).toBe('cargando');
  });

  it('un error de una revisión que ya no cuenta también se descarta', async () => {
    const espera = diferida();
    servidor({ [`GET ${RUTA_REVISION}`]: () => espera.promesa });
    const result = await montar();
    await act(async () => {
      result.current.opciones[1].elegir();
    });
    await act(async () => {
      result.current.volver();
    });
    expect(result.current.paso).toBe('elegir');
    await act(async () => {
      espera.soltar(errorCuenta(403, 'CUENTA_DE_PERSONAL', 'Solo la administración maneja tu cuenta.'));
    });
    expect(result.current.mensajePersonal).toBeNull();
    expect(result.current.revision.error).toBeNull();
  });

  it('el Atrás de Android regresa un paso en la revisión y en la confirmación', async () => {
    const atras = espiarAtras();
    try {
      servidor();
      const result = await montar();
      await hastaConfirmar(result);
      let consumido = false;
      await act(async () => {
        consumido = atras.pulsar();
      });
      expect(consumido).toBe(true);
      expect(result.current.paso).toBe('revision');
      await act(async () => {
        atras.pulsar();
      });
      expect(result.current.paso).toBe('elegir');
      expect(routerSimulado.back).not.toHaveBeenCalled();
    } finally {
      atras.restaurar();
    }
  });
});

describe('paso 3: confirmar con contraseña', () => {
  it('entra con la casilla sin marcar y el botón queda bloqueado hasta tener casilla y contraseña', async () => {
    const llamadas = servidor();
    const result = await montar();
    await hastaConfirmar(result);
    const c = () => result.current.confirmacion;
    expect(result.current.encabezadoPaso).toBe('Paso 3 de 3: Confirma que eres tú');
    expect(c().metodo).toBe('password');
    expect(c().esEliminar).toBe(false);
    expect(c().avisoIrreversible).toBe(obtenerTexto('cuenta.confirmar.desactivar'));
    expect(c().instruccion).toBe(obtenerTexto('cuenta.confirmar.password'));
    expect(c().etiquetaPassword).toBe(obtenerTexto('cuenta.app.etiquetaPassword'));
    expect(c().textoCasilla).toBe(obtenerTexto('cuenta.confirmar.casillaDesactivar'));
    expect(c().tituloConfirmar).toBe(obtenerTexto('cuenta.desactivar.titulo'));
    expect(c().casilla).toBe(false);
    expect(c().listo).toBe(false);

    await act(async () => {
      c().setPassword(CLAVE_FICTICIA);
    });
    expect(c().listo).toBe(false);
    await act(async () => {
      c().confirmar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_DESACTIVAR)).toHaveLength(0);

    await act(async () => {
      c().setCasilla(true);
      c().setPassword('');
    });
    expect(c().listo).toBe(false);
    await act(async () => {
      c().setPassword(CLAVE_FICTICIA);
    });
    expect(c().listo).toBe(true);
  });

  it('desactiva con la contraseña y confirmacion: true, y cierra la sesión con el mensaje del servidor', async () => {
    const espera = diferida();
    const llamadas = servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => espera.promesa });
    const result = await montar();
    await hastaConfirmar(result);
    await act(async () => {
      result.current.confirmacion.setPassword(CLAVE_FICTICIA);
      result.current.confirmacion.setCasilla(true);
    });
    // Doble toque: una sola petición.
    await act(async () => {
      result.current.confirmacion.confirmar();
      result.current.confirmacion.confirmar();
    });
    expect(result.current.confirmacion.enviando).toBe(true);
    expect(result.current.confirmacion.tituloConfirmar).toBe(obtenerTexto('cuenta.app.desactivando'));
    await act(async () => {
      result.current.confirmacion.confirmar();
      result.current.confirmacion.volverAElegir();
      result.current.volver();
    });
    expect(result.current.paso).toBe('confirmar');
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();

    await act(async () => {
      espera.soltar(respuestaBaja(MENSAJE_DESACTIVADA));
    });
    await waitFor(() => expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledTimes(1));
    const bajas = llamadasA(llamadas, 'POST', RUTA_DESACTIVAR);
    expect(bajas).toHaveLength(1);
    expect(bajas[0].cuerpo).toEqual({ password: CLAVE_FICTICIA, confirmacion: true });
    expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith({ mensaje: MENSAJE_DESACTIVADA, folio: null }, 'desactivada');
    // La contraseña no se queda en memoria.
    expect(result.current.confirmacion.password).toBe('');
  });

  it('sin message usa cuenta.listo.desactivada', async () => {
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => respuestaBaja(null) });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith(
      { mensaje: obtenerTexto('cuenta.listo.desactivada'), folio: null },
      'desactivada',
    );
  });

  it('volver al paso 2 borra la contraseña y la casilla', async () => {
    servidor();
    const result = await montar();
    await hastaConfirmar(result);
    await act(async () => {
      result.current.confirmacion.setPassword(CLAVE_FICTICIA);
      result.current.confirmacion.setCasilla(true);
    });
    await act(async () => {
      result.current.volver();
    });
    expect(result.current.paso).toBe('revision');
    await act(async () => {
      result.current.revision.continuar();
    });
    expect(result.current.confirmacion.password).toBe('');
    expect(result.current.confirmacion.casilla).toBe(false);
  });
});

describe('paso 3: eliminar con código', () => {
  function servidorCodigo(rutas: Record<string, ManejadorVm> = {}) {
    return servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: () =>
        respuesta({ success: true, message: 'Te enviamos un código a tu correo. Vence en 10 minutos.', vigenciaMinutos: 10 }),
      ...rutas,
    });
  }

  it('pide el código, acepta solo 6 dígitos y elimina con el código; cierra con el folio', async () => {
    const llamadas = servidorCodigo({ [`DELETE ${RUTA_ELIMINAR}`]: () => respuestaBaja(MENSAJE_ELIMINADA, FOLIO_FICTICIO) });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    const c = () => result.current.confirmacion;
    expect(c().metodo).toBe('codigo');
    expect(c().esEliminar).toBe(true);
    expect(c().avisoIrreversible).toBe(obtenerTexto('cuenta.confirmar.eliminar'));
    expect(c().instruccion).toBe(obtenerTexto('cuenta.confirmar.codigo'));
    expect(c().textoCasilla).toBe(obtenerTexto('cuenta.confirmar.casillaEliminar'));
    expect(c().tituloConfirmar).toBe(obtenerTexto('cuenta.eliminar.titulo'));
    expect(c().etiquetaCodigo).toBe(obtenerTexto('cuenta.app.etiquetaCodigo'));
    expect(c().tituloEnviarCodigo).toBe(obtenerTexto('cuenta.app.enviarCodigo'));

    await act(async () => {
      c().enviarCodigo();
      c().enviarCodigo();
    });
    await waitFor(() => expect(c().avisoCodigo).toBe('Te enviamos un código a tu correo. Vence en 10 minutos.'));
    expect(llamadasA(llamadas, 'POST', RUTA_CODIGO_CUENTA)).toHaveLength(1);
    expect(llamadasA(llamadas, 'POST', RUTA_CODIGO_CUENTA)[0].cuerpo).toEqual({});
    expect(c().tituloEnviarCodigo).toBe(obtenerTexto('cuenta.app.otroCodigo'));

    await act(async () => {
      c().setCasilla(true);
      c().setCodigo('12 34');
    });
    expect(c().codigo).toBe('1234');
    expect(c().listo).toBe(false);
    await act(async () => {
      c().setCodigo('1234567');
    });
    expect(c().codigo).toBe(CODIGO_FICTICIO);
    expect(c().listo).toBe(true);

    await act(async () => {
      c().confirmar();
    });
    await waitFor(() => expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledTimes(1));
    const bajas = llamadasA(llamadas, 'DELETE', RUTA_ELIMINAR);
    expect(bajas).toHaveLength(1);
    expect(bajas[0].cuerpo).toEqual({ codigo: CODIGO_FICTICIO, confirmacion: true });
    expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith({ mensaje: MENSAJE_ELIMINADA, folio: FOLIO_FICTICIO }, 'eliminada');
  });

  it('sin message usa cuenta.listo.eliminada con el folio', async () => {
    servidorCodigo({ [`DELETE ${RUTA_ELIMINAR}`]: () => respuestaBaja(null, FOLIO_FICTICIO) });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await escribirYConfirmar(result);
    expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith(
      { mensaje: obtenerTexto('cuenta.listo.eliminada', { folio: FOLIO_FICTICIO }), folio: FOLIO_FICTICIO },
      'eliminada',
    );
  });

  it('sin message ni folio válido usa el texto sin folio (nunca deja el hueco)', async () => {
    servidorCodigo({ [`DELETE ${RUTA_ELIMINAR}`]: () => respuestaBaja(null, null) });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await escribirYConfirmar(result);
    expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith(
      { mensaje: obtenerTexto('cuenta.app.eliminadaSinFolio'), folio: null },
      'eliminada',
    );
  });

  it('el envío sin message ni vigenciaMinutos muestra cuenta.app.codigoEnviado con los 10 minutos de respaldo', async () => {
    servidorCodigo({ [`POST ${RUTA_CODIGO_CUENTA}`]: () => respuesta({ success: true }) });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() => expect(result.current.confirmacion.avisoCodigo).toBe(obtenerTexto('cuenta.app.codigoEnviado', { minutos: 10 })));
  });

  it('mientras se envía el código dice Enviando… y no se puede confirmar', async () => {
    const espera = diferida();
    servidorCodigo({ [`POST ${RUTA_CODIGO_CUENTA}`]: () => espera.promesa });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    expect(result.current.confirmacion.enviandoCodigo).toBe(true);
    expect(result.current.confirmacion.tituloEnviarCodigo).toBe(obtenerTexto('cuenta.app.enviandoCodigo'));
    await act(async () => {
      espera.soltar(respuesta({ success: true }));
    });
    await waitFor(() => expect(result.current.confirmacion.enviandoCodigo).toBe(false));
  });

  it('429 ESPERA_CODIGO: muestra el mensaje junto al código y deja el botón en espera', async () => {
    const llamadas = servidorCodigo({
      [`POST ${RUTA_CODIGO_CUENTA}`]: () =>
        errorCuenta(429, 'ESPERA_CODIGO', 'Ya te enviamos un código hace menos de un minuto.', { retryAfter: 40 }),
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() => expect(result.current.confirmacion.codigoEnEspera).toBe(true));
    expect(result.current.confirmacion.errorCodigo).toBe('Ya te enviamos un código hace menos de un minuto.');
    expect(result.current.confirmacion.tituloEnviarCodigo).toBe('Intenta de nuevo en 40 s');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_CODIGO_CUENTA)).toHaveLength(1);
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it('409 CUENTA_CON_PASSWORD al pedir el código vuelve a pedir la revisión para cambiar de método', async () => {
    let revisiones = 0;
    const llamadas = servidorCodigo({
      [`GET ${RUTA_REVISION}`]: () => {
        revisiones += 1;
        return respuestaRevision({ metodo: revisiones === 1 ? 'codigo' : 'password' });
      },
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => errorCuenta(409, 'CUENTA_CON_PASSWORD', 'Tu cuenta tiene contraseña: confirma con ella.'),
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() => expect(result.current.paso).toBe('revision'));
    expect(result.current.revision.aviso).toBe('Tu cuenta tiene contraseña: confirma con ella.');
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(2);
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it('502 CORREO_NO_ENVIADO va junto al código; 403 del personal al pedir el código no deja continuar', async () => {
    let vez = 0;
    servidorCodigo({
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => {
        vez += 1;
        return vez === 1
          ? errorCuenta(502, 'CORREO_NO_ENVIADO', 'No pudimos enviar el correo. Intenta de nuevo.')
          : errorCuenta(403, 'CUENTA_DE_PERSONAL', 'Solo la administración maneja tu cuenta.');
      },
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() =>
      expect(result.current.confirmacion.errorCodigo).toBe('No pudimos enviar el correo. Intenta de nuevo.'),
    );
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await waitFor(() => expect(result.current.mensajePersonal).toBe('Solo la administración maneja tu cuenta.'));
  });
});

describe('errores de la confirmación: nada cierra la sesión', () => {
  afterEach(() => {
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it.each(ERRORES_PASSWORD)('400 %s: el mensaje va junto a la contraseña', async (code, mensaje) => {
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(400, code, mensaje) });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.errorPassword).toBe(mensaje);
    expect(result.current.confirmacion.aviso).toBeNull();
    expect(result.current.paso).toBe('confirmar');
    // Al escribir de nuevo, el error se quita.
    await act(async () => {
      result.current.confirmacion.setPassword('OtraFicticia2!');
    });
    expect(result.current.confirmacion.errorPassword).toBeNull();
  });

  it.each(ERRORES_CODIGO)('400 %s: el mensaje va junto al código y el código se limpia', async (code, mensaje) => {
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`DELETE ${RUTA_ELIMINAR}`]: () => errorCuenta(400, code, mensaje),
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.errorCodigo).toBe(mensaje);
    expect(result.current.confirmacion.codigo).toBe('');
    expect(result.current.confirmacion.aviso).toBeNull();
    await act(async () => {
      result.current.confirmacion.setCodigo('9');
    });
    expect(result.current.confirmacion.errorCodigo).toBeNull();
  });

  it('un 400 de contraseña en una cuenta con código va como aviso general', async () => {
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`DELETE ${RUTA_ELIMINAR}`]: () => errorCuenta(400, 'PASSWORD_REQUERIDA', 'Escribe tu contraseña.'),
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.aviso).toBe('Escribe tu contraseña.');
    expect(result.current.confirmacion.errorCodigo).toBeNull();
  });

  it('un 400 de código en una cuenta con contraseña va como aviso general', async () => {
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(400, 'SIN_CODIGO', 'No tienes un código.') });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.aviso).toBe('No tienes un código.');
    expect(result.current.confirmacion.errorPassword).toBeNull();
  });

  it('409 CUENTA_CON_PENDIENTES con bloqueos: regresa al paso 2 con esos bloqueos sin pedir otra revisión', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_DESACTIVAR}`]: () =>
        errorCuenta(409, 'CUENTA_CON_PENDIENTES', 'Tienes pendientes.', { errors: { bloqueos: [BLOQUEO_CITA] } }),
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.paso).toBe('revision');
    expect(result.current.revision.estado).toBe('lista');
    expect(result.current.revision.bloqueos.map((p) => p.mensaje)).toEqual([BLOQUEO_CITA.mensaje]);
    expect(result.current.revision.puedeContinuar).toBe(false);
    expect(result.current.confirmacion.password).toBe('');
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(1);
  });

  it('409 CUENTA_CON_PENDIENTES sin bloqueos: vuelve a pedir la revisión', async () => {
    let vez = 0;
    const llamadas = servidor({
      [`GET ${RUTA_REVISION}`]: () => {
        vez += 1;
        return vez === 1 ? respuestaRevision() : respuestaRevision({ bloqueos: [BLOQUEO_PEDIDO] });
      },
      [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(409, 'CUENTA_CON_PENDIENTES', 'Tienes pendientes.'),
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.paso).toBe('revision');
    await waitFor(() => expect(result.current.revision.bloqueos.map((p) => p.mensaje)).toEqual([BLOQUEO_PEDIDO.mensaje]));
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(2);
  });

  it('409 CUENTA_CAMBIO: avisa cuenta.app.cambio, vuelve a pedir la revisión y regresa al paso 2', async () => {
    const llamadas = servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(409, 'CUENTA_CAMBIO', '') });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.paso).toBe('revision');
    expect(result.current.revision.aviso).toBe(obtenerTexto('cuenta.app.cambio'));
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
    expect(result.current.revision.aviso).toBe(obtenerTexto('cuenta.app.cambio'));
    expect(llamadasA(llamadas, 'GET', RUTA_REVISION)).toHaveLength(2);
    // Revisar de nuevo a mano quita el aviso.
    await act(async () => {
      result.current.revision.revisarDeNuevo();
    });
    expect(result.current.revision.aviso).toBeNull();
    await waitFor(() => expect(result.current.revision.estado).toBe('lista'));
  });

  it('403 CUENTA_DE_PERSONAL al confirmar: muestra el mensaje y ya no deja continuar', async () => {
    servidor({
      [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(403, 'CUENTA_DE_PERSONAL', 'Solo la administración maneja tu cuenta.'),
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.mensajePersonal).toBe('Solo la administración maneja tu cuenta.');
  });

  it('429 BLOQUEO_TEMPORAL: el mensaje va junto a la contraseña y el botón espera', async () => {
    servidor({
      [`POST ${RUTA_DESACTIVAR}`]: () =>
        errorCuenta(429, 'BLOQUEO_TEMPORAL', 'Tu cuenta quedó bloqueada 15 minutos.', { retryAfter: 900 }),
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.errorPassword).toBe('Tu cuenta quedó bloqueada 15 minutos.');
    expect(result.current.confirmacion.confirmarEnEspera).toBe(true);
  });

  it('429 BLOQUEO_TEMPORAL en una cuenta con código va como aviso general', async () => {
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`DELETE ${RUTA_ELIMINAR}`]: () => errorCuenta(429, 'BLOQUEO_TEMPORAL', 'Tu cuenta quedó bloqueada.', { retryAfter: 60 }),
    });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.aviso).toBe('Tu cuenta quedó bloqueada.');
  });

  it('429 de límite: el aviso del servidor y "Intenta de nuevo en N s" sin repetir la petición', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_DESACTIVAR}`]: () =>
        errorCuenta(429, undefined, 'Demasiadas solicitudes. Intenta de nuevo en 30 segundos.', { retryAfter: 30 }),
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.aviso).toBe('Demasiadas solicitudes. Intenta de nuevo en 30 segundos.');
    expect(result.current.confirmacion.confirmarEnEspera).toBe(true);
    expect(result.current.confirmacion.tituloConfirmar).toBe('Intenta de nuevo en 30 s');
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_DESACTIVAR)).toHaveLength(1);
  });

  it('sin red o un 500: aviso con el respaldo, la cuenta sigue y se puede reintentar', async () => {
    let vez = 0;
    servidor({
      [`POST ${RUTA_DESACTIVAR}`]: () => {
        vez += 1;
        return vez === 1 ? sinRed() : errorCuenta(500, undefined, 'Internal server error');
      },
    });
    const result = await montar();
    await hastaConfirmar(result);
    await escribirYConfirmar(result);
    expect(result.current.confirmacion.aviso).toBe(MENSAJE_SIN_CONEXION);
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    await waitFor(() => expect(result.current.confirmacion.aviso).toBe(obtenerTexto('cuenta.app.errorBaja')));
  });
});

describe('sesión tras el 200', () => {
  it('si la sesión cambió y ya no queda ninguna, igual deja el aviso con el folio', async () => {
    const espera = diferida();
    servidor({ [`DELETE ${RUTA_ELIMINAR}`]: () => espera.promesa });
    const result = await montar();
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.setPassword(CLAVE_FICTICIA);
      result.current.confirmacion.setCasilla(true);
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    nuevaGeneracion();
    await act(async () => {
      espera.soltar(respuestaBaja(MENSAJE_ELIMINADA, FOLIO_FICTICIO));
    });
    await waitFor(() =>
      expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith({ mensaje: MENSAJE_ELIMINADA, folio: FOLIO_FICTICIO }, 'eliminada'),
    );
  });

  it('si mientras tanto quedó otra sesión, no la cierra', async () => {
    const espera = diferida();
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => espera.promesa });
    const result = await montar();
    await hastaConfirmar(result);
    await act(async () => {
      result.current.confirmacion.setPassword(CLAVE_FICTICIA);
      result.current.confirmacion.setCasilla(true);
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    nuevaGeneracion();
    await sembrarSesion({ id: 'otra-1', nombre: 'Otra Ficticia', email: 'otra@ejemplo.test', rol: 'cliente' });
    await act(async () => {
      espera.soltar(respuestaBaja(MENSAJE_DESACTIVADA));
    });
    await waitFor(() => expect(result.current.confirmacion.enviando).toBe(false));
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
    // La baja sí ocurrió: la clienta ve el resultado aunque no se toque la otra sesión.
    expect(result.current.confirmacion.aviso).toBe(MENSAJE_DESACTIVADA);
  });

  it('si la pantalla se cierra antes de la respuesta, no toca su estado y no falla', async () => {
    const espera = diferida();
    const codigo = diferida();
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => codigo.promesa,
      [`DELETE ${RUTA_ELIMINAR}`]: () => espera.promesa,
    });
    const vista = await renderHook(() => useMiCuentaViewModel());
    const result = vista.result;
    await hastaConfirmar(result, 'eliminar');
    await act(async () => {
      result.current.confirmacion.setCodigo(CODIGO_FICTICIO);
      result.current.confirmacion.setCasilla(true);
    });
    await act(async () => {
      result.current.confirmacion.enviarCodigo();
    });
    await act(async () => {
      codigo.soltar(respuesta({ success: true }));
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    await vista.unmount();
    await act(async () => {
      espera.soltar(errorCuenta(400, 'CODIGO_INCORRECTO', 'Código incorrecto.'));
    });
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it('una baja que termina después de cerrar la pantalla igual deja el aviso', async () => {
    const espera = diferida();
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => espera.promesa });
    const vista = await renderHook(() => useMiCuentaViewModel());
    await hastaConfirmar(vista.result);
    await act(async () => {
      vista.result.current.confirmacion.setPassword(CLAVE_FICTICIA);
      vista.result.current.confirmacion.setCasilla(true);
    });
    await act(async () => {
      vista.result.current.confirmacion.confirmar();
    });
    await vista.unmount();
    await act(async () => {
      espera.soltar(respuestaBaja(MENSAJE_DESACTIVADA));
    });
    await waitFor(() =>
      expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledWith({ mensaje: MENSAJE_DESACTIVADA, folio: null }, 'desactivada'),
    );
  });

  it('un código enviado después de cerrar la pantalla se ignora', async () => {
    const codigo = diferida();
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => codigo.promesa,
    });
    const vista = await renderHook(() => useMiCuentaViewModel());
    await hastaConfirmar(vista.result, 'eliminar');
    await act(async () => {
      vista.result.current.confirmacion.enviarCodigo();
    });
    await vista.unmount();
    await act(async () => {
      codigo.soltar(respuesta({ success: true }));
    });
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it('el código que llega después de cerrar la pantalla y su error se ignoran', async () => {
    const codigo = diferida();
    servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => codigo.promesa,
    });
    const vista = await renderHook(() => useMiCuentaViewModel());
    await hastaConfirmar(vista.result, 'eliminar');
    await act(async () => {
      vista.result.current.confirmacion.enviarCodigo();
    });
    await vista.unmount();
    await act(async () => {
      codigo.soltar(errorCuenta(502, 'CORREO_NO_ENVIADO', ''));
    });
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });
});
