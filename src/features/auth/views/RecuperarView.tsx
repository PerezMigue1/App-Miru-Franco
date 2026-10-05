import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { espacio, pantalla } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Encabezado, Enlace, PanelMarca } from '../components/AuthContainer';

/** Recuperar contraseña: solo visual (GP-05). */
export default function RecuperarView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { back, canGoBack, replace } = useRouter();
  const [correo, setCorreo] = useState('');

  const volver = () => {
    if (canGoBack()) {
      back();
    } else {
      replace('/login');
    }
  };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <StatusBar style="light" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
      >
        <PanelMarca />
        <View style={styles.formulario}>
          <Encabezado
            titulo="Recupera tu contraseña"
            texto="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
          />
          <Input
            etiqueta="Correo electrónico"
            tipo="correo"
            valor={correo}
            onCambiar={setCorreo}
            placeholder="tu@correo.com"
          />
          {/* TODO(GP-05): enviar el enlace de recuperación con el backend. */}
          <Button titulo="Enviar enlace" accessibilityHint="Disponible próximamente" />
          <Enlace texto="Volver a iniciar sesión" onPress={volver} alinear="centro" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  formulario: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.xl,
  },
});
