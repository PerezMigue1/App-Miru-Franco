/**
 * Funciones, constantes y tipos de presentación de la tienda (precios, piezas, insignias, fechas,
 * forma de pago, qué sigue y datos del salón) para las vistas y los componentes de
 * src/features/tienda. Existe para que ni las vistas ni los componentes importen nada de models/:
 * los toman de la capa viewmodel, que los vuelve a exportar tal cual desde los models. Sin React ni
 * estado.
 */
export { itemConProblema, type ItemCarrito } from '../models/carritoModel';
export {
  esPagoEnSalon,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  fechaPedido,
  formaPagoCorta,
  limitePagoPedido,
  pidePagoEnLinea,
  puedeCancelar,
  SALON_RECOGER,
  textoCancelarPedido,
  textoQueSigueConPago,
  type ItemPedido,
  type Pedido,
} from '../models/pedidoModel';
export {
  estaAgotado,
  formatoPrecio,
  precioDesdeCentavos,
  presentacionComprable,
  textoPiezas,
  tienePreciosDistintos,
  type ProductoCatalogo,
} from '../models/productoModel';
