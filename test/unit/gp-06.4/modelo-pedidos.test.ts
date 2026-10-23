/// <reference types="jest" />

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import { fechaLegible, horaLegible, type EtiquetaEstado } from '@/features/citas/models/citaModel';
import { MENSAJE_SESION_TERMINADA } from '@/features/tienda/models/carritoModel';
import {
  buscarPedidoRecienCreado,
  cancelarPedido,
  crearPedido,
  crearPreferenciaPedido,
  esPagoEnLinea,
  esPagoEnSalon,
  esPedidoNoEncontrado,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  fechaPedido,
  formaPagoCorta,
  limitePagoPedido,
  listarMisPedidos,
  mensajeCancelarPedido,
  mensajeCrearPedido,
  mensajePreferenciaPedido,
  motivoConflictoPedido,
  obtenerEstadoPagoPedido,
  obtenerPedido,
  pidePagoEnLinea,
  puedeCancelar,
  REDIRECCION_PEDIDO,
  textoCancelarPedido,
  textoQueSigue,
  vencimientoPagoMs,
  type BusquedaPedidoReciente,
  type ItemPedido,
  type LineaPedido,
  type MetodoPago,
  type MotivoConflictoPedido,
  type Pedido,
} from '@/features/tienda/models/pedidoModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

import {
  AHORA,
  AHORA_ISO,
  CLIENTA_CITAS,
  conError,
  cuerpoError,
  enHoraLocal,
  ERRORES,
  errorDe,
  HORA_MS,
  HOY,
  llamadasDeRuta,
  RUTA_RENOVAR_MOVIL,
  simularSinRed,
  sinRedEnRuta,
  usarRelojFijo,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { respuesta, servidorConRutas, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import {
  ARTICULOS_PEDIDO,
  ARTICULOS_PEDIDO_NORMALIZADOS,
  cuerpoCancelarPedido,
  cuerpoMisPedidos,
  cuerpoPedido,
  deepLinkPedido,
  ERRORES_PAGO_PEDIDO,
  ERRORES_PEDIDOS,
  ESTADOS_PAGO_PEDIDO,
  ESTADOS_PEDIDO,
  ID_PEDIDO,
  imagenProducto,
  INIT_POINT_PEDIDO,
  isoMasMinutos,
  LINEAS_PEDIDO,
  METODO_EN_LINEA,
  METODO_EN_SALON,
  MIS_PEDIDOS_CRUDOS,
  pedidoApartado,
  pedidoCrudo,
  pedidoNormalizado,
  pedidoPagado,
  preferenciaPedidoCruda,
  REGLAS_PEDIDO,
  reembolsoCrudo,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCancelarPedido,
  rutaEstadoPagoPedido,
  rutaPedido,
  rutasPedidos,
  type PedidoCrudo,
} from '../../helpers/tiendaFicticia';

/**
 * GP-06.4 (tienda): modelo de pedidos en src/features/tienda/models/pedidoModel.ts, en caja blanca.
 * Normalización de pedidos y artículos, crear, listar, buscar el recién creado tras un error de red,
 * detalle, cancelar con o sin reembolso, preferencia y estado del pago en línea, reglas del pedido
 * (insignias, plazo de pago, qué sigue) y los mensajes de sus errores armados por apiClient. Solo
 * fetch es simulado (http://api.test) y el reloj está fijo en AHORA; apiClient es el real.
 *
 * Alcance: el plazo del pago en línea sale de las reglas guardadas en el pedido (REGLAS_PEDIDO) o,
 * sin ellas, de las vigentes (GP-07.5: antes era una constante de la app); los plazos de los
 * apartados los aplica el backend.
 */

usarRelojFijo();

/** Servidor simulado con lo de fondo y rutasPedidos(); las rutas de cada prueba van encima. */
const simularServidor = servidorConRutas({ ...RUTAS_DE_FONDO, ...rutasPedidos() });

/** Texto técnico que nunca debe llegar a la pantalla. */
const TEXTO_TECNICO = 'PrismaClientKnownRequestError: Unique constraint failed on the fields: (pedidoId)';

/** Imagen https ficticia para los artículos. */
const IMAGEN = imagenProducto('otra-foto');

/** Textos que la app muestra a la clienta (escritos a mano; los comunes vienen de la tienda). */
const TEXTOS = {
  sinConexion: MENSAJE_SIN_CONEXION,
  sesionTerminada: MENSAJE_SESION_TERMINADA,
  crearSinPiezas: 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.',
  crearSinProducto: 'Uno de tus productos ya no está en la tienda. Revisa tu carrito.',
  crearGenerico: 'No pudimos crear tu pedido. Intenta de nuevo en un momento.',
  pedidoNoEncontrado: 'No encontramos este pedido.',
  pagoGenerico: 'No pudimos abrir el pago. Intenta de nuevo.',
  noPendiente: 'Este pedido ya no está pendiente de pago.',
  vencido: 'El plazo de 24 horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.',
  total: 'El total de tu pedido no coincide con sus productos. Llámanos al salón para revisarlo: +52 771 268 1432.',
  enSalon: 'Este pedido se paga al recogerlo en el salón.',
  noDisponible: 'El pago en línea no está disponible por ahora. Intenta más tarde.',
  cancelarPreparando: 'Este pedido ya se está preparando y no se puede cancelar.',
  cancelarCambio: 'Tu pedido cambió. Lo actualizamos para que veas su estado.',
  cancelarGenerico: 'No pudimos cancelar tu pedido. Intenta de nuevo en un momento.',
} as const;

function apiErrorDe(cuerpo: CuerpoError): ApiError {
  return crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });
}

/** La única llamada a esa ruta, revisando que salió con la sesión de la clienta. */
function llamadaConSesion(llamadas: Llamada[], ruta: string): Llamada {
  const [llamada, ...otras] = llamadasDeRuta(llamadas, ruta);
  expect(otras).toHaveLength(0);
  expect(llamada?.cabeceras.Authorization).toMatch(/^Bearer /);
  return llamada;
}

/** El error con el que falla `llamar` cuando esa ruta responde con `manejador`. */
async function errorAl(ruta: string, manejador: Manejador, llamar: () => Promise<unknown>): Promise<unknown> {
  simularServidor({ [ruta]: manejador });
  return errorDe(llamar());
}

/** Pasa pedidoCrudo() con esos campos encima por obtenerPedido. */
async function pedidoConCampos(campos: Record<string, unknown>): Promise<Pedido> {
  simularServidor({ [rutaPedido()]: () => respuesta(cuerpoPedido({ ...pedidoCrudo(), ...campos })) });
  return obtenerPedido(ID_PEDIDO);
}

/** El primer artículo crudo (2 shampoos) con esos campos encima, ya normalizado. */
async function articuloCon(campos: Record<string, unknown>): Promise<ItemPedido[]> {
  return (await pedidoConCampos({ items: [{ ...ARTICULOS_PEDIDO[0], ...campos }] })).items;
}

