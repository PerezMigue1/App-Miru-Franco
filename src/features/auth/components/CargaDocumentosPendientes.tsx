import { StyleSheet, View } from 'react-native';

import { CabeceraCompacta } from '@/shared/ui/CabeceraCompacta';
import { FranjaConexion } from '@/shared/ui/FranjaConexion';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cabeceraCompacta, espacio, pantalla, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

/**
 * Carga de los documentos pendientes (GP-09): mientras se consultan, la pantalla queda cubierta con
 * el lienzo del tema, el cromo de la cabecera y bloques Skeleton con la forma del visor (título,
 * tarjeta de la versión y botón), así al llegar un pendiente solo cambia el contenido. Sin botones.
 * El lector de pantalla la anuncia como ocupada. Lleva su propia franja "Conectando con el salón…":
 * la de la raíz queda debajo del Modal.
 */
export function CargaDocumentosPendientes({ etiqueta }: { etiqueta: string }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <CabeceraCompacta />
      <View
        accessible
        accessibilityLabel={etiqueta}
        accessibilityState={{ busy: true }}
        style={styles.cuerpo}
      >
        <Skeleton estilo={styles.titulo} />
        <Skeleton estilo={styles.tarjeta} />
        <Skeleton estilo={styles.boton} />
      </View>
      <FranjaConexion />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    gap: espacio.l,
    paddingHorizontal: pantalla.margen,
    paddingTop: cabeceraCompacta.tituloArriba,
  },
  // Lo que miden el título de la página, la tarjeta de la versión y el botón del visor.
  titulo: {
    width: '60%',
    height: tipo.titulo.linea,
    marginBottom: cabeceraCompacta.tituloAbajo,
  },
  tarjeta: {
    height: tipo.cuerpo.linea * 2 + espacio.xs + espacio.l * 2,
    borderRadius: radio.tarjeta,
  },
  boton: {
    height: toqueMinimo,
  },
});
