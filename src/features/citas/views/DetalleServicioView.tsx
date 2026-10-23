import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CalendarPlus, Check, Clock, Sparkles, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Monograma } from '@/shared/ui/Monograma';
import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  catalogo,
  duracion,
  esqueleto,
  espacio,
  fuente,
  icono,
  monograma,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import {
  useDetalleServicioViewModel,
  type AvisoAnticipo,
  type Especialista,
  type Servicio,
} from '../viewmodels/useDetalleServicioViewModel';

/** Detalle de un servicio: foto, datos, reservar primero y después lo que incluye. */
export default function DetalleServicioView() {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useDetalleServicioViewModel(id);

  const regresar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/citas');
    }
  };

  const listo = vm.estado === 'listo' && vm.servicio != null;
  // Sin foto ni contenido arriba, el estado deja libre el espacio del botón Regresar.
  const rellenoSuperior = top + espacio.s + toqueMinimo + espacio.l;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      {listo && vm.servicio ? (
        <>
          <StatusBar style="light" />
          <ScrollView contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}>
            <Contenido
              servicio={vm.servicio}
              sesion={vm.sesion}
              invitacionVisible={vm.invitacionVisible}
              onReservar={vm.reservar}
              anticipo={vm.anticipo}
              beneficioInvitacion={vm.beneficioInvitacion}
            />
          </ScrollView>
        </>
      ) : null}

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando servicio"
          style={styles.esqueleto}
        >
          <Skeleton estilo={styles.imagenEsqueleto} />
          <View style={styles.bloque}>
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.precioEsqueleto} />
            <Skeleton estilo={styles.botonEsqueleto} />
            <Skeleton estilo={styles.lineaMedia} />
            <Skeleton estilo={styles.linea} />
          </View>
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView
          contentContainerStyle={[
            styles.estado,
            { paddingTop: rellenoSuperior, paddingBottom: bottom + espacio.x3 },
          ]}
        >
          <EmptyState
            titulo="No pudimos cargar este servicio"
            mensaje="Revisa tu conexión e intenta de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView
          contentContainerStyle={[
            styles.estado,
            { paddingTop: rellenoSuperior, paddingBottom: bottom + espacio.x3 },
          ]}
        >
          <EmptyState
            titulo="Este servicio ya no está disponible"
            mensaje="Puede que el salón lo haya retirado. Mira los demás servicios del salón."
            accion={{ titulo: 'Ver servicios', onPress: () => router.replace('/citas') }}
          />
        </ScrollView>
      ) : null}

      <BotonRegresar
        sobreImagen={listo || vm.estado === 'cargando'}
        top={top + espacio.s}
        onPress={regresar}
      />
    </View>
  );
}

