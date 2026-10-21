/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Dimensions } from 'react-native';

import { conError, sinRedEnRuta } from '../../helpers/citasFicticias';
import { CLAVE, CORREO, USUARIO } from '../../helpers/datosClienta';
import { SESION_GOOGLE } from '../../helpers/google';
import { entrarCon, LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { esperarRuta, prepararPruebasReserva, sinTextos, tocar, tocarYEsperar } from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor, respuestaRetenida } from '../../helpers/pantallasServicios';
import {
  abrirProducto,
  abrirTienda,
  conEtiquetas,
  conTextos,
  esperarPestanaCarrito,
  esperarProductos,
  fallaHastaArreglar,
  reintentarTrasError,
  moverCantidad,
  revisarCantidad,
  ultimoCuerpo,
  veces,
} from '../../helpers/pantallasTienda';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import {
  ACEITE_CON_GALERIA,
  CATALOGO_TIENDA_CRUDO,
  catalogoLargo,
  cuerpoListaTienda,
  ERRORES_TIENDA,
  itemCarritoCrudo,
  productosActivos,
  RUTA_AGREGAR_CARRITO,
  RUTA_CATALOGO_TIENDA,
  rutaProducto,
  SHAMPOO,
} from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.4: la pestaña Productos (catálogo de la tienda) y el detalle de un producto con las
 * pantallas reales (renderRouter sobre src/app), el reloj fijo y el servidor simulado: carga,
 * agotados al final, vacío y errores con Reintentar, búsqueda sin acentos, categorías, filtros,
 * páginas, el detalle con sus presentaciones y existencias, y agregar al carrito con sesión (el
 * número de la pestaña Carrito se actualiza) o sin ella (la invitación a iniciar sesión).
 */

/** Lo que anuncia cada tarjeta del catálogo de ejemplo. */
const TARJETA = {
  shampoo: 'Shampoo hidratante, Botánica Ficticia, desde $380',
  acondicionador: 'Acondicionador reparación, Botánica Ficticia, $382.50',
  esmalte: 'Esmalte en gel, Uñas Ficticias, $1,200',
  crema: 'Ácido hialurónico facial, Piel Ficticia, $299.90',
  mascarilla: 'Mascarilla nutritiva, Óleo Ficticio, $450, agotado',
  serum: 'Sérum de puntas, Óleo Ficticio, Consulta el precio en el salón, agotado',
} as const;

/** Las tarjetas en el orden de la pantalla: con existencias primero y los agotados al final. */
const TODAS = Object.values(TARJETA);

const BUSCADOR = 'Buscar productos por nombre, marca o categoría';
const AGREGAR = 'Agregar al carrito';

/** Lista del catálogo que responde el servidor, como GET /api/productos. */
const CATALOGO_BIEN: Manejador = () => respuesta(cuerpoListaTienda(productosActivos()));

/** Abre la pestaña Productos y espera el catálogo completo. */
async function abrirCatalogo(opciones: Parameters<typeof abrirTienda>[1] = { sinSesion: true }) {
  const abierta = await abrirTienda('/tienda', opciones);
  await esperarProductos(TODAS);
  return abierta;
}

