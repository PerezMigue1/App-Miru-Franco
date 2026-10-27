/// <reference types="jest" />

import { act, cleanup, fireEvent, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import { useMisDatosViewModel } from '@/features/auth/viewmodels/useMisDatosViewModel';
import { usePermisosPrivacidad } from '@/features/auth/viewmodels/usePermisosPrivacidad';
import { useSolicitudesArco } from '@/features/auth/viewmodels/useSolicitudesArco';
import MisDatosView from '@/features/auth/views/MisDatosView';
import { obtenerTexto as t } from '@/shared/api/textosSitio';

import {
  ALERGIA_FICTICIA,
  ALERGIAS_AUTORIZADAS,
  FOTOS_ACEPTADAS,
  FOTOS_REVOCADAS,
  RUTA_CONSENTIMIENTOS,
  RUTA_ME,
  RUTA_MIAS,
  RUTA_MIOS,
  RUTA_MIS_DATOS,
  RUTA_OPOSICION,
  RUTA_SOLICITUDES,
  error500,
  perfilMisDatos,
  respuestaMe,
  respuestaMias,
  respuestaMios,
  respuestaMisDatos,
  respuestaRevocado,
  respuestaSolicitud,
  solicitudCruda,
} from '../../helpers/misDatos';
import {
  RUTA_RETIRAR_SENSIBLES,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaRetirada,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { MENSAJE_LIMITE, limite429 } from '../../helpers/limitesRed';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  diferida,
  enSecuencia,
  reiniciarSimulaciones,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, cobertura de Mis datos y privacidad: lo que pasa a mitad de una petición. Respuestas viejas
 * que llegan después de otra recarga, salir de la pantalla con un envío en curso (con éxito, con
 * error y con 429), Atrás con la hoja ARCO enviando, dobles toques en "Retirar", "Enviar", "Ver mis
 * datos" y "Oponerme", autorizar la salud u oponerse cuando los permisos todavía no cargaron y los
 * interruptores que no envían nada. Pantalla y viewmodels reales; expo-router y useAuth simulados;
 * fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-mis-datos-1', nombre: 'Clienta Ficticia', email: 'misdatos@ejemplo.test', rol: 'cliente' };

beforeEach(() => {
  reiniciarSimulaciones();
  invalidarPerfil();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});

/** Lo que pide la pantalla al abrir: salud sin autorizar, promociones encendidas y fotos autorizadas. */
function servidor(rutas: Record<string, ManejadorVm> = {}): LlamadaVm[] {
  return servidorVm({
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`GET ${RUTA_ME}`]: () => respuestaMe(true),
    [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_ACEPTADAS),
    [`GET ${RUTA_MIAS}`]: () => respuestaMias([]),
    [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(),
    ...rutas,
  });
}

async function pintar(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <MisDatosView />
    </SafeAreaProvider>,
  );
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fila(clave: string) {
  return screen.getByRole('button', { name: new RegExp(`^${escapar(t(clave))}`) });
}

function ultimoBoton(nombre: string) {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

const interruptor = (clave: string) => screen.findByRole('switch', { name: t(clave) });
const opcion = (tipo: string) =>
  screen.getByRole('radio', { name: new RegExp(`^${escapar(t(`privacidad.app.tipo.${tipo}`))},`) });

/** El Modal a la vista (su onRequestClose es el Atrás de Android). */
function modalVisible(): TestInstance {
  const visibles = screen.container.queryAll(
    (nodo) => typeof nodo.props.onRequestClose === 'function' && nodo.props.visible === true,
  );
  expect(visibles).toHaveLength(1);
  return visibles[0];
}

/** Deja correr las promesas que ya se resolvieron. */
async function asentar(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('usePermisosPrivacidad: recargas y respuestas viejas', () => {
  it('al recargar con los interruptores a la vista no los esconde mientras llega el estado nuevo', async () => {
    const segunda = diferida();
    servidor({
      [`GET ${RUTA_MIOS}`]: enSecuencia(
        () => respuestaMios(FOTOS_ACEPTADAS),
        () => segunda.promesa,
      ),
    });
    const { result } = await renderHook(() => usePermisosPrivacidad(jest.fn()));
    await act(async () => {
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('lista'));
    expect(result.current.interruptores.map((i) => i.permiso)).toEqual(['salud', 'promociones', 'fotos']);

    await act(async () => {
      result.current.recargar();
    });
    expect(result.current.estado).toBe('lista');
    expect(result.current.interruptores).toHaveLength(3);

    await act(async () => {
      segunda.soltar(respuestaMios([]));
    });
    // Sin ningún registro de fotos su interruptor ya no sale.
    await waitFor(() => expect(result.current.interruptores.map((i) => i.permiso)).toEqual(['salud', 'promociones']));
  });

  it('el error de una carga vieja no tapa la carga que sí llegó', async () => {
    const primera = diferida();
    servidor({
      [`GET ${RUTA_MIOS}`]: enSecuencia(
        () => primera.promesa,
        () => respuestaMios(FOTOS_ACEPTADAS),
      ),
    });
    const { result } = await renderHook(() => usePermisosPrivacidad(jest.fn()));
    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('lista'));

    await act(async () => {
      primera.soltar(error500('BADC0FFE'));
    });
    await asentar();
    expect(result.current.estado).toBe('lista');
    expect(result.current.error).toBeNull();
    expect(result.current.interruptores).toHaveLength(3);
  });
});

describe('usePermisosPrivacidad: lo que no envía nada', () => {
  async function conPermisos(rutas: Record<string, ManejadorVm> = {}) {
    const llamadas = servidor(rutas);
    const alCambiarSalud = jest.fn();
    const vista = await renderHook(() => usePermisosPrivacidad(alCambiarSalud));
    await act(async () => {
      vista.result.current.recargar();
    });
    await waitFor(() => expect(vista.result.current.estado).toBe('lista'));
    return { ...vista, llamadas, alCambiarSalud };
  }

  const de = (result: { current: ReturnType<typeof usePermisosPrivacidad> }, permiso: string) => {
    const encontrado = result.current.interruptores.find((i) => i.permiso === permiso);
    if (!encontrado) {
      throw new Error(`sin interruptor ${permiso}`);
    }
    return encontrado;
  };

  it('encender las fotos pide confirmar con la acción principal; sin confirmar no envía nada', async () => {
    const { result, llamadas } = await conPermisos();
    const antes = llamadas.length;

    await act(async () => {
      de(result, 'fotos').cambiar(true);
    });
    expect(result.current.confirmacion).toMatchObject({
      visible: true,
      titulo: t('privacidad.app.fotos.autorizarTitulo'),
      texto: t('privacidad.app.fotos.autorizarTexto'),
      accion: t('privacidad.app.fotos.autorizar'),
      destructiva: false,
    });
    expect(result.current.hojaSalud.visible).toBe(false);
    await act(async () => {
      result.current.confirmacion.cerrar();
    });
    expect(result.current.confirmacion.visible).toBe(false);
    expect(llamadas).toHaveLength(antes);
  });

  it('retirar un permiso se confirma con la acción en el color de peligro', async () => {
    const { result } = await conPermisos();
    await act(async () => {
      de(result, 'promociones').cambiar(false);
    });
    expect(result.current.confirmacion).toMatchObject({ visible: true, destructiva: true });
  });

  it('mientras se activa promociones, tocar otro interruptor no abre nada ni envía otro cambio', async () => {
    const activar = diferida();
    const { result, llamadas } = await conPermisos({
      [`GET ${RUTA_ME}`]: () => respuestaMe(false),
      [`PATCH ${RUTA_ME}`]: () => activar.promesa,
    });
    await act(async () => {
      de(result, 'promociones').cambiar(true);
    });
    expect(llamadasA(llamadas, 'PATCH', RUTA_ME)).toHaveLength(1);
    expect(de(result, 'fotos').deshabilitado).toBe(true);

    await act(async () => {
      de(result, 'fotos').cambiar(false);
      de(result, 'salud').cambiar(true);
      de(result, 'promociones').cambiar(true);
    });
    expect(result.current.confirmacion.visible).toBe(false);
    expect(result.current.hojaSalud.visible).toBe(false);
    expect(llamadasA(llamadas, 'PATCH', RUTA_ME)).toHaveLength(1);
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);

    await act(async () => {
      activar.soltar(respuesta({ success: true, data: {} }));
    });
    await waitFor(() => expect(result.current.aviso?.texto).toBe(t('privacidad.app.promociones.activada')));
    expect(de(result, 'promociones').encendido).toBe(true);
  });

  it('con la confirmación de un retiro abierta, encender otro interruptor no envía nada', async () => {
    const { result, llamadas } = await conPermisos({ [`GET ${RUTA_ME}`]: () => respuestaMe(false) });
    await act(async () => {
      de(result, 'fotos').cambiar(false);
    });
    expect(result.current.confirmacion.texto).toBe(t('privacidad.app.fotos.retirarTexto'));

    await act(async () => {
      de(result, 'promociones').cambiar(true);
    });
    expect(llamadasA(llamadas, 'PATCH', RUTA_ME)).toHaveLength(0);
    expect(result.current.confirmacion.texto).toBe(t('privacidad.app.fotos.retirarTexto'));
  });

  it('doble toque en "Retirar permiso": un solo retiro', async () => {
    const retiro = diferida();
    const { result, llamadas } = await conPermisos({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => retiro.promesa });
    await act(async () => {
      de(result, 'promociones').cambiar(false);
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1);

    await act(async () => {
      retiro.soltar(respuestaRevocado('promociones'));
    });
    await waitFor(() => expect(result.current.aviso?.texto).toBe(t('privacidad.app.promociones.retirada')));
    expect(de(result, 'promociones').encendido).toBe(false);
  });

  it('si se sale de la pantalla mientras se retira la salud, la respuesta no avisa a Mis datos', async () => {
    const retiro = diferida();
    const { result, unmount, alCambiarSalud } = await conPermisos({
      [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(true),
      [`POST ${RUTA_RETIRAR_SENSIBLES}`]: () => retiro.promesa,
    });
    await act(async () => {
      de(result, 'salud').cambiar(false);
    });
    await act(async () => {
      result.current.confirmacion.confirmar();
    });
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await unmount();

    await act(async () => {
      retiro.soltar(respuestaRetirada());
    });
    expect(alCambiarSalud).not.toHaveBeenCalled();
    expect(errores).not.toHaveBeenCalled();
  });
});

describe('Mis permisos sin cargar todavía', () => {
  it('al autorizar la salud desde Mis datos con los permisos en error, se vuelven a pedir y ya salen', async () => {
    let autorizada = false;
    const llamadas = servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(autorizada),
      [`POST ${RUTA_SENSIBLES}`]: () => {
        autorizada = true;
        return respuestaAutorizada();
      },
      [`GET ${RUTA_MIOS}`]: enSecuencia(sinRed, () => respuestaMios(FOTOS_ACEPTADAS)),
      [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(perfilMisDatos(autorizada ? ALERGIAS_AUTORIZADAS : {})),
    });
    await pintar();
    expect(await screen.findByRole('button', { name: t('privacidad.app.reintentar') })).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();

    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    await fireEvent.press(await screen.findByRole('button', { name: t('privacidad.app.alergias.autorizar') }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: t('datosSensibles.app.casilla') }));
    await fireEvent.press(ultimoBoton(t('datosSensibles.app.autorizo')));

    expect(await interruptor('privacidad.app.salud.titulo')).toBeChecked();
    expect(screen.getByText(t('privacidad.app.salud.autorizada'))).toBeOnTheScreen();
    expect(await screen.findByText(ALERGIA_FICTICIA)).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_MIOS)).toHaveLength(2);
  });

  it('al oponerse con los permisos en error, se vuelven a pedir y promociones sale apagado', async () => {
    let recibe = true;
    const llamadas = servidor({
      [`GET ${RUTA_ME}`]: () => respuestaMe(recibe),
      [`GET ${RUTA_MIOS}`]: enSecuencia(sinRed, () => respuestaMios([])),
      [`POST ${RUTA_OPOSICION}`]: () => {
        recibe = false;
        return respuestaSolicitud({ folio: 'ARCO-2026-000043', tipo: 'oposicion', estado: 'atendida' });
      },
    });
    await pintar();
    expect(await screen.findByRole('button', { name: t('privacidad.app.reintentar') })).toBeOnTheScreen();

    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.oposicion.confirmar')));

    expect(await screen.findByText(t('privacidad.app.oposicion.lista', { folio: 'ARCO-2026-000043' }))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.promociones.titulo')).not.toBeChecked();
    expect(llamadasA(llamadas, 'GET', RUTA_MIOS)).toHaveLength(2);
  });
});

describe('useSolicitudesArco: respuestas viejas, doble envío y salida', () => {
  it('el error de una carga vieja no tapa la lista que sí llegó', async () => {
    const primera = diferida();
    servidor({
      [`GET ${RUTA_MIAS}`]: enSecuencia(
        () => primera.promesa,
        () => respuestaMias([solicitudCruda()]),
      ),
    });
    const { result } = await renderHook(() => useSolicitudesArco());
    await act(async () => {
      result.current.recargar();
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.estado).toBe('lista'));

    await act(async () => {
      primera.soltar(error500('0A0A0A0A'));
    });
    await asentar();
    expect(result.current.estado).toBe('lista');
    expect(result.current.error).toBeNull();
    expect(result.current.filas.map((f) => f.folio)).toEqual([
      t('privacidad.app.solicitudes.folio', { folio: 'ARCO-2026-000041' }),
    ]);
  });

  it('sin tipo no envía; con uno, un segundo toque y cambiar de tipo mientras se envía no cuentan', async () => {
    const envio = diferida();
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => envio.promesa });
    const { result } = await renderHook(() => useSolicitudesArco());
    await act(async () => {
      result.current.abrirNueva();
    });
    await act(async () => {
      result.current.hoja.enviar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(0);

    await act(async () => {
      result.current.hoja.opciones.find((o) => o.tipo === 'acceso')?.elegir();
    });
    await act(async () => {
      result.current.hoja.enviar();
    });
    expect(result.current.hoja.enviando).toBe(true);
    await act(async () => {
      result.current.hoja.enviar();
      result.current.hoja.opciones.find((o) => o.tipo === 'cancelacion')?.elegir();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(1);
    expect(result.current.hoja.opciones.filter((o) => o.elegida).map((o) => o.tipo)).toEqual(['acceso']);

    await act(async () => {
      envio.soltar(respuestaSolicitud({ folio: 'ARCO-2026-000051' }));
    });
    await waitFor(() => expect(result.current.aviso?.texto).toBe(t('privacidad.app.hoja.lista', { folio: 'ARCO-2026-000051' })));
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES).map((l) => l.cuerpo)).toEqual([{ tipo: 'acceso' }]);
    expect(result.current.hoja.visible).toBe(false);
  });

  it('salir mientras se envía y llega un 429: nada se escribe ni se vuelve a pedir', async () => {
    const envio = diferida();
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => envio.promesa });
    const { result, unmount } = await renderHook(() => useSolicitudesArco());
    await act(async () => {
      result.current.abrirNueva();
    });
    await act(async () => {
      result.current.hoja.opciones.find((o) => o.tipo === 'oposicion')?.elegir();
    });
    await act(async () => {
      result.current.hoja.enviar();
    });
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const lecturas = llamadasA(llamadas, 'GET', RUTA_MIAS).length;
    await unmount();

    await act(async () => {
      envio.soltar(limite429(30));
    });
    expect(errores).not.toHaveBeenCalled();
    expect(llamadasA(llamadas, 'GET', RUTA_MIAS)).toHaveLength(lecturas);
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1);
  });
});

