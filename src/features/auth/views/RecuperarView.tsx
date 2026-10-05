import { StyleSheet, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { espacio, pantalla } from '@/shared/ui/tokens';

import { Aviso, Encabezado, Enlace, PantallaAuth } from '../components/AuthContainer';
import { useRecuperarViewModel } from '../viewmodels/useRecuperarViewModel';

/** Recuperar contraseña: el correo trae un enlace que abre el sitio web. */
export default function RecuperarView() {
  const recuperar = useRecuperarViewModel();

  return (
    <PantallaAuth>
      <View style={styles.formulario}>
        <Encabezado
          titulo="Recupera tu contraseña"
          texto="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
        />
        <Input
          etiqueta="Correo electrónico"
          tipo="correo"
          valor={recuperar.correo}
          onCambiar={recuperar.setCorreo}
          placeholder="tu@correo.com"
          error={recuperar.errorCorreo}
        />
        <Aviso tipo="exito" texto={recuperar.mensaje} />
        <Aviso tipo="error" texto={recuperar.error} />
        <Button
          titulo={recuperar.cargando ? 'Enviando…' : 'Enviar enlace'}
          onPress={recuperar.enviar}
          cargando={recuperar.cargando}
        />
        <Enlace texto="Volver a iniciar sesión" onPress={recuperar.volver} alinear="centro" />
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
});
