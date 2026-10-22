import { Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  avisosInternos,
  escalaPresionadoTarjeta,
  espacio,
  esqueleto,
  fuente,
  icono,
  radio,
  sombra,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { horaRelativa, type Aviso } from '../viewmodels/useNotificaciones';

interface FilaAvisoProps {
  aviso: Aviso;
  /** Momento para la hora relativa (milisegundos): cambia al enfocar y al refrescar. */
  ahora: number;
  /** Reciben el aviso o su id: así las referencias son estables y la fila memoizada no se redibuja. */
  onAbrir: (aviso: Aviso) => void;
  onBorrar: (id: string) => void;
}

/**
 * Un aviso de la bandeja: punto de no leído, título, mensaje y hora relativa, con el botón de
 * borrar a la derecha. Tocarla marca el aviso como leído y abre su destino si tiene. Se hunde al
 * tocarla (0.99 en 140 ms; con movimiento reducido solo baja la opacidad).
 */
export const FilaAviso = memo(function FilaAviso({ aviso, ahora, onAbrir, onBorrar }: FilaAvisoProps) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion(escalaPresionadoTarjeta);
  const hora = horaRelativa(aviso.fecha, new Date(ahora));

  const etiqueta = [aviso.leida ? '' : 'No leído', aviso.titulo, aviso.mensaje, hora].filter(Boolean).join('. ');
  let pista: string | undefined;
  if (aviso.destino) {
    pista = 'Abre el aviso';
  } else if (!aviso.leida) {
    pista = 'Marca el aviso como leído';
  }

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
        accessibilityHint={pista}
        onPress={() => onAbrir(aviso)}
        onPressIn={hundir}
        onPressOut={soltar}
        style={styles.contenido}
      >
        <View style={styles.columnaPunto}>
          {aviso.leida ? null : (
            <View
              accessible
              accessibilityLabel="No leído"
              style={[styles.punto, { backgroundColor: colores.foco }]}
            />
          )}
        </View>
        <View style={styles.datos}>
          <View style={styles.encabezado}>
            <Text numberOfLines={2} style={[styles.titulo, { color: colores.texto }]}>
              {aviso.titulo}
            </Text>
            {hora ? <Text style={[styles.hora, { color: colores.textoSuave }]}>{hora}</Text> : null}
          </View>
          {aviso.mensaje ? (
            <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{aviso.mensaje}</Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Borrar aviso: ${aviso.titulo}`}
        onPress={() => onBorrar(aviso.id)}
        style={({ pressed }) => [
          styles.borrar,
          { backgroundColor: pressed ? colores.presionado : colores.transparente },
        ]}
      >
        <Trash2 color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Pressable>
    </Animated.View>
  );
});

/** Esqueleto con la forma de la fila, para la carga de la bandeja. */
export function FilaAvisoEsqueleto() {
  const { colores } = useTheme();
  return (
    <View
      style={[
        styles.tarjeta,
        styles.esqueleto,
        { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta },
      ]}
    >
      <Skeleton estilo={[styles.lineaTitulo, { width: esqueleto.anchoMedio }]} />
      <Skeleton estilo={[styles.lineaEsqueleto, { width: esqueleto.anchoCorto }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  contenido: {
    flex: 1,
    minHeight: toqueMinimo,
    flexDirection: 'row',
    paddingVertical: espacio.l,
    paddingLeft: espacio.m,
    gap: espacio.s,
  },
  // Columna fija: con o sin punto, los textos de todas las filas quedan alineados.
  columnaPunto: {
    width: avisosInternos.punto,
    // Centra el punto con la primera línea del título.
    paddingTop: (tipo.cuerpo.linea - avisosInternos.punto) / 2,
  },
  punto: {
    width: avisosInternos.punto,
    height: avisosInternos.punto,
    borderRadius: radio.pastilla,
  },
  datos: {
    flex: 1,
    gap: espacio.xs,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.s,
  },
  titulo: {
    flexShrink: 1,
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  hora: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    fontVariant: ['tabular-nums'],
  },
  mensaje: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  // Área táctil de 48 en la esquina de arriba, alineada con el título.
  borrar: {
    width: toqueMinimo,
    height: toqueMinimo,
    marginTop: espacio.xs,
    marginRight: espacio.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  esqueleto: {
    flexDirection: 'column',
    padding: espacio.l,
    gap: espacio.s,
  },
  lineaTitulo: {
    height: esqueleto.lineaGrande,
  },
  lineaEsqueleto: {
    height: esqueleto.linea,
  },
});
