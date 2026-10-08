import { useIsFocused, useRouter } from 'expo-router';
import { Bell, Info, UserRound, X, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Enlace } from '@/features/auth/components/AuthContainer';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { useRequiereSesion } from '@/features/auth/viewmodels/useRequiereSesion';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SearchBar } from '@/shared/ui/SearchBar';
import {
  borde,
  cabecera,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { GaleriaEsqueleto, GaleriaTrabajo } from '../components/GaleriaTrabajo';
import { HeroFluidos } from '../components/HeroFluidos';
import type { FotoGaleria } from '../models/FotoModel';
import { useInicioViewModel, type EstadoInicio } from '../viewmodels/useInicioViewModel';

export default function InicioView() {
  const { estado, fluidos, fotos, recargar } = useInicioViewModel();
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const reducido = useMovimientoReducido();
  const enfocada = useIsFocused();
  const { navigate, push } = useRouter();
  const { estado: estadoSesion, sesionVencida, descartarAvisoSesion } = useAuth();
  const requiereSesion = useRequiereSesion();
  const conSesion = estadoSesion === 'autenticado';

  // El aviso de sesión vencida aparece de golpe junto con el cambio a Inicio: se anuncia aparte para
  // que TalkBack no lo pierda.
  useEffect(() => {
    if (sesionVencida) {
      AccessibilityInfo.announceForAccessibility('Tu sesión terminó. Inicia sesión de nuevo.');
    }
  }, [sesionVencida]);
  const refScroll = useAnimatedRef<Animated.ScrollView>();
  const desplazamiento = useScrollOffset(refScroll);
  const [altoVisible, setAltoVisible] = useState(0);
  const altoCabecera = top + cabecera.alto;

  const medir = (e: LayoutChangeEvent) => setAltoVisible(e.nativeEvent.layout.height);

  // TODO(GP-06): llevar al detalle del Fluido Di Goji en la tienda; por ahora abre la pestaña Tienda.
  const verGoji = () => navigate('/tienda');
  // TODO(GP-06): abrir la búsqueda de productos y servicios; por ahora abre la pestaña Tienda.
  const buscar = () => navigate('/tienda');
  const abrirPerfil = () => navigate('/perfil');
  // Sin sesión, la campana abre la hoja de acceso.
  const abrirNotificaciones = () => requiereSesion(() => navigate('/notificaciones'));

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <Animated.ScrollView
        ref={refScroll}
        onLayout={medir}
        contentContainerStyle={styles.contenido}
      >
        {altoVisible > 0 ? (
          <HeroFluidos
            fluidos={fluidos}
            cargando={estado === 'cargando'}
            desplazamiento={desplazamiento}
            altoVisible={altoVisible}
            altoCabecera={altoCabecera}
            enfocada={enfocada}
            reducido={reducido}
            onVerGoji={verGoji}
          />
        ) : null}

        {conSesion ? null : (
          <View style={styles.invitacion}>
            <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}>
              <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
                Crea tu cuenta para reservar citas y comprar
              </Text>
              <Button titulo="Crear cuenta" onPress={() => push('/registro')} />
              {/* Un botón secundario terracota no se distingue sobre la tarjeta terracota. */}
              <Enlace texto="Iniciar sesión" onPress={() => push('/login')} alinear="centro" />
            </View>
          </View>
        )}

        <View style={styles.galeria}>
          <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
            Nuestro trabajo
          </Text>
          <ContenidoGaleria estado={estado} fotos={fotos} onReintentar={recargar} />
        </View>
      </Animated.ScrollView>

      {/* Cabecera fija con fondo propio: el contenido pasa por debajo sin chocar con la barra de estado. */}
      <View
        style={[
          styles.cabecera,
          {
            paddingTop: top + cabecera.relleno,
            backgroundColor: colores.fondo,
            borderBottomColor: colores.hairline,
          },
        ]}
      >
        {conSesion ? (
          <BotonIcono icono={UserRound} etiqueta="Abrir perfil" onPress={abrirPerfil} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar sesión"
            onPress={() => push('/login')}
            style={({ pressed }) => [
              styles.botonTexto,
              { backgroundColor: pressed ? colores.presionado : 'transparent' },
            ]}
          >
            <Text style={[styles.textoBoton, { color: colores.foco }]}>Iniciar sesión</Text>
          </Pressable>
        )}
        <SearchBar
          texto="Buscar productos y servicios"
          accessibilityHint="Abre la tienda"
          onPress={buscar}
        />
        <BotonIcono icono={Bell} etiqueta="Abrir notificaciones" onPress={abrirNotificaciones} />
      </View>

      {sesionVencida ? (
        <View
          style={[
            styles.avisoSesion,
            {
              top: altoCabecera + espacio.s,
              backgroundColor: colores.campoFondo,
              borderColor: colores.campoBorde,
            },
          ]}
        >
          <Info color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.textoAviso, { color: colores.campoTexto }]}>
            Tu sesión terminó. Inicia sesión de nuevo.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar aviso"
            onPress={descartarAvisoSesion}
            style={styles.botonIcono}
          >
            <X color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function BotonIcono({
  icono: Icono,
  etiqueta,
  onPress,
}: {
  icono: LucideIcon;
  etiqueta: string;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      style={({ pressed }) => [
        styles.botonIcono,
        { backgroundColor: pressed ? colores.presionado : 'transparent' },
      ]}
    >
      <Icono color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
    </Pressable>
  );
}

function ContenidoGaleria({
  estado,
  fotos,
  onReintentar,
}: {
  estado: EstadoInicio;
  fotos: FotoGaleria[];
  onReintentar: () => void;
}) {
  if (estado === 'cargando') {
    return <GaleriaEsqueleto />;
  }
  if (estado === 'error') {
    return (
      <EmptyState
        titulo="No pudimos cargar el inicio"
        mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
        accion={{ titulo: 'Reintentar', onPress: onReintentar }}
      />
    );
  }
  return <GaleriaTrabajo fotos={fotos} />;
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingBottom: espacio.x5,
  },
  cabecera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingHorizontal: pantalla.margen - espacio.s,
    paddingBottom: cabecera.relleno,
    borderBottomWidth: borde.hairline,
  },
  botonIcono: {
    width: toqueMinimo,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galeria: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x5,
    gap: espacio.xl,
  },
  invitacion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x5,
  },
  tarjeta: {
    gap: espacio.m,
    padding: espacio.xl,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  tituloTarjeta: {
    marginBottom: espacio.xs,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  botonTexto: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingHorizontal: espacio.s,
    borderRadius: radio.pastilla,
  },
  textoBoton: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  avisoSesion: {
    position: 'absolute',
    left: pantalla.margen,
    right: pantalla.margen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingLeft: espacio.l,
    paddingVertical: espacio.xs,
    borderRadius: radio.campo,
    // Borde del campo (3:1) en lugar de sombra: se distingue también sobre carbón.
    borderWidth: borde.hairline,
  },
  textoAviso: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
});
