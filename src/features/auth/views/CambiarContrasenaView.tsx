import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { OtpInput } from '@/shared/ui/OtpInput';
import { Skeleton } from '@/shared/ui/Skeleton';
import { esqueleto, espacio, fuente, pantalla, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Aviso, Enlace, RequisitosClave } from '../components/AuthContainer';
import { EncabezadoVolver } from '../components/EncabezadoVolver';
import {
  useCambiarContrasenaViewModel,
  type CampoContrasena,
} from '../viewmodels/useCambiarContrasenaViewModel';

/**
 * Cambiar contraseña en dos pasos: 1) contraseña actual, nueva y confirmación; 2) el código que
 * llega al correo. Al cambiarla, la sesión se cierra y se abre Acceso.
 */
export default function CambiarContrasenaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const entrada = useEntradaContenido();
  const vm = useCambiarContrasenaViewModel();
  const refs = useRef<Partial<Record<CampoContrasena, TextInput | null>>>({});
  const enfoqueAtendido = useRef(0);

  // El foco va al campo con error, o al código al pasar al paso 2.
  useEffect(() => {
    if (!vm.enfoque || vm.enfoque.vez === enfoqueAtendido.current) {
      return;
    }
    enfoqueAtendido.current = vm.enfoque.vez;
    refs.current[vm.enfoque.campo]?.focus();
  }, [vm.enfoque]);

  // El cambio al paso 2 mueve el foco al código: se anuncia antes a dónde llegó y cuánto dura.
  const instrucciones = `Te enviamos un código a tu correo. Vence en ${vm.vigenciaMinutos} ${
    vm.vigenciaMinutos === 1 ? 'minuto' : 'minutos'
  }.`;
  useEffect(() => {
    if (vm.paso === 2) {
      AccessibilityInfo.announceForAccessibility(instrucciones);
    }
  }, [vm.paso, instrucciones]);

  const ref = (campo: CampoContrasena) => (instancia: TextInput | null) => {
    refs.current[campo] = instancia;
  };
  // Si falta un requisito de la lista, se marca en la lista en lugar de repetirlo en rojo.
  const faltanRequisitos = vm.requisitos.some((requisito) => !requisito.cumplido);
  const marcarFaltantes = Boolean(vm.errores.nueva) && faltanRequisitos;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Cambiar contraseña" onVolver={vm.volver} />
      {vm.estado === 'error' ? (
        <View style={styles.cuerpo}>
          <EmptyState
            titulo="No pudimos cargar tu cuenta"
            mensaje={vm.mensajeError ?? ''}
            accion={{ titulo: vm.textoReintentar, onPress: vm.reintentar }}
          />
        </View>
      ) : null}
      {vm.estado === 'cargando' ? (
        <View style={styles.cuerpo} accessible accessibilityLabel="Cargando">
          <Skeleton estilo={styles.campoEsqueleto} />
          <Skeleton estilo={styles.campoEsqueleto} />
        </View>
      ) : null}
      {vm.estado === 'listo' ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.cuerpo, { paddingBottom: bottom + espacio.x3 }]}
        >
          {/* Al cargar y al cambiar de paso, el contenido aparece en 220 ms en lugar de saltar. */}
          <Animated.View key={vm.paso} entering={entrada} style={styles.paso}>
            {vm.paso === 1 ? (
              <>
                <Input
                  ref={ref('actual')}
                  etiqueta="Contraseña actual"
                  tipo="claveActual"
                  valor={vm.valores.actual}
                  onCambiar={(t) => vm.cambiar('actual', t)}
                  onSalir={() => vm.salirDe('actual')}
                  siguiente={() => refs.current.nueva?.focus()}
                  error={vm.errores.actual}
                />
                <Input
                  ref={ref('nueva')}
                  etiqueta="Contraseña nueva"
                  tipo="claveNueva"
                  valor={vm.valores.nueva}
                  onCambiar={(t) => vm.cambiar('nueva', t)}
                  onSalir={() => vm.salirDe('nueva')}
                  siguiente={() => refs.current.confirmacion?.focus()}
                  error={marcarFaltantes ? null : vm.errores.nueva}
                  estado={marcarFaltantes ? { tipo: 'error', texto: 'Te faltan requisitos de la contraseña.' } : null}
                  debajo={
                    <RequisitosClave
                      requisitos={vm.requisitos}
                      aviso={vm.avisoDatosPersonales}
                      marcarFaltantes={marcarFaltantes}
                    />
                  }
                />
                <Input
                  ref={ref('confirmacion')}
                  etiqueta="Confirmar contraseña nueva"
                  tipo="claveNueva"
                  valor={vm.valores.confirmacion}
                  onCambiar={(t) => vm.cambiar('confirmacion', t)}
                  onSalir={() => vm.salirDe('confirmacion')}
                  alEnviar={vm.enviarCodigo}
                  error={vm.errores.confirmacion}
                />
                <Aviso tipo="error" texto={vm.aviso} />
                <Button
                  titulo={vm.tituloEnvio}
                  onPress={vm.enviarCodigo}
                  cargando={vm.enviando}
                  deshabilitado={vm.enEspera}
                />
                <Enlace
                  texto="¿Olvidaste tu contraseña?"
                  onPress={vm.abrirOlvido}
                  alinear="centro"
                  accessibilityHint="Se abre en el navegador"
                />
              </>
            ) : (
              <>
                <Text style={[styles.parrafo, { color: colores.texto }]}>{instrucciones}</Text>
                <OtpInput
                  ref={ref('codigo')}
                  etiqueta="Código de verificación"
                  valor={vm.codigo}
                  onCambiar={vm.setCodigo}
                  error={vm.errores.codigo}
                  deletrear
                />
                <Aviso tipo="exito" texto={vm.avisoExito} />
                <Aviso tipo="error" texto={vm.aviso} />
                <Text style={[styles.parrafo, { color: colores.textoSuave }]}>
                  Al cambiarla se cerrará tu sesión en todos tus dispositivos; entra de nuevo con tu
                  contraseña nueva.
                </Text>
                <Button
                  titulo={vm.tituloCambiar}
                  onPress={vm.cambiarContrasena}
                  deshabilitado={vm.reenviando || vm.cambioEnEspera}
                  cargando={vm.cambiando}
                />
                <Button
                  titulo={vm.tituloReenviar}
                  variante="secundario"
                  onPress={vm.reenviar}
                  deshabilitado={vm.espera > 0 || vm.cambiando || vm.enEspera}
                  cargando={vm.reenviando}
                />
                {/* La espera va como texto legible (el botón deshabilitado se atenúa); no se anuncia
                    cada segundo. */}
                {vm.espera > 0 ? (
                  <Text
                    accessibilityLabel={`Podrás pedir otro código en ${vm.espera} segundos`}
                    style={[styles.nota, styles.espera, { color: colores.textoSuave }]}
                  >
                    Podrás pedir otro código en {vm.espera} s
                  </Text>
                ) : null}
                <Enlace texto="Corregir mis datos" onPress={vm.volverAlPaso1} alinear="centro" />
              </>
            )}
          </Animated.View>
        </ScrollView>
      ) : null}
    </KeyboardAvoidingView>
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
  // Instrucciones y aviso de varias líneas: interlineado de párrafo (1.625).
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  // Cuenta regresiva: cifras tabulares para que el texto no tiemble cada segundo.
  espera: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  campoEsqueleto: {
    height: toqueMinimo,
    width: esqueleto.anchoMedio,
  },
});
