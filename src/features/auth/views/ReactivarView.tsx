import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { OtpInput } from '@/shared/ui/OtpInput';
import { espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { AccionesCodigo } from '../components/AccionesCodigo';
import { Aviso, Encabezado, Enlace, PantallaAuth } from '../components/AuthContainer';
import { useReactivarViewModel, type ReactivarViewModel } from '../viewmodels/useReactivarViewModel';
import { rutaAcceso } from '../viewmodels/useRetornoActivacion';

/**
 * Reactivar la cuenta: el correo, el código que llega a ese correo y la confirmación. Mismo panel,
 * encabezado, campos y botones que Activar. Cada paso entra con la aparición de contenido (con
 * movimiento reducido solo se funde) y su título recibe el foco de TalkBack.
 */
export default function ReactivarView() {
  const { colores } = useTheme();
  const { email, volverA } = useLocalSearchParams<{ email?: string; volverA?: string }>();
  const reactivar = useReactivarViewModel(typeof email === 'string' ? email : '', rutaAcceso(volverA));
  const entrada = useEntradaContenido();
  const refPaso = useRef<Text>(null);
  const pasoAnterior = useRef(reactivar.paso);

  // Al cambiar de paso, TalkBack lee el título del paso nuevo ("Paso 2 de 2: …").
  useEffect(() => {
    if (pasoAnterior.current === reactivar.paso) {
      return;
    }
    pasoAnterior.current = reactivar.paso;
    if (refPaso.current) {
      AccessibilityInfo.sendAccessibilityEvent(refPaso.current, 'focus');
    }
  }, [reactivar.paso]);

  return (
    <PantallaAuth>
      <View style={styles.formulario}>
        <Encabezado titulo={reactivar.textos.titulo} texto={reactivar.textos.explicacion} />
        <Animated.View key={reactivar.paso} entering={entrada} style={styles.paso}>
          <Text
            ref={refPaso}
            accessibilityRole="header"
            style={[styles.tituloPaso, { color: colores.texto }]}
          >
            {reactivar.textos.paso}
          </Text>
          {reactivar.paso === 'correo' ? <PasoCorreo vm={reactivar} /> : <PasoCodigo vm={reactivar} />}
        </Animated.View>
        <Enlace
          texto={reactivar.textos.volver}
          onPress={reactivar.volver}
          alinear="centro"
          deshabilitado={reactivar.reactivando}
        />
      </View>
    </PantallaAuth>
  );
}

/** Paso 1: el correo de la cuenta y "Enviarme el código". */
function PasoCorreo({ vm }: { vm: ReactivarViewModel }) {
  return (
    <>
      <Input
        etiqueta={vm.textos.etiquetaCorreo}
        tipo="correo"
        valor={vm.correo}
        onCambiar={vm.setCorreo}
        alEnviar={vm.pedirCodigo}
        placeholder="tu@correo.com"
        error={vm.errorCorreo}
      />
      <Aviso tipo="error" texto={vm.error} cortes />
      <Button
        titulo={vm.textoEnviar}
        onPress={vm.pedirCodigo}
        cargando={vm.enviando}
        deshabilitado={vm.envioEnLimite}
      />
    </>
  );
}

/** Paso 2: el código de 6 dígitos, "Reactivar mi cuenta", otro código tras 60 s y cambiar el correo. */
function PasoCodigo({ vm }: { vm: ReactivarViewModel }) {
  return (
    <>
      <Aviso tipo="exito" texto={vm.mensaje} />
      <OtpInput
        etiqueta={vm.textos.etiquetaCodigo}
        valor={vm.codigo}
        onCambiar={vm.setCodigo}
        error={vm.errorCodigo}
      />
      <Aviso tipo="error" texto={vm.error} cortes />
      <AccionesCodigo
        tituloAccion={vm.textoReactivar}
        onAccion={vm.reactivar}
        cargandoAccion={vm.reactivando}
        accionDeshabilitada={vm.reactivacionEnLimite}
        esperaOtroCodigo={vm.esperaOtroCodigo}
        textoEspera={vm.textos.espera}
        textoOtroCodigo={vm.textoOtroCodigo}
        onOtroCodigo={vm.pedirOtroCodigo}
        otroCodigoDeshabilitado={vm.envioEnLimite || vm.reactivando}
      />
      <Enlace
        texto={vm.textos.cambiarCorreo}
        onPress={vm.cambiarCorreo}
        alinear="centro"
        deshabilitado={vm.enviando || vm.reactivando}
      />
    </>
  );
}

const styles = StyleSheet.create({
  formulario: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.xl,
  },
  paso: {
    gap: espacio.xl,
  },
  tituloPaso: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiquetaCampo.tamano,
    lineHeight: tipo.etiquetaCampo.linea,
  },
});
