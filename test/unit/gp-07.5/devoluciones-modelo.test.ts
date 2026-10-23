/// <reference types="jest" />

import {
  estadoPagoVisible,
  insigniaDevolucion,
  listarDevolucionesPedido,
  listarPagosPedido,
  motivoVisible,
  pagosVisibles,
  textoMetodoReembolso,
  textoRevocacionEntregado,
  tieneRevocacion,
  tipoDevolucion,
  type Devolucion,
  type PagoPedido,
} from '@/features/tienda/models/devolucionesModel';
import { fechaYHora } from '@/features/tienda/models/pedidoModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { CLIENTA_CITAS, conError, errorDe, ERRORES, llamadasDeRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { devolucionCruda, pagoCrudo, PREFIJO_REVOCACION, revocacionCruda, rutasDevoluciones } from '../../helpers/pedidosFicticios';
import { servidorConRutas } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { rutaDevolucionesPedido, rutaPagosPedido } from '../../helpers/tiendaFicticia';

/**
 * GP-07.5: devoluciones y pagos de un pedido en src/features/tienda/models/devolucionesModel.ts: las
 * consultas (GET /api/devoluciones/pedido/:id y GET /api/pagos/pedido/:id con ?propios=true), su
 * normalización sin el payload, la referencia ni el error técnico del pago, el motivo sin la etiqueta
 * del backend, las insignias de cada estado (pendiente, aprobada, rechazada, cancelada), el estado del
 * reembolso del pago (reembolsado con su fecha y en revisión) y el encabezado de un pedido recogido y
 * revocado.
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);
const VIGENTE = CONFIGURACION_COMPLETA;
const t = (clave: keyof typeof RESPALDO_TEXTOS, contexto = {}) => obtenerTexto(clave, contexto, VIGENTE);

/** Una devolución normalizada con los cambios (para las funciones de texto). */
function devolucion(cambios: Partial<Devolucion> = {}): Devolucion {
  return {
    id: 1,
    estado: 'pendiente',
    tipo: 'reembolso',
    causa: 'defecto_fabrica',
    pedidoItemId: null,
    esRevocacion: false,
    motivo: null,
    montoCentavos: 114_250,
    metodoReembolso: null,
    notaResolucion: null,
    resueltoEn: null,
    creadoEn: '',
    ...cambios,
  };
}

describe('listarDevolucionesPedido', () => {
  it('pide las del pedido con la sesión y las normaliza sin lo que la clienta no ve', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simular(
      rutasDevoluciones(703, [
        devolucionCruda(),
        revocacionCruda({ estado: 'aprobada', metodoReembolso: 'metodo_original', notaResolucion: 'Recibimos tu pedido.', resueltoEn: '2026-10-20T17:00:00.000Z' }),
        devolucionCruda({ id: 5003, tipo: 'cambio', monto: null, motivo: '[Cambio · Sellado] ', estado: 'rechazada' }),
        devolucionCruda({ id: 0 }),
      ]),
    );
    const lista = await listarDevolucionesPedido(703);
    const [llamada] = llamadasDeRuta(llamadas, rutaDevolucionesPedido(703));
    expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
    expect(lista).toEqual([
      {
        id: 5001,
        estado: 'pendiente',
        tipo: 'reembolso',
        causa: 'defecto_fabrica',
        pedidoItemId: null,
        esRevocacion: false,
        motivo: 'El frasco llegó roto',
        montoCentavos: 114_250,
        metodoReembolso: null,
        notaResolucion: null,
        resueltoEn: null,
        creadoEn: devolucionCruda().creadoEn,
      },
      {
        id: 5002,
        estado: 'aprobada',
        tipo: 'reembolso',
        causa: null,
        pedidoItemId: null,
        esRevocacion: true,
        motivo: 'Ya no lo necesito',
        montoCentavos: 114_250,
        metodoReembolso: 'metodo_original',
        notaResolucion: 'Recibimos tu pedido.',
        resueltoEn: '2026-10-20T17:00:00.000Z',
        creadoEn: devolucionCruda().creadoEn,
      },
      {
        id: 5003,
        estado: 'rechazada',
        tipo: 'cambio',
        causa: 'defecto_fabrica',
        pedidoItemId: null,
        esRevocacion: false,
        motivo: null,
        montoCentavos: null,
        metodoReembolso: null,
        notaResolucion: null,
        resueltoEn: null,
        creadoEn: devolucionCruda().creadoEn,
      },
    ]);
    expect(JSON.stringify(lista)).not.toMatch(/nunca-se-muestra|ref-ficticia|error-tecnico/);
  });

  it('un tipo, un método o un estado desconocidos quedan en null o como vienen', async () => {
    simular(rutasDevoluciones(703, [devolucionCruda({ tipo: 'otro', metodoReembolso: 'cheque', estado: '' })]));
    const [unica] = await listarDevolucionesPedido(703);
    expect(unica).toMatchObject({ tipo: null, metodoReembolso: null, estado: 'pendiente', motivo: '[Reembolso · Defecto de fábrica] El frasco llegó roto' });
  });

  it('un id inválido rechaza sin llamar al servidor; un error del servidor rechaza', async () => {
    const llamadas = simular({});
    await expect(listarDevolucionesPedido(0)).rejects.toThrow('Pedido no válido.');
    await expect(listarPagosPedido(-1)).rejects.toThrow('Pedido no válido.');
    expect(llamadas).toHaveLength(0);
    simular({ [rutaDevolucionesPedido(703)]: conError(ERRORES.interno) });
    expect(await errorDe(listarDevolucionesPedido(703))).toBeTruthy();
  });
});

