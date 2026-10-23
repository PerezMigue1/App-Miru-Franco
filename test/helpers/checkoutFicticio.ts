/// <reference types="jest" />

import { fireEvent, screen } from 'expo-router/testing-library';

import { obtenerTexto } from '@/shared/api/textosSitio';

import { respuestaCompleta, RUTA_CONFIGURACION } from './configuracionFicticia';
import { HASH_VIGENTE, rutaDocumento } from './documentosFicticios';
import { consentimientoRegistrado, RUTA_CONSENTIMIENTOS } from './reservaFicticia';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';

/**
 * Datos ficticios del checkout de GP-07.5: los dos documentos de las casillas (Términos y Política de
 * reembolsos, versión 2.3 con el hash ficticio), el registro de consentimientos, el cuerpo que la app
 * debe mandar, las etiquetas de las casillas y una configuración pública con las reglas de la tienda
 * que cada prueba cambia (las cifras de respuestaCompleta() son distintas del respaldo).
 */

/** Términos y Política de reembolsos vigentes y el registro de consentimientos que responde 201. */
export const RUTAS_COMPRA_LEGAL: Record<string, Manejador> = {
  ...rutaDocumento('terminos'),
  ...rutaDocumento('reembolsos'),
  [RUTA_CONSENTIMIENTOS]: consentimientoRegistrado,
};

/** Lo que la app manda al aceptar las dos casillas con los documentos 2.3 vigentes. */
export const CONSENTIMIENTO_COMPRA = {
  items: [
    { tipo: 'terminos_venta', documentoSlug: 'terminos', version: '2.3', hash: HASH_VIGENTE, accion: 'aceptado' },
    { tipo: 'reembolsos', documentoSlug: 'reembolsos', version: '2.3', hash: HASH_VIGENTE, accion: 'aceptado' },
  ],
  formulario: 'checkout',
  rutaOrigen: 'app/checkout',
};

/** Etiquetas de las casillas con la configuración que hay en memoria (los días de revocación cambian). */
export const casillaTerminos = () => obtenerTexto('tienda.checkout.casillaTerminos');
export const casillaReembolsos = () => obtenerTexto('tienda.checkout.casillaReembolsos');

/** Marca las dos casillas del último paso, como la clienta. */
export async function marcarCasillasCompra(): Promise<void> {
  await fireEvent.press(screen.getByRole('checkbox', { name: casillaTerminos() }));
  await fireEvent.press(screen.getByRole('checkbox', { name: casillaReembolsos() }));
}

/**
 * "POST /ruta" de lo que se envió (consentimientos y pedidos), en el orden en que llegaron. Los DELETE
 * con que la app vacía el carrito no cuentan.
 */
export function escriturasCompra(llamadas: Llamada[]): string[] {
  return llamadas.filter((l) => l.metodo === 'POST').map((l) => `${l.metodo} ${l.ruta}`);
}

interface CambiosConfiguracion {
  pagos?: Record<string, unknown>;
  tienda?: Record<string, unknown>;
  salon?: Record<string, unknown>;
  revocacion?: Record<string, unknown>;
  textos?: Record<string, unknown>;
}

/** respuestaCompleta() con las secciones indicadas cambiadas (pagos, tienda, salón, revocación, textos). */
export function configuracionTienda(cambios: CambiosConfiguracion = {}): Record<string, unknown> {
  const base = respuestaCompleta() as {
    salon: Record<string, unknown>;
    reglas: Record<string, Record<string, unknown>>;
    textos: Record<string, unknown>;
  };
  return {
    ...base,
    salon: { ...base.salon, ...cambios.salon },
    reglas: {
      ...base.reglas,
      pagos: { ...base.reglas.pagos, ...cambios.pagos },
      tienda: { ...base.reglas.tienda, ...cambios.tienda },
      revocacion: { ...base.reglas.revocacion, ...cambios.revocacion },
    },
    textos: { ...base.textos, ...cambios.textos },
  };
}

/** GET /api/configuracion-publica con ese cuerpo. */
export function rutaConfiguracionTienda(cuerpo: unknown = configuracionTienda()): Record<string, Manejador> {
  return { [`GET ${RUTA_CONFIGURACION}`]: () => respuesta(cuerpo) };
}
