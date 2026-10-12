import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import { tienda } from '@/shared/ui/tokens';

import {
  categoriasDe,
  filtrarProductos,
  obtenerCatalogo,
  precioDesdeCentavos,
  type ProductoCatalogo,
} from '../models/productoModel';

export type EstadoCatalogoTienda = 'cargando' | 'listo' | 'error';

// ── Filtros del panel (como tienda-online/page.tsx de la web) ──────────────────────────────

/** Grupos de selección múltiple del panel de filtros (el precio va aparte, con mínimo y máximo). */
export type GrupoFiltroTienda =
  | 'descuento'
  | 'marca'
  | 'color'
  | 'acabado'
  | 'formatoLabial'
  | 'unidadesPack'
  | 'tipoPiel'
  | 'textura'
  | 'spf'
  | 'otrasCaracteristicas';

export interface FiltrosTienda {
  /** Solo dígitos; '' sin límite. */
  precioMinimo: string;
  precioMaximo: string;
  /** Opciones elegidas de cada grupo (los textos tal como se muestran). */
  opciones: Record<GrupoFiltroTienda, string[]>;
}

/** Un grupo listo para pintarse en la hoja: título, opciones y texto si no hay opciones. */
export interface GrupoFiltroVisible {
  clave: GrupoFiltroTienda;
  titulo: string;
  opciones: readonly string[];
  vacio?: string;
}

/** Opciones fijas de la web (page.tsx:23-31). */
const OPCIONES_DESCUENTO = [
  { texto: 'Con descuento', minimo: 1 },
  { texto: '10% o más', minimo: 10 },
  { texto: '20% o más', minimo: 20 },
  { texto: '30% o más', minimo: 30 },
  { texto: '50% o más', minimo: 50 },
] as const;
const OPCIONES_COLOR = [
  'Negro',
  'Blanco',
  'Rojo',
  'Rosa',
  'Nude',
  'Coral',
  'Vino',
  'Marrón',
  'Dorado',
  'Plateado',
  'Multicolor',
];
const OPCIONES_ACABADO = ['Mate', 'Satinado', 'Brillante', 'Metalizado', 'Cremoso', 'Líquido'];
const OPCIONES_FORMATO_LABIAL = ['Barra', 'Líquido', 'Lápiz', 'Gloss', 'Tint', 'Crayón'];
const OPCIONES_UNIDADES_PACK = ['1', '2', '3', '4', '6', '12', '24'];
const OPCIONES_TIPO_PIEL = ['Normal', 'Seca', 'Grasa', 'Mixta', 'Sensible', 'Madura', 'Con acné'];
const OPCIONES_TEXTURA = ['Gel', 'Crema', 'Loción', 'Sérum', 'Aceite', 'Mascarilla', 'Espuma'];
const OPCIONES_SPF = ['Sin SPF', 'SPF 15', 'SPF 30', 'SPF 50', 'SPF 50+'];

const TEXTOS_DESCUENTO = OPCIONES_DESCUENTO.map((opcion) => opcion.texto);

/** Grupos que se buscan por subcadena en nombre, descripción y características (page.tsx:163-170). */
const GRUPOS_POR_TEXTO: readonly GrupoFiltroTienda[] = [
  'color',
  'acabado',
  'formatoLabial',
  'unidadesPack',
  'tipoPiel',
  'textura',
  'spf',
];

const GRUPOS_MAQUILLAJE: readonly GrupoFiltroTienda[] = ['color', 'acabado', 'formatoLabial', 'unidadesPack'];
const GRUPOS_PIEL: readonly GrupoFiltroTienda[] = ['tipoPiel', 'textura', 'spf'];

/** Orden de los grupos en la hoja, el mismo del panel de la web (después del precio). */
const ORDEN_GRUPOS: readonly GrupoFiltroTienda[] = [
  'descuento',
  'marca',
  'color',
  'acabado',
  'formatoLabial',
  'unidadesPack',
  'tipoPiel',
  'textura',
  'spf',
  'otrasCaracteristicas',
];

