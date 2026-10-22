import { Image } from 'expo-image';
import {
  ChevronRight,
  Info,
  Mail,
  Map as Mapa,
  MapPin,
  MessageCircle,
  Phone,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import {
  borde,
  espacio,
  fuente,
  icono,
  pantalla,
  perfil,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type {
  DiaHorarioSalon,
  DiaInhabilSalon,
  FilaContacto as DatosFilaContacto,
  TipoContacto,
  ValorSalon,
} from '../viewmodels/useSalonViewModel';
import { medidasSalon } from './medidasSalon';

/* ── Títulos y textos ────────────────────────────────────────────────────────────────────────── */

/** Título de sección en Playfair (como los h2 de la web), anunciado como encabezado. */
export function TituloSeccion({ titulo }: { titulo: string }) {
  const { colores } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.titulo, { color: colores.textoSuave }]}>
      {titulo}
    </Text>
  );
}

/** Párrafos de la configuración: el primero en el texto secundario, los demás en el de cuerpo. */
export function Parrafos({ parrafos }: { parrafos: string[] }) {
  const { colores } = useTheme();
  return (
    <View style={styles.parrafos}>
      {parrafos.map((parrafo, indice) => (
        <Text
          // Texto fijo de la configuración: su posición es su identidad.
          key={`${indice}-${parrafo.slice(0, 16)}`}
          style={[styles.parrafo, { color: indice === 0 ? colores.textoSuave : colores.textoCuerpo }]}
        >
          {parrafo}
        </Text>
      ))}
    </View>
  );
}

/** Imagen del salón en arco (eco del monograma), solo si la configuración trae una https. */
export function ArcoSalon({ imagen }: { imagen: string }) {
  const { colores } = useTheme();
  return (
    <Image
      source={{ uri: imagen }}
      recyclingKey={imagen}
      style={[styles.arco, { backgroundColor: colores.panel }]}
      contentFit="cover"
      accessible
      accessibilityLabel="El salón"
    />
  );
}

/** Aviso sin conexión: se muestran los datos guardados (o los de respaldo). */
export function AvisoSinRed({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={[styles.aviso, { backgroundColor: colores.campoFondo, borderColor: colores.campoBorde }]}
    >
      <Info color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      <Text style={[styles.textoAviso, { color: colores.campoTexto }]}>{texto}</Text>
    </View>
  );
}

/* ── Valores ─────────────────────────────────────────────────────────────────────────────────── */

