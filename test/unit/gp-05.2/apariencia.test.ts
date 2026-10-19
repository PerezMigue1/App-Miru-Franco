/// <reference types="jest" />

import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { Text } from 'react-native';

import { borrarSesion } from '@/shared/api/tokenStorage';
import { AparienciaProvider, useApariencia } from '@/shared/ui/apariencia';
import {
  bienvenidaVista,
  guardarApariencia,
  leerApariencia,
  marcarBienvenidaVista,
  type PreferenciaApariencia,
} from '@/shared/ui/preferencias';

import { CLIENTA } from '../../helpers/perfilClienta';
import { leerSecureStore } from '../../helpers/secureStore';
import { CLAVE_SESION, sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-05.2 (#18): apariencia elegida en Perfil (src/shared/ui/apariencia.tsx y
 * src/shared/ui/preferencias.ts). Revisa que la preferencia sistema, claro u oscuro se guarde en
 * SecureStore (simulado en memoria por test/setup.ts), que se restaure al reabrir la app, que
 * sobreviva al cierre de sesión y que un valor inválido no rompa nada. Lo básico del proveedor y
 * de useTheme ya lo cubre test/unit/gp-04/tema-y-tokens.test.ts; aquí se ve el recorrido completo.
 */

// Se espía Appearance.setColorScheme (lo demás de Appearance es el real) para saber qué esquema
// recibe React Native en cada paso.
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  ...jest.requireActual<object>('react-native/Libraries/Utilities/Appearance'),
  setColorScheme: jest.fn(),
}));

interface SecureStoreEspiado {
  getItemAsync: jest.Mock<Promise<string | null>, [string]>;
  setItemAsync: jest.Mock<Promise<void>, [string, string]>;
}

const almacenSeguro = jest.requireMock<SecureStoreEspiado>('expo-secure-store');
const fijarEsquema = jest.requireMock<{ setColorScheme: jest.Mock<void, [string]> }>(
  'react-native/Libraries/Utilities/Appearance',
).setColorScheme;

const CLAVE = 'preferencia_apariencia';

/** Esquema que recibe Appearance por cada preferencia. */
const ESQUEMA: Record<PreferenciaApariencia, string> = {
  sistema: 'unspecified',
  claro: 'light',
  oscuro: 'dark',
};

const PREFERENCIAS: PreferenciaApariencia[] = ['sistema', 'claro', 'oscuro'];

beforeEach(() => {
  fijarEsquema.mockClear();
});

/** Abre la "app": monta el proveedor real y espera a que lea la preferencia guardada. */
async function abrirApp() {
  const app = await renderHook(() => useApariencia(), { wrapper: AparienciaProvider });
  await waitFor(() => expect(app.result.current.lista).toBe(true));
  return app;
}

/** Cambia la preferencia desde el hook, como lo hace la pantalla de Perfil. */
async function elegir(app: Awaited<ReturnType<typeof abrirApp>>, preferencia: PreferenciaApariencia) {
  await act(async () => {
    app.result.current.cambiar(preferencia);
  });
}

describe('preferencias.ts: guardar y leer la apariencia', () => {
  it.each(PREFERENCIAS)('"%s" se guarda y se vuelve a leer igual', async (preferencia) => {
    await guardarApariencia(preferencia);
    expect(leerSecureStore()[CLAVE]).toBe(preferencia);
    await expect(leerApariencia()).resolves.toBe(preferencia);
  });

  it('sin nada guardado, la apariencia es "sistema"', async () => {
    await expect(leerApariencia()).resolves.toBe('sistema');
    expect(almacenSeguro.getItemAsync).toHaveBeenCalledWith(CLAVE);
  });

  it('la última preferencia guardada es la que queda', async () => {
    await guardarApariencia('claro');
    await guardarApariencia('oscuro');
    await guardarApariencia('sistema');
    expect(leerSecureStore()).toEqual({ [CLAVE]: 'sistema' });
  });

  it.each(['dark', 'light', 'unspecified', ' claro', 'Sistema', 'null'])(
    'el valor inválido "%s" se lee como "sistema"',
    async (valor) => {
      await almacenSeguro.setItemAsync(CLAVE, valor);
      await expect(leerApariencia()).resolves.toBe('sistema');
    },
  );

  it.each<[string, () => Promise<unknown>, 'getItemAsync' | 'setItemAsync', unknown]>([
    // [función, llamada, método de SecureStore que falla, resultado]
    ['leerApariencia', () => leerApariencia(), 'getItemAsync', 'sistema'],
    ['guardarApariencia', () => guardarApariencia('oscuro'), 'setItemAsync', undefined],
    ['bienvenidaVista', () => bienvenidaVista(), 'getItemAsync', true],
    ['marcarBienvenidaVista', () => marcarBienvenidaVista(), 'setItemAsync', undefined],
  ])('si SecureStore falla, %s no lanza', async (_funcion, llamar, metodo, esperado) => {
    almacenSeguro[metodo].mockRejectedValueOnce(new Error('falla ficticia de SecureStore'));
    await expect(llamar()).resolves.toBe(esperado);
  });
});

