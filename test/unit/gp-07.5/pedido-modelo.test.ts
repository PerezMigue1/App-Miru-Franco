/// <reference types="jest" />

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import {
  diasRevocacion,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  fechaYHora,
  formaPagoCorta,
  limitePagoPedido,
  mensajeCancelarPedido,
  mensajeCrearPedido,
  mensajePreferenciaPedido,
  mensajeRevisarMisPedidos,
  motivoErrorCancelar,
  normalizarReglasPedido,
  obtenerPedido,
  pidePagoEnLinea,
  plazoPagoHoras,
  textoCancelarPedido,
  textoQueSigue,
  vencimientoPagoMs,
  yaRecogido,
  type Pedido,
  type ReglasPedido,
} from '@/features/tienda/models/pedidoModel';
import { metodosEntreParentesis } from '@/features/tienda/models/compraLegal';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';
import { RESPALDO_CONFIGURACION, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, AHORA_ISO, CLIENTA_CITAS, cuerpoError, HORA_MS, usarRelojFijo, type CuerpoError } from '../../helpers/citasFicticias';
import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { configuracionConTextos } from '../../helpers/textosFicticios';
import {
  ERRORES_PEDIDOS,
  ERRORES_PAGO_PEDIDO,
  ID_PEDIDO,
  METODO_EN_LINEA,
  METODO_EN_SALON,
  pedidoCrudo,
  pedidoNormalizado,
  REGLAS_PEDIDO_NORMALIZADAS,
  rutaPedido,
} from '../../helpers/tiendaFicticia';

/**
 * GP-07.5: el modelo de pedidos con las reglas guardadas en cada pedido y los textos del catálogo
 * (antes escritos en pedidoModel.ts): normalización de `reglas` y de los datos de la revocación del
 * detalle, plazo del pago en línea con las reglas del pedido o, sin ellas, las vigentes, qué sigue por
 * estado (incluido "Listo para recoger") e insignias, formas de pago y mensajes de error desde el
 * catálogo. La configuración ficticia (CONFIGURACION_COMPLETA) tiene un plazo de 12 horas, 6 días
 * hábiles para revocar y teléfono propio, distintos de los del pedido ficticio (24 horas y 5 días).
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);
const VIGENTE = CONFIGURACION_COMPLETA;
const t = (clave: keyof typeof RESPALDO_TEXTOS, contexto = {}, config: ConfiguracionPublica = VIGENTE) =>
  obtenerTexto(clave, contexto, config);

const apiErrorDe = (cuerpo: CuerpoError) => crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });

/** Reglas del pedido con un plazo de pago y unos días de revocación propios. */
function conReglas(cambios: Partial<ReglasPedido>): Pedido {
  return pedidoNormalizado({ reglas: { ...REGLAS_PEDIDO_NORMALIZADAS, ...cambios } });
}

describe('normalizarReglasPedido', () => {
  it('toma cada regla entera de 0 en adelante y deja fuera los días inhábiles', () => {
    expect(
      normalizarReglasPedido({ ...REGLAS_PEDIDO_NORMALIZADAS, diasCambioProducto: 0, diasInhabiles: ['2026-12-25'] }),
    ).toEqual({ ...REGLAS_PEDIDO_NORMALIZADAS, diasCambioProducto: 0 });
  });

  it.each<[string, unknown]>([
    ['texto', '24'],
    ['decimal', 1.5],
    ['negativo', -1],
    ['infinito', Number.POSITIVE_INFINITY],
    ['null', null],
    ['ausente', undefined],
  ])('una regla %s queda en null (se usa la vigente)', (_caso, valor) => {
    expect(normalizarReglasPedido({ ...REGLAS_PEDIDO_NORMALIZADAS, plazoPagoLineaHoras: valor })).toEqual({
      ...REGLAS_PEDIDO_NORMALIZADAS,
      plazoPagoLineaHoras: null,
    });
  });

  it.each<[string, unknown]>([
    ['null (pedido viejo)', null],
    ['un arreglo', [24]],
    ['un texto', '{"plazoPagoLineaHoras":24}'],
  ])('sin un objeto (%s) no hay reglas guardadas', (_caso, crudo) => {
    expect(normalizarReglasPedido(crudo)).toBeNull();
  });
});