describe('Tienda con las pantallas reales (GP-06.4)', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('Catálogo', () => {
    it(
      'muestra el esqueleto mientras carga; luego precio, "Desde" con precios distintos y los agotados al final',
      async () => {
        const retenida = respuestaRetenida(cuerpoListaTienda(productosActivos()));
        await abrirTienda('/tienda', { sinSesion: true, rutas: { [RUTA_CATALOGO_TIENDA]: retenida.manejador } });
        expect(await screen.findByLabelText('Cargando productos')).toBeOnTheScreen();
        expect(screen.getByRole('header', { name: 'Productos' })).toBeOnTheScreen();

        await retenida.soltar();
        await esperarProductos(TODAS);
        conTextos('Desde $380', '$1,200', 'Consulta el precio en el salón');
        expect(screen.getAllByText('Agotado')).toHaveLength(2);
        // El producto desactivado no llega del servidor y nunca se muestra.
        sinTextos('Tinte descontinuado');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin productos publicados lo dice y no ofrece buscar',
      async () => {
        await abrirTienda('/tienda', {
          sinSesion: true,
          rutas: { [RUTA_CATALOGO_TIENDA]: () => respuesta(cuerpoListaTienda([])) },
        });
        expect(await screen.findByRole('header', { name: 'Aún no hay productos' })).toBeOnTheScreen();
        conTextos('El salón todavía no publica productos en la app. Vuelve pronto.');
        expect(screen.queryByLabelText(BUSCADOR)).not.toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, Manejador, string, string]>([
      [
        'el servidor falla (500)',
        errorDelServidor,
        'No pudimos cargar la tienda',
        'Ocurrió un problema al traer los productos. Intenta de nuevo en un momento.',
      ],
      ['no hay internet', sinRedEnRuta, 'Sin conexión', 'Revisa tu internet e intenta de nuevo.'],
    ])(
      'si %s lo dice sin el texto del servidor y "Reintentar" carga el catálogo',
      async (_caso, falla, titulo, mensaje) => {
        const ruta = fallaHastaArreglar(CATALOGO_BIEN, falla);
        await abrirTienda('/tienda', { sinSesion: true, rutas: { [RUTA_CATALOGO_TIENDA]: ruta.manejador } });
        await reintentarTrasError(ruta, titulo, mensaje);
        await esperarProductos(TODAS);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, string, string[]]>([
      ['sin acentos ni mayúsculas', 'ACIDO HIALURONICO', [TARJETA.crema]],
      ['por la marca', 'botanica', [TARJETA.shampoo, TARJETA.acondicionador]],
      ['por la categoría', 'tratamientos', [TARJETA.mascarilla, TARJETA.serum]],
    ])(
      'busca %s y "Borrar búsqueda" regresa todo el catálogo',
      async (_caso, texto, esperadas) => {
        await abrirCatalogo();
        const buscador = screen.getByLabelText(BUSCADOR);
        await fireEvent(buscador, 'focus');
        await fireEvent.changeText(buscador, texto);
        await fireEvent(buscador, 'blur');
        await esperarProductos(esperadas);

        await tocar('Borrar búsqueda');
        await esperarProductos(TODAS);
        expect(screen.getByLabelText(BUSCADOR)).toHaveDisplayValue('');
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'una búsqueda sin resultados lo dice y "Ver todos" quita búsqueda y categoría',
      async () => {
        await abrirCatalogo();
        await fireEvent.press(screen.getByRole('button', { name: 'Categoría Cabello' }));
        await fireEvent.changeText(screen.getByLabelText(BUSCADOR), 'esmalte');
        expect(await screen.findByRole('header', { name: 'No encontramos productos' })).toBeOnTheScreen();

        await tocar('Ver todos');
        await esperarProductos(TODAS);
        expect(screen.getByRole('button', { name: 'Categoría Todas' })).toBeSelected();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'filtra por categoría con las del catálogo en orden alfabético y "Todas" regresa la lista',
      async () => {
        await abrirCatalogo();
        const categorias = screen
          .getAllByRole('button', { name: /^Categoría / })
          .map((chip) => String(chip.props.accessibilityLabel));
        expect(categorias).toEqual([
          'Categoría Todas',
          'Categoría Cabello',
          'Categoría Facial',
          'Categoría Tratamientos',
          'Categoría Uñas',
        ]);

        await fireEvent.press(screen.getByRole('button', { name: 'Categoría Uñas' }));
        await esperarProductos([TARJETA.esmalte]);
        expect(screen.getByRole('button', { name: 'Categoría Uñas' })).toBeSelected();

        await fireEvent.press(screen.getByRole('button', { name: 'Categoría Todas' }));
        await esperarProductos(TODAS);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, () => Promise<void>, string[]]>([
      [
        'con descuento',
        () => fireEvent.press(screen.getByRole('button', { name: 'Con descuento' })),
        [TARJETA.acondicionador],
      ],
      [
        'con precio mínimo de $400',
        () => fireEvent.changeText(screen.getByLabelText('Mínimo'), '400'),
        [TARJETA.esmalte, TARJETA.mascarilla],
      ],
    ])(
      'el panel de filtros aplica "%s", cuenta el filtro activo y "Limpiar filtros" lo quita',
      async (_caso, elegir, esperadas) => {
        await abrirCatalogo();
        await tocar('Filtros');
        expect(await screen.findByRole('header', { name: 'Filtros' })).toBeOnTheScreen();
        await elegir();
        await fireEvent.press(ultimoBoton('Aplicar'));
        await esperarProductos(esperadas);

        await tocar('Filtros, 1 activos');
        await fireEvent.press(ultimoBoton('Limpiar filtros'));
        await esperarProductos(TODAS);
        expect(screen.getByRole('button', { name: 'Filtros' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'con más de 16 productos los reparte en páginas con "Siguiente" y "Anterior"',
      async () => {
        await abrirTienda('/tienda', { sinSesion: true, catalogo: catalogoLargo(18) });
        expect(await screen.findByText('Mostrando 1 a 16 de 18 productos')).toBeOnTheScreen();
        // Sin marca, la tarjeta muestra la categoría.
        expect(screen.getByRole('button', { name: 'Producto ficticio 1, Cabello, $380' })).toBeOnTheScreen();
        conTextos('Página 1 de 2');
        expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

        await tocar('Página siguiente');
        expect(await screen.findByText('Mostrando 17 a 18 de 18 productos')).toBeOnTheScreen();
        conTextos('Página 2 de 2');
        expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();

        await tocar('Página anterior');
        expect(await screen.findByText('Página 1 de 2')).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si deslizar para actualizar falla, lo avisa y conserva los productos',
      async () => {
        await abrirCatalogo({ sinSesion: true, rutas: { [RUTA_CATALOGO_TIENDA]: enSecuencia(CATALOGO_BIEN, errorDelServidor) } });
        await deslizarParaActualizar();
        expect(
          await screen.findByText('No pudimos actualizar la tienda. Desliza hacia abajo para intentar de nuevo.'),
        ).toBeOnTheScreen();
        await esperarProductos(TODAS);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Detalle del producto', () => {
    it(
      'del catálogo al shampoo: precio, presentaciones, existencias, la cantidad se topa a las piezas y Regresar vuelve',
      async () => {
        const { app } = await abrirCatalogo();
        await abrirProducto(app, TARJETA.shampoo, SHAMPOO.id, 'Shampoo hidratante');

        conTextos('Botánica Ficticia', 'Cabello', '10 piezas disponibles', 'Descripción larga ficticia del producto.');
        conTextos('Sin sulfatos', 'Uso diario', 'Aplicar sobre cabello húmedo.', 'Aceite de argán', 'Keratina');
        conTextos('Cabello suave y brillante');
        for (const seccion of ['Descripción', 'Características', 'Modo de uso', 'Ingredientes', 'Resultado']) {
          expect(screen.getByRole('header', { name: seccion })).toBeOnTheScreen();
        }
        conEtiquetas('Precio: $380', 'Foto 1 de 1 de Shampoo hidratante');
        expect(screen.getByRole('radio', { name: '250ml' })).toBeChecked();
        revisarCantidad('Shampoo hidratante', 1);

        await moverCantidad('Shampoo hidratante', 'increment', 2);
        revisarCantidad('Shampoo hidratante', 3);

        // Otra presentación: su precio y sus piezas, y la cantidad vuelve a 1.
        await fireEvent.press(screen.getByRole('radio', { name: '500ml' }));
        expect(await screen.findByLabelText('Precio: $620')).toBeOnTheScreen();
        conTextos('4 piezas disponibles');
        expect(screen.getByRole('radio', { name: '500ml' })).toBeChecked();
        revisarCantidad('Shampoo hidratante', 1);

        await moverCantidad('Shampoo hidratante', 'increment', 6);
        revisarCantidad('Shampoo hidratante', 4);
        await moverCantidad('Shampoo hidratante', 'decrement', 6);
        revisarCantidad('Shampoo hidratante', 1);

        await tocarYEsperar(app, 'Regresar', '/tienda');
        await esperarProductos(TODAS);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, number, string[], string[]]>([
      [
        'con descuento: precio antes y porcentaje',
        302,
        ['Precio: $382.50, antes $510, 25 por ciento de descuento'],
        ['$510', '-25%', '6 piezas disponibles'],
      ],
      ['cruelty free con dos presentaciones del mismo precio', 305, ['Precio: $1,200'], ['Cruelty free', '3 piezas disponibles']],
    ])(
      'producto %s',
      async (_caso, id, etiquetas, textos) => {
        await abrirTienda(`/producto/${id}`, { sinSesion: true });
        await waitFor(() => conEtiquetas(...etiquetas));
        conTextos(...textos);
        expect(screen.getByRole('button', { name: AGREGAR })).toBeEnabled();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, number, string, string, string]>([
      ['agotado', 303, '200g, agotado', 'Sin existencias', 'Precio: $450'],
      ['sin precio', 304, '30ml, agotado', 'Consulta el precio en el salón', 'Sérum de puntas, sin foto'],
    ])(
      'producto %s: la presentación apagada, sin cantidad y "Agregar al carrito" deshabilitado',
      async (_caso, id, presentacion, aviso, etiqueta) => {
        await abrirTienda(`/producto/${id}`, { sinSesion: true });
        expect(await screen.findByRole('radio', { name: presentacion })).toBeDisabled();
        expect(screen.getAllByText(aviso).length).toBeGreaterThan(0);
        conEtiquetas(etiqueta);
        expect(screen.getByRole('button', { name: AGREGAR })).toBeDisabled();
        expect(screen.queryByRole('adjustable')).not.toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'con varias fotos anuncia cuántas son y se pueden deslizar',
      async () => {
        await abrirTienda(`/producto/${ACEITE_CON_GALERIA.id}`, {
          sinSesion: true,
          catalogo: [...CATALOGO_TIENDA_CRUDO, ACEITE_CON_GALERIA],
        });
        expect(await screen.findByRole('header', { name: 'Aceite de argán' })).toBeOnTheScreen();
        // La galería dibuja una foto a la vez; cada una dice su lugar entre las tres.
        conEtiquetas('Foto 1 de 3 de Aceite de argán');
        // Sin tamaño ni otra presentación: no hay nada que elegir.
        sinTextos('Presentación');
        conTextos('2 piezas disponibles');

        const [galeria] = screen.container.queryAll((nodo) => nodo.props.pagingEnabled === true);
        const ancho = Dimensions.get('window').width;
        await fireEvent(galeria, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: ancho * 2, y: 0 } } });
        expect(screen.getAllByRole('image', { name: /^Foto \d de 3 de Aceite de argán$/ }).length).toBeGreaterThan(0);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, string, number]>([
      ['desactivado (404 del servidor)', '307', 1],
      ['con un id que no es número (sin llamar al servidor)', 'abc', 0],
    ])(
      'un producto %s dice que no se encontró e "Ir a la Tienda" lleva al catálogo',
      async (_caso, id, llamadas) => {
        const abierta = await abrirTienda(`/producto/${id}`, { sinSesion: true });
        expect(await screen.findByRole('header', { name: 'No encontramos este producto' })).toBeOnTheScreen();
        conTextos('Puede que el salón lo haya retirado. Mira los demás productos en la Tienda.');
        sinTextos('Producto no encontrado');
        expect(veces(abierta, rutaProducto(id))).toBe(llamadas);

        await tocarYEsperar(abierta.app, 'Ir a la Tienda', '/tienda');
        await esperarProductos(TODAS);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, Manejador, string, string]>([
      [
        'el servidor falla',
        errorDelServidor,
        'No pudimos cargar este producto',
        'Ocurrió un problema al traer el producto. Intenta de nuevo en un momento.',
      ],
      ['no hay internet', sinRedEnRuta, 'Sin conexión', 'Revisa tu internet e intenta de nuevo.'],
    ])(
      'si el detalle no carga porque %s lo dice y "Reintentar" lo muestra',
      async (_caso, falla, titulo, mensaje) => {
        const ruta = fallaHastaArreglar(() => respuesta({ success: true, data: SHAMPOO }), falla);
        await abrirTienda(`/producto/${SHAMPOO.id}`, { sinSesion: true, rutas: { [rutaProducto(SHAMPOO.id)]: ruta.manejador } });
        await reintentarTrasError(ruta, titulo, mensaje);
        expect(await screen.findByRole('header', { name: 'Shampoo hidratante' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Agregar al carrito', () => {
    it(
      'con sesión agrega la cantidad elegida, lo confirma, la pestaña Carrito cuenta las piezas y "Ver carrito" lo abre',
      async () => {
        const abierta = await abrirCatalogo({});
        await esperarPestanaCarrito(0);
        await abrirProducto(abierta.app, TARJETA.shampoo, SHAMPOO.id, 'Shampoo hidratante');

        await moverCantidad('Shampoo hidratante', 'increment');
        await tocar(AGREGAR);
        expect(await screen.findByText('Agregamos 2 piezas a tu carrito. Ahora tienes 2.')).toBeOnTheScreen();
        expect(ultimoCuerpo(abierta, RUTA_AGREGAR_CARRITO)).toEqual({ productoId: 301, presentacionId: 3011, cantidad: 2 });
        expect(abierta.carrito.items().map((item) => [item.presentacionId, item.cantidad])).toEqual([[3011, 2]]);

        await tocarYEsperar(abierta.app, 'Ver carrito', '/carrito');
        await esperarPestanaCarrito(2);
        expect(
          await screen.findByLabelText(
            'Shampoo hidratante, Botánica Ficticia, 250ml, $380 cada uno, 2 piezas, total $760',
          ),
        ).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it.each<[string, number, string, number]>([
      ['con 9 de 10 piezas en el carrito suma solo la que queda', 9, 'Agregamos las piezas disponibles: tienes 10 en tu carrito.', 1],
      ['con las 10 piezas ya en el carrito no envía nada', 10, 'Ya tienes en tu carrito todas las piezas disponibles.', 0],
    ])(
      '%s',
      async (_caso, enCarrito, mensaje, envios) => {
        const abierta = await abrirTienda(`/producto/${SHAMPOO.id}`, { items: [itemCarritoCrudo(SHAMPOO, enCarrito)] });
        expect(await screen.findByRole('header', { name: 'Shampoo hidratante' })).toBeOnTheScreen();
        await moverCantidad('Shampoo hidratante', 'increment', 2);
        await tocar(AGREGAR);

        expect(await screen.findByText(mensaje)).toBeOnTheScreen();
        expect(veces(abierta, 'POST /api/carrito')).toBe(envios);
        expect(abierta.carrito.items()[0].cantidad).toBe(10);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'si el servidor ya no tiene la presentación lo dice con un texto de la app',
      async () => {
        const abierta = await abrirTienda(`/producto/${SHAMPOO.id}`, {
          rutas: { [RUTA_AGREGAR_CARRITO]: conError(ERRORES_TIENDA.presentacionNoDisponible) },
        });
        await tocar(AGREGAR);
        expect(await screen.findByText('Esta presentación ya no está disponible.')).toBeOnTheScreen();
        sinTextos('Presentación no disponible', /Agregamos/);
        expect(veces(abierta, 'POST /api/carrito')).toBe(1);
        expect(screen.getByRole('button', { name: AGREGAR })).toBeEnabled();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'sin sesión invita a iniciar sesión; "Ahora no" la cierra y al entrar se agrega lo que había elegido',
      async () => {
        const abierta = await abrirTienda(`/producto/${SHAMPOO.id}`, {
          sinSesion: true,
          rutas: {
            'POST /api/auth/login': () => respuesta({ success: true, ...SESION_GOOGLE, usuario: USUARIO }),
          },
        });
        expect(await screen.findByRole('header', { name: 'Shampoo hidratante' })).toBeOnTheScreen();
        await moverCantidad('Shampoo hidratante', 'increment');

        await tocar(AGREGAR);
        expect(await screen.findByRole('header', { name: 'Inicia sesión para continuar' })).toBeOnTheScreen();
        await tocar('Ahora no');
        await waitFor(() =>
          expect(screen.queryByRole('header', { name: 'Inicia sesión para continuar' })).not.toBeOnTheScreen(),
        );
        expect(veces(abierta, 'GET /api/carrito')).toBe(0);

        await tocar(AGREGAR);
        await tocar('Iniciar sesión');
        await esperarRuta(abierta.app, '/login');
        await entrarCon(CORREO, CLAVE);

        await esperarRuta(abierta.app, `/producto/${SHAMPOO.id}`);
        expect(await screen.findByText('Agregamos 2 piezas a tu carrito. Ahora tienes 2.')).toBeOnTheScreen();
        expect(ultimoCuerpo(abierta, RUTA_AGREGAR_CARRITO)).toEqual({ productoId: 301, presentacionId: 3011, cantidad: 2 });
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
