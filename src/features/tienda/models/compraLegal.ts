import { listaMetodosSalon } from '@/features/citas/models/formaPagoModel';
import { domicilio, enlaceCorreo, enlaceMapa, enlaceTelefono, horaCorta, NOMBRE_DIA } from '@/features/salon/models/salonModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import type { ConfiguracionPublica, DiaHorario, DiaSemana } from '@/shared/api/configuracionPublica';
import { aceptacionDeDocumento, registrarConsentimientos, type ItemConsentimiento } from '@/shared/api/consentimientos';
import {
  obtenerDocumentoVigente,
  type DocumentoLegalVigente,
  type SlugDocumentoLegal,
} from '@/shared/api/documentosLegales';
import { tipoDeError } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';

import type { MetodoPago } from './pedidoModel';
import { formatoPrecio } from './productoModel';

/**
 * Reglas puras del checkout de la tienda (GP-07.5, como compraLegal.ts e infoComercio.ts de la web):
 * formas de pago activas, plazos y avisos con las reglas de la configuración pública, datos para
 * recoger en el salón, información de la compra (LFPC art. 76 BIS y 7 BIS), casillas de los Términos
 * de venta y la Política de reembolsos y su registro antes de crear el pedido. Sin React: la
 * configuración llega como parámetro para que las pantallas se vuelvan a pintar cuando cambia.
 */

// ── Formas de pago ───────────────────────────────────────────────────────────────────────────

/** Orden en que se muestran las formas de pago (el de la web). */
const ORDEN_METODOS: readonly MetodoPago[] = ['mercado_pago', 'pago_en_salon'];

/** Con las dos activas, se empieza con pagar al recoger (como la web). */
export const METODO_PREFERIDO: MetodoPago = 'pago_en_salon';

/**
 * Formas de pago activas para la tienda (Admin > Configuración del sitio > Reglas): en línea si
 * Mercado Pago está activo para la tienda y al recoger si el salón acepta algún método.
 */
export function metodosTienda(config: ConfiguracionPublica): MetodoPago[] {
  const { mercadoPagoTienda, metodosSalon } = config.reglas.pagos;
  return ORDEN_METODOS.filter((metodo) => (metodo === 'mercado_pago' ? mercadoPagoTienda : metodosSalon.length > 0));
}

/** La elegida si sigue activa; si se apagó, la otra; sin ninguna activa, null. */
export function metodoVigente(elegido: MetodoPago, metodos: readonly MetodoPago[]): MetodoPago | null {
  return metodos.includes(elegido) ? elegido : (metodos[0] ?? null);
}

export interface OpcionMetodo {
  metodo: MetodoPago;
  titulo: string;
  descripcion: string;
}

/** Título y explicación de cada forma de pago activa, del catálogo de textos. */
export function opcionesPago(metodos: readonly MetodoPago[], config: ConfiguracionPublica): OpcionMetodo[] {
  return metodos.map((metodo) =>
    metodo === 'mercado_pago'
      ? {
          metodo,
          titulo: obtenerTexto('checkout.opcionLineaTitulo', {}, config),
          descripcion: obtenerTexto('checkout.opcionLineaTexto', {}, config),
        }
      : {
          metodo,
          titulo: obtenerTexto('checkout.opcionSalonTitulo', {}, config),
          descripcion: obtenerTexto('checkout.opcionSalonTexto', {}, config),
        },
  );
}

/** "En los dos casos recoges tu pedido en el salón." con dos formas de pago; con una, "Recoges tu pedido en el salón.". */
export function notaOpciones(metodos: readonly MetodoPago[], config: ConfiguracionPublica): string {
  return obtenerTexto(metodos.length > 1 ? 'checkout.ambasRecoges' : 'checkout.soloRecoges', {}, config);
}

/** " (efectivo, tarjeta o transferencia)" para {metodosSalon} de checkout.avisoSalon, como la web; '' sin métodos. */
export function metodosEntreParentesis(config: ConfiguracionPublica): string {
  const metodos = config.reglas.pagos.metodosSalon;
  return metodos.length > 0 ? ` (${listaMetodosSalon(metodos)})` : '';
}

/** Aviso de la forma de pago elegida con el total estimado. */
export function avisoMetodo(metodo: MetodoPago, totalCentavos: number, config: ConfiguracionPublica): string {
  const total = formatoPrecio(totalCentavos);
  return metodo === 'mercado_pago'
    ? obtenerTexto('checkout.avisoLinea', { total }, config)
    : obtenerTexto('checkout.avisoSalon', { total, metodosSalon: metodosEntreParentesis(config) }, config);
}

