/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { MENSAJES_ANTICIPO_EN_SALON } from '@/features/citas/models/citaModel';
import { RUTA_ORIGEN_DETALLE, useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, citaConAnticipo, citaEnSalon, ID_CITA, masMinutos, rutaCita, type CitaCruda } from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { rutaSinVersion } from '../../helpers/documentosFicticios';
import {
  anticipoEnSalonOk,
  citaComo,
  conReglas,
  errorCon,
  escriturasDe,
  hacer,
  reiniciarRepositorios,
  rutaAnticipoEnSalon,
  servidorGestion,
  sinRedTurno,
  type Turno,
  turnos,
  vecesRuta,
} from '../../helpers/gestionCitas';
import { consentimientosEnviados, RUTA_CONSENTIMIENTOS, type ConfiguracionReservaFicticia } from '../../helpers/reservaFicticia';
import type { Manejador } from '../../helpers/servidorSimulado';
import { cerrarConTemporizadores, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

/**
 * GP-07.4, cambiar a pago en el salón desde el detalle de la cita (useDetalleCitaViewModel): se
 * ofrece con la regla VIGENTE y el margen de la cita; antes pide la casilla de la Política de
 * anticipos y registra el consentimiento (si no hay versión o el registro falla no se llama al
 * PATCH); cada respuesta del PATCH da un mensaje para la clienta y los 200 y 409 recargan la cita.
 * También el pago en línea manual del detalle, que pide la casilla. fetch, expo-router simulados.
 */

const CITA = conReglas(citaConAnticipo());
const EN_SALON = conReglas(citaEnSalon());
const PATCH = rutaAnticipoEnSalon();
const GET_CITA = rutaCita();
const FALTA = RESPALDO_TEXTOS['citas.politicaAnticipos.falta'];

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  reiniciarSimulaciones();
});
espiarConsola(cerrarConTemporizadores, true);

async function abrir(rutas: Record<string, Manejador> = {}, opciones?: ConfiguracionReservaFicticia, cita: CitaCruda = CITA) {
  const llamadas = await servidorGestion({ [GET_CITA]: turnos(citaComo(cita)), ...rutas }, opciones);
  const hook = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}




/** Marca la casilla, toca "Pagar en el salón" y espera a que termine. */
async function pagarEnSalon(result: { current: ReturnType<typeof useDetalleCitaViewModel> }) {
  await hacer(() => result.current.casilla.cambiar(true));
  await hacer(() => result.current.pagarEnSalon());
  await waitFor(() => expect(result.current.pagando).toBeNull());
}

describe('se ofrece "Pagar en el salón"', () => {
  it('con el anticipo pendiente en línea, la regla vigente activa y margen antes del plazo de la cita', async () => {
    const { result } = await abrir();
    expect(result.current.presentacion?.opcionesPago).toEqual({ enLinea: true, enSalon: true });
    expect(result.current.presentacion?.botonSalon).toBe(RESPALDO_TEXTOS['anticipos.botonSalon']);
  });

  it.each<[string, ConfiguracionReservaFicticia | undefined, CitaCruda]>([
    ['la regla vigente lo apaga', { citas: { permitirAnticipoEnSalon: false } }, CITA],
    ['ya no hay margen antes del plazo de la cita', undefined, conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 44).toISOString() }))],
  ])('no, si %s', async (_caso, opciones, cita) => {
    const { result } = await abrir({}, opciones, cita);
    expect(result.current.presentacion?.opcionesPago.enSalon).toBe(false);
  });
});

