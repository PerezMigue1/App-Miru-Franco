import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AccionesCabecera } from './AccionesCabecera';
import { CabeceraCompacta, TituloPagina } from './CabeceraCompacta';

interface ScreenHeaderProps {
  titulo: string;
  /** Línea opcional bajo el título, como el subtítulo de PageHeader en la web. */
  subtitulo?: string;
  /**
   * Acción extra a la derecha, antes de la campana y la foto. Va sobre el cromo carbón: su texto o
   * ícono debe usar colores.textoSobrePanel y su presionado colores.presionadoCromo (por ejemplo,
   * BotonCromo).
   */
  accion?: ReactNode;
  /**
   * La vista pinta el título dentro de su lista (TituloPagina) para que se desplace con el contenido;
   * aquí solo va la cabecera. Útil cuando la pantalla tiene además un pie fijo (Carrito).
   */
  tituloEnContenido?: boolean;
}

/**
 * Encabezado de las pantallas de pestaña: la cabecera compacta carbón con el logotipo y, a la
 * derecha, la campana y la foto de la clienta (la misma de Inicio, así nada salta al cambiar de
 * pestaña) y, debajo, en el lienzo, el título en Playfair con su subtítulo opcional. Un solo View
 * para que el gap del contenedor cuente una vez.
 */
export function ScreenHeader({ titulo, subtitulo, accion, tituloEnContenido = false }: ScreenHeaderProps) {
  return (
    <View>
      <CabeceraCompacta
        derecha={
          <>
            {accion ?? null}
            <AccionesCabecera />
          </>
        }
      />
      {tituloEnContenido ? null : <TituloPagina titulo={titulo} subtitulo={subtitulo} />}
    </View>
  );
}