/**
 * Plazos de la forma de pago: en línea, el plazo para pagar y el resguardo del pedido pagado; al
 * recoger, los días para preparar el apartado, el recordatorio y la cancelación si no se recoge.
 */
export function plazosMetodo(metodo: MetodoPago, config: ConfiguracionPublica): string[] {
  const claves =
    metodo === 'mercado_pago'
      ? ['tienda.checkout.plazoLinea', 'tienda.checkout.resguardo']
      : ['tienda.checkout.apartadoPreparar', 'tienda.checkout.apartadoRecordatorio', 'tienda.checkout.apartadoCancelar'];
  return claves.map((clave) => obtenerTexto(clave, {}, config));
}

/** Texto del botón final: ir a Mercado Pago o apartar. */
export function botonFinal(metodo: MetodoPago, config: ConfiguracionPublica): string {
  return obtenerTexto(metodo === 'mercado_pago' ? 'checkout.botonLinea' : 'checkout.botonSalon', {}, config);
}

/** Sin ninguna forma de pago activa: título y qué hacer (llamar al salón). */
export function textosSinMetodos(config: ConfiguracionPublica): { titulo: string; texto: string } {
  return {
    titulo: obtenerTexto('tienda.checkout.sinMetodosTitulo', {}, config),
    texto: obtenerTexto('tienda.checkout.sinMetodos', { telefono: config.salon.telefono || null }, config),
  };
}

// ── Recoger en el salón ──────────────────────────────────────────────────────────────────────

/** Sábado y domingo en plural ("Sábados de...", "Domingos cerrado."), como frasesHorario de la web. */
const PLURAL_DIA: Partial<Record<DiaSemana, string>> = { sabado: 'Sábados', domingo: 'Domingos' };

const nombreDia = (dia: DiaSemana) => PLURAL_DIA[dia] ?? NOMBRE_DIA[dia];

/**
 * "Lunes a viernes de 9:30 a 19:30 h.", "Sábados de 9:30 a 19:00 h.", "Domingos cerrado.": junta los
 * días seguidos con el mismo horario (frasesHorario de la web), con los nombres de features/salon.
 */
export function frasesHorario(dias: readonly DiaHorario[]): string[] {
  const grupos: DiaHorario[][] = [];
  for (const dia of dias) {
    const ultimo = grupos.at(-1);
    const igual =
      ultimo !== undefined &&
      ultimo[0].cerrado === dia.cerrado &&
      (dia.cerrado || (ultimo[0].abre === dia.abre && ultimo[0].cierra === dia.cierra));
    if (igual) {
      ultimo.push(dia);
    } else {
      grupos.push([dia]);
    }
  }
  return grupos.map((grupo) => {
    const primero = nombreDia(grupo[0].dia);
    const ultimo = nombreDia(grupo[grupo.length - 1].dia).toLowerCase();
    let nombres = primero;
    if (grupo.length === 2) {
      nombres = `${primero} y ${ultimo}`;
    } else if (grupo.length > 2) {
      nombres = `${primero} a ${ultimo}`;
    }
    return grupo[0].cerrado
      ? `${nombres} cerrado.`
      : `${nombres} de ${horaCorta(grupo[0].abre)} a ${horaCorta(grupo[0].cierra)} h.`;
  });
}

export interface DatosRecoger {
  nombre: string;
  /** Dirección y ciudad en una línea. */
  domicilio: string;
  horario: string[];
  telefono: string;
  /** "tel:+52..." o null sin un teléfono completo. */
  enlaceTelefono: string | null;
  /** "¿Dudas para llegar? Llámanos al ...". */
  llamanos: string;
  /** Enlace del mapa o null sin dirección. */
  enlaceMapa: string | null;
  verMapa: string;
  /** Tiempo de preparación y aviso de cuándo pasar. */
  aviso: string;
}

