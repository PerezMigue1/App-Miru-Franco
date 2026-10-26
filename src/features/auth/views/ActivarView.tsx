import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { OtpInput } from '@/shared/ui/OtpInput';
import { espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { AccionesCodigo } from '../components/AccionesCodigo';
import { Aviso, Encabezado, Enlace, PantallaAuth } from '../components/AuthContainer';
import { useActivarViewModel } from '../viewmodels/useActivarViewModel';
import { rutaAcceso } from '../viewmodels/useRetornoActivacion';

/** Activación de la cuenta con el código que llegó al correo. */
export default function ActivarView() {
  const { colores } = useTheme();
  const { email, enviado, volverA } = useLocalSearchParams<{
    email?: string;
    enviado?: string;
    volverA?: string;
  }>();
  const activar = useActivarViewModel(
    typeof email === 'string' ? email : '',
    enviado === '1',
    rutaAcceso(volverA),
  );

  return (
    <PantallaAuth>
      <View style={styles.formulario}>
        <Encabezado titulo={activar.textos.titulo} texto={activar.textos.instrucciones} />
        <OtpInput
          etiqueta="Código de verificación"
          valor={activar.codigo}
          onCambiar={activar.setCodigo}
          error={activar.error}
        />
        <Text style={[styles.nota, { color: colores.textoSuave }]}>{activar.textos.vigencia}</Text>
        <Aviso tipo="exito" texto={activar.mensaje} />
        <AccionesCodigo
          tituloAccion={activar.textoVerificar}
          onAccion={activar.verificar}
          cargandoAccion={activar.cargando}
          accionDeshabilitada={activar.verificacionEnLimite}
          esperaOtroCodigo={activar.espera}
          textoEspera={activar.textos.espera}
          textoOtroCodigo={activar.textoReenviar}
          onOtroCodigo={activar.reenviar}
          otroCodigoDeshabilitado={activar.reenvioEnLimite}
        />
        <Enlace texto={activar.textos.volver} onPress={activar.volver} alinear="centro" />
      </View>
    </PantallaAuth>
  );
}

const styles = StyleSheet.create({
  formulario: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.xl,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
