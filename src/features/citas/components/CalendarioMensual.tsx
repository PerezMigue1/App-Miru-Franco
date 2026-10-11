import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  escalaPresionado,
  espacio,
  fuente,
  icono,
  opacidad,
  radio,
  reserva,
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import {
  compararMeses,
  ENCABEZADOS_SEMANA,
  fechaLegible,
  fechaLocal,
  mesDe,
  semanasDelMes,
  tituloMes,
  type DiaCalendario,
  type MesCalendario,
} from '../models/citaModel';

interface CalendarioMensualProps {
  /** Mes que se está mostrando. */
  mes: MesCalendario;
  /** 'YYYY-MM-DD' local del día elegido, o null. */
  seleccionada: string | null;
  onElegir: (fecha: string) => void;
  /** -1 para el mes anterior y 1 para el siguiente. */
  onCambiarMes: (delta: 1 | -1) => void;
}

/**
 * Calendario de un mes, de domingo a sábado. Los días pasados no se pueden tocar, hoy lleva un
 * anillo y el día elegido va relleno con el color de selección. No deja regresar a meses
 * anteriores al actual.
 */
export function CalendarioMensual({ mes, seleccionada, onElegir, onCambiarMes }: CalendarioMensualProps) {
  const { colores } = useTheme();
  const ahora = new Date();
  const hoy = fechaLocal(ahora);
  const puedeRegresar = compararMeses(mes, mesDe(ahora)) > 0;

  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}
    >
      <View style={styles.encabezado}>
        <BotonMes
          etiqueta="Mes anterior"
          deshabilitado={!puedeRegresar}
          onPress={() => onCambiarMes(-1)}
          Icono={ChevronLeft}
        />
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={[styles.titulo, { color: colores.texto }]}
        >
          {tituloMes(mes)}
        </Text>
        <BotonMes etiqueta="Mes siguiente" onPress={() => onCambiarMes(1)} Icono={ChevronRight} />
      </View>

      {/* Cada día ya dice su día de la semana; los encabezados solo son visuales. */}
      <View importantForAccessibility="no-hide-descendants" style={styles.fila}>
        {ENCABEZADOS_SEMANA.map((nombre) => (
          <Text key={nombre} style={[styles.encabezadoDia, { color: colores.texto }]}>
            {nombre}
          </Text>
        ))}
      </View>

      {semanasDelMes(mes).map((semana, indice) => (
        <View key={semana.find((dia) => dia !== null)?.fecha ?? `semana-${indice}`} style={styles.fila}>
          {semana.map((dia, columna) =>
            dia ? (
              <Dia
                key={dia.fecha}
                dia={dia}
                esHoy={dia.fecha === hoy}
                pasado={dia.fecha < hoy}
                seleccionado={dia.fecha === seleccionada}
                onElegir={onElegir}
              />
            ) : (
              <View key={`vacio-${columna}`} style={styles.celda} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

interface BotonMesProps {
  etiqueta: string;
  deshabilitado?: boolean;
  onPress: () => void;
  Icono: typeof ChevronLeft;
}

function BotonMes({ etiqueta, deshabilitado = false, onPress, Icono }: BotonMesProps) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      style={({ pressed }) => [
        styles.botonMes,
        {
          opacity: deshabilitado ? opacidad.deshabilitado : 1,
          transform: [{ scale: pressed ? escalaPresionado : 1 }],
        },
      ]}
    >
      <Icono color={colores.texto} size={icono.tamano} strokeWidth={icono.trazo} />
    </Pressable>
  );
}

interface DiaProps {
  dia: DiaCalendario;
  esHoy: boolean;
  pasado: boolean;
  seleccionado: boolean;
  onElegir: (fecha: string) => void;
}

function Dia({ dia, esHoy, pasado, seleccionado, onElegir }: DiaProps) {
  const { colores } = useTheme();
  const legible = fechaLegible(dia.fecha);
  const colorTexto = seleccionado
    ? colores.textoSobreSeleccion
    : pasado
      ? colores.textoSuave
      : colores.texto;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={esHoy ? `Hoy, ${legible}` : legible}
      accessibilityState={{ selected: seleccionado, disabled: pasado }}
      disabled={pasado}
      onPress={() => onElegir(dia.fecha)}
      style={({ pressed }) => [styles.celda, { transform: [{ scale: pressed ? escalaPresionado : 1 }] }]}
    >
      <View
        style={[
          styles.circulo,
          seleccionado ? { backgroundColor: colores.seleccion } : null,
          esHoy && !seleccionado ? { borderWidth: reserva.anilloHoy, borderColor: colores.foco } : null,
        ]}
      >
        <Text
          style={[
            styles.numero,
            seleccionado || esHoy ? styles.numeroFuerte : null,
            { color: colorTexto, opacity: pasado ? opacidad.deshabilitado : 1 },
          ]}
        >
          {dia.dia}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: espacio.xs,
    padding: reserva.rellenoCalendario,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacio.xs,
  },
  titulo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
    fontVariant: ['tabular-nums'],
  },
  botonMes: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  fila: {
    flexDirection: 'row',
  },
  encabezadoDia: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  // Cada columna mide 1/7 del ancho; el alto llega al objetivo táctil aunque el ancho sea menor.
  celda: {
    flex: 1,
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circulo: {
    width: reserva.diaCalendario,
    height: reserva.diaCalendario,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  numero: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  numeroFuerte: {
    fontFamily: fuente.textoFuerte,
  },
});
