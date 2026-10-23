import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import type { ConfiguracionPublica, DatosTransferencia } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  avisoCancelar,
  consecuenciaNoAsistir,
  etiquetaOpcion,
  opcionesAnticipo,
  plazoDeOpcion,
  saldoEnSalon,
  textoBotonConfirmar,
  textoMetodosSalon,
  textoSinAnticipo,
  type OpcionAnticipo,
} from '../models/formaPagoModel';
import { montoDePrecio, type Servicio } from '../models/servicioModel';

export type { OpcionAnticipo } from '../models/formaPagoModel';

/**
 * Textos de la sección "Forma de pago" del paso Confirmar (FormaPagoCita.tsx de la web), ya armados
 * para que la vista solo los pinte: con anticipo, el monto, el saldo, las opciones activas con su
 * plazo, las consecuencias y los métodos del salón; sin anticipo, cuánto se paga en el salón. Todo
 * sale del catálogo de textos y de las reglas de la configuración. Puro: sin React.
 */

/** Una opción para pagar el anticipo, con su plazo debajo. */
export interface OpcionFormaPago {
  opcion: OpcionAnticipo;
  etiqueta: string;
  plazo: string;
}

/** Un monto con su etiqueta ("Anticipo para apartar tu cita": "$360"). */
export interface MontoFormaPago {
  etiqueta: string;
  monto: string;
}

/** Con anticipo: monto, saldo, opciones activas con su plazo, consecuencias y métodos del salón. */
export interface FormaPagoConAnticipo {
  conAnticipo: true;
  anticipo: MontoFormaPago;
  /** Con precio conocido: lo que queda por pagar en el salón. */
  saldo: MontoFormaPago | null;
  /** Sin precio conocido: que se descuenta del total. */
  descuento: string | null;
  /** "¿Cómo quieres pagar el anticipo?". */
  pregunta: string;
  /** Las opciones activas (mercadoPagoAnticipos y permitirAnticipoEnSalon). */
  opciones: OpcionFormaPago[];
  /** Qué pasa si no llega y, si la regla lo pide, el aviso para reagendar. */
  avisos: string[];
  /** Métodos de pago del salón activos, o null si no hay. */
  metodos: string | null;
  /** Datos para transferir: solo con la opción de pagar en el salón y la transferencia activa. */
  transferencia: DatosTransferencia | null;
}

/** Sin anticipo: cuánto se paga en el salón y con qué métodos. */
export interface FormaPagoSinAnticipo {
  conAnticipo: false;
  /** "Pagas $350 en el salón el día de tu cita.". */
  sinAnticipo: string;
  metodos: string | null;
  /** Datos para transferir en el salón, o null si la transferencia está apagada o incompleta. */
  transferencia: DatosTransferencia | null;
}

export type FormaPagoReserva = FormaPagoConAnticipo | FormaPagoSinAnticipo;

/** Un monto ya calculado para mostrar: "$840" ("$0" si no queda nada por pagar). */
function montoParaMostrar(monto: number): string {
  // saldoEnSalon nunca es negativo: precioParaMostrar solo da null con 0.
  return precioParaMostrar(String(monto)) ?? '$0';
}

/**
 * Banco, titular y CLABE para pagar por transferencia en el salón: solo si el salón acepta
 * transferencia (metodosSalon) y la configuración trae los datos completos; si no, null y no se
 * muestra ninguna cuenta. Lo usan la reserva y el detalle de la cita.
 */
export function transferenciaEnSalon(config: ConfiguracionPublica): DatosTransferencia | null {
  const { metodosSalon, transferencia } = config.reglas.pagos;
  return metodosSalon.includes('transferencia') ? transferencia : null;
}

/**
 * La sección "Forma de pago" de la reserva. `anticipo` es el que hoy se pide (anticipoVigente), o null.
 * `opcion` es la forma de pagar el anticipo que vale (opcionVigente): con anticipo, los datos de
 * transferencia solo se muestran si se paga en el salón, como la web.
 */
export function formaPagoReserva(
  servicio: Pick<Servicio, 'precio'>,
  anticipo: string | null,
  config: ConfiguracionPublica,
  opcion: OpcionAnticipo | null = null,
): FormaPagoReserva {
  const metodos = textoMetodosSalon(config);
  const transferencia = transferenciaEnSalon(config);
  if (!anticipo) {
    return { conAnticipo: false, sinAnticipo: textoSinAnticipo(servicio.precio, config), metodos, transferencia };
  }
  const saldo = saldoEnSalon(servicio.precio, anticipo);
  const aviso = avisoCancelar(undefined, config);
  return {
    conAnticipo: true,
    anticipo: { etiqueta: obtenerTexto('citas.formaPago.anticipoEtiqueta', {}, config), monto: anticipo },
    saldo:
      saldo === null
        ? null
        : { etiqueta: obtenerTexto('citas.formaPago.saldoEtiqueta', {}, config), monto: montoParaMostrar(saldo) },
    descuento: saldo === null ? obtenerTexto('citas.crear.anticipoDescuento', {}, config) : null,
    pregunta: obtenerTexto('citas.formaPago.pregunta', {}, config),
    opciones: opcionesAnticipo(config.reglas.citas, config.reglas.pagos).map((opcion) => ({
      opcion,
      etiqueta: etiquetaOpcion(opcion, config),
      plazo: plazoDeOpcion(opcion, undefined, config),
    })),
    avisos: aviso ? [consecuenciaNoAsistir(undefined, config), aviso] : [consecuenciaNoAsistir(undefined, config)],
    metodos,
    transferencia: opcion === 'salon' ? transferencia : null,
  };
}

/**
 * La opción que vale: la elegida si sigue activa con la configuración de ahora o, si no, la inicial
 * (la primera activa), como la web.
 */
export function opcionVigente(elegida: OpcionAnticipo | null, config: ConfiguracionPublica): OpcionAnticipo {
  const opciones = opcionesAnticipo(config.reglas.citas, config.reglas.pagos);
  return elegida && opciones.includes(elegida) ? elegida : opciones[0];
}

/** Texto del botón final: según el anticipo y la opción, y su texto de espera mientras se envía. */
export function botonConfirmar(
  anticipo: string | null,
  opcion: OpcionAnticipo,
  enviando: boolean,
  config: ConfiguracionPublica,
): string {
  return textoBotonConfirmar(anticipo ? montoDePrecio(anticipo) : 0, opcion, enviando, config);
}
