import { CalendarDays, Clock, UserRound, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { espacio, fuente, icono, radio, sombra, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { fechaLegible, horaLegible, type Cita } from '../models/citaModel';

interface ResumenCitaProps {
  cita: Cita;
  /** Muestra a la especialista (la confirmación sí; el pago del anticipo no la necesita). */
  conEspecialista?: boolean;
  /** Contenido extra al final de la tarjeta (monto, estado del anticipo). */
  children?: ReactNode;
}

function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** '11:00 a. m. a 12:00 p. m.'; solo el inicio si el fin no es válido. */
export function horarioDeCita(cita: Cita): string {
  const inicio = horaLegible(cita.fechaHoraInicio);
  const fin = horaLegible(cita.fechaHoraFin);
  return inicio && fin ? `${inicio} a ${fin}` : inicio;
}

/** Tarjeta con los datos de una cita: servicio, fecha, hora y, si se pide, especialista. */
export function ResumenCita({ cita, conEspecialista = false, children }: ResumenCitaProps) {
  const { colores } = useTheme();
  const fecha = conMayuscula(fechaLegible(cita.fechaHoraInicio));
  const horario = horarioDeCita(cita);

  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}
    >
      {cita.servicioNombre ? (
        <Text style={[styles.servicio, { color: colores.texto }]}>{cita.servicioNombre}</Text>
      ) : null}
      <View style={styles.datos}>
        {fecha ? <Dato Icono={CalendarDays} etiqueta="Fecha" valor={fecha} /> : null}
        {horario ? <Dato Icono={Clock} etiqueta="Hora" valor={horario} /> : null}
        {conEspecialista && cita.especialistaNombre ? (
          <Dato Icono={UserRound} etiqueta="Especialista" valor={cita.especialistaNombre} />
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Dato({ Icono, etiqueta, valor }: { Icono: LucideIcon; etiqueta: string; valor: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.dato} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <View style={styles.iconoDato}>
        <Icono color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.valor, { color: colores.texto }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    padding: espacio.xl,
    gap: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  servicio: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  datos: {
    gap: espacio.s,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoDato: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  valor: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
});