const PRODUCTO = ARTICULOS_PEDIDO[0].producto;
const PRESENTACION = ARTICULOS_PEDIDO[0].presentacion;

// GP-07.5: el plazo ya no es una constante de la app; es el guardado en el pedido (REGLAS_PEDIDO).
const VIGENCIA_MS = REGLAS_PEDIDO.plazoPagoLineaHoras * HORA_MS;

/** Momento en que vence el pago en línea del pedido creado en AHORA. */
const VENCE_MS = AHORA.getTime() + VIGENCIA_MS;

const crear = () => crearPedido(LINEAS_PEDIDO, METODO_EN_LINEA);
const cancelar = () => cancelarPedido(ID_PEDIDO);
const pagar = () => crearPreferenciaPedido(ID_PEDIDO);

// ── Normalización ────────────────────────────────────────────────────────────────────────────

describe('obtenerPedido: detalle del pedido (GET /api/pedidos/:id?propios=true)', () => {
  it('con el id como texto pide el pedido con la sesión y lo normaliza con importes en centavos', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidor({});
    const pedido = await obtenerPedido(` ${ID_PEDIDO} `);
    expect(llamadas).toHaveLength(1);
    const llamada = llamadaConSesion(llamadas, rutaPedido());
    expect(llamada.ruta).toBe(`/api/pedidos/${ID_PEDIDO}?propios=true`);
    expect(pedido).toEqual(pedidoNormalizado());
  });

  it.each<[string, string | number]>([
    ['texto', 'abc'],
    ['cero', 0],
    ['negativo', -1],
    ['con decimales', '1.5'],
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('un id inválido (%s) rechaza con ApiError 404 sin llamar al servidor', async (_caso, id) => {
    const llamadas = simularServidor({});
    const error = await errorDe(obtenerPedido(id));
    expect(error).toEqual(new ApiError(404, 'Pedido no encontrado'));
    expect(esPedidoNoEncontrado(error)).toBe(true);
    expect(llamadas).toHaveLength(0);
  });

  it('un pedido ajeno o que no existe llega como 404 y la clienta lee "No encontramos este pedido."', async () => {
    const error = await errorAl(rutaPedido(), conError(ERRORES_PEDIDOS.pedidoNoEncontrado), () => obtenerPedido(ID_PEDIDO));
    expect(error).toEqual(apiErrorDe(ERRORES_PEDIDOS.pedidoNoEncontrado));
    expect(esPedidoNoEncontrado(error)).toBe(true);
    expect(mensajePreferenciaPedido(error)).toBe(TEXTOS.pedidoNoEncontrado);
    expect(mensajeCancelarPedido(error)).toBe(TEXTOS.pedidoNoEncontrado);
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['con data null', { success: true, data: null }],
    ['con data como arreglo', { success: true, data: [pedidoCrudo()] }],
    ['con un pedido sin id', { success: true, data: { ...pedidoCrudo(), id: 0 } }],
    ['con un id que no es número', { success: true, data: { ...pedidoCrudo(), id: 'abc' } }],
    ['vacía', null],
    ['como texto', 'pedido'],
  ])('una respuesta %s lanza un Error común (no ApiError)', async (_caso, cuerpo) => {
    simularServidor({ [rutaPedido()]: () => respuesta(cuerpo) });
    const error = await errorDe(obtenerPedido(ID_PEDIDO));
    expect(error).toEqual(new Error('Respuesta de pedido sin datos.'));
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe('normalización del pedido', () => {
  it.each<[string, Record<string, unknown>, Partial<Pedido>]>([
    ['metodoPago en mayúsculas se pasa a minúsculas', { metodoPago: 'MERCADO_PAGO' }, {}],
    ['metodoPago con espacios', { metodoPago: ' Pago_En_Salon ' }, { metodoPago: METODO_EN_SALON }],
    ['sin metodoPago', { metodoPago: null }, { metodoPago: '' }],
    ['sin total: usa el subtotal', { total: null, subtotal: '500' }, { subtotalCentavos: 50_000, totalCentavos: 50_000 }],
    ['total "0": usa el subtotal', { total: '0' }, {}],
    ['total con $ y comas', { total: '$1,500.00' }, { totalCentavos: 150_000 }],
    ['subtotal y total como número', { subtotal: 99.99, total: 99.99 }, { subtotalCentavos: 9_999, totalCentavos: 9_999 }],
    ['sin importes', { subtotal: null, total: null }, { subtotalCentavos: 0, totalCentavos: 0 }],
    ['pagadoEn vacío es null', { pagadoEn: '' }, { pagadoEn: null }],
    ['pagadoEn se conserva', { pagadoEn: AHORA_ISO }, { pagadoEn: AHORA_ISO }],
    ['estado con espacios', { estado: ' pagado ' }, { estado: 'pagado' }],
    ['sin estado', { estado: null }, { estado: '' }],
    ['sin creadoEn', { creadoEn: null }, { creadoEn: '' }],
    ['items que no son arreglo', { items: 'artículos' }, { items: [], piezas: 0 }],
  ])('%s', async (_caso, campos, esperado) => {
    await expect(pedidoConCampos(campos)).resolves.toEqual(pedidoNormalizado(esperado));
  });

  it('descarta lo que no es objeto y los artículos con id inválido; piezas suma las cantidades', async () => {
    const [primero, segundo] = ARTICULOS_PEDIDO;
    const pedido = await pedidoConCampos({
      items: [
        null,
        'artículo',
        [primero],
        { ...primero, id: 0 },
        { ...primero, id: 'abc' },
        { ...primero, id: -1 },
        { ...primero, id: 1.5 },
        { ...primero, id: 9, cantidad: 0 },
        { ...segundo, cantidad: 5, subtotal: null },
      ],
    });
    expect(pedido.items.map((item) => [item.id, item.cantidad])).toEqual([
      [9, 1],
      [93021, 5],
    ]);
    expect(pedido.piezas).toBe(6);
  });
});

describe('normalización de los artículos', () => {
  it.each<[string, Record<string, unknown>, Partial<ItemPedido>]>([
    ['importes con $ y comas', { precioUnitario: '$1,200.50', subtotal: '$2,401' }, { precioUnitarioCentavos: 120_050, subtotalCentavos: 240_100 }],
    ['importes como número', { precioUnitario: 199.9, subtotal: 399.8 }, { precioUnitarioCentavos: 19_990, subtotalCentavos: 39_980 }],
    ['sin subtotal: precio por cantidad', { subtotal: null }, {}],
    ['subtotal "0": precio por cantidad', { subtotal: '0', cantidad: 3 }, { cantidad: 3, subtotalCentavos: 114_000 }],
    ['precio que no es número', { precioUnitario: 'gratis', subtotal: null }, { precioUnitarioCentavos: 0, subtotalCentavos: 0 }],
    ['cantidad 0 cuenta como 1', { cantidad: 0, subtotal: null }, { cantidad: 1, subtotalCentavos: 38_000 }],
    ['cantidad negativa cuenta como 1', { cantidad: -2 }, { cantidad: 1 }],
    ['cantidad con decimales cuenta como 1', { cantidad: 2.5 }, { cantidad: 1 }],
    ['cantidad como texto', { cantidad: ' 4 ', subtotal: null }, { cantidad: 4, subtotalCentavos: 152_000 }],
    ['sin nombreProducto: el del producto', { nombreProducto: null, producto: { ...PRODUCTO, nombre: 'Nombre del catálogo' } }, { nombre: 'Nombre del catálogo' }],
    ['nombreProducto en blanco: el del producto', { nombreProducto: '   ', producto: { ...PRODUCTO, nombre: 'Nombre del catálogo' } }, { nombre: 'Nombre del catálogo' }],
    ['nombreProducto guardado gana al del producto', { nombreProducto: ' Nombre guardado ', producto: { ...PRODUCTO, nombre: 'Otro' } }, { nombre: 'Nombre guardado' }],
    ['sin nombre en ningún lado', { nombreProducto: null, producto: null }, { nombre: '' }],
    ['sin tamanio: el de la presentación', { tamanio: null, presentacion: { ...PRESENTACION, tamanio: '1L' } }, { tamanio: '1L' }],
    ['sin tamanio ni presentación', { tamanio: null, presentacion: null }, { tamanio: '', imagen: undefined }],
    ['ids desde las relaciones', { productoId: null, presentacionId: null, producto: { ...PRODUCTO, id: 399 }, presentacion: { ...PRESENTACION, id: 3999 } }, { productoId: 399, presentacionId: 3999 }],
    ['ids inválidos dan 0', { productoId: 'abc', presentacionId: -5 }, { productoId: 0, presentacionId: 0 }],
    ['imagen del producto si la presentación no trae', { presentacion: { ...PRESENTACION, imagenes: [] }, producto: { ...PRODUCTO, imagenes: [IMAGEN] } }, { imagen: IMAGEN }],
    ['imagen de la presentación como texto', { presentacion: { ...PRESENTACION, imagenes: IMAGEN } }, { imagen: IMAGEN }],
    ['una imagen http no se usa', { presentacion: { ...PRESENTACION, imagenes: ['http://img.test/foto.jpg'] } }, { imagen: undefined }],
  ])('%s', async (_caso, campos, esperado) => {
    await expect(articuloCon(campos)).resolves.toEqual([{ ...ARTICULOS_PEDIDO_NORMALIZADOS[0], ...esperado }]);
  });
});

// ── Lista y creación ─────────────────────────────────────────────────────────────────────────

describe('listarMisPedidos (GET /api/pedidos?propios=true)', () => {
  it('pide hasta 100, del más reciente al más viejo, con la sesión, y normaliza cada pedido', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidor({});
    const pedidos = await listarMisPedidos();
    expect(llamadas).toHaveLength(1);
    const llamada = llamadaConSesion(llamadas, RUTA_MIS_PEDIDOS);
    expect(llamada.ruta).toBe('/api/pedidos?propios=true&limit=100&sort=creadoEn:desc');
    expect(llamada.cuerpo).toBeUndefined();
    expect(pedidos[0]).toEqual(pedidoNormalizado());
    expect(pedidos.map((p) => [p.id, p.estado, p.metodoPago])).toEqual([
      [701, 'pendiente_pago', METODO_EN_LINEA],
      [702, 'pendiente_pago', METODO_EN_SALON],
      [703, 'pagado', METODO_EN_LINEA],
      [704, 'preparando', METODO_EN_LINEA],
      [705, 'listo_recoger', METODO_EN_SALON],
      [706, 'entregado', METODO_EN_LINEA],
      [707, 'cancelado', METODO_EN_LINEA],
      [708, 'entregado', 'efectivo'],
    ]);
  });

  it('descarta lo que no es objeto y los pedidos sin id válido', async () => {
    const lista = [null, 'pedido', { ...pedidoCrudo(), id: 0 }, { ...pedidoCrudo(), id: 'abc' }, pedidoApartado()];
    simularServidor({ [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(lista)) });
    expect((await listarMisPedidos()).map((p) => p.id)).toEqual([702]);
  });

  it.each<[string, unknown, number[]]>([
    ['un arreglo sin envoltura', [pedidoCrudo()], [ID_PEDIDO]],
    ['la lista en "pedidos"', { success: true, pedidos: [pedidoApartado()] }, [702]],
    ['una lista vacía', cuerpoMisPedidos([]), []],
    ['data null', { success: true, data: null }, []],
    ['un cuerpo null', null, []],
  ])('acepta %s', async (_caso, cuerpo, ids) => {
    simularServidor({ [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpo) });
    expect((await listarMisPedidos()).map((p) => p.id)).toEqual(ids);
  });
});

describe('crearPedido (POST /api/pedidos?propios=true)', () => {
  it.each<[MetodoPago]>([['mercado_pago'], ['pago_en_salon']])(
    'con %s manda estado pendiente_pago, MXN, el método y solo las líneas; devuelve el pedido creado',
    async (metodoPago) => {
      await sembrarSesion(CLIENTA_CITAS);
      const llamadas = simularServidor({});
      const lineas = LINEAS_PEDIDO.map((linea) => ({ ...linea, precio: 1, nombre: 'Extra' }) as LineaPedido);
      const pedido = await crearPedido(lineas, metodoPago);
      expect(llamadas).toHaveLength(1);
      expect(llamadaConSesion(llamadas, RUTA_CREAR_PEDIDO).cuerpo).toStrictEqual({
        estado: 'pendiente_pago',
        moneda: 'MXN',
        metodoPago,
        items: LINEAS_PEDIDO,
      });
      expect(pedido).toEqual(pedidoNormalizado({ metodoPago }));
    },
  );

  it('una respuesta sin data lanza un Error común', async () => {
    simularServidor({ [RUTA_CREAR_PEDIDO]: () => respuesta({ success: true }, 201) });
    await expect(crear()).rejects.toThrow('Respuesta de pedido sin datos.');
  });
});

describe('buscarPedidoRecienCreado (tras un error de red al crear)', () => {
  const desde = AHORA.getTime();
  const [primero, segundo] = ARTICULOS_PEDIDO;

  /** El resultado sin el pedido completo: el estado y, con uno solo, su id. */
  const resumen = (busqueda: BusquedaPedidoReciente) =>
    busqueda.estado === 'unico' ? { estado: busqueda.estado, id: busqueda.pedido.id } : { estado: busqueda.estado };

  // GP-07.5: el margen del reloj bajó de 5 minutos a 1 y dos candidatos ya no se resuelven tomando el
  // primero: son "ambiguo" (el checkout pide revisar Mis pedidos en lugar de reintentar a ciegas).
  it.each<[string, PedidoCrudo[], ReturnType<typeof resumen>]>([
    ['el mismo pedido', [pedidoCrudo()], { estado: 'unico', id: ID_PEDIDO }],
    ['las mismas líneas en otro orden', [pedidoCrudo({ items: [segundo, primero] })], { estado: 'unico', id: ID_PEDIDO }],
    ['creado justo 1 minuto antes del intento (margen del reloj)', [pedidoCrudo({ creadoEn: isoMasMinutos(AHORA_ISO, -1) })], { estado: 'unico', id: ID_PEDIDO }],
    ['creado un instante antes del margen', [pedidoCrudo({ creadoEn: new Date(desde - 60_000 - 1).toISOString() })], { estado: 'ninguno' }],
    ['dos que coinciden', [pedidoApartado(), pedidoCrudo({ id: 709 }), pedidoCrudo()], { estado: 'ambiguo' }],
    ['con otro método de pago', [pedidoApartado()], { estado: 'ninguno' }],
    ['que ya no está pendiente de pago', [pedidoPagado()], { estado: 'ninguno' }],
    ['con otra cantidad', [pedidoCrudo({ items: [{ ...primero, cantidad: 3 }, segundo] })], { estado: 'ninguno' }],
    ['con una línea de más', [pedidoCrudo({ items: [primero, segundo, { ...segundo, id: 9, presentacionId: 3051 }] })], { estado: 'ninguno' }],
    ['con una línea de menos', [pedidoCrudo({ items: [primero] })], { estado: 'ninguno' }],
    ['con una fecha que no se puede leer', [pedidoCrudo({ creadoEn: 'hace rato' })], { estado: 'ninguno' }],
    ['sin pedidos', [], { estado: 'ninguno' }],
  ])('%s', async (_caso, lista, esperado) => {
    const llamadas = simularServidor({ [RUTA_MIS_PEDIDOS]: () => respuesta(cuerpoMisPedidos(lista)) });
    const busqueda = await buscarPedidoRecienCreado(LINEAS_PEDIDO, METODO_EN_LINEA, desde);
    expect(resumen(busqueda)).toEqual(esperado);
    expect(llamadasDeRuta(llamadas, RUTA_MIS_PEDIDOS)).toHaveLength(1);
  });

  // GP-07.5: sin poder consultar ya no da null (que dejaba reintentar y duplicar): da "sinVerificar".
  it.each<[string, Manejador]>([
    ['sin red', sinRedEnRuta],
    ['con un 500', conError(ERRORES.interno)],
    ['con un 401', conError(ERRORES.noAutorizado)],
  ])('nunca lanza: %s da sinVerificar', async (_caso, manejador) => {
    simularServidor({ [RUTA_MIS_PEDIDOS]: manejador });
    await expect(buscarPedidoRecienCreado(LINEAS_PEDIDO, METODO_EN_LINEA, desde)).resolves.toEqual({ estado: 'sinVerificar' });
  });
});

// ── Cancelar ─────────────────────────────────────────────────────────────────────────────────

describe('cancelarPedido (PUT /api/pedidos/:id?propios=true)', () => {
  it('manda solo { estado: "cancelado" } con la sesión y devuelve el pedido cancelado sin reembolso', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidor({});
    const resultado = await cancelar();
    expect(llamadas).toHaveLength(1);
    expect(llamadaConSesion(llamadas, rutaCancelarPedido()).cuerpo).toStrictEqual({ estado: 'cancelado' });
    expect(resultado).toEqual({ pedido: pedidoNormalizado({ estado: 'cancelado' }), reembolso: null });
  });

  it.each<[string, unknown, unknown]>([
    ['ya pedido a Mercado Pago', reembolsoCrudo('reembolsado'), { estado: 'reembolsado', montoCentavos: 114_250 }],
    ['en revisión del salón, con monto como texto', reembolsoCrudo('en_revision', '1,142.50' as unknown as number), { estado: 'en_revision', montoCentavos: 114_250 }],
    ['con un monto que no es número', reembolsoCrudo('reembolsado', Number.NaN), { estado: 'reembolsado', montoCentavos: 0 }],
    ['con un estado desconocido', reembolsoCrudo('pendiente'), null],
    ['que no es objeto', 'reembolsado', null],
  ])('un pedido pagado con reembolso %s', async (_caso, reembolso, esperado) => {
    const pagado = pedidoPagado({ id: ID_PEDIDO });
    simularServidor({
      [rutaCancelarPedido()]: () => respuesta({ ...(cuerpoCancelarPedido(pagado) as object), reembolso }),
    });
    const resultado = await cancelar();
    expect(resultado.reembolso).toEqual(esperado);
    expect(resultado.pedido).toMatchObject({ id: ID_PEDIDO, estado: 'cancelado', pagadoEn: pagado.pagadoEn });
  });

  it('las rutas de ejemplo: el pagado en línea trae reembolso; el de la web, en revisión', async () => {
    simularServidor({});
    await expect(cancelarPedido(703)).resolves.toMatchObject({ reembolso: { estado: 'reembolsado', montoCentavos: 114_250 } });
    simularServidor({ ...rutasPedidos([pedidoPagado({ id: 710, metodoPago: 'efectivo' })]) });
    await expect(cancelarPedido(710)).resolves.toMatchObject({ reembolso: { estado: 'en_revision' } });
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['con data null', { success: true, data: null }],
    ['vacía', null],
  ])('si la respuesta llega %s, relee el pedido con GET y no da reembolso', async (_caso, cuerpo) => {
    const llamadas = simularServidor({
      [rutaCancelarPedido()]: () => respuesta(cuerpo),
      [rutaPedido()]: () => respuesta(cuerpoPedido(pedidoCrudo({ estado: 'cancelado' }))),
    });
    await expect(cancelar()).resolves.toEqual({ pedido: pedidoNormalizado({ estado: 'cancelado' }), reembolso: null });
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([rutaCancelarPedido(), rutaPedido()]);
  });

  it('el id va codificado en la ruta', async () => {
    const id = 'a b/c?d';
    const llamadas = simularServidor({ [rutaCancelarPedido(id)]: () => respuesta(cuerpoCancelarPedido(pedidoCrudo())) });
    await cancelarPedido(id);
    expect(llamadas[0].ruta).toBe('/api/pedidos/a%20b%2Fc%3Fd?propios=true');
  });
});

// ── Pago en línea ────────────────────────────────────────────────────────────────────────────

describe('crearPreferenciaPedido (POST /api/pagos-en-linea/mercadopago/preferencia?origen=app)', () => {
  it.each<[string, string | number]>([
    ['número', ID_PEDIDO],
    ['texto', String(ID_PEDIDO)],
  ])('con el id como %s manda { pedidoId } numérico, con la sesión, y devuelve el initPoint', async (_caso, id) => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidor({});
    await expect(crearPreferenciaPedido(id)).resolves.toBe(INIT_POINT_PEDIDO);
    expect(llamadas).toHaveLength(1);
    const llamada = llamadaConSesion(llamadas, RUTA_PREFERENCIA_PEDIDO);
    expect(llamada.ruta).toBe('/api/pagos-en-linea/mercadopago/preferencia?origen=app');
    expect(llamada.cuerpo).toStrictEqual({ pedidoId: ID_PEDIDO });
  });

  it.each<[string, string]>([
    ['el checkout de www', INIT_POINT_PEDIDO],
    ['el sandbox', 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=ficticio-1'],
    ['con espacios alrededor (se recortan)', `  ${INIT_POINT_PEDIDO}  `],
  ])('acepta %s de Mercado Pago México', async (_caso, initPoint) => {
    simularServidor({ [RUTA_PREFERENCIA_PEDIDO]: () => respuesta(preferenciaPedidoCruda(initPoint), 201) });
    await expect(pagar()).resolves.toBe(initPoint.trim());
  });

  it.each<[string, unknown]>([
    ['http', 'http://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=ficticio-1'],
    ['otro país', 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=ficticio-1'],
    ['sin www', 'https://mercadopago.com.mx/checkout/v1/redirect?pref_id=ficticio-1'],
    ['sin diagonal después del host', 'https://www.mercadopago.com.mx'],
    ['un subdominio de otro sitio', 'https://www.mercadopago.com.mx.otro-sitio.test/checkout'],
    ['un truco con @', 'https://www.mercadopago.com.mx@otro-sitio.test/checkout'],
    ['otro host con Mercado Pago en la ruta', 'https://otro-sitio.test/https://www.mercadopago.com.mx/'],
    ['vacío', ''],
    ['null', null],
    ['un número', 12],
  ])('rechaza un initPoint %s sin abrirlo', async (_caso, initPoint) => {
    simularServidor({ [RUTA_PREFERENCIA_PEDIDO]: () => respuesta(preferenciaPedidoCruda(initPoint), 201) });
    const error = await errorDe(pagar());
    expect(error).toEqual(new Error('Respuesta de preferencia sin initPoint.'));
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('rechaza una respuesta que no es objeto', async () => {
    simularServidor({ [RUTA_PREFERENCIA_PEDIDO]: () => respuesta(INIT_POINT_PEDIDO, 201) });
    await expect(pagar()).rejects.toThrow('Respuesta de preferencia sin initPoint.');
  });

  it('el regreso de Mercado Pago a la app usa REDIRECCION_PEDIDO', () => {
    expect(REDIRECCION_PEDIDO).toBe('appmirufranco://pedido');
    expect(deepLinkPedido().startsWith(`${REDIRECCION_PEDIDO}/`)).toBe(true);
  });
});

describe('obtenerEstadoPagoPedido (GET /api/pagos-en-linea/mercadopago/estado/:pedidoId)', () => {
  it.each(ESTADOS_PAGO_PEDIDO.map((estado) => [estado]))('"%s" llega tal cual con el estado del pedido', async (estado) => {
    await sembrarSesion(CLIENTA_CITAS);
    const pedidoEstado = `estado-de-${estado}`;
    const llamadas = simularServidor({ [rutaEstadoPagoPedido()]: () => respuesta({ estado, pedidoEstado }) });
    await expect(obtenerEstadoPagoPedido(String(ID_PEDIDO))).resolves.toEqual({ estado, pedidoEstado });
    expect(llamadaConSesion(llamadas, rutaEstadoPagoPedido()).ruta).toBe(
      `/api/pagos-en-linea/mercadopago/estado/${ID_PEDIDO}`,
    );
  });

  it.each<[string, unknown]>([
    ['un estado desconocido', { estado: 'reembolsado', pedidoEstado: 'cancelado' }],
    ['sin estado', { pedidoEstado: 'cancelado' }],
    ['un cuerpo null', null],
  ])('%s cuenta como sin_pago', async (_caso, cuerpo) => {
    simularServidor({ [rutaEstadoPagoPedido()]: () => respuesta(cuerpo) });
    const resultado = await obtenerEstadoPagoPedido(ID_PEDIDO);
    expect(resultado.estado).toBe('sin_pago');
    expect(resultado.pedidoEstado).toBe(cuerpo ? 'cancelado' : '');
  });

  it('las rutas de ejemplo dan aprobado al pagado, cancelado al cancelado y sin_pago al apartado', async () => {
    simularServidor({});
    const estados = await Promise.all([703, 707, 702].map((id) => obtenerEstadoPagoPedido(id)));
    expect(estados.map((e) => e.estado)).toEqual(['aprobado', 'cancelado', 'sin_pago']);
  });
});

// ── Errores a través de apiClient ────────────────────────────────────────────────────────────

describe.each<[string, string, () => Promise<unknown>]>([
  ['crearPedido', RUTA_CREAR_PEDIDO, crear],
  ['listarMisPedidos', RUTA_MIS_PEDIDOS, () => listarMisPedidos()],
  ['obtenerPedido', rutaPedido(), () => obtenerPedido(ID_PEDIDO)],
  ['cancelarPedido', rutaCancelarPedido(), cancelar],
  ['crearPreferenciaPedido', RUTA_PREFERENCIA_PEDIDO, pagar],
  ['obtenerEstadoPagoPedido', rutaEstadoPagoPedido(), () => obtenerEstadoPagoPedido(ID_PEDIDO)],
])('%s: errores a través de crearErrorApi', (_nombre, ruta, llamar) => {
  it('sin red llega como el ErrorDeRed de apiClient', async () => {
    simularSinRed();
    const error = await errorDe(llamar());
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).toEqual(crearErrorApi({ tipo: 'red' }));
  });

  it.each<[string, CuerpoError]>([
    ['400', cuerpoError(400, TEXTO_TECNICO)],
    ['404', ERRORES_PEDIDOS.pedidoNoEncontrado],
    ['409', ERRORES_PEDIDOS.pedidoCambio],
    ['500', ERRORES.interno],
    ['503', ERRORES_PAGO_PEDIDO.noDisponible],
  ])('un %s llega como ApiError con su status y mensaje', async (_caso, cuerpo) => {
    const error = await errorAl(ruta, conError(cuerpo), llamar);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toEqual(apiErrorDe(cuerpo));
    expect(error).toMatchObject({ status: cuerpo.statusCode });
  });

  it('un 401 con la renovación rechazada cierra la sesión y llega como sesión terminada', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    simularServidor({ [ruta]: conError(ERRORES.noAutorizado), [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida) });
    const error = await errorDe(llamar());
    expect(error).toEqual(crearErrorApi({ tipo: 'sesionTerminada', code: 'SESION_VENCIDA' }));
    expect(error).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
    expect(sesionGuardada()).toBeNull();
  });
});

// ── Mensajes para la clienta ─────────────────────────────────────────────────────────────────

describe('mensajeCrearPedido con errores reales de apiClient', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, TEXTOS.sinConexion],
    ['401 de sesión terminada', conError(ERRORES.noAutorizado), TEXTOS.sesionTerminada],
    ['400 sin piezas suficientes', conError(ERRORES_PEDIDOS.stockInsuficiente), TEXTOS.crearSinPiezas],
    ['400 "Stock insuficiente" a secas', conError(cuerpoError(400, 'Stock insuficiente')), TEXTOS.crearSinPiezas],
    ['404 de presentación que ya no existe', conError(ERRORES_PEDIDOS.presentacionNoEncontrada), TEXTOS.crearSinProducto],
    ['403 que menciona stock (no es 400)', conError(cuerpoError(403, 'Stock insuficiente')), TEXTOS.crearGenerico],
    ['400 técnico', conError(cuerpoError(400, TEXTO_TECNICO)), TEXTOS.crearGenerico],
    ['409', conError(ERRORES_PEDIDOS.pedidoCambio), TEXTOS.crearGenerico],
    ['500', conError(ERRORES.interno), TEXTOS.crearGenerico],
  ])('%s', async (_caso, manejador, esperado) => {
    expect(mensajeCrearPedido(await errorAl(RUTA_CREAR_PEDIDO, manejador, crear))).toBe(esperado);
  });
});

