import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';

import {
  actualizarCantidad,
  itemConProblema,
  mensajeErrorCarrito,
  obtenerCarrito,
  quitarDelCarrito,
  totalCarrito,
  type ItemCarrito,
} from '../models/carritoModel';

export type EstadoCarrito = 'cargando' | 'listo' | 'error';

export interface CarritoViewModel {
  /** La clienta tiene sesión (sin ella se muestra la invitación). */
  conSesion: boolean;
  /** La sesión todavía se está leyendo. */
  sesionCargando: boolean;
  estado: EstadoCarrito;
  items: ItemCarrito[];
  /** Total en centavos con los precios actuales. */
  total: number;
  /** Algún producto ya no está disponible o pide más piezas de las que hay. */
  hayProblemas: boolean;
  /** Ids de los ítems con una operación en curso (cada fila, una a la vez). */
  ocupados: ReadonlySet<number>;
  /** Mensaje del último error de cada fila. */
  errores: Readonly<Record<number, string>>;
  recargar: () => void;
  cambiarCantidad: (item: ItemCarrito, cantidad: number) => void;
  /** Ítem que espera confirmación para quitarse (hoja abierta), o null. */
  porQuitar: ItemCarrito | null;
  pedirQuitar: (item: ItemCarrito) => void;
  cancelarQuitar: () => void;
  confirmarQuitar: () => void;
  quitando: boolean;
  regresar: () => void;
  verTienda: () => void;
  continuar: () => void;
}

/**
 * Carrito de la clienta (GP-06.4): se lee al enfocar la pantalla (la primera vez con skeleton, las
 * demás en silencio), cambia cantidades con respuesta inmediata y regresa al valor anterior si el
 * servidor no la acepta, y quita productos con confirmación.
 */
