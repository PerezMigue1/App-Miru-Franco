import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, Hourglass } from 'lucide-react-native';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  confirmacion,
  curva,
  duracion,
  espacio,
  esqueleto,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import { BadgeEstado, type TonoBadge } from '../components/BadgeEstado';
import { ResumenCita } from '../components/ResumenCita';
import type { Cita } from '../models/citaModel';
import {
  useCitaConfirmadaViewModel,
  type AnticipoConfirmacion,
} from '../viewmodels/useCitaConfirmadaViewModel';

const EASE_SALIDA = Easing.bezier(...curva.salida);

const BADGE_ANTICIPO: Record<AnticipoConfirmacion, { texto: string; tono: TonoBadge }> = {
  pagado: { texto: 'Anticipo pagado', tono: 'exito' },
  pendiente: { texto: 'Pendiente de pago', tono: 'aviso' },
  enRevision: { texto: 'Pago en revisión', tono: 'aviso' },
  noAplica: { texto: 'Sin anticipo', tono: 'neutro' },
};

const MENSAJE_ANTICIPO: Record<AnticipoConfirmacion, string> = {
  pagado: 'Recibimos tu anticipo. Te esperamos en el salón.',
  pendiente: 'Tu lugar queda apartado mientras pagas el anticipo.',
  enRevision: 'Mercado Pago está confirmando tu anticipo. Lo verás reflejado en Mis citas.',
  noAplica: 'Te esperamos en el salón.',
};