describe('mensajePreferenciaPedido con errores reales de apiClient', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, TEXTOS.sinConexion],
    ['401 de sesión terminada', conError(ERRORES.noAutorizado), TEXTOS.sesionTerminada],
    ['404 de pedido ajeno', conError(ERRORES_PAGO_PEDIDO.pedidoNoEncontrado), TEXTOS.pedidoNoEncontrado],
    ['403 sin permiso', conError(ERRORES_PAGO_PEDIDO.sinPermiso), TEXTOS.pagoGenerico],
    ['400 de apartado', conError(ERRORES_PAGO_PEDIDO.enSalon), TEXTOS.enSalon],
    ['409 ya no pendiente', conError(ERRORES_PAGO_PEDIDO.noPendiente), TEXTOS.noPendiente],
    ['409 vencido', conError(ERRORES_PAGO_PEDIDO.vencido), TEXTOS.vencido],
    ['409 de total que no cuadra', conError(ERRORES_PAGO_PEDIDO.total), TEXTOS.total],
    ['503 sin Mercado Pago', conError(ERRORES_PAGO_PEDIDO.noDisponible), TEXTOS.noDisponible],
    ['409 de otro conflicto', conError(cuerpoError(409, TEXTO_TECNICO)), TEXTOS.pagoGenerico],
    ['500', conError(ERRORES.interno), TEXTOS.pagoGenerico],
  ])('%s', async (_caso, manejador, esperado) => {
    expect(mensajePreferenciaPedido(await errorAl(RUTA_PREFERENCIA_PEDIDO, manejador, pagar))).toBe(esperado);
  });
});

