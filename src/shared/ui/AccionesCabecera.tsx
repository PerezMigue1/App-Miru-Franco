import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bell, UserRound } from 'lucide-react-native';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

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
 * Lo que la cabecera necesita saber de la sesión, en forma de hooks. src/shared no depende de
 * src/features: la raíz (src/app/_layout.tsx) inyecta la implementación real de la feature auth con
 * SesionCabeceraProvider.
 */
export interface SesionCabecera {
  /** Si hay una clienta con sesión y su nombre (vacío sin sesión), para las iniciales del círculo. */
  useSesion: () => { conSesion: boolean; nombre: string };
  /** URL de la foto de la clienta, o null si no tiene o aún no se conoce. */
  useFoto: () => string | null;
  /** Envuelve una acción: con sesión la ejecuta; sin sesión pide iniciar sesión antes. */
  useRequiereSesion: () => (accion?: () => void) => void;
  /**
   * Avisos internos sin leer, para el contador de la campana (GP-07.2). Opcional: sin él la campana
   * no muestra número. La raíz lo inyecta desde features/notificaciones.
   */
  useNoLeidos?: () => number;
}

/** Sin useNoLeidos inyectado no hay avisos que contar. */
function sinAvisos(): number {
  return 0;
}

/** Etiqueta de la campana: el número va aquí porque el contador no se lee por separado. */
export function etiquetaCampana(noLeidos: number): string {
  if (noLeidos <= 0) {
    return 'Abrir notificaciones';
  }
  return `Abrir notificaciones, ${noLeidos === 1 ? '1 aviso sin leer' : `${noLeidos} avisos sin leer`}`;
}

const ContextoSesionCabecera = createContext<SesionCabecera | null>(null);

/** Entrega a AccionesCabecera los hooks de sesión. El valor debe ser una constante de módulo. */
export function SesionCabeceraProvider({
  sesion,
  children,
}: {
  sesion: SesionCabecera;
  children: ReactNode;
}) {
  return (
    <ContextoSesionCabecera.Provider value={sesion}>{children}</ContextoSesionCabecera.Provider>
  );
}

/** Los hooks de sesión inyectados; sin proveedor es un error de armado de la app. */
function useSesionCabecera(): SesionCabecera {
  const sesion = useContext(ContextoSesionCabecera);
  if (!sesion) {
    throw new Error('AccionesCabecera debe usarse dentro de SesionCabeceraProvider.');
  }
  return sesion;
}

/**
 * Acciones de la cabecera de las pestañas, iguales en todas: la campana (sin sesión pide iniciar
 * sesión antes de abrir los avisos; con sesión lleva el número de avisos sin leer, "9+" arriba de
 * 9) y la foto de la clienta, que abre Perfil. Sin sesión, en lugar de la foto va "Iniciar sesión"
 * con el estilo del botón de la cabecera web. La sesión y los avisos sin leer llegan inyectados por
 * SesionCabeceraProvider, porque src/shared no depende de src/features.
 */
export function AccionesCabecera() {
  const { navigate } = useRouter();
  const { useSesion, useRequiereSesion, useNoLeidos = sinAvisos } = useSesionCabecera();
  const { conSesion } = useSesion();
  const requiereSesion = useRequiereSesion();
  // El proveedor es una constante de módulo: useNoLeidos es siempre el mismo hook.
  const noLeidos = useNoLeidos();
  // Sin sesión la campana sigue como antes: sin número (la lista ya se vació al cerrar sesión).
  const contador = conSesion ? noLeidos : 0;
  return (
    <>
      <BotonCromo
        icono={Bell}
        etiqueta={etiquetaCampana(contador)}
        contador={contador}
        maximoContador={cabeceraCompacta.maximoAvisosVisibles}
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
  const { useSesion, useFoto } = useSesionCabecera();
  const { nombre } = useSesion();
  const foto = useFoto();
  const { estilo, hundir, soltar } = usePresion();
  const [fallo, setFallo] = useState<string | null>(null);
  const iniciales = inicialesDe(nombre);
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
