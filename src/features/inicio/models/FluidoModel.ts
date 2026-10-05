import { colorFluido } from '@/shared/ui/tokens';

import type { Producto } from './inicioService';

export type ClaveFluido = 'goji' | 'argan' | 'platino' | 'hialuronico';

/**
 * Capa de un frasco en la composición del hero: left, bottom y height en % de la caja, zIndex,
 * profundidad (cuánto sigue al giroscopio) y giro en grados.
 */
export interface CapaFluido {
  left: number;
  bottom: number;
  height: number;
  zIndex: number;
  profundidad: number;
  giro: number;
}

export interface FluidoHero {
  id: number;
  clave: ClaveFluido;
  color: string;
  capa: CapaFluido;
  /** Nombre y precio salen del catálogo; si el API no los trae quedan vacíos, nunca inventados. */
  nombre: string | null;
  precio: string | null;
}

/** Los cuatro fluidos AVYNA del hero: id real del catálogo y render propio de la marca. */
const FLUIDOS: { id: number; clave: ClaveFluido }[] = [
  { id: 34, clave: 'goji' },
  { id: 33, clave: 'argan' },
  { id: 35, clave: 'platino' },
  { id: 36, clave: 'hialuronico' },
];

export const CAPAS: Record<ClaveFluido, CapaFluido> = {
  hialuronico: { left: 76, bottom: 26, height: 56, zIndex: 1, profundidad: 0.35, giro: 3 },
  argan: { left: 6, bottom: 15, height: 67, zIndex: 2, profundidad: 0.55, giro: -3 },
  platino: { left: 60, bottom: 9, height: 71, zIndex: 3, profundidad: 0.7, giro: 2.5 },
  goji: { left: 33, bottom: 2, height: 86, zIndex: 4, profundidad: 1, giro: -1.5 },
};

/** De atrás hacia adelante. */
export const ORDEN_CAPAS: ClaveFluido[] = ['hialuronico', 'argan', 'platino', 'goji'];

const formatoEntero = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const formatoDecimal = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$1,200" listo para mostrar, o null si no hay un precio real (vacío, no numérico o 0). */
export function precioParaMostrar(valor: string): string | null {
  const limpio = valor.split('$').join('').split(',').join('').trim();
  if (!limpio) {
    return null;
  }
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero <= 0) {
    return null;
  }
  return (Number.isInteger(numero) ? formatoEntero : formatoDecimal).format(numero);
}

/** Cruza los fluidos del hero con el catálogo real. Sin catálogo, nombre y precio quedan vacíos. */
export function seleccionarFluidos(productos: Producto[]): FluidoHero[] {
  return FLUIDOS.map(({ id, clave }) => {
    const producto = productos.find((p) => String(p.id) === String(id));
    return {
      id,
      clave,
      color: colorFluido[clave],
      capa: CAPAS[clave],
      nombre: producto?.nombre ? producto.nombre : null,
      precio: producto ? precioParaMostrar(producto.precio) : null,
    };
  });
}
