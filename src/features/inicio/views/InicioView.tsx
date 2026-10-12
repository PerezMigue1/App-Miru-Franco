import { useIsFocused, useRouter, type Href } from 'expo-router';
import { Info, X, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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
import { AccionesCabecera } from '@/shared/ui/AccionesCabecera';
import { Button } from '@/shared/ui/Button';
import { CabeceraCompacta } from '@/shared/ui/CabeceraCompacta';
import { EmptyState } from '@/shared/ui/EmptyState';
import { usePresion } from '@/shared/ui/movimiento';
import {
  borde,
  cabeceraCompacta,
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
import { CarruselProductos, CarruselServicios } from '../components/SeccionCarrusel';
import type { FotoGaleria } from '../models/FotoModel';
import { useInicioViewModel, type EstadoInicio } from '../viewmodels/useInicioViewModel';

export default function InicioView() {
  const {
    estado,
    fluidos,
    fotos,
    estadoProductos,
    productosDestacados,
    serviciosDestacados,
    recargar,
  } = useInicioViewModel();
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  const reducido = useMovimientoReducido();
  const enfocada = useIsFocused();
  const { navigate, push } = useRouter();
  const { estado: estadoSesion, sesionVencida, descartarAvisoSesion } = useAuth();
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
  // Cromo compacto (56): el escenario del hero queda justo debajo.
  const altoCabecera = top + cabeceraCompacta.alto;

  const medir = (e: LayoutChangeEvent) => setAltoVisible(e.nativeEvent.layout.height);

  // TODO(GP-06): llevar al detalle del Fluido Di Goji en la tienda; por ahora abre la pestaña Tienda.
  const verGoji = () => navigate('/tienda');
  // Estables: las filas memoizadas de los carruseles no se vuelven a pintar por ellas.
  const abrirProducto = useCallback((id: number) => push(`/producto/${id}` as Href), [push]);
  const abrirServicio = useCallback(
    (id: string | number) => push(`/servicio/${encodeURIComponent(String(id))}` as Href),
    [push],
  );
  const verTienda = useCallback(() => navigate('/tienda'), [navigate]);
  // La pestaña se llama Servicios, pero su ruta es /citas.
  const verServicios = useCallback(() => navigate('/citas'), [navigate]);
  // TODO(GP-06): abrir la búsqueda de productos y servicios; por ahora abre la pestaña Tienda.

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
            <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
              <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
                Crea tu cuenta para reservar citas y comprar
              </Text>
              <Button titulo="Crear cuenta" onPress={() => push('/registro')} />
              {/* Un botón secundario terracota no se distingue sobre la tarjeta terracota. */}
              <Enlace texto="Iniciar sesión" onPress={() => push('/login')} alinear="centro" />
            </View>
          </View>
        )}

        <CarruselProductos
          cargando={estadoProductos === 'cargando'}
          productos={estadoProductos === 'listo' ? productosDestacados : []}
          onAbrir={abrirProducto}
          onVerTodos={verTienda}
        />
        <CarruselServicios
          cargando={estado === 'cargando'}
          servicios={estado === 'listo' ? serviciosDestacados : []}
          onAbrir={abrirServicio}
          onVerTodos={verServicios}
        />

        <View style={styles.galeria}>
          <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSuave }]}>
            Nuestro trabajo
          </Text>
          <ContenidoGaleria estado={estado} fotos={fotos} onReintentar={recargar} />
        </View>
      </Animated.ScrollView>

      {/* Cabecera fija con fondo propio: el contenido pasa por debajo sin chocar con la barra de estado.
          La misma cabecera compacta de las demás pantallas. */}
      <CabeceraCompacta
        style={[styles.cabecera, { shadowColor: colores.sombraTarjeta }]}
        // Las mismas acciones de las demás pestañas: campana y foto (o "Iniciar sesión").
        derecha={<AccionesCabecera />}
      />

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
          <BotonIcono
            icono={X}
            etiqueta="Cerrar aviso"
            onPress={descartarAvisoSesion}
            color={colores.campoTexto}
            tamano={icono.tamanoPequeno}
          />
        </View>
      ) : null}
    </View>
  );
}

function BotonIcono({
  icono: Icono,
  etiqueta,
  onPress,
  color,
  tamano = icono.tamano,
  sobrePanel = false,
}: {
  icono: LucideIcon;
  etiqueta: string;
  onPress: () => void;
  /** Por omisión, el color del texto (o el del texto sobre el panel, en la cabecera). */
  color?: string;
  tamano?: number;
  /** Va sobre el cromo carbón de la cabecera: ícono claro y presionado de cromo. */
  sobrePanel?: boolean;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.botonIcono,
            {
              backgroundColor: pressed
                ? sobrePanel
                  ? colores.presionadoCromo
                  : colores.presionado
                : colores.transparente,
            },
            estilo,
          ]}
        >
          <Icono
            color={color ?? (sobrePanel ? colores.textoSobrePanel : colores.texto)}
            size={tamano}
            strokeWidth={icono.trazo}
          />
        </Animated.View>
      )}
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
    // Sin filete: como la cabecera web, se separa del contenido con sombra.
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
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
    letterSpacing: tracking.subtitulo,
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
    letterSpacing: tracking.tituloPagina,
  },
});
