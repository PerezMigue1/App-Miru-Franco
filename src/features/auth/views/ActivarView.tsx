import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { OtpInput } from '@/shared/ui/OtpInput';
import { espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

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
        <Encabezado
          titulo="Activa tu cuenta"
          texto={
            activar.email
              ? `Escribe el código de 6 dígitos que enviamos a ${activar.email}.`
              : 'Escribe el código de 6 dígitos que enviamos a tu correo.'
          }
        />
        <OtpInput
          etiqueta="Código de verificación"
          valor={activar.codigo}
          onCambiar={activar.setCodigo}
          error={activar.error}
        />
        <Text style={[styles.nota, { color: colores.textoSuave }]}>El código vence en 2 minutos.</Text>
        <Aviso tipo="exito" texto={activar.mensaje} />
        <Button
          titulo={activar.cargando ? 'Verificando…' : 'Verificar código'}
          onPress={activar.verificar}
          cargando={activar.cargando}
        />
        {activar.espera > 0 ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.nota, styles.espera, { color: colores.textoSuave }]}
          >
            Podrás pedir otro código en {activar.espera} s
          </Text>
        ) : (
          <Enlace
            texto={activar.reenviando ? 'Enviando código…' : 'Reenviar código'}
            onPress={activar.reenviar}
            alinear="centro"
          />
        )}
        <Enlace texto="Volver a iniciar sesión" onPress={activar.volver} alinear="centro" />
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
  espera: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
