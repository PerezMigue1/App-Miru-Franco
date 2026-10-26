import { useLocalSearchParams } from 'expo-router';
import { CircleAlert, CircleCheck, Hourglass, Store, Timer } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoVolver } from '@/features/auth/components/EncabezadoVolver';
import { BadgeEstado } from '@/shared/ui/BadgeEstado';
import { Button } from '@/shared/ui/Button';
import { DatosTransferencia } from '@/shared/ui/DatosTransferencia';
import { estilosDetalle } from '@/shared/ui/estilosDetalle';
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

import { CasillaPoliticaAnticipos } from '../components/CasillaPoliticaAnticipos';
import { EnlacePolitica } from '../components/EnlacePolitica';
import { EstadoCargaCita } from '../components/EstadoCargaCita';
import { HojaCancelarCita } from '../components/HojaCancelarCita';
import { Dato, ResumenCita } from '../components/ResumenCita';
import {
  useDetalleCitaViewModel,
  type Cita,
  type DetalleCitaViewModel,
  type FormaPagoCita,
  type PresentacionDetalle,
} from '../viewmodels/useDetalleCitaViewModel';

/** Detalle de una cita de la clienta: datos, forma de pago, pagar el anticipo, reprogramar y cancelar. */
export default function DetalleCitaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useDetalleCitaViewModel(id);

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Tu cita" onVolver={vm.regresar} />

      {vm.estado === 'listo' && vm.cita && vm.presentacion ? (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}>
          <Contenido vm={vm} cita={vm.cita} presentacion={vm.presentacion} />
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

      <EstadoCargaCita
        estado={vm.estado}
        mensajeError={vm.mensajeError}
        onReintentar={vm.recargar}
        accionNoEncontrada={{ titulo: 'Ver mis citas', onPress: vm.verMisCitas }}
      />

      <HojaCancelarCita
        visible={vm.hojaCancelarVisible}
        onCerrar={vm.cerrarCancelar}
        aviso={vm.avisoCancelacion}
        enlacePolitica={vm.avisoConPolitica ? vm.presentacion?.enlacePolitica : undefined}
        onVerPolitica={vm.abrirPolitica}
        puedeConfirmar={vm.puedeConfirmarCancelacion}
        puedeReprogramar={vm.puedeReprogramar}
        cancelando={vm.cancelando}
        textoEspera={vm.textoEsperaCancelar}
        error={vm.errorCancelacion}
        onCancelar={vm.cancelar}
        onReprogramar={vm.reprogramar}
      />
    </View>
  );
}

