/// <reference types="jest" />

import {
  obtenerCarritoRevisado,
  quitarDelCarrito,
  reiniciarMemoriaCarrito,
  tomarAvisosCarrito,
  type ArticuloRetirado,
} from '@/features/tienda/models/carritoModel';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';

import { CLIENTA_CITAS, conError, errorDe, ERRORES, llamadasDeRuta, sinRedEnRuta, usarRelojFijo } from '../../helpers/citasFicticias';
import { RUTAS_DE_FONDO } from '../../helpers/datosClienta';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { respuesta, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  ACONDICIONADOR,
  cuerpoDatoTienda,
  cuerpoListaTienda,
  ERRORES_TIENDA,
  idItemCarrito,
  itemCarritoCrudo,
  presentacionCruda,
  RUTA_CARRITO,
  rutaProducto,
  rutaQuitarDelCarrito,
  SHAMPOO,
  type ItemCarritoCrudo,
} from '../../helpers/tiendaFicticia';

/**
 * GP-07.5: el carrito avisa y quita ANTES de pagar lo que se dejó de vender. GET /api/carrito omite
 * los artículos de productos desactivados, así que el modelo recuerda (Singleton por sesión, solo
 * nombre y tamaño) la última lista vista: lo que desaparece sin que la clienta lo quitara y cuyo
 * producto responde 404 se avisa por su nombre y se borra con DELETE (si falla, el aviso igual se
 * da); una presentación con disponible en false también. Solo fetch es simulado (http://api.test).
 */

usarRelojFijo();

const simular = servidorConRutas(RUTAS_DE_FONDO);

const SHAMPOO_ITEM = itemCarritoCrudo(SHAMPOO, 2);
const ACONDICIONADOR_ITEM = itemCarritoCrudo(ACONDICIONADOR, 1);
const ID_SHAMPOO = idItemCarrito(SHAMPOO.presentaciones[0].id);
const SHAMPOO_RETIRADO: ArticuloRetirado = { itemId: ID_SHAMPOO, nombre: 'Shampoo hidratante', tamanio: '250ml', motivo: 'producto' };

const lista = (...items: ItemCarritoCrudo[]): Manejador => () => respuesta(cuerpoListaTienda(items));
const productoActivo: Manejador = () => respuesta(cuerpoDatoTienda(SHAMPOO));
const productoRetirado: Manejador = conError(ERRORES_TIENDA.productoNoEncontrado);
const borrado: Manejador = () => respuesta({ success: true, message: 'Ítem eliminado' });

const idsDe = (items: { id: number }[]) => items.map((item) => item.id);

beforeEach(async () => {
  reiniciarMemoriaCarrito();
  await sembrarSesion(CLIENTA_CITAS);
});

