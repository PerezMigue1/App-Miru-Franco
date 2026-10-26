import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { espacio, fuente, icono, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { useTextosTienda } from '../viewmodels/textosTienda';

interface HojaCancelarPedidoProps {
  visible: boolean;
  onCerrar: () => void;
  /** Número del pedido para el título. */
  numero: number | string;
  /** Texto de la confirmación (textoCancelarPedido: si ya se pagó en línea, avisa de la devolución). */
  texto: string;
  cancelando: boolean;
  /** Tras un 429: "Intenta de nuevo en N s" en lugar del texto del botón; null o sin pasar si no hay espera. */
  textoEspera?: string | null;
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
  textoEspera = null,
  error,
  puedeConfirmar,
  onCancelar,
}: HojaCancelarPedidoProps) {
  const { colores } = useTheme();
  const { cancelarPedido: textos } = useTextosTienda();
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={textos.titulo(numero)} texto={texto}>
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
          titulo={textoEspera ?? (cancelando ? textos.cancelando : textos.confirmar)}
          variante="peligro"
          onPress={onCancelar}
          cargando={cancelando}
          deshabilitado={!puedeConfirmar}
        />
        <Button
          titulo={textos.conservar}
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
