import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { espacio, fuente, icono, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

interface HojaCancelarPedidoProps {
  visible: boolean;
  onCerrar: () => void;
  /** Número del pedido para el título. */
  numero: number | string;
  /** Texto de la confirmación (textoCancelarPedido: avisa a quién escribir si ya se pagó). */
  texto: string;
  cancelando: boolean;
  /** Mensaje para la clienta si la cancelación falló, o null. */
  error: string | null;
  /** false si, tras recargar, el pedido ya no se puede cancelar (por ejemplo, ya se prepara). */
  puedeConfirmar: boolean;
  onCancelar: () => void;
}

/** Confirmación antes de cancelar un pedido: acción en color de peligro y salida segura. */
export function HojaCancelarPedido({
  visible,
  onCerrar,
  numero,
  texto,
  cancelando,
  error,
  puedeConfirmar,
  onCancelar,
}: HojaCancelarPedidoProps) {
  const { colores } = useTheme();
  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo={`¿Cancelar el pedido #${numero}?`}
      texto={texto}
    >
      {/* Región en vivo siempre montada: TalkBack anuncia el error cuando aparece. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {error ? (
          <View style={styles.error}>
            <View style={styles.iconoLinea}>
              <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoError, { color: colores.peligro }]}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.acciones}>
        <Button
          titulo={cancelando ? 'Cancelando tu pedido' : 'Sí, cancelar pedido'}
          variante="peligro"
          onPress={onCancelar}
          cargando={cancelando}
          deshabilitado={!puedeConfirmar}
        />
        <Button
          titulo="No, conservarlo"
          variante="secundario"
          onPress={onCerrar}
          deshabilitado={cancelando}
        />
      </View>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoError: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  acciones: {
    gap: espacio.m,
  },
});