export function useCarritoViewModel(): CarritoViewModel {
  const router = useRouter();
  const { estado: estadoSesion } = useAuth();
  const conSesion = estadoSesion === 'autenticado';

  const [estado, setEstado] = useState<EstadoCarrito>('cargando');
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [ocupados, setOcupados] = useState<ReadonlySet<number>>(() => new Set());
  const [errores, setErrores] = useState<Readonly<Record<number, string>>>({});
  const [porQuitar, setPorQuitar] = useState<ItemCarrito | null>(null);
  const [quitando, setQuitando] = useState(false);

  // Solo la última lectura escribe la lista (reenfoques rápidos o pantalla desmontada).
  const solicitud = useRef(0);
  const montada = useRef(true);
  // Copia inmediata de las filas ocupadas: el estado llega un render tarde para el doble toque.
  const ocupadosRef = useRef(new Set<number>());
  // La primera lectura muestra skeleton; las siguientes conservan la lista mientras llegan.
  const yaCargo = useRef(false);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      solicitud.current += 1;
    };
  }, []);

  const marcar = useCallback((id: number, ocupado: boolean) => {
    if (ocupado) {
      ocupadosRef.current.add(id);
    } else {
      ocupadosRef.current.delete(id);
    }
    if (montada.current) {
      setOcupados(new Set(ocupadosRef.current));
    }
  }, []);

  const ponerError = useCallback((id: number, mensaje: string | null) => {
    setErrores((actuales) => {
      if (mensaje === null) {
        if (!(id in actuales)) {
          return actuales;
        }
        const siguientes = { ...actuales };
        delete siguientes[id];
        return siguientes;
      }
      return { ...actuales, [id]: mensaje };
    });
  }, []);

  const cargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    if (!yaCargo.current) {
      setEstado('cargando');
    }
    obtenerCarrito()
      .then((lista) => {
        if (actual !== solicitud.current) {
          return;
        }
        // Una fila que se está guardando conserva el valor que la clienta ya ve.
        setItems((previos) =>
          lista.map((item) => {
            if (!ocupadosRef.current.has(item.id)) {
              return item;
            }
            return previos.find((previo) => previo.id === item.id) ?? item;
          }),
        );
        yaCargo.current = true;
        setEstado('listo');
      })
      .catch(() => {
        if (actual !== solicitud.current) {
          return;
        }
        // Con una lista ya mostrada, un reenfoque fallido no la borra.
        if (!yaCargo.current) {
          setEstado('error');
        }
      });
  }, []);

  const recargar = useCallback(() => {
    yaCargo.current = false;
    cargar();
  }, [cargar]);

  useFocusEffect(
    useCallback(() => {
      if (conSesion) {
        cargar();
      }
      return () => {
        solicitud.current += 1;
      };
    }, [conSesion, cargar]),
  );

  const cambiarCantidad = useCallback(
    (item: ItemCarrito, cantidad: number) => {
      if (ocupadosRef.current.has(item.id) || cantidad === item.cantidad || cantidad < 1) {
        return;
      }
      const anterior = item.cantidad;
      // Una lectura del carrito que ya iba en camino traería la cantidad vieja: se descarta.
      solicitud.current += 1;
      marcar(item.id, true);
      ponerError(item.id, null);
      // El valor nuevo se ve de inmediato; si el servidor no lo acepta, regresa.
      setItems((lista) => lista.map((fila) => (fila.id === item.id ? { ...fila, cantidad } : fila)));
      actualizarCantidad(item.id, cantidad)
        .catch((error: unknown) => {
          if (!montada.current) {
            return;
          }
          setItems((lista) =>
            lista.map((fila) => (fila.id === item.id ? { ...fila, cantidad: anterior } : fila)),
          );
          ponerError(item.id, mensajeErrorCarrito(error));
        })
        .finally(() => {
          marcar(item.id, false);
        });
    },
    [marcar, ponerError],
  );

  const pedirQuitar = useCallback((item: ItemCarrito) => {
    if (ocupadosRef.current.has(item.id)) {
      return;
    }
    setPorQuitar(item);
  }, []);

  const cancelarQuitar = useCallback(() => {
    if (!quitando) {
      setPorQuitar(null);
    }
  }, [quitando]);

  const confirmarQuitar = useCallback(() => {
    const item = porQuitar;
    if (!item || ocupadosRef.current.has(item.id)) {
      return;
    }
    // Una lectura que ya iba en camino haría reaparecer el producto: se descarta.
    solicitud.current += 1;
    marcar(item.id, true);
    ponerError(item.id, null);
    setQuitando(true);
    quitarDelCarrito(item.id)
      .then(() => {
        if (montada.current) {
          setItems((lista) => lista.filter((fila) => fila.id !== item.id));
        }
      })
      .catch((error: unknown) => {
        if (!montada.current) {
          return;
        }
        // 404: ya no estaba en el carrito; se quita de la lista igual.
        if (error instanceof ApiError && error.status === 404) {
          setItems((lista) => lista.filter((fila) => fila.id !== item.id));
          return;
        }
        ponerError(item.id, mensajeErrorCarrito(error));
      })
      .finally(() => {
        marcar(item.id, false);
        if (montada.current) {
          setQuitando(false);
          setPorQuitar(null);
        }
      });
  }, [porQuitar, marcar, ponerError]);

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/tienda');
    }
  }, [router]);

  const verTienda = useCallback(() => {
    // dismissTo regresa a las pestañas que ya están abajo; navigate apilaría otra copia.
    router.dismissTo('/tienda');
  }, [router]);

  const hayProblemas = items.some(itemConProblema);

  const continuar = useCallback(() => {
    if (items.length === 0 || hayProblemas || ocupadosRef.current.size > 0) {
      return;
    }
    router.push('/checkout');
  }, [router, items.length, hayProblemas]);

  return {
    conSesion,
    sesionCargando: estadoSesion === 'cargando',
    estado,
    items,
    total: totalCarrito(items),
    hayProblemas,
    ocupados,
    errores,
    recargar,
    cambiarCantidad,
    porQuitar,
    pedirQuitar,
    cancelarQuitar,
    confirmarQuitar,
    quitando,
    regresar,
    verTienda,
    continuar,
  };
}
