import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BotonComprobante } from '@/shared/ui/BotonesComprobante';

import {
  listarComprobantesDeCompra,
  rutaComprobante,
  type CompraConComprobante,
  type TipoComprobante,
} from './comprobantesDeCompra';
import { useTextos } from './useTextos';

interface Lista {
  /** 'pedido:7': de qué compra es la lista (una vieja de otra compra no se muestra). */
  de: string;
  compras: CompraConComprobante[];
}

/**
 * Botones "Ver comprobante" del detalle de un pedido o de una cita (GP-09). Pide GET
 * /api/comprobantes/mios cuando hay compra (`id` no null) y otra vez cuando cambia `refresco` (por
 * ejemplo, el estado del pedido o de la cita tras pagar). Con un comprobante, un botón "Ver
 * comprobante"; con varios (anticipo y venta de una cita), uno por cada uno con su etiqueta. Cualquier
 * falla (sin red, 404, 429, 5xx) solo deja la lista vacía: nunca rompe el detalle. Cada botón abre la
 * pantalla /comprobante con el tipo y el id de su elemento; un doble toque no abre dos pantallas.
 */
export function useComprobantesDeCompra(tipo: TipoComprobante, id: number | null, refresco = ''): BotonComprobante[] {
  const router = useRouter();
  const texto = useTextos();
  const [lista, setLista] = useState<Lista>({ de: '', compras: [] });
  const navegando = useRef(false);
  const de = id === null ? '' : `${tipo}:${id}`;

  useEffect(() => {
    if (id === null) {
      return undefined;
    }
    let vigente = true;
    const clave = `${tipo}:${id}`;
    listarComprobantesDeCompra(tipo, id)
      .then((compras) => {
        if (vigente) {
          setLista({ de: clave, compras });
        }
      })
      .catch(() => {
        if (vigente) {
          setLista({ de: clave, compras: [] });
        }
      });
    return () => {
      vigente = false;
    };
  }, [tipo, id, refresco]);

  // Al volver a la pantalla (por ejemplo, desde el comprobante) se puede abrir otra vez.
  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
    }, []),
  );

  const abrir = useCallback(
    (compra: CompraConComprobante) => {
      if (navegando.current) {
        return;
      }
      navegando.current = true;
      router.push(rutaComprobante(compra.tipo, compra.id) as Href);
    },
    [router],
  );

  return useMemo(() => {
    const compras = lista.de === de ? lista.compras : [];
    const varios = compras.length > 1;
    const ayuda = texto('comprobante.app.verAyuda');
    return compras.map((compra) => ({
      clave: `${compra.tipo}-${compra.id}`,
      titulo: varios
        ? texto('comprobante.app.verEtiqueta', { etiqueta: compra.etiqueta })
        : texto('comprobante.app.ver'),
      ayuda,
      onPress: () => abrir(compra),
    }));
  }, [lista, de, texto, abrir]);
}
