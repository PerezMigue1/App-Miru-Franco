/// <reference types="jest" />

import type { Devolucion } from '@/features/tienda/models/devolucionesModel';
import type { Pedido } from '@/features/tienda/models/pedidoModel';
import {
  admitePedidoCompleto,
  articulosLibres,
  diasCambio,
  faltanteSolicitud,
  LARGO_MOTIVO_DEVOLUCION,
  mensajeFaltante,
  mensajeRetirar,
  mensajeSolicitud,
  motivoErrorRetirar,
  motivoErrorSolicitud,
  motivoLimpio,
  opcionesDevolucion,
  puedeRetirar,
  requiereArticulo,
  retirarDevolucion,
  solicitarDevolucion,
  solicitudRecienCreada,
  textoCausa,
  textoPoliticaDevolucion,
  textoTipoSolicitud,
} from '@/features/tienda/models/solicitudDevolucionModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { CLIENTA_CITAS, cuerpoError, llamadasDeRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { MENSAJES_DEVOLUCION, RUTA_SOLICITAR_DEVOLUCION, rutaRetirarDevolucion } from '../../helpers/pedidosFicticios';
import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-07.5: pedir y retirar una solicitud de cambio o reembolso (solicitudDevolucionModel.ts): qué se
 * ofrece con cada estado del pedido y sus solicitudes activas (la misma política que valida el
 * backend), lo que falta antes de enviar, el cuerpo de POST /api/devoluciones?propios=true (solo los
 * campos del DTO, nunca estado ni monto), POST /api/devoluciones/:id/cancelar, la búsqueda tras un
 * error de red y el mensaje propio de cada error del backend. Fetch simulado y datos ficticios.
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);
const VIGENTE = CONFIGURACION_COMPLETA;
const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto, VIGENTE);

type PedidoMinimo = Pick<Pedido, 'estado' | 'pagadoEn' | 'metodoPago' | 'reglas'> & { items: { id: number }[] };

const PAGADO_EN = '2026-10-15T18:00:00.000Z';

function pedido(cambios: Partial<PedidoMinimo> = {}): PedidoMinimo {
  return {
    estado: 'entregado',
    pagadoEn: PAGADO_EN,
    metodoPago: 'mercado_pago',
    reglas: null,
    items: [{ id: 93011 }, { id: 93021 }],
    ...cambios,
  };
}

function devolucion(cambios: Partial<Devolucion> = {}): Devolucion {
  return {
    id: 5101,
    estado: 'pendiente',
    tipo: 'cambio',
    causa: 'sellado_sin_abrir',
    pedidoItemId: 93011,
    esRevocacion: false,
    motivo: null,
    montoCentavos: null,
    metodoReembolso: null,
    notaResolucion: null,
    resueltoEn: null,
    creadoEn: new Date(Date.now()).toISOString(),
    ...cambios,
  };
}

const errorDe = (status: number, mensaje: string) => new ApiError(status, mensaje);

