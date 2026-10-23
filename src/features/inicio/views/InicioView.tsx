import { useIsFocused, useRouter, type Href } from 'expo-router';
import { Info, X, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  RefreshControl,
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
import {
  EncabezadoSeccion,
  SeccionCierre,
  SeccionEquipo,
  SeccionPreguntas,
  SeccionPromociones,
  SeccionSobreNosotros,
  type ErrorSeccion,
} from '../components/SeccionesContenido';
import type { GaleriaInicio } from '../viewmodels/useContenidoInicio';
import { usePantallaInicio } from '../viewmodels/usePantallaInicio';

/**
 * Inicio: hero de fluidos, carruseles de productos y servicios, la galería "Nuestro trabajo" y las
 * secciones de contenido del salón (promociones, equipo, preguntas frecuentes, sobre nosotros y
 * cierre), con deslizar para actualizar. Solo pinta lo que le da usePantallaInicio.
 */
export default function InicioView() {
  const vm = usePantallaInicio();
  const { catalogos, contenido } = vm;
  const {
    estado,
    mensajeError,
    fluidos,
    estadoProductos,
    mensajeErrorProductos,
    recargarProductos,
    productosDestacados,
    serviciosDestacados,
    recargar,
  } = catalogos;
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
        refreshControl={
          <RefreshControl
            refreshing={vm.refrescando}
            onRefresh={vm.refrescar}
            colors={[colores.foco]}
            tintColor={colores.foco}
            progressBackgroundColor={colores.superficie}
            // El indicador baja desde la cabecera fija, no desde detrás de ella.
            progressViewOffset={altoCabecera}
          />
        }
      >
        {altoVisible > 0 ? (
          <HeroFluidos
            fluidos={fluidos}
            // Nombre y precio de los fluidos salen del catálogo: su esqueleto sigue al catálogo.
            cargando={estadoProductos === 'cargando'}
            desplazamiento={desplazamiento}
            altoVisible={altoVisible}
            altoCabecera={altoCabecera}
            enfocada={enfocada}
            reducido={reducido}
            nombreSalon={contenido.nombreSalon}
            destacado={contenido.destacado}
            tituloAccion={vm.tituloBotonGoji}
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
          descripcion={contenido.productosDescripcion}
          productos={estadoProductos === 'listo' ? productosDestacados : []}
          onAbrir={abrirProducto}
          onVerTodos={verTienda}
        />
        {/* Falló solo el catálogo: su propio error con Reintentar, que pide solo los productos. Si
            también fallaron los servicios basta el error general (su Reintentar pide los dos). */}
        {estadoProductos === 'error' && estado !== 'error' ? (
          <View style={styles.errorCatalogos}>
            <EmptyState
              titulo={vm.titulosError.productos}
              mensaje={mensajeErrorProductos ?? ''}
              accion={{ titulo: 'Reintentar', onPress: recargarProductos }}
            />
          </View>
        ) : null}
        <CarruselServicios
          cargando={estado === 'cargando'}
          descripcion={contenido.serviciosDescripcion}
          servicios={estado === 'listo' ? serviciosDestacados : []}
          onAbrir={abrirServicio}
          onVerTodos={verServicios}
        />
        {/* Sin servicios no hay carrusel: si la lectura falló, se dice y se ofrece reintentar. */}
        {estado === 'error' ? (
          <View style={styles.errorCatalogos}>
            <EmptyState
              titulo={vm.titulosError.servicios}
              mensaje={mensajeError ?? ''}
              accion={{ titulo: 'Reintentar', onPress: recargar }}
            />
          </View>
        ) : null}

        <View style={styles.galeria}>
          <EncabezadoSeccion titulo={contenido.galeria.titulo} descripcion={contenido.galeria.descripcion} />
          <ContenidoGaleria galeria={contenido.galeria} error={contenido.error} onVerServicios={verServicios} />
        </View>

        <SeccionPromociones seccion={contenido.promociones} error={contenido.error} onAbrir={vm.abrirPromocion} />
        <SeccionEquipo seccion={contenido.equipo} error={contenido.error} />
        <SeccionPreguntas seccion={contenido.preguntas} error={contenido.error} />
        <SeccionSobreNosotros {...contenido.sobreNosotros} onAbrirSalon={vm.abrirSalon} />
        <SeccionCierre {...contenido.cierre} onReservar={vm.reservar} />
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

/** Galería según su estado: esqueleto, error con Reintentar, vacía (como GaleriaVacia de la web) o el mosaico. */
function ContenidoGaleria({
  galeria,
  error,
  onVerServicios,
}: {
  galeria: GaleriaInicio;
  error: ErrorSeccion;
  onVerServicios: () => void;
}) {
  if (galeria.estado === 'cargando') {
    return <GaleriaEsqueleto />;
  }
  if (galeria.estado === 'error') {
    return (
      <EmptyState
        titulo={error.titulo}
        mensaje={galeria.mensajeError ?? error.texto}
        accion={{ titulo: 'Reintentar', onPress: galeria.reintentar }}
      />
    );
  }
  if (galeria.estado === 'vacio') {
    return (
      <EmptyState
        titulo={galeria.vaciaTitulo}
        mensaje={galeria.vaciaTexto}
        accion={{ titulo: 'Ver servicios', onPress: onVerServicios }}
      />
    );
  }
  return <GaleriaTrabajo fotos={galeria.datos} verServicio={galeria.verServicio} />;
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
  errorCatalogos: {
    paddingHorizontal: pantalla.margen,
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
});
