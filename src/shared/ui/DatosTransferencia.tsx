import { CircleAlert, CircleCheck, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DatosTransferencia as Datos } from '@/shared/api/configuracionPublica';
import { useTextos } from '@/shared/api/useTextos';

import { Button } from './Button';
import { copiarTexto } from './portapapeles';
import { espacio, fuente, icono, tipo } from './tokens';
import { useTheme } from './useTheme';

interface DatosTransferenciaProps {
  /** null: la transferencia está apagada o incompleta y no se muestra nada. */
  datos: Datos | null;
}

/** Resultado de copiar una CLABE: se guarda cuál para no mostrarlo si la cuenta cambió. */
interface Copiado {
  clabe: string;
  ok: boolean;
}

/** "0 1 2 ...": el lector de pantalla lee la CLABE dígito por dígito, no como una cifra enorme. */
function porDigitos(texto: string): string {
  return Array.from(texto).join(' ');
}

/**
 * Banco, titular y CLABE para pagar por transferencia en el salón (DatosTransferencia de la web), con
 * un botón para copiar la CLABE. La CLABE también se puede seleccionar por si copiar no funciona. Los
 * datos solo llegan de la configuración pública en memoria; aquí no hay ninguno escrito.
 */
export function DatosTransferencia({ datos }: DatosTransferenciaProps) {
  const { colores } = useTheme();
  const t = useTextos();
  const [copiado, setCopiado] = useState<Copiado | null>(null);

  if (!datos) {
    return null;
  }

  const { clabe } = datos;
  const resultado = copiado?.clabe === clabe ? copiado.ok : null;

  const copiar = () => {
    // copiarTexto nunca rechaza: siempre resuelve true o false.
    void copiarTexto(clabe).then((ok) => setCopiado({ clabe, ok }));
  };

  const etiquetaClabe = t('pagos.transferencia.clabe');

  return (
    <View style={styles.contenedor}>
      <View style={styles.filas}>
        <Fila etiqueta={t('pagos.transferencia.banco')} valor={datos.banco} />
        <Fila etiqueta={t('pagos.transferencia.titular')} valor={datos.titular} />
        <Fila etiqueta={etiquetaClabe} valor={clabe} lectura={porDigitos(clabe)} cifras />
      </View>
      <Button
        titulo={t('pagos.transferencia.copiar')}
        variante="contorno"
        icono={<Copy color={colores.contorno} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />}
        posicionIcono="inicio"
        accessibilityHint={t('pagos.transferencia.copiarAyuda')}
        onPress={copiar}
      />
      {/* Región en vivo siempre montada: TalkBack anuncia el resultado al aparecer. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {resultado === null ? null : (
          <View accessible style={styles.resultado}>
            <View style={styles.iconoResultado}>
              {resultado ? (
                <CircleCheck color={colores.exito} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              ) : (
                <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              )}
            </View>
            <Text style={[styles.textoResultado, { color: colores.texto }]}>
              {resultado ? t('pagos.transferencia.copiada') : t('pagos.transferencia.noCopiada')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Fila({
  etiqueta,
  valor,
  lectura = valor,
  cifras = false,
}: {
  etiqueta: string;
  valor: string;
  /** Cómo lo lee el lector de pantalla; por omisión, el valor. */
  lectura?: string;
  cifras?: boolean;
}) {
  const { colores } = useTheme();
  return (
    <View accessible accessibilityLabel={`${etiqueta}: ${lectura}`} style={styles.fila}>
      <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text selectable style={[styles.valor, cifras && styles.cifras, { color: colores.texto }]}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: espacio.m,
  },
  filas: {
    gap: espacio.s,
  },
  fila: {
    flexDirection: 'row',
    gap: espacio.m,
  },
  etiqueta: {
    minWidth: espacio.xxl * 2,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  valor: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cifras: {
    fontVariant: ['tabular-nums'],
  },
  resultado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  iconoResultado: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.pequeno.linea - icono.tamanoPequeno) / 2,
  },
  textoResultado: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
