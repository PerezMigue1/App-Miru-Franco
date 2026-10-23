/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { marcarCasillasCompra, RUTAS_COMPRA_LEGAL } from './checkoutFicticio';
import { AHORA, CLIENTA_CITAS, llamadasDeRuta, respuestaError } from './citasFicticias';
import { abrirSesionSimulada } from './google';
import { abrirApp, cerrarIntroSiAparece, ultimoBoton, type App } from './pantallas';
import { diaLegible, esperarRuta, horaEnTelefono, tocar } from './pantallasReserva';
import { errorDelServidor } from './pantallasServicios';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';
import { sembrarSesion } from './sesionGuardada';
import {
  carritoSimulado,
  cuerpoMisPedidos,
  cuerpoPedido,
  ERRORES_PEDIDOS,
  estadoPagoDe,
  estadoPagoPedidoCrudo,
  ID_PEDIDO,
  INIT_POINT_PEDIDO,
  MIS_PEDIDOS_CRUDOS,
  pedidoDesdeCuerpo,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  rutaEstadoPagoPedido,
  rutaPedido,
  rutasCatalogoTienda,
  rutasPedidos,
  simularServidorTienda,
  type CarritoSimulado,
  type ItemCarritoCrudo,
  type PedidoCrudo,
  type ProductoCrudo,
} from './tiendaFicticia';

/**
 * Pasos comunes de las pruebas de integración de GP-06.4 (tienda) con las pantallas reales: abrir la
 * app con o sin la sesión de CLIENTA_CITAS, el reloj en AHORA y el servidor de la tienda (catálogo,
 * carrito con estado propio en cada prueba y pedidos), leer las tarjetas y la pestaña Carrito por lo
 * que anuncian a TalkBack, recorrer el checkout y revisar Mercado Pago. Las fechas que dependen del
 * teléfono se calculan con la zona con la que corre Jest.
 */

// ── Servidor y apertura ──────────────────────────────────────────────────────────────────────

/**
 * Rutas del pedido ID_PEDIDO con memoria, como el backend: antes de comprar es el de la lista (si
 * está); POST /api/pedidos lo crea con lo que mandó la app (`crear` puede envolver esa creación) y
 * desde entonces la lista lo trae primero, y su detalle y el estado de su pago (sin pagos en
 * Mercado Pago) salen de ese pedido.
 */
function rutasCompra(pedidos: PedidoCrudo[], crear?: (comoServidor: Manejador) => Manejador): Record<string, Manejador> {
  let actual = pedidos.find((pedido) => pedido.id === ID_PEDIDO) ?? null;
  let creado = false;
  const conPedido = (responder: (pedido: PedidoCrudo) => Response): Manejador => () =>
    actual ? responder(actual) : respuestaError(ERRORES_PEDIDOS.pedidoNoEncontrado);
  const comoServidor: Manejador = (cuerpo) => {
    actual = pedidoDesdeCuerpo(cuerpo);
    creado = true;
    return respuesta(cuerpoPedido(actual), 201);
  };
  return {
    [RUTA_CREAR_PEDIDO]: crear ? crear(comoServidor) : comoServidor,
    [RUTA_MIS_PEDIDOS]: () =>
      respuesta(
        cuerpoMisPedidos(creado && actual ? [actual, ...pedidos.filter((p) => p.id !== ID_PEDIDO)] : pedidos),
      ),
    [rutaPedido()]: conPedido((pedido) => respuesta(cuerpoPedido(pedido))),
    [rutaEstadoPagoPedido()]: conPedido((pedido) => respuesta(estadoPagoDe(pedido))),
  };
}

