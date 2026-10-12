import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
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
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePresion } from '@/shared/ui/movimiento';
import {
  borde,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  temaOscuro,
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
  const { push } = useRouter();
  const presionCerrar = usePresion();
  const presionServicio = usePresion();
  // El visor siempre es oscuro: el oro de texto pequeño es el del tema oscuro (AA sobre el velo).
  const oro = temaOscuro.oroTextoPequeno;

  // Al abrir con otra foto, el contador arranca en ella (ajuste durante el render).
  if (indice !== indiceAbierto) {
    setIndiceAbierto(indice);
    if (indice !== null) {
      setActual(indice);
    }
  }

  const foto = fotos[actual];
  const tieneServicio = foto ? foto.servicioId !== '' && foto.servicioId != null : false;
  const verServicio = () => {
    if (!foto || !tieneServicio) {
      return;
    }
    onCerrar();
    push(`/servicio/${foto.servicioId}` as Href);
  };
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
          onPressIn={presionCerrar.hundir}
          onPressOut={presionCerrar.soltar}
          style={[styles.cerrar, { top: top + espacio.s }]}
        >
          {/* Fondo de velo propio: la X conserva el contraste aunque la foto quede debajo. */}
          <Animated.View
            style={[styles.botonCerrar, { backgroundColor: colores.velo }, presionCerrar.estilo]}
          >
            <X color={colores.textoSobrePanel} size={icono.tamano} strokeWidth={icono.trazo} />
          </Animated.View>
        </Pressable>

        {foto ? (
          <View
            style={[
              styles.pie,
              // Con fondo de velo, el texto del pie se lee igual sobre fotos claras.
              { paddingBottom: bottom + visor.rellenoPie, backgroundColor: colores.velo },
            ]}
          >
            <View style={styles.filaServicio}>
              <Text numberOfLines={1} style={[styles.servicio, { color: colores.textoSobrePanel }]}>
                {foto.servicio}
              </Text>
              {tieneServicio ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el servicio ${foto.servicio}`}
                  onPress={verServicio}
                  onPressIn={presionServicio.hundir}
                  onPressOut={presionServicio.soltar}
                >
                  {({ pressed }) => (
                    <Animated.View
                      style={[
                        styles.verServicio,
                        {
                          borderColor: oro,
                          // El visor siempre es oscuro: el tono de presionado es el del tema oscuro.
                          backgroundColor: pressed ? temaOscuro.presionado : 'transparent',
                        },
                        presionServicio.estilo,
                      ]}
                    >
                      <Text style={[styles.textoVerServicio, { color: oro }]}>Ver servicio</Text>
                      <ChevronRight
                        color={oro}
                        size={icono.tamanoPequeno}
                        strokeWidth={icono.trazo}
                      />
                    </Animated.View>
                  )}
                </Pressable>
              ) : null}
            </View>
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
  },
  botonCerrar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
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
  filaServicio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  servicio: {
    flex: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  verServicio: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingLeft: espacio.l,
    paddingRight: espacio.m,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  textoVerServicio: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  contador: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
});
