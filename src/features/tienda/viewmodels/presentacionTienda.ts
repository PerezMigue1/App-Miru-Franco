/**
 * Funciones, constantes y tipos de presentación de la tienda (precios, piezas, insignias, fechas y
 * forma de pago) para las vistas y los componentes de src/features/tienda. Existe para que ni las
 * vistas ni los componentes importen nada de models/: los toman de la capa viewmodel, que los vuelve
 * a exportar tal cual desde los models. Sin React ni estado. Desde GP-07.5 los textos salen del
 * catálogo de textos del sitio y los datos del salón, de la configuración pública (ya no hay datos
 * del salón escritos aquí).
 */
export { itemConProblema, type ItemCarrito } from '../models/carritoModel';
export {
  esPagoEnSalon,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  fechaPedido,
  formaPagoCorta,
  limitePagoPedido,
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
