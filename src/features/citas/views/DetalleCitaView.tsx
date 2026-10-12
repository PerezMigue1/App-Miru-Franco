import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, Hourglass, Timer } from 'lucide-react-native';
import type { ReactNode } from 'react';
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
  sombra,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { BadgeEstado } from '../components/BadgeEstado';
import { HojaCancelarCita } from '../components/HojaCancelarCita';
import { Dato, ResumenCita } from '../components/ResumenCita';
import {
  admiteCambios,
  avisoAnticipoEnSalon,
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  etiquetaEstadoCita,
  limitePagoCorto,
  type Cita,
  type EstadoAnticipoCita,
} from '../models/citaModel';
import { duracionParaMostrar } from '../models/servicioModel';
import { useDetalleCitaViewModel } from '../viewmodels/useDetalleCitaViewModel';

/** Qué significa cada estado del anticipo, sin prometer nada que el salón no haga. */
const EXPLICACION_ANTICIPO: Partial<Record<EstadoAnticipoCita, string>> = {
  pagado: 'Recibimos tu anticipo.',
  en_revision: 'Recibimos tu pago y está en revisión. No necesitas pagarlo de nuevo.',
  vencido: 'El plazo para pagar el anticipo terminó. Sin el pago, el horario se libera.',
  retenido: 'El salón conservó tu anticipo, así que ya no se devuelve.',
  reembolsado: 'El salón te devolvió el anticipo.',
  liberada: 'La cita se canceló antes de pagar el anticipo, así que no hay nada que pagar.',
};

/** Detalle de una cita de la clienta: datos, estado del anticipo, reprogramar y cancelar. */
export default function DetalleCitaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useDetalleCitaViewModel(id);

  const listo = vm.estado === 'listo' && vm.cita != null;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Tu cita" onVolver={vm.regresar} />

      {listo && vm.cita ? (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}>
          <Contenido
            cita={vm.cita}
            recienCancelada={vm.recienCancelada}
            onPagar={vm.pagarAnticipo}
            onReprogramar={vm.reprogramar}
            onCancelar={vm.abrirCancelar}
          />
        </ScrollView>
      ) : null}

      {vm.estado === 'cargando' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando tu cita"
          style={styles.contenido}
        >
          <View style={styles.insignias}>
            <Skeleton estilo={styles.badgeEsqueleto} />
            <Skeleton estilo={styles.badgeEsqueleto} />
          </View>
          <View style={styles.tarjetaEsqueleto}>
            <Skeleton estilo={styles.tituloEsqueleto} />
            <Skeleton estilo={styles.linea} />
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.lineaMedia} />
          </View>
          <View style={styles.tarjetaEsqueleto}>
            <Skeleton estilo={styles.lineaCorta} />
            <Skeleton estilo={styles.linea} />
          </View>
          <Skeleton estilo={styles.botonEsqueleto} />
          <Skeleton estilo={styles.botonEsqueleto} />
        </View>
      ) : null}

      {vm.estado === 'error' ? (
        <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
          <EmptyState
            titulo="No pudimos cargar tu cita"
            mensaje="Revisa tu conexión o intenta de nuevo en un momento."
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

      <HojaCancelarCita
        visible={vm.hojaCancelarVisible}
        onCerrar={vm.cerrarCancelar}
        aviso={vm.avisoCancelacion}
        cancelando={vm.cancelando}
        error={vm.errorCancelacion}
        onCancelar={vm.cancelar}
        onReprogramar={vm.reprogramar}
      />
    </View>
  );
}

