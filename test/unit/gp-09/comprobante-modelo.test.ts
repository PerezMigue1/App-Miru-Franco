/// <reference types="jest" />

import {
  ComprobanteInvalido,
  esComprobanteNoEncontrado,
  normalizarComprobante,
  obtenerComprobante,
} from '@/features/comprobantes/models/comprobanteModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  idDeCompra,
  listarComprobantesDeCompra,
  normalizarComprobantesDeCompra,
  rutaComprobante,
  tipoComprobante,
} from '@/shared/api/comprobantesDeCompra';

import {
  compraCruda,
  comprobanteCompleto,
  comprobanteMinimo,
  CONCEPTO_LARGO,
  LEYENDAS_COMPROBANTE,
  respuestaMio,
  respuestaMios,
  rutaMio,
  rutaMios,
  SALON_COMPROBANTE,
} from '../../helpers/comprobantesFicticios';
import { limite429 } from '../../helpers/limitesRed';
import { API, respuesta } from '../../helpers/servidorSimulado';
import { errorServidor, servidorVm, sinRed } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, Bloque A: modelos del comprobante de compra. La lista de comprobantes de una compra
 * (shared/api/comprobantesDeCompra, GET /api/comprobantes/mios) y el comprobante completo
 * (comprobantes/models/comprobanteModel, GET /api/comprobantes/mio): la forma se revisa sin confiar
 * en la respuesta (cifras como número, textos como texto) y los errores llegan tal cual para que la
 * pantalla decida por su status. fetch simulado en http://api.test con datos ficticios.
 */

describe('tipoComprobante e idDeCompra', () => {
  it.each([
    ['pedido', 'pedido'],
    [' Cita ', 'cita'],
    ['VENTA', 'venta'],
    ['factura', null],
    ['', null],
    [7, null],
    [undefined, null],
  ])('tipo %p → %p', (valor, esperado) => {
    expect(tipoComprobante(valor)).toBe(esperado);
  });

  it.each([
    ['7', 7],
    [' 007 ', 7],
    [12, 12],
    ['0', null],
    [0, null],
    [-3, null],
    ['-3', null],
    ['5.5', null],
    [5.5, null],
    ['12a', null],
    ['', null],
    ['99999999999999999999', null],
    [null, null],
  ])('id %p → %p', (valor, esperado) => {
    expect(idDeCompra(valor)).toBe(esperado);
  });

  it('rutaComprobante arma la pantalla con el tipo y el id', () => {
    expect(rutaComprobante('cita', 12)).toBe('/comprobante?tipo=cita&id=12');
  });
});

describe('GET /api/comprobantes/mios', () => {
  it('pide la compra con sesión y la query exacta', async () => {
    const llamadas = servidorVm({ [rutaMios('pedido', 7)]: () => respuestaMios([]) });
    await expect(listarComprobantesDeCompra('pedido', 7)).resolves.toEqual([]);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe(`${API}/api/comprobantes/mios?tipo=pedido&id=7`);
    expect(llamadas[0].metodo).toBe('GET');
  });

  it('uno: lo devuelve con sus datos', async () => {
    servidorVm({ [rutaMios('pedido', 7)]: () => respuestaMios([compraCruda('pedido', 7, 'Pedido #7')]) });
    await expect(listarComprobantesDeCompra('pedido', 7)).resolves.toEqual([
      { tipo: 'pedido', id: 7, etiqueta: 'Pedido #7', folio: 'P-000010', total: 450, fecha: '2026-10-19T16:30:00.000Z' },
    ]);
  });

  it('varios (anticipo y venta de una cita): los dos, en el orden del backend', async () => {
    servidorVm({
      [rutaMios('cita', 12)]: () =>
        respuestaMios([compraCruda('cita', 12, 'Anticipo de la cita #12'), compraCruda('venta', 45, 'Venta V-00045')]),
    });
    const lista = await listarComprobantesDeCompra('cita', 12);
    expect(lista.map(({ tipo, id, etiqueta }) => [tipo, id, etiqueta])).toEqual([
      ['cita', 12, 'Anticipo de la cita #12'],
      ['venta', 45, 'Venta V-00045'],
    ]);
  });

  it('descarta elementos basura y repetidos, y deja vacíos los datos opcionales que no sirven', () => {
    expect(
      normalizarComprobantesDeCompra({
        data: [
          null,
          'texto',
          compraCruda('factura' as never, 1, 'Factura'),
          compraCruda('pedido', 0, 'Pedido #0'),
          compraCruda('pedido', 7, '   '),
          compraCruda('pedido', 7, 'Pedido #7', { folio: 10, total: '450', fecha: 3 }),
          compraCruda('pedido', 7, 'Pedido #7 repetido'),
        ],
      }),
    ).toEqual([{ tipo: 'pedido', id: 7, etiqueta: 'Pedido #7', folio: '', total: null, fecha: null }]);
  });

  it.each([
    ['un arreglo suelto', [compraCruda('venta', 3, 'Venta V-3')], 1],
    ['sin data', { success: true }, 0],
    ['data que no es lista', { success: true, data: {} }, 0],
    ['null', null, 0],
    ['texto', 'basura', 0],
  ])('respuesta con %s', (_caso, crudo, cuantos) => {
    expect(normalizarComprobantesDeCompra(crudo)).toHaveLength(cuantos);
  });

  it.each([
    ['sin red', sinRed, ErrorDeRed],
    ['404', () => errorServidor(404, 'No encontrado'), ApiError],
    ['429', () => limite429(20), ApiError],
    ['500', () => errorServidor(500), ApiError],
  ])('con %s rechaza con el error de apiClient', async (_caso, manejador, clase) => {
    servidorVm({ [rutaMios('pedido', 7)]: manejador });
    await expect(listarComprobantesDeCompra('pedido', 7)).rejects.toBeInstanceOf(clase);
  });
});

