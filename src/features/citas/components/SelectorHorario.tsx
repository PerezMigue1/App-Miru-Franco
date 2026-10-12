import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { transicionSeleccion, usePresion } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  espacio,
  fuente,
  radio,
  reserva,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { horaLegible, type Slot } from '../models/citaModel';

/** Parte una lista en filas de `columnas` elementos. */
function enFilas<T>(elementos: T[], columnas: number): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < elementos.length; i += columnas) {
    filas.push(elementos.slice(i, i + columnas));
  }
  return filas;
}

/** Celdas vacías que completan la última fila para que todas las columnas midan lo mismo. */
function relleno(fila: unknown[]): number[] {
  return Array.from({ length: reserva.columnasHorario - fila.length }, (_, i) => i);
}

/** Texto de la hora de un horario: el que manda el servidor o, si no viene, el calculado. */
export function horaDeSlot(slot: Slot): string {
  return slot.horaLocal || horaLegible(slot.inicio);
}

interface CuadriculaHorariosProps {
  slots: Slot[];
  seleccionado: Slot | null;
  onElegir: (slot: Slot) => void;
}

/** Horarios libres en una cuadrícula de tres columnas; el elegido va en el color de selección. */
export function CuadriculaHorarios({ slots, seleccionado, onElegir }: CuadriculaHorariosProps) {
  return (
    <View style={styles.cuadricula}>
      {enFilas(slots, reserva.columnasHorario).map((fila) => (
        <View key={fila[0].inicio} style={styles.fila}>
          {fila.map((slot) => (
            <ChipHorario
              key={slot.inicio}
              slot={slot}
              activo={seleccionado?.inicio === slot.inicio}
              onElegir={onElegir}
            />
          ))}
          {relleno(fila).map((i) => (
            <View key={`vacio-${i}`} style={styles.celdaVacia} />
          ))}
        </View>
      ))}
    </View>
  );
}

interface ChipHorarioProps {
  slot: Slot;
  activo: boolean;
  onElegir: (slot: Slot) => void;
}

/** Un horario: se hunde al tocarlo y el relleno de selección se funde en 140 ms. */
const ChipHorario = memo(function ChipHorario({ slot, activo, onElegir }: ChipHorarioProps) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  const hora = horaDeSlot(slot);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={hora}
      onPress={() => onElegir(slot)}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.pulsable}
    >
      <Animated.View
        style={[
          styles.horario,
          transicionSeleccion,
          { backgroundColor: activo ? colores.seleccion : colores.superficieSecundaria },
          estilo,
        ]}
      >
        <Text
          style={[styles.textoHorario, { color: activo ? colores.textoSobreSeleccion : colores.texto }]}
        >
          {hora}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const CHIPS_ESQUELETO = Array.from({ length: reserva.horariosEsqueleto }, (_, i) => i);

/** Esqueleto de la cuadrícula mientras cargan los horarios. */
export function CuadriculaHorariosEsqueleto() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando horarios"
      style={styles.cuadricula}
    >
      {enFilas(CHIPS_ESQUELETO, reserva.columnasHorario).map((fila) => (
        <View key={fila[0]} style={styles.fila}>
          {fila.map((i) => (
            <Skeleton key={i} estilo={styles.horarioEsqueleto} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cuadricula: {
    gap: espacio.s,
  },
  fila: {
    flexDirection: 'row',
    gap: espacio.s,
  },
  pulsable: {
    flex: 1,
  },
  horario: {
    flexGrow: 1,
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.xs,
    borderRadius: radio.pastilla,
  },
  textoHorario: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  celdaVacia: {
    flex: 1,
  },
  horarioEsqueleto: {
    flex: 1,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
});