describe('opcionesDevolucion', () => {
  it.each<[string, Partial<PedidoMinimo>, unknown]>([
    [
      'entregado y pagado: cambio y reembolso por defecto o producto distinto',
      {},
      [
        { tipo: 'cambio', causas: ['sellado_sin_abrir', 'defecto_fabrica'] },
        { tipo: 'reembolso', causas: ['defecto_fabrica', 'producto_distinto'] },
      ],
    ],
    ['entregado sin pago registrado: solo cambio', { pagadoEn: null }, [{ tipo: 'cambio', causas: ['sellado_sin_abrir', 'defecto_fabrica'] }]],
    [
      'cancelado y pagado en línea: reembolso por existencias o por cancelación antes de estar listo',
      { estado: 'cancelado' },
      [{ tipo: 'reembolso', causas: ['sin_existencias', 'cancelacion_antes_listo'] }],
    ],
    ['cancelado y pagado en el salón: solo falta de existencias', { estado: 'cancelado', metodoPago: 'pago_en_salon' }, [{ tipo: 'reembolso', causas: ['sin_existencias'] }]],
    ['cancelado sin pago: nada', { estado: 'cancelado', pagadoEn: null }, []],
    ['pagado sin recoger: nada (se cancela o se revoca)', { estado: 'pagado' }, []],
    ['listo para recoger: nada', { estado: 'listo_recoger' }, []],
  ])('%s', (_caso, cambios, esperado) => {
    expect(opcionesDevolucion(pedido(cambios))).toEqual(esperado);
  });

  it('con una solicitud activa del pedido completo (o una revocación) no se ofrece nada', () => {
    expect(opcionesDevolucion(pedido(), [devolucion({ pedidoItemId: null, estado: 'aprobada' })])).toEqual([]);
    expect(opcionesDevolucion(pedido(), [devolucion({ pedidoItemId: null, esRevocacion: true })])).toEqual([]);
  });

  it('una resuelta o retirada del pedido completo ya no ocupa el pedido', () => {
    expect(opcionesDevolucion(pedido(), [devolucion({ pedidoItemId: null, estado: 'rechazada' })])).toHaveLength(2);
    expect(opcionesDevolucion(pedido(), [devolucion({ pedidoItemId: null, estado: 'cancelada' })])).toHaveLength(2);
  });

  it('sin artículos libres no se ofrecen las causas que piden uno, ni el pedido completo si hay activas', () => {
    const ocupado = [devolucion({ pedidoItemId: 93011 }), devolucion({ id: 5102, pedidoItemId: 93021 })];
    expect(opcionesDevolucion(pedido(), ocupado)).toEqual([]);
    expect(opcionesDevolucion(pedido({ estado: 'cancelado', items: [{ id: 93011 }] }), [devolucion()])).toEqual([]);
  });

  it('con un artículo libre se sigue ofreciendo todo lo de la política', () => {
    expect(opcionesDevolucion(pedido(), [devolucion({ pedidoItemId: 93011 })])).toHaveLength(2);
  });
});

describe('artículos y pedido completo', () => {
  it('articulosLibres quita los que tienen una solicitud activa (pendiente o aprobada)', () => {
    const lista = [devolucion(), devolucion({ id: 5102, pedidoItemId: 93021, estado: 'rechazada' })];
    expect(articulosLibres(pedido(), lista)).toEqual([93021]);
    expect(articulosLibres(pedido())).toEqual([93011, 93021]);
  });

  it('admitePedidoCompleto solo sin ninguna activa', () => {
    expect(admitePedidoCompleto()).toBe(true);
    expect(admitePedidoCompleto([devolucion({ estado: 'cancelada' })])).toBe(true);
    expect(admitePedidoCompleto([devolucion()])).toBe(false);
  });

  it.each<[Parameters<typeof requiereArticulo>[0], Parameters<typeof requiereArticulo>[1], boolean]>([
    ['cambio', 'sellado_sin_abrir', true],
    ['reembolso', 'defecto_fabrica', true],
    ['reembolso', 'producto_distinto', true],
    ['reembolso', 'sin_existencias', false],
    ['reembolso', 'cancelacion_antes_listo', false],
  ])('requiereArticulo(%s, %s) = %s', (tipo, causa, esperado) => {
    expect(requiereArticulo(tipo, causa)).toBe(esperado);
  });
});

describe('antes de enviar', () => {
  it.each<[string, Parameters<typeof faltanteSolicitud>[0], ReturnType<typeof faltanteSolicitud>]>([
    ['un cambio sin artículo', { tipo: 'cambio', causa: 'defecto_fabrica', pedidoItemId: null, sellado: false }, 'articulo'],
    ['sellado sin confirmar', { tipo: 'cambio', causa: 'sellado_sin_abrir', pedidoItemId: 93011, sellado: false }, 'sellado'],
    ['sellado confirmado', { tipo: 'cambio', causa: 'sellado_sin_abrir', pedidoItemId: 93011, sellado: true }, null],
    ['falta de existencias por el pedido completo', { tipo: 'reembolso', causa: 'sin_existencias', pedidoItemId: null, sellado: false }, null],
  ])('%s', (_caso, solicitud, esperado) => {
    expect(faltanteSolicitud(solicitud)).toBe(esperado);
  });

  it('mensajeFaltante usa el catálogo', () => {
    expect(mensajeFaltante('articulo', VIGENTE)).toBe(t('tienda.devoluciones.solicitar.faltaArticulo'));
    expect(mensajeFaltante('sellado', VIGENTE)).toBe(t('tienda.devoluciones.solicitar.faltaSellado'));
  });

  it('motivoLimpio junta espacios, recorta y no pasa del tope', () => {
    expect(motivoLimpio('  Llegó   abierto \n el frasco  ')).toBe('Llegó abierto el frasco');
    expect(motivoLimpio('a'.repeat(LARGO_MOTIVO_DEVOLUCION + 20))).toHaveLength(LARGO_MOTIVO_DEVOLUCION);
    expect(motivoLimpio('   ')).toBe('');
  });
});