describe('Hoja de solicitud ARCO en la pantalla', () => {
  it('Atrás mientras se envía no cierra la hoja; al responder se cierra y avisa el folio', async () => {
    const envio = diferida();
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => envio.promesa });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.solicitudes.nueva') }));
    expect(await screen.findByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();
    await fireEvent.press(opcion('acceso'));
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.hoja.enviar') }));

    await fireEvent(modalVisible(), 'requestClose');
    expect(screen.getByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();
    expect(opcion('acceso')).toBeChecked();

    await act(async () => {
      envio.soltar(respuestaSolicitud({ folio: 'ARCO-2026-000052' }));
    });
    expect(await screen.findByText(t('privacidad.app.hoja.lista', { folio: 'ARCO-2026-000052' }))).toBeOnTheScreen();
  });

  it('con un toque real (presionar y soltar) la opción queda elegida y se envía ese tipo', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => respuestaSolicitud({ tipo: 'rectificacion' }) });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.solicitudes.nueva') }));
    expect(await screen.findByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();

    await userEvent.setup().press(opcion('rectificacion'));
    expect(opcion('rectificacion')).toBeChecked();
    expect(opcion('acceso')).not.toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.hoja.enviar') }));
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(1));
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)[0].cuerpo).toEqual({ tipo: 'rectificacion' });
  });
});

