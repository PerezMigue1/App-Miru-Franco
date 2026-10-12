import { ArrowLeft } from 'lucide-react-native';
import { View } from 'react-native';

import { BotonCromo, CabeceraCompacta, TituloPagina } from '@/shared/ui/CabeceraCompacta';
import { useTecladoVisible } from '@/shared/ui/useTecladoVisible';

interface EncabezadoVolverProps {
  titulo: string;
  onVolver: () => void;
  /** Línea opcional bajo el título, como el subtítulo de PageHeader en la web. */
  subtitulo?: string;
}

/**
 * Encabezado de las pantallas de la pila: la cabecera compacta carbón con el botón Volver a la
 * izquierda del logotipo (mide lo mismo que la de Inicio y la de las pestañas) y, debajo, en el
 * lienzo, el título en Playfair con su subtítulo opcional. Mientras el teclado está abierto el título
 * se guarda: así el formulario no queda tapado en un teléfono chico.
 */
export function EncabezadoVolver({ titulo, onVolver, subtitulo }: EncabezadoVolverProps) {
  const teclado = useTecladoVisible();
  return (
    <View>
      <CabeceraCompacta
        izquierda={<BotonCromo icono={ArrowLeft} etiqueta="Volver" onPress={onVolver} />}
      />
      {teclado ? null : <TituloPagina titulo={titulo} subtitulo={subtitulo} />}
    </View>
  );
}
