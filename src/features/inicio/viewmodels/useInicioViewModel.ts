import { useCallback, useEffect, useRef, useState } from 'react';

import { fotosDeServicios, type FotoGaleria } from '../models/FotoModel';
import { seleccionarFluidos, type FluidoHero } from '../models/FluidoModel';
import { obtenerProductos, obtenerServicios } from '../models/inicioService';

export type EstadoInicio = 'cargando' | 'listo' | 'error';

export interface InicioViewModel {
  estado: EstadoInicio;
  fluidos: FluidoHero[];
  fotos: FotoGaleria[];
  recargar: () => void;
}

/** Lecturas públicas del inicio: nombre y precio de los fluidos del hero y fotos de la galería. */
export function useInicioViewModel(): InicioViewModel {
  const [estado, setEstado] = useState<EstadoInicio>('cargando');
  const [fluidos, setFluidos] = useState<FluidoHero[]>(() => seleccionarFluidos([]));
  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado('cargando');
    Promise.all([obtenerProductos(), obtenerServicios()])
      .then(([productos, servicios]) => {
        if (id !== solicitud.current) {
          return;
        }
        setFluidos(seleccionarFluidos(productos));
        setFotos(fotosDeServicios(servicios));
        setEstado('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstado('error');
        }
      });
  }, []);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  return { estado, fluidos, fotos, recargar };
}