describe('listarPagosPedido', () => {
  it('toma solo el estado, el monto y la fecha de reembolso de cada pago', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simular(
      rutasDevoluciones(703, [], [pagoCrudo({ estado: 'reembolsado', reembolsadoEn: '2026-10-21T18:00:00.000Z' }), pagoCrudo({ id: 0 }), pagoCrudo({ id: 2, estado: '' })]),
    );
    const pagos = await listarPagosPedido(703);
    expect(llamadasDeRuta(llamadas, rutaPagosPedido(703))).toHaveLength(1);
    expect(pagos).toEqual([
      { id: 80_703, estado: 'reembolsado', montoCentavos: 114_250, reembolsadoEn: '2026-10-21T18:00:00.000Z' },
      { id: 2, estado: 'pendiente', montoCentavos: 114_250, reembolsadoEn: null },
    ]);
  });
});

describe('textos de las devoluciones', () => {
  it.each<[string, string, string]>([
    ['pendiente', t('tienda.devoluciones.estado.pendiente'), 'aviso'],
    ['aprobada', t('tienda.devoluciones.estado.aprobada'), 'exito'],
    ['rechazada', t('tienda.devoluciones.estado.rechazada'), 'peligro'],
    ['cancelada', t('tienda.devoluciones.estado.cancelada'), 'neutro'],
    ['en_espera', 'en espera', 'neutro'],
  ])('insignia de "%s"', (estado, texto, tono) => {
    expect(insigniaDevolucion(estado, VIGENTE)).toEqual({ texto, tono });
  });

  it.each<[string, Partial<Devolucion>, string | null]>([
    ['revocación', { esRevocacion: true }, t('tienda.devoluciones.revocacion')],
    ['cambio', { tipo: 'cambio' }, t('tienda.devoluciones.tipo.cambio')],
    ['reembolso', { tipo: 'reembolso' }, t('tienda.devoluciones.tipo.reembolso')],
    ['sin tipo', { tipo: null }, null],
  ])('tipo de %s', (_caso, cambios, esperado) => {
    expect(tipoDevolucion(devolucion(cambios), VIGENTE)).toBe(esperado);
  });

  it.each<[string, Partial<Devolucion>, string | null]>([
    ['aprobada en efectivo', { estado: 'aprobada', metodoReembolso: 'efectivo' }, t('tienda.devoluciones.metodo.efectivo')],
    ['aprobada al mismo medio', { estado: 'aprobada', metodoReembolso: 'metodo_original' }, t('tienda.devoluciones.metodo.original')],
    ['pendiente con método', { metodoReembolso: 'efectivo' }, null],
    ['aprobada sin método', { estado: 'aprobada' }, null],
  ])('método de reembolso: %s', (_caso, cambios, esperado) => {
    expect(textoMetodoReembolso(devolucion(cambios), VIGENTE)).toBe(esperado);
  });

  it.each<[string, unknown, boolean, string | null]>([
    ['revocación con texto', `${PREFIJO_REVOCACION} Me equivoqué`, true, 'Me equivoqué'],
    ['revocación sin texto', PREFIJO_REVOCACION, true, null],
    ['solicitud sin etiqueta', 'Llegó abierto', false, 'Llegó abierto'],
    ['vacío', '   ', false, null],
    ['no es texto', 42, false, '42'],
  ])('motivo visible: %s', (_caso, motivo, conEtiqueta, esperado) => {
    expect(motivoVisible(motivo, conEtiqueta)).toBe(esperado);
  });
});

