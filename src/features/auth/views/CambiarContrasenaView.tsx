import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { Skeleton } from '@/shared/ui/Skeleton';
import { esqueleto, espacio, pantalla, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Aviso, RequisitosClave } from '../components/AuthContainer';
import { EncabezadoVolver } from '../components/EncabezadoVolver';
import {
  useCambiarContrasenaViewModel,
  type CampoContrasena,
} from '../viewmodels/useCambiarContrasenaViewModel';

/** Cambiar contraseña: actual, nueva con los requisitos del registro y confirmación. */
export default function CambiarContrasenaView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const vm = useCambiarContrasenaViewModel();
  const refs = useRef<Partial<Record<CampoContrasena, TextInput | null>>>({});
  const enfoqueAtendido = useRef(0);

  useEffect(() => {
    if (!vm.enfoque || vm.enfoque.vez === enfoqueAtendido.current) {
      return;
    }
    enfoqueAtendido.current = vm.enfoque.vez;
    refs.current[vm.enfoque.campo]?.focus();
  }, [vm.enfoque]);

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
            mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.reintentar }}
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
            alEnviar={vm.guardar}
            error={vm.errores.confirmacion}
          />
          <Aviso tipo="error" texto={vm.errorGeneral} />
          <Button
            titulo={vm.guardando ? 'Cambiando…' : 'Cambiar contraseña'}
            onPress={vm.guardar}
            cargando={vm.guardando}
          />
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
  campoEsqueleto: {
    height: toqueMinimo,
    width: esqueleto.anchoMedio,
  },
});
