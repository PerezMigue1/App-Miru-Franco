import { Circle, CircleDot } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { Input } from '@/shared/ui/Input';
import { espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { HojaSolicitudVista } from '../viewmodels/useSolicitudesArco';
import { MiCuentaAviso } from './MiCuentaAviso';

/**
 * Hoja para hacer una solicitud ARCO (vista: solo pinta): el derecho a ejercer como un grupo de
 * opciones sin ninguna elegida al abrir, la descripción opcional con su límite y "Enviar", que no se
 * puede tocar sin tipo o durante la espera de un 429. El error se anuncia sin interrumpir.
 */
export function HojaSolicitudArco({ hoja }: { hoja: HojaSolicitudVista }) {
  const { colores } = useTheme();
  return (
    <Hoja visible={hoja.visible} onCerrar={hoja.cerrar} titulo={hoja.titulo} texto={hoja.texto}>
      <ScrollView style={styles.desplazable} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="radiogroup" accessibilityLabel={hoja.pregunta} style={styles.opciones}>
          <Text style={[styles.pregunta, { color: colores.textoCuerpo }]}>{hoja.pregunta}</Text>
          {hoja.opciones.map((opcion) => {
            const Icono = opcion.elegida ? CircleDot : Circle;
            return (
              <Pressable
                key={opcion.tipo}
                accessibilityRole="radio"
                accessibilityLabel={`${opcion.titulo}, ${opcion.ayuda}`}
                accessibilityState={{ checked: opcion.elegida, disabled: hoja.enviando }}
                disabled={hoja.enviando}
                onPress={opcion.elegir}
                style={({ pressed }) => [
                  styles.opcion,
                  { backgroundColor: pressed ? colores.presionado : colores.transparente },
                ]}
              >
                <Icono
                  color={opcion.elegida ? colores.foco : colores.campoBorde}
                  size={icono.tamano}
                  strokeWidth={icono.trazo}
                />
                <View style={styles.textos}>
                  <Text style={[styles.titulo, { color: colores.texto }]}>{opcion.titulo}</Text>
                  <Text style={[styles.ayuda, { color: colores.textoSuave }]}>{opcion.ayuda}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Input
          etiqueta={hoja.etiquetaDescripcion}
          valor={hoja.descripcion}
          onCambiar={hoja.setDescripcion}
          multilinea
          largoMaximo={hoja.largoMaximo}
          ayuda={hoja.ayudaDescripcion}
        />
        <MiCuentaAviso tono="peligro" texto={hoja.error} detalle={hoja.detalleError} />
        <View style={styles.acciones}>
          <Button
            titulo={hoja.textoEnviar}
            onPress={hoja.enviar}
            deshabilitado={hoja.enviarDeshabilitado}
            cargando={hoja.enviando}
            accessibilityHint={hoja.pistaSinTipo ?? undefined}
          />
          <Button titulo={hoja.textoCancelar} variante="secundario" onPress={hoja.cerrar} deshabilitado={hoja.enviando} />
        </View>
      </ScrollView>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  // Se encoge si el teclado deja poco espacio; si no, mide lo que su contenido.
  desplazable: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contenido: {
    gap: espacio.l,
  },
  opciones: {
    gap: espacio.xxs,
  },
  pregunta: {
    marginBottom: espacio.xs,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  opcion: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.s,
    paddingVertical: espacio.xs,
    borderRadius: radio.campo,
  },
  textos: {
    flex: 1,
  },
  titulo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  ayuda: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  acciones: {
    gap: espacio.m,
  },
});