describe('pagarEnSalon', () => {
  it('sin marcar la casilla no registra ni llama al PATCH y pide marcarla', async () => {
    const { result, llamadas } = await abrir({ [PATCH]: turnos(anticipoEnSalonOk(masMinutos(AHORA, 60).toISOString())) });
    await hacer(() => result.current.pagarEnSalon());
    await waitFor(() => expect(result.current.casilla.error).toBe(FALTA));
    expect(escriturasDe(llamadas)).toEqual([]);
    expect(result.current.avisoPago).toBeNull();
    // Desmarcarla no quita el aviso; marcarla sí.
    await hacer(() => result.current.casilla.cambiar(false));
    expect(result.current.casilla.error).toBe(FALTA);
  });

  it('200: registra el consentimiento, cambia a pago en el salón, recarga la cita y lo confirma', async () => {
    const plazo = masMinutos(AHORA, 600).toISOString();
    const { result, llamadas } = await abrir({
      [GET_CITA]: turnos(citaComo(CITA), citaComo({ ...EN_SALON, anticipoVenceEn: plazo })),
      [PATCH]: turnos(anticipoEnSalonOk(plazo)),
    });
    await pagarEnSalon(result);

    expect(escriturasDe(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, PATCH]);
    expect(consentimientosEnviados(llamadas)).toEqual([
      expect.objectContaining({ formulario: 'anticipo-cita', rutaOrigen: RUTA_ORIGEN_DETALLE }),
    ]);
    expect(vecesRuta(llamadas, `GET /api/citas/${ID_CITA}?propios=true`)).toBe(2);
    expect(result.current.avisoPago).toEqual({ tipo: 'exito', texto: RESPALDO_TEXTOS['citas.anticipoSalon.listo'] });
    expect(result.current.cita?.anticipoEnSalon).toBe(true);
    expect(result.current.presentacion?.opcionesPago.enSalon).toBe(false);
  });

  it.each(MENSAJES_ANTICIPO_EN_SALON[409].map((mensaje) => [mensaje]))('409 "%s": lo dice y recarga la cita', async (mensaje) => {
    const { result, llamadas } = await abrir({ [PATCH]: turnos(errorCon(409, mensaje)) });
    await pagarEnSalon(result);
    expect(result.current.avisoPago).toEqual({ tipo: 'error', texto: mensaje });
    expect(vecesRuta(llamadas, `GET /api/citas/${ID_CITA}?propios=true`)).toBe(2);
  });

  it.each([
    ...MENSAJES_ANTICIPO_EN_SALON[400].map((mensaje) => [400, mensaje, mensaje] as const),
    [400, 'Ya tienes 2 citas por pagar en el salón. Paga su anticipo o paga esta en línea.', 'Ya tienes 2 citas por pagar en el salón. Paga su anticipo o paga esta en línea.'] as const,
    [503, MENSAJES_ANTICIPO_EN_SALON[503][0], MENSAJES_ANTICIPO_EN_SALON[503][0]] as const,
    [500, 'Internal server error', RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']] as const,
  ])('%s "%s": mensaje para la clienta sin recargar', async (status, delServidor, esperado) => {
    const { result, llamadas } = await abrir({ [PATCH]: turnos(errorCon(status, delServidor)) });
    await pagarEnSalon(result);
    expect(result.current.avisoPago).toEqual({ tipo: 'error', texto: esperado });
    expect(vecesRuta(llamadas, `GET /api/citas/${ID_CITA}?propios=true`)).toBe(1);
  });

  it('sin red: lo dice sin el texto técnico', async () => {
    const { result } = await abrir({ [PATCH]: turnos(sinRedTurno) });
    await pagarEnSalon(result);
    expect(result.current.avisoPago).toEqual({ tipo: 'error', texto: 'Sin conexión. Revisa tu internet e intenta de nuevo.' });
  });

  it.each<[string, Record<string, Manejador>, string]>([
    ['no hay versión publicada de la política', rutaSinVersion(), RESPALDO_TEXTOS['citas.detalle.politicaNoDisponible']],
    ['el registro del consentimiento falla', { [RUTA_CONSENTIMIENTOS]: turnos(errorCon(400, 'Versión no publicada')) }, RESPALDO_TEXTOS['citas.detalle.consentimientoFallo']],
  ])('si %s no llama al PATCH y lo explica', async (_caso, rutas, mensaje) => {
    const { result, llamadas } = await abrir({ ...rutas, [PATCH]: turnos(anticipoEnSalonOk(masMinutos(AHORA, 60).toISOString())) });
    await pagarEnSalon(result);
    expect(vecesRuta(llamadas, PATCH)).toBe(0);
    expect(result.current.avisoPago).toEqual({ tipo: 'error', texto: mensaje });
  });

  it('la relectura tras el 200 falla: deja la cita como estaba y la próxima recarga trae el cambio', async () => {
    const falla: Turno = errorCon(500, 'Internal server error');
    const { result } = await abrir({
      [GET_CITA]: turnos(citaComo(CITA), falla),
      [PATCH]: turnos(anticipoEnSalonOk(masMinutos(AHORA, 60).toISOString())),
    });
    await pagarEnSalon(result);
    expect(result.current.avisoPago?.tipo).toBe('exito');
    expect(result.current.cita?.anticipoEnSalon).toBe(false);
  });
});

describe('pagarAnticipo (en línea, con el botón del detalle)', () => {
  it('pide la casilla, registra el consentimiento y abre el pago, que lanza Mercado Pago solo', async () => {
    const { result, llamadas } = await abrir();
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(result.current.casilla.error).toBe(FALTA));
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await hacer(() => result.current.casilla.cambiar(true));
    expect(result.current.casilla.error).toBeNull();
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledWith(`/anticipo/${ID_CITA}?pagar=1`));
    expect(escriturasDe(llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
  });

  it('si el consentimiento no se registra no abre el pago', async () => {
    const { result } = await abrir({ [RUTA_CONSENTIMIENTOS]: turnos(sinRedTurno) });
    await hacer(() => result.current.casilla.cambiar(true));
    await hacer(() => result.current.pagarAnticipo());
    await waitFor(() => expect(result.current.avisoPago?.tipo).toBe('error'));
    expect(routerSimulado.push).not.toHaveBeenCalled();
  });

  it('el enlace de la política abre su visor', async () => {
    const { result } = await abrir();
    await hacer(() => result.current.abrirPolitica());
    expect(routerSimulado.push).toHaveBeenCalledWith('/legal/anticipos');
  });
});