describe('solicitarDevolucion', () => {
  beforeEach(async () => {
    await sembrarSesion(CLIENTA_CITAS);
  });

  it('manda solo los campos del DTO, con la sesión, y devuelve la solicitud normalizada', async () => {
    const creada = { id: 5101, pedidoId: 706, pedidoItemId: 93011, estado: 'pendiente', tipo: 'cambio', causa: 'sellado_sin_abrir', motivo: '[Cambio · Producto sellado y sin abrir] Otro tono', monto: null, origen: 'solicitud', creadoEn: '2026-10-22T16:00:00.000Z' };
    const llamadas = simular({ [RUTA_SOLICITAR_DEVOLUCION]: () => respuesta({ success: true, data: creada }, 201) });

    const resultado = await solicitarDevolucion({
      pedidoId: 706,
      tipo: 'cambio',
      causa: 'sellado_sin_abrir',
      pedidoItemId: 93011,
      sellado: true,
      motivo: '  Otro   tono ',
    });

    const [llamada] = llamadasDeRuta(llamadas, RUTA_SOLICITAR_DEVOLUCION);
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
    expect(llamada.cuerpo).toEqual({ pedidoId: 706, tipo: 'cambio', causa: 'sellado_sin_abrir', pedidoItemId: 93011, sellado: true, motivo: 'Otro tono' });
    expect(resultado).toMatchObject({ id: 5101, estado: 'pendiente', tipo: 'cambio', causa: 'sellado_sin_abrir', pedidoItemId: 93011, motivo: 'Otro tono', montoCentavos: null });
  });

  it('por el pedido completo y sin detalle: sin pedidoItemId, sin sellado y sin motivo', async () => {
    const llamadas = simular({
      [RUTA_SOLICITAR_DEVOLUCION]: () => respuesta({ success: true, data: { id: 5102, estado: 'pendiente', tipo: 'reembolso', causa: 'sin_existencias' } }, 201),
    });

    await solicitarDevolucion({ pedidoId: 703, tipo: 'reembolso', causa: 'sin_existencias', pedidoItemId: null, sellado: true, motivo: '  ' });

    expect(llamadasDeRuta(llamadas, RUTA_SOLICITAR_DEVOLUCION)[0].cuerpo).toEqual({ pedidoId: 703, tipo: 'reembolso', causa: 'sin_existencias' });
  });

  it('un pedido inválido rechaza sin llamar; una respuesta sin datos rechaza', async () => {
    const llamadas = simular({ [RUTA_SOLICITAR_DEVOLUCION]: () => respuesta({ success: true }, 201) });
    const base = { tipo: 'reembolso', causa: 'sin_existencias', pedidoItemId: null, sellado: false, motivo: '' } as const;

    await expect(solicitarDevolucion({ ...base, pedidoId: 0 })).rejects.toMatchObject({ status: 404 });
    expect(llamadasDeRuta(llamadas, RUTA_SOLICITAR_DEVOLUCION)).toHaveLength(0);
    await expect(solicitarDevolucion({ ...base, pedidoId: 703 })).rejects.toThrow('Respuesta de devolución sin datos.');
  });
});

describe('retirarDevolucion y puedeRetirar', () => {
  it('manda POST /api/devoluciones/:id/cancelar con la sesión', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simular({ [rutaRetirarDevolucion(5101)]: () => respuesta({ success: true, message: 'Solicitud cancelada' }) });

    await expect(retirarDevolucion(5101)).resolves.toBeUndefined();

    const [llamada] = llamadasDeRuta(llamadas, rutaRetirarDevolucion(5101));
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
    expect(llamada.cuerpo).toEqual({});
  });

  it('un id inválido rechaza sin llamar', async () => {
    const llamadas = simular({});
    await expect(retirarDevolucion(0)).rejects.toMatchObject({ status: 404 });
    expect(llamadas.filter((llamada) => llamada.metodo === 'POST')).toHaveLength(0);
  });

  it.each<[string, Partial<Devolucion>, boolean]>([
    ['pendiente', {}, true],
    ['aprobada', { estado: 'aprobada' }, false],
    ['revocación pendiente: se retira con el salón', { esRevocacion: true }, false],
  ])('puedeRetirar una %s: %s', (_caso, cambios, esperado) => {
    expect(puedeRetirar(devolucion(cambios))).toBe(esperado);
  });
});