describe('normalizarComprobante', () => {
  it('un comprobante completo queda con todos sus datos', () => {
    expect(normalizarComprobante(comprobanteCompleto(), 'venta')).toEqual({
      folio: 'V-00045',
      tipo: 'venta',
      compra: 'Venta V-00045',
      fechaTexto: '19 de octubre de 2026, 10:30',
      salon: SALON_COMPROBANTE,
      clienta: 'Clienta Ficticia',
      atendio: 'Especialista Ficticia',
      lineas: [
        { descripcion: CONCEPTO_LARGO, cantidad: 1, precioUnitario: 1200, descuento: 200, importe: 1000 },
        { descripcion: 'Shampoo ficticio', cantidad: 2, precioUnitario: 149.5, descuento: 0, importe: 299 },
      ],
      subtotal: 1499,
      descuento: 200,
      anticipoAplicado: 300,
      total: 999,
      metodoPago: 'Tarjeta (terminal del salón)',
      referencia: 'REF-FICTICIA-1',
      leyendas: LEYENDAS_COMPROBANTE,
      enviadoPorCorreo: true,
    });
  });

  it('un comprobante mínimo: datos del salón, leyendas y opcionales vacíos', () => {
    const minimo = normalizarComprobante(
      comprobanteMinimo({ descuento: undefined, anticipoAplicado: null, leyendas: 'basura' }),
      'pedido',
    );
    expect(minimo).toMatchObject({
      salon: { nombre: 'Salón Ficticio', direccion: '', ciudad: '', codigoPostal: '', telefono: '', correoContacto: '' },
      atendio: null,
      referencia: null,
      descuento: 0,
      anticipoAplicado: 0,
      leyendas: { iva: '', cambios: '', noEsFactura: '', factura: '' },
      enviadoPorCorreo: false,
    });
  });

  it('un tipo desconocido toma el que se pidió; un envío que no es "enviado" no se anuncia', () => {
    const recibido = normalizarComprobante(comprobanteMinimo({ tipo: 'otro', envio: { estado: 'error' } }), 'cita');
    expect(recibido?.tipo).toBe('cita');
    expect(recibido?.enviadoPorCorreo).toBe(false);
  });

  it('una línea sin descuento cuenta como descuento 0', () => {
    const linea = { descripcion: 'Corte ficticio', cantidad: 1, precioUnitario: 300, importe: 300 };
    expect(normalizarComprobante(comprobanteMinimo({ lineas: [linea] }), 'pedido')?.lineas[0].descuento).toBe(0);
  });

  it.each([
    ['no es objeto', 'basura'],
    ['null', null],
    ['un arreglo', []],
  ])('data que %s no sirve', (_caso, crudo) => {
    expect(normalizarComprobante(crudo, 'pedido')).toBeNull();
  });

  it.each([
    ['sin folio', { folio: undefined }],
    ['folio vacío', { folio: '  ' }],
    ['folio como número', { folio: 45 }],
    ['sin compra', { compra: null }],
    ['sin fechaTexto', { fechaTexto: undefined }],
    ['sin clienta', { clienta: '' }],
    ['sin método de pago', { metodoPago: undefined }],
    ['total como texto', { total: '450' }],
    ['total NaN', { total: Number.NaN }],
    ['subtotal sin venir', { subtotal: undefined }],
    ['descuento como texto', { descuento: '0' }],
    ['anticipo como texto', { anticipoAplicado: '0' }],
    ['salón sin nombre', { salon: { direccion: 'Calle' } }],
    ['salón que no es objeto', { salon: 'Salón' }],
    ['teléfono del salón como número', { salon: { nombre: 'Salón', telefono: 7710000000 } }],
    ['líneas vacías', { lineas: [] }],
    ['líneas que no son lista', { lineas: {} }],
    ['una línea que no es objeto', { lineas: ['basura'] }],
    ['una línea sin descripción', { lineas: [{ cantidad: 1, precioUnitario: 1, importe: 1 }] }],
    ['una línea con cantidad 0', { lineas: [{ descripcion: 'X', cantidad: 0, precioUnitario: 1, importe: 1 }] }],
    ['una línea con precio como texto', { lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: '1', importe: 1 }] }],
    ['una línea sin importe', { lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 1 }] }],
    ['una línea con descuento como texto', { lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 1, descuento: 'no', importe: 1 }] }],
  ])('%s: el comprobante entero no sirve', (_caso, parcial) => {
    expect(normalizarComprobante(comprobanteMinimo(parcial), 'pedido')).toBeNull();
  });

  it('atendió y referencia que no son texto quedan en null', () => {
    const recibido = normalizarComprobante(comprobanteMinimo({ atendio: 3, referencia: { numero: 1 } }), 'pedido');
    expect(recibido?.atendio).toBeNull();
    expect(recibido?.referencia).toBeNull();
  });
});

