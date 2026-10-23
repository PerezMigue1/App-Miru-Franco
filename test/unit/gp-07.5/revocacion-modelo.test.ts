/// <reference types="jest" />

import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { fechaYHora, type Pedido } from '@/features/tienda/models/pedidoModel';
import {
  mensajeRevocar,
  montoRevocable,
  motivoErrorRevocar,
  motivoParaEnviar,
  puedeVerRevocar,
  revocarCompra,
  textoCancelarORevocar,
  textoResultadoRevocacion,
  textosHojaRevocar,
  type EstadoRevocacion,
  type MotivoErrorRevocar,
} from '@/features/tienda/models/revocacionModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { tiendaCompra } from '@/shared/ui/tokens';

import { AHORA, CLIENTA_CITAS, conError, errorDe, llamadasDeRuta, sinRedEnRuta, usarRelojFijo, type CuerpoError } from '../../helpers/citasFicticias';
import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import {
  cuerpoRevocar,
  ERRORES_REVOCAR,
  pedidoEntregadoRevocable,
  pedidoRevocable,
  REVOCABLE_HASTA_ISO,
  rutaRevocar,
  type PedidoDetalleCrudo,
} from '../../helpers/pedidosFicticios';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { pedidoNormalizado, REGLAS_PEDIDO_NORMALIZADAS, rutaPedido } from '../../helpers/tiendaFicticia';

/**
 * GP-07.5: revocación de compra (art. 56 LFPC) en src/features/tienda/models/revocacionModel.ts, en
 * caja blanca: la llamada POST /api/pedidos/:id/revocar (motivo opcional y recortado, id inválido sin
 * llamar, respuesta sin pedido), cuándo se ofrece el botón (puedeRevocar y revocableHasta con el reloj
 * fijo), los textos de la hoja con los días hábiles guardados en el pedido y el monto (total o lo que
 * falta por devolver), el resultado de cada estado y cada 409, 404 y 400 con mensajes propios.
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);
const VIGENTE = CONFIGURACION_COMPLETA;
const t = (clave: keyof typeof RESPALDO_TEXTOS, contexto = {}) => obtenerTexto(clave, contexto, VIGENTE);
const apiErrorDe = (cuerpo: CuerpoError) => crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });

/** El pedido normalizado con los campos de la revocación. */
function revocable(cambios: Partial<Pedido> = {}): Pedido {
  return pedidoNormalizado({
    id: 703,
    estado: 'pagado',
    revocableHasta: REVOCABLE_HASTA_ISO,
    puedeRevocar: true,
    montoRevocableCentavos: 114_250,
    ...cambios,
  });
}

describe('revocarCompra (POST /api/pedidos/:id/revocar)', () => {
  it.each<[string, string, unknown]>([
    ['sin motivo manda un cuerpo vacío', '', {}],
    ['solo espacios cuenta como sin motivo', '   ', {}],
    ['con motivo lo manda recortado y sin espacios de sobra', '  Ya   no lo\nnecesito  ', { motivo: 'Ya no lo necesito' }],
  ])('%s, con la sesión, y devuelve el pedido y la revocación', async (_caso, motivo, cuerpo) => {
    await sembrarSesion(CLIENTA_CITAS);
    const pedido = pedidoRevocable();
    const llamadas = simular({ [rutaRevocar()]: () => respuesta(cuerpoRevocar(pedido, 'reembolsado')) });
    const resultado = await revocarCompra(703, motivo);
    const [llamada] = llamadasDeRuta(llamadas, rutaRevocar());
    expect(llamada.cuerpo).toEqual(cuerpo);
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
    expect(resultado.revocacion).toEqual({ estado: 'reembolsado', montoCentavos: 114_250 });
    expect(resultado.pedido).toMatchObject({ id: 703, estado: 'cancelado', puedeRevocar: false, montoRevocableCentavos: 0 });
  });

  it('un motivo largo se corta al tope del backend', () => {
    expect(motivoParaEnviar('a'.repeat(tiendaCompra.largoMotivoRevocacion + 40))).toHaveLength(tiendaCompra.largoMotivoRevocacion);
  });

  it('sin el pedido en la respuesta lo vuelve a leer; un estado desconocido cuenta como en revisión', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simular({
      [rutaRevocar()]: () => respuesta({ success: true, revocacion: { estado: 'otro', monto: '1142.50' } }),
      [rutaPedido(703)]: () => respuesta({ success: true, data: pedidoRevocable({ estado: 'cancelado' }) }),
    });
    const resultado = await revocarCompra('703');
    expect(resultado.revocacion).toEqual({ estado: 'en_revision', montoCentavos: 114_250 });
    expect(resultado.pedido.estado).toBe('cancelado');
    expect(llamadasDeRuta(llamadas, rutaPedido(703))).toHaveLength(1);
  });

  it.each([['texto', 'abc'], ['cero', 0], ['negativo', -2]])('id %s: 404 sin llamar al servidor', async (_caso, id) => {
    const llamadas = simular({});
    expect(await errorDe(revocarCompra(id))).toEqual(new ApiError(404, 'Pedido no encontrado'));
    expect(llamadas).toHaveLength(0);
  });
});

