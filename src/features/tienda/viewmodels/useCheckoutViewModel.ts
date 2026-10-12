import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  esSinExistencias,
  itemConProblema,
  obtenerCarrito,
  totalCarrito,
  vaciarCarrito,
  type ItemCarrito,
} from '../models/carritoModel';
import {
  buscarPedidoRecienCreado,
  crearPedido,
  mensajeCrearPedido,
  type MetodoPago,
  type Pedido,
} from '../models/pedidoModel';

import { avisarCambioCarrito } from './usePiezasCarrito';

export type PasoCheckout = 1 | 2 | 3;
export type EstadoCheckout = 'cargando' | 'listo' | 'error';

/**
 * Nombres de los pasos, en orden, para el indicador (los mismos de la web). Van en dos renglones:
 * en uno solo los tres miden más que los 320dp de contenido de una pantalla de 360dp y el
 * indicador se saldría. TalkBack lee el salto de línea como un espacio.
 */
export const PASOS_CHECKOUT = ['Recoger en\nel salón', 'Forma de\npago', 'Revisa y\nconfirma'] as const;

export interface CheckoutViewModel {
  estado: EstadoCheckout;
  recargar: () => void;
  items: ItemCarrito[];
  /** Total estimado en centavos (el final lo fija el servidor al crear el pedido). */
  total: number;
  paso: PasoCheckout;
  metodo: MetodoPago;
  elegirMetodo: (metodo: MetodoPago) => void;
  /** Pasos 1 y 2: al siguiente. */
  continuar: () => void;
  enviando: boolean;
  /** Mensaje propio del último intento de crear el pedido, o null. */
  errorEnvio: string | null;
  /** El error pide revisar el carrito (sin existencias o producto retirado). */
  revisarCarrito: boolean;
  irAlCarrito: () => void;
  confirmar: () => void;
  /** Paso anterior; en el primero sale. No hace nada mientras se envía. */
  atras: () => void;
}

/**
 * Finalizar la compra en tres pasos como la web: dónde se recoge, forma de pago y revisar y
 * confirmar (GP-06.4). Confirmar crea el pedido, quita del carrito lo enviado y pasa a la
 * confirmación; con Mercado Pago, la confirmación abre el pago (?pagar=1).
 */
export function useCheckoutViewModel(): CheckoutViewModel {
  const router = useRouter();
  const candado = useCandado();

  const [estado, setEstado] = useState<EstadoCheckout>('cargando');
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [paso, setPaso] = useState<PasoCheckout>(1);
  // Por omisión, pagar al recoger (como la web).
  const [metodo, setMetodo] = useState<MetodoPago>('pago_en_salon');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [revisarCarrito, setRevisarCarrito] = useState(false);

  const solicitud = useRef(0);
  const montada = useRef(true);

  const irAlCarrito = useCallback(() => {
    // El checkout se abre desde la pestaña Carrito: back() regresa a ella. Sin nada debajo,
    // dismissTo abre las pestañas en el Carrito en lugar de apilar otra pantalla.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo('/carrito');
    }
  }, [router]);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    setEstado('cargando');
    obtenerCarrito()
      .then((lista) => {
        if (actual !== solicitud.current) {
          return;
        }
        // Vacío o con productos por ajustar: el carrito es donde se arregla.
        if (lista.length === 0 || lista.some(itemConProblema)) {
          irAlCarrito();
          return;
        }
        setItems(lista);
        setEstado('listo');
      })
      .catch(() => {
        if (actual !== solicitud.current) {
          return;
        }
        setEstado('error');
      });
  }, [irAlCarrito]);

  useEffect(() => {
    montada.current = true;
    recargar();
    return () => {
      montada.current = false;
      solicitud.current += 1;
    };
  }, [recargar]);

  const salir = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo('/carrito');
    }
  }, [router]);

  const continuar = useCallback(() => {
    setPaso((actual) => (actual < 3 ? ((actual + 1) as PasoCheckout) : actual));
  }, []);

  const elegirMetodo = useCallback(
    (nuevo: MetodoPago) => {
      if (enviando) {
        return;
      }
      setMetodo(nuevo);
    },
    [enviando],
  );

  const atras = useCallback(() => {
    if (enviando) {
      return;
    }
    if (paso > 1) {
      setErrorEnvio(null);
      setRevisarCarrito(false);
      setPaso((paso - 1) as PasoCheckout);
    } else {
      salir();
    }
  }, [enviando, paso, salir]);

  // El botón Atrás de Android regresa un paso; la pulsación se consume siempre (también al enviar).
  const refAtras = useRef(atras);
  useEffect(() => {
    refAtras.current = atras;
  });
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refAtras.current();
        return true;
      });
      return () => suscripcion.remove();
    }, []),
  );

  const confirmar = useCallback(() => {
    if (items.length === 0) {
      return;
    }
    const enviados = items;
    const metodoElegido = metodo;
    const lineas = enviados.map((item) => ({
      productoId: item.productoId,
      presentacionId: item.presentacionId,
      cantidad: item.cantidad,
    }));
    candado(async () => {
      setEnviando(true);
      setErrorEnvio(null);
      setRevisarCarrito(false);
      const inicio = Date.now();
      try {
        let pedido: Pedido;
        try {
          pedido = await crearPedido(lineas, metodoElegido);
        } catch (error) {
          // Sin respuesta, el pedido pudo haberse creado igual: antes de dejar reintentar (y crear
          // otro con las existencias descontadas dos veces) se busca entre sus pedidos.
          // También con un 5xx: el proxy pudo cortar la respuesta después de guardar el pedido.
          const sinRespuesta =
            esErrorDeRed(error) || (error instanceof ApiError && error.status >= 500);
          const creado = sinRespuesta
            ? await buscarPedidoRecienCreado(lineas, metodoElegido, inicio)
            : null;
          if (!creado) {
            throw error;
          }
          pedido = creado;
        }
        // El backend no vacía el carrito: se quitan los ítems enviados (nunca lanza).
        await vaciarCarrito(enviados.map((item) => item.id));
        // El número de la pestaña Carrito se vuelve a leer: lo enviado ya no está.
        avisarCambioCarrito();
        if (!montada.current) {
          return;
        }
        const id = encodeURIComponent(String(pedido.id));
        // Con Mercado Pago, la confirmación abre el pago una sola vez: la lógica vive allá.
        router.replace(
          (metodoElegido === 'mercado_pago'
            ? `/pedido-confirmado/${id}?pagar=1`
            : `/pedido-confirmado/${id}`) as Href,
        );
        // enviando se queda en true: la pantalla se reemplaza sin parpadear el botón.
      } catch (error) {
        if (!montada.current) {
          return;
        }
        setErrorEnvio(mensajeCrearPedido(error));
        setRevisarCarrito(
          esSinExistencias(error) || (error instanceof ApiError && error.status === 404),
        );
        setEnviando(false);
      }
    });
  }, [items, metodo, candado, router]);

  return {
    estado,
    recargar,
    items,
    total: totalCarrito(items),
    paso,
    metodo,
    elegirMetodo,
    continuar,
    enviando,
    errorEnvio,
    revisarCarrito,
    irAlCarrito,
    confirmar,
    atras,
  };
}