describe('obtenerCarritoRevisado', () => {
  it('la primera lectura de la sesión no avisa nada ni consulta productos', async () => {
    const llamadas = simular({ [RUTA_CARRITO]: lista(SHAMPOO_ITEM, ACONDICIONADOR_ITEM) });
    const revisado = await obtenerCarritoRevisado();
    expect(idsDe(revisado.items)).toEqual([ID_SHAMPOO, ACONDICIONADOR_ITEM.id]);
    expect(revisado.retirados).toEqual([]);
    expect(tomarAvisosCarrito()).toEqual([]);
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/productos'))).toHaveLength(0);
  });

  it('un producto desactivado (desaparece y su detalle da 404) se avisa una vez y se borra con DELETE', async () => {
    const llamadas = simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM, ACONDICIONADOR_ITEM), lista(ACONDICIONADOR_ITEM)),
      [rutaProducto(SHAMPOO.id)]: productoRetirado,
      [rutaQuitarDelCarrito(ID_SHAMPOO)]: borrado,
    });
    await obtenerCarritoRevisado();
    const revisado = await obtenerCarritoRevisado();
    expect(idsDe(revisado.items)).toEqual([ACONDICIONADOR_ITEM.id]);
    expect(revisado.retirados).toEqual([SHAMPOO_RETIRADO]);
    expect(llamadasDeRuta(llamadas, rutaQuitarDelCarrito(ID_SHAMPOO))).toHaveLength(1);
    expect(tomarAvisosCarrito()).toEqual([SHAMPOO_RETIRADO]);
    expect(tomarAvisosCarrito()).toEqual([]);
    // Ya no se vuelve a avisar ni a consultar.
    expect((await obtenerCarritoRevisado()).retirados).toEqual([]);
    expect(llamadasDeRuta(llamadas, rutaProducto(SHAMPOO.id))).toHaveLength(1);
  });

  it('si el DELETE falla el aviso igual se da y la lectura no lanza', async () => {
    simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM), lista()),
      [rutaProducto(SHAMPOO.id)]: productoRetirado,
      [rutaQuitarDelCarrito(ID_SHAMPOO)]: conError(ERRORES.interno),
    });
    await obtenerCarritoRevisado();
    await expect(obtenerCarritoRevisado()).resolves.toEqual({ items: [], retirados: [SHAMPOO_RETIRADO] });
    expect(tomarAvisosCarrito()).toEqual([SHAMPOO_RETIRADO]);
  });

  it('si desaparece pero su producto sigue a la venta, se quitó en otro lado: no se avisa ni se borra', async () => {
    const llamadas = simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM), lista()),
      [rutaProducto(SHAMPOO.id)]: productoActivo,
    });
    await obtenerCarritoRevisado();
    expect((await obtenerCarritoRevisado()).retirados).toEqual([]);
    await obtenerCarritoRevisado();
    expect(llamadasDeRuta(llamadas, rutaProducto(SHAMPOO.id))).toHaveLength(1);
    expect(llamadasDeRuta(llamadas, rutaQuitarDelCarrito(ID_SHAMPOO))).toHaveLength(0);
  });

  it('sin respuesta clara del producto no se afirma nada y se revisa en la siguiente lectura', async () => {
    const llamadas = simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM), lista()),
      [rutaProducto(SHAMPOO.id)]: enSecuencia(sinRedEnRuta, productoRetirado),
      [rutaQuitarDelCarrito(ID_SHAMPOO)]: borrado,
    });
    await obtenerCarritoRevisado();
    expect((await obtenerCarritoRevisado()).retirados).toEqual([]);
    expect((await obtenerCarritoRevisado()).retirados).toEqual([SHAMPOO_RETIRADO]);
    expect(llamadasDeRuta(llamadas, rutaProducto(SHAMPOO.id))).toHaveLength(2);
  });

  it('una presentación no disponible se avisa y se quita aunque sea la primera lectura', async () => {
    const apagado = itemCarritoCrudo(SHAMPOO, 1, {
      presentacion: presentacionCruda({ ...SHAMPOO.presentaciones[0], disponible: false }),
    });
    const llamadas = simular({ [RUTA_CARRITO]: lista(apagado, ACONDICIONADOR_ITEM), [rutaQuitarDelCarrito(ID_SHAMPOO)]: borrado });
    const revisado = await obtenerCarritoRevisado();
    expect(idsDe(revisado.items)).toEqual([ACONDICIONADOR_ITEM.id]);
    expect(revisado.retirados).toEqual([{ ...SHAMPOO_RETIRADO, motivo: 'presentacion' }]);
    expect(llamadasDeRuta(llamadas, rutaQuitarDelCarrito(ID_SHAMPOO))).toHaveLength(1);
  });

  it('lo que quitó la clienta no se avisa como retirado', async () => {
    const llamadas = simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM, ACONDICIONADOR_ITEM), lista(ACONDICIONADOR_ITEM)),
      [rutaQuitarDelCarrito(ID_SHAMPOO)]: borrado,
    });
    await obtenerCarritoRevisado();
    await quitarDelCarrito(ID_SHAMPOO);
    expect((await obtenerCarritoRevisado()).retirados).toEqual([]);
    expect(llamadasDeRuta(llamadas, rutaProducto(SHAMPOO.id))).toHaveLength(0);
  });

  it('con otra sesión la memoria empieza de cero (nada de la clienta anterior)', async () => {
    const llamadas = simular({ [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM), lista()) });
    await obtenerCarritoRevisado();
    nuevaGeneracion();
    expect((await obtenerCarritoRevisado()).retirados).toEqual([]);
    expect(llamadasDeRuta(llamadas, rutaProducto(SHAMPOO.id))).toHaveLength(0);
  });

  it('si la sesión cambia mientras revisa, no devuelve ni guarda nada de la anterior', async () => {
    simular({
      [RUTA_CARRITO]: enSecuencia(lista(SHAMPOO_ITEM), lista()),
      [rutaProducto(SHAMPOO.id)]: (cuerpo) => {
        nuevaGeneracion();
        return productoRetirado(cuerpo);
      },
    });
    await obtenerCarritoRevisado();
    expect(await obtenerCarritoRevisado()).toEqual({ items: [], retirados: [] });
    expect(tomarAvisosCarrito()).toEqual([]);
  });

  it('si la lectura del carrito falla, rechaza (la pantalla muestra su error)', async () => {
    simular({ [RUTA_CARRITO]: conError(ERRORES.interno) });
    expect(await errorDe(obtenerCarritoRevisado())).toBeTruthy();
  });
});