/** "Lo que nos distingue": cada valor con su título en Playfair y un filete de oro arriba. */
export function ListaValores({ valores }: { valores: ValorSalon[] }) {
  const { colores } = useTheme();
  return (
    <View style={styles.valores}>
      {valores.map((valor) => (
        <View key={valor.titulo} style={[styles.valor, { borderTopColor: colores.iconografia }]}>
          <Text style={[styles.tituloValor, { color: colores.oroTexto }]}>{valor.titulo}</Text>
          <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>{valor.descripcion}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── Contacto ────────────────────────────────────────────────────────────────────────────────── */

const ICONO_CONTACTO: Record<TipoContacto, LucideIcon> = {
  telefono: Phone,
  whatsapp: MessageCircle,
  correo: Mail,
  domicilio: MapPin,
  mapa: Mapa,
};

/** Tarjeta con las filas de contacto separadas por un filete. */
export function TarjetaContacto({
  filas,
  onAbrir,
}: {
  filas: DatosFilaContacto[];
  onAbrir: (url: string) => void;
}) {
  const { colores } = useTheme();
  return (
    <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
      {filas.map((fila, indice) => (
        <View key={fila.tipo}>
          {indice > 0 ? <View style={[styles.divisor, { backgroundColor: colores.hairline }]} /> : null}
          <FilaContacto fila={fila} onAbrir={onAbrir} />
        </View>
      ))}
    </View>
  );
}

/**
 * Fila de contacto: ícono en su cuadrito, título y detalle opcional. Con enlace es un "link" que se
 * hunde al tocarlo y lleva flecha; sin enlace (el domicilio) solo se lee.
 */
function FilaContacto({ fila, onAbrir }: { fila: DatosFilaContacto; onAbrir: (url: string) => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const Icono = ICONO_CONTACTO[fila.tipo];
  const etiqueta = fila.detalle ? `${fila.titulo}, ${fila.detalle}` : fila.titulo;
  const contenido = (
    <>
      <View style={[styles.cuadrito, { backgroundColor: colores.cuadritoIcono }]}>
        <Icono color={colores.oroTexto} size={perfil.icono} strokeWidth={icono.trazo} />
      </View>
      <View style={styles.textosFila}>
        <Text style={[styles.tituloFila, { color: fila.url ? colores.enlace : colores.texto }]}>{fila.titulo}</Text>
        {fila.detalle ? (
          <Text style={[styles.detalleFila, { color: colores.textoSuave }]}>{fila.detalle}</Text>
        ) : null}
      </View>
    </>
  );

  const { url } = fila;
  if (!url) {
    return (
      <View accessible accessibilityLabel={etiqueta} style={[styles.fila, styles.contenidoFila]}>
        {contenido}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={etiqueta}
      onPress={() => onAbrir(url)}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.fila}
    >
      <Animated.View style={[styles.contenidoFila, estilo]}>
        {contenido}
        <ChevronRight color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Animated.View>
    </Pressable>
  );
}

/* ── Horario y días sin servicio ─────────────────────────────────────────────────────────────── */

/** Los siete días con su horario; el de hoy en negritas con un punto de oro y "Hoy". */
export function TarjetaHorario({ dias }: { dias: DiaHorarioSalon[] }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.tarjeta, styles.rellenoTarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
      {dias.map((dia) => {
        const peso = dia.hoy ? styles.textoHoy : null;
        return (
          <View
            key={dia.dia}
            accessible
            accessibilityLabel={`${dia.nombre}${dia.hoy ? ', hoy' : ''}: ${dia.horas}`}
            style={styles.filaDia}
          >
            <View style={styles.nombreDia}>
              <Text style={[styles.textoDia, { color: colores.texto }, peso]}>{dia.nombre}</Text>
              {dia.hoy ? (
                <View style={styles.marcaHoy}>
                  <View style={[styles.puntoHoy, { backgroundColor: colores.oro }]} />
                  <Text style={[styles.etiquetaHoy, { color: colores.oroTexto }]}>Hoy</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.textoDia, styles.horas, { color: dia.cerrado ? colores.textoSuave : colores.texto }, peso]}>
              {dia.horas}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Próximos días sin servicio con su motivo; sin ninguno, el texto de vacío. */
export function ListaInhabiles({ dias, vacio }: { dias: DiaInhabilSalon[]; vacio: string }) {
  const { colores } = useTheme();
  if (dias.length === 0) {
    return <Text style={[styles.parrafo, { color: colores.textoSuave }]}>{vacio}</Text>;
  }
  return (
    <View style={[styles.tarjeta, styles.rellenoTarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
      {dias.map((dia) => (
        <View
          key={dia.fecha}
          accessible
          accessibilityLabel={dia.motivo ? `${dia.fechaLegible}: ${dia.motivo}` : dia.fechaLegible}
          style={styles.inhabil}
        >
          <Text style={[styles.textoDia, styles.textoHoy, { color: colores.texto }]}>{dia.fechaLegible}</Text>
          {dia.motivo ? <Text style={[styles.detalleFila, { color: colores.textoSuave }]}>{dia.motivo}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  parrafos: {
    gap: espacio.m,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  arco: {
    alignSelf: 'center',
    width: medidasSalon.anchoArco,
    aspectRatio: medidasSalon.proporcionArco,
    borderTopLeftRadius: medidasSalon.anchoArco / 2,
    borderTopRightRadius: medidasSalon.anchoArco / 2,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    marginHorizontal: pantalla.margen,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    borderRadius: radio.campo,
    // Borde del campo (3:1) en lugar de sombra, como el aviso de sesión de Inicio.
    borderWidth: borde.hairline,
  },
  textoAviso: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  valores: {
    gap: espacio.xl,
  },
  valor: {
    gap: espacio.xs,
    paddingTop: espacio.l,
    borderTopWidth: borde.hairline,
  },
  tituloValor: {
    fontFamily: fuente.titulo,
    fontSize: tipo.tituloTarjeta.tamano,
    lineHeight: tipo.tituloTarjeta.linea,
    letterSpacing: tracking.tituloTarjeta,
  },
  tarjeta: {
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  rellenoTarjeta: {
    paddingHorizontal: espacio.xl,
    paddingVertical: espacio.m,
  },
  divisor: {
    height: borde.hairline,
  },
  fila: {
    minHeight: perfil.altoFila,
    justifyContent: 'center',
    paddingVertical: perfil.rellenoFila,
    paddingHorizontal: espacio.xl,
  },
  contenidoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.l,
  },
  cuadrito: {
    width: perfil.cuadrito,
    height: perfil.cuadrito,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
  },
  textosFila: {
    flex: 1,
  },
  tituloFila: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  detalleFila: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  filaDia: {
    minHeight: toqueMinimo - espacio.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.m,
  },
  nombreDia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  textoDia: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  horas: {
    fontVariant: ['tabular-nums'],
  },
  textoHoy: {
    fontFamily: fuente.textoFuerte,
  },
  marcaHoy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
  },
  puntoHoy: {
    width: medidasSalon.puntoHoy,
    height: medidasSalon.puntoHoy,
    borderRadius: medidasSalon.puntoHoy / 2,
  },
  etiquetaHoy: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  inhabil: {
    gap: espacio.xxs,
    paddingVertical: espacio.s,
  },
});