describe('pagos y reembolso visibles', () => {
  const pago = (cambios: Partial<PagoPedido>): PagoPedido => ({ id: 1, estado: 'aprobado', montoCentavos: 114_250, reembolsadoEn: null, ...cambios });

  it('solo aprobados, reembolsados y en revisión (los intentos fallidos no)', () => {
    const lista = ['pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado', 'en_revision'].map((estado, i) =>
      pago({ id: i + 1, estado }),
    );
    expect(pagosVisibles(lista).map((p) => p.estado)).toEqual(['aprobado', 'reembolsado', 'en_revision']);
  });

  it.each<[string, Partial<PagoPedido>, string, string, string | null]>([
    ['aprobado', {}, t('tienda.devoluciones.pago.aprobado'), 'exito', null],
    [
      'reembolsado con su fecha',
      { estado: 'reembolsado', reembolsadoEn: '2026-10-21T18:00:00.000Z' },
      t('tienda.devoluciones.pago.reembolsado'),
      'info',
      t('tienda.devoluciones.pago.reembolsadoEl', { fecha: fechaYHora('2026-10-21T18:00:00.000Z') }),
    ],
    ['reembolsado sin fecha', { estado: 'reembolsado' }, t('tienda.devoluciones.pago.reembolsado'), 'info', t('tienda.devoluciones.pago.reembolsadoSinFecha')],
    ['en revisión: el salón lo revisa', { estado: 'en_revision' }, t('tienda.devoluciones.pago.enRevision'), 'aviso', t('tienda.devoluciones.pago.revisando')],
  ])('%s', (_caso, cambios, texto, tono, detalle) => {
    expect(estadoPagoVisible(pago(cambios), fechaYHora, VIGENTE)).toEqual({ texto, tono, detalle });
  });
});

describe('encabezado de un pedido recogido y revocado', () => {
  const entregado = { estado: 'entregado' };

  it.each<[string, Partial<Devolucion>, string | null]>([
    ['pendiente de entregar', { estado: 'pendiente' }, t('pedidos.revocacion.pendiente', { monto: ' $1,142.50' })],
    ['aprobada', { estado: 'aprobada' }, t('pedidos.revocacion.aprobada', { monto: ' $1,142.50' })],
    ['aprobada sin monto', { estado: 'aprobada', montoCentavos: null }, t('pedidos.revocacion.aprobada', { monto: '' })],
    ['rechazada', { estado: 'rechazada' }, t('pedidos.revocacion.rechazada')],
    ['cancelada no cuenta', { estado: 'cancelada' }, null],
    ['un estado desconocido', { estado: 'otro' }, null],
  ])('%s', (_caso, cambios, esperado) => {
    expect(textoRevocacionEntregado(entregado, [devolucion({ esRevocacion: true, ...cambios })], VIGENTE)).toBe(esperado);
  });

  it('el monto va con su espacio delante: "te reembolsamos $1,142.50 por el mismo medio"', () => {
    expect(textoRevocacionEntregado(entregado, [devolucion({ esRevocacion: true })], VIGENTE)).toContain(
      'te reembolsamos $1,142.50 por el mismo medio',
    );
  });

  it('sin revocación o sin estar entregado no aplica', () => {
    expect(textoRevocacionEntregado(entregado, [devolucion()], VIGENTE)).toBeNull();
    expect(textoRevocacionEntregado({ estado: 'cancelado' }, [devolucion({ esRevocacion: true })], VIGENTE)).toBeNull();
  });

  it.each<[string, Partial<Devolucion>, boolean]>([
    ['revocación pendiente', { esRevocacion: true }, true],
    ['revocación aprobada', { esRevocacion: true, estado: 'aprobada' }, true],
    ['revocación rechazada', { esRevocacion: true, estado: 'rechazada' }, false],
    ['solicitud normal', {}, false],
  ])('tieneRevocacion: %s', (_caso, cambios, esperado) => {
    expect(tieneRevocacion([devolucion(cambios)])).toBe(esperado);
  });
});

describe('sin configuración usa la que está en memoria', () => {
  it('insignias, tipos, método, pagos y encabezado con el respaldo de textos', () => {
    expect(insigniaDevolucion('aprobada').texto).toBe(RESPALDO_TEXTOS['tienda.devoluciones.estado.aprobada']);
    expect(tipoDevolucion(devolucion({ tipo: 'cambio' }))).toBe(RESPALDO_TEXTOS['tienda.devoluciones.tipo.cambio']);
    expect(textoMetodoReembolso(devolucion({ estado: 'aprobada', metodoReembolso: 'efectivo' }))).toBe(
      RESPALDO_TEXTOS['tienda.devoluciones.metodo.efectivo'],
    );
    expect(textoRevocacionEntregado({ estado: 'entregado' }, [devolucion({ esRevocacion: true, estado: 'rechazada' })])).toBe(
      RESPALDO_TEXTOS['pedidos.revocacion.rechazada'],
    );
    // Un estado que no se muestra (no debería llegar) se pinta como aprobado, sin detalle.
    expect(
      estadoPagoVisible({ id: 1, estado: 'otro', montoCentavos: 0, reembolsadoEn: null }, fechaYHora),
    ).toEqual({ texto: RESPALDO_TEXTOS['tienda.devoluciones.pago.aprobado'], tono: 'exito', detalle: null });
  });
});
