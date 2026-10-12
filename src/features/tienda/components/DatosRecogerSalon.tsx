import { Clock, MapPin, Phone } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { SALON_RECOGER } from '../models/pedidoModel';

interface DatosRecogerSalonProps {
  /** Muestra el aviso de cuánto tarda en estar listo (checkout). */
  conAviso?: boolean;
}

/**
 * Dónde y cuándo se recoge el pedido: nombre y ciudad del salón, horario y teléfono (mismos datos
 * que la web). Todo el texto va en el color principal: el suave no llega a 4.5:1 sobre terracota.
 */
export function DatosRecogerSalon({ conAviso = false }: DatosRecogerSalonProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const llamar = () => {
    Linking.openURL(SALON_RECOGER.telefonoMarcable).catch(() => {
      // Sin app de teléfono, el número queda escrito en pantalla.
    });
  };

  return (
    <View style={styles.contenedor}>
      <View style={styles.fila}>
        <MapPin color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <View style={styles.textos}>
          <Text style={[styles.fuerte, { color: colores.texto }]}>{SALON_RECOGER.nombre}</Text>
          <Text style={[styles.dato, { color: colores.texto }]}>{SALON_RECOGER.direccion}</Text>
        </View>
      </View>

      <View style={styles.fila}>
        <Clock color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <View style={styles.textos}>
          {SALON_RECOGER.horario.map((linea) => (
            <Text key={linea} style={[styles.dato, { color: colores.texto }]}>
              {linea}
            </Text>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Llamar al salón, ${SALON_RECOGER.telefono}`}
        onPress={llamar}
        onPressIn={hundir}
        onPressOut={soltar}
      >
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.fila,
              styles.telefono,
              { backgroundColor: pressed ? colores.presionado : colores.transparente },
              estilo,
            ]}
          >
            <Phone color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            <Text style={[styles.dato, styles.enlace, { color: colores.texto }]}>
              ¿Dudas para llegar? Llámanos al {SALON_RECOGER.telefono}
            </Text>
          </Animated.View>
        )}
      </Pressable>

      {conAviso ? (
        <Text style={[styles.dato, { color: colores.texto }]}>{SALON_RECOGER.aviso}</Text>
      ) : null}
    </View>
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
  telefono: {
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