describe('useMisDatosViewModel: acceso y oposición a mitad de una petición', () => {
  const acceso = (result: { current: ReturnType<typeof useMisDatosViewModel> }) =>
    result.current.derechos.find((d) => d.derecho === 'acceso');
  const oposicion = (result: { current: ReturnType<typeof useMisDatosViewModel> }) =>
    result.current.derechos.find((d) => d.derecho === 'oposicion');

  it('doble toque en "Ver mis datos" pide una sola vez', async () => {
    const datos = diferida();
    const llamadas = servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => datos.promesa });
    const { result } = await renderHook(() => useMisDatosViewModel());
    await act(async () => {
      acceso(result)?.abrir();
    });
    expect(result.current.acceso.estado).toBe('cargando');
    expect(acceso(result)?.deshabilitado).toBe(true);
    await act(async () => {
      acceso(result)?.abrir();
    });
    expect(llamadasA(llamadas, 'GET', RUTA_MIS_DATOS)).toHaveLength(1);

    await act(async () => {
      datos.soltar(respuestaMisDatos());
    });
    await waitFor(() => expect(result.current.acceso.estado).toBe('listo'));
  });

  it('429: Reintentar no vuelve a pedir mientras corre la espera del servidor', async () => {
    const llamadas = servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => limite429(30) });
    const { result } = await renderHook(() => useMisDatosViewModel());
    await act(async () => {
      acceso(result)?.abrir();
    });
    await waitFor(() => expect(result.current.acceso.estado).toBe('error'));
    expect(result.current.acceso.error).toBe(MENSAJE_LIMITE);
    expect(result.current.acceso.reintentarDeshabilitado).toBe(true);

    await act(async () => {
      result.current.acceso.reintentar();
    });
    expect(llamadasA(llamadas, 'GET', RUTA_MIS_DATOS)).toHaveLength(1);
  });

  it('si oculta sus datos mientras cargan, un 429 tardío no deja error ni espera', async () => {
    const datos = diferida();
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => datos.promesa });
    const { result } = await renderHook(() => useMisDatosViewModel());
    await act(async () => {
      acceso(result)?.abrir();
    });
    await act(async () => {
      result.current.acceso.ocultar();
    });
    expect(result.current.acceso.estado).toBe('oculto');

    await act(async () => {
      datos.soltar(limite429(30));
    });
    await asentar();
    expect(result.current.acceso.estado).toBe('oculto');
    expect(result.current.acceso.error).toBeNull();
    expect(result.current.acceso.reintentarDeshabilitado).toBe(false);
    expect(acceso(result)?.deshabilitado).toBe(false);
    expect(acceso(result)?.descripcion).toBe(t('privacidad.app.acceso.descripcion'));
  });

  it('mientras se registra la oposición, ni la fila ni un segundo "Oponerme" mandan otra', async () => {
    const envio = diferida();
    const llamadas = servidor({ [`POST ${RUTA_OPOSICION}`]: () => envio.promesa });
    const { result } = await renderHook(() => useMisDatosViewModel());
    await act(async () => {
      oposicion(result)?.abrir();
    });
    await act(async () => {
      result.current.oposicion.confirmar();
    });
    expect(oposicion(result)?.deshabilitado).toBe(true);
    expect(oposicion(result)?.descripcion).toBe(t('privacidad.app.oposicion.enviando'));

    await act(async () => {
      oposicion(result)?.abrir();
    });
    expect(result.current.oposicion.visible).toBe(false);
    await act(async () => {
      result.current.oposicion.confirmar();
    });
    expect(llamadasA(llamadas, 'POST', RUTA_OPOSICION)).toHaveLength(1);

    await act(async () => {
      envio.soltar(respuestaSolicitud({ folio: 'ARCO-2026-000043', tipo: 'oposicion', estado: 'atendida' }));
    });
    await waitFor(() =>
      expect(result.current.avisoDerechos?.texto).toBe(t('privacidad.app.oposicion.lista', { folio: 'ARCO-2026-000043' })),
    );
  });

  it.each([
    ['la registra', () => respuestaSolicitud({ folio: 'ARCO-2026-000043', tipo: 'oposicion', estado: 'atendida' })],
    ['responde 5xx', () => error500('C0C0C0C0')],
  ])('si sale de la pantalla mientras el backend %s, no se escribe ni se recargan las solicitudes', async (_caso, salida) => {
    const envio = diferida();
    const llamadas = servidor({ [`POST ${RUTA_OPOSICION}`]: () => envio.promesa });
    const { result, unmount } = await renderHook(() => useMisDatosViewModel());
    await act(async () => {
      oposicion(result)?.abrir();
    });
    await act(async () => {
      result.current.oposicion.confirmar();
    });
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_OPOSICION)).toHaveLength(1));
    const lecturas = llamadasA(llamadas, 'GET', RUTA_MIAS).length;
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await unmount();

    await act(async () => {
      envio.soltar(salida());
    });
    expect(errores).not.toHaveBeenCalled();
    expect(llamadasA(llamadas, 'GET', RUTA_MIAS)).toHaveLength(lecturas);
    expect(result.current.avisoDerechos).toBeNull();
  });
});