describe('motivoConflictoPedido', () => {
  it.each<[string, unknown, MotivoConflictoPedido | null]>([
    ['409 ya no pendiente', apiErrorDe(ERRORES_PAGO_PEDIDO.noPendiente), 'noPendiente'],
    ['409 vencido', apiErrorDe(ERRORES_PAGO_PEDIDO.vencido), 'vencido'],
    ['409 de total', apiErrorDe(ERRORES_PAGO_PEDIDO.total), 'total'],
    ['400 de apartado', apiErrorDe(ERRORES_PAGO_PEDIDO.enSalon), 'enSalon'],
    ['503 con cualquier texto', new ApiError(503, TEXTO_TECNICO), 'noDisponible'],
    ['otro 409', new ApiError(409, TEXTO_TECNICO), null],
    ['otro 400', new ApiError(400, TEXTO_TECNICO), null],
    ['el texto de apartado como 409', new ApiError(409, ERRORES_PAGO_PEDIDO.enSalon.message as string), null],
    ['el texto de vencido como 400', new ApiError(400, ERRORES_PAGO_PEDIDO.vencido.message as string), null],
    ['500', apiErrorDe(ERRORES.interno), null],
    ['un Error común con el texto', new Error(ERRORES_PAGO_PEDIDO.vencido.message as string), null],
    ['sin red', new ErrorDeRed(), null],
    ['null', null, null],
  ])('%s da %p', (_caso, error, esperado) => {
    expect(motivoConflictoPedido(error)).toBe(esperado);
  });
});