describe('solicitudRecienCreada', () => {
  const elegida = { tipo: 'cambio', causa: 'sellado_sin_abrir', pedidoItemId: 93011 } as const;

  it('encuentra la pendiente con el mismo tipo, causa y artículo creada desde el envío (con un minuto de margen)', () => {
    const inicio = Date.now();
    const encontrada = devolucion({ creadoEn: new Date(inicio - 30_000).toISOString() });
    expect(solicitudRecienCreada([encontrada], elegida, inicio)).toBe(encontrada);
  });

  it('no toma una de antes del envío (más del minuto de margen)', () => {
    const inicio = Date.now();
    const vieja = devolucion({ creadoEn: new Date(inicio - 5 * 60_000).toISOString() });
    expect(solicitudRecienCreada([vieja], elegida, inicio)).toBeNull();
  });

  it.each<[string, Partial<Devolucion>]>([
    ['de otro artículo', { pedidoItemId: 93021 }],
    ['de otra causa', { causa: 'defecto_fabrica' }],
    ['de otro tipo', { tipo: 'reembolso' }],
    ['ya resuelta', { estado: 'aprobada' }],
    ['una revocación', { esRevocacion: true }],
    ['sin fecha válida', { creadoEn: 'no-es-fecha' }],
  ])('no toma una %s', (_caso, cambios) => {
    expect(solicitudRecienCreada([devolucion(cambios)], elegida, Date.now())).toBeNull();
  });
});

describe('textos', () => {
  it('tipos y causas del catálogo', () => {
    expect(textoTipoSolicitud('cambio', VIGENTE)).toEqual({
      titulo: t('tienda.devoluciones.solicitar.tipoCambio'),
      descripcion: t('tienda.devoluciones.solicitar.tipoCambioTexto'),
    });
    expect(textoTipoSolicitud('reembolso', VIGENTE).titulo).toBe(t('tienda.devoluciones.solicitar.tipoReembolso'));
    for (const [causa, clave] of [
      ['sellado_sin_abrir', 'sellado'],
      ['defecto_fabrica', 'defecto'],
      ['producto_distinto', 'distinto'],
      ['sin_existencias', 'existencias'],
      ['cancelacion_antes_listo', 'cancelacion'],
    ] as const) {
      expect(textoCausa(causa, VIGENTE).titulo).toBe(t(`tienda.devoluciones.causa.${clave}`));
    }
  });

  it('la política y los días para cambios: los del pedido o, sin ellos, los vigentes', () => {
    const conReglas = { reglas: { ...REGLAS_NULAS, diasCambioProducto: 3 } };
    expect(diasCambio(conReglas, VIGENTE)).toBe(3);
    expect(diasCambio({ reglas: null }, VIGENTE)).toBe(VIGENTE.reglas.tienda.diasCambioProducto);
    expect(textoPoliticaDevolucion(conReglas, VIGENTE)).toContain('dentro de 3 días naturales');
    expect(textoPoliticaDevolucion({ reglas: null }, VIGENTE)).toContain(`dentro de ${VIGENTE.reglas.tienda.diasCambioProducto} días naturales`);
  });
});

const REGLAS_NULAS = {
  plazoPagoLineaHoras: null,
  diasPrepararApartado: null,
  diaRecordatorioRecoger: null,
  diasCancelarNoRecogido: null,
  diasResguardoPagado: null,
  diasCambioProducto: null,
  diasHabilesRevocacion: null,
};

