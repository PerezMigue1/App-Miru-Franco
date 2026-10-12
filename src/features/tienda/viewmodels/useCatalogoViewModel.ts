import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';

import { obtenerCarrito, piezasCarrito } from '../models/carritoModel';
import {
  categoriasDe,
  filtrarProductos,
  obtenerCatalogo,
  type ProductoCatalogo,
} from '../models/productoModel';

export type EstadoCatalogoTienda = 'cargando' | 'listo' | 'error';

export interface CatalogoViewModel {
  estado: EstadoCatalogoTienda;
  /** El último error fue de red (sin conexión): cambia el mensaje del estado de error. */
  errorRed: boolean;
  /** Vuelve a cargar desde cero (botón Reintentar). */
  recargar: () => void;
  /** Deslizar hacia abajo: recarga sin quitar la lista que ya se ve. */
  refrescar: () => void;
  refrescando: boolean;
  /** El último deslizar para actualizar falló; la lista anterior sigue a la vista. */
  errorRefresco: boolean;
  busqueda: string;
  setBusqueda: (texto: string) => void;
  /** Categoría elegida; null es "Todas". */
  categoria: string | null;
  setCategoria: (categoria: string | null) => void;
  /** Quita la búsqueda y la categoría ("Ver todos"). */
  limpiarFiltros: () => void;
  categorias: string[];
  productosVisibles: ProductoCatalogo[];
  /** El catálogo trae al menos un producto (sin contar filtros). */
  hayProductos: boolean;
  /** Piezas en el carrito; null sin sesión, si no se pudo leer o mientras no se conoce. */
  piezas: number | null;
  abrirProducto: (id: number) => void;
  abrirCarrito: () => void;
}

function esFallaDeRed(error: unknown): boolean {
  return esErrorDeRed(error) || (error instanceof ApiError && error.status === 0);
}

/** Pestaña Tienda (GP-06.4): catálogo público con búsqueda, categorías y acceso al carrito. */
export function useCatalogoViewModel(): CatalogoViewModel {
  const router = useRouter();
  const { estado: estadoSesion } = useAuth();
  const sesion = estadoSesion === 'autenticado';

  const [estado, setEstado] = useState<EstadoCatalogoTienda>('cargando');
  const [errorRed, setErrorRed] = useState(false);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [refrescando, setRefrescando] = useState(false);
  const [errorRefresco, setErrorRefresco] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [piezas, setPiezas] = useState<number | null>(null);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  const cargar = useCallback((modo: 'inicial' | 'refresco') => {
    solicitud.current += 1;
    const id = solicitud.current;
    if (modo === 'inicial') {
      setEstado('cargando');
    } else {
      setRefrescando(true);
    }
    obtenerCatalogo()
      .then((lista) => {
        if (id !== solicitud.current) {
          return;
        }
        setProductos(lista);
        setErrorRefresco(false);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (id !== solicitud.current) {
          return;
        }
        if (modo === 'refresco') {
          // La lista que ya se veía se queda; solo se avisa que no se actualizó.
          setErrorRefresco(true);
          return;
        }
        setErrorRed(esFallaDeRed(error));
        setEstado('error');
      })
      .finally(() => {
        if (id === solicitud.current) {
          setRefrescando(false);
        }
      });
  }, []);

  const recargar = useCallback(() => cargar('inicial'), [cargar]);
  const refrescar = useCallback(() => cargar('refresco'), [cargar]);

  useEffect(() => {
    cargar('inicial');
    return () => {
      solicitud.current += 1;
    };
  }, [cargar]);

  // Piezas del carrito: se leen cada vez que la Tienda vuelve a la vista, solo con sesión. Si la
  // lectura falla no se muestra número (el acceso al carrito sigue funcionando).
  useFocusEffect(
    useCallback(() => {
      if (!sesion) {
        setPiezas(null);
        return undefined;
      }
      let vigente = true;
      obtenerCarrito()
        .then((items) => {
          if (vigente) {
            setPiezas(piezasCarrito(items));
          }
        })
        .catch(() => {
          if (vigente) {
            setPiezas(null);
          }
        });
      return () => {
        vigente = false;
      };
    }, [sesion]),
  );

  const categorias = useMemo(() => categoriasDe(productos), [productos]);

  const productosVisibles = useMemo(
    () => filtrarProductos(productos, busqueda, categoria),
    [productos, busqueda, categoria],
  );

  const limpiarFiltros = useCallback(() => {
    setBusqueda('');
    setCategoria(null);
  }, []);

  const abrirProducto = useCallback(
    (id: number) => {
      router.push(`/producto/${id}` as Href);
    },
    [router],
  );

  const abrirCarrito = useCallback(() => {
    router.push('/carrito' as Href);
  }, [router]);

  return {
    estado,
    errorRed,
    recargar,
    refrescar,
    refrescando,
    errorRefresco,
    busqueda,
    setBusqueda,
    categoria,
    setCategoria,
    limpiarFiltros,
    categorias,
    productosVisibles,
    hayProductos: productos.length > 0,
    piezas: sesion ? piezas : null,
    abrirProducto,
    abrirCarrito,
  };
}
