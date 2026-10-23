/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import * as SplashScreen from 'expo-splash-screen';
import { act, screen, waitFor } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import {
  obtenerConfiguracion,
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
  TIEMPO_MAXIMO_CARGA_MS,
  VIGENCIA_CONFIGURACION_MS,
} from '@/shared/api/configuracionPublica';

import { leerArchivo, limpiarArchivos } from '../../helpers/archivosLocales';
import { sinRedEnRuta } from '../../helpers/citasFicticias';
import {
  ARCHIVO_CONFIGURACION,
  CONFIGURACION_COMPLETA,
  CONFIGURACION_COMPLETA_EN_ARCHIVO,
  CONFIGURACION_GUARDADA,
  contenidoArchivo,
  respuestaCompleta,
  rutaConfiguracion,
  RUTA_CONFIGURACION,
  sembrarConfiguracionGuardada,
} from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { abrirApp, LIMITE_MS, type App } from '../../helpers/pantallas';
import { respuestaRetenida } from '../../helpers/pantallasServicios';
import { cerrarRouter } from '../../helpers/router';
import { CATALOGOS_VACIOS, llamadasA, respuesta, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.1: la carga de la configuración pública del salón al abrir la app, con el layout real
 * (renderRouter sobre src/app), el servidor simulado y el disco simulado (archivosLocales). La
 * pantalla de carga espera a la configuración a lo más TIEMPO_MAXIMO_CARGA_MS y luego sigue con lo
 * guardado o el respaldo; al volver a primer plano se pide de nuevo solo si la caché venció.
 *
 * Ninguna pantalla pinta todavía la configuración (eso es GP-07.6): lo que queda disponible para las
 * pantallas se revisa con obtenerConfiguracion() y el archivo guardado en el disco simulado.
 */

const simularServidor = servidorConRutas(CATALOGOS_VACIOS);
/** Texto de Inicio sin sesión: la app ya salió de la pantalla de carga. */
const INICIO = 'Crea tu cuenta para reservar citas y comprar';
const ocultarSplash = SplashScreen.hideAsync as jest.Mock;
const oyentesAppState = AppState.addEventListener as unknown as jest.Mock;

const pedidasDeConfiguracion = (llamadas: Llamada[]) => llamadasA(llamadas, 'GET', RUTA_CONFIGURACION);

/** Abre la app en '/' y espera a ver Inicio. */
async function abrirEnInicio(): Promise<App> {
  const app = await abrirApp('/');
  expect(await screen.findByText(INICIO)).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/inicio');
  return app;
}

/** La app sigue en la pantalla de carga: el splash no se ocultó y nada de Inicio está montado. */
function sigueEnSplash(): void {
  expect(ocultarSplash).not.toHaveBeenCalled();
  expect(screen.queryByText(INICIO)).not.toBeOnTheScreen();
}

/** Avisa a los oyentes de AppState registrados desde `desde` que la app fue al fondo y volvió. */
async function volverAPrimerPlano(desde: number): Promise<void> {
  const oyentes = oyentesAppState.mock.calls
    .slice(desde)
    .filter(([evento]) => evento === 'change')
    .map(([, oyente]) => oyente as (estado: string) => void);
  expect(oyentes.length).toBeGreaterThan(0);
  for (const estado of ['background', 'active']) {
    await act(async () => {
      for (const oyente of oyentes) {
        oyente(estado);
      }
    });
  }
}

describe('Carga de la configuración pública al abrir la app (GP-07.1)', () => {
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    limpiarArchivos();
    ocultarSplash.mockClear();
  });

  espiarConsola(cerrarRouter, true);

  it(
    'abre Inicio con la configuración del servidor, pedida una vez y guardada en el archivo',
    async () => {
      const llamadas = simularServidor(rutaConfiguracion());

      await abrirEnInicio();

      expect(ocultarSplash).toHaveBeenCalledTimes(1);
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);
      expect(pedidasDeConfiguracion(llamadas)[0].cabeceras.Authorization).toBeUndefined();
      expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA);
      const guardado = JSON.parse(leerArchivo(ARCHIVO_CONFIGURACION) ?? 'null') as {
        version: number;
        configuracion: unknown;
      };
      expect(guardado.version).toBe(1);
      // GP-07.5: el archivo nunca guarda los datos de transferencia.
      expect(guardado.configuracion).toEqual(CONFIGURACION_COMPLETA_EN_ARCHIVO);
    },
    LIMITE_MS,
  );

  it(
    'sin red y sin nada guardado abre Inicio con el respaldo antes del tiempo máximo',
    async () => {
      const llamadas = simularServidor({ [`GET ${RUTA_CONFIGURACION}`]: sinRedEnRuta });
      const inicio = Date.now();

      await abrirEnInicio();

      // El reloj falso de renderRouter cuenta lo que avanzó la espera: no llegó al límite.
      expect(Date.now() - inicio).toBeLessThan(TIEMPO_MAXIMO_CARGA_MS);
      expect(ocultarSplash).toHaveBeenCalledTimes(1);
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);
      expect(obtenerConfiguracion()).toBe(RESPALDO_CONFIGURACION);
      expect(leerArchivo(ARCHIVO_CONFIGURACION)).toBeUndefined();
    },
    LIMITE_MS,
  );

  it(
    'sin red y con las fuentes sin cargar tampoco se queda en el splash: abre Inicio con el respaldo',
    async () => {
      const usarFuentes = jest.requireMock<{ useFonts: jest.Mock }>('expo-font').useFonts;
      usarFuentes.mockReturnValue([false, new Error('Fuente ficticia sin cargar')]);
      try {
        simularServidor({ [`GET ${RUTA_CONFIGURACION}`]: sinRedEnRuta });

        await abrirEnInicio();

        expect(ocultarSplash).toHaveBeenCalledTimes(1);
        expect(obtenerConfiguracion()).toBe(RESPALDO_CONFIGURACION);
      } finally {
        usarFuentes.mockReturnValue([true, null]);
      }
    },
    LIMITE_MS,
  );

  it(
    'sin red y con una configuración guardada abre Inicio con lo guardado sin tocar el archivo',
    async () => {
      sembrarConfiguracionGuardada();
      const llamadas = simularServidor({ [`GET ${RUTA_CONFIGURACION}`]: sinRedEnRuta });

      await abrirEnInicio();

      expect(ocultarSplash).toHaveBeenCalledTimes(1);
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);
      expect(obtenerConfiguracion()).toEqual(CONFIGURACION_GUARDADA);
      expect(leerArchivo(ARCHIVO_CONFIGURACION)).toBe(contenidoArchivo());
    },
    LIMITE_MS,
  );

  it(
    'con el servidor lento sale del splash al cumplirse el tiempo máximo y la versión nueva llega después sin recargar',
    async () => {
      const lenta = respuestaRetenida(respuestaCompleta());
      const llamadas = simularServidor({ [`GET ${RUTA_CONFIGURACION}`]: lenta.manejador });

      const app = await abrirApp('/');
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);

      // Un instante antes del límite la app sigue esperando a la configuración.
      await act(async () => {
        jest.advanceTimersByTime(TIEMPO_MAXIMO_CARGA_MS - 1);
      });
      sigueEnSplash();

      // Al cumplirse el límite abre Inicio con el respaldo (no hay nada guardado).
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(await screen.findByText(INICIO)).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/inicio');
      expect(ocultarSplash).toHaveBeenCalledTimes(1);
      expect(obtenerConfiguracion()).toBe(RESPALDO_CONFIGURACION);
      expect(leerArchivo(ARCHIVO_CONFIGURACION)).toBeUndefined();

      // El servidor responde: la versión nueva queda disponible y guardada, sin otra petición ni
      // volver a la pantalla de carga.
      await lenta.soltar();
      await waitFor(() => expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA));
      expect(leerArchivo(ARCHIVO_CONFIGURACION)).toContain('Salón Ficticio de Prueba');
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);
      expect(ocultarSplash).toHaveBeenCalledTimes(1);
      expect(screen.getByText(INICIO)).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/inicio');
    },
    LIMITE_MS,
  );

  it(
    'al volver a primer plano con la caché vencida pide la configuración otra vez y se queda con la nueva',
    async () => {
      let veces = 0;
      let respondidaEn = 0;
      const llamadas = simularServidor({
        [`GET ${RUTA_CONFIGURACION}`]: () => {
          veces += 1;
          respondidaEn = Date.now();
          const cuerpo = respuestaCompleta();
          if (veces > 1) {
            cuerpo.salon = { ...(cuerpo.salon as object), nombre: 'Salón con Datos Nuevos' };
          }
          return respuesta(cuerpo);
        },
      });
      const oyentesPrevios = oyentesAppState.mock.calls.length;
      await abrirEnInicio();
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);

      // Pasan los minutos de vigencia desde la respuesta, sin correr los temporizadores de la app.
      jest.setSystemTime(respondidaEn + VIGENCIA_CONFIGURACION_MS);
      await volverAPrimerPlano(oyentesPrevios);

      await waitFor(() => expect(pedidasDeConfiguracion(llamadas)).toHaveLength(2));
      await waitFor(() => expect(obtenerConfiguracion().salon.nombre).toBe('Salón con Datos Nuevos'));
      expect(leerArchivo(ARCHIVO_CONFIGURACION)).toContain('Salón con Datos Nuevos');
      expect(screen.getByText(INICIO)).toBeOnTheScreen();
      expect(ocultarSplash).toHaveBeenCalledTimes(1);
    },
    LIMITE_MS,
  );

  it(
    'al volver a primer plano con la caché vigente no vuelve a pedir la configuración',
    async () => {
      let respondidaEn = 0;
      const llamadas = simularServidor({
        [`GET ${RUTA_CONFIGURACION}`]: () => {
          respondidaEn = Date.now();
          return respuesta(respuestaCompleta());
        },
      });
      const oyentesPrevios = oyentesAppState.mock.calls.length;
      await abrirEnInicio();
      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);

      // Falta un instante para que venza la caché.
      jest.setSystemTime(respondidaEn + VIGENCIA_CONFIGURACION_MS - 1);
      await volverAPrimerPlano(oyentesPrevios);
      await act(async () => {
        jest.advanceTimersByTime(TIEMPO_MAXIMO_CARGA_MS);
      });

      expect(pedidasDeConfiguracion(llamadas)).toHaveLength(1);
      expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA);
      expect(screen.getByText(INICIO)).toBeOnTheScreen();
    },
    LIMITE_MS,
  );
});