function Contenido({
  servicio,
  sesion,
  invitacionVisible,
  onReservar,
  anticipo,
  beneficioInvitacion,
}: {
  servicio: Servicio;
  sesion: boolean;
  invitacionVisible: boolean;
  onReservar: () => void;
  anticipo: AvisoAnticipo | null;
  beneficioInvitacion: string;
}) {
  const { colores } = useTheme();
  const descripcion = servicio.descripcionLarga.trim() || servicio.descripcion.trim();
  const hayMetadatos = Boolean(servicio.duracion || servicio.categoria);

  return (
    <>
      <View style={[styles.imagen, { backgroundColor: colores.panel }]}>
        <Monograma tamano="grande" />
        {servicio.imagen ? (
          <Image
            source={{ uri: servicio.imagen }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={duracion.pestana}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Foto de ${servicio.nombre}`}
          />
        ) : null}
      </View>

      <View style={styles.bloque}>
        <Text accessibilityRole="header" style={[styles.nombre, { color: colores.texto }]}>
          {servicio.nombre}
        </Text>

        {hayMetadatos ? (
          <View style={styles.metadatos}>
            {servicio.duracion ? (
              <View
                style={styles.dato}
                accessible
                accessibilityLabel={`Duración: ${servicio.duracion}`}
              >
                <Clock color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                <Text style={[styles.textoDato, styles.tabular, { color: colores.textoSuave }]}>
                  {servicio.duracion}
                </Text>
              </View>
            ) : null}
            {servicio.duracion && servicio.categoria ? (
              <View
                accessible={false}
                style={[styles.separador, { backgroundColor: colores.oro }]}
              />
            ) : null}
            {servicio.categoria ? (
              <Text style={[styles.textoDato, { color: colores.textoSuave }]}>
                {servicio.categoria}
              </Text>
            ) : null}
          </View>
        ) : null}

        {servicio.precio ? (
          <Text
            accessibilityLabel={`Precio: ${servicio.precio}`}
            style={[styles.precio, { color: colores.texto }]}
          >
            {servicio.precio}
          </Text>
        ) : (
          <Text style={[styles.sinPrecio, { color: colores.textoSuave }]}>
            Consulta el precio en el salón
          </Text>
        )}

        {anticipo ? (
          <Text style={[styles.nota, { color: colores.textoSuave }]}>
            {anticipo.antes}
            <Text style={[styles.cifra, { color: colores.texto }]}>{anticipo.monto}</Text>
            {anticipo.despues}
          </Text>
        ) : null}

        {servicio.requiereEvaluacion ? (
          <Text style={[styles.nota, { color: colores.textoSuave }]}>
            Requiere valoración previa en el salón.
          </Text>
        ) : null}
      </View>

      {!sesion && invitacionVisible ? (
        <InvitacionSesion
          titulo="Inicia sesión para reservar"
          beneficio={beneficioInvitacion}
        />
      ) : (
        <View style={styles.accion}>
          <Button
            titulo="Reservar"
            onPress={onReservar}
            icono={
              <CalendarPlus
                color={colores.textoSobreAccion}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
            }
            posicionIcono="inicio"
          />
        </View>
      )}

      {descripcion ? (
        <Seccion titulo="Descripción">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{descripcion}</Text>
        </Seccion>
      ) : null}

      {servicio.incluye.length > 0 ? (
        <Seccion titulo="Incluye">
          <Lista elementos={servicio.incluye} Icono={Check} />
        </Seccion>
      ) : null}

      {servicio.recomendaciones.length > 0 ? (
        <Seccion titulo="Recomendaciones">
          <Lista elementos={servicio.recomendaciones} Icono={Sparkles} />
        </Seccion>
      ) : null}

      {servicio.especialistas.length > 0 ? (
        <Seccion titulo="Especialistas">
          <View style={styles.especialistas}>
            {servicio.especialistas.map((especialista) => (
              <FilaEspecialista key={String(especialista.id)} especialista={especialista} />
            ))}
          </View>
        </Seccion>
      ) : null}
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.texto }]}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function Lista({ elementos, Icono }: { elementos: string[]; Icono: LucideIcon }) {
  const { colores } = useTheme();
  return (
    <View style={styles.lista}>
      {elementos.map((elemento, i) => (
        <View key={`${i}-${elemento}`} style={styles.elemento}>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.iconoElemento}
          >
            <Icono color={colores.oro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <Text style={[styles.textoElemento, { color: colores.texto }]}>{elemento}</Text>
        </View>
      ))}
    </View>
  );
}

function FilaEspecialista({ especialista }: { especialista: Especialista }) {
  const { colores } = useTheme();
  return (
    <View style={styles.especialista}>
      {especialista.foto ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.foto, { backgroundColor: colores.panel }]}
        >
          <Image
            source={{ uri: especialista.foto }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={duracion.pestana}
          />
        </View>
      ) : (
        <Monograma tamano="pequeno" />
      )}
      <Text style={[styles.nombreEspecialista, { color: colores.texto }]}>{especialista.nombre}</Text>
    </View>
  );
}

/** Botón circular para regresar, fijo bajo la barra de estado y por encima de la foto. */
function BotonRegresar({
  sobreImagen,
  top,
  onPress,
}: {
  sobreImagen: boolean;
  top: number;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const colorIcono = sobreImagen ? colores.textoSobrePanel : colores.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Regresar"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={[styles.regresar, { top }]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.circuloRegresar,
            {
              backgroundColor: sobreImagen
                ? colores.veloVisor
                : pressed
                  ? colores.presionado
                  : colores.transparente,
            },
            estilo,
          ]}
        >
          <ArrowLeft color={colorIcono} size={icono.tamano} strokeWidth={icono.trazo} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  imagen: {
    width: '100%',
    aspectRatio: catalogo.proporcionImagen,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bloque: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
    gap: espacio.s,
  },
  nombre: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
  metadatos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: espacio.s,
    rowGap: espacio.xs,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
  },
  separador: {
    width: espacio.xs,
    height: espacio.xs,
    borderRadius: radio.pastilla,
  },
  textoDato: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  precio: {
    marginTop: espacio.s,
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  sinPrecio: {
    marginTop: espacio.s,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontVariant: ['tabular-nums'],
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  accion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
  },
  seccion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.m,
  },
  tituloSeccion: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  // Descripción del servicio: párrafo largo con interlineado 1.625.
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  lista: {
    gap: espacio.s,
  },
  elemento: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoElemento: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoElemento: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  especialistas: {
    gap: espacio.m,
  },
  especialista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  foto: {
    width: monograma.pequeno,
    height: monograma.pequeno,
    borderRadius: radio.pastilla,
    overflow: 'hidden',
  },
  nombreEspecialista: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  regresar: {
    position: 'absolute',
    left: pantalla.margen - espacio.s,
    width: toqueMinimo,
    height: toqueMinimo,
  },
  circuloRegresar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  esqueleto: {
    flex: 1,
  },
  imagenEsqueleto: {
    width: '100%',
    aspectRatio: catalogo.proporcionImagen,
    borderRadius: 0,
  },
  tituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.titulo.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  precioEsqueleto: {
    marginTop: espacio.s,
    width: esqueleto.anchoCorto,
    height: esqueleto.lineaGrande,
  },
  botonEsqueleto: {
    marginTop: espacio.l,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
  lineaMedia: {
    marginTop: espacio.l,
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  linea: {
    height: esqueleto.linea,
  },
});
