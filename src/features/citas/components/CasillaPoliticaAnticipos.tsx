import { StyleSheet, Text, View } from 'react-native';

import { Casilla, EnlaceEnTexto } from '@/shared/ui/Casilla';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import {
  useCasillaPoliticaAnticipos,
  type ReglasPoliticaAnticipos,
} from '../viewmodels/useCasillaPoliticaAnticipos';

interface CasillaPoliticaAnticiposProps {
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
  /** Mensaje si falta marcarla (por ejemplo, textoFaltaPolitica), o null. */
  error?: string | null;
  /** Reglas guardadas de una cita (detalle de la cita); sin ellas, las vigentes. */
  reglas?: ReglasPoliticaAnticipos;
  /** Mientras se envía no cambia (la casilla y su texto). */
  deshabilitada?: boolean;
}

/**
 * Casilla obligatoria antes de pagar el anticipo en línea o de apartar para pagarlo en el salón:
 * arriba el resumen de la política y la versión vigente, y la casilla "Leí la Política de anticipos y
 * cancelación" con el nombre de la política como enlace al visor. El estado lo controla el padre.
 */
export function CasillaPoliticaAnticipos({ marcada, onCambiar, error, reglas, deshabilitada }: CasillaPoliticaAnticiposProps) {
  const { colores } = useTheme();
  const { resumen, etiqueta, version, abrirPolitica } = useCasillaPoliticaAnticipos(reglas);

  return (
    <View style={styles.contenedor}>
      <Text style={[styles.resumen, { color: colores.textoCuerpo }]}>{resumen}</Text>
      {version ? <Text style={[styles.version, { color: colores.textoSuave }]}>{version}</Text> : null}
      <Casilla
        marcada={marcada}
        onCambiar={onCambiar}
        etiquetaAccesible={etiqueta.completa}
        error={error}
        deshabilitada={deshabilitada}
      >
        {etiqueta.antes}
        <EnlaceEnTexto texto={etiqueta.enlace} onPress={abrirPolitica} accessibilityHint="Abre la política en la app" />
        {etiqueta.despues}
      </Casilla>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: espacio.s,
  },
  resumen: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  version: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
});
