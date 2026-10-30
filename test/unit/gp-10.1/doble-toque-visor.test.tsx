/// <reference types="jest" />

import { act, cleanup, renderHook } from '@testing-library/react-native';

import { useRegistroViewModel } from '@/features/auth/viewmodels/useRegistroViewModel';
import { useCasillaPoliticaAnticipos } from '@/features/citas/viewmodels/useCasillaPoliticaAnticipos';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { useAbrirUnaVez } from '@/shared/ui/useAbrirUnaVez';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { espiarConsola } from '../../helpers/consola';
import { servidorConRutas } from '../../helpers/servidorSimulado';
import { reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => {
  const react = require('react');
  const simulado = require('../../helpers/viewmodelsAuth');
  return {
    ...simulado.expoRouterSimulado(),
    usePathname: () => '/registro',
    // Como el real: corre al montar y cuando cambia el callback; la prueba lo repite con reenfocar().
    useFocusEffect: (efecto: () => void | (() => void)) => {
      react.useEffect(() => {
        mockEnfocadas.add(efecto);
        const limpiar = efecto();
        return () => {
          mockEnfocadas.delete(efecto);
          if (typeof limpiar === 'function') limpiar();
        };
      }, [efecto]);
    },
  };
});
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-10.1, defecto 3: un doble toque en el enlace de un documento legal abría dos visores. Cada
 * acción que abre el visor navega una sola vez hasta que la pantalla vuelve a enfocarse. fetch
 * simulado (http://api.test) y expo-router simulado.
 */

/** Efectos de enfoque de las pantallas montadas (los registra el useFocusEffect simulado). */
const mockEnfocadas = new Set<() => void | (() => void)>();

/** La pantalla vuelve a enfocarse (por ejemplo, al regresar del visor). */
const reenfocar = () =>
  act(async () => {
    mockEnfocadas.forEach((efecto) => {
      efecto();
    });
  });

const simularServidor = servidorConRutas({});

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  reiniciarDocumentosLegales();
  limpiarArchivos();
  simularServidor({});
});
espiarConsola(async () => {
  await cleanup();
  mockEnfocadas.clear();
}, true);

/** Toca dos veces seguidas, en el mismo cuadro. */
const dobleToque = (accion: () => void) =>
  act(async () => {
    accion();
    accion();
  });

describe('useAbrirUnaVez', () => {
  it('navega una sola vez por toque doble, se libera al volver a enfocar y no abre nada al montar', async () => {
    const { result } = await renderHook(() => useAbrirUnaVez());
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await dobleToque(() => result.current('/legal/cookies'));
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
    expect(routerSimulado.push).toHaveBeenCalledWith('/legal/cookies');

    await act(async () => {
      result.current('/legal/reembolsos');
    });
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);

    await reenfocar();
    await dobleToque(() => result.current('/legal/reembolsos'));
    expect(routerSimulado.push).toHaveBeenCalledTimes(2);
    expect(routerSimulado.push).toHaveBeenLastCalledWith('/legal/reembolsos');
  });
});

describe('doble toque en los enlaces al visor de documentos legales (GP-10.1)', () => {
  it('la casilla de la Política de anticipos abre el visor una sola vez y se libera al volver a enfocar', async () => {
    const { result } = await renderHook(() => useCasillaPoliticaAnticipos());

    await dobleToque(() => result.current.abrirPolitica());
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
    expect(routerSimulado.push).toHaveBeenCalledWith('/legal/anticipos');

    await reenfocar();
    await act(async () => {
      result.current.abrirPolitica();
    });
    expect(routerSimulado.push).toHaveBeenCalledTimes(2);
  });

  it('los Términos del registro abren el visor una sola vez y se liberan al volver a enfocar', async () => {
    const { result } = await renderHook(() => useRegistroViewModel());

    await dobleToque(() => result.current.abrirTerminos());
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
    expect(routerSimulado.push).toHaveBeenCalledWith('/legal/terminos');

    await reenfocar();
    await act(async () => {
      result.current.abrirTerminos();
    });
    expect(routerSimulado.push).toHaveBeenCalledTimes(2);
  });
});