describe('puedeVerRevocar: el botón solo dentro del plazo y si el backend lo permite', () => {
  const limite = new Date(REVOCABLE_HASTA_ISO).getTime();

  it.each<[string, Partial<Pedido>, number, boolean]>([
    ['dentro del plazo', {}, AHORA.getTime(), true],
    ['justo al límite', {}, limite, true],
    ['un instante después del límite', {}, limite + 1, false],
    ['puedeRevocar en false', { puedeRevocar: false }, AHORA.getTime(), false],
    ['sin fecha límite', { revocableHasta: null }, AHORA.getTime(), false],
    ['con una fecha que no se puede leer', { revocableHasta: 'pronto' }, AHORA.getTime(), false],
  ])('%s', (_caso, cambios, ahora, esperado) => {
    expect(puedeVerRevocar(revocable(cambios), ahora)).toBe(esperado);
  });

  it('sin ahora usa el reloj: deja de verse cuando pasa revocableHasta', () => {
    expect(puedeVerRevocar(revocable())).toBe(true);
    jest.setSystemTime(limite + 1);
    expect(puedeVerRevocar(revocable())).toBe(false);
  });
});

describe('textoCancelarORevocar', () => {
  it('con las dos acciones a la vista explica la diferencia con los días hábiles guardados en el pedido', () => {
    expect(textoCancelarORevocar(revocable(), true, AHORA.getTime(), VIGENTE)).toBe(
      t('pedidos.cancelarORevocar', { diasRevocacion: 5 }),
    );
    expect(textoCancelarORevocar(revocable({ reglas: null }), true, AHORA.getTime(), VIGENTE)).toContain('durante 6 días hábiles');
  });

  it.each<[string, Pedido, boolean]>([
    ['cancelar no se ofrece (pago en proceso)', revocable(), false],
    ['el pedido ya se prepara', revocable({ estado: 'preparando' }), true],
    ['no se puede revocar', revocable({ puedeRevocar: false }), true],
  ])('null si %s', (_caso, pedido, cancelable) => {
    expect(textoCancelarORevocar(pedido, cancelable, AHORA.getTime(), VIGENTE)).toBeNull();
  });
});

describe('textosHojaRevocar: el aviso antes de revocar', () => {
  it('sin recoger: el derecho con los días guardados, el reintegro total, qué pasa y hasta cuándo', () => {
    const fechaLimite = fechaYHora(REVOCABLE_HASTA_ISO);
    expect(textosHojaRevocar(revocable(), VIGENTE)).toEqual([
      `${t('tienda.revocar.derecho', { diasRevocacion: 5 })} ${t('tienda.revocar.reintegroTotal', { monto: '$1,142.50' })}`,
      t('tienda.revocar.sinRecoger'),
      t('tienda.revocar.hasta', { fechaLimite }),
    ]);
    expect(textosHojaRevocar(revocable(), VIGENTE)[0]).toContain('artículo 56 de la Ley Federal de Protección al Consumidor');
  });

  it('ya recogido y con parte devuelta: lo que falta por devolver y entregarlo en el salón', () => {
    const [derecho, queHacer] = textosHojaRevocar(
      revocable({ estado: 'entregado', montoRevocableCentavos: 50_000, reglas: { ...REGLAS_PEDIDO_NORMALIZADAS, diasHabilesRevocacion: 8 } }),
      VIGENTE,
    );
    expect(derecho).toContain('dentro de los 8 días hábiles');
    expect(derecho).toContain(t('tienda.revocar.reintegroParcial', { monto: '$500' }));
    expect(queHacer).toBe(t('tienda.revocar.yaRecogido'));
  });

  it('sin montoRevocable usa el total y sin fecha válida no dice hasta cuándo', () => {
    const pedido = revocable({ montoRevocableCentavos: null, revocableHasta: 'pronto' });
    expect(montoRevocable(pedido)).toBe(114_250);
    const parrafos = textosHojaRevocar(pedido, VIGENTE);
    expect(parrafos).toHaveLength(2);
    expect(parrafos[0]).toContain(t('tienda.revocar.reintegroTotal', { monto: '$1,142.50' }));
  });
});

describe('textoResultadoRevocacion: lo que pasó según el servidor', () => {
  it.each<[EstadoRevocacion, keyof typeof RESPALDO_TEXTOS]>([
    ['reembolsado', 'tienda.revocar.resultadoReembolsado'],
    ['pendiente_entrega', 'tienda.revocar.resultadoPendienteEntrega'],
    ['en_revision', 'tienda.revocar.resultadoEnRevision'],
  ])('%s', (estado, clave) => {
    const texto = textoResultadoRevocacion({ estado, montoCentavos: 114_250 }, VIGENTE);
    expect(texto).toBe(t(clave, { monto: '$1,142.50' }));
    expect(texto).toContain('$1,142.50');
  });
});

