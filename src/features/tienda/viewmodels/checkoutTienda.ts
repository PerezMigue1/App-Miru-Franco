import { useMemo } from 'react';
import { Linking } from 'react-native';

import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';

import {
  datosRecoger,
  informacionCompra,
  PROFECO,
  type DatosRecoger,
  type InformacionCompra,
} from '../models/compraLegal';

export type {
  ContactoVendedor,
  DatosRecoger,
  EtiquetaCasillaCompra,
  IdCasillaCompra,
  InformacionCompra,
  OpcionMetodo,
} from '../models/compraLegal';

/**
 * Piezas de la capa viewmodel del checkout (GP-07.5) que usan los componentes de la tienda: los datos
 * para recoger en el salón y la información de la compra con la configuración pública vigente (se
 * vuelven a pintar cuando cambia), los enlaces que abren el teléfono, el mapa o el sitio, y la
 * versión de un documento legal que la clienta tuvo a la vista al marcar su casilla.
 */

/** Abre un enlace (tel:, mailto: o https://). Si no hay app que lo abra, el dato sigue escrito en pantalla. */
export function abrirEnlace(url: string | null): void {
  if (!url) {
    return;
  }
  Linking.openURL(url).catch(() => {
    // Sin app para abrirlo, el texto queda a la vista.
  });
}

/** Datos del salón para recoger el pedido (nombre, domicilio, horario, teléfono, mapa y aviso). */
export function useDatosRecoger(): DatosRecoger {
  const { configuracion } = useConfiguracionPublica();
  return useMemo(() => datosRecoger(configuracion), [configuracion]);
}

/** Información de comercio electrónico del último paso, con los datos de contacto de Profeco. */
export function useInformacionCompra(): InformacionCompra & { profeco: typeof PROFECO } {
  const { configuracion } = useConfiguracionPublica();
  return useMemo(() => ({ ...informacionCompra(configuracion), profeco: PROFECO }), [configuracion]);
}

/** La versión que la clienta tuvo a la vista al marcar una casilla (vive en shared: también la usa el registro). */
export { useDocumentoVisto } from '@/shared/api/useDocumentoVisto';
