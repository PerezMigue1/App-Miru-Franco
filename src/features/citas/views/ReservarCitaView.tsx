import { useLocalSearchParams } from 'expo-router';
import { CalendarCheck, Info } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, Keyframe, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { EASE_SALIDA, useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  duracion,
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
import { IndicadorPasos } from '../components/IndicadorPasos';
import {
  CuadriculaHorarios,
  CuadriculaHorariosEsqueleto,
  horaDeSlot,
} from '../components/SelectorHorario';
import { TarjetaEspecialista, TarjetaEspecialistaEsqueleto } from '../components/TarjetaEspecialista';
import {
  fechaLegible,
  PASOS_RESERVA,
  useReservarCitaViewModel,
  type ReservarCitaViewModel,
} from '../viewmodels/useReservarCitaViewModel';

const ESQUELETOS = Array.from({ length: reserva.especialistasEsqueleto }, (_, i) => i);
const SIN_PRECIO = 'Consulta el precio en el salón';

/** Primera letra en mayúscula ("Sábado 18 de octubre"). */
function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Reservar una cita en tres pasos: especialista, día y hora, y confirmar. */
export default function ReservarCitaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  // especialistaId opcional: "Reservar lo mismo" desde Mis citas arranca en Día y hora con ella.
  const { servicioId, especialistaId } = useLocalSearchParams<{
    servicioId: string;
    especialistaId?: string;
  }>();
  const vm = useReservarCitaViewModel(
    servicioId,
    typeof especialistaId === 'string' ? especialistaId : undefined,
  );
  const reducido = useMovimientoReducido();
  const refIndicador = useRef<View>(null);
  const refScroll = useRef<ScrollView>(null);
  const pasoAnterior = useRef(vm.paso);

  // Al cambiar de paso, la pantalla vuelve arriba y el indicador recibe el foco de TalkBack.
  useEffect(() => {
    if (pasoAnterior.current === vm.paso) {
      return;
    }
    pasoAnterior.current = vm.paso;
    Keyboard.dismiss();
    refScroll.current?.scrollTo({ y: 0, animated: !reducido });
    if (refIndicador.current) {
      AccessibilityInfo.sendAccessibilityEvent(refIndicador.current, 'focus');
    }
  }, [vm.paso, reducido]);

  const entrada = reducido
    ? FadeIn.duration(duracion.pestana).reduceMotion(ReduceMotion.Never)
    : new Keyframe({
        // De la derecha al avanzar, de la izquierda al regresar.
        0: { opacity: 0, transform: [{ translateX: vm.direccion * espacio.xxl }] },
        100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_SALIDA },
      }).duration(duracion.pestana);

  const relleno = { paddingBottom: bottom + espacio.x3 };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver
        titulo={vm.servicio?.nombre || 'Reservar cita'}
        subtitulo="Selecciona especialista, día y hora para tu cita"
        onVolver={vm.atras}
      />

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando la reserva"
          style={styles.contenido}
        >
          <Skeleton estilo={styles.indicadorEsqueleto} />
          <Skeleton estilo={styles.subtituloEsqueleto} />
          <View style={styles.lista}>
            {ESQUELETOS.map((i) => (
              <TarjetaEspecialistaEsqueleto key={i} />
            ))}
          </View>
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, relleno]}>
          <EmptyState
            titulo="No pudimos preparar tu reserva"
            mensaje="Revisa tu conexión e intenta de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView contentContainerStyle={[styles.estado, relleno]}>
          <EmptyState
            titulo="Este servicio ya no está disponible"
            mensaje="Puede que el salón lo haya retirado. Mira los demás servicios en Servicios."
            accion={{ titulo: 'Ver servicios', onPress: vm.verServicios }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'listo' && vm.servicio ? (
        <ScrollView
          ref={refScroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.contenido, relleno]}
        >
          <IndicadorPasos ref={refIndicador} pasos={PASOS_RESERVA} actual={vm.paso} />
          <Animated.View key={vm.paso} entering={entrada} style={styles.paso}>
            {vm.paso === 1 ? <PasoEspecialista vm={vm} /> : null}
            {vm.paso === 2 ? <PasoDiaHora vm={vm} /> : null}
            {vm.paso === 3 ? <PasoConfirmar vm={vm} /> : null}
          </Animated.View>
        </ScrollView>
      ) : null}
    </KeyboardAvoidingView>
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

