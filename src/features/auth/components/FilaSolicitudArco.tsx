import { StyleSheet, Text, View } from 'react-native';

import { BadgeEstado } from '@/shared/ui/BadgeEstado';
import { espacio, fuente, radio, sombra, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { FilaSolicitudVista } from '../viewmodels/useSolicitudesArco';

/**
 * Tarjeta de una solicitud ARCO (vista: solo pinta): tipo y folio como encabezado, la insignia del
 * estado, las fechas con su día local, lo que pidió y la respuesta del salón si ya la hay.
 */
export function FilaSolicitudArco({ fila }: { fila: FilaSolicitudVista }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
      <View style={styles.cabecera}>
        <View style={styles.titulos}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={fila.accessibilityLabel}
            style={[styles.tipo, { color: colores.texto }]}
          >
            {fila.tipo}
          </Text>
          <Text style={[styles.pequeno, { color: colores.textoSuave }]}>{fila.folio}</Text>
        </View>
        <BadgeEstado texto={fila.estado} tono={fila.tono} />
      </View>
      {fila.fechas.map((fecha) => (
        <Text key={fecha} style={[styles.pequeno, { color: colores.textoCuerpo }]}>
          {fecha}
        </Text>
      ))}
      {fila.descripcion ? (
        <Bloque etiqueta={fila.etiquetaDescripcion} texto={fila.descripcion} />
      ) : null}
      {fila.respuesta ? <Bloque etiqueta={fila.etiquetaRespuesta} texto={fila.respuesta} /> : null}
    </View>
  );
}

function Bloque({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.bloque}>
      <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.cuerpo, { color: colores.textoCuerpo }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: espacio.s,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  titulos: {
    flex: 1,
    gap: espacio.xxs,
  },
  tipo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  pequeno: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  bloque: {
    gap: espacio.xxs,
    paddingTop: espacio.xs,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
