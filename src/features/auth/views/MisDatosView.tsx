import { BellOff, Eye, PenLine, UserX, type LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { FilaTarjeta, SeccionFilas } from '@/shared/ui/TarjetaFilas';
import { espacio, fuente, pantalla, perfil, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { EncabezadoVolver } from '../components/EncabezadoVolver';
import { FilaSolicitudArco } from '../components/FilaSolicitudArco';
import { HojaConfirmacion } from '../components/HojaConfirmacion';
import { HojaSolicitudArco } from '../components/HojaSolicitudArco';
import { MiCuentaAviso } from '../components/MiCuentaAviso';
import { ResumenMisDatos } from '../components/ResumenMisDatos';
import { SeccionMisPermisos } from '../components/SeccionMisPermisos';
import type { AvisoPrivacidad } from '../viewmodels/usePermisosPrivacidad';
import { useMisDatosViewModel, type ConservaVista, type DerechoArco } from '../viewmodels/useMisDatosViewModel';
import type { SolicitudesArcoViewModel } from '../viewmodels/useSolicitudesArco';

const ICONOS: Record<DerechoArco, LucideIcon> = {
  acceso: Eye,
  rectificacion: PenLine,
  cancelacion: UserX,
  oposicion: BellOff,
};

/**
 * Perfil > Mis datos y privacidad (GP-09): mis derechos ARCO (con el acceso a mis datos), mis
 * solicitudes, mis permisos y lo que se conserva por ley. Vista: solo pinta lo del viewmodel.
 */
export default function MisDatosView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const vm = useMisDatosViewModel();

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo={vm.titulo} subtitulo={vm.subtitulo} onVolver={vm.volver} />
      <ScrollView contentContainerStyle={[styles.cuerpo, { paddingBottom: bottom + espacio.x3 }]}>
        <SeccionFilas titulo={vm.tituloDerechos}>
          {vm.derechos.map((derecho) => (
            <FilaTarjeta
              key={derecho.derecho}
              icono={ICONOS[derecho.derecho]}
              titulo={derecho.titulo}
              descripcion={derecho.descripcion}
              onPress={derecho.abrir}
              deshabilitada={derecho.deshabilitado}
            />
          ))}
        </SeccionFilas>
        <View style={styles.margen}>
          <AvisoSeccion aviso={vm.avisoDerechos} />
          <ResumenMisDatos acceso={vm.acceso} />
        </View>
        <SeccionSolicitudes vm={vm.solicitudes} />
        <SeccionMisPermisos vm={vm.permisos} />
        <SeccionConserva conserva={vm.conserva} />
      </ScrollView>
      <HojaConfirmacion
        visible={vm.oposicion.visible}
        titulo={vm.oposicion.titulo}
        texto={vm.oposicion.texto}
        accion={vm.oposicion.accion}
        cancelar={vm.oposicion.cancelar}
        onConfirmar={vm.oposicion.confirmar}
        onCancelar={vm.oposicion.cerrar}
      />
      <HojaSolicitudArco hoja={vm.solicitudes.hoja} />
    </View>
  );
}

/** Región en vivo siempre montada: el aviso se anuncia al aparecer. */
function AvisoSeccion({ aviso }: { aviso: AvisoPrivacidad | null }) {
  return <MiCuentaAviso tono={aviso?.tono ?? 'exito'} texto={aviso?.texto ?? null} />;
}

function TituloSeccion({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.textoSuave }]}>
      {texto}
    </Text>
  );
}

function TextoVacio({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return <Text style={[styles.parrafo, { color: colores.textoSuave }]}>{texto}</Text>;
}

function SeccionSolicitudes({ vm }: { vm: SolicitudesArcoViewModel }) {
  return (
    <View style={[styles.margen, styles.seccion]}>
      <TituloSeccion texto={vm.titulo} />
      <Button titulo={vm.textoNueva} variante="secundario" onPress={vm.abrirNueva} />
      <AvisoSeccion aviso={vm.aviso} />
      {vm.estado === 'cargando' ? (
        <View accessible accessibilityLabel={vm.textoCargando} accessibilityState={{ busy: true }} style={styles.seccion}>
          <Skeleton estilo={styles.esqueleto} />
          <Skeleton estilo={styles.esqueleto} />
        </View>
      ) : null}
      {vm.estado === 'error' ? (
        <>
          <MiCuentaAviso tono="peligro" texto={vm.error} />
          <Button titulo={vm.textoReintentar} variante="secundario" onPress={vm.reintentar} />
        </>
      ) : null}
      {vm.estado === 'lista' && vm.filas.length === 0 ? <TextoVacio texto={vm.textoVacia} /> : null}
      {vm.estado === 'lista' ? vm.filas.map((fila) => <FilaSolicitudArco key={fila.id} fila={fila} />) : null}
    </View>
  );
}

function SeccionConserva({ conserva }: { conserva: ConservaVista }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.margen, styles.seccion]}>
      <TituloSeccion texto={conserva.titulo} />
      <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>{conserva.intro}</Text>
      {conserva.puntos.map((punto) => (
        <View key={punto} style={styles.punto}>
          <Text importantForAccessibility="no" style={[styles.parrafo, { color: colores.oroTexto }]}>
            {'•'}
          </Text>
          <Text style={[styles.parrafo, styles.flexible, { color: colores.textoCuerpo }]}>{punto}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    gap: espacio.xxl,
  },
  margen: {
    marginHorizontal: pantalla.margen,
  },
  seccion: {
    gap: espacio.m,
  },
  tituloSeccion: {
    fontFamily: fuente.textoFuerte,
    fontSize: perfil.tituloSeccion.tamano,
    lineHeight: perfil.tituloSeccion.linea,
  },
  esqueleto: {
    height: toqueMinimo * 2,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  punto: {
    flexDirection: 'row',
    gap: espacio.s,
  },
  flexible: {
    flex: 1,
  },
});
