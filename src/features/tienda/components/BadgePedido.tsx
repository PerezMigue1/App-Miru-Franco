import { BadgeEstado } from '@/features/citas/components/BadgeEstado';

import { etiquetaEstadoPedido, type Pedido } from '../models/pedidoModel';

/**
 * Insignia del estado de un pedido con el mismo lenguaje que las citas (BadgeEstado): base clara
 * teñida del color del estado y texto oscuro de su familia, en claro y en oscuro.
 */
export function BadgePedido({ pedido }: { pedido: Pick<Pedido, 'estado' | 'metodoPago'> }) {
  const { texto, tono } = etiquetaEstadoPedido(pedido);
  return <BadgeEstado texto={texto} tono={tono} />;
}
