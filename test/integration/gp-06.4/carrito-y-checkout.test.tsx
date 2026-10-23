/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { marcarCasillasCompra } from '../../helpers/checkoutFicticio';
import { AHORA_ISO, conError } from '../../helpers/citasFicticias';
import { navegadorRegresa } from '../../helpers/google';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import {
  esperarRuta,
  navegadorFalla,
  prepararPruebasReserva,
  retener,
  sinTextos,
  tocar,
  tocarYEsperar,
} from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import {
  abrirTienda,
  APARTAR,
  comprarHastaConfirmar,
  conEstadoPago,
  conEtiquetas,
  conTextos,
  esperarPasoCompra,
  esperarPestanaCarrito,
  fallaHastaArreglar,
  reintentarTrasError,
  fechaEnTelefono,
  IR_A_PAGAR,
  moverCantidad,
  OPCION_EN_LINEA,
  OPCION_EN_SALON,
  PASO_CONFIRMAR,
  PASO_PAGO,
  PASO_RECOGER,
  revisarMercadoPago,
  sinBotones,
  tocarBotonCantidad,
  ultimoCuerpo,
  veces,
} from '../../helpers/pantallasTienda';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  ACEITE_CON_GALERIA,
  CARRITO_CRUDO,
  CATALOGO_TIENDA_CRUDO,
  cuerpoListaTienda,
  deepLinkPedido,
  ERRORES_PAGO_PEDIDO,
  ERRORES_TIENDA,
  ESMALTE,
  isoMasMinutos,
  idItemCarrito,
  itemCarritoCrudo,
  MENSAJES_PAGO_PEDIDO,
  presentacionCruda,
  RUTA_CARRITO,
  RUTA_CREAR_PEDIDO,
  RUTA_MIS_PEDIDOS,
  RUTA_PREFERENCIA_PEDIDO,
  rutaCambiarCantidad,
  rutaEstadoPagoPedido,
  rutaQuitarDelCarrito,
  SHAMPOO,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.4: el carrito y la compra con las pantallas reales, el reloj fijo y el servidor simulado
 * (cada prueba con su propio carrito): filas, total, cantidades y su tope por existencias, quitar
 * con confirmación, vacío, sin sesión y error; el checkout en tres pasos con los datos para recoger
 * en el salón, el apartado con pago al recoger (el carrito queda vacío y la pestaña baja), el doble
 * toque y el pago en línea con Mercado Pago simulado (aprobado, en proceso y rechazado). Los 400
 * al crear el pedido los revisa correcciones-tienda (D4).
 */

/** Lo que anuncia cada fila del carrito de ejemplo (CARRITO_CRUDO). */
const FILA = {
  acondicionador: 'Acondicionador reparación, Botánica Ficticia, 300ml, $382.50 cada uno, 1 pieza, total $382.50',
  shampoo: 'Shampoo hidratante, Botánica Ficticia, 250ml, $380 cada uno, 2 piezas, total $760',
} as const;

const ID_SHAMPOO = idItemCarrito(3011);
const NOTA_RECOGER = 'Recoges tu pedido en el salón. Pagas en línea o al recogerlo.';
const AJUSTA = 'Ajusta los productos marcados para continuar.';
const CONTINUAR_COMPRA = 'Continuar compra';
const QUITAR_SHAMPOO = 'Quitar Shampoo hidratante del carrito';
const PAGOS_REPETIDOS = ['Reintentar pago', 'Pagar de nuevo', 'Pagar con Mercado Pago'];

/** Ya pagó o el pedido terminó: ni plazo ni botones para pagar otra vez. */
function sinPedirPagoOtraVez(): void {
  sinBotones(...PAGOS_REPETIDOS);
  sinTextos(/Paga antes del/);
}

/** El pago en línea vence 24 horas después de crear el pedido (creado en AHORA). */
const PLAZO_PAGO = `Paga antes del ${fechaEnTelefono(isoMasMinutos(AHORA_ISO, 24 * 60))}.`;

