import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { espacio, fuente, pantalla, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { AccesoGoogle, Aviso, Encabezado, Enlace, PantallaAuth } from '../components/AuthContainer';
import { useGoogleViewModel } from '../viewmodels/useGoogleViewModel';
import { useRecuperarViewModel } from '../viewmodels/useRecuperarViewModel';

/**
 * Recuperar contraseña: el correo trae un enlace que abre el sitio web. Las cuentas creadas con
 * Google no tienen contraseña ni reciben ese correo, y el servidor responde igual exista o no la
 * cuenta: por eso la nota de Google es fija (nunca depende de la respuesta) y el botón de Google
 * está aquí mismo.
 */
export default function RecuperarView() {
  const recuperar = useRecuperarViewModel();
  const google = useGoogleViewModel();
  const { colores } = useTheme();

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
          titulo={recuperar.textoEnviar}
          onPress={recuperar.enviar}
          cargando={recuperar.cargando}
          deshabilitado={google.abriendo || recuperar.enEspera}
        />
        <AccesoGoogle google={google} ocupado={recuperar.cargando} />
        <Text style={[styles.nota, { color: colores.textoSuave }]}>{recuperar.notaGoogle}</Text>
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
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
});