describe('la apariencia y la sesión', () => {
  it('guardar la apariencia no toca la sesión guardada', async () => {
    await sembrarSesion(CLIENTA);
    const sesionAntes = leerSecureStore()[CLAVE_SESION];

    await guardarApariencia('oscuro');

    expect(leerSecureStore()[CLAVE_SESION]).toBe(sesionAntes);
  });

  it('cerrar sesión borra la sesión pero conserva la apariencia y la bienvenida', async () => {
    await sembrarSesion(CLIENTA);
    await guardarApariencia('oscuro');
    await marcarBienvenidaVista();

    await borrarSesion();

    const guardado = leerSecureStore();
    expect(guardado[CLAVE_SESION]).toBeUndefined();
    expect(guardado[CLAVE]).toBe('oscuro');
    await expect(leerApariencia()).resolves.toBe('oscuro');
    await expect(bienvenidaVista()).resolves.toBe(true);
  });
});

describe('AparienciaProvider: elegir y restaurar', () => {
  it.each(PREFERENCIAS)('"%s" elegida se restaura al reabrir la app', async (preferencia) => {
    const primera = await abrirApp();
    await elegir(primera, preferencia);
    await waitFor(() => expect(leerSecureStore()[CLAVE]).toBe(preferencia));
    await primera.unmount();
    fijarEsquema.mockClear();

    const segunda = await abrirApp();

    expect(segunda.result.current.preferencia).toBe(preferencia);
    expect(fijarEsquema).toHaveBeenCalledTimes(1);
    expect(fijarEsquema).toHaveBeenCalledWith(ESQUEMA[preferencia]);
  });

  it('varios cambios seguidos aplican cada esquema en orden y guardan el último', async () => {
    const app = await abrirApp();
    fijarEsquema.mockClear();

    await elegir(app, 'oscuro');
    await elegir(app, 'claro');
    await elegir(app, 'sistema');

    expect(fijarEsquema.mock.calls).toEqual([['dark'], ['light'], ['unspecified']]);
    expect(app.result.current.preferencia).toBe('sistema');
    await waitFor(() => expect(leerSecureStore()[CLAVE]).toBe('sistema'));
  });

  it('un valor inválido guardado abre en "sistema" y el siguiente cambio lo reemplaza', async () => {
    await almacenSeguro.setItemAsync(CLAVE, 'Oscuro');
    const app = await abrirApp();
    expect(app.result.current.preferencia).toBe('sistema');
    expect(fijarEsquema).toHaveBeenCalledWith('unspecified');

    await elegir(app, 'oscuro');

    await waitFor(() => expect(leerSecureStore()[CLAVE]).toBe('oscuro'));
  });

  it('si no se pudo guardar, al reabrir vuelve la preferencia anterior', async () => {
    await guardarApariencia('claro');
    const primera = await abrirApp();
    almacenSeguro.setItemAsync.mockRejectedValueOnce(new Error('falla ficticia de SecureStore'));

    await elegir(primera, 'oscuro');
    expect(primera.result.current.preferencia).toBe('oscuro');
    await primera.unmount();

    const segunda = await abrirApp();
    expect(segunda.result.current.preferencia).toBe('claro');
  });

  it('si Appearance falla al aplicar la guardada, la app queda lista con "sistema"', async () => {
    await guardarApariencia('oscuro');
    fijarEsquema.mockImplementationOnce(() => {
      throw new Error('falla ficticia de Appearance');
    });

    const app = await abrirApp();

    expect(app.result.current.preferencia).toBe('sistema');
  });

  it('si se cierra antes de leer, esa lectura se descarta y la siguiente apertura sí aplica', async () => {
    let soltarLectura: (valor: string | null) => void = () => undefined;
    almacenSeguro.getItemAsync.mockReturnValueOnce(
      new Promise<string | null>((resolve) => {
        soltarLectura = resolve;
      }),
    );
    const cerrada = await renderHook(() => useApariencia(), { wrapper: AparienciaProvider });
    await cerrada.unmount();
    await act(async () => {
      soltarLectura('claro');
    });
    expect(fijarEsquema).not.toHaveBeenCalled();

    await guardarApariencia('oscuro');
    const app = await abrirApp();
    expect(app.result.current.preferencia).toBe('oscuro');
    expect(fijarEsquema).toHaveBeenCalledWith('dark');
  });

  it('fuera del proveedor, elegir no aplica ni guarda nada', async () => {
    const { result } = await renderHook(() => useApariencia());
    result.current.cambiar('oscuro');
    expect(fijarEsquema).not.toHaveBeenCalled();
    expect(leerSecureStore()).toEqual({});
  });

  it('pinta a sus hijos aunque todavía no termine de leer la preferencia', async () => {
    almacenSeguro.getItemAsync.mockReturnValueOnce(new Promise<string | null>(() => undefined));
    function Lectora() {
      const { preferencia, lista } = useApariencia();
      return createElement(Text, null, `${preferencia} ${lista ? 'lista' : 'leyendo'}`);
    }

    await render(createElement(AparienciaProvider, null, createElement(Lectora)));

    expect(screen.getByText('sistema leyendo')).toBeTruthy();
    expect(fijarEsquema).not.toHaveBeenCalled();
  });
});