export interface OpcionesTienda {
  /** Sin sesión (la bienvenida ya vista). Por omisión, con la sesión de CLIENTA_CITAS. */
  sinSesion?: boolean;
  /** Catálogo del servidor (por omisión, CATALOGO_TIENDA_CRUDO). */
  catalogo?: ProductoCrudo[];
  /** Lo que ya tiene el carrito de la clienta (por omisión, nada). */
  items?: ItemCarritoCrudo[];
  /** Pedidos de la clienta (por omisión, MIS_PEDIDOS_CRUDOS). */
  pedidos?: PedidoCrudo[];
  /** Envuelve la creación del pedido que imita al servidor (respuesta retenida o perdida). */
  crear?: (comoServidor: Manejador) => Manejador;
  /** Rutas de la prueba, encima de todo lo demás. */
  rutas?: Record<string, Manejador>;
}

export interface PantallaTienda {
  app: App;
  /** Peticiones que recibió el servidor simulado (se van agregando durante la prueba). */
  llamadas: Llamada[];
  /** Carrito de esta prueba (nada se comparte con otra). */
  carrito: CarritoSimulado;
}

/**
 * Abre la app real en la ruta con el reloj en AHORA (antes de sembrar la sesión y de renderRouter),
 * un carrito nuevo y el servidor de la tienda. Cierra la intro de la grieta si aparece.
 */
export async function abrirTienda(ruta: string, opciones: OpcionesTienda = {}): Promise<PantallaTienda> {
  jest.useFakeTimers({ now: AHORA });
  if (opciones.sinSesion) {
    await SecureStore.setItemAsync('bienvenida_vista', '1');
  } else {
    await sembrarSesion(CLIENTA_CITAS);
  }
  const pedidos = opciones.pedidos ?? MIS_PEDIDOS_CRUDOS;
  const carrito = carritoSimulado({ catalogo: opciones.catalogo, items: opciones.items });
  const llamadas = simularServidorTienda({
    // GP-07.5: confirmar registra antes los Términos de venta y la Política de reembolsos.
    ...RUTAS_COMPRA_LEGAL,
    ...(opciones.catalogo ? rutasCatalogoTienda(opciones.catalogo) : {}),
    ...rutasPedidos(pedidos),
    ...rutasCompra(pedidos, opciones.crear),
    ...carrito.rutas,
    ...opciones.rutas,
  });
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas, carrito };
}

/** Cuántas peticiones recibió el servidor en esa ruta "MÉTODO /ruta". */
export function veces(abierta: { llamadas: Llamada[] }, ruta: string): number {
  return llamadasDeRuta(abierta.llamadas, ruta).length;
}

/** Cuerpo JSON de la última petición a esa ruta "MÉTODO /ruta". */
export function ultimoCuerpo(abierta: { llamadas: Llamada[] }, ruta: string): unknown {
  return llamadasDeRuta(abierta.llamadas, ruta).at(-1)?.cuerpo;
}

export interface RutaQueFalla {
  manejador: Manejador;
  /** Desde ahora la ruta responde bien. */
  arreglar: () => void;
}

/**
 * Ruta que responde con `mal` (un 500 por omisión) hasta llamar a arreglar(). No cuenta llamadas:
 * la pestaña Carrito también lee el carrito, así que el orden de las lecturas no importa.
 */
export function fallaHastaArreglar(bien: Manejador, mal: Manejador = errorDelServidor): RutaQueFalla {
  let arreglada = false;
  return {
    manejador: (cuerpo) => (arreglada ? bien(cuerpo) : mal(cuerpo)),
    arreglar: () => {
      arreglada = true;
    },
  };
}

/**
 * La pantalla muestra su estado de error con ese título (y esos textos), nunca el texto técnico del
 * servidor; luego la ruta se arregla y la clienta toca "Reintentar".
 */
export async function reintentarTrasError(ruta: RutaQueFalla, titulo: string, ...textos: string[]): Promise<void> {
  expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
  conTextos(...textos);
  expect(screen.queryByText('Error interno ficticio')).not.toBeOnTheScreen();
  ruta.arreglar();
  await tocar('Reintentar');
}

// ── Lo que ve la clienta ─────────────────────────────────────────────────────────────────────

/** accessibilityLabel de las tarjetas que tienen esa pista, en el orden de la pantalla. */
export function etiquetasConPista(pista: string): string[] {
  return screen.queryAllByHintText(pista).map((tarjeta) => String(tarjeta.props.accessibilityLabel));
}