function filtrosVacios(): FiltrosTienda {
  return {
    precioMinimo: '',
    precioMaximo: '',
    opciones: {
      descuento: [],
      marca: [],
      color: [],
      acabado: [],
      formatoLabial: [],
      unidadesPack: [],
      tipoPiel: [],
      textura: [],
      spf: [],
      otrasCaracteristicas: [],
    },
  };
}

/**
 * Grupos que aplican a la categoría elegida (filtrosParaCategoria, page.tsx:36-44): los comunes
 * siempre; con "maquillaje", los de maquillaje; con "piel", "skincare" o "facial", los de piel.
 */
function gruposParaCategoria(categoria: string | null): Set<GrupoFiltroTienda> {
  const grupos = new Set<GrupoFiltroTienda>(['descuento', 'marca', 'otrasCaracteristicas']);
  if (!categoria) {
    return grupos;
  }
  const c = categoria.toLowerCase();
  if (c.includes('maquillaje')) {
    GRUPOS_MAQUILLAJE.forEach((grupo) => grupos.add(grupo));
  } else if (c.includes('piel') || c.includes('skincare') || c.includes('facial')) {
    GRUPOS_PIEL.forEach((grupo) => grupos.add(grupo));
  }
  return grupos;
}

/** Filtros que cuentan: el precio (uno si tiene mínimo o máximo) y cada opción de un grupo visible. */
function contarActivos(filtros: FiltrosTienda, visibles: Set<GrupoFiltroTienda>): number {
  const precio = filtros.precioMinimo !== '' || filtros.precioMaximo !== '' ? 1 : 0;
  return [...visibles].reduce((total, grupo) => total + filtros.opciones[grupo].length, precio);
}

/**
 * El producto cumple el panel de filtros, con la lógica de la web (page.tsx:155-172): "y" entre
 * grupos y "o" dentro de un grupo; un grupo sin opciones o que no aplica a la categoría no filtra.
 * Un producto sin precio vale 0: no pasa un mínimo, pero sí un máximo.
 */
function cumpleFiltros(
  producto: ProductoCatalogo,
  filtros: FiltrosTienda,
  visibles: Set<GrupoFiltroTienda>,
): boolean {
  const precio = precioDesdeCentavos(producto) / 100;
  const minimo = filtros.precioMinimo !== '' ? Number(filtros.precioMinimo) : null;
  const maximo = filtros.precioMaximo !== '' ? Number(filtros.precioMaximo) : null;
  if ((minimo !== null && precio < minimo) || (maximo !== null && precio > maximo)) {
    return false;
  }

  const { opciones } = filtros;
  if (visibles.has('descuento') && opciones.descuento.length > 0) {
    const minimos = OPCIONES_DESCUENTO.filter((o) => opciones.descuento.includes(o.texto)).map(
      (o) => o.minimo,
    );
    if (!minimos.some((m) => producto.descuento >= m)) {
      return false;
    }
  }
  if (visibles.has('marca') && opciones.marca.length > 0) {
    if (!producto.marca || !opciones.marca.includes(producto.marca)) {
      return false;
    }
  }
  if (visibles.has('otrasCaracteristicas') && opciones.otrasCaracteristicas.length > 0) {
    if (!opciones.otrasCaracteristicas.some((c) => producto.caracteristicas.includes(c))) {
      return false;
    }
  }

  const textoProducto = [producto.nombre, producto.descripcion, ...producto.caracteristicas]
    .join(' ')
    .toLowerCase();
  return GRUPOS_POR_TEXTO.every(
    (grupo) =>
      !visibles.has(grupo) ||
      opciones[grupo].length === 0 ||
      opciones[grupo].some((opcion) => textoProducto.includes(opcion.toLowerCase())),
  );
}