describe('obtenerPedido con los datos del detalle (reglas y revocación)', () => {
  it.each<[string, Record<string, unknown>, Partial<Pedido>]>([
    [
      'revocable por todo',
      { revocableHasta: '2026-10-25T05:59:59.999Z', puedeRevocar: true, montoRevocable: 1142.5 },
      { revocableHasta: '2026-10-25T05:59:59.999Z', puedeRevocar: true, montoRevocableCentavos: 114_250 },
    ],
    ['puedeRevocar no booleano no cuenta', { puedeRevocar: 'true', montoRevocable: 0 }, { puedeRevocar: false, montoRevocableCentavos: 0 }],
    ['sin plazo (null)', { revocableHasta: null, montoRevocable: null }, { revocableHasta: null, montoRevocableCentavos: null }],
    ['un pedido viejo sin reglas', { reglas: null }, { reglas: null }],
  ])('%s', async (_caso, campos, esperado) => {
    await sembrarSesion(CLIENTA_CITAS);
    simular({ [rutaPedido()]: () => respuesta({ success: true, data: { ...pedidoCrudo(), ...campos } }) });
    expect(await obtenerPedido(ID_PEDIDO)).toEqual(pedidoNormalizado(esperado));
  });
});

describe('plazo del pago en línea con las reglas guardadas en el pedido', () => {
  it.each<[string, Pedido, number]>([
    ['las guardadas en el pedido ganan a las vigentes', conReglas({ plazoPagoLineaHoras: 24 }), 24],
    ['un plazo propio del pedido', conReglas({ plazoPagoLineaHoras: 6 }), 6],
    ['sin el campo, las vigentes', conReglas({ plazoPagoLineaHoras: null }), 12],
    ['un pedido viejo sin reglas, las vigentes', pedidoNormalizado({ reglas: null }), 12],
  ])('%s', (_caso, pedido, horas) => {
    expect(plazoPagoHoras(pedido, VIGENTE)).toBe(horas);
    expect(vencimientoPagoMs(pedido, VIGENTE)).toBe(AHORA.getTime() + horas * HORA_MS);
    expect(pidePagoEnLinea(pedido, AHORA.getTime() + horas * HORA_MS - 1, VIGENTE)).toBe(true);
    expect(pidePagoEnLinea(pedido, AHORA.getTime() + horas * HORA_MS, VIGENTE)).toBe(false);
    const vence = new Date(AHORA.getTime() + horas * HORA_MS);
    expect(limitePagoPedido(pedido, VIGENTE)).toBe(fechaYHora(vence));
  });

  it('sin configuración usa la que está en memoria (el respaldo)', () => {
    expect(plazoPagoHoras({ reglas: null })).toBe(RESPALDO_CONFIGURACION.reglas.tienda.plazoPagoLineaHoras);
    expect(diasRevocacion({ reglas: null })).toBe(RESPALDO_CONFIGURACION.reglas.revocacion.diasHabiles);
  });

  it.each<[string, Pedido, number]>([
    ['los días hábiles guardados', conReglas({ diasHabilesRevocacion: 5 }), 5],
    ['sin ellos, los vigentes', pedidoNormalizado({ reglas: null }), 6],
  ])('diasRevocacion: %s', (_caso, pedido, dias) => {
    expect(diasRevocacion(pedido, VIGENTE)).toBe(dias);
  });

  it('fechaYHora: sin hora válida deja solo lo que se pudo leer', () => {
    expect(fechaYHora('nunca')).toBe('');
    expect(fechaYHora(AHORA_ISO)).toMatch(/^lunes 19 de octubre, \d{1,2}:00 [ap]\. m\.$/);
  });
});

