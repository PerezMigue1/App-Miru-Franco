import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Monograma } from '@/shared/ui/Monograma';
import { espacio, fuente, pantalla, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface InvitacionSesionProps {
  titulo: string;
  /** Una línea con lo que gana al entrar. */
  beneficio: string;
}

/** Sin sesión: monograma, título, beneficio y los dos caminos (crear cuenta o iniciar sesión). */
export function InvitacionSesion({ titulo, beneficio }: InvitacionSesionProps) {
  const { colores } = useTheme();
  const { push } = useRouter();
  return (
    <View style={styles.contenedor}>
      <Monograma tamano="mediano" />
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <Text style={[styles.beneficio, { color: colores.textoSuave }]}>{beneficio}</Text>
      <View style={styles.botones}>
        <Button titulo="Crear cuenta" onPress={() => push('/registro')} />
        <Button titulo="Iniciar sesión" variante="secundario" onPress={() => push('/login')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
    paddingVertical: espacio.x3,
  },
  titulo: {
    marginTop: espacio.s,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
    textAlign: 'center',
  },
  beneficio: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    textAlign: 'center',
  },
  botones: {
    alignSelf: 'stretch',
    gap: espacio.m,
    marginTop: espacio.s,
  },
});
