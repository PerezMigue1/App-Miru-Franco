/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MiCuentaView from '@/features/auth/views/MiCuentaView';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  BLOQUEO_CITA,
  BLOQUEO_SIN_DATOS,
  CLAVE_FICTICIA,
  CODIGO_FICTICIO,
  RUTA_CODIGO_CUENTA,
  RUTA_DESACTIVAR,
  RUTA_ELIMINAR,
  RUTA_REVISION,
  SE_CANCELA_PEDIDO,
  errorCuenta,
  respuestaBaja,
  respuestaRevision,
} from '../../helpers/miCuenta';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  diferida,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B: la pantalla de Mi cuenta pintada con su viewmodel real. Encabezados accesibles de
 * cada paso, la nota del personal, la revisión (carga, error, bloqueos que abren su cita y lo que se
 * cancela solo), la confirmación con contraseña y con código, la casilla obligatoria y el botón
 * final deshabilitado, en claro y en oscuro. expo-router y useAuth simulados; fetch simulado en
 * http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-vista-1', nombre: 'Clienta Vista', email: 'vista@ejemplo.test', rol: 'cliente' };
const FILA_DESACTIVAR = `${obtenerTexto('cuenta.desactivar.titulo')}, ${obtenerTexto('cuenta.desactivar.explicacion')}`;
const FILA_ELIMINAR = `${obtenerTexto('cuenta.eliminar.titulo')}, ${obtenerTexto('cuenta.eliminar.explicacion')}`;

beforeEach(() => {
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
  esquema.mockReturnValue('light');
});

afterEach(async () => {
  await cleanup();
});

function servidor(rutas: Record<string, ManejadorVm> = {}) {
  return servidorVm({ [`GET ${RUTA_REVISION}`]: () => respuestaRevision(), ...rutas });
}

async function pintar(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <MiCuentaView />
    </SafeAreaProvider>,
  );
}

/** Desactivar: continúa desde la revisión, escribe la contraseña, marca la casilla y confirma. */
async function desactivarConClave(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
  await fireEvent.press(await screen.findByRole('button', { name: obtenerTexto('cuenta.app.continuar') }));
  await fireEvent.changeText(screen.getByLabelText(obtenerTexto('cuenta.app.etiquetaPassword')), CLAVE_FICTICIA);
  await fireEvent.press(screen.getByRole('checkbox', { name: obtenerTexto('cuenta.confirmar.casillaDesactivar') }));
  await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') }));
}

function encabezado(texto: string) {
  return screen.getByRole('header', { name: texto });
}