/** Paso 1: elegir con quién. */
function PasoEspecialista({ vm }: { vm: ReservarCitaViewModel }) {
  if (vm.especialistas.length === 0) {
    return (
      <EmptyState
        titulo="Sin especialistas disponibles"
        mensaje="Por ahora nadie del salón tiene agenda abierta para este servicio. Intenta más tarde."
        accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
      />
    );
  }
  return (
    <>
      <Subtitulo texto="¿Con quién quieres tu cita?" />
      <View style={styles.lista}>
        {vm.especialistas.map((especialista) => (
          <TarjetaEspecialista
            key={String(especialista.id)}
            especialista={especialista}
            seleccionada={vm.especialista != null && String(vm.especialista.id) === String(especialista.id)}
            onPress={() => vm.elegirEspecialista(especialista)}
          />
        ))}
      </View>
    </>
  );
}

/** Paso 2: elegir día y hora. */
function PasoDiaHora({ vm }: { vm: ReservarCitaViewModel }) {
  const { colores } = useTheme();
  return (
    <>
      <View style={styles.encabezadoPaso}>
        <Subtitulo texto="Elige día y hora" />
        {vm.especialista ? (
          <Text style={[styles.nota, { color: colores.textoSuave }]}>Con {vm.especialista.nombre}</Text>
        ) : null}
      </View>

      <CalendarioMensual
        mes={vm.mesVisible}
        seleccionada={vm.fecha}
        onElegir={vm.elegirDia}
        onCambiarMes={vm.cambiarMes}
        bloqueos={vm.bloqueos}
      />

      {/* Región en vivo siempre montada: el aviso se anuncia una vez al aparecer. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {vm.horarioOcupado ? (
          <View accessible style={styles.aviso}>
            <View importantForAccessibility="no-hide-descendants">
              <Info color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoAviso, { color: colores.aviso }]}>
              Ese horario se acaba de ocupar. Elige otro.
            </Text>
          </View>
        ) : null}
      </View>

      <Horarios vm={vm} />
    </>
  );
}

function Horarios({ vm }: { vm: ReservarCitaViewModel }) {
  const { colores } = useTheme();
  // Los horarios aparecen una vez cada que terminan de cargar (al elegir otro día, otra vez).
  const entrada = useEntradaContenido();

  // Sin día elegido: el que estaba quedó sin citas con la configuración nueva, o no hay uno libre.
  if (vm.fecha === null) {
    return (
      <View style={styles.mensajeHorarios}>
        <Text style={[styles.nota, { color: colores.textoSuave }]}>Elige otro día.</Text>
      </View>
    );
  }

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
          {disponibilidad?.motivo || vm.motivoCerrado}
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
    <Animated.View entering={entrada}>
      <CuadriculaHorarios
        slots={disponibilidad.slots}
        seleccionado={vm.slot}
        onElegir={vm.elegirHorario}
      />
    </Animated.View>
  );
}

/** Paso 3: resumen, notas y confirmar. */
function PasoConfirmar({ vm }: { vm: ReservarCitaViewModel }) {
  const { colores } = useTheme();
  const { servicio, especialista, slot } = vm;
  if (!servicio || !especialista || !slot) {
    return null;
  }
  return (
    <>
      <Subtitulo texto="Confirma tu cita" />

      <View
        style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
      >
        <Dato etiqueta="Servicio" valor={servicio.nombre} />
        <Dato etiqueta="Especialista" valor={especialista.nombre} />
        <Dato etiqueta="Fecha" valor={conMayuscula(fechaLegible(slot.inicio))} />
        <Dato etiqueta="Hora" valor={horaDeSlot(slot)} cifra />
        <Dato etiqueta="Precio" valor={servicio.precio ?? SIN_PRECIO} cifra={servicio.precio != null} />
        {servicio.anticipo ? (
          <View style={styles.anticipo}>
            <Dato etiqueta="Anticipo" valor={servicio.anticipo} cifra />
            <Text style={[styles.parrafo, { color: colores.texto }]}>
              En línea tienes 2 horas para pagarlo. Se descuenta del total el día de tu cita. Si
              cancelas, el anticipo no se devuelve; si reagendas con aviso, se respeta.
            </Text>
          </View>
        ) : null}
      </View>

      <Input
        etiqueta="Notas para el salón (opcional)"
        valor={vm.notas}
        onCambiar={vm.setNotas}
        multilinea
        largoMaximo={reserva.largoNotas}
        ayuda={`Algo que el salón deba saber antes de tu cita. Hasta ${reserva.largoNotas} caracteres.`}
      />

      <View collapsable={false} accessibilityLiveRegion="polite">
        {vm.errorEnvio ? (
          <Text style={[styles.nota, { color: colores.peligro }]}>{vm.errorEnvio}</Text>
        ) : null}
      </View>

      {servicio.anticipo ? (
        // Con anticipo, dos caminos; mientras uno se envía, el otro queda deshabilitado.
        <View style={styles.acciones}>
          <Button
            titulo={
              vm.modoEnvio === 'linea' ? 'Abriendo Mercado Pago…' : 'Pagar anticipo con Mercado Pago'
            }
            onPress={() => vm.confirmar('linea')}
            cargando={vm.modoEnvio === 'linea'}
            deshabilitado={vm.modoEnvio === 'salon'}
            accessibilityHint="Reserva tu cita y abre Mercado Pago en el navegador"
          />
          <View style={styles.opcionSalon}>
            <Button
              titulo={vm.modoEnvio === 'salon' ? 'Apartando…' : 'Apartar y pagar en el salón'}
              variante="contorno"
              onPress={() => vm.confirmar('salon')}
              cargando={vm.modoEnvio === 'salon'}
              deshabilitado={vm.modoEnvio === 'linea'}
            />
            <Text style={[styles.nota, { color: colores.textoSuave }]}>
              Llega entre 20 y 15 minutos antes para pagarlo. Si a 15 minutos de tu cita no se ha
              pagado, se cancela.
            </Text>
          </View>
        </View>
      ) : (
        <Button
          titulo="Confirmar cita"
          onPress={() => vm.confirmar('salon')}
          cargando={vm.enviando}
          icono={
            <CalendarCheck
              color={colores.textoSobreAccion}
              size={icono.tamanoPequeno}
              strokeWidth={icono.trazo}
            />
          }
          posicionIcono="inicio"
        />
      )}
    </>
  );
}

/** Una línea del resumen: etiqueta a la izquierda y valor a la derecha. */
function Dato({ etiqueta, valor, cifra = false }: { etiqueta: string; valor: string; cifra?: boolean }) {
  const { colores } = useTheme();
  return (
    <View accessible accessibilityLabel={`${etiqueta}: ${valor}`} style={styles.dato}>
      {/* Etiqueta en el secundario (4.8:1 sobre terracota); el valor, en el principal. */}
      <Text style={[styles.etiquetaDato, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.valorDato, cifra ? styles.cifra : null, { color: colores.texto }]}>
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
    gap: espacio.xxl,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  paso: {
    gap: espacio.xl,
  },
  encabezadoPaso: {
    gap: espacio.xs,
  },
  subtitulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  lista: {
    gap: espacio.m,
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
  // Aviso extenso del anticipo: interlineado de párrafo largo.
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  textoAviso: {
    flexShrink: 1,
    fontFamily: fuente.textoMedio,
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
  tarjeta: {
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espacio.l,
  },
  etiquetaDato: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  valorDato: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontVariant: ['tabular-nums'],
  },
  anticipo: {
    gap: espacio.xs,
  },
  acciones: {
    gap: espacio.m,
  },
  opcionSalon: {
    gap: espacio.xs,
  },
  indicadorEsqueleto: {
    height: esqueleto.lineaGrande,
  },
  subtituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.subtitulo.linea,
  },
});
