import { CalendarDays, ChevronRight, Clock, Store, UserRound } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  escalaPresionadoTarjeta,
  espacio,
  esqueleto,
  fuente,
  icono,
  insignia,
  radio,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import {
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  etiquetaEstadoCita,
  fechaLegible,
  horaLegible,
  limitePagoCorto,
  type Cita,
} from '../models/citaModel';
import { BadgeEstado } from './BadgeEstado';

interface TarjetaCitaProps {
  cita: Cita;
  onPress: () => void;
  /** Acción opcional debajo del contenido (por ejemplo, en el historial). Fuera del área tocable. */
  accion?: ReactNode;
}

function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * Una cita de Mis citas: servicio, especialista, fecha y hora, estado de la cita y del anticipo y,
 * con el anticipo pendiente, su plazo y si se paga en el salón. Se hunde al tocarla (respuesta
 * compartida de usePresion con la escala de tarjeta: 0.99 en 140 ms; con movimiento reducido solo
 * baja la opacidad).
 */
export const TarjetaCita = memo(function TarjetaCita({ cita, onPress, accion }: TarjetaCitaProps) {
  const { colores, oscuro } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion(escalaPresionadoTarjeta);

  const servicio = cita.servicioNombre || 'Cita en el salón';
  const fecha = conMayuscula(fechaLegible(cita.fechaHoraInicio));
  const hora = horaLegible(cita.fechaHoraInicio);
  const cuando = [fecha, hora].filter(Boolean).join(' · ');
  const estadoCita = etiquetaEstadoCita(cita.estado);
  const anticipo = estadoAnticipo(cita);
  const etiquetaAnticipo = anticipo === 'no_requiere' ? null : etiquetaEstadoAnticipo(anticipo);
  const pendiente = anticipo === 'pendiente';
  const limite = pendiente ? limitePagoCorto(cita.anticipoVenceEn) : null;
  const enSalon = pendiente && cita.anticipoEnSalon;
  const coloresSalon = (oscuro ? insignia.oscuro : insignia.claro).neutro;

  const etiqueta = [
    servicio,
    cita.especialistaNombre ? `con ${cita.especialistaNombre}` : '',
    [fecha, hora].filter(Boolean).join(', '),
    estadoCita.texto,
    etiquetaAnticipo?.texto ?? '',
    enSalon ? 'Paga en salón' : '',
    limite ?? '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View
      style={[
        styles.tarjeta,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
        estiloPresion,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityHint="Abre el detalle de la cita"
        onPress={onPress}
        onPressIn={hundir}
        onPressOut={soltar}
        style={styles.contenido}
      >
        {/* El Pressable ya anuncia todo en su etiqueta: el contenido no se lee por separado. */}
        <View importantForAccessibility="no-hide-descendants" style={styles.columnas}>
          <View style={styles.datos}>
            <Text numberOfLines={2} style={[styles.servicio, { color: colores.texto }]}>
              {servicio}
            </Text>

            {cita.especialistaNombre ? (
              <Dato Icono={UserRound} texto={`Con ${cita.especialistaNombre}`} />
            ) : null}
            {cuando ? <Dato Icono={CalendarDays} texto={cuando} /> : null}

            <View style={styles.insignias}>
              <BadgeEstado texto={estadoCita.texto} tono={estadoCita.tono} />
              {etiquetaAnticipo ? (
                <BadgeEstado texto={etiquetaAnticipo.texto} tono={etiquetaAnticipo.tono} />
              ) : null}
              {enSalon ? (
                <View
                  style={[
                    styles.pastilla,
                    { backgroundColor: coloresSalon.fondo, borderColor: insignia.borde.neutro },
                  ]}
                >
                  <Store
                    color={coloresSalon.texto}
                    size={icono.tamanoPequeno}
                    strokeWidth={icono.trazo}
                  />
                  <Text style={[styles.textoPastilla, { color: coloresSalon.texto }]}>
                    Paga en salón
                  </Text>
                </View>
              ) : null}
            </View>

            {/* El plazo de pago pide acción: va en el principal y no en el secundario. */}
            {limite ? <Dato Icono={Clock} texto={limite} principal /> : null}
          </View>

          <ChevronRight color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
      </Pressable>

      {accion ? <View style={styles.accion}>{accion}</View> : null}
    </Animated.View>
  );
});

function Dato({
  Icono,
  texto,
  principal = false,
}: {
  Icono: typeof Clock;
  texto: string;
  principal?: boolean;
}) {
  const { colores } = useTheme();
  // Especialista y fecha en el secundario (4.8:1 sobre terracota en claro y en oscuro).
  const color = principal ? colores.texto : colores.textoSuave;
  return (
    <View style={styles.dato}>
      <View style={styles.iconoDato}>
        <Icono color={color} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.textoDato, { color }]}>{texto}</Text>
    </View>
  );
}

/** Esqueleto con la forma de la tarjeta, para la carga de Mis citas. */
export function TarjetaCitaEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        styles.contenido,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
      ]}
    >
      <Skeleton estilo={[styles.lineaTitulo, { width: esqueleto.anchoMedio }]} />
      <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
      <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoMedio }]} />
      <View style={styles.insignias}>
        <Skeleton estilo={styles.insigniaEsqueleto} />
        <Skeleton estilo={styles.insigniaEsqueleto} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  contenido: {
    minHeight: toqueMinimo,
    padding: espacio.l,
    gap: espacio.s,
  },
  columnas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  datos: {
    flex: 1,
    gap: espacio.s,
  },
  servicio: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  iconoDato: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.pequeno.linea - icono.tamanoPequeno) / 2,
  },
  textoDato: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  // Mismo lenguaje que BadgeEstado: filete interior de 1px descontado del relleno.
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingHorizontal: insignia.rellenoHorizontal - borde.hairline,
    paddingVertical: insignia.rellenoVertical - borde.hairline,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  textoPastilla: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  accion: {
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.l,
  },
  lineaTitulo: {
    height: esqueleto.lineaGrande,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
  insigniaEsqueleto: {
    width: toqueMinimo * 2,
    height: tipo.etiqueta.linea + insignia.rellenoVertical * 2,
    borderRadius: radio.pastilla,
  },
});
