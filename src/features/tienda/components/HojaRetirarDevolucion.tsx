import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { SolicitudDevolucionViewModel } from '../viewmodels/useDetallePedidoViewModel';
import { ErrorHoja } from './ErrorHoja';

interface HojaRetirarDevolucionProps {
  solicitud: SolicitudDevolucionViewModel;
}

/**
 * Confirmación antes de retirar una solicitud pendiente: qué pasa al retirarla, la acción en color de
 * peligro y la salida segura. Mientras retira, ni el botón ni la hoja responden.
 */
export function HojaRetirarDevolucion({ solicitud }: HojaRetirarDevolucionProps) {
  const { colores } = useTheme();
  const { textosRetirar: textos, retirando } = solicitud;
  return (
    <Hoja visible={solicitud.retiroPendiente !== null} onCerrar={solicitud.cerrarRetiro} titulo={textos.titulo}>
      <View style={styles.contenido}>
        <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>{textos.texto}</Text>
        <ErrorHoja mensaje={solicitud.errorRetiro} />
        <View style={styles.acciones}>
          <Button
            titulo={retirando ? textos.retirando : textos.confirmar}
            variante="peligro"
            onPress={solicitud.confirmarRetiro}
            cargando={retirando}
          />
          <Button titulo={textos.conservar} variante="secundario" onPress={solicitud.cerrarRetiro} deshabilitado={retirando} />
        </View>
      </View>
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
  },
  acciones: {
    gap: espacio.m,
  },
});
