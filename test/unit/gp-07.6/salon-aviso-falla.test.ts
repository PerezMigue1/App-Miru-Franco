/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { useSalonViewModel } from '@/features/salon/viewmodels/useSalonViewModel';
import { refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { sinRedEnRuta } from '../../helpers/citasFicticias';
import { RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.6, revisión final (El salón). Una lectura de la configuración que falla y conserva lo que
 * había en memoria no cambia la configuración, así que no repinta por sí sola. El aviso de la
 * pantalla debe cambiar en cuanto termina cualquier lectura (la de otra pantalla, la de volver a
 * primer plano o la de la pantalla de carga), sin esperar a que se repinte por otra causa.
 */

const simular = servidorConRutas({});
const conConfiguracion = (manejador: Manejador) => simular({ [`GET ${RUTA_CONFIGURACION}`]: manejador });
const errorServidor = () => respuesta({ message: 'Internal server error' }, 500);

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('El salón: el aviso sigue a la última lectura de red', () => {
  it('cambia con una lectura que la pantalla no pidió, sin repintarse por otra causa', async () => {
    const { result } = await renderHook(() => useSalonViewModel());
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinActualizar']);

    conConfiguracion(sinRedEnRuta);
    await act(async () => {
      await refrescar();
    });
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinRed']);

    conConfiguracion(errorServidor);
    await act(async () => {
      await refrescar();
    });
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinActualizar']);
  });

  it('al deslizar para actualizar sin red el aviso dice sin conexión', async () => {
    conConfiguracion(errorServidor);
    await refrescar();
    const { result } = await renderHook(() => useSalonViewModel());
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinActualizar']);

    conConfiguracion(sinRedEnRuta);
    await act(async () => {
      result.current.refrescar();
      await refrescar();
    });
    expect(result.current.refrescando).toBe(false);
    expect(result.current.avisoSinRed).toBe(RESPALDO_TEXTOS['salon.sinRed']);
  });
});
