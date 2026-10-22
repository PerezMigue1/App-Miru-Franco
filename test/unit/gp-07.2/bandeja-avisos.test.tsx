/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { leerEstadoAvisos, limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';
import NotificacionesView from '@/features/notificaciones/views/NotificacionesView';

import {
  AVISO_CITA,
  AVISO_SIN_DESTINO,
  AVISOS_FICTICIOS,
  ID_AVISO_CITA,
  ID_AVISO_SIN_DESTINO,
  RUTA_AVISOS,
  RUTA_AVISOS_LEIDOS,
  respuestaAvisos,
  rutaAviso,
  rutasAvisos,
} from '../../helpers/avisosFicticios';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { llamadasA, respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-07.2: bandeja de Notificaciones (NotificacionesView con useNotificaciones), montada sola en
 * un router en memoria. La sesión se fija con un useAuth ficticio (la sesión real se prueba en las
 * pruebas de integración de la tarea 5); el servidor es ficticio (http://api.test).
 */

const sesion = { estado: 'autenticado' };

jest.mock('@/features/auth/viewmodels/useAuth', () => ({
  ...jest.requireActual<object>('@/features/auth/viewmodels/useAuth'),
  useAuth: () => sesion,
}));

const simularServidor = servidorConRutas({});

function montar() {
  return iniciarRouter(
    {
      index: () => <Text>Pantalla de inicio</Text>,
      notificaciones: NotificacionesView,
      'cita/[id]': () => <Text>Detalle de la cita</Text>,
    },
    { initialUrl: '/notificaciones' },
  );
}

const error500: Manejador = () => respuesta({ message: 'Error interno con detalle técnico' }, 500);

describe('bandeja de avisos (NotificacionesView)', () => {
  beforeEach(() => {
    sesion.estado = 'autenticado';
    limpiarAvisos();
  });

  afterEach(async () => {
    await cerrarRouter();
    limpiarAvisos();
  });

  it('sin sesión muestra la invitación y no pide avisos', async () => {
    sesion.estado = 'anonimo';
    const llamadas = simularServidor(rutasAvisos());
    await montar();
    expect(await screen.findByText('Tus avisos en un solo lugar')).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_AVISOS)).toHaveLength(0);
  });

  it('carga la lista con título, mensaje, la marca de no leído y el botón de borrar', async () => {
    simularServidor(rutasAvisos());
    await montar();

    expect(await screen.findByText('Tu cita está confirmada')).toBeOnTheScreen();
    expect(screen.getByText('Te esperamos en el salón.')).toBeOnTheScreen();
    expect(screen.getByText('Tu pedido está listo')).toBeOnTheScreen();
    expect(screen.getByText('Horario de fin de año')).toBeOnTheScreen();
    // Dos de los tres avisos ficticios están sin leer.
    expect(screen.getAllByLabelText('No leído')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Borrar aviso: Tu cita está confirmada' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeEnabled();
  });

  it('sin avisos muestra el vacío y "Marcar todas como leídas" deshabilitado', async () => {
    simularServidor({ [`GET ${RUTA_AVISOS}`]: () => respuesta(respuestaAvisos([])) });
    await montar();

    expect(await screen.findByText('Aquí verás tus avisos')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
  });

  it('si la carga falla muestra un mensaje amable y "Reintentar" vuelve a pedir la lista', async () => {
    let fallar = true;
    const llamadas = simularServidor({
      ...rutasAvisos(),
      [`GET ${RUTA_AVISOS}`]: () => (fallar ? error500(undefined) : respuesta(respuestaAvisos())),
    });
    await montar();

    expect(await screen.findByText('No pudimos cargar tus avisos')).toBeOnTheScreen();
    expect(screen.getByText('No pudimos cargar tus avisos. Intenta de nuevo.')).toBeOnTheScreen();
    expect(screen.queryByText(/detalle técnico/)).toBeNull();

    fallar = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tu cita está confirmada')).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_AVISOS)).toHaveLength(2);
  });

  it('tocar un aviso con destino lo marca como leído y abre su pantalla', async () => {
    const llamadas = simularServidor(rutasAvisos());
    const app = montar();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: /^No leído\. Tu cita está confirmada/ }));

    await waitFor(() => expect(app.getPathname()).toBe('/cita/12'));
    expect(llamadasA(llamadas, 'PUT', rutaAviso(ID_AVISO_CITA))).toHaveLength(1);
    expect(leerEstadoAvisos().avisos.find((a) => a.id === ID_AVISO_CITA)?.leida).toBe(true);
  });

  it('tocar un aviso sin destino solo lo marca como leído', async () => {
    const llamadas = simularServidor(rutasAvisos());
    const app = montar();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: /^No leído\. Horario de fin de año/ }));

    await waitFor(() => expect(screen.getAllByLabelText('No leído')).toHaveLength(1));
    expect(llamadasA(llamadas, 'PUT', rutaAviso(ID_AVISO_SIN_DESTINO))).toHaveLength(1);
    expect(app.getPathname()).toBe('/notificaciones');
  });

  it('si marcar falla, el aviso vuelve a quedar sin leer y se avisa con un mensaje amable', async () => {
    simularServidor({ ...rutasAvisos(), [`PUT ${rutaAviso(ID_AVISO_SIN_DESTINO)}`]: error500 });
    await montar();

    await fireEvent.press(await screen.findByRole('button', { name: /^No leído\. Horario de fin de año/ }));

    expect(await screen.findByText('No pudimos marcar el aviso como leído. Intenta de nuevo.')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('No leído')).toHaveLength(2);
  });

  it('"Marcar todas como leídas" quita todas las marcas y se deshabilita', async () => {
    const llamadas = simularServidor(rutasAvisos());
    await montar();
    await screen.findByText('Tu cita está confirmada');

    await fireEvent.press(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

    await waitFor(() => expect(screen.queryAllByLabelText('No leído')).toHaveLength(0));
    expect(llamadasA(llamadas, 'PATCH', RUTA_AVISOS_LEIDOS)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
  });

  it('si "Marcar todas" falla, regresan las marcas y sale el mensaje amable', async () => {
    simularServidor({ ...rutasAvisos(), [`PATCH ${RUTA_AVISOS_LEIDOS}`]: error500 });
    await montar();
    await screen.findByText('Tu cita está confirmada');

    await fireEvent.press(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

    expect(await screen.findByText('No pudimos marcar tus avisos como leídos. Intenta de nuevo.')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('No leído')).toHaveLength(2);
  });

  it('borrar quita el aviso de la lista', async () => {
    const llamadas = simularServidor(rutasAvisos());
    await montar();

    await fireEvent.press(await screen.findByRole('button', { name: `Borrar aviso: ${String(AVISO_CITA.titulo)}` }));

    await waitFor(() => expect(screen.queryByText('Tu cita está confirmada')).toBeNull());
    expect(llamadasA(llamadas, 'DELETE', rutaAviso(ID_AVISO_CITA))).toHaveLength(1);
    expect(leerEstadoAvisos().avisos).toHaveLength(AVISOS_FICTICIOS.length - 1);
  });

  it('si borrar falla, el aviso regresa y sale el mensaje amable', async () => {
    simularServidor({ ...rutasAvisos(), [`DELETE ${rutaAviso(ID_AVISO_SIN_DESTINO)}`]: error500 });
    await montar();

    await fireEvent.press(
      await screen.findByRole('button', { name: `Borrar aviso: ${String(AVISO_SIN_DESTINO.titulo)}` }),
    );

    expect(await screen.findByText('No pudimos borrar el aviso. Intenta de nuevo.')).toBeOnTheScreen();
    expect(screen.getByText('Horario de fin de año')).toBeOnTheScreen();
  });
});
