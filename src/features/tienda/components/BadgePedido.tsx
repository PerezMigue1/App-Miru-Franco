import { BadgeEstado } from '@/shared/ui/BadgeEstado';

import { etiquetaEstadoPedido, type Pedido } from '../viewmodels/presentacionTienda';

/**
 * Insignia del estado de un pedido con el mismo lenguaje que las citas (BadgeEstado): base clara
 * teñida del color del estado y texto oscuro de su familia, en claro y en oscuro. Con
 * `pagoEnProceso`, el pedido en línea pendiente dice "Pago en proceso".
 */
export function BadgePedido({
  pedido,
  pagoEnProceso = false,
}: {
  pedido: Pick<Pedido, 'estado' | 'metodoPago'>;
  pagoEnProceso?: boolean;
}) {
  const { texto, tono } = etiquetaEstadoPedido(pedido, pagoEnProceso);
  return <BadgeEstado texto={texto} tono={tono} />;
}
