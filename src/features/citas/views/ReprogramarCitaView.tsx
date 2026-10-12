import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, CalendarCheck, Info, UserRound } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  espacio,
  esqueleto,
  fuente,
  icono,
  pantalla,
  radio,
  reserva,
  sombra,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { CalendarioMensual } from '../components/CalendarioMensual';
import { Dato } from '../components/ResumenCita';
import {
  CuadriculaHorarios,
  CuadriculaHorariosEsqueleto,
  horaDeSlot,
} from '../components/SelectorHorario';
import { fechaLegible, horaLegible } from '../models/citaModel';
import {
  useReprogramarCitaViewModel,
  type ReprogramarCitaViewModel,
} from '../viewmodels/useReprogramarCitaViewModel';

/** Primera letra en mayúscula ("Sábado 18 de octubre"). */
function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** 'Sábado 18 de octubre, 6:30 p. m.'; solo lo que se pueda leer. */
function cuandoLegible(fecha: string, hora: string): string {
  return [conMayuscula(fecha), hora].filter(Boolean).join(', ');
}

/** Reprogramar una cita: mismo servicio y especialista, nuevo día y hora. */
export default function ReprogramarCitaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useReprogramarCitaViewModel(id);
  const reducido = useMovimientoReducido();
  const refScroll = useRef<ScrollView>(null);

  // Al elegir horario, el resumen del cambio y el botón quedan a la vista.
  const inicioElegido = vm.slot?.inicio ?? null;
  useEffect(() => {
    if (inicioElegido) {
      refScroll.current?.scrollToEnd({ animated: !reducido });
    }
  }, [inicioElegido, reducido]);

  const relleno = { paddingBottom: bottom + espacio.x3 };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Reprogramar cita" onVolver={vm.regresar} />

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando tu cita"
          style={styles.contenido}
        >
          <View style={styles.tarjetaEsqueleto}>
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.lineaEsqueleto} />
          </View>
          <Skeleton estilo={styles.calendarioEsqueleto} />
          <CuadriculaHorariosEsqueleto />
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, relleno]}>
          <EmptyState
            titulo="No pudimos cargar tu cita"
            mensaje="Revisa tu conexión o intenta de nuevo en un momento."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView contentContainerStyle={[styles.estado, relleno]}>
          <EmptyState
            titulo="No encontramos esta cita"
            mensaje="Puede que ya no esté disponible. Revisa tus citas para ver su estado."
            accion={{ titulo: 'Volver', onPress: vm.regresar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'sinCambios' ? (
        <ScrollView contentContainerStyle={[styles.estado, relleno]}>
          <EmptyState
            titulo="Esta cita ya no se puede reprogramar"
            mensaje="Solo se pueden cambiar las citas pendientes, confirmadas o ya reprogramadas. Si necesitas otro horario, reserva una cita nueva."
            accion={{ titulo: 'Volver a tu cita', onPress: vm.regresar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'listo' && vm.cita ? (
        <ScrollView
          ref={refScroll}
          contentContainerStyle={[styles.contenido, relleno]}
        >
          <DatosFijos vm={vm} />

          <View style={styles.encabezadoSeccion}>
            <Subtitulo texto="Elige el nuevo día y hora" />
            <Text style={[styles.nota, { color: colores.textoSuave }]}>
              El servicio y la especialista se quedan igual.
            </Text>
          </View>

          <CalendarioMensual
            mes={vm.mesVisible}
            seleccionada={vm.fecha}
            onElegir={vm.elegirDia}
            onCambiarMes={vm.cambiarMes}
          />

          <Horarios vm={vm} />

          <ResumenCambio vm={vm} />

          {/* Región en vivo siempre montada: el error se anuncia una vez al aparecer. */}
          <View collapsable={false} accessibilityLiveRegion="polite">
            {vm.errorEnvio ? (
              <View accessible style={styles.aviso}>
                <View importantForAccessibility="no-hide-descendants">
                  <Info color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                </View>
                <Text style={[styles.textoAviso, { color: colores.peligro }]}>{vm.errorEnvio}</Text>
              </View>
            ) : null}
          </View>

          <Button
            titulo="Confirmar cambio"
            onPress={vm.confirmar}
            deshabilitado={!vm.slot}
            cargando={vm.enviando}
            accessibilityHint={vm.slot ? undefined : 'Primero elige un horario'}
            icono={
              <CalendarCheck
                color={colores.textoSobreAccion}
                size={icono.tamanoPequeno}
                strokeWidth={icono.trazo}
              />
            }
            posicionIcono="inicio"
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function Subtitulo({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
      {texto}
    </Text>
  );
}

/** Servicio y especialista de la cita: no cambian al reprogramar. */
function DatosFijos({ vm }: { vm: ReprogramarCitaViewModel }) {
  const { colores } = useTheme();
  const cita = vm.cita;
  if (!cita) {
    return null;
  }
  return (
    <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}>
      <Text style={[styles.servicio, { color: colores.texto }]}>
        {cita.servicioNombre || 'Cita en el salón'}
      </Text>
      {cita.especialistaNombre ? (
        <Dato Icono={UserRound} etiqueta="Especialista" valor={cita.especialistaNombre} />
      ) : null}
    </View>
  );
}

function Horarios({ vm }: { vm: ReprogramarCitaViewModel }) {
  const { colores } = useTheme();

  if (vm.estadoHorarios === 'cargando' || vm.estadoHorarios === 'inactivo') {
    return <CuadriculaHorariosEsqueleto />;
  }

  if (vm.estadoHorarios === 'error') {
    return (
      <View style={styles.mensajeHorarios}>
        <Text style={[styles.cuerpo, { color: colores.texto }]}>{vm.errorHorarios}</Text>
        <View style={styles.reintentar}>
          <Button titulo="Reintentar" variante="secundario" onPress={vm.recargarHorarios} />
        </View>
      </View>
    );
  }

  const disponibilidad = vm.disponibilidad;
  if (!disponibilidad || !disponibilidad.abierto) {
    return (
      <View style={styles.mensajeHorarios}>
        <Text style={[styles.cuerpo, { color: colores.texto }]}>
          {disponibilidad?.motivo || 'El salón no abre este día'}
        </Text>
        <Text style={[styles.nota, { color: colores.textoSuave }]}>Elige otro día.</Text>
      </View>
    );
  }

  if (disponibilidad.slots.length === 0) {
    return (
      <View style={styles.mensajeHorarios}>
        <Text style={[styles.cuerpo, { color: colores.texto }]}>No hay horarios libres este día</Text>
        <Text style={[styles.nota, { color: colores.textoSuave }]}>Prueba con otro día.</Text>
      </View>
    );
  }

  return (
    <CuadriculaHorarios
      slots={disponibilidad.slots}
      seleccionado={vm.slot}
      onElegir={vm.elegirHorario}
    />
  );
}

/** "De" el horario actual "A" el elegido; solo cuando ya hay un horario elegido. */
function ResumenCambio({ vm }: { vm: ReprogramarCitaViewModel }) {
  const { colores } = useTheme();
  const { cita, slot } = vm;
  if (!cita || !slot) {
    return null;
  }
  const antes = cuandoLegible(fechaLegible(cita.fechaHoraInicio), horaLegible(cita.fechaHoraInicio));
  const despues = cuandoLegible(fechaLegible(slot.inicio), horaDeSlot(slot));
  return (
    <View
      accessible
      accessibilityLabel={`Cambio de tu cita. De: ${antes}. A: ${despues}.`}
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}
    >
      <Subtitulo texto="Tu cambio" />
      <View style={styles.cambio}>
        <FilaCambio etiqueta="De" valor={antes} />
        <View style={styles.flecha}>
          <ArrowDown color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
        <FilaCambio etiqueta="A" valor={despues} destacada />
      </View>
    </View>
  );
}

function FilaCambio({
  etiqueta,
  valor,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  const { colores } = useTheme();
  return (
    <View style={styles.filaCambio}>
      {/* Texto principal y no el suave: el suave sobre terracota no llega a 4.5:1. */}
      <Text style={[styles.etiquetaCambio, { color: colores.texto }]}>{etiqueta}:</Text>
      <Text
        style={[
          styles.valorCambio,
          destacada ? styles.valorDestacado : null,
          { color: colores.texto },
        ]}
      >
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xl,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  encabezadoSeccion: {
    gap: espacio.xs,
  },
  subtitulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  tarjeta: {
    gap: espacio.m,
    padding: espacio.l,
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
  cuerpo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  mensajeHorarios: {
    gap: espacio.xs,
  },
  reintentar: {
    marginTop: espacio.s,
    alignSelf: 'flex-start',
  },
  cambio: {
    gap: espacio.xs,
  },
  filaCambio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  etiquetaCambio: {
    minWidth: espacio.xxl,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  valorCambio: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  valorDestacado: {
    fontFamily: fuente.textoFuerte,
  },
  flecha: {
    // Alineada con el inicio del valor, bajo la etiqueta.
    paddingLeft: espacio.xxl + espacio.s,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  textoAviso: {
    flexShrink: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  tarjetaEsqueleto: {
    gap: espacio.m,
  },
  tituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.subtitulo.linea,
  },
  lineaEsqueleto: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  calendarioEsqueleto: {
    // Encabezado del mes, nombres de los días y seis semanas.
    height: reserva.diaCalendario * 8 + reserva.rellenoCalendario * 2,
    borderRadius: radio.tarjeta,
  },
});