describe('errores de revocar: cada uno con su mensaje propio', () => {
  it.each<[string, CuerpoError, MotivoErrorRevocar, keyof typeof RESPALDO_TEXTOS]>([
    ['ya revocada', ERRORES_REVOCAR.yaRevocada, 'yaRevocada', 'tienda.revocar.yaRevocada'],
    ['pedido cancelado', ERRORES_REVOCAR.cancelado, 'cancelado', 'tienda.revocar.cancelado'],
    ['sin pago', ERRORES_REVOCAR.sinPago, 'sinPago', 'tienda.revocar.sinPago'],
    ['plazo terminado', ERRORES_REVOCAR.plazoTerminado, 'plazoTerminado', 'tienda.revocar.plazoTerminado'],
    ['devolución activa', ERRORES_REVOCAR.devolucionActiva, 'devolucionActiva', 'tienda.revocar.devolucionActiva'],
    ['pago ya reembolsado', ERRORES_REVOCAR.yaReembolsado, 'yaReembolsado', 'tienda.revocar.yaReembolsado'],
    ['reembolsado por completo', ERRORES_REVOCAR.reembolsadoCompleto, 'yaReembolsado', 'tienda.revocar.yaReembolsado'],
    ['el pedido cambió', ERRORES_REVOCAR.cambio, 'cambio', 'tienda.revocar.cambio'],
    ['un 409 desconocido (se vuelve a leer)', { statusCode: 409, message: 'Conflicto ficticio', error: 'Conflict' }, 'cambio', 'tienda.revocar.cambio'],
    ['404 ajeno', ERRORES_REVOCAR.noEncontrado, 'noEncontrado', 'tienda.pedido.noEncontrado'],
    ['400 del motivo', ERRORES_REVOCAR.motivoInvalido, 'motivoInvalido', 'tienda.revocar.motivoInvalido'],
  ])('%s', (_caso, cuerpo, motivo, clave) => {
    const error = apiErrorDe(cuerpo);
    expect(motivoErrorRevocar(error)).toBe(motivo);
    expect(mensajeRevocar(error, VIGENTE)).toBe(t(clave));
    expect(mensajeRevocar(error, VIGENTE)).not.toBe(cuerpo.message);
  });

  it.each<[string, unknown, string]>([
    ['sin red', new ErrorDeRed(), MENSAJE_SIN_CONEXION],
    ['un 500', new ApiError(500, 'Error interno ficticio'), t('tienda.revocar.generico')],
    ['un 400 que no es del motivo', new ApiError(400, 'Otra cosa'), t('tienda.revocar.generico')],
    ['un error común', new Error('otro'), t('tienda.revocar.generico')],
  ])('%s: sin motivo propio', (_caso, error, mensaje) => {
    expect(motivoErrorRevocar(error)).toBeNull();
    expect(mensajeRevocar(error, VIGENTE)).toBe(mensaje);
  });

  it('el 409 real del servidor y sin red llegan como ApiError y ErrorDeRed desde revocarCompra', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    simular({ [rutaRevocar()]: conError(ERRORES_REVOCAR.plazoTerminado) });
    expect(motivoErrorRevocar(await errorDe(revocarCompra(703)))).toBe('plazoTerminado');
    simular({ [rutaRevocar()]: sinRedEnRuta });
    expect(mensajeRevocar(await errorDe(revocarCompra(703)))).toBe(MENSAJE_SIN_CONEXION);
  });
});

describe('datos ficticios', () => {
  it('el pedido entregado revocable es el 706 con su plazo', () => {
    const pedido: PedidoDetalleCrudo = pedidoEntregadoRevocable();
    expect(pedido).toMatchObject({ id: 706, estado: 'entregado', puedeRevocar: true, revocableHasta: REVOCABLE_HASTA_ISO });
  });
});

describe('sin configuración ni reloj usa los que están en memoria', () => {
  it('textos y errores con la configuración del respaldo (5 días hábiles vigentes)', () => {
    const pedido = revocable({ reglas: null });
    expect(textoCancelarORevocar(pedido, true)).toBe(obtenerTexto('pedidos.cancelarORevocar', { diasRevocacion: 5 }));
    expect(textosHojaRevocar(pedido)[0]).toContain('dentro de los 5 días hábiles');
    expect(textoResultadoRevocacion({ estado: 'reembolsado', montoCentavos: 50_000 })).toContain('$500');
    expect(mensajeRevocar(new ApiError(409, 'Ya revocaste esta compra.'))).toBe(obtenerTexto('tienda.revocar.yaRevocada'));
  });

  it('una respuesta sin revocación cuenta como en revisión y sin monto', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    simular({ [rutaRevocar()]: () => respuesta({ success: true, data: pedidoRevocable({ estado: 'cancelado' }) }) });
    expect((await revocarCompra(703)).revocacion).toEqual({ estado: 'en_revision', montoCentavos: 0 });
  });
});