describe('MiCuentaView', () => {
  it('cuenta del personal: solo la nota, sin pasos ni opciones', async () => {
    servidor();
    authSimulada.usuario = { ...CLIENTA, rol: 'admin' };
    await pintar();
    expect(screen.getByText(obtenerTexto('cuenta.personal'))).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: /^Paso/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: FILA_DESACTIVAR })).not.toBeOnTheScreen();
  });

  it('paso 1 y 2: elige, muestra la carga, lo que se cancela solo y Continuar; Volver regresa', async () => {
    const espera = diferida();
    servidor({ [`GET ${RUTA_REVISION}`]: () => espera.promesa });
    await pintar();
    expect(encabezado('Paso 1 de 3: Elige qué hacer')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: FILA_ELIMINAR })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
    expect(encabezado('Paso 2 de 3: Revisa tus pendientes')).toBeOnTheScreen();
    expect(screen.getByLabelText(obtenerTexto('cuenta.app.revisando'))).toBeOnTheScreen();

    await act(async () => {
      espera.soltar(respuestaRevision({ seResuelveSolo: [SE_CANCELA_PEDIDO] }));
    });
    expect(await screen.findByText(obtenerTexto('cuenta.revision.seResuelve'))).toBeOnTheScreen();
    expect(screen.getByText(SE_CANCELA_PEDIDO.mensaje)).toBeOnTheScreen();
    // Lo que se cancela solo no es tocable.
    expect(screen.queryByRole('button', { name: SE_CANCELA_PEDIDO.mensaje })).not.toBeOnTheScreen();
    expect(screen.queryByText(obtenerTexto('cuenta.revision.sinPendientes'))).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: obtenerTexto('cuenta.app.continuar') })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('link', { name: obtenerTexto('cuenta.app.volver') }));
    expect(encabezado('Paso 1 de 3: Elige qué hacer')).toBeOnTheScreen();
  });

  it('sin pendientes muestra cuenta.revision.sinPendientes', async () => {
    servidor();
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
    expect(await screen.findByText(obtenerTexto('cuenta.revision.sinPendientes'))).toBeOnTheScreen();
  });

  it('error de la revisión: el mensaje y Revisar de nuevo', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_REVISION}`]: () => {
        vez += 1;
        return vez === 1 ? sinRed() : respuestaRevision();
      },
    });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
    const reintentar = await screen.findByRole('button', { name: obtenerTexto('cuenta.app.revisarDeNuevo') });
    expect(screen.queryByRole('button', { name: obtenerTexto('cuenta.app.continuar') })).not.toBeOnTheScreen();
    await fireEvent.press(reintentar);
    expect(await screen.findByText(obtenerTexto('cuenta.revision.sinPendientes'))).toBeOnTheScreen();
  });

  it('bloqueos: sin Continuar, la fila dice a dónde lleva y abre la cita; la que no trae datos es solo texto', async () => {
    servidor({ [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ bloqueos: [BLOQUEO_CITA, BLOQUEO_SIN_DATOS] }) });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: FILA_ELIMINAR }));
    expect(await screen.findByText(obtenerTexto('cuenta.revision.bloquea'))).toBeOnTheScreen();
    const fila = screen.getByRole('button', { name: BLOQUEO_CITA.mensaje });
    expect(fila).toHaveProp('accessibilityHint', obtenerTexto('cuenta.app.pistaCita'));
    expect(screen.getByText(obtenerTexto('cuenta.app.pistaCita'))).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('cuenta.app.pendienteSinTexto'))).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: obtenerTexto('cuenta.app.pendienteSinTexto') })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: obtenerTexto('cuenta.app.continuar') })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: obtenerTexto('cuenta.app.revisarDeNuevo') })).toBeOnTheScreen();

    await fireEvent.press(fila);
    expect(routerSimulado.push).toHaveBeenCalledWith('/cita/130');
  });

  it('paso 3 con contraseña: aviso, casilla sin marcar y botón deshabilitado hasta completar', async () => {
    const llamadas = servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => respuestaBaja('Listo, desactivada.') });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: FILA_DESACTIVAR }));
    await fireEvent.press(await screen.findByRole('button', { name: obtenerTexto('cuenta.app.continuar') }));

    expect(encabezado('Paso 3 de 3: Confirma que eres tú')).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('cuenta.confirmar.desactivar'))).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('cuenta.confirmar.password'))).toBeOnTheScreen();
    const casilla = screen.getByRole('checkbox', { name: obtenerTexto('cuenta.confirmar.casillaDesactivar') });
    expect(casilla).not.toBeChecked();
    const boton = screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') });
    expect(boton).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText(obtenerTexto('cuenta.app.etiquetaPassword')), CLAVE_FICTICIA);
    expect(boton).toBeDisabled();
    await fireEvent.press(casilla);
    expect(casilla).toBeChecked();
    expect(screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') })).toBeEnabled();

    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.desactivar.titulo') }));
    await waitFor(() => expect(authSimulada.cerrarTrasBajaDeCuenta).toHaveBeenCalledTimes(1));
    expect(llamadasA(llamadas, 'POST', RUTA_DESACTIVAR)[0].cuerpo).toEqual({ password: CLAVE_FICTICIA, confirmacion: true });
  });

  it('paso 3 con contraseña incorrecta: el error se ve junto al campo', async () => {
    servidor({ [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(400, 'PASSWORD_INCORRECTA', 'La contraseña no es correcta.') });
    await pintar();
    await desactivarConClave();
    expect(await screen.findByText('La contraseña no es correcta.')).toBeOnTheScreen();
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it.each([
    ['claro', 'light' as const],
    ['oscuro', 'dark' as const],
  ])('paso 3 con código (%s): pide el código, error junto al código y eliminar en peligro', async (_tema, valor) => {
    esquema.mockReturnValue(valor);
    let vez = 0;
    const llamadas = servidor({
      [`GET ${RUTA_REVISION}`]: () => respuestaRevision({ metodo: 'codigo' }),
      [`POST ${RUTA_CODIGO_CUENTA}`]: () => respuesta({ success: true, message: 'Te enviamos un código ficticio.' }),
      [`DELETE ${RUTA_ELIMINAR}`]: () => {
        vez += 1;
        return vez === 1
          ? errorCuenta(400, 'CODIGO_INCORRECTO', 'El código no es correcto. Te quedan 4 intentos.')
          : errorCuenta(500, undefined, 'Internal server error');
      },
    });
    await pintar();
    await fireEvent.press(screen.getByRole('button', { name: FILA_ELIMINAR }));
    await fireEvent.press(await screen.findByRole('button', { name: obtenerTexto('cuenta.app.continuar') }));

    expect(screen.getByText(obtenerTexto('cuenta.confirmar.eliminar'))).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('cuenta.confirmar.codigo'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('cuenta.app.enviarCodigo') }));
    expect(await screen.findByText('Te enviamos un código ficticio.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: obtenerTexto('cuenta.app.otroCodigo') })).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_CODIGO_CUENTA)).toHaveLength(1);

    const final = () => screen.getByRole('button', { name: obtenerTexto('cuenta.eliminar.titulo') });
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${obtenerTexto('cuenta.app.etiquetaCodigo')}`)), CODIGO_FICTICIO);
    expect(final()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: obtenerTexto('cuenta.confirmar.casillaEliminar') }));
    expect(final()).toBeEnabled();
    await fireEvent.press(final());
    expect(await screen.findByText('El código no es correcto. Te quedan 4 intentos.')).toBeOnTheScreen();

    // Un error general va en el aviso de abajo.
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${obtenerTexto('cuenta.app.etiquetaCodigo')}`)), CODIGO_FICTICIO);
    await fireEvent.press(final());
    expect(await screen.findByText(obtenerTexto('cuenta.app.errorBaja'))).toBeOnTheScreen();
    expect(authSimulada.cerrarTrasBajaDeCuenta).not.toHaveBeenCalled();
  });

  it('409 CUENTA_CAMBIO: regresa a la revisión con el aviso mientras carga', async () => {
    const segunda = diferida();
    let vez = 0;
    servidor({
      [`GET ${RUTA_REVISION}`]: () => {
        vez += 1;
        return vez === 1 ? respuestaRevision() : segunda.promesa;
      },
      [`POST ${RUTA_DESACTIVAR}`]: () => errorCuenta(409, 'CUENTA_CAMBIO', ''),
    });
    await pintar();
    await desactivarConClave();

    expect(await screen.findByText(obtenerTexto('cuenta.app.cambio'))).toBeOnTheScreen();
    expect(screen.getByLabelText(obtenerTexto('cuenta.app.revisando'))).toBeOnTheScreen();
    await act(async () => {
      segunda.soltar(respuestaRevision());
    });
    expect(await screen.findByText(obtenerTexto('cuenta.revision.sinPendientes'))).toBeOnTheScreen();
    expect(screen.getByText(obtenerTexto('cuenta.app.cambio'))).toBeOnTheScreen();
  });
});