/** Espera las tarjetas de productos de la cuadrícula: exactamente esas, en ese orden. */
export async function esperarProductos(etiquetas: string[]): Promise<void> {
  await waitFor(() => expect(etiquetasConPista('Abre el detalle del producto')).toEqual(etiquetas));
}

/** Nombre de la pestaña Carrito que lee TalkBack con esas piezas ("Carrito" con 0). */
export function pestanaCarrito(piezas: number): string {
  if (piezas === 0) {
    return 'Carrito';
  }
  return piezas === 1 ? 'Carrito, 1 pieza' : `Carrito, ${piezas} piezas`;
}

/** Espera que la pestaña Carrito anuncie esas piezas (el número tiene estado propio: se espera). */
export async function esperarPestanaCarrito(piezas: number): Promise<void> {
  expect(await screen.findByRole('button', { name: pestanaCarrito(piezas) })).toBeOnTheScreen();
}

/** Mueve el selector de cantidad de ese producto como TalkBack: subir o bajar `pasos` veces. */
export async function moverCantidad(
  nombre: string,
  accion: 'increment' | 'decrement',
  pasos = 1,
): Promise<void> {
  for (let i = 0; i < pasos; i++) {
    await fireEvent(screen.getByRole('adjustable', { name: `Cantidad de ${nombre}` }), 'accessibilityAction', {
      nativeEvent: { actionName: accion },
    });
  }
}

/**
 * Toca el botón "menos" o "más" que se ve en el selector de cantidad de ese producto. Los dos están
 * ocultos a TalkBack (el selector completo es el control ajustable), así que se toman de sus hijos.
 */
export async function tocarBotonCantidad(nombre: string, boton: 'menos' | 'mas'): Promise<void> {
  const selector = screen.getByRole('adjustable', { name: `Cantidad de ${nombre}` });
  const [menos, mas] = selector.children.filter(
    (hijo): hijo is TestInstance => typeof hijo !== 'string' && hijo.props.importantForAccessibility === 'no',
  );
  await fireEvent.press(boton === 'menos' ? menos : mas);
}

/** El selector de cantidad de ese producto marca `valor`. */
export function revisarCantidad(nombre: string, valor: number): void {
  expect(screen.getByRole('adjustable', { name: `Cantidad de ${nombre}` })).toHaveAccessibilityValue({ now: valor });
}

/** Toca la tarjeta del producto en la Tienda y espera su detalle con el nombre como título. */
export async function abrirProducto(app: App, etiqueta: string, id: number, nombre: string): Promise<void> {
  await fireEvent.press(await screen.findByRole('button', { name: etiqueta }));
  await esperarRuta(app, `/producto/${id}`);
  expect(await screen.findByRole('header', { name: nombre })).toBeOnTheScreen();
}

/** Cada texto indicado, a la vista. */
export function conTextos(...textos: (string | RegExp)[]): void {
  for (const texto of textos) {
    expect(screen.getByText(texto)).toBeOnTheScreen();
  }
}

/** Cada accessibilityLabel indicado, a la vista. */
export function conEtiquetas(...etiquetas: string[]): void {
  for (const etiqueta of etiquetas) {
    expect(screen.getByLabelText(etiqueta)).toBeOnTheScreen();
  }
}

/** Ninguno de estos botones a la vista. */
export function sinBotones(...nombres: string[]): void {
  for (const nombre of nombres) {
    expect(screen.queryByRole('button', { name: nombre })).not.toBeOnTheScreen();
  }
}

// ── Fechas del teléfono ──────────────────────────────────────────────────────────────────────

function dosDigitos(numero: number): string {
  return String(numero).padStart(2, '0');
}

