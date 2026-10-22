/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { cargarConfiguracion, estadoConfiguracion, refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useTextos } from '@/shared/api/useTextos';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';
import { rutaConTextos, sembrarTextosGuardados, TEXTOS_SERVIDOR } from '../../helpers/textosFicticios';

/**
 * GP-07.3: de dónde salen los textos del sitio. textosSitio no pide nada: lee la configuración que
 * el repositorio tiene en memoria (red, archivo guardado o respaldo), y useTextos se vuelve a pintar
 * cuando llega una versión nueva (patrón Observer). fetch y expo-file-system van simulados.
 */

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const simularServidor = servidorConRutas({});
const CLAVE = 'inicio.galeria.titulo';
const DEL_SERVIDOR = TEXTOS_SERVIDOR[CLAVE];
const DEL_RESPALDO = 'Nuestro trabajo';

/** fetch que rechaza como sin red. */
function sinRed(): void {
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

const peticiones = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta === RUTA_CONFIGURACION);

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

espiarConsola(() => Promise.resolve(), true);

describe('caché y respaldo del catálogo', () => {
  it.each([
    ['configuración de red', 'red', DEL_SERVIDOR, () => simularServidor(rutaConTextos())],
    ['archivo guardado sin red', 'archivo', 'Galería ficticia guardada', () => {
      sembrarTextosGuardados({ [CLAVE]: 'Galería ficticia guardada' });
      sinRed();
    }],
    ['sin red ni archivo', 'respaldo', DEL_RESPALDO, sinRed],
  ])('%s: el texto sale de %s', async (_caso, origen, esperado, preparar) => {
    preparar();

    await cargarConfiguracion();

    expect(estadoConfiguracion().origen).toBe(origen);
    expect(obtenerTexto(CLAVE)).toBe(esperado);
  });

  it('pedir textos no hace peticiones: solo la carga de la configuración sale a la red', async () => {
    const llamadas = simularServidor(rutaConTextos());
    await cargarConfiguracion();

    obtenerTexto(CLAVE);
    obtenerTexto('citas.aviso');

    expect(peticiones(llamadas)).toHaveLength(1);
    expect(llamadas).toHaveLength(1);
  });
});

describe('useTextos', () => {
  it('se actualiza al llegar una versión nueva y mantiene la misma función mientras no cambia', async () => {
    simularServidor(rutaConTextos());
    const { result, rerender, unmount } = await renderHook(() => useTextos());
    const inicial = result.current;

    expect(inicial(CLAVE)).toBe(DEL_RESPALDO);
    await rerender({});
    expect(result.current).toBe(inicial);

    await act(async () => {
      await refrescar();
    });

    expect(result.current).not.toBe(inicial);
    expect(result.current(CLAVE)).toBe(DEL_SERVIDOR);
    expect(result.current('inicio.promociones.vigencia', { fecha: '1 de enero' })).toBe('Promoción ficticia hasta el 1 de enero.');
    await unmount();
  });
});
