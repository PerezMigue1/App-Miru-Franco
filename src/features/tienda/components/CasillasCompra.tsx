import { StyleSheet, Text, View } from 'react-native';

import { Casilla, EnlaceEnTexto } from '@/shared/ui/Casilla';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { CasillaCheckout } from '../viewmodels/useCheckoutViewModel';

interface CasillasCompraProps {
  titulo: string;
  casillas: CasillaCheckout[];
  onCambiar: (id: CasillaCheckout['id'], marcada: boolean) => void;
  /** Abre el documento de la casilla en el visor legal. */
  onAbrir: (slug: CasillaCheckout['slug']) => void;
  /** Mientras se envía no cambian. */
  deshabilitadas: boolean;
}

/**
 * Términos de venta y Política de reembolsos (CasillasCompra de la web): dos casillas obligatorias,
 * sin marcar al entrar, cada una con el nombre de su documento como enlace al visor de la app y su
 * mensaje de error al lado. El estado lo controla el viewmodel del checkout.
 */
export function CasillasCompra({ titulo, casillas, onCambiar, onAbrir, deshabilitadas }: CasillasCompraProps) {
  const { colores } = useTheme();
  return (
    <View style={styles.contenedor}>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      {casillas.map((casilla) => (
        <Casilla
          key={casilla.id}
          marcada={casilla.marcada}
          onCambiar={(marcada) => onCambiar(casilla.id, marcada)}
          etiquetaAccesible={casilla.completa}
          error={casilla.error}
          deshabilitada={deshabilitadas}
        >
          {casilla.antes}
          <EnlaceEnTexto
            texto={casilla.enlace}
            onPress={() => onAbrir(casilla.slug)}
            accessibilityHint="Abre el documento en la app"
          />
          {casilla.despues}
        </Casilla>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: espacio.s,
  },
  titulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
