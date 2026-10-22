/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useInicioViewModel } from '@/features/inicio/viewmodels/useInicioViewModel';
import { usePantallaInicio } from '@/features/inicio/viewmodels/usePantallaInicio';
import { useSalonViewModel } from '@/features/salon/viewmodels/useSalonViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { respuestaCompleta, RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { CATALOGOS_VACIOS, llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { cuerpoListaTienda, RUTA_CATALOGO_TIENDA, rutasCatalogoTienda } from '../../helpers/tiendaFicticia';
import { diferida, enSecuencia, reiniciarSimulaciones, servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.3: el deslizar para actualizar de Inicio (usePantallaInicio) y de El salón
 * (useSalonViewModel) con renderHook. El indicador se enciende al deslizar y se apaga cuando la
 * configuración llega; si la pantalla se desmonta antes, la respuesta que llega después no escribe
 * estado ni deja errores en la consola. Solo se simulan fetch (http://api.test, con la
 * configuración retenida hasta que la prueba la suelta), expo-router y expo-file-system (en memoria).
 * También: en Inicio una lectura vieja del catálogo que llega tarde no pisa la nueva.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

espiarConsola(() => Promise.resolve(), true);

interface ConRefresco {
  refrescando: boolean;
  refrescar: () => void;
}

const PANTALLAS: [string, () => ConRefresco][] = [
  ['Inicio', usePantallaInicio],
  ['El salón', useSalonViewModel],
];

describe('deslizar para actualizar de Inicio y El salón (GP-07.3)', () => {
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    limpiarArchivos();
    reiniciarSimulaciones();
  });

  it.each(PANTALLAS)(
    'en %s el indicador se apaga cuando llega la configuración y, desmontada, la respuesta tardía no escribe estado',
    async (_pantalla, usar) => {
      // Cada petición de la configuración espera hasta soltarTodas().
      const pendientes: ((r: Response) => void)[] = [];
      const llamadas = servidorVm({
        ...CATALOGOS_VACIOS,
        [`GET ${RUTA_CONFIGURACION}`]: () => {
          const retenida = diferida();
          pendientes.push(retenida.soltar);
          return retenida.promesa;
        },
      });
      const soltarTodas = () =>
        act(async () => {
          for (const soltar of pendientes.splice(0)) {
            soltar(respuesta(respuestaCompleta()));
          }
        });

      const { result, unmount } = await renderHook(usar);
      await soltarTodas();
      const previas = llamadasA(llamadas, 'GET', RUTA_CONFIGURACION).length;

      await act(async () => result.current.refrescar());
      expect(result.current.refrescando).toBe(true);
      await soltarTodas();
      await waitFor(() => expect(result.current.refrescando).toBe(false));

      await act(async () => result.current.refrescar());
      expect(result.current.refrescando).toBe(true);
      await unmount();
      await soltarTodas();

      expect(llamadasA(llamadas, 'GET', RUTA_CONFIGURACION)).toHaveLength(previas + 2);
    },
  );

  it('en Inicio, si el catálogo viejo llega después del nuevo (Reintentar dos veces), se queda el nuevo', async () => {
    // La primera lectura del catálogo trae productos pero tarda; la segunda llega vacía al instante.
    const vieja = diferida();
    const catalogoLleno = rutasCatalogoTienda()[RUTA_CATALOGO_TIENDA];
    servidorVm({
      ...CATALOGOS_VACIOS,
      [RUTA_CATALOGO_TIENDA]: enSecuencia(
        () => vieja.promesa,
        () => respuesta(cuerpoListaTienda([])),
      ),
    });
    const { result } = await renderHook(useInicioViewModel);

    await act(async () => result.current.recargar());
    await waitFor(() => expect(result.current.estadoProductos).toBe('listo'));
    await act(async () => vieja.soltar(catalogoLleno(undefined)));

    expect(result.current.productosDestacados).toEqual([]);
    expect(result.current.estadoProductos).toBe('listo');
  });
});