/** Dónde y cuándo se recoge el pedido, todo de la configuración pública. */
export function datosRecoger(config: ConfiguracionPublica): DatosRecoger {
  const { salon } = config;
  const preparacion = config.reglas.tienda.tiempoPreparacionTexto;
  return {
    nombre: salon.nombre,
    domicilio: domicilio(salon),
    horario: frasesHorario(config.horario.dias),
    telefono: salon.telefono,
    enlaceTelefono: enlaceTelefono(salon.telefono),
    llamanos: obtenerTexto('tienda.checkout.llamanos', { telefono: salon.telefono }, config),
    enlaceMapa: enlaceMapa(salon),
    verMapa: obtenerTexto('tienda.checkout.verMapa', {}, config),
    // Sin texto de preparación, solo el aviso (nunca una frase que empiece con punto).
    aviso: preparacion
      ? obtenerTexto('checkout.recogerAviso', {}, config)
      : obtenerTexto('tienda.checkout.avisoListo', {}, config),
  };
}

export interface TextosCheckout {
  recogerTitulo: string;
  recogerTexto: string;
  /** Leyenda junto al total: pesos mexicanos con IVA incluido. */
  leyendaPrecios: string;
  plazosTitulo: string;
  casillasTitulo: string;
}

/** Textos fijos de los pasos del checkout, del catálogo. */
export function textosCheckout(config: ConfiguracionPublica): TextosCheckout {
  const t = (clave: string) => obtenerTexto(clave, {}, config);
  return {
    recogerTitulo: t('checkout.recogerTitulo'),
    recogerTexto: t('checkout.recogerTexto'),
    leyendaPrecios: t('tienda.checkout.precios'),
    plazosTitulo: t('tienda.checkout.plazosTitulo'),
    casillasTitulo: t('tienda.checkout.casillasTitulo'),
  };
}

/** "Nombre, dirección, ciudad" para la línea "Recoges en" del resumen. */
export function textoRecogesEn(config: ConfiguracionPublica): string {
  return [config.salon.nombre, domicilio(config.salon)].filter(Boolean).join(', ');
}

// ── Información de la compra ─────────────────────────────────────────────────────────────────

/**
 * Datos de contacto de la Procuraduría Federal del Consumidor (los mismos de Profeco.tsx de la web).
 * Excepción justificada a "nada escrito a mano": son datos públicos de la autoridad, no del salón, y
 * no se administran desde los paneles.
 */
export const PROFECO = Object.freeze({
  telefonoCdmx: Object.freeze({ visible: '55 5568 8722', enlace: 'tel:+525555688722', zona: '(CDMX y zona metropolitana)' }),
  telefonoPais: Object.freeze({ visible: '800 468 8722', enlace: 'tel:+528004688722', zona: '(resto del país)' }),
  sitio: Object.freeze({ visible: 'www.gob.mx/profeco', url: 'https://www.gob.mx/profeco' }),
  /** "Teléfono del Consumidor". */
  nombreTelefono: 'Teléfono del Consumidor',
});

export interface ContactoVendedor {
  texto: string;
  enlace: string;
}

export interface InformacionCompra {
  titulo: string;
  vende: { titulo: string; nombre: string; domicilio: string; contactos: ContactoVendedor[] };
  precios: { titulo: string; texto: string };
  entrega: { titulo: string; texto: string; horario: string[] };
  cambios: { titulo: string; cambios: string; revocacion: string };
  quejas: { titulo: string; texto: string };
}

/**
 * Información de comercio electrónico antes de confirmar: quién vende (nombre, domicilio, teléfono y
 * correo de contacto), precios, entrega, cambios, revocación (art. 56 LFPC) y quejas. Sin responsable
 * ni correo de privacidad: la app no los guarda (minimización de datos).
 */
export function informacionCompra(config: ConfiguracionPublica): InformacionCompra {
  const { salon } = config;
  const telefono = enlaceTelefono(salon.telefono);
  const correo = enlaceCorreo(salon.correoContacto);
  const contactos: ContactoVendedor[] = [];
  if (telefono) {
    contactos.push({ texto: obtenerTexto('salon.contacto.telefono', { telefono: salon.telefono }, config), enlace: telefono });
  }
  if (correo) {
    contactos.push({ texto: obtenerTexto('salon.contacto.correo', { correo: salon.correoContacto.trim() }, config), enlace: correo });
  }
  const t = (clave: string) => obtenerTexto(clave, {}, config);
  return {
    titulo: t('tienda.checkout.infoTitulo'),
    vende: { titulo: t('tienda.checkout.vendeTitulo'), nombre: salon.nombre, domicilio: domicilio(salon), contactos },
    precios: { titulo: t('tienda.checkout.preciosTitulo'), texto: `${t('tienda.checkout.precios')} ${t('tienda.checkout.precioVigente')}` },
    entrega: { titulo: t('tienda.checkout.entregaTitulo'), texto: t('tienda.checkout.entrega'), horario: frasesHorario(config.horario.dias) },
    cambios: {
      titulo: t('tienda.checkout.cambiosTitulo'),
      cambios: config.reglas.tienda.diasCambioProducto > 0 ? t('tienda.checkout.cambios') : t('tienda.checkout.sinCambios'),
      revocacion: t('tienda.checkout.revocacion'),
    },
    quejas: { titulo: t('tienda.checkout.quejasTitulo'), texto: t('tienda.checkout.quejas') },
  };
}