describe('mensajeCancelarPedido con errores reales de apiClient', () => {
  it.each<[string, Manejador, string]>([
    ['sin red', sinRedEnRuta, TEXTOS.sinConexion],
    ['401 de sesión terminada', conError(ERRORES.noAutorizado), TEXTOS.sesionTerminada],
    ['404 de pedido ajeno', conError(ERRORES_PEDIDOS.pedidoNoEncontrado), TEXTOS.pedidoNoEncontrado],
    ['403: ya se está preparando', conError(ERRORES_PEDIDOS.soloPersonalCambiaEstado), TEXTOS.cancelarPreparando],
    ['409: cambió mientras tanto', conError(ERRORES_PEDIDOS.pedidoCambio), TEXTOS.cancelarCambio],
    ['400 técnico', conError(cuerpoError(400, TEXTO_TECNICO)), TEXTOS.cancelarGenerico],
    ['500', conError(ERRORES.interno), TEXTOS.cancelarGenerico],
  ])('%s', async (_caso, manejador, esperado) => {
    expect(mensajeCancelarPedido(await errorAl(rutaCancelarPedido(), manejador, cancelar))).toBe(esperado);
  });
});

describe('mensajes de pedidos: nunca el texto técnico del servidor', () => {
  it.each<[string, CuerpoError]>([
    ['400 técnico', cuerpoError(400, TEXTO_TECNICO)],
    ['409 técnico', cuerpoError(409, TEXTO_TECNICO)],
    ['503 técnico', cuerpoError(503, TEXTO_TECNICO)],
    ['422 de validación', ERRORES.validacion],
    ['500', ERRORES.interno],
    ['401 sin sesión', ERRORES.noAutorizado],
    ['403 sin permiso', ERRORES_PAGO_PEDIDO.sinPermiso],
    ['403 solo el personal', ERRORES_PEDIDOS.soloPersonalCambiaEstado],
    ['409 pedido que cambió', ERRORES_PEDIDOS.pedidoCambio],
    ['409 devolución en proceso', ERRORES_PEDIDOS.devolucionEnProceso],
    ['409 total', ERRORES_PAGO_PEDIDO.total],
    ['400 de stock', ERRORES_PEDIDOS.stockInsuficiente],
    ['404 de presentación', ERRORES_PEDIDOS.presentacionNoEncontrada],
  ])('%s', async (_caso, cuerpo) => {
    const tecnicos = ([] as string[]).concat(cuerpo.message);
    const mensajes = [
      mensajeCrearPedido(await errorAl(RUTA_CREAR_PEDIDO, conError(cuerpo), crear)),
      mensajePreferenciaPedido(await errorAl(RUTA_PREFERENCIA_PEDIDO, conError(cuerpo), pagar)),
      mensajeCancelarPedido(await errorAl(rutaCancelarPedido(), conError(cuerpo), cancelar)),
    ];
    for (const mensaje of mensajes) {
      expect(tecnicos.some((tecnico) => mensaje.includes(tecnico))).toBe(false);
      expect(mensaje).not.toMatch(/statusCode|Prisma|should not|must be|Unauthorized|Internal|producto Shampoo|Presentación \d/);
    }
  });

  it.each<[string, unknown, string, string, string]>([
    ['ApiError con status 0 (sin red)', new ApiError(0, TEXTO_TECNICO), TEXTOS.sinConexion, TEXTOS.sinConexion, TEXTOS.sinConexion],
    ['ErrorDeRed', new ErrorDeRed(), TEXTOS.sinConexion, TEXTOS.sinConexion, TEXTOS.sinConexion],
    ['un Error común con texto técnico', new Error(TEXTO_TECNICO), TEXTOS.crearGenerico, TEXTOS.pagoGenerico, TEXTOS.cancelarGenerico],
    ['null', null, TEXTOS.crearGenerico, TEXTOS.pagoGenerico, TEXTOS.cancelarGenerico],
  ])('%s da su mensaje fijo', (_caso, error, alCrear, alPagar, alCancelar) => {
    expect(mensajeCrearPedido(error)).toBe(alCrear);
    expect(mensajePreferenciaPedido(error)).toBe(alPagar);
    expect(mensajeCancelarPedido(error)).toBe(alCancelar);
  });

  it.each<[string, unknown, boolean]>([
    ['ApiError 404', apiErrorDe(ERRORES_PEDIDOS.pedidoNoEncontrado), true],
    ['ApiError 403', apiErrorDe(ERRORES_PEDIDOS.soloPersonalCambiaEstado), false],
    ['Error común', new Error('Pedido no encontrado'), false],
    ['sin red', new ErrorDeRed(), false],
    ['null', null, false],
  ])('esPedidoNoEncontrado: %s da %p', (_caso, error, esperado) => {
    expect(esPedidoNoEncontrado(error)).toBe(esperado);
  });
});