describe('textoQueSigue desde el catálogo (pedidos.estado.*)', () => {
  const ahora = AHORA.getTime();
  const metodos = metodosEntreParentesis(VIGENTE);

  it.each<[string, Partial<Pedido>, number, string | null]>([
    ['apartado pendiente', { metodoPago: METODO_EN_SALON }, ahora, t('pedidos.estado.apartado')],
    ['en línea con el plazo guardado (24 h, no las 12 vigentes)', {}, ahora, t('pedidos.estado.faltaPago', { plazoPago: 24 })],
    ['en línea vencido', {}, ahora + 24 * HORA_MS, t('tienda.pedido.estado.plazoTerminado', { plazoPago: 24 })],
    ['pendiente con otro método', { metodoPago: 'efectivo' }, ahora, t('pedidos.estado.confirmandoPago')],
    ['pagado', { estado: 'pagado' }, ahora, t('pedidos.estado.pagado')],
    ['en preparación', { estado: 'preparando' }, ahora, t('pedidos.estado.preparando')],
    ['apartado listo para pagar, con los métodos del salón', { estado: 'listo_recoger', metodoPago: METODO_EN_SALON }, ahora, t('pedidos.estado.listoPagar', { metodosSalon: metodos })],
    ['pagado y listo para recoger', { estado: 'listo_recoger' }, ahora, t('pedidos.estado.listo')],
    ['entregado', { estado: 'entregado' }, ahora, t('pedidos.estado.entregado')],
    ['cancelado', { estado: 'cancelado' }, ahora, null],
  ])('%s', (_caso, cambios, momento, esperado) => {
    expect(textoQueSigue(pedidoNormalizado(cambios), momento, { config: VIGENTE, metodosSalon: metodos })).toBe(esperado);
  });

  it('el apartado listo dice los métodos activos: "(efectivo o transferencia)"', () => {
    expect(
      textoQueSigue(pedidoNormalizado({ estado: 'listo_recoger', metodoPago: METODO_EN_SALON }), ahora, {
        config: VIGENTE,
        metodosSalon: metodos,
      }),
    ).toBe('Tu pedido está listo. Pasa por él al salón y págalo en el mostrador (efectivo o transferencia).');
  });

  it('con el pago en línea en proceso no pide completar el pago (solo en un pedido en línea pendiente)', () => {
    expect(textoQueSigue(pedidoNormalizado(), ahora, { config: VIGENTE, pagoEnProceso: true })).toBe(
      t('tienda.pedido.estado.pagoEnProceso'),
    );
    expect(textoQueSigue(pedidoNormalizado({ estado: 'pagado' }), ahora, { config: VIGENTE, pagoEnProceso: true })).toBe(
      t('pedidos.estado.pagado'),
    );
  });

  it('un pedido viejo sin reglas dice el plazo vigente', () => {
    expect(textoQueSigue(pedidoNormalizado({ reglas: null }), ahora, { config: VIGENTE })).toBe(
      'Falta completar tu pago en Mercado Pago. Tienes 12 horas desde que hiciste el pedido.',
    );
  });

  it('el texto del servidor gana y se llena con el plazo del pedido', () => {
    const config = configuracionConTextos({ 'pedidos.estado.faltaPago': 'Paga en {plazoPago} horas, por favor.' });
    expect(textoQueSigue(pedidoNormalizado(), ahora, { config })).toBe('Paga en 24 horas, por favor.');
  });
});

describe('insignias y formas de pago desde el catálogo', () => {
  it.each<[string, string, boolean, keyof typeof RESPALDO_TEXTOS]>([
    ['pendiente_pago', METODO_EN_LINEA, false, 'tienda.pedido.etiqueta.pendientePago'],
    ['pendiente_pago', METODO_EN_LINEA, true, 'tienda.pedido.etiqueta.pagoEnProceso'],
    ['pendiente_pago', METODO_EN_SALON, true, 'tienda.pedido.etiqueta.apartado'],
    ['listo_recoger', METODO_EN_SALON, false, 'tienda.pedido.etiqueta.listoRecoger'],
    ['pagado', METODO_EN_LINEA, true, 'tienda.pedido.etiqueta.pagado'],
    ['constructor', METODO_EN_LINEA, false, 'tienda.pedido.etiqueta.sinEstado'],
  ])('%s con %s (pago en proceso %p) dice %s', (estado, metodoPago, enProceso, clave) => {
    expect(etiquetaEstadoPedido({ estado, metodoPago }, enProceso, VIGENTE).texto).toBe(t(clave));
  });

  it('un texto del servidor para la insignia o la forma de pago se usa tal cual', () => {
    const config = configuracionConTextos({
      'tienda.pedido.etiqueta.listoRecoger': 'Ya puedes pasar',
      'tienda.pedido.metodoCorto.mercadoPago': 'En línea',
    });
    expect(etiquetaEstadoPedido({ estado: 'listo_recoger', metodoPago: METODO_EN_LINEA }, false, config)).toEqual({
      texto: 'Ya puedes pasar',
      tono: 'exito',
    });
    expect(formaPagoCorta(METODO_EN_LINEA, config)).toBe('En línea');
    expect(etiquetaMetodoPago(METODO_EN_LINEA, config)).toBe(t('tienda.pedido.metodo.mercadoPago'));
  });

  it.each<[string, Partial<Pedido>, boolean]>([
    ['entregado', { estado: 'entregado' }, true],
    ['enviado (pedido viejo)', { estado: 'enviado' }, true],
    ['listo para recoger', { estado: 'listo_recoger' }, false],
  ])('yaRecogido: %s da %p', (_caso, cambios, esperado) => {
    expect(yaRecogido(pedidoNormalizado(cambios))).toBe(esperado);
  });
});