describe('errores al pedir', () => {
  it.each<[keyof typeof MENSAJES_DEVOLUCION, number, ReturnType<typeof motivoErrorSolicitud>]>([
    ['causaNoAplica', 400, 'causaNoAplica'],
    ['noEntregado', 400, 'noEntregado'],
    ['faltaArticulo', 400, 'faltaArticulo'],
    ['plazoCambio', 400, 'plazoCambio'],
    ['faltaSellado', 400, 'faltaSellado'],
    ['sinPago', 400, 'sinPago'],
    ['existenciasEntregado', 400, 'existenciasEntregado'],
    ['noCancelado', 400, 'noCancelado'],
    ['soloEnLinea', 400, 'soloEnLinea'],
    ['yaListo', 400, 'yaListo'],
    ['articuloAjeno', 400, 'articuloAjeno'],
    ['yaActiva', 409, 'yaActiva'],
    ['pedidoNoEncontrado', 404, 'noEncontrado'],
  ])('%s (%i) se reconoce como %s', (mensaje, status, esperado) => {
    expect(motivoErrorSolicitud(errorDe(status, MENSAJES_DEVOLUCION[mensaje]))).toBe(esperado);
  });

  it('un 403, un 400 desconocido, un 500 o un error que no es de la API', () => {
    expect(motivoErrorSolicitud(errorDe(403, 'Prohibido'))).toBe('noEncontrado');
    expect(motivoErrorSolicitud(errorDe(400, 'property estado should not exist'))).toBeNull();
    expect(motivoErrorSolicitud(errorDe(500, 'Error interno'))).toBeNull();
    expect(motivoErrorSolicitud(new Error('otro'))).toBeNull();
  });

  it('cada mensaje es del catálogo y nunca el del servidor; el plazo usa los días del pedido', () => {
    const conReglas = { reglas: { ...REGLAS_NULAS, diasCambioProducto: 4 } };
    expect(mensajeSolicitud(errorDe(400, MENSAJES_DEVOLUCION.plazoCambio), conReglas, VIGENTE)).toContain('dentro de los 4 días naturales');
    expect(mensajeSolicitud(errorDe(409, MENSAJES_DEVOLUCION.yaActiva), conReglas, VIGENTE)).toBe(t('tienda.devoluciones.error.yaActiva'));
    expect(mensajeSolicitud(errorDe(404, MENSAJES_DEVOLUCION.pedidoNoEncontrado), conReglas, VIGENTE)).toBe(t('tienda.pedido.noEncontrado'));
    const generico = mensajeSolicitud(errorDe(400, 'property estado should not exist'), conReglas, VIGENTE);
    expect(generico).toBe(t('tienda.devoluciones.error.generico'));
    expect(generico).not.toContain('property');
  });

  it('sin red o con la sesión terminada usa el mensaje común de la tienda', () => {
    expect(mensajeSolicitud(new ErrorDeRed(), { reglas: null }, VIGENTE)).not.toBe(t('tienda.devoluciones.error.generico'));
    expect(mensajeSolicitud(errorDe(401, 'No autorizado'), { reglas: null }, VIGENTE)).toMatch(/sesión/i);
  });
});

describe('errores al retirar', () => {
  it.each<[number, string, ReturnType<typeof motivoErrorRetirar>, Parameters<typeof obtenerTexto>[0]]>([
    [404, MENSAJES_DEVOLUCION.devolucionNoEncontrada, 'noEncontrada', 'tienda.devoluciones.retirar.noEncontrada'],
    [409, MENSAJES_DEVOLUCION.yaNoPendiente, 'yaNoPendiente', 'tienda.devoluciones.retirar.yaNoPendiente'],
    [409, MENSAJES_DEVOLUCION.revocacion, 'revocacion', 'tienda.devoluciones.retirar.revocacion'],
    [500, 'Error interno', null, 'tienda.devoluciones.retirar.generico'],
  ])('%i "%s": %s', (status, mensaje, motivo, clave) => {
    const error = errorDe(status, mensaje);
    expect(motivoErrorRetirar(error)).toBe(motivo);
    expect(mensajeRetirar(error, VIGENTE)).toBe(t(clave));
  });

  it('sin red usa el mensaje común; un error que no es de la API no tiene motivo', () => {
    expect(mensajeRetirar(new ErrorDeRed(), VIGENTE)).not.toBe(t('tienda.devoluciones.retirar.generico'));
    expect(motivoErrorRetirar(new Error('otro'))).toBeNull();
  });

  it('cuerpoError de prueba trae el mensaje real', () => {
    expect(cuerpoError(409, MENSAJES_DEVOLUCION.yaNoPendiente).message).toBe(MENSAJES_DEVOLUCION.yaNoPendiente);
  });
});