// ── Casillas ─────────────────────────────────────────────────────────────────────────────────

export type IdCasillaCompra = 'terminosVenta' | 'reembolsos';
export type EstadoCasillasCompra = Readonly<Record<IdCasillaCompra, boolean>>;

/** Las dos empiezan sin marcar. */
export const CASILLAS_COMPRA_INICIALES: EstadoCasillasCompra = Object.freeze({ terminosVenta: false, reembolsos: false });

interface DefinicionCasilla {
  id: IdCasillaCompra;
  /** Documento que abre el enlace y que se registra al aceptar. */
  slug: SlugDocumentoLegal;
  /** Parte de la etiqueta que es el enlace. */
  enlace: string;
  clave: string;
  claveFalta: string;
}

export const CASILLAS_COMPRA: readonly DefinicionCasilla[] = Object.freeze([
  {
    id: 'terminosVenta',
    slug: 'terminos',
    enlace: 'Términos de venta',
    clave: 'tienda.checkout.casillaTerminos',
    claveFalta: 'tienda.checkout.faltaTerminos',
  },
  {
    id: 'reembolsos',
    slug: 'reembolsos',
    enlace: 'Política de reembolsos, cambios y cancelaciones',
    clave: 'tienda.checkout.casillaReembolsos',
    claveFalta: 'tienda.checkout.faltaReembolsos',
  },
]);

export interface EtiquetaCasillaCompra {
  id: IdCasillaCompra;
  slug: SlugDocumentoLegal;
  /** La etiqueta completa, para el lector de pantalla. */
  completa: string;
  antes: string;
  enlace: string;
  despues: string;
}

/**
 * La etiqueta de cada casilla partida alrededor del nombre del documento, para pintarlo como enlace.
 * Si el texto del servidor no trae el nombre, el enlace va al final con el nombre del documento.
 */
export function etiquetasCasillas(config: ConfiguracionPublica): EtiquetaCasillaCompra[] {
  return CASILLAS_COMPRA.map(({ id, slug, enlace, clave }) => {
    const completa = obtenerTexto(clave, {}, config);
    const indice = completa.indexOf(enlace);
    if (indice < 0) {
      return { id, slug, completa, antes: `${completa} `, enlace, despues: '' };
    }
    return { id, slug, completa, antes: completa.slice(0, indice), enlace, despues: completa.slice(indice + enlace.length) };
  });
}

/** Mensaje de cada casilla sin marcar; vacío si las dos están marcadas. */
export function erroresCasillasCompra(
  estado: EstadoCasillasCompra,
  config: ConfiguracionPublica,
): Partial<Record<IdCasillaCompra, string>> {
  const errores: Partial<Record<IdCasillaCompra, string>> = {};
  for (const casilla of CASILLAS_COMPRA) {
    if (!estado[casilla.id]) {
      errores[casilla.id] = obtenerTexto(casilla.claveFalta, {}, config);
    }
  }
  return errores;
}

/** Junto al botón final: faltan casillas por marcar (el detalle va junto a cada una). */
export function textoFaltanCasillas(config: ConfiguracionPublica): string {
  return obtenerTexto('tienda.checkout.faltanCasillas', {}, config);
}

/** La forma de pago que eligió la clienta se apagó y se cambió a la otra activa. */
export function textoMetodoCambiado(config: ConfiguracionPublica): string {
  return obtenerTexto('tienda.checkout.metodoCambio', {}, config);
}

/** La versión del documento cambió con la casilla marcada: se desmarcó y hay que revisarlo. */
export function textoDocumentoActualizado(config: ConfiguracionPublica): string {
  return obtenerTexto('tienda.checkout.documentoActualizado', {}, config);
}

// ── Registro de los consentimientos ──────────────────────────────────────────────────────────

