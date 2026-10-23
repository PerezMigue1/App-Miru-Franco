import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { Input } from '@/shared/ui/Input';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { TextosRevocar } from '../viewmodels/useDetallePedidoViewModel';
import { ErrorHoja } from './ErrorHoja';

interface HojaRevocarCompraProps {
  visible: boolean;
  onCerrar: () => void;
  textos: TextosRevocar;
  /** El derecho, cuánto se reintegra, qué pasa con el pedido y hasta cuándo (textosHojaRevocar). */
  parrafos: string[];
  motivo: string;
  onCambiarMotivo: (motivo: string) => void;
  largoMotivo: number;
  revocando: boolean;
  /** Mensaje para la clienta si la revocación no salió y se puede intentar de nuevo, o null. */
  error: string | null;
  onRevocar: () => void;
}

/**
 * Confirmación antes de revocar la compra (art. 56 LFPC): el aviso completo de lo que pasa con el
 * dinero y con el pedido, un motivo opcional y la acción en color de peligro con salida segura.
 * Mientras revoca, ni el botón ni la hoja responden (el viewmodel además usa un candado).
 */
export function HojaRevocarCompra({
  visible,
  onCerrar,
  textos,
  parrafos,
  motivo,
  onCambiarMotivo,
  largoMotivo,
  revocando,
  error,
  onRevocar,
}: HojaRevocarCompraProps) {
  const { colores } = useTheme();
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={textos.titulo}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}>
        {parrafos.map((parrafo) => (
          <Text key={parrafo} style={[styles.parrafo, { color: colores.textoCuerpo }]}>
            {parrafo}
          </Text>
        ))}

        <Input
          etiqueta={textos.motivo}
          valor={motivo}
          onCambiar={onCambiarMotivo}
          ayuda={textos.motivoAyuda}
          multilinea
          largoMaximo={largoMotivo}
        />

        <ErrorHoja mensaje={error} />

        <View style={styles.acciones}>
          <Button
            titulo={revocando ? textos.revocando : textos.confirmar}
            variante="peligro"
            onPress={onRevocar}
            cargando={revocando}
          />
          <Button titulo={textos.conservar} variante="secundario" onPress={onCerrar} deshabilitado={revocando} />
        </View>
      </ScrollView>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  contenido: {
    gap: espacio.l,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
    fontVariant: ['tabular-nums'],
  },
  acciones: {
    gap: espacio.m,
  },
});