function Contenido({
  vm,
  cita,
  presentacion,
}: {
  vm: DetalleCitaViewModel;
  cita: Cita;
  presentacion: PresentacionDetalle;
}) {
  const { colores } = useTheme();
  const { duracion, cambios, opcionesPago, motivoCancelacion } = presentacion;
  const conPago = opcionesPago.enLinea || opcionesPago.enSalon;
  // Un solo primario: pagar si falta el anticipo; si no, reprogramar.
  let varianteReprogramar: 'primario' | 'secundario' | 'contorno' = 'primario';
  if (conPago) {
    varianteReprogramar = opcionesPago.enLinea && opcionesPago.enSalon ? 'contorno' : 'secundario';
  }

  return (
    <>
      {/* Aviso tras cancelar en esta pantalla: la hoja se cierra y TalkBack lo anuncia. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {vm.avisoCancelada && cita.estado === 'cancelada' ? (
          <FilaIcono Icono={CircleCheck} color={colores.exito} texto={vm.avisoCancelada} />
        ) : null}
      </View>

      <View style={styles.insignias}>
        <BadgeEstado texto={presentacion.insigniaCita.texto} tono={presentacion.insigniaCita.tono} />
        <BadgeEstado texto={presentacion.insigniaAnticipo.texto} tono={presentacion.insigniaAnticipo.tono} />
      </View>

      <ResumenCita cita={cita} conEspecialista>
        {duracion || cita.servicioPrecio ? (
          <View style={styles.extras}>
            {duracion ? <Dato Icono={Timer} etiqueta="Duración" valor={duracion} /> : null}
            {cita.servicioPrecio ? (
              <Monto etiqueta="Precio del servicio" valor={cita.servicioPrecio} />
            ) : null}
          </View>
        ) : null}
      </ResumenCita>

      <FormaPago
        formaPago={presentacion.formaPago}
        transferencia={presentacion.transferencia}
        enlace={presentacion.enlacePolitica}
        onVerPolitica={vm.abrirPolitica}
      />

      {conPago ? <PagoAnticipo vm={vm} cita={cita} presentacion={presentacion} /> : null}

      {/* Región en vivo siempre montada: el resultado del pago se anuncia al aparecer. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {vm.avisoPago ? (
          <FilaIcono
            Icono={vm.avisoPago.tipo === 'exito' ? CircleCheck : CircleAlert}
            color={vm.avisoPago.tipo === 'exito' ? colores.exito : colores.peligro}
            texto={vm.avisoPago.texto}
          />
        ) : null}
      </View>

      {presentacion.recordatorio ? (
        <Text style={[styles.cuerpo, { color: colores.texto }]}>{presentacion.recordatorio}</Text>
      ) : null}

      {cita.notas ? (
        <Seccion titulo="Tus notas">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{cita.notas}</Text>
        </Seccion>
      ) : null}

      {motivoCancelacion ? (
        <Seccion titulo="Motivo de la cancelación">
          <Text style={[styles.cuerpo, { color: colores.texto }]}>{motivoCancelacion}</Text>
        </Seccion>
      ) : null}

      {cambios ? (
        <View style={styles.acciones}>
          <Button
            titulo="Reprogramar"
            variante={varianteReprogramar}
            onPress={vm.reprogramar}
            deshabilitado={vm.pagando !== null}
          />
          <Button titulo="Cancelar cita" variante="peligro" onPress={vm.abrirCancelar} deshabilitado={vm.pagando !== null} />
        </View>
      ) : null}
    </>
  );
}

/**
 * Forma de pago con la regla guardada en la cita: anticipo, saldo, plazo, consecuencias, métodos y,
 * debajo de los métodos, los datos de transferencia (si el viewmodel los manda).
 */
function FormaPago({
  formaPago,
  transferencia,
  enlace,
  onVerPolitica,
}: {
  formaPago: FormaPagoCita;
  transferencia: PresentacionDetalle['transferencia'];
  enlace: string;
  onVerPolitica: () => void;
}) {
  const { colores } = useTheme();
  const parrafos = [
    formaPago.modo,
    formaPago.explicacion,
    formaPago.saldo,
    ...formaPago.avisos,
    formaPago.metodos,
  ].filter((texto): texto is string => Boolean(texto));
  // Sin métodos del salón tampoco hay transferencia: no cuenta para mostrar la tarjeta.
  if (!formaPago.anticipo && parrafos.length === 0 && !formaPago.avisoReagendar) {
    return null;
  }
  return (
    <Tarjeta>
      <Text accessibilityRole="header" style={[styles.tituloTarjeta, { color: colores.texto }]}>
        Forma de pago
      </Text>
      {formaPago.anticipo ? <Monto etiqueta={formaPago.etiquetaAnticipo} valor={formaPago.anticipo} /> : null}
      {formaPago.limite ? <FilaIcono Icono={Hourglass} color={colores.texto} texto={formaPago.limite} /> : null}
      {parrafos.map((texto) => (
        <Text key={texto} style={[styles.cuerpo, { color: colores.texto }]}>
          {texto}
        </Text>
      ))}
      <DatosTransferencia datos={transferencia} />
      {formaPago.avisoReagendar ? (
        <Text style={[styles.cuerpo, { color: colores.texto }]}>{formaPago.avisoReagendar}</Text>
      ) : null}
      {formaPago.conPolitica ? <EnlacePolitica texto={enlace} onPress={onVerPolitica} /> : null}
    </Tarjeta>
  );
}

/** Casilla de la política y los botones para pagar el anticipo pendiente. */
function PagoAnticipo({
  vm,
  cita,
  presentacion,
}: {
  vm: DetalleCitaViewModel;
  cita: Cita;
  presentacion: PresentacionDetalle;
}) {
  const { colores } = useTheme();
  const { enLinea, enSalon } = presentacion.opcionesPago;
  const ocupado = vm.pagando !== null || vm.cancelando;
  return (
    <View style={styles.pago}>
      <CasillaPoliticaAnticipos
        marcada={vm.casilla.marcada}
        onCambiar={vm.casilla.cambiar}
        error={vm.casilla.error}
        reglas={cita.reglas}
      />
      {enLinea ? (
        <Button
          titulo={presentacion.botonLinea}
          onPress={vm.pagarAnticipo}
          cargando={vm.pagando === 'linea'}
          deshabilitado={ocupado && vm.pagando !== 'linea'}
          accessibilityHint="Abre Mercado Pago en el navegador"
        />
      ) : null}
      {enSalon ? (
        <Button
          titulo={presentacion.botonSalon}
          variante={enLinea ? 'secundario' : 'primario'}
          onPress={vm.pagarEnSalon}
          cargando={vm.pagando === 'salon'}
          deshabilitado={ocupado && vm.pagando !== 'salon'}
          icono={
            <Store
              color={enLinea ? colores.textoSobreSecundario : colores.textoSobreAccion}
              size={icono.tamanoPequeno}
              strokeWidth={icono.trazo}
            />
          }
          posicionIcono="inicio"
        />
      ) : null}
    </View>
  );
}

function Monto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.monto} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[styles.etiquetaMonto, { color: colores.texto }]}>{etiqueta}</Text>
      <Text style={[styles.cifra, { color: colores.texto }]}>{valor}</Text>
    </View>
  );
}

function FilaIcono({
  Icono,
  color,
  texto,
}: {
  Icono: typeof CircleCheck;
  color: string;
  texto: string;
}) {
  const { colores } = useTheme();
  return (
    <View style={styles.filaIcono} accessible accessibilityLabel={texto}>
      <View style={styles.iconoLinea}>
        <Icono color={color} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.textoFuerte, { color: colores.texto }]}>{texto}</Text>
    </View>
  );
}

/** Tarjeta con el mismo estilo que el resumen de la cita. */
function Tarjeta({ children }: { children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
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
  tarjeta: estilosDetalle.tarjeta,
  tituloTarjeta: estilosDetalle.tituloTarjeta,
  monto: estilosDetalle.monto,
  etiquetaMonto: {
    flexShrink: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  cifra: estilosDetalle.cifra,
  filaIcono: estilosDetalle.filaIcono,
  iconoLinea: estilosDetalle.iconoLinea,
  textoFuerte: estilosDetalle.textoFuerte,
  // Notas, motivo y explicaciones del anticipo: párrafos con interlineado 1.625.
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  pago: {
    gap: espacio.m,
  },
  seccion: {
    gap: espacio.s,
  },
  tituloSeccion: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  acciones: {
    marginTop: espacio.s,
    gap: espacio.m,
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
