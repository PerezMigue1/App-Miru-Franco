import { useMemo } from 'react';

import { useTextos } from '@/shared/api/useTextos';

/**
 * Textos fijos de las vistas y componentes de la tienda (carrito, checkout, catálogo, detalle del
 * producto y del pedido), del catálogo de textos con su respaldo en la app (GP-07.6). Las vistas y
 * los componentes no importan de shared/api: los toman de aquí. Los que dependen de un dato llegan
 * como función.
 */
export interface TextosTienda {
  total: string;
  /** "Total: $450.00". */
  totalEtiqueta: (total: string) => string;
  /** "Total: $450.00, 2 piezas". */
  totalPiezasEtiqueta: (total: string, piezas: string) => string;
  carrito: {
    titulo: string;
    subtitulo: string;
    cargando: string;
    sesionTitulo: string;
    sesionBeneficio: string;
    errorTitulo: string;
    vacioTitulo: string;
    vacioTexto: string;
    verTienda: string;
    recoges: string;
    ajusta: string;
    continuar: string;
    quitarTitulo: string;
    quitar: string;
    conservar: string;
  };
  checkout: {
    titulo: string;
    subtitulo: string;
    cargando: string;
    revisarCarrito: string;
    confirmarPedido: string;
    ayudaLinea: string;
    ayudaSalon: string;
    llamarSalon: string;
    comoPagar: string;
    revisaTitulo: string;
    revisaTexto: string;
    formaPago: string;
    recogesEn: string;
  };
  /** "Llamar al salón, +52 ..." de la fila del teléfono. */
  llamarSalonEtiqueta: (telefono: string) => string;
  catalogo: {
    titulo: string;
    subtitulo: string;
    cargando: string;
    sinRedTitulo: string;
    sinRedTexto: string;
    errorTitulo: string;
    errorTexto: string;
    vacioTitulo: string;
    vacioTexto: string;
    refresco: string;
    sinResultadosTitulo: string;
    sinResultadosTexto: string;
    verTodos: string;
  };
  producto: {
    cargando: string;
    errorTitulo: string;
    errorTexto: string;
    noEncontradoTitulo: string;
    noEncontradoTexto: string;
    irATienda: string;
    agregar: string;
    verCarrito: string;
    descripcion: string;
    caracteristicas: string;
    modoUso: string;
    ingredientes: string;
    resultado: string;
  };
  pedido: {
    /** "Pedido #12", o "Tu pedido" sin número. */
    titulo: (numero: string | null) => string;
    cargando: string;
    errorTitulo: string;
    noEncontradoTitulo: string;
    noEncontradoTexto: string;
    verMisPedidos: string;
    hechoEl: (fecha: string) => string;
    hechoElEtiqueta: (fecha: string) => string;
    queSigue: string;
    revisarMiPago: string;
    completarPago: string;
    articulos: string;
    formaPago: string;
    formaPagoEtiqueta: (formaPago: string) => string;
    recoger: string;
    cancelar: string;
  };
  cancelarPedido: {
    titulo: (numero: number | string) => string;
    confirmar: string;
    cancelando: string;
    conservar: string;
  };
}

