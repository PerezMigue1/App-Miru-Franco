/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';

import { AccionesCabecera, etiquetaCampana, SesionCabeceraProvider, type SesionCabecera } from '@/shared/ui/AccionesCabecera';

import { cerrarRouter, iniciarRouter } from '../../helpers/router';

/**
 * GP-07.2: contador de avisos sin leer en la campana de la cabecera compartida. Se monta solo
 * AccionesCabecera con un SesionCabecera ficticio (sin features): así se prueba que el número llega
 * por inyección. El contador es solo visual (oculto a TalkBack): el número se lee en la etiqueta.
 */

/** Valores del proveedor ficticio; cada prueba los fija antes de montar. */
const ficticio = { conSesion: true, noLeidos: 0 };
const requiereSesion = jest.fn((accion?: () => void) => accion?.());

const conAvisos: SesionCabecera = {
  useSesion: () => ({ conSesion: ficticio.conSesion, nombre: 'Clienta Ficticia' }),
  useFoto: () => null,
  useRequiereSesion: () => requiereSesion,
  useNoLeidos: () => ficticio.noLeidos,
};

/** Como antes de GP-07.2: sin useNoLeidos (lo que arman las pruebas anteriores). */
const sinHookDeAvisos: SesionCabecera = {
  useSesion: conAvisos.useSesion,
  useFoto: conAvisos.useFoto,
  useRequiereSesion: conAvisos.useRequiereSesion,
};

function montar(sesion: SesionCabecera) {
  function Layout() {
    return (
      <SesionCabeceraProvider sesion={sesion}>
        <Stack screenOptions={{ headerShown: false }} />
      </SesionCabeceraProvider>
    );
  }
  return iniciarRouter(
    {
      _layout: Layout,
      index: () => <AccionesCabecera />,
      notificaciones: () => <Text>Pantalla de notificaciones</Text>,
      perfil: () => <Text>Pantalla de perfil</Text>,
      login: () => <Text>Pantalla de acceso</Text>,
    },
    { initialUrl: '/' },
  );
}

/** Cifras del contador (ocultas a los lectores de pantalla). */
function cifra(texto: string) {
  return screen.queryByText(texto, { includeHiddenElements: true });
}

describe('etiquetaCampana', () => {
  it.each([
    [0, 'Abrir notificaciones'],
    [-1, 'Abrir notificaciones'],
    [1, 'Abrir notificaciones, 1 aviso sin leer'],
    [5, 'Abrir notificaciones, 5 avisos sin leer'],
    [12, 'Abrir notificaciones, 12 avisos sin leer'],
  ])('con %i: "%s"', (noLeidos, esperado) => {
    expect(etiquetaCampana(noLeidos)).toBe(esperado);
  });
});

describe('campana con contador (AccionesCabecera)', () => {
  beforeEach(() => {
    ficticio.conSesion = true;
    ficticio.noLeidos = 0;
    requiereSesion.mockClear();
  });

  afterEach(cerrarRouter);

  it('con sesión y 0 avisos sin leer no muestra número', async () => {
    await montar(conAvisos);
    expect(await screen.findByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();
    expect(cifra('0')).toBeNull();
  });

  it.each([
    [1, '1', 'Abrir notificaciones, 1 aviso sin leer'],
    [5, '5', 'Abrir notificaciones, 5 avisos sin leer'],
    [12, '9+', 'Abrir notificaciones, 12 avisos sin leer'],
  ])('con sesión y %i sin leer muestra "%s" y lo dice en la etiqueta', async (noLeidos, texto, etiqueta) => {
    ficticio.noLeidos = noLeidos;
    await montar(conAvisos);
    expect(await screen.findByRole('button', { name: etiqueta })).toBeOnTheScreen();
    expect(cifra(texto)).toBeTruthy();
  });

  it('la campana con avisos abre /notificaciones', async () => {
    ficticio.noLeidos = 3;
    const app = montar(conAvisos);
    await app;
    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir notificaciones, 3 avisos sin leer' }));
    await waitFor(() => expect(app.getPathname()).toBe('/notificaciones'));
    expect(requiereSesion).toHaveBeenCalledTimes(1);
  });

  it('sin sesión la campana no muestra número aunque el hook diga que hay avisos', async () => {
    ficticio.conSesion = false;
    ficticio.noLeidos = 4;
    await montar(conAvisos);
    expect(await screen.findByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
    expect(cifra('4')).toBeNull();
  });

  it('sin useNoLeidos inyectado la campana queda como antes', async () => {
    await montar(sinHookDeAvisos);
    expect(await screen.findByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
  });
});

/** Muestra el mensaje del error que lanzó su contenido en lugar de romper el árbol. */
class AtraparError extends Component<{ children: ReactNode }, { mensaje: string | null }> {
  state = { mensaje: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { mensaje: error.message };
  }

  render() {
    return this.state.mensaje === null ? this.props.children : <Text>{this.state.mensaje}</Text>;
  }
}

describe('campana sin SesionCabeceraProvider', () => {
  let espiaError: jest.SpyInstance;

  beforeEach(() => {
    // React informa el error atrapado por consola; aquí es lo esperado.
    espiaError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await cerrarRouter();
    espiaError.mockRestore();
  });

  it('es un error de armado de la app: lo dice claro en lugar de pintar una campana sin sesión', async () => {
    await iniciarRouter(
      {
        index: () => (
          <AtraparError>
            <AccionesCabecera />
          </AtraparError>
        ),
      },
      { initialUrl: '/' },
    );

    expect(await screen.findByText('AccionesCabecera debe usarse dentro de SesionCabeceraProvider.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Abrir notificaciones' })).toBeNull();
  });
});
