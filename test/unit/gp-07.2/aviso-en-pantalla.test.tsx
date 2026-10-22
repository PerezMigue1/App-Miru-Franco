/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Text } from 'react-native';

import { AvisoEnPantalla } from '@/features/notificaciones/components/AvisoEnPantalla';
import { agregarAviso, leerEstadoAvisos, limpiarAvisos } from '@/features/notificaciones/viewmodels/avisosEstado';
import { duracion } from '@/shared/ui/tokens';

import { AVISOS_FICTICIOS, AVISOS_NORMALIZADOS, rutasAvisos } from '../../helpers/avisosFicticios';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.2: aviso en pantalla. Se monta AvisoEnPantalla sobre un Stack en memoria (como en
 * _layout.tsx) y los avisos entran al estado compartido con agregarAviso, igual que los manda la
 * conexión en vivo. El servidor es ficticio (http://api.test) y los tiempos, falsos.
 */

const [AVISO_CITA, AVISO_PEDIDO, AVISO_SIN_DESTINO] = AVISOS_NORMALIZADOS;
const simularServidor = servidorConRutas({});

function Layout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <AvisoEnPantalla />
    </>
  );
}

function montar(rutaInicial = '/') {
  return iniciarRouter(
    {
      _layout: Layout,
      index: () => <Text>Pantalla de inicio</Text>,
      notificaciones: () => <Text>Pantalla de notificaciones</Text>,
      'cita/[id]': () => <Text>Detalle de la cita</Text>,
    },
    { initialUrl: rutaInicial },
  );
}

const etiqueta = (titulo: string) => `Aviso nuevo: ${titulo}. Toca para abrirlo`;

async function llega(aviso: (typeof AVISOS_NORMALIZADOS)[number]) {
  await act(async () => {
    agregarAviso({ ...aviso });
  });
}

describe('AvisoEnPantalla', () => {
  beforeEach(() => {
    limpiarAvisos();
    simularServidor(rutasAvisos([...AVISOS_FICTICIOS]));
  });

  afterEach(async () => {
    await cerrarRouter();
    limpiarAvisos();
  });

  it('no muestra nada hasta que llega un aviso', async () => {
    await montar();
    expect(await screen.findByText('Pantalla de inicio')).toBeOnTheScreen();
    expect(screen.queryByText('Aviso nuevo')).toBeNull();
  });

  it('muestra el aviso nuevo con su título y se quita solo a los 5 segundos', async () => {
    await montar();
    await screen.findByText('Pantalla de inicio');
    await llega(AVISO_CITA);

    const tarjeta = screen.getByRole('button', { name: etiqueta(AVISO_CITA.titulo) });
    expect(tarjeta).toBeOnTheScreen();
    expect(tarjeta.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText(AVISO_CITA.titulo)).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(duracion.avisoEnPantalla - 1);
    });
    expect(screen.getByRole('button', { name: etiqueta(AVISO_CITA.titulo) })).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('button', { name: etiqueta(AVISO_CITA.titulo) })).toBeNull();
  });

  it('un aviso nuevo reemplaza al anterior y vuelve a contar los 5 segundos', async () => {
    await montar();
    await screen.findByText('Pantalla de inicio');
    await llega(AVISO_CITA);
    await act(async () => {
      jest.advanceTimersByTime(duracion.avisoEnPantalla - 1000);
    });
    await llega(AVISO_SIN_DESTINO);

    expect(screen.queryByRole('button', { name: etiqueta(AVISO_CITA.titulo) })).toBeNull();
    expect(screen.getByRole('button', { name: etiqueta(AVISO_SIN_DESTINO.titulo) })).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(duracion.avisoEnPantalla - 1);
    });
    expect(screen.getByRole('button', { name: etiqueta(AVISO_SIN_DESTINO.titulo) })).toBeOnTheScreen();
  });

  it('al tocarlo lo marca como leído al instante y abre su destino', async () => {
    const app = montar();
    await app;
    await screen.findByText('Pantalla de inicio');
    await llega(AVISO_CITA);

    await fireEvent.press(screen.getByRole('button', { name: etiqueta(AVISO_CITA.titulo) }));

    expect(leerEstadoAvisos().avisos.find((a) => a.id === AVISO_CITA.id)?.leida).toBe(true);
    await waitFor(() => expect(app.getPathname()).toBe('/cita/12'));
    expect(await screen.findByText('Detalle de la cita')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: etiqueta(AVISO_CITA.titulo) })).toBeNull();
  });

  it('un aviso sin destino abre la bandeja de notificaciones', async () => {
    const app = montar();
    await app;
    await screen.findByText('Pantalla de inicio');
    await llega(AVISO_SIN_DESTINO);

    await fireEvent.press(screen.getByRole('button', { name: etiqueta(AVISO_SIN_DESTINO.titulo) }));

    await waitFor(() => expect(app.getPathname()).toBe('/notificaciones'));
    expect(leerEstadoAvisos().noLeidos).toBe(0);
  });

  it('no se muestra con la clienta en la bandeja (el aviso ya está en la lista)', async () => {
    await montar('/notificaciones');
    await screen.findByText('Pantalla de notificaciones');
    await llega(AVISO_PEDIDO);

    expect(leerEstadoAvisos().avisos).toHaveLength(1);
    expect(screen.queryByRole('button', { name: etiqueta(AVISO_PEDIDO.titulo) })).toBeNull();
  });

  it('al desmontarse deja de escuchar: un aviso posterior no lo vuelve a pintar', async () => {
    await montar();
    await screen.findByText('Pantalla de inicio');
    await llega(AVISO_CITA);
    expect(screen.getByRole('button', { name: etiqueta(AVISO_CITA.titulo) })).toBeOnTheScreen();

    await act(async () => {
      screen.unmount();
    });
    // Sin oyente ni temporizador vivos, otro aviso solo entra a la lista.
    agregarAviso({ ...AVISO_PEDIDO });
    expect(leerEstadoAvisos().avisos).toHaveLength(2);
  });
});
