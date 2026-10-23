import { CircleCheck, Hourglass, Info, Phone, X, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borde, espacio, fuente, icono, insignia, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { FilaEnlace } from './DatosRecogerSalon';

export type TipoAvisoTienda = 'exito' | 'aviso' | 'info';

const ICONOS: Record<TipoAvisoTienda, LucideIcon> = {
  exito: CircleCheck,
  aviso: Hourglass,
  info: Info,
};

interface AvisoTiendaProps {
  tipo: TipoAvisoTienda;
  /** Un renglón por mensaje (por ejemplo, un producto retirado por renglón). */
  textos: string[];
  /** Enlace para llamar al salón, si el aviso pide comunicarse con él y hay teléfono. */
  llamar?: { texto: string; onPress: () => void } | null;
  /** Botón para cerrar el aviso (48dp); sin él, el aviso se queda. */
  cerrar?: { etiqueta: string; onPress: () => void } | null;
}

/**
 * Aviso de la tienda con el lenguaje de las insignias (.mf-badge): base teñida del color del estado,
 * filete del mismo color al 30 % y texto oscuro de su familia (7:1 o más en claro, 4.7:1 o más en
 * oscuro). Éxito: algo salió bien; aviso: hay algo pendiente o que revisar; info: el pedido cambió.
 * Quien lo usa lo pone dentro de una región en vivo para que TalkBack lo anuncie al aparecer.
 */
export function AvisoTienda({ tipo, textos, llamar = null, cerrar = null }: AvisoTiendaProps) {
  const { oscuro, colores } = useTheme();
  const tono = (oscuro ? insignia.oscuro : insignia.claro)[tipo];
  const Icono = ICONOS[tipo];
  return (
    <View style={[styles.panel, { backgroundColor: tono.fondo, borderColor: insignia.borde[tipo] }]}>
      <View style={styles.fila}>
        <View accessible style={styles.cuerpo}>
          <View style={styles.iconoLinea} importantForAccessibility="no-hide-descendants">
            <Icono color={tono.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
          <View style={styles.textos}>
            {textos.map((texto) => (
              <Text key={texto} style={[styles.texto, { color: tono.texto }]}>
                {texto}
              </Text>
            ))}
          </View>
        </View>
        {cerrar ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cerrar.etiqueta}
            onPress={cerrar.onPress}
            style={({ pressed }) => [
              styles.cerrar,
              { backgroundColor: pressed ? colores.presionado : colores.transparente },
            ]}
          >
            <X color={tono.texto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </Pressable>
        ) : null}
      </View>
      {llamar ? <FilaEnlace Icono={Phone} texto={llamar.texto} etiqueta={llamar.texto} onPress={llamar.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: espacio.s,
    padding: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  cuerpo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textos: {
    flex: 1,
    gap: espacio.s,
  },
  texto: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  cerrar: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.campo,
    // El panel ya tiene su relleno: el botón se acerca a la esquina sin perder sus 48dp.
    marginTop: -espacio.m,
    marginRight: -espacio.m,
  },
});