describe('mensajes de error desde el catálogo', () => {
  it('el plazo vencido usa las horas guardadas en el pedido (o las vigentes sin pedido)', () => {
    const vencido = apiErrorDe(ERRORES_PAGO_PEDIDO.vencido);
    expect(mensajePreferenciaPedido(vencido, conReglas({ plazoPagoLineaHoras: 48 }), VIGENTE)).toBe(
      t('tienda.pedido.pago.vencido', { plazoPago: 48 }),
    );
    expect(mensajePreferenciaPedido(vencido, {}, VIGENTE)).toBe(t('tienda.pedido.pago.vencido', { plazoPago: 12 }));
  });

  it('el total que no coincide da el teléfono de la configuración; sin teléfono, el texto sin cifra', () => {
    const total = apiErrorDe(ERRORES_PAGO_PEDIDO.total);
    expect(mensajePreferenciaPedido(total, {}, VIGENTE)).toBe(
      'El total de tu pedido no coincide con sus productos. Llámanos al salón para revisarlo: +52 700 000 0000.',
    );
    const sinTelefono = { ...VIGENTE, salon: { ...VIGENTE.salon, telefono: '' } };
    expect(mensajePreferenciaPedido(total, {}, sinTelefono)).toBe(
      'El total de tu pedido no coincide con sus productos. Llámanos al salón para revisarlo.',
    );
  });

  it.each<[string, unknown, string]>([
    ['404', apiErrorDe(ERRORES_PAGO_PEDIDO.pedidoNoEncontrado), t('tienda.pedido.noEncontrado')],
    ['un 403', apiErrorDe(ERRORES_PAGO_PEDIDO.sinPermiso), t('tienda.pedido.pago.generico')],
    ['sin red', new ErrorDeRed(), MENSAJE_SIN_CONEXION],
  ])('preferencia con %s', (_caso, error, esperado) => {
    expect(mensajePreferenciaPedido(error, {}, VIGENTE)).toBe(esperado);
  });

  it.each<[string, CuerpoError, string | null, keyof typeof RESPALDO_TEXTOS]>([
    ['403 ya se prepara', ERRORES_PEDIDOS.soloPersonalCambiaEstado, 'preparando', 'tienda.pedido.cancelar.preparando'],
    ['404 no existe', ERRORES_PEDIDOS.pedidoNoEncontrado, 'noEncontrado', 'tienda.pedido.noEncontrado'],
    ['409 devolución en proceso', ERRORES_PEDIDOS.devolucionEnProceso, 'devolucionEnProceso', 'tienda.pedido.cancelar.devolucionEnProceso'],
    ['409 cambió', ERRORES_PEDIDOS.pedidoCambio, 'cambio', 'tienda.pedido.cancelar.cambio'],
    ['500', cuerpoError(500, 'Error interno ficticio'), null, 'tienda.pedido.cancelar.generico'],
  ])('cancelar con %s', (_caso, cuerpo, motivo, clave) => {
    const error = apiErrorDe(cuerpo);
    expect(motivoErrorCancelar(error)).toBe(motivo);
    expect(mensajeCancelarPedido(error, VIGENTE)).toBe(t(clave));
    expect(mensajeCancelarPedido(error, VIGENTE)).not.toContain(cuerpo.message);
  });

  it('cancelar: un error que no es de la API no tiene motivo', () => {
    expect(motivoErrorCancelar(new Error('otro'))).toBeNull();
    expect(motivoErrorCancelar(new ApiError(0, 'sin respuesta'))).toBeNull();
  });

  it('crear y revisar Mis pedidos salen del catálogo', () => {
    expect(mensajeCrearPedido(apiErrorDe(ERRORES_PEDIDOS.stockInsuficiente), VIGENTE)).toBe(t('tienda.pedido.crear.sinExistencias'));
    expect(mensajeRevisarMisPedidos(VIGENTE)).toBe(t('tienda.pedido.crear.revisarMisPedidos'));
  });

  it('textoCancelarPedido: el pagado en línea suma el reembolso completo', () => {
    expect(textoCancelarPedido(pedidoNormalizado({ estado: 'pagado' }), VIGENTE)).toBe(
      `${t('tienda.pedido.cancelar.texto')} ${t('tienda.pedido.cancelar.reembolso')}`,
    );
    expect(textoCancelarPedido(pedidoNormalizado(), VIGENTE)).toBe(t('tienda.pedido.cancelar.texto'));
  });
});
