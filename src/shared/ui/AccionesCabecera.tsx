import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bell, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { useFotoClienta } from '@/features/auth/viewmodels/useFotoClienta';
import { useRequiereSesion } from '@/features/auth/viewmodels/useRequiereSesion';

import { BotonCromo } from './CabeceraCompacta';
import { usePresion } from './movimiento';
import {
  cabeceraCompacta,
  cabeceraFoto,
  espacio,
  fuente,
  icono,
  radio,
  tipo,
  toqueMinimo,
} from './tokens';
import { useTheme } from './useTheme';

/**
 * Acciones de la cabecera de las pestañas, iguales en todas: la campana (sin sesión pide iniciar
 * sesión antes de abrir los avisos) y la foto de la clienta, que abre Perfil. Sin sesión, en lugar
 * de la foto va "Iniciar sesión" con el estilo del botón de la cabecera web.
 */
export function AccionesCabecera() {
  const { navigate } = useRouter();
  const { estado } = useAuth();
  const requiereSesion = useRequiereSesion();
  const conSesion = estado === 'autenticado';
  return (
    <>
      <BotonCromo
        icono={Bell}
        etiqueta="Abrir notificaciones"
        onPress={() => requiereSesion(() => navigate('/notificaciones'))}
      />
      {conSesion ? (
        // navigate no apila: si Perfil ya está abierto, solo cambia a esa pestaña.
        <BotonFoto onPress={() => navigate('/perfil')} />
      ) : (
        <BotonIniciarSesion onPress={() => navigate('/login')} />
      )}
    </>
  );
}

/** Primera letra del nombre y del primer apellido, en mayúsculas ("María López" → "ML"). */
function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  return palabras
    .slice(0, 2)
    .map((palabra) => Array.from(palabra)[0] ?? '')
    .join('')
    .toLocaleUpperCase('es-MX');
}

/**
 * Foto de la clienta en un círculo de 36 dentro de un área de 48. Mientras la foto carga, o si no
 * tiene, no hay red o la imagen falla, se ven sus iniciales: vino con texto claro, como el avatar de
 * la web, y un anillo marfil para que el círculo se distinga del carbón.
 */
function BotonFoto({ onPress }: { onPress: () => void }) {
  const { colores } = useTheme();
  const { usuario } = useAuth();
  const foto = useFotoClienta();
  const { estilo, hundir, soltar } = usePresion();
  const [fallo, setFallo] = useState<string | null>(null);
  const iniciales = inicialesDe(usuario?.nombre ?? '');
  // Una foto nueva vuelve a intentarse aunque la anterior haya fallado.
  useEffect(() => setFallo(null), [foto]);
  const conFoto = foto !== null && fallo !== foto;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir perfil"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.areaFoto,
            { backgroundColor: pressed ? colores.presionadoCromo : colores.transparente },
            estilo,
          ]}
        >
          <View
            style={[
              styles.circulo,
              { backgroundColor: colores.accion, borderColor: colores.contadorContorno },
            ]}
          >
            {iniciales ? (
              <Text
                maxFontSizeMultiplier={cabeceraFoto.escalaMaximaIniciales}
                numberOfLines={1}
                style={[styles.iniciales, { color: colores.textoSobreAccion }]}
              >
                {iniciales}
              </Text>
            ) : (
              <UserRound
                color={colores.textoSobreAccion}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
            )}
            {conFoto ? (
              <Image
                source={{ uri: foto }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                accessible={false}
                onError={() => setFallo(foto)}
                style={styles.foto}
              />
            ) : null}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** "Iniciar sesión" como el botón de la cabecera web: fondo --hover y texto claro (4.9:1 y 5.5:1). */
function BotonIniciarSesion({ onPress }: { onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Iniciar sesión"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View
        style={[styles.botonTexto, { backgroundColor: colores.accionPresionado }, estilo]}
      >
        <Text
          maxFontSizeMultiplier={cabeceraCompacta.escalaMaximaLogotipo}
          style={[styles.textoBoton, { color: colores.textoSobrePanel }]}
        >
          Iniciar sesión
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  areaFoto: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  circulo: {
    width: cabeceraFoto.circulo,
    height: cabeceraFoto.circulo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
    borderWidth: cabeceraFoto.anillo,
    overflow: 'hidden',
  },
  iniciales: {
    fontFamily: fuente.textoFuerte,
    fontSize: cabeceraFoto.iniciales.tamano,
    lineHeight: cabeceraFoto.iniciales.linea,
    includeFontPadding: false,
  },
  // La foto tapa las iniciales cuando termina de cargar.
  foto: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  botonTexto: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    // Con relleno de color, el texto necesita más aire a los lados que el botón de solo texto.
    paddingHorizontal: espacio.m,
    borderRadius: radio.pastilla,
  },
  textoBoton: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