describe('GET /api/comprobantes/mio', () => {
  it('pide la compra con la query exacta y devuelve el comprobante', async () => {
    const llamadas = servidorVm({ [rutaMio('pedido', 7)]: () => respuestaMio(comprobanteMinimo()) });
    await expect(obtenerComprobante('pedido', 7)).resolves.toMatchObject({ folio: 'P-000010', total: 450 });
    expect(llamadas.map((llamada) => llamada.url)).toEqual([`${API}/api/comprobantes/mio?tipo=pedido&id=7`]);
  });

  it.each([
    ['sin data', () => respuesta({ success: true })],
    ['datos basura', () => respuestaMio({ folio: 'P-1', lineas: 'muchas' })],
    ['un texto', () => respuesta('no es json')],
  ])('con %s rechaza con ComprobanteInvalido (nunca pinta un ticket a medias)', async (_caso, manejador) => {
    servidorVm({ [rutaMio('pedido', 7)]: manejador });
    const error = await obtenerComprobante('pedido', 7).catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ComprobanteInvalido);
    expect(esComprobanteNoEncontrado(error)).toBe(false);
  });

  it('404: no es de la clienta o no tiene pago aprobado', async () => {
    servidorVm({ [rutaMio('venta', 5)]: () => errorServidor(404, 'Comprobante no encontrado') });
    const error = await obtenerComprobante('venta', 5).catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ApiError);
    expect(esComprobanteNoEncontrado(error)).toBe(true);
  });

  it('sin red: ErrorDeRed, que no es "no encontrado"', async () => {
    servidorVm({ [rutaMio('pedido', 7)]: sinRed });
    const error = await obtenerComprobante('pedido', 7).catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(esComprobanteNoEncontrado(error)).toBe(false);
  });

  it('429: el ApiError trae los segundos de espera del servidor', async () => {
    servidorVm({ [rutaMio('pedido', 7)]: () => limite429(25) });
    const error = await obtenerComprobante('pedido', 7).catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfter).toBe(25);
    expect(esComprobanteNoEncontrado(error)).toBe(false);
  });

  it('5xx: el ApiError con su status', async () => {
    servidorVm({ [rutaMio('pedido', 7)]: () => errorServidor(503) });
    const error = await obtenerComprobante('pedido', 7).catch((causa: unknown) => causa);
    expect((error as ApiError).status).toBe(503);
    expect(esComprobanteNoEncontrado(error)).toBe(false);
  });
});