function Contenido({
  cita,
  recienCancelada,
  onPagar,
  onReprogramar,
  onCancelar,
}: {
  cita: Cita;
  recienCancelada: boolean;
  onPagar: () => void;
  onReprogramar: () => void;
  onCancelar: () => void;
}) {
  const { colores } = useTheme();
  const anticipo = estadoAnticipo(cita);
  const insigniaCita = etiquetaEstadoCita(cita.estado);
  const insigniaAnticipo = etiquetaEstadoAnticipo(anticipo);
  const duracion = duracionParaMostrar(cita.servicioDuracionMinutos);
  const cambios = admiteCambios(cita);
  const conPago = cambios && anticipo === 'pendiente';

  return (
    <>
      {/* Aviso tras cancelar en esta pantalla: la hoja se cierra y TalkBack lo anuncia. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {recienCancelada && cita.estado === 'cancelada' ? (
          <View style={styles.filaIcono}>
            <View style={styles.iconoLinea}>
              <CircleCheck color={colores.exito} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoFuerte, { color: colores.texto }]}>Cancelamos tu cita.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.insignias}>
        <BadgeEstado texto={insigniaCita.texto} tono={insigniaCita.tono} />
        <BadgeEstado texto={insigniaAnticipo.texto} tono={insigniaAnticipo.tono} />
      </View>

      <ResumenCita cita={cita} conEspecialista>
        {duracion || cita.servicioPrecio ? (
          <View style={styles.extras}>
            {duracion ? <Dato Icono={Timer} etiqueta="Duración" valor={duracion} /> : null}
            {cita.servicioPrecio ? (
              <View
                style={styles.monto}
                accessible
                accessibilityLabel={`Precio del servicio: ${cita.servicioPrecio}`}
              >
                <Text style={[styles.etiquetaMonto, { color: colores.texto }]}>Precio del servicio</Text>
                <Text style={[styles.cifra, { color: colores.texto }]}>{cita.servicioPrecio}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ResumenCita>

      {anticipo !== 'no_requiere' ? (
        <Tarjeta>
          <View
            style={styles.monto}
            accessible
            accessibilityLabel={cita.anticipoMonto ? `Anticipo: ${cita.anticipoMonto}` : 'Anticipo'}
          >
            <Text style={[styles.tituloTarjeta, { color: colores.texto }]}>Anticipo</Text>
            {cita.anticipoMonto ? (
              <Text style={[styles.cifra, { color: colores.texto }]}>{cita.anticipoMonto}</Text>
            ) : null}
          </View>
          <ExplicacionAnticipo cita={cita} anticipo={anticipo} cambios={cambios} />
        </Tarjeta>
      ) : null}

      {cita.notas ? (
        <Seccion titulo="Tus notas">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{cita.notas}</Text>
        </Seccion>
      ) : null}

      {cita.motivoCancelacion ? (
        <Seccion titulo="Motivo de la cancelación">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{cita.motivoCancelacion}</Text>
        </Seccion>
      ) : null}

      {cambios ? (
        <View style={styles.acciones}>
          {/* Un solo primario: pagar si falta el anticipo; si no, reprogramar. */}
          {conPago ? <Button titulo="Pagar anticipo" onPress={onPagar} /> : null}
          <Button
            titulo="Reprogramar"
            variante={conPago ? 'secundario' : 'primario'}
            onPress={onReprogramar}
          />
          <Button titulo="Cancelar cita" variante="peligro" onPress={onCancelar} />
        </View>
      ) : null}
    </>
  );
}

/** Lo que significa el estado del anticipo; con el pago pendiente, el plazo para pagarlo. */
function ExplicacionAnticipo({
  cita,
  anticipo,
  cambios,
}: {
  cita: Cita;
  anticipo: EstadoAnticipoCita;
  cambios: boolean;
}) {
  const { colores } = useTheme();

  if (anticipo === 'pendiente') {
    if (!cambios) {
      return null;
    }
    if (cita.anticipoEnSalon) {
      return (
        <Text style={[styles.cuerpo, { color: colores.texto }]}>
          {avisoAnticipoEnSalon(cita.anticipoVenceEn)}
        </Text>
      );
    }
    const limite = limitePagoCorto(cita.anticipoVenceEn);
    return (
      <>
        {limite ? (
          <View style={styles.filaIcono} accessible accessibilityLabel={limite}>
            <View style={styles.iconoLinea}>
              <Hourglass color={colores.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoFuerte, { color: colores.texto }]}>{limite}</Text>
          </View>
        ) : null}
        <Text style={[styles.cuerpo, { color: colores.textoSuave }]}>
          Si el anticipo no se paga a tiempo, la cita se cancela sola.
        </Text>
      </>
    );
  }

  const explicacion = EXPLICACION_ANTICIPO[anticipo];
  if (!explicacion) {
    return null;
  }
  const respeto =
    anticipo === 'pagado' && cambios ? ' Si reprogramas tu cita con aviso, tu anticipo se respeta.' : '';
  return (
    <Text style={[styles.cuerpo, { color: colores.textoSuave }]}>
      {explicacion}
      {respeto}
    </Text>
  );
}

/** Tarjeta con el mismo estilo que el resumen de la cita. */
function Tarjeta({ children }: { children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombra }]}
    >
      {children}
    </View>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.texto }]}>
        {titulo}
      </Text>
      {children}
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
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacio.s,
  },
  extras: {
    gap: espacio.s,
  },
  tarjeta: {
    padding: espacio.xl,
    gap: espacio.m,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  tituloTarjeta: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
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
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  filaIcono: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoFuerte: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  seccion: {
    gap: espacio.s,
  },
  tituloSeccion: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  acciones: {
    marginTop: espacio.s,
    gap: espacio.m,
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
  badgeEsqueleto: {
    width: toqueMinimo * 2,
    height: tipo.etiqueta.linea + espacio.s,
    borderRadius: radio.pastilla,
  },
  botonEsqueleto: {
    height: toqueMinimo,
    borderRadius: radio.pastilla,
  },
});