// ── Reglas del pedido ────────────────────────────────────────────────────────────────────────

describe('método de pago y cancelación', () => {
  it.each<[string, boolean, boolean]>([
    [METODO_EN_LINEA, true, false],
    [METODO_EN_SALON, false, true],
    ['efectivo', false, false],
    ['MERCADO_PAGO', false, false],
    ['', false, false],
  ])('"%s": en línea %p, en el salón %p', (metodoPago, enLinea, enSalon) => {
    expect(esPagoEnLinea({ metodoPago })).toBe(enLinea);
    expect(esPagoEnSalon({ metodoPago })).toBe(enSalon);
  });

  it.each([...ESTADOS_PEDIDO, 'desconocido', ''].map((estado) => [estado]))('puedeCancelar "%s"', (estado) => {
    expect(puedeCancelar({ estado })).toBe(estado === 'pendiente_pago' || estado === 'pagado');
  });

  it.each<[string, string, string]>([
    [METODO_EN_LINEA, 'En línea con Mercado Pago', 'Pago en línea'],
    [METODO_EN_SALON, 'Pago al recoger en el salón', 'Pago en el salón'],
    ['efectivo', 'Efectivo', 'Efectivo'],
    ['transferencia', 'Transferencia', 'Transferencia'],
    ['tarjeta_terminal', 'Tarjeta en terminal', 'Tarjeta en terminal'],
    ['vales_de_regalo', 'vales de regalo', 'vales de regalo'],
    ['constructor', 'constructor', 'constructor'],
    ['', 'Sin especificar', 'Sin especificar'],
  ])('"%s": etiquetaMetodoPago %p y formaPagoCorta %p', (metodoPago, larga, corta) => {
    expect(etiquetaMetodoPago(metodoPago)).toBe(larga);
    expect(formaPagoCorta(metodoPago)).toBe(corta);
  });
});