/** Los textos de la tienda con la configuración vigente; cambian (y se vuelve a pintar) si cambia. */
export function useTextosTienda(): TextosTienda {
  const texto = useTextos();
  return useMemo<TextosTienda>(
    () => ({
      total: texto('tienda.total'),
      totalEtiqueta: (total) => texto('tienda.totalEtiqueta', { total }),
      totalPiezasEtiqueta: (total, piezas) => texto('tienda.totalPiezasEtiqueta', { total, piezas }),
      carrito: {
        titulo: texto('tienda.carrito.titulo'),
        subtitulo: texto('tienda.carrito.subtitulo'),
        cargando: texto('tienda.carrito.cargando'),
        sesionTitulo: texto('tienda.carrito.sesionTitulo'),
        sesionBeneficio: texto('tienda.carrito.sesionBeneficio'),
        errorTitulo: texto('tienda.carrito.errorTitulo'),
        vacioTitulo: texto('tienda.carrito.vacioTitulo'),
        vacioTexto: texto('tienda.carrito.vacioTexto'),
        verTienda: texto('tienda.carrito.verTienda'),
        recoges: texto('tienda.carrito.recoges'),
        ajusta: texto('tienda.carrito.ajusta'),
        continuar: texto('tienda.carrito.continuar'),
        quitarTitulo: texto('tienda.carrito.quitarTitulo'),
        quitar: texto('tienda.carrito.quitar'),
        conservar: texto('tienda.carrito.conservar'),
      },
      checkout: {
        titulo: texto('tienda.checkout.titulo'),
        subtitulo: texto('tienda.checkout.subtitulo'),
        cargando: texto('tienda.checkout.cargando'),
        revisarCarrito: texto('tienda.checkout.revisarCarrito'),
        confirmarPedido: texto('tienda.checkout.confirmarPedido'),
        ayudaLinea: texto('tienda.checkout.ayudaLinea'),
        ayudaSalon: texto('tienda.checkout.ayudaSalon'),
        llamarSalon: texto('tienda.checkout.llamarSalon'),
        comoPagar: texto('tienda.checkout.comoPagar'),
        revisaTitulo: texto('tienda.checkout.revisaTitulo'),
        revisaTexto: texto('tienda.checkout.revisaTexto'),
        formaPago: texto('tienda.pago.formaPago'),
        recogesEn: texto('tienda.checkout.recogesEn'),
      },
      llamarSalonEtiqueta: (telefono) => texto('tienda.recoger.llamarEtiqueta', { telefono }),
      catalogo: {
        titulo: texto('tienda.catalogo.titulo'),
        subtitulo: texto('tienda.catalogo.subtitulo'),
        cargando: texto('tienda.catalogo.cargando'),
        sinRedTitulo: texto('tienda.catalogo.sinRedTitulo'),
        sinRedTexto: texto('tienda.catalogo.sinRedTexto'),
        errorTitulo: texto('tienda.catalogo.errorTitulo'),
        errorTexto: texto('tienda.catalogo.errorTexto'),
        vacioTitulo: texto('tienda.catalogo.vacioTitulo'),
        vacioTexto: texto('tienda.catalogo.vacioTexto'),
        refresco: texto('tienda.catalogo.refresco'),
        sinResultadosTitulo: texto('tienda.catalogo.sinResultadosTitulo'),
        sinResultadosTexto: texto('tienda.catalogo.sinResultadosTexto'),
        verTodos: texto('tienda.catalogo.verTodos'),
      },
      producto: {
        cargando: texto('tienda.producto.cargando'),
        errorTitulo: texto('tienda.producto.errorTitulo'),
        errorTexto: texto('tienda.producto.errorTexto'),
        noEncontradoTitulo: texto('tienda.producto.noEncontradoTitulo'),
        noEncontradoTexto: texto('tienda.producto.noEncontradoTexto'),
        irATienda: texto('tienda.producto.irATienda'),
        agregar: texto('tienda.producto.agregar'),
        verCarrito: texto('tienda.producto.verCarrito'),
        descripcion: texto('tienda.producto.descripcion'),
        caracteristicas: texto('tienda.producto.caracteristicas'),
        modoUso: texto('tienda.producto.modoUso'),
        ingredientes: texto('tienda.producto.ingredientes'),
        resultado: texto('tienda.producto.resultado'),
      },
      pedido: {
        titulo: (numero) =>
          numero ? texto('tienda.pedido.detalle.titulo', { pedido: numero }) : texto('tienda.pedido.detalle.tituloSinNumero'),
        cargando: texto('tienda.pago.cargando'),
        errorTitulo: texto('tienda.pago.errorCargaTitulo'),
        noEncontradoTitulo: texto('tienda.pago.noEncontradoTitulo'),
        noEncontradoTexto: texto('tienda.pedido.detalle.noEncontradoTexto'),
        verMisPedidos: texto('tienda.pago.botonMisPedidos'),
        hechoEl: (fecha) => texto('tienda.pedido.detalle.hechoEl', { fecha }),
        hechoElEtiqueta: (fecha) => texto('tienda.pedido.detalle.hechoElEtiqueta', { fecha }),
        queSigue: texto('tienda.pedido.detalle.queSigue'),
        revisarMiPago: texto('tienda.pago.botonRevisarMiPago'),
        completarPago: texto('tienda.pedido.detalle.completarPago'),
        articulos: texto('tienda.pedido.detalle.articulos'),
        formaPago: texto('tienda.pago.formaPago'),
        formaPagoEtiqueta: (formaPago) => texto('tienda.pedido.detalle.formaPagoEtiqueta', { formaPago }),
        recoger: texto('tienda.pedido.detalle.recoger'),
        cancelar: texto('tienda.pedido.cancelar.boton'),
      },
      cancelarPedido: {
        titulo: (numero) => texto('tienda.pedido.cancelar.titulo', { pedido: numero }),
        confirmar: texto('tienda.pedido.cancelar.confirmar'),
        cancelando: texto('tienda.pedido.cancelar.cancelando'),
        conservar: texto('tienda.pedido.cancelar.conservar'),
      },
    }),
    [texto],
  );
}
