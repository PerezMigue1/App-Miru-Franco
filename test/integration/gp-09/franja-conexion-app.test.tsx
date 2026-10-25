/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import * as SecureStore from 'expo-secure-store';
import { act, screen } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { ESPERA_LENTA_MS, reiniciarEstadoConexion } from '@/shared/api/estadoConexion';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { abrirApp, cerrarIntroSiAparece, LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { CATALOGOS_VACIOS, leerLlamada, respuesta, servidorConRutas } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-09, bloque A5, con el layout real (src/app/_layout.tsx): cuando el servidor tarda en despertar
 * (Render tras 15 minutos sin uso), la app muestra "Conectando con el salón…" a los 3 s y lo quita al
 * llegar la respuesta. Nunca muestra "Sin conexión" por tardar. Servidor simulado en
 * http://api.test y temporizadores falsos.
 */

const TEXTO = RESPALDO_TEXTOS['red.conectando'];
const INICIO = 'Crea tu cuenta para reservar citas y comprar';
const simularServidor = servidorConRutas(CATALOGOS_VACIOS);

/**
 * El servidor de fondo, pero la primera lectura de la ruta queda sin respuesta hasta soltarla (como
 * Render despertando). Devuelve cómo soltarla.
 */
function conPrimeraLecturaLenta(rutaLenta: string): () => Promise<void> {
  simularServidor({});
  const base = globalThis.fetch;
  let soltar: (() => void) | null = null;
  let retenida = false;
  globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
    const { metodo, ruta } = leerLlamada(entrada, init);
    if (!retenida && `${metodo} ${ruta}` === rutaLenta) {
      retenida = true;
      return new Promise<Response>((resolver) => {
        soltar = () => resolver(respuesta({ success: true, count: 0, data: [] }));
      });
    }
    return base(entrada as RequestInfo, init);
  }) as unknown as typeof fetch;
  return async () => {
    await act(async () => {
      soltar?.();
    });
  };
}

describe('Franja "Conectando con el salón…" en la app (GP-09)', () => {
  const revisarConsola = prepararPruebasDePantalla();

  beforeEach(async () => {
    reiniciarConfiguracionPublica();
    reiniciarEstadoConexion();
    limpiarArchivos();
    jest.useFakeTimers();
    await SecureStore.setItemAsync('bienvenida_vista', '1');
  });

  it(
    'aparece cuando una petición lleva más de 3 s y se quita al llegar la respuesta',
    async () => {
      const soltar = conPrimeraLecturaLenta('GET /api/productos');
      await abrirApp('/inicio');
      await cerrarIntroSiAparece();
      expect(await screen.findByText(INICIO)).toBeOnTheScreen();
      expect(screen.queryByText(TEXTO)).toBeNull();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS);
      });
      expect(screen.getByLabelText(TEXTO)).toBeOnTheScreen();
      expect(screen.queryByText(/sin conexi/i)).toBeNull();

      await soltar();
      expect(screen.queryByText(TEXTO)).toBeNull();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'con respuestas a tiempo nunca aparece',
    async () => {
      simularServidor({});
      await abrirApp('/inicio');
      await cerrarIntroSiAparece();
      expect(await screen.findByText(INICIO)).toBeOnTheScreen();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(ESPERA_LENTA_MS * 3);
      });

      expect(screen.queryByText(TEXTO)).toBeNull();
      revisarConsola();
    },
    LIMITE_MS,
  );
});
