import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { SearchBar } from '@/shared/ui/SearchBar';
import { Skeleton } from '@/shared/ui/Skeleton';
import { esqueleto, espacio, fuente, pantalla, radio, tienda, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

const TARJETAS = ['uno', 'dos', 'tres', 'cuatro'];

/** Tienda: solo presentación; el catálogo y la compra llegan en GP-06. */
export default function TiendaView() {
  const { colores } = useTheme();
  const { width } = useWindowDimensions();
  const anchoTarjeta =
    (width - pantalla.margen * 2 - espacio.m * (tienda.columnas - 1)) / tienda.columnas;

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.contenido}
    >
      <ScreenHeader titulo="Tienda" />
      <View style={styles.cuerpo}>
        <View style={styles.busqueda}>
          {/* TODO(GP-06): búsqueda real en el catálogo. */}
          <SearchBar texto="Buscar productos" accessibilityHint="Disponible próximamente" />
        </View>
        <Text style={[styles.nota, { color: colores.textoSuave }]}>
          Los productos del salón aparecerán aquí.
        </Text>
        <View style={styles.cuadricula} accessible accessibilityLabel="Espacio para los productos del salón">
          {TARJETAS.map((clave) => (
            <View key={clave} style={[styles.tarjeta, { width: anchoTarjeta }]}>
              <Skeleton estilo={styles.imagen} />
              <Skeleton estilo={styles.linea} />
              <Skeleton estilo={styles.lineaCorta} />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xl,
  },
  busqueda: {
    flexDirection: 'row',
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cuadricula: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.m,
  },
  tarjeta: {
    gap: espacio.s,
  },
  imagen: {
    aspectRatio: 1,
    borderRadius: radio.tarjeta,
  },
  linea: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
});