describe('etiquetaEstadoPedido', () => {
  it.each<[string, string, EtiquetaEstado]>([
    ['borrador', METODO_EN_LINEA, { texto: 'Borrador', tono: 'aviso' }],
    ['pendiente_pago', METODO_EN_LINEA, { texto: 'Pendiente de pago', tono: 'aviso' }],
    ['pendiente_pago', METODO_EN_SALON, { texto: 'Apartado, pagas al recoger', tono: 'aviso' }],
    ['pagado', METODO_EN_LINEA, { texto: 'Pagado', tono: 'exito' }],
    ['preparando', METODO_EN_SALON, { texto: 'En preparación', tono: 'neutro' }],
    ['listo_recoger', METODO_EN_SALON, { texto: 'Listo para recoger', tono: 'exito' }],
    ['listo_recoger', METODO_EN_LINEA, { texto: 'Listo para recoger', tono: 'exito' }],
    ['enviado', 'efectivo', { texto: 'Enviado', tono: 'neutro' }],
    ['entregado', METODO_EN_LINEA, { texto: 'Entregado en el salón', tono: 'neutro' }],
    ['cancelado', METODO_EN_SALON, { texto: 'Cancelado', tono: 'neutro' }],
    ['en_revision', METODO_EN_LINEA, { texto: 'Sin estado', tono: 'neutro' }],
    ['', METODO_EN_LINEA, { texto: 'Sin estado', tono: 'neutro' }],
    ['constructor', METODO_EN_LINEA, { texto: 'Sin estado', tono: 'neutro' }],
  ])('"%s" con %s se muestra como %p', (estado, metodoPago, esperada) => {
    expect(etiquetaEstadoPedido({ estado, metodoPago })).toEqual(esperada);
  });
});

