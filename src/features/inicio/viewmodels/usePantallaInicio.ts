import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { tituloBotonGoji, type DestinoPromocion } from '../models/contenidoInicioModel';
import { useContenidoInicio, type ContenidoInicioViewModel } from './useContenidoInicio';
import { useInicioViewModel, type InicioViewModel } from './useInicioViewModel';

export interface PantallaInicioViewModel {
  /** Catálogos: hero, carrusel de productos y carrusel de servicios. */
  catalogos: InicioViewModel;
  /** Configuración, textos y contenido administrable (galería, promociones, equipo, preguntas...). */
  contenido: ContenidoInicioViewModel;
  /** "Ver {nombre del Fluido Di Goji}" o, sin catálogo, "Ver Fluido Di Goji". */
  tituloBotonGoji: string;
  /** Indicador del deslizar para actualizar. */
  refrescando: boolean;
  /**
   * Deslizar para actualizar: pide a la vez la configuración, las cuatro listas de contenido y los
   * dos catálogos; el indicador se apaga cuando terminan todas.
   */
  refrescar: () => void;
  abrirPromocion: (destino: DestinoPromocion) => void;
  /** "Conoce el salón": abre la pantalla El salón. */
  abrirSalon: () => void;
  /** Botón del cierre: la pestaña Servicios (su ruta es /citas). */
  reservar: () => void;
}

/**
 * Viewmodel de la pantalla de Inicio: junta los catálogos (useInicioViewModel) con el contenido de
 * la configuración y de Admin > Contenido (useContenidoInicio), y resuelve el deslizar para
 * actualizar y la navegación de las secciones de contenido.
 */
export function usePantallaInicio(): PantallaInicioViewModel {
  const catalogos = useInicioViewModel();
  const contenido = useContenidoInicio();
  const { push, navigate } = useRouter();
  const [refrescando, setRefrescando] = useState(false);
  // Sin cambiar estado si la pantalla ya se desmontó cuando termina el refresco.
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  const refrescarCatalogos = catalogos.refrescar;
  const refrescarContenido = contenido.refrescar;
  const refrescar = useCallback(() => {
    setRefrescando(true);
    // Ninguna de las dos rechaza: el indicador siempre se apaga.
    void Promise.all([refrescarContenido(), refrescarCatalogos()]).then(() => {
      if (montada.current) {
        setRefrescando(false);
      }
    });
  }, [refrescarCatalogos, refrescarContenido]);

  const abrirPromocion = useCallback(
    (destino: DestinoPromocion) => {
      if (destino.tipo === 'ruta') {
        push(destino.ruta as Href);
        return;
      }
      Linking.openURL(destino.url).catch(() => {
        // Sin una app que abra el enlace no hay nada más que hacer aquí.
      });
    },
    [push],
  );

  const abrirSalon = useCallback(() => push('/salon' as Href), [push]);
  const reservar = useCallback(() => navigate('/citas'), [navigate]);
  const goji = catalogos.fluidos.find((fluido) => fluido.clave === 'goji');

  return {
    catalogos,
    contenido,
    tituloBotonGoji: tituloBotonGoji(goji?.nombre),
    refrescando,
    refrescar,
    abrirPromocion,
    abrirSalon,
    reservar,
  };
}
