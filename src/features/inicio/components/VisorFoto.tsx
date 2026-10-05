import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  espacio,
  fuente,
  icono,
  pantalla,
  tipo,
  toqueMinimo,
  tracking,
  visor,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { FotoGaleria } from '../models/FotoModel';

interface VisorFotoProps {
  fotos: FotoGaleria[];
  /** Foto abierta; null mantiene el visor cerrado. */
  indice: number | null;
  onCerrar: () => void;
}

/**
 * Visor a pantalla completa: deslizamiento horizontal por páginas, contador y cierre (también con
 * el botón Atrás de Android). El deslizamiento lo resuelve la lista nativa, así la foto sigue al dedo.
 */
export function VisorFoto({ fotos, indice, onCerrar }: VisorFotoProps) {
  const { colores } = useTheme();
  const { width, height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const [actual, setActual] = useState(indice ?? 0);
  const [indiceAbierto, setIndiceAbierto] = useState(indice);

  // Al abrir con otra foto, el contador arranca en ella (ajuste durante el render).
  if (indice !== indiceAbierto) {
    setIndiceAbierto(indice);
    if (indice !== null) {
      setActual(indice);
    }
  }

  const foto = fotos[actual];
  const alSoltar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pagina = Math.round(e.nativeEvent.contentOffset.x / width);
    setActual(Math.min(Math.max(pagina, 0), fotos.length - 1));
  };

  return (
    <Modal
      visible={indice !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCerrar}
    >
      <View style={[styles.fondo, { backgroundColor: colores.velo }]}>
        {indice === null ? null : (
          <FlatList
            data={fotos}
            horizontal
            pagingEnabled
            initialScrollIndex={indice}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(item) => item.url}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={alSoltar}
            renderItem={({ item }) => (
              <View style={{ width, height }}>
                <Image
                  source={{ uri: item.url }}
                  recyclingKey={item.url}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  accessibilityLabel={`${item.servicio} en Mirú Franco`}
                />
              </View>
            )}
          />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar galería"
          onPress={onCerrar}
          style={[styles.cerrar, { top: top + espacio.s }]}
        >
          <X color={colores.textoSobrePanel} size={icono.tamano} strokeWidth={icono.trazo} />
        </Pressable>

        {foto ? (
          <View style={[styles.pie, { paddingBottom: bottom + visor.rellenoPie }]}>
            <Text numberOfLines={1} style={[styles.servicio, { color: colores.textoSobrePanel }]}>
              {foto.servicio}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.contador, { color: colores.textoSuaveSobrePanel }]}
            >
              {foto.categoria ? `${foto.categoria} · ` : ''}
              {actual + 1} de {fotos.length}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
  },
  cerrar: {
    position: 'absolute',
    right: pantalla.margen,
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pie: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: pantalla.margen,
    paddingTop: visor.rellenoPie,
    gap: espacio.xxs,
  },
  servicio: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  contador: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
});