// ── Viewmodel ──────────────────────────────────────────────────────────────────────────────

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
  /** Quita la búsqueda, la categoría y los filtros del panel ("Ver todos"). */
  limpiarFiltros: () => void;
  categorias: string[];
  /** Todos los productos que cumplen búsqueda, categoría y filtros. */
  productosVisibles: ProductoCatalogo[];
  /** Solo los de la página actual (tienda.porPagina por página). */
  productosPagina: ProductoCatalogo[];
  /** Página actual, desde 1, y total de páginas (al menos 1). */
  pagina: number;
  totalPaginas: number;
  /** "Mostrando 17 a 32 de 120 productos" para el pie de la lista. */
  textoRango: string;
  paginaAnterior: () => void;
  paginaSiguiente: () => void;
  /** El catálogo trae al menos un producto (sin contar filtros). */
  hayProductos: boolean;
  abrirProducto: (id: number) => void;

  /** Filtros del panel aplicados que cuentan con la categoría actual (contador del botón). */
  filtrosActivos: number;
  /** Hoja de filtros abierta. */
  hojaFiltros: boolean;
  /** Abre la hoja con un borrador igual a los filtros aplicados. */
  abrirFiltros: () => void;
  /** Cierra sin aplicar: el borrador se descarta. */
  cerrarFiltros: () => void;
  /** Lo que se edita en la hoja; solo cuenta al tocar "Aplicar". */
  borrador: FiltrosTienda;
  /** Filtros elegidos en el borrador (con 0, "Limpiar filtros" se deshabilita). */
  borradorActivos: number;
  /** Grupos de la hoja para la categoría actual, en el orden de la web. */
  gruposFiltro: GrupoFiltroVisible[];
  setPrecioMinimo: (valor: string) => void;
  setPrecioMaximo: (valor: string) => void;
  alternarOpcion: (grupo: GrupoFiltroTienda, opcion: string) => void;
  /**
   * Vacía todos los grupos (también los que no aplican a la categoría, como la web), los aplica al
   * instante y cierra la hoja: igual que "Limpiar filtros" en Servicios.
   */
  limpiarBorrador: () => void;
  /** Aplica el borrador y cierra la hoja. */
  aplicarFiltros: () => void;
}

function esFallaDeRed(error: unknown): boolean {
  return esErrorDeRed(error) || (error instanceof ApiError && error.status === 0);
}