/** 'YYYY-MM-DD' local de un instante (con año, mes y día locales; nunca toISOString). */
function diaLocal(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** 'lunes 19 de octubre, 10:00 a. m.' de un instante, en la hora local del teléfono. */
export function fechaEnTelefono(iso: string): string {
  return `${diaLegible(diaLocal(iso))}, ${horaEnTelefono(iso)}`;
}

/** La misma fecha con la primera letra en mayúscula, como la tarjeta de Mis pedidos. */
export function fechaEnTarjeta(iso: string): string {
  const texto = fechaEnTelefono(iso);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ── Checkout ─────────────────────────────────────────────────────────────────────────────────

export const PASO_RECOGER = 'Recoges tu pedido en el salón';
export const PASO_PAGO = '¿Cómo quieres pagar?';
export const PASO_CONFIRMAR = 'Revisa y confirma';
// GP-07.5: el título sale del catálogo (checkout.opcionLineaTitulo, "Pagar en línea").
export const OPCION_EN_LINEA = /^Pagar en línea\./;
export const OPCION_EN_SALON = /^Pagar al recoger en el salón/;
export const APARTAR = 'Apartar mi pedido';
export const IR_A_PAGAR = 'Ir a pagar con Mercado Pago';

/** Espera el encabezado del paso del checkout. */
export async function esperarPasoCompra(titulo: string): Promise<void> {
  expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
}

/**
 * En el checkout, de "Recoger en el salón" a "Revisa y confirma" eligiendo (o no) pagar en línea.
 * GP-07.5: al llegar marca las dos casillas obligatorias (Términos de venta y Política de reembolsos).
 */
export async function llegarAConfirmar(enLinea: boolean): Promise<void> {
  await esperarPasoCompra(PASO_RECOGER);
  await tocar('Continuar');
  await esperarPasoCompra(PASO_PAGO);
  if (enLinea) {
    await fireEvent.press(screen.getByRole('radio', { name: OPCION_EN_LINEA }));
  }
  await tocar('Continuar');
  await esperarPasoCompra(PASO_CONFIRMAR);
  await marcarCasillasCompra();
}

/**
 * Abre el carrito con esos productos, toca "Continuar compra" y llega al último paso del checkout
 * con la forma de pago indicada.
 */
export async function comprarHastaConfirmar(
  enLinea: boolean,
  opciones: OpcionesTienda & { items: ItemCarritoCrudo[] },
): Promise<PantallaTienda> {
  const abierta = await abrirTienda('/carrito', opciones);
  await tocar('Continuar compra');
  await esperarRuta(abierta.app, '/checkout');
  await llegarAConfirmar(enLinea);
  return abierta;
}

// ── Mercado Pago ─────────────────────────────────────────────────────────────────────────────

/** GET del estado del pago del pedido: responde con ese estado (y su pedidoEstado). */
export function conEstadoPago(estado: string): Manejador {
  return () => respuesta(estadoPagoPedidoCrudo(estado));
}

/** Mercado Pago se abrió esas veces, siempre con el checkout ficticio y el regreso a la app. */
export function revisarMercadoPago(vecesAbierto: number): void {
  const abrir = abrirSesionSimulada();
  expect(abrir).toHaveBeenCalledTimes(vecesAbierto);
  for (const llamada of abrir.mock.calls) {
    expect(llamada).toEqual([INIT_POINT_PEDIDO, 'appmirufranco://pedido']);
  }
}

// ── Mis pedidos ──────────────────────────────────────────────────────────────────────────────

/** Pista de cada tarjeta de Mis pedidos. */
export const PISTA_PEDIDO = 'Abre el detalle del pedido';

/** Toca "Cancelar pedido" del detalle y espera la hoja con su título y su texto. */
export async function abrirHojaCancelarPedido(numero: number, texto: string): Promise<void> {
  await tocar('Cancelar pedido');
  expect(await screen.findByRole('header', { name: `¿Cancelar el pedido #${numero}?` })).toBeOnTheScreen();
  expect(screen.getByText(texto)).toBeOnTheScreen();
}

/** Toca "Sí, cancelar pedido" en la hoja. */
export async function confirmarCancelacion(): Promise<void> {
  await fireEvent.press(ultimoBoton('Sí, cancelar pedido'));
}
