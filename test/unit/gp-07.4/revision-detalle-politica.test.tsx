/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { opcionesPagoDeCita } from '@/features/citas/models/gestionCitaModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { obtenerConfiguracion } from '@/shared/api/configuracionPublica';
import { obtenerDocumentoVigente } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, citaConAnticipo, citaEnSalon, ID_CITA, masMinutos, rutaCita } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { documentoCrudo, HASH_VIGENTE, rutaVigente } from '../../helpers/documentosFicticios';
import { citaComo, conReglas, hacer, normalizada, reiniciarRepositorios, servidorGestion, turnos } from '../../helpers/gestionCitas';
import { consentimientosEnviados } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * Revisión de GP-07.4 en el detalle de la cita: la casilla de la Política de anticipos registra la
 * versión que estaba a la vista al marcarla y se desmarca si la vigente cambia; y con el plazo del
 * anticipo ya pasado (o sin plazo) no se ofrece ningún pago, porque el backend rechaza los dos con
 * 409 y el detalle pide no pagar de nuevo. fetch y expo-router simulados.
 */

const RUTA_DOCUMENTO = `GET ${rutaVigente('anticipos')}`;
const HASH_NUEVO = 'c'.repeat(64);
const SEIS_MINUTOS = 6 * 60 * 1000;
const ACTUALIZADA = RESPALDO_TEXTOS['citas.politicaAnticipos.actualizada'];

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

const VERSION_NUEVA = () => respuesta({ success: true, data: documentoCrudo('anticipos', { version: '2.4', hash: HASH_NUEVO }) });

/** Abre el detalle con la política 2.3 hasta que la prueba publique la nueva (por omisión, la 2.4). */
async function abrirDetalle(publicada: () => Response = VERSION_NUEVA) {
  let nueva = false;
  const llamadas = await servidorGestion({
    [rutaCita()]: turnos(citaComo(conReglas(citaConAnticipo()))),
    [RUTA_DOCUMENTO]: () => (nueva ? publicada() : respuesta({ success: true, data: documentoCrudo('anticipos') })),
  });
  const hook = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  // La casilla precarga la política al montarse (CasillaPoliticaAnticipos).
  await act(async () => {
    await obtenerDocumentoVigente('anticipos');
  });
  return { ...hook, llamadas, publicarNueva: () => (nueva = true) };
}

const versiones = (llamadas: Parameters<typeof consentimientosEnviados>[0]) =>
  consentimientosEnviados(llamadas).flatMap((cuerpo) =>
    (cuerpo as { items: { version?: string; hash?: string }[] }).items.map((item) => `${item.version} ${item.hash}`),
  );

describe('Revisión: casilla de la política en el detalle', () => {
  it('registra la versión que vio al marcarla aunque la memoria venza y el servidor publique otra', async () => {
    const { result, llamadas, publicarNueva } = await abrirDetalle();
    await hacer(() => result.current.casilla.cambiar(true));

    publicarNueva();
    jest.setSystemTime(AHORA.getTime() + SEIS_MINUTOS);
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledWith(`/anticipo/${ID_CITA}?pagar=1`));

    expect(versiones(llamadas)).toEqual([`2.3 ${HASH_VIGENTE}`]);
  });

  it('si la vigente cambia con la casilla marcada, la desmarca y avisa; marcada otra vez registra la nueva', async () => {
    const { result, llamadas, publicarNueva } = await abrirDetalle();
    await hacer(() => result.current.casilla.cambiar(true));

    publicarNueva();
    await act(async () => {
      await obtenerDocumentoVigente('anticipos', { forzarRed: true });
    });
    await waitFor(() => expect(result.current.casilla.marcada).toBe(false));
    expect(result.current.casilla.error).toBe(ACTUALIZADA);

    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(result.current.pagando).toBeNull());
    expect(consentimientosEnviados(llamadas)).toEqual([]);
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await hacer(() => result.current.casilla.cambiar(true));
    expect(result.current.casilla.error).toBeNull();
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(versiones(llamadas)).toEqual([`2.4 ${HASH_NUEVO}`]);
  });

  it.each([
    ['la misma versión con otro hash', () => respuesta({ success: true, data: documentoCrudo('anticipos', { hash: HASH_NUEVO }) })],
    ['la política deja de estar publicada (404)', () => respuesta({ success: false, message: 'Sin versión' }, 404)],
  ])('con la casilla marcada, %s la desmarca y avisa', async (_caso, publicada) => {
    const { result, publicarNueva } = await abrirDetalle(publicada);
    await hacer(() => result.current.casilla.cambiar(true));

    publicarNueva();
    await act(async () => {
      await obtenerDocumentoVigente('anticipos', { forzarRed: true });
    });
    await waitFor(() => expect(result.current.casilla.marcada).toBe(false));
    expect(result.current.casilla.error).toBe(ACTUALIZADA);
  });

  it('marcada antes de que llegue la política, toma la primera versión que llega sin desmarcarse', async () => {
    const llamadas = await servidorGestion({
      [rutaCita()]: turnos(citaComo(conReglas(citaConAnticipo()))),
      [RUTA_DOCUMENTO]: () => respuesta({ success: true, data: documentoCrudo('anticipos') }),
    });
    const { result } = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    await hacer(() => result.current.casilla.cambiar(true));
    await act(async () => {
      await obtenerDocumentoVigente('anticipos');
    });
    expect(result.current.casilla.marcada).toBe(true);
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(versiones(llamadas)).toEqual([`2.3 ${HASH_VIGENTE}`]);
  });
});

describe('Revisión: opciones de pago con el plazo del anticipo', () => {
  const config = () => obtenerConfiguracion();

  it('con el plazo por venir ofrece en línea y en el salón', () => {
    const cita = normalizada(conReglas(citaConAnticipo()));
    expect(opcionesPagoDeCita(cita, AHORA, config())).toEqual({ enLinea: true, enSalon: true });
  });

  it.each([
    ['en línea con el plazo ya pasado en el teléfono', conReglas(citaConAnticipo({ anticipoVenceEn: masMinutos(AHORA, -1).toISOString() }))],
    ['en línea sin plazo', conReglas(citaConAnticipo({ anticipoVenceEn: null }))],
    ['en el salón con el plazo ya pasado', conReglas(citaEnSalon({ anticipoVenceEn: masMinutos(AHORA, -1).toISOString() }))],
  ])('%s no ofrece ningún pago (el backend responde 409) y el anticipo sigue pendiente', (_caso, cruda) => {
    const cita = normalizada(cruda);
    expect(opcionesPagoDeCita(cita, AHORA, config())).toEqual({ enLinea: false, enSalon: false });
  });
});
