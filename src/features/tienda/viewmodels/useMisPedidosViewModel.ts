import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { mensajeComunTienda } from '../models/carritoModel';
import { listarMisPedidos, type Pedido } from '../models/pedidoModel';

// La vista no importa de models/: recibe este tipo del viewmodel.
export type { Pedido } from '../models/pedidoModel';

export type EstadoMisPedidos = 'cargando' | 'listo' | 'error';

export interface MisPedidosViewModel {
  /** 'cargando' solo en la primera carga (o al reintentar sin datos): con datos, recarga en silencio. */
  estado: EstadoMisPedidos;
  /** Del más reciente al más viejo. */
  pedidos: Pedido[];
  /** Mensaje para la clienta con estado 'error' (sin red, sesión terminada o genérico). */
  mensajeError: string | null;
  /** Falló un pull to refresh con la lista ya cargada: la lista se conserva y se avisa aquí. */
  avisoRefresco: string | null;
  refrescando: boolean;
  /** Reintentar tras un error: muestra el skeleton si aún no hay pedidos. */
  recargar: () => void;
  /** Pull to refresh: conserva la lista mientras carga. */
  refrescar: () => void;
  /** Abre el detalle del pedido. Referencia estable para las tarjetas memoizadas. */
  abrirPedido: (id: number) => void;
  /** Vuelve a la tienda (acción del estado vacío). */
  verTienda: () => void;
}

type ModoCarga = 'completo' | 'silencioso' | 'refresco';

const MENSAJE_GENERICO = 'Algo salió mal al traer tus pedidos. Intenta de nuevo en un momento.';
const MENSAJE_REFRESCO = 'No pudimos actualizar tus pedidos. Desliza hacia abajo para intentar de nuevo.';

/**
 * Mis pedidos (GP-06.4): compras de la clienta en sesión. Carga al enfocar la pantalla (la primera
 * vez con skeleton; después en silencio, por si volvió de pagar o de cancelar) y solo con sesión.
 */
export function useMisPedidosViewModel(): MisPedidosViewModel {
  const router = useRouter();
  const { estado: sesion } = useAuth();
  const [estado, setEstado] = useState<EstadoMisPedidos>('cargando');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [avisoRefresco, setAvisoRefresco] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  // Solo la última solicitud escribe el estado y nada se escribe con la pantalla desmontada.
  const solicitud = useRef(0);
  // Ya hay una lista mostrada: las recargas siguientes no vuelven al skeleton.
  const hayDatos = useRef(false);
  // Un doble toque no abre dos detalles; se libera al volver a enfocar.
  const navegando = useRef(false);

  const cargar = useCallback((modo: ModoCarga) => {
    solicitud.current += 1;
    const id = solicitud.current;
    if (modo === 'refresco') {
      setRefrescando(true);
    }
    if (modo === 'completo' && !hayDatos.current) {
      setEstado('cargando');
      setMensajeError(null);
    }
    listarMisPedidos()
      .then((lista) => {
        if (id !== solicitud.current) {
          return;
        }
        hayDatos.current = true;
        setPedidos(lista);
        setMensajeError(null);
        setAvisoRefresco(null);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (id !== solicitud.current) {
          return;
        }
        if (hayDatos.current) {
          // Con la lista ya mostrada, una recarga silenciosa que falla no la quita.
          if (modo === 'refresco') {
            setAvisoRefresco(mensajeComunTienda(error) ?? MENSAJE_REFRESCO);
          }
          return;
        }
        setMensajeError(mensajeComunTienda(error) ?? MENSAJE_GENERICO);
        setEstado('error');
      })
      .finally(() => {
        if (id === solicitud.current) {
          setRefrescando(false);
        }
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
      if (sesion !== 'autenticado') {
        // Sin sesión se descarta lo cargado y cualquier respuesta pendiente.
        solicitud.current += 1;
        hayDatos.current = false;
        setPedidos([]);
        setMensajeError(null);
        setAvisoRefresco(null);
        setRefrescando(false);
        setEstado('cargando');
        return;
      }
      cargar(hayDatos.current ? 'silencioso' : 'completo');
    }, [sesion, cargar]),
  );

  useEffect(
    () => () => {
      solicitud.current += 1;
    },
    [],
  );

  const recargar = useCallback(() => {
    if (sesion === 'autenticado') {
      cargar('completo');
    }
  }, [sesion, cargar]);

  const refrescar = useCallback(() => {
    if (sesion === 'autenticado') {
      cargar('refresco');
    }
  }, [sesion, cargar]);

  const abrirPedido = useCallback(
    (id: number) => {
      if (navegando.current) {
        return;
      }
      navegando.current = true;
      router.push(`/pedido/${encodeURIComponent(String(id))}` as Href);
    },
    [router],
  );

  const verTienda = useCallback(() => {
    router.dismissTo('/tienda' as Href);
  }, [router]);

  return {
    estado,
    pedidos,
    mensajeError,
    avisoRefresco,
    refrescando,
    recargar,
    refrescar,
    abrirPedido,
    verTienda,
  };
}
