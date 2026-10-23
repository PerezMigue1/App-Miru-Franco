import { Clock, MapPin, Navigation, Phone, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { abrirEnlace, useDatosRecoger } from '../viewmodels/checkoutTienda';
import { useTextosTienda } from '../viewmodels/textosTienda';

interface DatosRecogerSalonProps {
  /** Muestra el aviso de cuánto tarda en estar listo (checkout). */
  conAviso?: boolean;
}

/**
 * Dónde y cuándo se recoge el pedido: nombre, dirección y ciudad del salón, horario, mapa y teléfono,
 * todo de la configuración pública (GP-07.5). Nombre, enlaces y aviso en el principal; dirección y
 * horario en el secundario.
 */
export function DatosRecogerSalon({ conAviso = false }: DatosRecogerSalonProps) {
  const { colores } = useTheme();
  const datos = useDatosRecoger();
  const textos = useTextosTienda();

  return (
    <View style={styles.contenedor}>
      <View style={styles.fila}>
        <MapPin color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <View style={styles.textos}>
          <Text style={[styles.fuerte, { color: colores.texto }]}>{datos.nombre}</Text>
          {/* Dirección y horario en el secundario: 4.8:1 sobre terracota y 8.9:1 sobre lino. */}
          {datos.domicilio ? (
            <Text style={[styles.dato, { color: colores.textoSuave }]}>{datos.domicilio}</Text>
          ) : null}
        </View>
      </View>

      {/* La configuración siempre trae los siete días (o el horario del respaldo). */}
      <View style={styles.fila}>
        <Clock color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <View style={styles.textos}>
          {datos.horario.map((linea) => (
            <Text key={linea} style={[styles.dato, { color: colores.textoSuave }]}>
              {linea}
            </Text>
          ))}
        </View>
      </View>

      {datos.enlaceMapa ? (
        <FilaEnlace
          Icono={Navigation}
          texto={datos.verMapa}
          etiqueta={`${datos.verMapa}, ${datos.nombre}`}
          onPress={() => abrirEnlace(datos.enlaceMapa)}
        />
      ) : null}

      {datos.enlaceTelefono ? (
        <FilaEnlace
          Icono={Phone}
          texto={datos.llamanos}
          etiqueta={textos.llamarSalonEtiqueta(datos.telefono)}
          onPress={() => abrirEnlace(datos.enlaceTelefono)}
        />
      ) : null}

      {conAviso ? <Text style={[styles.dato, { color: colores.texto }]}>{datos.aviso}</Text> : null}
    </View>
  );
}

/** Fila tocable de 48dp con ícono y texto subrayado que abre el mapa o el teléfono. */
export function FilaEnlace({
  Icono,
  texto,
  etiqueta,
  onPress,
}: {
  Icono: LucideIcon;
  texto: string;
  etiqueta: string;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={etiqueta} onPress={onPress} onPressIn={hundir} onPressOut={soltar}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.fila,
            styles.enlaceFila,
            { backgroundColor: pressed ? colores.presionado : colores.transparente },
            estilo,
          ]}
        >
          <Icono color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.dato, styles.enlace, { color: colores.texto }]}>{texto}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: espacio.m,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  enlaceFila: {
    minHeight: toqueMinimo,
    alignItems: 'center',
    borderRadius: radio.campo,
  },
  textos: {
    flex: 1,
    gap: espacio.xxs,
  },
  fuerte: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  dato: {
    flexShrink: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  enlace: {
    textDecorationLine: 'underline',
  },
});