/** Confirmación de la cita: momento de confirmación, datos de la cita y estado del anticipo. */
export default function CitaConfirmadaView() {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { citaId } = useLocalSearchParams<{ citaId: string }>();
  const vm = useCitaConfirmadaViewModel(citaId);

  const listo = vm.estado === 'listo' && vm.cita != null;
  // Un solo botón primario: con el anticipo pendiente, pagar es lo principal.
  const pendiente = vm.anticipo === 'pendiente';

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <ScrollView
        contentContainerStyle={[
          styles.contenido,
          { paddingTop: top + espacio.x4, paddingBottom: bottom + espacio.xxl },
        ]}
      >
        {listo && vm.cita ? (
          <>
            <Confirmacion
              cita={vm.cita}
              anticipo={vm.anticipo}
              limite={vm.limite}
              avisoSalon={vm.avisoSalon}
            />
            <View style={styles.acciones}>
              {pendiente ? (
                <>
                  <Button
                    titulo="Pagar anticipo"
                    onPress={vm.pagarAnticipo}
                    accessibilityHint="Abre Mercado Pago en el navegador"
                  />
                  <Button titulo="Ver mis citas" variante="secundario" onPress={vm.verMisCitas} />
                  <Button titulo="Volver al inicio" variante="contorno" onPress={vm.volverAlInicio} />
                </>
              ) : (
                <>
                  <Button titulo="Ver mis citas" onPress={vm.verMisCitas} />
                  <Button titulo="Volver al inicio" variante="secundario" onPress={vm.volverAlInicio} />
                </>
              )}
            </View>
          </>
        ) : null}

        {vm.estado === 'cargando' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Cargando tu cita"
            style={styles.esqueleto}
          >
            <Skeleton estilo={styles.iconoEsqueleto} />
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.lineaMensaje} />
            <View style={styles.tarjetaEsqueleto}>
              <Skeleton estilo={styles.subtituloEsqueleto} />
              <Skeleton estilo={styles.linea} />
              <Skeleton estilo={styles.lineaCorta} />
              <Skeleton estilo={styles.badgeEsqueleto} />
            </View>
          </View>
        ) : null}

        {vm.estado === 'error' || vm.estado === 'noEncontrado' ? (
          <>
            {vm.estado === 'error' ? (
              <EmptyState
                titulo="No pudimos cargar tu cita"
                mensaje="Tu reserva no se pierde. Revisa tu conexión e intenta de nuevo."
                accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
              />
            ) : (
              <EmptyState
                titulo="No encontramos esta cita"
                mensaje="Revisa tus citas para ver su estado."
                accion={{ titulo: 'Ver mis citas', onPress: vm.verMisCitas }}
              />
            )}
            <Button titulo="Volver al inicio" variante="secundario" onPress={vm.volverAlInicio} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Confirmacion({
  cita,
  anticipo,
  limite,
  avisoSalon,
}: {
  cita: Cita;
  anticipo: AnticipoConfirmacion;
  limite: string | null;
  /** Anticipo pendiente en el salón: reemplaza el título y el mensaje de la confirmación. */
  avisoSalon: string | null;
}) {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const opacidad = useSharedValue(0);
  const desplazamiento = useSharedValue(reducido ? 0 : confirmacion.desplazamiento);

  // Una sola entrada al montarse: opacidad y un desplazamiento corto (solo opacidad si se pide
  // reducir el movimiento). Si el ajuste cambia después, los valores ya están en su destino y
  // no se repite nada.
  useEffect(() => {
    const ajuste = { duration: duracion.entrada, easing: EASE_SALIDA };
    opacidad.set(withTiming(1, ajuste));
    desplazamiento.set(reducido ? 0 : withTiming(0, ajuste));
  }, [desplazamiento, opacidad, reducido]);

  const animado = useAnimatedStyle(() => ({
    opacity: opacidad.get(),
    transform: [{ translateY: desplazamiento.get() }],
  }));

  const badge = BADGE_ANTICIPO[anticipo];
  const conMonto = anticipo !== 'noAplica' && cita.anticipoMonto != null;

  return (
    <Animated.View style={[styles.confirmacion, animado]}>
      <View style={styles.momento}>
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <CircleCheck color={colores.exito} size={confirmacion.icono} strokeWidth={icono.trazo} />
        </View>
        <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
          {avisoSalon ? 'Tu horario está apartado' : 'Tu cita está reservada'}
        </Text>
        <Text style={[styles.mensaje, { color: colores.textoSuave }]}>
          {avisoSalon ?? MENSAJE_ANTICIPO[anticipo]}
        </Text>
      </View>

      <ResumenCita cita={cita} conEspecialista>
        <View style={styles.anticipo}>
          {conMonto ? (
            <Text
              accessibilityLabel={`Anticipo: ${cita.anticipoMonto}`}
              style={[styles.etiquetaAnticipo, { color: colores.texto }]}
            >
              Anticipo <Text style={styles.cifra}>{cita.anticipoMonto}</Text>
            </Text>
          ) : null}
          <BadgeEstado texto={badge.texto} tono={badge.tono} />
        </View>
        {anticipo === 'pendiente' && limite ? (
          <View style={styles.limite} accessible accessibilityLabel={limite}>
            <View style={styles.iconoLinea}>
              <Hourglass color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoLimite, { color: colores.texto }]}>{limite}</Text>
          </View>
        ) : null}
      </ResumenCita>

      {anticipo === 'pendiente' && !avisoSalon ? (
        <Text style={[styles.mensaje, { color: colores.textoSuave }]}>
          Págalo en línea o en el salón. Si no se paga a tiempo, el horario se libera.
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
    gap: espacio.x3,
  },
  confirmacion: {
    gap: espacio.xxl,
  },
  momento: {
    alignItems: 'center',
    gap: espacio.m,
  },
  titulo: {
    marginTop: espacio.s,
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
    textAlign: 'center',
  },
  mensaje: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
  },
  anticipo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.s,
  },
  etiquetaAnticipo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontVariant: ['tabular-nums'],
  },
  limite: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoLimite: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  acciones: {
    gap: espacio.m,
  },
  esqueleto: {
    alignItems: 'center',
    gap: espacio.m,
  },
  iconoEsqueleto: {
    width: confirmacion.icono,
    height: confirmacion.icono,
    borderRadius: radio.pastilla,
  },
  tituloEsqueleto: {
    marginTop: espacio.s,
    width: esqueleto.anchoMedio,
    height: tipo.titulo.linea,
  },
  tarjetaEsqueleto: {
    alignSelf: 'stretch',
    marginTop: espacio.xl,
    gap: espacio.m,
  },
  subtituloEsqueleto: {
    width: esqueleto.anchoMedio,
    height: tipo.subtitulo.linea,
  },
  linea: {
    height: esqueleto.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  lineaMensaje: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
  badgeEsqueleto: {
    width: esqueleto.anchoCorto,
    height: tipo.etiqueta.linea + espacio.s,
    borderRadius: radio.pastilla,
  },
});
