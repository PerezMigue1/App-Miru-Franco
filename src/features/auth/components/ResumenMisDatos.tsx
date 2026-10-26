import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/shared/ui/Button';
import { useEntradaContenido } from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import { borde, espacio, fuente, radio, sombra, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { AccesoVista } from '../viewmodels/useMisDatosViewModel';
import { MiCuentaAviso } from './MiCuentaAviso';

/**
 * Derecho de acceso (vista: solo pinta): la carga, el error con su reintento y, ya cargados, el
 * perfil y cuántos registros guardamos de cada sección. Las alergias sin autorización vigente no se
 * pintan: solo el aviso de que están guardadas y ocultas, con el botón para autorizar.
 */
export function ResumenMisDatos({ acceso }: { acceso: AccesoVista }) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();

  if (acceso.estado === 'oculto') {
    return null;
  }
  if (acceso.estado === 'cargando') {
    return (
      <View
        accessible
        accessibilityLabel={acceso.textoCargando}
        accessibilityState={{ busy: true }}
        style={styles.bloque}
      >
        <Skeleton estilo={styles.esqueleto} />
        <Skeleton estilo={styles.esqueleto} />
        <Skeleton estilo={styles.esqueleto} />
      </View>
    );
  }
  if (acceso.estado === 'error') {
    return (
      <View style={styles.bloque}>
        <MiCuentaAviso tono="peligro" texto={acceso.error} />
        <Button
          titulo={acceso.textoReintentar}
          variante="secundario"
          onPress={acceso.reintentar}
          deshabilitado={acceso.reintentarDeshabilitado}
        />
      </View>
    );
  }

  return (
    <Animated.View entering={entrada} style={styles.bloque}>
      {acceso.generado ? (
        <Text style={[styles.pequeno, { color: colores.textoSuave }]}>{acceso.generado}</Text>
      ) : null}
      <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
        <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
          {acceso.tituloPerfil}
        </Text>
        {acceso.campos.map((campo) => (
          <View key={campo.clave} accessible accessibilityLabel={campo.accessibilityLabel} style={styles.campo}>
            <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>{campo.etiqueta}</Text>
            <Text style={[styles.valor, { color: colores.texto }]}>{campo.valor}</Text>
          </View>
        ))}
      </View>
      {acceso.alergiasOcultas ? (
        <View style={styles.bloque}>
          <Text style={[styles.cuerpo, { color: colores.textoCuerpo }]}>{acceso.alergiasOcultas.texto}</Text>
          <Button
            titulo={acceso.alergiasOcultas.boton}
            variante="secundario"
            onPress={acceso.alergiasOcultas.autorizar}
          />
        </View>
      ) : null}
      <View style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}>
        <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
          {acceso.tituloRegistros}
        </Text>
        {acceso.conteos.map((conteo) => (
          <View
            key={conteo.clave}
            accessible
            accessibilityLabel={conteo.accessibilityLabel}
            style={[styles.conteo, { borderTopColor: colores.hairline }]}
          >
            <Text style={[styles.cuerpo, styles.flexible, { color: colores.textoCuerpo }]}>{conteo.etiqueta}</Text>
            <Text style={[styles.cifra, { color: colores.texto }]}>{conteo.cantidad}</Text>
          </View>
        ))}
      </View>
      <Button titulo={acceso.textoOcultar} variante="contorno" onPress={acceso.ocultar} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    gap: espacio.m,
  },
  esqueleto: {
    height: toqueMinimo,
  },
  tarjeta: {
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  subtitulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  campo: {
    gap: espacio.xxs,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  valor: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  pequeno: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cuerpo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  conteo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingTop: espacio.s,
    borderTopWidth: borde.hairline,
  },
  flexible: {
    flex: 1,
  },
  cifra: {
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
