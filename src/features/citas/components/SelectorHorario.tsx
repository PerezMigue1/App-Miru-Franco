import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/shared/ui/Skeleton';
import {
  escalaPresionado,
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
  const { colores } = useTheme();
  return (
    <View style={styles.cuadricula}>
      {enFilas(slots, reserva.columnasHorario).map((fila) => (
        <View key={fila[0].inicio} style={styles.fila}>
          {fila.map((slot) => {
            const activo = seleccionado?.inicio === slot.inicio;
            const hora = horaDeSlot(slot);
            return (
              <Pressable
                key={slot.inicio}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={hora}
                onPress={() => onElegir(slot)}
                style={({ pressed }) => [
                  styles.horario,
                  {
                    backgroundColor: activo ? colores.seleccion : colores.superficieSecundaria,
                    transform: [{ scale: pressed ? escalaPresionado : 1 }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.textoHorario,
                    { color: activo ? colores.textoSobreSeleccion : colores.texto },
                  ]}
                >
                  {hora}
                </Text>
              </Pressable>
            );
          })}
          {relleno(fila).map((i) => (
            <View key={`vacio-${i}`} style={styles.celdaVacia} />
          ))}
        </View>
      ))}
    </View>
  );
}

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
  horario: {
    flex: 1,
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