/** Pestaña Tienda (GP-06.4): catálogo público con búsqueda, categorías y panel de filtros. */
export function useCatalogoViewModel(): CatalogoViewModel {
  const router = useRouter();

  const [estado, setEstado] = useState<EstadoCatalogoTienda>('cargando');
  const [errorRed, setErrorRed] = useState(false);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [refrescando, setRefrescando] = useState(false);
  const [errorRefresco, setErrorRefresco] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosTienda>(filtrosVacios);
  const [borrador, setBorrador] = useState<FiltrosTienda>(filtrosVacios);
  const [hojaFiltros, setHojaFiltros] = useState(false);
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

  const categorias = useMemo(() => categoriasDe(productos), [productos]);

  // Marcas y características de los datos cargados, sin repetir y en el orden en que llegan
  // (page.tsx:137-143).
  const marcas = useMemo(
    () => [...new Set(productos.map((producto) => producto.marca).filter(Boolean))],
    [productos],
  );
  const caracteristicas = useMemo(
    () => [...new Set(productos.flatMap((producto) => producto.caracteristicas))],
    [productos],
  );

  // Si al cambiar de categoría desaparece un grupo, sus opciones se conservan pero dejan de contar.
  const visibles = useMemo(() => gruposParaCategoria(categoria), [categoria]);

  const gruposFiltro = useMemo<GrupoFiltroVisible[]>(() => {
    const definiciones: Record<GrupoFiltroTienda, Omit<GrupoFiltroVisible, 'clave'>> = {
      descuento: { titulo: 'Descuentos', opciones: TEXTOS_DESCUENTO },
      marca: { titulo: 'Marca', opciones: marcas, vacio: 'Sin marcas en catálogo' },
      color: { titulo: 'Color', opciones: OPCIONES_COLOR },
      acabado: { titulo: 'Acabado', opciones: OPCIONES_ACABADO },
      formatoLabial: { titulo: 'Formato de labial', opciones: OPCIONES_FORMATO_LABIAL },
      unidadesPack: { titulo: 'Unidades por pack', opciones: OPCIONES_UNIDADES_PACK },
      tipoPiel: { titulo: 'Tipo de piel', opciones: OPCIONES_TIPO_PIEL },
      textura: { titulo: 'Textura', opciones: OPCIONES_TEXTURA },
      spf: { titulo: 'Protección solar (SPF)', opciones: OPCIONES_SPF },
      otrasCaracteristicas: {
        titulo: 'Otras características',
        opciones: caracteristicas,
        vacio: 'Sin características en catálogo',
      },
    };
    return ORDEN_GRUPOS.filter((grupo) => visibles.has(grupo)).map((clave) => ({
      clave,
      ...definiciones[clave],
    }));
  }, [marcas, caracteristicas, visibles]);

  const productosVisibles = useMemo(
    () =>
      filtrarProductos(productos, busqueda, categoria).filter((producto) =>
        cumpleFiltros(producto, filtros, visibles),
      ),
    [productos, busqueda, categoria, filtros, visibles],
  );

  // Paginación sobre la lista ya filtrada: al cambiar búsqueda, categoría o filtros vuelve a la 1.
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    setPagina(1);
  }, [busqueda, categoria, filtros]);
  const totalPaginas = Math.max(1, Math.ceil(productosVisibles.length / tienda.porPagina));
  // Si el catálogo se acorta al refrescar, la página no queda fuera de rango.
  const paginaActual = Math.min(pagina, totalPaginas);
  const productosPagina = useMemo(
    () =>
      productosVisibles.slice((paginaActual - 1) * tienda.porPagina, paginaActual * tienda.porPagina),
    [productosVisibles, paginaActual],
  );
  const desde = productosVisibles.length === 0 ? 0 : (paginaActual - 1) * tienda.porPagina + 1;
  const hasta = Math.min(paginaActual * tienda.porPagina, productosVisibles.length);
  const textoRango = `Mostrando ${desde} a ${hasta} de ${productosVisibles.length} productos`;
  const paginaAnterior = useCallback(() => setPagina((actual) => Math.max(1, actual - 1)), []);
  const paginaSiguiente = useCallback(
    () => setPagina((actual) => Math.min(totalPaginas, actual + 1)),
    [totalPaginas],
  );

  const filtrosActivos = useMemo(() => contarActivos(filtros, visibles), [filtros, visibles]);
  const borradorActivos = useMemo(() => contarActivos(borrador, visibles), [borrador, visibles]);

  const limpiarFiltros = useCallback(() => {
    setBusqueda('');
    setCategoria(null);
    setFiltros(filtrosVacios());
  }, []);

  const abrirFiltros = useCallback(() => {
    setBorrador(filtros);
    setHojaFiltros(true);
  }, [filtros]);

  const cerrarFiltros = useCallback(() => setHojaFiltros(false), []);

  const setPrecioMinimo = useCallback(
    (valor: string) => setBorrador((actual) => ({ ...actual, precioMinimo: valor })),
    [],
  );
  const setPrecioMaximo = useCallback(
    (valor: string) => setBorrador((actual) => ({ ...actual, precioMaximo: valor })),
    [],
  );

  const alternarOpcion = useCallback((grupo: GrupoFiltroTienda, opcion: string) => {
    setBorrador((actual) => {
      const elegidas = actual.opciones[grupo];
      const nuevas = elegidas.includes(opcion)
        ? elegidas.filter((o) => o !== opcion)
        : [...elegidas, opcion];
      return { ...actual, opciones: { ...actual.opciones, [grupo]: nuevas } };
    });
  }, []);

  // Como en la web y en Servicios: limpiar quita los filtros al instante y cierra la hoja.
  const limpiarBorrador = useCallback(() => {
    setBorrador(filtrosVacios());
    setFiltros(filtrosVacios());
    setHojaFiltros(false);
  }, []);

  const aplicarFiltros = useCallback(() => {
    setFiltros(borrador);
    setHojaFiltros(false);
  }, [borrador]);

  const abrirProducto = useCallback(
    (id: number) => {
      router.push(`/producto/${id}` as Href);
    },
    [router],
  );

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
    productosPagina,
    pagina: paginaActual,
    totalPaginas,
    textoRango,
    paginaAnterior,
    paginaSiguiente,
    hayProductos: productos.length > 0,
    abrirProducto,
    filtrosActivos,
    hojaFiltros,
    abrirFiltros,
    cerrarFiltros,
    borrador,
    borradorActivos,
    gruposFiltro,
    setPrecioMinimo,
    setPrecioMaximo,
    alternarOpcion,
    limpiarBorrador,
    aplicarFiltros,
  };
}
