import { useLocalSearchParams } from 'expo-router';
import { CircleAlert, Hourglass } from 'lucide-react-native';
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
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { BadgeEstado } from '../components/BadgeEstado';
import { ResumenCita } from '../components/ResumenCita';
import type { Cita } from '../models/citaModel';
import { useAnticipoViewModel, type EstadoPago } from '../viewmodels/useAnticipoViewModel';

function tituloBoton(pago: EstadoPago): string {
  switch (pago.tipo) {
    case 'cerrada':
      return 'Ver mis citas';
    case 'errorRevision':
      return 'Revisar mi pago';
    case 'noCompletado':
      return 'Intentar de nuevo';
    default:
      return 'Pagar con Mercado Pago';
  }
}

/** Pago del anticipo: datos de la cita, monto, plazo y botón para pagar con Mercado Pago. */
export default function AnticipoView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { citaId, pagar } = useLocalSearchParams<{ citaId: string; pagar?: string }>();
  // pagar=1 llega de la reserva o de la confirmación: abre Mercado Pago sin otro toque.
  const vm = useAnticipoViewModel(citaId, pagar === '1');

  const listo = vm.estado === 'listo' && vm.cita != null;
  const ocupado = vm.pago.tipo === 'abriendo' || vm.pago.tipo === 'revisando';

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Paga tu anticipo" onVolver={vm.regresar} />

      {listo && vm.cita ? (
        <>
          <ScrollView contentContainerStyle={styles.contenido}>
            <Contenido cita={vm.cita} pago={vm.pago} limite={vm.limite} />
          </ScrollView>
          <View style={[styles.pie, { paddingBottom: bottom + espacio.l }]}>
            <Button
              titulo={tituloBoton(vm.pago)}
              onPress={vm.accionPrincipal}
              cargando={ocupado}
              accessibilityHint={
                vm.pago.tipo === 'cerrada' || vm.pago.tipo === 'errorRevision'
                  ? undefined
                  : 'Abre Mercado Pago en el navegador'
              }
            />
          </View>
        </>
      ) : null}

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando tu cita"
          style={styles.contenido}
        >
          <Skeleton estilo={styles.lineaMedia} />
          <View style={styles.tarjetaEsqueleto}>
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.linea} />
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.montoEsqueleto} />
            <Skeleton estilo={styles.badgeEsqueleto} />
          </View>
          <Skeleton estilo={styles.botonEsqueleto} />
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo="No pudimos cargar tu cita"
            mensaje="Revisa tu conexión e intenta de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.recargar }}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'noEncontrado' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo="No encontramos esta cita"
            mensaje="Puede que ya no esté disponible. Revisa tus citas para ver su estado."
            accion={{ titulo: 'Ver mis citas', onPress: vm.verMisCitas }}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function Contenido({ cita, pago, limite }: { cita: Cita; pago: EstadoPago; limite: string | null }) {
  const { colores } = useTheme();
  const cerrada = pago.tipo === 'cerrada';
  const monto = cita.anticipoMonto ?? `$${cita.anticipoRequerido}`;

  return (
    <>
      {!cerrada ? (
        <Text style={[styles.intro, { color: colores.textoSuave }]}>
          Tu cita queda apartada mientras pagas. Si el anticipo no se paga a tiempo, la cita se
          cancela sola.
        </Text>
      ) : null}

      <ResumenCita cita={cita}>
        <View
          style={styles.monto}
          accessible
          accessibilityLabel={`Anticipo a pagar: ${monto}`}
        >
          <Text style={[styles.etiquetaMonto, { color: colores.texto }]}>Anticipo a pagar</Text>
          <Text style={[styles.cifra, { color: colores.texto }]}>{monto}</Text>
        </View>
        {!cerrada ? (
          <View style={styles.estadoPago}>
            <BadgeEstado texto="Pendiente de pago" tono="aviso" />
            {limite ? (
              <View style={styles.limite} accessible accessibilityLabel={limite}>
                <View style={styles.iconoLinea}>
                  <Hourglass
                    color={colores.texto}
                    size={icono.tamanoPequeno}
                    strokeWidth={icono.trazo}
                  />
                </View>
                <Text style={[styles.textoLimite, { color: colores.texto }]}>{limite}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ResumenCita>

      <View accessibilityLiveRegion="polite" style={styles.aviso}>
        <AvisoPago pago={pago} />
      </View>
    </>
  );
}

/** Lo que pasa con el pago: se anuncia al lector de pantalla cuando cambia. */
function AvisoPago({ pago }: { pago: EstadoPago }) {
  const { colores } = useTheme();
  switch (pago.tipo) {
    case 'abriendo':
      return (
        <Text style={[styles.textoAviso, { color: colores.textoSuave }]}>Abriendo Mercado Pago</Text>
      );
    case 'revisando':
      return (
        <Text style={[styles.textoAviso, { color: colores.textoSuave }]}>Revisando tu pago</Text>
      );
    case 'noCompletado':
      return (
        <View style={styles.bloqueAviso}>
          <Text style={[styles.tituloAviso, { color: colores.texto }]}>
            Tu pago no se ha completado
          </Text>
          <Text style={[styles.textoAviso, { color: colores.textoSuave }]}>
            {pago.enProceso
              ? 'Mercado Pago todavía lo está procesando. Si ya pagaste, espera unos minutos y revisa Mis citas antes de pagar de nuevo.'
              : 'Si cerraste Mercado Pago antes de terminar, puedes intentarlo de nuevo. Tu cita sigue apartada hasta la hora límite.'}
          </Text>
        </View>
      );
    case 'error':
    case 'errorRevision':
      return <FilaAviso color={colores.peligro} texto={pago.mensaje} />;
    case 'cerrada':
      return <FilaAviso color={colores.texto} texto={pago.mensaje} />;
    default:
      return null;
  }
}

function FilaAviso({ color, texto }: { color: string; texto: string }) {
  return (
    <View style={styles.filaAviso}>
      <View style={styles.iconoLinea}>
        <CircleAlert color={color} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.textoAvisoFila, { color }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    paddingHorizontal: pantalla.margen,
    paddingBottom: espacio.xxl,
    gap: espacio.xl,
  },
  intro: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  monto: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: espacio.m,
  },
  etiquetaMonto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    fontVariant: ['tabular-nums'],
  },
  estadoPago: {
    gap: espacio.m,
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
  aviso: {
    minHeight: tipo.cuerpo.linea,
  },
  bloqueAviso: {
    gap: espacio.xs,
  },
  tituloAviso: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  textoAviso: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  filaAviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  textoAvisoFila: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  pie: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.m,
  },
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
  tarjetaEsqueleto: {
    gap: espacio.m,
  },
  tituloEsqueleto: {
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
  lineaMedia: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  montoEsqueleto: {
    marginTop: espacio.s,
    width: esqueleto.anchoCorto,
    height: tipo.titulo.linea,
  },
  badgeEsqueleto: {
    width: esqueleto.anchoCorto,
    height: tipo.etiqueta.linea + espacio.s,
    borderRadius: radio.pastilla,
  },
  botonEsqueleto: {
    marginTop: espacio.s,
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
});