describe('plazo del pago en línea (reglas guardadas en el pedido)', () => {
  const enLinea = (cambios: Partial<Pedido> = {}) => pedidoNormalizado(cambios);

  // GP-07.5: el plazo sale de las reglas del pedido y, sin ellas, de la configuración vigente.
  it('sin reglas guardadas usa el plazo vigente de la configuración', () => {
    expect(vencimientoPagoMs({ creadoEn: AHORA_ISO, reglas: null })).toBe(AHORA.getTime() + VIGENCIA_MS);
  });

  it.each<[string, string, number | null]>([
    ['creadoEn más la vigencia', AHORA_ISO, VENCE_MS],
    ['sin fecha', '', null],
    ['con una fecha que no se puede leer', 'ayer', null],
  ])('vencimientoPagoMs: %s', (_caso, creadoEn, esperado) => {
    expect(vencimientoPagoMs({ creadoEn })).toBe(esperado);
  });

  it('limitePagoPedido arma fecha y hora locales del vencimiento', () => {
    const creadoEn = enHoraLocal(HOY, '18:30');
    const vence = new Date(creadoEn.getTime() + VIGENCIA_MS);
    const limite = limitePagoPedido(enLinea({ creadoEn: creadoEn.toISOString() }));
    expect(limite).toBe(`${fechaLegible(vence)}, ${horaLegible(vence)}`);
    expect(limite).toMatch(/^[a-zéá]+ \d{1,2} de [a-z]+, \d{1,2}:\d{2} [ap]\. m\.$/);
  });

  it.each<[string, Partial<Pedido>]>([
    ['un apartado', { metodoPago: METODO_EN_SALON }],
    ['un pedido ya pagado', { estado: 'pagado' }],
    ['una fecha que no se puede leer', { creadoEn: 'pronto' }],
  ])('limitePagoPedido da null para %s', (_caso, cambios) => {
    expect(limitePagoPedido(enLinea(cambios))).toBeNull();
  });

  it.each<[string, boolean, Partial<Pedido>, number]>([
    ['justo antes del plazo', true, {}, VENCE_MS - 1],
    ['justo al llegar el plazo', false, {}, VENCE_MS],
    ['después del plazo', false, {}, VENCE_MS + 1],
    ['un apartado dentro del plazo', false, { metodoPago: METODO_EN_SALON }, AHORA.getTime()],
    ['un pedido ya pagado', false, { estado: 'pagado' }, AHORA.getTime()],
    ['sin fecha válida', false, { creadoEn: '' }, AHORA.getTime()],
  ])('pidePagoEnLinea: %s da %p', (_caso, esperado, cambios, ahora) => {
    expect(pidePagoEnLinea(enLinea(cambios), ahora)).toBe(esperado);
  });

  it('pidePagoEnLinea sin ahora usa el reloj', () => {
    expect(pidePagoEnLinea(enLinea())).toBe(true);
    jest.setSystemTime(VENCE_MS);
    expect(pidePagoEnLinea(enLinea())).toBe(false);
  });
});

describe('textoQueSigue', () => {
  const APARTADO = 'Tu pedido está apartado. Lo preparamos y te avisamos cuando puedas pasar a pagarlo y recogerlo.';
  const FALTA_PAGAR = 'Falta completar tu pago en Mercado Pago. Tienes 24 horas desde que hiciste el pedido.';
  const PLAZO_TERMINADO =
    'El plazo de 24 horas para pagar terminó. Este pedido se cancelará y los productos vuelven a la tienda.';

  it.each<[string, Partial<Pedido>, number, string | null]>([
    ['apartado pendiente', { metodoPago: METODO_EN_SALON }, VENCE_MS + HORA_MS, APARTADO],
    ['en línea dentro del plazo', {}, VENCE_MS - 1, FALTA_PAGAR],
    ['en línea al llegar el plazo (aún sin cancelar)', {}, VENCE_MS, PLAZO_TERMINADO],
    ['en línea sin fecha válida', { creadoEn: '' }, VENCE_MS, FALTA_PAGAR],
    ['pendiente con otro método', { metodoPago: 'efectivo' }, AHORA.getTime(), 'Estamos confirmando tu pago. Después lo preparamos y te avisamos.'],
    ['pagado', { estado: 'pagado' }, AHORA.getTime(), 'Pago recibido. Lo preparamos y te avisamos cuando esté listo para recoger.'],
    ['en preparación', { estado: 'preparando' }, AHORA.getTime(), 'Estamos preparando tu pedido. Te avisamos en la app y por correo cuando esté listo.'],
    ['apartado listo', { estado: 'listo_recoger', metodoPago: METODO_EN_SALON }, AHORA.getTime(), 'Tu pedido está listo. Pasa por él al salón y págalo en el mostrador.'],
    ['pagado en línea y listo', { estado: 'listo_recoger' }, AHORA.getTime(), 'Tu pedido está listo. Pasa por él al salón.'],
    ['entregado', { estado: 'entregado' }, AHORA.getTime(), 'Recogiste tu pedido en el salón.'],
    ['cancelado', { estado: 'cancelado' }, AHORA.getTime(), null],
    ['enviado (pedido viejo)', { estado: 'enviado' }, AHORA.getTime(), null],
    ['borrador', { estado: 'borrador' }, AHORA.getTime(), null],
    ['un estado desconocido', { estado: 'en_revision' }, AHORA.getTime(), null],
  ])('%s', (_caso, cambios, ahora, esperado) => {
    expect(textoQueSigue(pedidoNormalizado(cambios), ahora)).toBe(esperado);
  });

  it('sin ahora usa el reloj', () => {
    expect(textoQueSigue(pedidoNormalizado())).toBe(FALTA_PAGAR);
    jest.setSystemTime(VENCE_MS);
    expect(textoQueSigue(pedidoNormalizado())).toBe(PLAZO_TERMINADO);
  });
});

describe('textoCancelarPedido y fechaPedido', () => {
  const BASE = 'Se cancela tu pedido y los productos vuelven a la tienda. Esta acción no se puede deshacer.';

  it.each<[string, Partial<Pedido>, string]>([
    ['en línea sin pagar', {}, BASE],
    ['apartado', { metodoPago: METODO_EN_SALON }, BASE],
    ['pagado en efectivo (web)', { estado: 'pagado', metodoPago: 'efectivo' }, BASE],
    [
      'pagado en línea: avisa el reembolso',
      { estado: 'pagado' },
      `${BASE} Te devolvemos el pago completo al mismo medio con que pagaste en Mercado Pago.`,
    ],
  ])('textoCancelarPedido: %s', (_caso, cambios, esperado) => {
    expect(textoCancelarPedido(pedidoNormalizado(cambios))).toBe(esperado);
  });

  it.each<[string, string, string]>([
    ['con fecha y hora locales', enHoraLocal(HOY, '10:05').toISOString(), 'lunes 19 de octubre, 10:05 a. m.'],
    ['de la tarde', enHoraLocal('2026-10-17', '18:30').toISOString(), 'sábado 17 de octubre, 6:30 p. m.'],
    ['sin fecha', '', ''],
    ['con una fecha que no se puede leer', 'ayer', ''],
  ])('fechaPedido %s', (_caso, creadoEn, esperado) => {
    expect(fechaPedido({ creadoEn })).toBe(esperado);
  });
});

describe('datos de ejemplo de la tienda', () => {
  it('MIS_PEDIDOS_CRUDOS trae todos los estados que ve la clienta, con su insignia conocida', () => {
    const estados = new Set(MIS_PEDIDOS_CRUDOS.map((p) => p.estado));
    expect([...estados].sort((a, b) => a.localeCompare(b))).toEqual(
      ['cancelado', 'entregado', 'listo_recoger', 'pagado', 'pendiente_pago', 'preparando'],
    );
    for (const pedido of MIS_PEDIDOS_CRUDOS) {
      expect(etiquetaEstadoPedido({ estado: pedido.estado, metodoPago: pedido.metodoPago ?? '' }).texto).not.toBe('Sin estado');
    }
  });
});