describe('Mis datos a la vista y la oposición', () => {
  it('con los datos abiertos, al oponerse el campo de promociones cambia a "No las recibes"', async () => {
    servidor({
      [`POST ${RUTA_OPOSICION}`]: () => respuestaSolicitud({ folio: 'ARCO-2026-000043', tipo: 'oposicion', estado: 'atendida' }),
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    const campo = (valor: string) => `${t('privacidad.app.campo.promociones')}: ${t(valor)}`;
    expect(await screen.findByLabelText(campo('privacidad.app.valor.recibe'))).toBeOnTheScreen();

    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.oposicion.confirmar')));

    expect(await screen.findByLabelText(campo('privacidad.app.valor.noRecibe'))).toBeOnTheScreen();
    expect(screen.queryByLabelText(campo('privacidad.app.valor.recibe'))).not.toBeOnTheScreen();
  });

  it('sin fecha de generación no pinta la línea "Tus datos al…"', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => respuesta({ success: true, data: { perfil: perfilMisDatos() } }) });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText('Clienta Ficticia')).toBeOnTheScreen();
    expect(screen.queryByText(/^Tus datos al /)).not.toBeOnTheScreen();
    expect(screen.getByLabelText(`${t('privacidad.app.seccion.pedidos')}: 0`)).toBeOnTheScreen();
  });
});
