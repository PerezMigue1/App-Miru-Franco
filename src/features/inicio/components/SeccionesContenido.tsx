import { Image } from 'expo-image';
import { ArrowRight, ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Enlace } from '@/features/auth/components/AuthContainer';
import type { IntegranteEquipo, PreguntaFrecuente } from '@/features/salon/models/contenidoSalonModel';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Monograma } from '@/shared/ui/Monograma';
import { useEntradaContenido, usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  duracion,
  escalaPresionadoTarjeta,
  esqueleto,
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
import { useTheme } from '@/shared/ui/useTheme';

import type { DestinoPromocion } from '../models/contenidoInicioModel';
import type { PromocionInicio, SeccionContenidoInicio } from '../viewmodels/useContenidoInicio';
import { medidasInicio } from './medidasInicio';

/** Título y texto del error de una sección (textos del sitio). */
export interface ErrorSeccion {
  titulo: string;
  texto: string;
}

/* ── Encabezado y sección genérica ───────────────────────────────────────────────────────────── */

/**
 * Título de sección como los de la home de la web (Playfair, sin eyebrow) y su descripción opcional.
 * Devuelve un fragmento: el título queda como hijo directo de la sección (el mosaico de la galería y
 * sus pruebas lo buscan ahí).
 */
export function EncabezadoSeccion({ titulo, descripcion }: { titulo: string; descripcion?: string | null }) {
  const { colores } = useTheme();
  return (
    <>
      {/* --encabezados-alterno como la web: 8.8:1 sobre lino y 6.0:1 sobre carbón. */}
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSuave }]}>
        {titulo}
      </Text>
      {descripcion ? (
        <Text style={[styles.descripcion, { color: colores.textoSuave }]}>{descripcion}</Text>
      ) : null}
    </>
  );
}

interface SeccionListaProps<T> {
  seccion: SeccionContenidoInicio<T>;
  error: ErrorSeccion;
  /** Lo que anuncia el lector de pantalla mientras carga. */
  etiquetaCargando: string;
  children: (datos: T[]) => ReactNode;
}

/**
 * Sección de una lista de contenido, como la web: vacía, no se muestra; mientras carga, un esqueleto
 * discreto; si falla, el error con Reintentar en su lugar; con datos, el título y la lista.
 */
function SeccionLista<T>({ seccion, error, etiquetaCargando, children }: SeccionListaProps<T>) {
  if (seccion.estado === 'vacio') {
    return null;
  }
  if (seccion.estado === 'cargando') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={etiquetaCargando}
        style={styles.seccion}
      >
        <Skeleton estilo={styles.tituloEsqueleto} />
        <Skeleton estilo={styles.bloqueEsqueleto} />
      </View>
    );
  }
  return (
    <View style={styles.seccion}>
      <EncabezadoSeccion titulo={seccion.titulo} />
      {seccion.estado === 'error' ? (
        <EmptyState
          titulo={error.titulo}
          mensaje={seccion.mensajeError ?? error.texto}
          accion={{ titulo: 'Reintentar', onPress: seccion.reintentar }}
        />
      ) : (
        children(seccion.datos)
      )}
    </View>
  );
}

/* ── Promociones ─────────────────────────────────────────────────────────────────────────────── */

export function SeccionPromociones({
  seccion,
  error,
  onAbrir,
}: {
  seccion: SeccionContenidoInicio<PromocionInicio>;
  error: ErrorSeccion;
  onAbrir: (destino: DestinoPromocion) => void;
}) {
  return (
    <SeccionLista seccion={seccion} error={error} etiquetaCargando="Cargando promociones">
      {(promociones) => (
        <View style={styles.lista}>
          {promociones.map((promocion) => (
            <TarjetaPromocion key={promocion.id} promocion={promocion} onAbrir={onAbrir} />
          ))}
        </View>
      )}
    </SeccionLista>
  );
}

/** Tarjeta de una promoción; con destino, toda la tarjeta es el enlace (se hunde como tarjeta). */
function TarjetaPromocion({
  promocion,
  onAbrir,
}: {
  promocion: PromocionInicio;
  onAbrir: (destino: DestinoPromocion) => void;
}) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion(escalaPresionadoTarjeta);
  const { titulo, descripcion, imagenUrl, vigencia, destino } = promocion;
  const etiqueta = [`${titulo}, ${descripcion}`, vigencia].filter(Boolean).join(' ');

  const contenido = (
    <>
      {imagenUrl ? (
        <Image
          source={{ uri: imagenUrl }}
          recyclingKey={imagenUrl}
          style={[styles.imagenPromocion, { backgroundColor: colores.panel }]}
          contentFit="cover"
          transition={duracion.pestana}
          accessible={false}
        />
      ) : null}
      <View style={styles.cuerpoTarjeta}>
        <View style={styles.filaTitulo}>
          <Text style={[styles.tituloTarjeta, { color: colores.texto }]}>{titulo}</Text>
          {destino ? (
            <ArrowRight color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          ) : null}
        </View>
        <Text style={[styles.textoTarjeta, { color: colores.textoSuave }]}>{descripcion}</Text>
        {vigencia ? <Text style={[styles.vigencia, { color: colores.textoSuave }]}>{vigencia}</Text> : null}
      </View>
    </>
  );
  const tarjeta = [styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }];

  if (!destino) {
    return (
      <View accessible accessibilityLabel={etiqueta} style={tarjeta}>
        {contenido}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={etiqueta}
      accessibilityHint={destino.tipo === 'url' ? 'Se abre fuera de la app' : 'Abre la promoción'}
      onPress={() => onAbrir(destino)}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View style={[tarjeta, estilo]}>{contenido}</Animated.View>
    </Pressable>
  );
}