/** Formulario y ruta que se guardan con los consentimientos de la compra. */
export const FORMULARIO_CHECKOUT = 'checkout';
export const RUTA_ORIGEN_CHECKOUT = 'app/checkout';

/** Qué falló: no hubo versión vigente de un documento o no se guardó el registro. */
export type PasoConsentimientoCompra = 'version' | 'registro';

/** Falla del consentimiento de la compra: el pedido no se creó. `causa` es el error de la red o del servidor. */
export class ErrorConsentimientoCompra extends Error {
  readonly paso: PasoConsentimientoCompra;
  readonly causa: unknown;

  constructor(paso: PasoConsentimientoCompra, causa?: unknown) {
    super(`Consentimiento de compra sin registrar: ${paso}`);
    this.name = 'ErrorConsentimientoCompra';
    this.paso = paso;
    this.causa = causa;
  }
}

/** Versiones que la clienta tuvo a la vista al marcar cada casilla (null si no había ninguna). */
export type DocumentosVistos = Readonly<Record<IdCasillaCompra, DocumentoLegalVigente | null>>;

/** La versión vista o, si no había, la vigente (memoria, red o archivo). Sin ninguna, lanza 'version'. */
async function documentoParaRegistrar(slug: SlugDocumentoLegal, visto: DocumentoLegalVigente | null): Promise<DocumentoLegalVigente> {
  if (visto) {
    return visto;
  }
  const { documento, error } = await obtenerDocumentoVigente(slug);
  if (!documento) {
    throw new ErrorConsentimientoCompra('version', error);
  }
  return documento;
}

/**
 * Registra las dos aceptaciones en una sola petición (POST /api/consentimientos, formulario
 * 'checkout'): terminos_venta ligado a los Términos y Condiciones (TIPO_DOCUMENTO del backend) y la
 * Política de reembolsos, con la versión y el hash que la clienta tuvo a la vista. Solo resuelve si
 * se guardaron; si no, lanza ErrorConsentimientoCompra y el pedido no se debe crear.
 */
export async function registrarConsentimientosCompra(vistos: DocumentosVistos): Promise<void> {
  const terminos = await documentoParaRegistrar('terminos', vistos.terminosVenta);
  const reembolsos = await documentoParaRegistrar('reembolsos', vistos.reembolsos);
  const items: ItemConsentimiento[] = [
    { ...aceptacionDeDocumento(terminos), tipo: 'terminos_venta' },
    aceptacionDeDocumento(reembolsos),
  ];
  try {
    await registrarConsentimientos({ items, formulario: FORMULARIO_CHECKOUT, rutaOrigen: RUTA_ORIGEN_CHECKOUT });
  } catch (causa) {
    throw new ErrorConsentimientoCompra('registro', causa);
  }
}

const esSinRed = (error: unknown) => error instanceof ErrorDeRed || (error instanceof ApiError && error.status === 0);
const conStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status;

/** El 400 del backend porque la versión o el hash de un documento ya no son los publicados. */
export function esVersionCambiadaCompra(error: unknown): boolean {
  return error instanceof ErrorConsentimientoCompra && error.paso === 'registro' && conStatus(error.causa, 400);
}

/**
 * Mensaje claro de una falla del consentimiento: que el pedido no se creó y qué hacer (sin red,
 * sesión terminada, versión cambiada u otro), nunca el texto técnico del servidor.
 */
export function mensajeConsentimientoCompra(error: ErrorConsentimientoCompra, config: ConfiguracionPublica): string {
  const t = (clave: string) => obtenerTexto(clave, {}, config);
  if (error.paso === 'version') {
    // "Revisa tu conexión" solo sin red; con un 5xx (u otra respuesta) se pide intentar en un momento.
    const detalleVersion =
      tipoDeError(error.causa) === 'sinConexion' ? t('tienda.checkout.consentimientoSinRed') : t('tienda.checkout.consentimientoGenerico');
    return `${t('tienda.checkout.consentimientoSinVersion')} ${detalleVersion}`;
  }
  let detalle = t('tienda.checkout.consentimientoGenerico');
  if (esSinRed(error.causa)) {
    detalle = t('tienda.checkout.consentimientoSinRed');
  } else if (conStatus(error.causa, 401)) {
    detalle = t('tienda.checkout.consentimientoSesion');
  } else if (esVersionCambiadaCompra(error)) {
    detalle = t('tienda.checkout.consentimientoVersion');
  }
  return `${t('tienda.checkout.consentimientoNoGuardado')} ${detalle}`;
}
