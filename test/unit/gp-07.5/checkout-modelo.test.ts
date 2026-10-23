/// <reference types="jest" />

import {
  avisoMetodo,
  botonFinal,
  CASILLAS_COMPRA_INICIALES,
  datosRecoger,
  ErrorConsentimientoCompra,
  erroresCasillasCompra,
  esVersionCambiadaCompra,
  etiquetasCasillas,
  frasesHorario,
  informacionCompra,
  mensajeConsentimientoCompra,
  metodosTienda,
  metodoVigente,
  notaOpciones,
  opcionesPago,
  plazosMetodo,
  PROFECO,
  registrarConsentimientosCompra,
  textoRecogesEn,
  textosCheckout,
  textosSinMetodos,
} from '@/features/tienda/models/compraLegal';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  normalizarConfiguracion,
  RESPALDO_CONFIGURACION,
  type ConfiguracionPublica,
  type DiaHorario,
} from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { CLIENTA_CITAS } from '../../helpers/citasFicticias';
import { CONSENTIMIENTO_COMPRA, configuracionTienda, RUTAS_COMPRA_LEGAL } from '../../helpers/checkoutFicticio';
import { documentoGuardado, HASH_GUARDADO, rutaSinVersion, sinRed } from '../../helpers/documentosFicticios';
import { RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: reglas puras del checkout de la tienda (src/features/tienda/models/compraLegal.ts). Formas
 * de pago activas, avisos y plazos con las reglas de una configuración ficticia de cifras distintas
 * del respaldo (plazo en línea 12 horas, apartado 4 días, recordatorio el día 3, cancelación a los 10,
 * resguardo 20, cambios 5 y revocación 6 días hábiles), datos del salón e información de la compra,
 * casillas y el registro de los consentimientos con el servidor simulado (http://api.test).
 */

const config = (cambios: Parameters<typeof configuracionTienda>[0] = {}): ConfiguracionPublica =>
  normalizarConfiguracion(configuracionTienda(cambios));

/** Mercado Pago para la tienda y los métodos del salón indicados. */
const conPagos = (mercadoPagoTienda: boolean, metodosSalon: string[]) => config({ pagos: { mercadoPagoTienda, metodosSalon } });

const AMBAS = conPagos(true, ['efectivo', 'transferencia']);
const TOTAL = 114_250;

describe('Formas de pago activas', () => {
  it.each<[string, ConfiguracionPublica, string[]]>([
    ['las dos', AMBAS, ['mercado_pago', 'pago_en_salon']],
    ['solo en línea (sin métodos del salón)', conPagos(true, []), ['mercado_pago']],
    ['solo al recoger (Mercado Pago apagado para la tienda)', conPagos(false, ['efectivo']), ['pago_en_salon']],
    ['ninguna', conPagos(false, []), []],
  ])('%s', (_caso, configuracion, esperados) => {
    expect(metodosTienda(configuracion)).toEqual(esperados);
  });

  it.each<[string, 'mercado_pago' | 'pago_en_salon', ('mercado_pago' | 'pago_en_salon')[], string | null]>([
    ['la elegida sigue activa', 'mercado_pago', ['mercado_pago', 'pago_en_salon'], 'mercado_pago'],
    ['la elegida se apagó: pasa a la otra', 'pago_en_salon', ['mercado_pago'], 'mercado_pago'],
    ['sin ninguna activa', 'pago_en_salon', [], null],
  ])('metodoVigente: %s', (_caso, elegido, metodos, esperado) => {
    expect(metodoVigente(elegido, metodos)).toBe(esperado);
  });

  it('títulos y explicaciones del catálogo; uno del servidor gana al respaldo', () => {
    const conTexto = config({ textos: { 'checkout.opcionLineaTitulo': 'Pago ficticio en línea' } });
    expect(opcionesPago(['mercado_pago', 'pago_en_salon'], conTexto)).toEqual([
      { metodo: 'mercado_pago', titulo: 'Pago ficticio en línea', descripcion: 'Con tarjeta en la página segura de Mercado Pago.' },
      {
        metodo: 'pago_en_salon',
        titulo: 'Pagar al recoger en el salón',
        descripcion: 'Te apartamos el pedido y lo pagas en el mostrador cuando pases por él.',
      },
    ]);
  });

  it('la nota dice "en los dos casos" solo con dos formas de pago', () => {
    expect(notaOpciones(['mercado_pago', 'pago_en_salon'], AMBAS)).toBe('En los dos casos recoges tu pedido en el salón.');
    expect(notaOpciones(['pago_en_salon'], AMBAS)).toBe('Recoges tu pedido en el salón.');
  });

  it('sin formas de pago pide llamar al salón con el teléfono de la configuración, sin llaves si no hay', () => {
    expect(textosSinMetodos(AMBAS)).toEqual({
      titulo: 'Por ahora no podemos recibir pedidos en la app',
      texto: 'Las formas de pago de la tienda están en pausa. Llámanos al +52 700 000 0000 y te ayudamos con tu compra.',
    });
    expect(textosSinMetodos(config({ salon: { telefono: '' } })).texto).not.toMatch(/[{}]/);
  });
});

describe('Avisos, plazos y botón con las reglas', () => {
  it('en línea: total y plazo de la configuración (12 horas), con el texto del catálogo', () => {
    expect(avisoMetodo('mercado_pago', TOTAL, AMBAS)).toBe(
      'Al confirmar te llevamos a Mercado Pago para pagar $1,142.50. Tu tarjeta la escribes allá: este sitio no la ve ni la guarda. Tienes 12 horas para completar el pago.',
    );
  });

  it.each<[string, string[], string]>([
    ['con los métodos activos entre paréntesis', ['efectivo', 'transferencia'], ' (efectivo o transferencia)'],
    ['con un solo método', ['tarjeta'], ' (tarjeta)'],
  ])('al recoger: %s', (_caso, metodosSalon, parentesis) => {
    expect(avisoMetodo('pago_en_salon', TOTAL, conPagos(true, metodosSalon))).toBe(
      `Tu pedido queda apartado. Pagas $1,142.50 en el mostrador cuando pases por él${parentesis}.`,
    );
  });

  it('al recoger sin métodos del salón: sin paréntesis vacíos', () => {
    expect(avisoMetodo('pago_en_salon', TOTAL, conPagos(true, []))).toBe(
      'Tu pedido queda apartado. Pagas $1,142.50 en el mostrador cuando pases por él.',
    );
  });

  it('plazos en línea: pago y resguardo; al recoger: apartado, recordatorio y cancelación', () => {
    expect(plazosMetodo('mercado_pago', AMBAS)).toEqual([
      'Si el pago no se completa en 12 horas, el pedido se cancela.',
      'Ya pagado, te guardamos tu pedido en el salón 20 días para que pases por él.',
    ]);
    expect(plazosMetodo('pago_en_salon', AMBAS)).toEqual([
      'Preparamos tu apartado en un máximo de 4 días; si no lo logramos, se cancela y te avisamos.',
      'Cuando esté listo, el día 3 te recordamos pasar por él.',
      'Si no lo recoges en 10 días desde que te avisamos que está listo, el apartado se cancela.',
    ]);
  });

  it('el botón final es el del catálogo para cada forma de pago', () => {
    expect([botonFinal('mercado_pago', AMBAS), botonFinal('pago_en_salon', AMBAS)]).toEqual([
      'Ir a pagar con Mercado Pago',
      'Apartar mi pedido',
    ]);
  });

  it('textos de los pasos del catálogo', () => {
    expect(textosCheckout(AMBAS)).toEqual({
      recogerTitulo: 'Recoges tu pedido en el salón',
      recogerTexto: 'Lo preparamos y te lo apartamos en el mostrador.',
      leyendaPrecios: 'Precios en pesos mexicanos con IVA incluido.',
      plazosTitulo: 'Plazos de tu pedido',
      casillasTitulo: 'Antes de confirmar',
    });
  });
});

describe('Recoger en el salón', () => {
  const dia = (d: DiaHorario['dia'], abre = '', cierra = ''): DiaHorario => ({ dia: d, cerrado: !abre, abre, cierra });

  it('el horario junta los días seguidos iguales (con el de la configuración ficticia)', () => {
    expect(frasesHorario(AMBAS.horario.dias)).toEqual([
      'Lunes cerrado.',
      'Martes a jueves de 10:00 a 18:00 h.',
      'Viernes de 10:00 a 20:00 h.',
      'Sábados de 9:00 a 15:00 h.',
      'Domingos cerrado.',
    ]);
    expect(frasesHorario([dia('viernes', '09:30', '19:30'), dia('sabado'), dia('domingo')])).toEqual([
      'Viernes de 9:30 a 19:30 h.',
      'Sábados y domingos cerrado.',
    ]);
    expect(frasesHorario(RESPALDO_CONFIGURACION.horario.dias)).toEqual([
      'Lunes a viernes de 9:30 a 19:30 h.',
      'Sábados de 9:30 a 19:00 h.',
      'Domingos cerrado.',
    ]);
  });

  it('nombre, domicilio, teléfono, mapa y aviso salen de la configuración', () => {
    const datos = datosRecoger(AMBAS);
    expect(datos).toEqual({
      nombre: 'Salón Ficticio de Prueba',
      domicilio: 'Calle Inventada 123, Centro, Ciudad Ficticia, Estado',
      horario: frasesHorario(AMBAS.horario.dias),
      telefono: '+52 700 000 0000',
      enlaceTelefono: 'tel:+527000000000',
      llamanos: '¿Dudas para llegar? Llámanos al +52 700 000 0000',
      enlaceMapa: 'https://maps.app.goo.gl/ficticio',
      verMapa: 'Ver cómo llegar en el mapa',
      aviso: 'Listo en un día hábil. Te avisamos en la app y por correo cuando puedas pasar por él.',
    });
    expect(JSON.stringify(datos)).not.toContain('Huejutla');
    expect(textoRecogesEn(AMBAS)).toBe('Salón Ficticio de Prueba, Calle Inventada 123, Centro, Ciudad Ficticia, Estado');
  });

  it('sin tiempo de preparación ni teléfono: solo el aviso y sin enlace para llamar', () => {
    const datos = datosRecoger(config({ tienda: { tiempoPreparacionTexto: '' }, salon: { telefono: '' } }));
    expect(datos.aviso).toBe('Te avisamos en la app y por correo cuando puedas pasar por él.');
    expect(datos.enlaceTelefono).toBeNull();
  });
});

describe('Información de la compra', () => {
  it('quién vende, precios, entrega, cambios, revocación y quejas con las reglas, sin responsable ni correo de privacidad', () => {
    const info = informacionCompra(AMBAS);
    expect(info.vende).toEqual({
      titulo: 'Quién te vende',
      nombre: 'Salón Ficticio de Prueba',
      domicilio: 'Calle Inventada 123, Centro, Ciudad Ficticia, Estado',
      contactos: [
        { texto: 'Llamar al +52 700 000 0000', enlace: 'tel:+527000000000' },
        { texto: 'Escribir a contacto@salon.test', enlace: 'mailto:contacto@salon.test' },
      ],
    });
    expect(info.precios.texto).toMatch(/^Precios en pesos mexicanos con IVA incluido\. Si el precio de algún producto cambió/);
    expect(info.entrega.horario).toEqual(frasesHorario(AMBAS.horario.dias));
    expect(info.cambios).toEqual({
      titulo: 'Cambios y revocación',
      cambios: 'Aceptamos cambios de producto dentro de los 5 días naturales siguientes a que lo recojas.',
      revocacion:
        'Puedes revocar tu compra sin dar razones dentro de los 6 días hábiles siguientes a que recojas tu pedido en el salón (o a tu pago, si todavía no lo recoges), como marca el artículo 56 de la Ley Federal de Protección al Consumidor.',
    });
    expect(info.quejas.texto).toMatch(/Procuraduría Federal del Consumidor \(Profeco\):$/);
    expect(JSON.stringify(info)).not.toMatch(/Responsable|privacidad@/);
  });

  it('sin días de cambio lo dice, y sin teléfono ni correo válidos no hay enlaces', () => {
    const info = informacionCompra(config({ tienda: { diasCambioProducto: 0 }, salon: { telefono: '123', correoContacto: 'sin arroba' } }));
    expect(info.cambios.cambios).toBe('Por ahora no aceptamos cambios de producto.');
    expect(info.vende.contactos).toEqual([]);
  });

  it('Profeco: teléfonos y sitio de la autoridad, como enlaces', () => {
    expect(PROFECO).toEqual({
      telefonoCdmx: { visible: '55 5568 8722', enlace: 'tel:+525555688722', zona: '(CDMX y zona metropolitana)' },
      telefonoPais: { visible: '800 468 8722', enlace: 'tel:+528004688722', zona: '(resto del país)' },
      sitio: { visible: 'www.gob.mx/profeco', url: 'https://www.gob.mx/profeco' },
      nombreTelefono: 'Teléfono del Consumidor',
    });
    expect(Object.isFrozen(PROFECO)).toBe(true);
  });
});

describe('Casillas', () => {
  it('etiquetas partidas alrededor del nombre del documento, con los días de revocación de las reglas', () => {
    expect(etiquetasCasillas(AMBAS)).toEqual([
      {
        id: 'terminosVenta',
        slug: 'terminos',
        completa: 'Acepto los Términos de venta',
        antes: 'Acepto los ',
        enlace: 'Términos de venta',
        despues: '',
      },
      {
        id: 'reembolsos',
        slug: 'reembolsos',
        completa:
          'Leí la Política de reembolsos, cambios y cancelaciones, incluido mi derecho a revocar la compra en 6 días hábiles',
        antes: 'Leí la ',
        enlace: 'Política de reembolsos, cambios y cancelaciones',
        despues: ', incluido mi derecho a revocar la compra en 6 días hábiles',
      },
    ]);
  });

  it('si el texto del servidor no trae el nombre del documento, el enlace va al final', () => {
    const [terminos] = etiquetasCasillas(config({ textos: { 'tienda.checkout.casillaTerminos': 'Estoy de acuerdo con las condiciones' } }));
    expect(terminos).toMatchObject({
      antes: 'Estoy de acuerdo con las condiciones ',
      enlace: 'Términos de venta',
      despues: '',
    });
  });

  it('empiezan sin marcar y cada una sin marcar tiene su mensaje', () => {
    expect(CASILLAS_COMPRA_INICIALES).toEqual({ terminosVenta: false, reembolsos: false });
    expect(erroresCasillasCompra(CASILLAS_COMPRA_INICIALES, AMBAS)).toEqual({
      terminosVenta: 'Para confirmar tu pedido acepta los Términos de venta.',
      reembolsos: 'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
    });
    expect(erroresCasillasCompra({ terminosVenta: true, reembolsos: false }, AMBAS)).toEqual({
      reembolsos: 'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
    });
    expect(erroresCasillasCompra({ terminosVenta: true, reembolsos: true }, AMBAS)).toEqual({});
  });
});

describe('registrarConsentimientosCompra', () => {
  const simular = servidorConRutas({});
  const SIN_VISTOS = { terminosVenta: null, reembolsos: null };
  const rutasDe = (llamadas: Llamada[]) => llamadas.map((l) => `${l.metodo} ${l.ruta}`);

  beforeEach(async () => {
    reiniciarDocumentosLegales();
    limpiarArchivos();
    await sembrarSesion(CLIENTA_CITAS);
  });

  it('sin versión vista pide las vigentes y manda las dos aceptaciones en una sola petición', async () => {
    const llamadas = simular(RUTAS_COMPRA_LEGAL);
    await registrarConsentimientosCompra(SIN_VISTOS);
    expect(rutasDe(llamadas)).toEqual([
      'GET /api/documentos-legales/terminos/vigente',
      'GET /api/documentos-legales/reembolsos/vigente',
      RUTA_CONSENTIMIENTOS,
    ]);
    expect(llamadas[2].cuerpo).toEqual(CONSENTIMIENTO_COMPRA);
  });

  it('con las versiones que la clienta tuvo a la vista, manda esas sin pedir otras', async () => {
    const llamadas = simular(RUTAS_COMPRA_LEGAL);
    await registrarConsentimientosCompra({ terminosVenta: documentoGuardado('terminos'), reembolsos: documentoGuardado('reembolsos') });
    expect(rutasDe(llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
    expect(llamadas[0].cuerpo).toMatchObject({
      items: [
        { tipo: 'terminos_venta', documentoSlug: 'terminos', version: '2.2', hash: HASH_GUARDADO },
        { tipo: 'reembolsos', documentoSlug: 'reembolsos', version: '2.2', hash: HASH_GUARDADO },
      ],
    });
  });

  it.each<[string, () => Llamada[]]>([
    ['sin versión publicada (404)', () => simular({ ...RUTAS_COMPRA_LEGAL, ...rutaSinVersion('reembolsos') })],
    [
      'sin red ni nada guardado',
      () => {
        sinRed();
        return [];
      },
    ],
  ])('%s: falla en "version" y no registra nada', async (_caso, preparar) => {
    const llamadas = preparar();
    const error = await registrarConsentimientosCompra(SIN_VISTOS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorConsentimientoCompra);
    expect((error as ErrorConsentimientoCompra).paso).toBe('version');
    expect(rutasDe(llamadas)).not.toContain(RUTA_CONSENTIMIENTOS);
  });

  it('un 400 al registrar es "registro" con la versión cambiada', async () => {
    simular({ ...RUTAS_COMPRA_LEGAL, [RUTA_CONSENTIMIENTOS]: () => respuesta({ statusCode: 400, message: 'Versión ficticia no publicada' }, 400) });
    const error = await registrarConsentimientosCompra(SIN_VISTOS).catch((e: unknown) => e);
    expect(error).toMatchObject({ paso: 'registro' });
    expect(esVersionCambiadaCompra(error)).toBe(true);
    expect(esVersionCambiadaCompra(new ErrorConsentimientoCompra('version', new ApiError(400, 'ficticio')))).toBe(false);
  });
});

describe('mensajeConsentimientoCompra', () => {
  const NO_GUARDO =
    'No pudimos guardar tu aceptación de los Términos de venta y la Política de reembolsos, así que tu pedido no se creó.';

  it.each<[string, ErrorConsentimientoCompra, string]>([
    ['sin red', new ErrorConsentimientoCompra('registro', new ErrorDeRed()), `${NO_GUARDO} Revisa tu conexión a internet e intenta de nuevo.`],
    ['status 0', new ErrorConsentimientoCompra('registro', new ApiError(0, 'ficticio')), `${NO_GUARDO} Revisa tu conexión a internet e intenta de nuevo.`],
    ['sesión terminada (401)', new ErrorConsentimientoCompra('registro', new ApiError(401, 'ficticio')), `${NO_GUARDO} Tu sesión terminó: inicia sesión de nuevo y confirma tu compra.`],
    [
      'versión cambiada (400)',
      new ErrorConsentimientoCompra('registro', new ApiError(400, 'Hash ficticio distinto')),
      `${NO_GUARDO} Los documentos se actualizaron hace un momento: revísalos, vuelve a marcar las casillas y confirma de nuevo.`,
    ],
    ['otro error (500)', new ErrorConsentimientoCompra('registro', new ApiError(500, 'Error interno ficticio')), `${NO_GUARDO} Intenta de nuevo en un momento.`],
    [
      // GP-07.6: "Revisa tu conexión" solo si la versión no se pudo confirmar por falta de red.
      'sin versión vigente y sin red',
      new ErrorConsentimientoCompra('version', new ErrorDeRed()),
      'No pudimos confirmar la versión vigente de los Términos de venta y la Política de reembolsos, así que tu pedido no se creó. Revisa tu conexión a internet e intenta de nuevo.',
    ],
  ])('%s', (_caso, error, mensaje) => {
    expect(mensajeConsentimientoCompra(error, AMBAS)).toBe(mensaje);
    expect(mensaje).not.toMatch(/ficticio/i);
  });
});
