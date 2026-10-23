import { useLocalSearchParams } from 'expo-router';
import { CircleAlert, Hourglass } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { Button } from '@/shared/ui/Button';
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
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { BadgeEstado } from '../components/BadgeEstado';
import { CasillaPoliticaAnticipos } from '../components/CasillaPoliticaAnticipos';
import { EnlacePolitica } from '../components/EnlacePolitica';
import { EstadoCargaCita } from '../components/EstadoCargaCita';
import { ResumenCita } from '../components/ResumenCita';
import { useAnticipoViewModel, type AnticipoViewModel, type EstadoPago } from '../viewmodels/useAnticipoViewModel';

function tituloBoton(pago: EstadoPago, enSalon: boolean): string {
  switch (pago.tipo) {
    case 'cerrada':
      return 'Ver mis citas';
    case 'errorRevision':
      return 'Revisar mi pago';
    case 'noCompletado':
      // En proceso se vuelve a consultar el pago; no se abre otro.
      return pago.enProceso ? 'Revisar mi pago' : 'Intentar de nuevo';
    default:
      // En el salón, el botón ofrece adelantar el pago en línea con el mismo flujo.
      return enSalon ? 'Pagar anticipo' : 'Pagar con Mercado Pago';
  }
}

/** Pago del anticipo: datos de la cita, monto, plazo y botón para pagar con Mercado Pago. */
export default function AnticipoView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { citaId, pagar, retorno } = useLocalSearchParams<{
    citaId: string;
    pagar?: string;
    retorno?: string;
  }>();
  // pagar=1 llega de la reserva o de la confirmación: abre Mercado Pago sin otro toque.
  // retorno=mp llega del regreso de Mercado Pago en arranque en frío: consulta el estado del pago.
  const vm = useAnticipoViewModel(citaId, pagar === '1', retorno === 'mp');

  const listo = vm.estado === 'listo' && vm.cita != null;
  const ocupado = vm.pago.tipo === 'abriendo' || vm.pago.tipo === 'revisando';
  // El botón no abre Mercado Pago: lleva a Mis citas o vuelve a consultar el pago.
  const sinNavegador =
    vm.pago.tipo === 'cerrada' ||
    vm.pago.tipo === 'errorRevision' ||
    (vm.pago.tipo === 'noCompletado' && vm.pago.enProceso);

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Paga tu anticipo" onVolver={vm.regresar} />

      {listo && vm.cita ? (
        <>
          <ScrollView contentContainerStyle={styles.contenido}>
            <Contenido vm={vm} />
          </ScrollView>
          <View style={[styles.pie, { paddingBottom: bottom + espacio.l }]}>
            <Button
              titulo={tituloBoton(vm.pago, vm.avisoSalon != null)}
              onPress={vm.accionPrincipal}
              cargando={ocupado}
              accessibilityHint={sinNavegador ? undefined : 'Abre Mercado Pago en el navegador'}
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

      <EstadoCargaCita
        estado={vm.estado}
        mensajeError={vm.mensajeError}
        onReintentar={vm.recargar}
        accionNoEncontrada={{ titulo: 'Ver mis citas', onPress: vm.verMisCitas }}
      />
    </View>
  );
}

function Contenido({ vm }: { vm: AnticipoViewModel }) {
  const { colores } = useTheme();
  const { cita, pago, limite, avisoSalon } = vm;
  if (!cita) {
    return null;
  }
  const cerrada = pago.tipo === 'cerrada';
  const enProceso = pago.tipo === 'noCompletado' && pago.enProceso;
  const monto = cita.anticipoMonto ?? `$${cita.anticipoRequerido}`;

  return (
    <>
      {avisoSalon ? (
        <View style={styles.introSalon}>
          <Text accessibilityRole="header" style={[styles.tituloSalon, { color: colores.texto }]}>
            Tu horario está apartado
          </Text>
          <Text style={[styles.intro, { color: colores.textoSuave }]}>{avisoSalon}</Text>
        </View>
      ) : null}
      {!avisoSalon && !cerrada ? (
        <Text style={[styles.intro, { color: colores.textoSuave }]}>
          Tu cita queda apartada mientras pagas. Si el anticipo no se paga a tiempo, la cita se
          cancela sola.
        </Text>
      ) : null}
      {vm.plazo ? <Text style={[styles.intro, { color: colores.textoSuave }]}>{vm.plazo}</Text> : null}

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
            <BadgeEstado texto={enProceso ? 'Pago en revisión' : 'Pendiente de pago'} tono="aviso" />
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

      {vm.consecuencia ? <Text style={[styles.intro, { color: colores.textoSuave }]}>{vm.consecuencia}</Text> : null}

      {!cerrada ? <EnlacePolitica texto={vm.enlacePolitica} onPress={vm.abrirPolitica} /> : null}

      {vm.pideCasilla ? (
        <CasillaPoliticaAnticipos
          marcada={vm.casilla.marcada}
          onCambiar={vm.casilla.cambiar}
          error={vm.casilla.error}
          reglas={cita.reglas}
        />
      ) : null}

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
            {pago.enProceso ? 'Tu pago está en proceso' : 'Tu pago no se ha completado'}
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
  introSalon: {
    gap: espacio.s,
  },
  tituloSalon: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  // Introducción y avisos del pago: párrafos de dos o tres líneas con interlineado 1.625.
  intro: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
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
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
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
