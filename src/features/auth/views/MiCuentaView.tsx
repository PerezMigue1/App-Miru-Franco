import { CirclePause, Trash } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Casilla } from '@/shared/ui/Casilla';
import { Input } from '@/shared/ui/Input';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { OtpInput } from '@/shared/ui/OtpInput';
import { Skeleton } from '@/shared/ui/Skeleton';
import { FilaTarjeta, SeccionFilas } from '@/shared/ui/TarjetaFilas';
import { esqueleto, espacio, fuente, pantalla, tipo, toqueMinimo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Enlace } from '../components/AuthContainer';
import { EncabezadoVolver } from '../components/EncabezadoVolver';
import { MiCuentaAviso } from '../components/MiCuentaAviso';
import { PendienteFila } from '../components/PendienteFila';
import {
  useMiCuentaViewModel,
  type ConfirmacionVista,
  type MiCuentaViewModel,
  type RevisionVista,
} from '../viewmodels/useMiCuentaViewModel';

/**
 * Perfil > Mi cuenta: desactivar o eliminar la cuenta en tres pasos (elegir, revisar pendientes y
 * confirmar). Al terminar, la sesión se cierra y Acceso muestra el mensaje con el folio.
 */
export default function MiCuentaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const entrada = useEntradaContenido();
  const vm = useMiCuentaViewModel();

  // Al cambiar de paso se anuncia a dónde llegó la clienta.
  const { encabezadoPaso, mensajePersonal } = vm;
  useEffect(() => {
    if (!mensajePersonal) {
      AccessibilityInfo.announceForAccessibility(encabezadoPaso);
    }
  }, [encabezadoPaso, mensajePersonal]);

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo={vm.titulo} onVolver={vm.volver} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.cuerpo, { paddingBottom: bottom + espacio.x3 }]}
      >
        {mensajePersonal ? (
          <Text accessibilityLiveRegion="polite" style={[styles.parrafo, { color: colores.texto }]}>
            {mensajePersonal}
          </Text>
        ) : (
          // Al cambiar de paso, el contenido aparece en 220 ms (con movimiento reducido, solo se funde).
          <Animated.View key={vm.paso} entering={entrada} style={styles.paso}>
            <Text accessibilityRole="header" style={[styles.encabezado, { color: colores.texto }]}>
              {encabezadoPaso}
            </Text>
            <ContenidoPaso vm={vm} />
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ContenidoPaso({ vm }: { vm: MiCuentaViewModel }) {
  if (vm.paso === 'revision') {
    return <PasoRevision revision={vm.revision} />;
  }
  if (vm.paso === 'confirmar') {
    return <PasoConfirmar confirmacion={vm.confirmacion} />;
  }
  return (
    <SeccionFilas estilo={styles.sinMargen}>
      {vm.opciones.map((opcion) => (
        <FilaTarjeta
          key={opcion.accion}
          icono={opcion.accion === 'eliminar' ? Trash : CirclePause}
          titulo={opcion.titulo}
          descripcion={opcion.explicacion}
          onPress={opcion.elegir}
        />
      ))}
    </SeccionFilas>
  );
}

function PasoRevision({ revision }: { revision: RevisionVista }) {
  const { colores } = useTheme();
  const volver = <Enlace texto={revision.textoVolver} onPress={revision.volverAElegir} alinear="centro" />;

  if (revision.estado === 'cargando') {
    return (
      <>
        <MiCuentaAviso tono="peligro" texto={revision.aviso} />
        <View style={styles.paso} accessible accessibilityLabel={revision.textoRevisando}>
          <Skeleton estilo={styles.filaEsqueleto} />
          <Skeleton estilo={styles.filaEsqueleto} />
        </View>
        {volver}
      </>
    );
  }

  if (revision.estado === 'error') {
    return (
      <>
        <MiCuentaAviso tono="peligro" texto={revision.error} />
        <Button
          titulo={revision.textoRevisarDeNuevo}
          variante="secundario"
          onPress={revision.revisarDeNuevo}
          deshabilitado={revision.revisarEnEspera}
        />
        {volver}
      </>
    );
  }

  const conBloqueos = revision.bloqueos.length > 0;
  return (
    <>
      <MiCuentaAviso tono="peligro" texto={revision.aviso} />
      {conBloqueos ? (
        <SeccionFilas titulo={revision.encabezadoBloqueos} estilo={styles.sinMargen}>
          {revision.bloqueos.map((pendiente) => (
            <PendienteFila key={pendiente.clave} pendiente={pendiente} />
          ))}
        </SeccionFilas>
      ) : null}
      {revision.seResuelveSolo.length > 0 ? (
        <SeccionFilas titulo={revision.encabezadoSeResuelve} estilo={styles.sinMargen}>
          {revision.seResuelveSolo.map((pendiente) => (
            <PendienteFila key={pendiente.clave} pendiente={pendiente} />
          ))}
        </SeccionFilas>
      ) : null}
      {conBloqueos || revision.seResuelveSolo.length > 0 ? null : (
        <Text style={[styles.parrafo, { color: colores.texto }]}>{revision.sinPendientes}</Text>
      )}
      {conBloqueos ? (
        <Button
          titulo={revision.textoRevisarDeNuevo}
          variante="secundario"
          onPress={revision.revisarDeNuevo}
          deshabilitado={revision.revisarEnEspera}
        />
      ) : null}
      {revision.puedeContinuar ? <Button titulo={revision.textoContinuar} onPress={revision.continuar} /> : null}
      {volver}
    </>
  );
}

function PasoConfirmar({ confirmacion: c }: { confirmacion: ConfirmacionVista }) {
  const { colores } = useTheme();
  const refPassword = useRef<TextInput | null>(null);
  const refCodigo = useRef<TextInput | null>(null);

  // Con un error del dato, el foco vuelve a su campo para corregirlo.
  useEffect(() => {
    if (c.errorPassword) {
      refPassword.current?.focus();
    }
  }, [c.errorPassword]);
  useEffect(() => {
    if (c.errorCodigo) {
      refCodigo.current?.focus();
    }
  }, [c.errorCodigo]);

  return (
    <>
      <MiCuentaAviso tono="irreversible" texto={c.avisoIrreversible} />
      <Text style={[styles.parrafo, { color: colores.texto }]}>{c.instruccion}</Text>
      {c.metodo === 'password' ? (
        <Input
          ref={refPassword}
          etiqueta={c.etiquetaPassword}
          tipo="claveActual"
          valor={c.password}
          onCambiar={c.setPassword}
          error={c.errorPassword}
        />
      ) : (
        <>
          <Button
            titulo={c.tituloEnviarCodigo}
            variante="secundario"
            onPress={c.enviarCodigo}
            cargando={c.enviandoCodigo}
            deshabilitado={c.codigoEnEspera || c.enviando}
          />
          <MiCuentaAviso tono="exito" texto={c.avisoCodigo} />
          <OtpInput
            ref={refCodigo}
            etiqueta={c.etiquetaCodigo}
            valor={c.codigo}
            onCambiar={c.setCodigo}
            error={c.errorCodigo}
            deletrear
          />
        </>
      )}
      <Casilla marcada={c.casilla} onCambiar={c.setCasilla} etiquetaAccesible={c.textoCasilla} deshabilitada={c.enviando}>
        {c.textoCasilla}
      </Casilla>
      <MiCuentaAviso tono="peligro" texto={c.aviso} />
      <Button
        titulo={c.tituloConfirmar}
        variante={c.esEliminar ? 'peligro' : 'primario'}
        onPress={c.confirmar}
        cargando={c.enviando}
        deshabilitado={!c.listo || c.confirmarEnEspera || c.enviandoCodigo}
      />
      <Enlace texto={c.textoVolver} onPress={c.volverAElegir} alinear="centro" deshabilitado={c.enviando} />
    </>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xl,
  },
  paso: {
    gap: espacio.xl,
  },
  // Las secciones de filas ya traen el margen de pantalla: aquí lo pone el cuerpo.
  sinMargen: {
    marginHorizontal: 0,
  },
  encabezado: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  filaEsqueleto: {
    height: toqueMinimo,
    width: esqueleto.anchoMedio,
  },
});