/** Las líneas que manda la app al crear el pedido con CARRITO_CRUDO (en el orden del carrito). */
const LINEAS_CARRITO = [
  { productoId: 302, presentacionId: 3021, cantidad: 1 },
  { productoId: 301, presentacionId: 3011, cantidad: 2 },
];

/** Abre la pestaña Carrito con CARRITO_CRUDO y espera sus filas. */
async function abrirCarritoDeEjemplo(rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirTienda('/carrito', { items: CARRITO_CRUDO, rutas });
  expect(await screen.findByLabelText(FILA.shampoo)).toBeOnTheScreen();
  return abierta;
}

describe('Carrito y compra con las pantallas reales (GP-06.4)', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('Carrito', () => {
    it(
      'muestra cada producto, el total y la nota de recoger; cambiar la cantidad actualiza el total y la pestaña',
      async () => {
        const abierta = await abrirCarritoDeEjemplo();
        conEtiquetas(FILA.acondicionador, 'Total: $1,142.50');
        conTextos(NOTA_RECOGER);
        await esperarPestanaCarrito(3);
        expect(screen.getByRole('button', { name: CONTINUAR_COMPRA })).toBeEnabled();

        await tocarBotonCantidad('Shampoo hidratante', 'mas');
        expect(
          await screen.findByLabelText('Shampoo hidratante, Botánica Ficticia, 250ml, $380 cada uno, 3 piezas, total $1,140'),
        ).toBeOnTheScreen();
        conEtiquetas('Total: $1,522.50');
        expect(ultimoCuerpo(abierta, rutaCambiarCantidad(ID_SHAMPOO))).toEqual({ cantidad: 3 });
        await esperarPestanaCarrito(4);

        // Con una pieza no baja más: no se envía nada.
        await tocarBotonCantidad('Acondicionador reparación', 'menos');
        expect(veces(abierta, rutaCambiarCantidad(idItemCarrito(3021)))).toBe(0);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si el servidor ya no tiene piezas para subir la cantidad, la regresa y lo dice con un texto de la app',
      async () => {
        await abrirCarritoDeEjemplo({ [rutaCambiarCantidad(ID_SHAMPOO)]: conError(ERRORES_TIENDA.stockInsuficiente) });
        await moverCantidad('Shampoo hidratante', 'increment');

        expect(await screen.findByText('Ya no hay suficientes piezas de este producto.')).toBeOnTheScreen();
        conEtiquetas(FILA.shampoo, 'Total: $1,142.50');
        sinTextos('Stock insuficiente');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'marca lo que ya no está o pide más piezas de las que hay, bloquea la compra y al ajustarlo la deja seguir',
      async () => {
        const shampooApagado = itemCarritoCrudo(SHAMPOO, 1, {
          presentacion: presentacionCruda({ ...SHAMPOO.presentaciones[0], disponible: false }),
        });
        const aceiteConUnaPieza = itemCarritoCrudo(ACEITE_CON_GALERIA, 2, {
          presentacion: presentacionCruda({ ...ACEITE_CON_GALERIA.presentaciones[0], stock: 1 }),
        });
        const abierta = await abrirTienda('/carrito', {
          catalogo: [...CATALOGO_TIENDA_CRUDO, ACEITE_CON_GALERIA],
          items: [itemCarritoCrudo(ESMALTE, 5), shampooApagado, aceiteConUnaPieza],
        });
        expect(
          await screen.findByLabelText(
            'Esmalte en gel, Uñas Ficticias, 15ml, $1,200 cada uno, 5 piezas, total $6,000, Solo quedan 3 piezas',
          ),
        ).toBeOnTheScreen();
        // GP-07.5: la presentación que ya no está disponible se quita sola antes de pagar (DELETE) y se
        // avisa por su nombre; ya no queda en la lista para quitarla a mano.
        conTextos(obtenerTexto('tienda.carrito.presentacionRetirada', { producto: 'Shampoo hidratante, 250ml' }));
        expect(screen.queryByLabelText(/^Shampoo hidratante, /)).not.toBeOnTheScreen();
        expect(veces(abierta, rutaQuitarDelCarrito(ID_SHAMPOO))).toBe(1);
        conEtiquetas('Aceite de argán, Botánica Ficticia, $540 cada uno, 2 piezas, total $1,080, Solo queda 1 pieza');
        conTextos(AJUSTA);
        expect(screen.getByRole('button', { name: CONTINUAR_COMPRA })).toBeDisabled();
        expect(veces(abierta, rutaCambiarCantidad(ID_SHAMPOO))).toBe(0);

        // "Menos" lleva la cantidad directo a las existencias.
        await moverCantidad('Esmalte en gel', 'decrement');
        expect(await screen.findByLabelText(/^Esmalte en gel, .*, 3 piezas, total \$3,600$/)).toBeOnTheScreen();
        expect(ultimoCuerpo(abierta, rutaCambiarCantidad(idItemCarrito(3051)))).toEqual({ cantidad: 3 });
        expect(screen.getByRole('button', { name: CONTINUAR_COMPRA })).toBeDisabled();

        await tocarBotonCantidad('Aceite de argán', 'menos');
        await waitFor(() => expect(screen.queryByText(AJUSTA)).not.toBeOnTheScreen());
        expect(screen.getByRole('button', { name: CONTINUAR_COMPRA })).toBeEnabled();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'quitar pide confirmación: "Conservar" lo deja y "Quitar" lo saca, baja el total y la pestaña',
      async () => {
        const abierta = await abrirCarritoDeEjemplo();
        await tocar(QUITAR_SHAMPOO);
        expect(await screen.findByRole('header', { name: '¿Quitar este producto?' })).toBeOnTheScreen();
        conTextos('Shampoo hidratante, 250ml');

        await tocar('Conservar');
        await waitFor(() =>
          expect(screen.queryByRole('header', { name: '¿Quitar este producto?' })).not.toBeOnTheScreen(),
        );
        expect(veces(abierta, rutaQuitarDelCarrito(ID_SHAMPOO))).toBe(0);

        await tocar(QUITAR_SHAMPOO);
        await fireEvent.press(ultimoBoton('Quitar'));
        await waitFor(() => expect(screen.queryByLabelText(FILA.shampoo)).not.toBeOnTheScreen());
        conEtiquetas(FILA.acondicionador, 'Total: $382.50');
        await esperarPestanaCarrito(1);
        expect(abierta.carrito.items().map((item) => item.id)).toEqual([idItemCarrito(3021)]);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'vacío lo dice y "Ver la tienda" abre la pestaña Productos',
      async () => {
        const { app } = await abrirTienda('/carrito');
        expect(await screen.findByRole('header', { name: 'Tu carrito está vacío' })).toBeOnTheScreen();
        conTextos('Agrega productos desde la tienda y aparecerán aquí.');
        sinBotones(CONTINUAR_COMPRA);
        await tocarYEsperar(app, 'Ver la tienda', '/tienda');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin sesión invita a crear cuenta o iniciar sesión y no pide el carrito',
      async () => {
        const abierta = await abrirTienda('/carrito', { sinSesion: true });
        expect(await screen.findByRole('header', { name: 'Tu carrito te espera' })).toBeOnTheScreen();
        conTextos('Inicia sesión para guardar tus productos y apartarlos en el salón.');
        await esperarPestanaCarrito(0);
        expect(veces(abierta, 'GET /api/carrito')).toBe(0);
        await tocarYEsperar(abierta.app, 'Crear cuenta', '/registro');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si el carrito no carga lo dice y "Reintentar" lo muestra',
      async () => {
        const ruta = fallaHastaArreglar(() => respuesta(cuerpoListaTienda(CARRITO_CRUDO)));
        await abrirTienda('/carrito', { rutas: { [RUTA_CARRITO]: ruta.manejador } });
        await reintentarTrasError(ruta, 'No pudimos cargar tu carrito');
        expect(await screen.findByLabelText(FILA.shampoo)).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Checkout', () => {
    it(
      'pago al recoger: datos del salón, forma de pago, resumen y apartado; el carrito queda vacío y la pestaña baja',
      async () => {
        // Un teléfono sin app para llamar: el número sigue escrito en la pantalla.
        jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('Sin app de teléfono ficticia'));
        const abierta = await abrirCarritoDeEjemplo();
        await esperarPestanaCarrito(3);
        await tocarYEsperar(abierta.app, CONTINUAR_COMPRA, '/checkout');

        await esperarPasoCompra(PASO_RECOGER);
        // GP-07.5: nombre, domicilio y horario salen de la configuración pública (aquí, el respaldo).
        const { salon } = RESPALDO_CONFIGURACION;
        const domicilio = `${salon.direccion}, ${salon.ciudad}`;
        conTextos(salon.nombre, domicilio, 'Lunes a viernes de 9:30 a 19:30 h.');
        conTextos('Sábados de 9:30 a 19:00 h.', 'Domingos cerrado.');
        conTextos(
          'Suele estar listo en 24 a 48 horas hábiles. Te avisamos en la app y por correo cuando puedas pasar por él.',
        );
        await fireEvent.press(screen.getByRole('link', { name: 'Llamar al salón, +52 771 268 1432' }));
        expect(Linking.openURL).toHaveBeenCalledWith('tel:+527712681432');
        conTextos('¿Dudas para llegar? Llámanos al +52 771 268 1432');

        await tocar('Continuar');
        await esperarPasoCompra(PASO_PAGO);
        expect(screen.getByRole('radio', { name: OPCION_EN_SALON })).toBeChecked();
        // GP-07.5: los avisos salen del catálogo (checkout.avisoSalon y checkout.avisoLinea) con las reglas.
        const avisoSalon = obtenerTexto('checkout.avisoSalon', {
          total: '$1,142.50',
          metodosSalon: ' (efectivo, tarjeta o transferencia)',
        });
        conTextos(avisoSalon);
        // Cambia de idea: en línea y otra vez al recoger.
        await fireEvent.press(screen.getByRole('radio', { name: OPCION_EN_LINEA }));
        expect(await screen.findByText(obtenerTexto('checkout.avisoLinea', { total: '$1,142.50' }))).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('radio', { name: OPCION_EN_SALON }));
        expect(screen.getByRole('radio', { name: OPCION_EN_SALON })).toBeChecked();
        conTextos(avisoSalon);

        await tocar('Continuar');
        await esperarPasoCompra(PASO_CONFIRMAR);
        conEtiquetas('Acondicionador reparación, 300ml, 1 pieza, $382.50', 'Shampoo hidratante, 250ml, 2 piezas, $760');
        conEtiquetas('Total: $1,142.50', 'Forma de pago: Pago al recoger en el salón');
        // GP-07.5: el salón sale de la configuración y bajo el total va la leyenda de precios con IVA.
        conEtiquetas(`Recoges en: ${salon.nombre}, ${domicilio}`);
        conTextos('Precios en pesos mexicanos con IVA incluido.');

        await marcarCasillasCompra();
        await tocar(APARTAR);
        await esperarRuta(abierta.app, '/pedido-confirmado/701');
        expect(await screen.findByRole('header', { name: '¡Gracias por tu compra!' })).toBeOnTheScreen();
        conTextos(
          'Te apartamos tu pedido. Te avisamos en la app y por correo cuando esté listo para recogerlo y pagarlo en el salón.',
          'Pagas $1,142.50 en el mostrador cuando pases por él.',
          'Pedido #701',
        );
        conEtiquetas('Estado: Apartado, pagas al recoger', 'Forma de pago: Pago al recoger en el salón');
        expect(screen.getByRole('header', { name: 'Dónde lo recoges' })).toBeOnTheScreen();
        sinTextos(/Paga antes del/);

        expect(ultimoCuerpo(abierta, RUTA_CREAR_PEDIDO)).toEqual({
          estado: 'pendiente_pago',
          moneda: 'MXN',
          metodoPago: 'pago_en_salon',
          items: LINEAS_CARRITO,
        });
        expect(abierta.carrito.items()).toEqual([]);
        expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(0);
        expect(veces(abierta, rutaEstadoPagoPedido())).toBe(0);

        await tocarYEsperar(abierta.app, 'Seguir comprando', '/tienda');
        await esperarPestanaCarrito(0);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      '"Volver" regresa un paso y en el primero sale al carrito',
      async () => {
        const abierta = await abrirCarritoDeEjemplo();
        await tocarYEsperar(abierta.app, CONTINUAR_COMPRA, '/checkout');
        await esperarPasoCompra(PASO_RECOGER);
        await tocar('Continuar');
        await esperarPasoCompra(PASO_PAGO);

        await tocar('Volver');
        await esperarPasoCompra(PASO_RECOGER);
        await tocarYEsperar(abierta.app, 'Volver', '/carrito');
        expect(await screen.findByLabelText(FILA.shampoo)).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'un doble toque en "Apartar mi pedido" crea un solo pedido y "Volver" no regresa mientras se envía',
      async () => {
        const retenida = retener();
        const abierta = await comprarHastaConfirmar(false, { items: CARRITO_CRUDO, crear: retenida.envolver });

        const boton = screen.getByRole('button', { name: APARTAR });
        await fireEvent.press(boton);
        await fireEvent.press(boton);
        await waitFor(() => expect(screen.getByRole('button', { name: APARTAR })).toBeBusy());
        expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        await tocar('Volver');
        expect(screen.getByRole('header', { name: PASO_CONFIRMAR })).toBeOnTheScreen();

        await retenida.soltar();
        await esperarRuta(abierta.app, '/pedido-confirmado/701');
        expect(await screen.findByRole('header', { name: '¡Gracias por tu compra!' })).toBeOnTheScreen();
        expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si se pierde la respuesta al apartar pero el pedido sí se creó, lo encuentra y no crea otro',
      async () => {
        const sinRespuesta = (comoServidor: Manejador): Manejador => (cuerpo) => {
          comoServidor(cuerpo);
          return Promise.reject(new TypeError('Network request failed')) as unknown as Response;
        };
        const abierta = await comprarHastaConfirmar(false, { items: CARRITO_CRUDO, crear: sinRespuesta });
        await tocar(APARTAR);

        await esperarRuta(abierta.app, '/pedido-confirmado/701');
        expect(await screen.findByRole('header', { name: '¡Gracias por tu compra!' })).toBeOnTheScreen();
        expect(veces(abierta, RUTA_CREAR_PEDIDO)).toBe(1);
        expect(veces(abierta, RUTA_MIS_PEDIDOS)).toBe(1);
        expect(abierta.carrito.items()).toEqual([]);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, string, () => void]>([
      [
        'aprobado',
        'aprobado',
        () => {
          expect(screen.getByRole('header', { name: '¡Pago recibido!' })).toBeOnTheScreen();
          conEtiquetas('Estado: Pagado');
          sinPedirPagoOtraVez();
        },
      ],
      [
        'en proceso',
        'pendiente',
        () => {
          expect(screen.getByRole('header', { name: 'Tu pago se está procesando' })).toBeOnTheScreen();
          // GP-07.5: el texto sale del catálogo (tienda.pagoEnProcesoTexto); que se actualiza sola lo
          // dice el indicador "Verificando tu pago" mientras el registro vuelve a consultar.
          conTextos('Mercado Pago aún no lo confirma. Te avisamos en la app y por correo en cuanto se acredite.');
          conEtiquetas('Estado: Pago en proceso');
          sinPedirPagoOtraVez();
          expect(screen.queryByLabelText(/Paga antes del/)).not.toBeOnTheScreen();
        },
      ],
      [
        'rechazado',
        'rechazado',
        () => {
          expect(screen.getByRole('header', { name: 'Tu pago no se completó' })).toBeOnTheScreen();
          conTextos(/^Mercado Pago no aprobó el pago y no se hizo ningún cargo\./);
          conEtiquetas('Estado: Pendiente de pago', PLAZO_PAGO);
          expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeEnabled();
        },
      ],
      [
        'en revisión',
        'revision',
        () => {
          expect(screen.getByRole('header', { name: 'Recibimos tu pago' })).toBeOnTheScreen();
          conTextos(
            'Necesitamos revisarlo antes de preparar tu pedido. El salón te contactará; no tienes que pagar otra vez.',
          );
          conEtiquetas('Estado: Pago en proceso');
          sinPedirPagoOtraVez();
        },
      ],
      [
        'cancelado porque terminó el plazo',
        'cancelado',
        () => {
          expect(screen.getByRole('header', { name: 'Pedido cancelado' })).toBeOnTheScreen();
          conTextos('Este pedido está cancelado.');
          conEtiquetas('Estado: Cancelado');
          sinPedirPagoOtraVez();
        },
      ],
    ])(
      'pago en línea %s: crea el pedido, abre Mercado Pago y al regresar muestra el estado real del pago',
      async (_caso, estado, revisar) => {
        navegadorRegresa(deepLinkPedido());
        const abierta = await comprarHastaConfirmar(true, {
          items: CARRITO_CRUDO,
          rutas: { [rutaEstadoPagoPedido()]: enSecuencia(conEstadoPago('sin_pago'), conEstadoPago(estado)) },
        });
        conEtiquetas('Forma de pago: En línea con Mercado Pago');
        await tocar(IR_A_PAGAR);

        await esperarRuta(abierta.app, '/pedido-confirmado/701');
        await waitFor(() => expect(veces(abierta, rutaEstadoPagoPedido())).toBe(2));
        await waitFor(revisar);
        revisarMercadoPago(1);
        expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);
        expect(ultimoCuerpo(abierta, RUTA_PREFERENCIA_PEDIDO)).toEqual({ pedidoId: 701 });
        expect(ultimoCuerpo(abierta, RUTA_CREAR_PEDIDO)).toMatchObject({ metodoPago: 'mercado_pago', items: LINEAS_CARRITO });
        expect(abierta.carrito.items()).toEqual([]);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'con el pago rechazado, "Reintentar pago" vuelve a abrir Mercado Pago con otra preferencia',
      async () => {
        navegadorRegresa(deepLinkPedido());
        const abierta = await comprarHastaConfirmar(true, {
          items: CARRITO_CRUDO,
          rutas: { [rutaEstadoPagoPedido()]: enSecuencia(conEstadoPago('sin_pago'), conEstadoPago('rechazado')) },
        });
        await tocar(IR_A_PAGAR);
        await tocar('Reintentar pago');

        await waitFor(() => revisarMercadoPago(2));
        expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(2);
        expect(await screen.findByRole('header', { name: 'Tu pago no se completó' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, Manejador, RegExp, boolean]>([
      // GP-07.5: con los reintentos agotados la pantalla dice "Todavía no vemos tu pago" y pide no
      // pagar de nuevo (tienda.pago.porConfirmarTexto del catálogo).
      ['el pago todavía no aparece', conEstadoPago('sin_pago'), /^Si ya pagaste, no pagues de nuevo: puede tardar unos minutos en verse\. Toca Revisar mi pago\. Tu pedido sigue apartado hasta el /, true],
      ['la consulta del pago falla', errorDelServidor, /^No pudimos revisar tu pago\. Si ya pagaste, no pagues de nuevo/, false],
    ])(
      'si al regresar de Mercado Pago %s, primero ofrece "Revisar mi pago" y así encuentra el pago aprobado',
      async (_caso, mientras, mensaje, pagarDeNuevo) => {
        const pago = fallaHastaArreglar(conEstadoPago('aprobado'), mientras);
        const abierta = await comprarHastaConfirmar(true, {
          items: CARRITO_CRUDO,
          rutas: { [rutaEstadoPagoPedido()]: enSecuencia(conEstadoPago('sin_pago'), pago.manejador) },
        });
        await tocar(IR_A_PAGAR);
        await esperarRuta(abierta.app, '/pedido-confirmado/701');

        // Recién vuelve: consulta unos segundos antes de decir que no ve el pago.
        for (let i = 0; i < 4; i++) {
          await act(async () => {
            await jest.advanceTimersByTimeAsync(3000);
          });
        }
        expect(await screen.findByText(mensaje)).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: 'Revisar mi pago' })).toBeEnabled();
        expect(Boolean(screen.queryByRole('button', { name: 'Pagar de nuevo' }))).toBe(pagarDeNuevo);
        sinBotones('Reintentar pago', 'Pagar con Mercado Pago');
        expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(1);

        pago.arreglar();
        await tocar('Revisar mi pago');
        expect(await screen.findByRole('header', { name: '¡Pago recibido!' })).toBeOnTheScreen();
        revisarMercadoPago(1);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, () => void, Record<string, Manejador>, string, number, boolean]>([
      [
        'el plazo para pagar ya terminó (409)',
        () => undefined,
        { [RUTA_PREFERENCIA_PEDIDO]: conError(ERRORES_PAGO_PEDIDO.vencido) },
        'El plazo de 24 horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.',
        0,
        false,
      ],
      [
        'el pago en línea está apagado (503)',
        () => undefined,
        { [RUTA_PREFERENCIA_PEDIDO]: conError(ERRORES_PAGO_PEDIDO.noDisponible) },
        'El pago en línea no está disponible por ahora. Intenta más tarde.',
        0,
        true,
      ],
      [
        'no hay navegador',
        navegadorFalla,
        {},
        'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.',
        1,
        true,
      ],
    ])(
      'si al abrir el pago %s lo dice con un texto de la app y no consulta un pago que no se hizo',
      async (_caso, preparar, rutas, mensaje, abierto, puedePagar) => {
        preparar();
        const abierta = await comprarHastaConfirmar(true, { items: CARRITO_CRUDO, rutas });
        await tocar(IR_A_PAGAR);

        await esperarRuta(abierta.app, '/pedido-confirmado/701');
        expect(await screen.findByText(mensaje)).toBeOnTheScreen();
        sinTextos(MENSAJES_PAGO_PEDIDO.vencido, MENSAJES_PAGO_PEDIDO.noDisponible);
        revisarMercadoPago(abierto);
        // Solo la consulta previa a pedir el pago: nunca se espera un regreso que no hubo.
        expect(veces(abierta, rutaEstadoPagoPedido())).toBe(1);
        expect(Boolean(screen.queryByRole('button', { name: 'Pagar con Mercado Pago' }))).toBe(puedePagar);
        // Con el plazo vencido el título ya no invita a pagar: dice que el pago no se completó.
        expect(Boolean(screen.queryByRole('header', { name: 'Completa tu pago' }))).toBe(puedePagar);
        expect(Boolean(screen.queryByRole('header', { name: 'Tu pago no se completó' }))).toBe(!puedePagar);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si el carrito quedó vacío en otro lado, el checkout regresa al carrito',
      async () => {
        const { app } = await abrirTienda('/checkout');
        await esperarRuta(app, '/carrito');
        expect(await screen.findByRole('header', { name: 'Tu carrito está vacío' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si el checkout no puede leer el carrito lo dice y "Reintentar" sigue con la compra',
      async () => {
        const ruta = fallaHastaArreglar(() => respuesta(cuerpoListaTienda(CARRITO_CRUDO)));
        await abrirTienda('/checkout', { rutas: { [RUTA_CARRITO]: ruta.manejador } });
        await reintentarTrasError(ruta, 'No pudimos cargar tu carrito');
        await esperarPasoCompra(PASO_RECOGER);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