/* ── Equipo ──────────────────────────────────────────────────────────────────────────────────── */

export function SeccionEquipo({
  seccion,
  error,
}: {
  seccion: SeccionContenidoInicio<IntegranteEquipo>;
  error: ErrorSeccion;
}) {
  const { colores } = useTheme();
  return (
    <SeccionLista seccion={seccion} error={error} etiquetaCargando="Cargando el equipo">
      {(equipo) => (
        <View style={[styles.tarjetaFilas, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
          {equipo.map((integrante, indice) => (
            <View key={`${integrante.nombre}-${integrante.puesto}`}>
              {indice > 0 ? <View style={[styles.divisor, { backgroundColor: colores.hairline }]} /> : null}
              <FilaIntegrante integrante={integrante} />
            </View>
          ))}
        </View>
      )}
    </SeccionLista>
  );
}

/** Foto (o monograma), nombre en Playfair, puesto y presentación; se lee como un solo elemento. */
function FilaIntegrante({ integrante }: { integrante: IntegranteEquipo }) {
  const { colores } = useTheme();
  const { nombre, puesto, foto, bio } = integrante;
  return (
    <View accessible accessibilityLabel={[nombre, puesto, bio].filter(Boolean).join(', ')} style={styles.filaEquipo}>
      {foto ? (
        <Image
          source={{ uri: foto }}
          recyclingKey={foto}
          style={[styles.fotoEquipo, { backgroundColor: colores.panel }]}
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <Monograma tamano="mediano" />
      )}
      <View style={styles.textosEquipo}>
        <Text style={[styles.nombreEquipo, { color: colores.texto }]}>{nombre}</Text>
        <Text style={[styles.puesto, { color: colores.textoSuave }]}>{puesto}</Text>
        {bio ? <Text style={[styles.textoTarjeta, { color: colores.textoSuave }]}>{bio}</Text> : null}
      </View>
    </View>
  );
}

/* ── Preguntas frecuentes ────────────────────────────────────────────────────────────────────── */

export function SeccionPreguntas({
  seccion,
  error,
}: {
  seccion: SeccionContenidoInicio<PreguntaFrecuente>;
  error: ErrorSeccion;
}) {
  return (
    <SeccionLista seccion={seccion} error={error} etiquetaCargando="Cargando las preguntas frecuentes">
      {(preguntas) => (
        <View style={styles.listaCorta}>
          {preguntas.map((pregunta) => (
            <PreguntaAcordeon key={pregunta.id} pregunta={pregunta} />
          ))}
        </View>
      )}
    </SeccionLista>
  );
}

/** Como el <details> de la web: la pregunta es el botón y la respuesta aparece debajo. */
function PreguntaAcordeon({ pregunta }: { pregunta: PreguntaFrecuente }) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  const { estilo, hundir, soltar } = usePresion();
  const [abierta, setAbierta] = useState(false);
  return (
    <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pregunta.pregunta}
        accessibilityState={{ expanded: abierta }}
        onPress={() => setAbierta((actual) => !actual)}
        onPressIn={hundir}
        onPressOut={soltar}
      >
        <Animated.View style={[styles.filaPregunta, estilo]}>
          <Text style={[styles.pregunta, { color: colores.texto }]}>{pregunta.pregunta}</Text>
          <View style={abierta ? styles.chevronAbierto : null}>
            <ChevronDown color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
        </Animated.View>
      </Pressable>
      {abierta ? (
        <Animated.View entering={entrada} style={styles.respuesta}>
          <Text style={[styles.textoTarjeta, { color: colores.textoSuave }]}>{pregunta.respuesta}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/* ── Sobre nosotros y cierre ─────────────────────────────────────────────────────────────────── */

export function SeccionSobreNosotros({
  titulo,
  parrafos,
  imagen,
  enlace,
  onAbrirSalon,
}: {
  titulo: string;
  parrafos: string[];
  imagen: string | null;
  enlace: string;
  onAbrirSalon: () => void;
}) {
  const { colores } = useTheme();
  return (
    <View style={styles.seccion}>
      <EncabezadoSeccion titulo={titulo} />
      {imagen ? (
        // Arco como el de la web: eco de la forma del monograma.
        <Image
          source={{ uri: imagen }}
          recyclingKey={imagen}
          style={[styles.arco, { backgroundColor: colores.panel }]}
          contentFit="cover"
          accessible
          accessibilityLabel="El salón"
        />
      ) : null}
      <View style={styles.listaCorta}>
        {parrafos.map((parrafo, indice) => (
          <Text
            // Los párrafos son texto fijo de la configuración: su posición es su identidad.
            key={`${indice}-${parrafo.slice(0, 16)}`}
            style={[styles.parrafo, { color: indice === 0 ? colores.textoSuave : colores.textoCuerpo }]}
          >
            {parrafo}
          </Text>
        ))}
      </View>
      <Enlace texto={enlace} onPress={onAbrirSalon} />
    </View>
  );
}

/** Cierre: banda carbón con una sola acción, como la banda vino del final de la home de la web. */
export function SeccionCierre({
  titulo,
  texto,
  boton,
  onReservar,
}: {
  titulo: string;
  texto: string | null;
  boton: string;
  onReservar: () => void;
}) {
  const { colores } = useTheme();
  return (
    <View style={[styles.cierre, { backgroundColor: colores.panel }]}>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSobrePanel }]}>
        {titulo}
      </Text>
      {texto ? <Text style={[styles.parrafo, { color: colores.textoSuaveSobrePanel }]}>{texto}</Text> : null}
      <Button
        titulo={boton}
        onPress={onReservar}
        icono={<ArrowRight color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />}
      />
    </View>
  );
}

const sombraTarjeta = {
  shadowOpacity: sombra.tarjeta.opacidad,
  shadowRadius: sombra.tarjeta.radio,
  shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
  elevation: sombra.tarjeta.elevacion,
};

const styles = StyleSheet.create({
  seccion: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x5,
    gap: espacio.xl,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.tituloPagina,
  },
  // La sección separa sus hijos con su gap: la descripción se pega al título como en la web.
  descripcion: {
    marginTop: medidasInicio.separacionDescripcion - espacio.xl,
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  tituloEsqueleto: {
    width: esqueleto.anchoCorto,
    height: esqueleto.lineaGrande,
  },
  bloqueEsqueleto: {
    height: medidasInicio.altoEsqueleto,
    borderRadius: radio.tarjeta,
  },
  lista: {
    gap: espacio.l,
  },
  listaCorta: {
    gap: espacio.m,
  },
  tarjeta: {
    borderRadius: radio.tarjeta,
    overflow: 'hidden',
    ...sombraTarjeta,
  },
  tarjetaFilas: {
    borderRadius: radio.tarjeta,
    ...sombraTarjeta,
  },
  imagenPromocion: {
    width: '100%',
    aspectRatio: medidasInicio.proporcionPromocion,
  },
  cuerpoTarjeta: {
    gap: espacio.xs,
    padding: espacio.xl,
  },
  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  tituloTarjeta: {
    flex: 1,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  textoTarjeta: {
    fontFamily: fuente.texto,
    fontSize: tipo.descripcion.tamano,
    lineHeight: tipo.descripcion.linea,
  },
  vigencia: {
    marginTop: espacio.xs,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  divisor: {
    height: borde.hairline,
  },
  filaEquipo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.l,
    padding: espacio.xl,
  },
  fotoEquipo: {
    width: medidasInicio.fotoEquipo,
    height: medidasInicio.fotoEquipo,
    borderRadius: radio.pastilla,
  },
  textosEquipo: {
    flex: 1,
    gap: espacio.xxs,
  },
  nombreEquipo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.tituloTarjeta.tamano,
    lineHeight: tipo.tituloTarjeta.linea,
    letterSpacing: tracking.tituloTarjeta,
  },
  puesto: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  filaPregunta: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.xl,
    paddingVertical: espacio.m,
  },
  pregunta: {
    flex: 1,
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  chevronAbierto: {
    transform: [{ rotate: '180deg' }],
  },
  respuesta: {
    paddingHorizontal: espacio.xl,
    paddingBottom: espacio.l,
  },
  arco: {
    alignSelf: 'center',
    width: medidasInicio.anchoArco,
    aspectRatio: medidasInicio.proporcionArco,
    borderTopLeftRadius: medidasInicio.anchoArco / 2,
    borderTopRightRadius: medidasInicio.anchoArco / 2,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  cierre: {
    marginTop: espacio.x5,
    paddingHorizontal: pantalla.margen,
    paddingVertical: espacio.x5,
    gap: espacio.l,
  },
});
