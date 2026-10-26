/// <reference types="jest" />

import {
  MAXIMO_CAMBIOS,
  agruparPorTipo,
  alternar,
  cambiosPendientes,
  esPreferenciasNoDisponibles,
  guardarPreferencias,
  leerPreferencias,
  normalizarPreferencias,
  nuevaVerdad,
  valorEnPantalla,
  type CambioPreferencia,
} from '@/features/notificaciones/models/preferenciasAvisosModel';
import { ApiError } from '@/shared/api/apiClient';

import { PREFERENCIAS, RUTA_PREFERENCIAS, conCambio, preferencia, respuestaPreferencias, sinFuncion404 } from '../../helpers/preferenciasAvisos';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C (Ronda 9 del backend): modelo de Preferencias de avisos contra GET y PATCH
 * /api/notificaciones/preferencias. La lista sale siempre del servidor (la app no escribe los tipos),
 * el PATCH lleva solo los cambios y las reglas puras de la pantalla (agrupar por tipo, borrador y lo
 * que se guarda). fetch simulado en http://api.test con datos ficticios.
 */

const CLIENTA = { id: 'clienta-pref-1', nombre: 'Clienta Avisos', email: 'avisos@ejemplo.test', rol: 'cliente' };
const LISTA = normalizarPreferencias(PREFERENCIAS);

beforeEach(async () => {
  await sembrarSesion(CLIENTA);
});

describe('normalizarPreferencias', () => {
  it('conserva el orden del backend y solo lo que se puede configurar', () => {
    expect(LISTA).toEqual(PREFERENCIAS);
  });

  it.each([
    ['sin tipo', { etiqueta: 'X', canal: 'in_app', activo: true }],
    ['tipo con otra forma', preferencia('Cita Creada', 'X', 'in_app')],
    ['sin etiqueta', preferencia('cita_creada', '  ', 'in_app')],
    ['un canal que no existe', preferencia('cita_creada', 'X', 'sms')],
    ['activo que no es booleano', { ...preferencia('cita_creada', 'X', 'in_app'), activo: 'true' }],
    ['la respuesta ARCO, que no se configura', preferencia('arco_respuesta', 'Respuesta ARCO', 'email')],
    ['algo que no es un objeto', 'basura'],
  ])('descarta %s', (_caso, entrada) => {
    expect(normalizarPreferencias([entrada])).toEqual([]);
  });

  it('un par repetido se queda una vez (gana el primero) y una lista que no es lista da []', () => {
    const repetida = [preferencia('cita_creada', 'Cita agendada', 'in_app', false), preferencia('cita_creada', 'Otra', 'in_app')];
    expect(normalizarPreferencias(repetida)).toEqual([repetida[0]]);
    expect(normalizarPreferencias({ data: [] })).toEqual([]);
  });
});

describe('GET y PATCH', () => {
  it('lee la lista con la sesión', async () => {
    const llamadas = servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias() });
    await expect(leerPreferencias()).resolves.toEqual(LISTA);
    expect(llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)[0].cabeceras.Authorization).toMatch(/^Bearer /);
  });

  it('una respuesta sin lista es un error, nunca una pantalla vacía', async () => {
    servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => respuesta({ success: true }) });
    await expect(leerPreferencias()).rejects.toBeInstanceOf(ApiError);
  });

  it('guarda solo los cambios con el cuerpo exacto y devuelve la lista nueva', async () => {
    const nueva = conCambio('cita_recordatorio', 'email', true);
    const llamadas = servidorVm({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias(nueva) });
    const guardada = await guardarPreferencias([{ tipo: 'cita_recordatorio', canal: 'email', activo: true }]);
    expect(guardada).toEqual(nueva);
    expect(llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS).map((l) => l.cuerpo)).toEqual([
      { preferencias: [{ tipo: 'cita_recordatorio', canal: 'email', activo: true }] },
    ]);
  });

  it(`con más de ${MAXIMO_CAMBIOS} cambios manda lotes de ${MAXIMO_CAMBIOS} como máximo`, async () => {
    const llamadas = servidorVm({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias() });
    const cambios: CambioPreferencia[] = Array.from({ length: MAXIMO_CAMBIOS + 1 }, (_, i) => ({
      tipo: `tipo_${i}`,
      canal: 'in_app',
      activo: false,
    }));
    await guardarPreferencias(cambios);
    const lotes = llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS).map((l) => (l.cuerpo as { preferencias: unknown[] }).preferencias.length);
    expect(lotes).toEqual([MAXIMO_CAMBIOS, 1]);
  });

  it('el 404 (backend sin la función) se reconoce por su estado', async () => {
    servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => sinFuncion404() });
    const error = await leerPreferencias().catch((causa: unknown) => causa);
    expect(esPreferenciasNoDisponibles(error)).toBe(true);
    expect(esPreferenciasNoDisponibles(new ApiError(400, 'x'))).toBe(false);
    expect(esPreferenciasNoDisponibles(new Error('x'))).toBe(false);
  });
});

describe('reglas de la pantalla', () => {
  it('agrupa por tipo en el orden del backend con el valor de cada canal', () => {
    expect(agruparPorTipo(LISTA)).toEqual([
      { tipo: 'cita_creada', etiqueta: 'Cita agendada', canales: { in_app: true } },
      { tipo: 'cita_recordatorio', etiqueta: 'Recordatorio de tu cita', canales: { in_app: true, email: false } },
      { tipo: 'pedido_listo_recoger', etiqueta: 'Pedido listo para recoger', canales: { in_app: true, email: true } },
      { tipo: 'factura_emitida', etiqueta: 'Factura emitida', canales: { in_app: false } },
    ]);
  });

  it('alternar guarda en el borrador solo lo distinto de lo guardado y volver lo quita', () => {
    const uno = alternar(LISTA, {}, 'cita_recordatorio', 'email');
    expect(uno).toEqual({ 'cita_recordatorio:email': true });
    expect(valorEnPantalla(false, uno, 'cita_recordatorio', 'email')).toBe(true);
    expect(cambiosPendientes(LISTA, uno)).toEqual([{ tipo: 'cita_recordatorio', canal: 'email', activo: true }]);

    const devuelta = alternar(LISTA, uno, 'cita_recordatorio', 'email');
    expect(devuelta).toEqual({});
    expect(cambiosPendientes(LISTA, devuelta)).toEqual([]);
    expect(valorEnPantalla(false, devuelta, 'cita_recordatorio', 'email')).toBe(false);
  });

  it('un par que no está en la lista no cambia nada', () => {
    const borrador = { 'cita_creada:in_app': false };
    expect(alternar(LISTA, borrador, 'cita_creada', 'email')).toBe(borrador);
  });

  it('nuevaVerdad toma la respuesta y, si llegó vacía, aplica los cambios sobre la anterior', () => {
    const cambios = [{ tipo: 'cita_creada', canal: 'in_app' as const, activo: false }];
    const respuestaNueva = normalizarPreferencias(conCambio('cita_creada', 'in_app', false));
    expect(nuevaVerdad(respuestaNueva, LISTA, cambios)).toEqual(respuestaNueva);
    expect(nuevaVerdad([], LISTA, cambios)).toEqual(respuestaNueva);
  });
});
