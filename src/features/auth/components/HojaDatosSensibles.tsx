import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Casilla } from '@/shared/ui/Casilla';
import { Hoja } from '@/shared/ui/Hoja';
import { Skeleton } from '@/shared/ui/Skeleton';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { AutorizacionDatosSensiblesViewModel } from '../viewmodels/useAutorizacionDatosSensibles';
import { Aviso } from './AvisoAuth';

/**
 * Hoja de la autorización de datos sensibles (vista: solo pinta): el texto completo del backend en
 * su propio desplazamiento, la versión, la casilla sin marcar, "Autorizo" como acción principal y
 * "Ahora no". Los errores se anuncian sin interrumpir.
 */
export function HojaDatosSensibles({ vm }: { vm: AutorizacionDatosSensiblesViewModel }) {
  const { colores } = useTheme();
  return (
    <Hoja visible={vm.visible} onCerrar={vm.cerrar} titulo={vm.titulo}>
      {vm.cargando ? (
        <View accessible accessibilityLabel={vm.textoCargando} accessibilityState={{ busy: true }} style={styles.texto}>
          <Skeleton estilo={styles.esqueleto} />
          <Skeleton estilo={styles.esqueleto} />
        </View>
      ) : null}
      {vm.errorTexto ? (
        <>
          <Aviso tipo="error" texto={vm.errorTexto} cortes />
          <Button titulo={vm.textoReintentar} variante="secundario" onPress={vm.reintentar} />
        </>
      ) : null}
      {vm.parrafos.length > 0 ? (
        <ScrollView style={styles.desplazable} contentContainerStyle={styles.texto}>
          {vm.parrafos.map((parrafo, i) => (
            // El orden de los párrafos es fijo: el índice basta como llave (dos pueden ser iguales).
            <Text key={i} style={[styles.parrafo, { color: colores.textoCuerpo }]}>
              {parrafo}
            </Text>
          ))}
          {vm.version ? <Text style={[styles.version, { color: colores.textoSuave }]}>{vm.version}</Text> : null}
        </ScrollView>
      ) : null}
      <Casilla
        marcada={vm.marcada}
        onCambiar={vm.alternar}
        etiquetaAccesible={vm.casilla}
        deshabilitada={vm.parrafos.length === 0}
      >
        {vm.casilla}
      </Casilla>
      <Aviso tipo="error" texto={vm.error} cortes />
      <Button
        titulo={vm.textoAutorizo}
        onPress={vm.autorizar}
        deshabilitado={vm.autorizoDeshabilitado}
        cargando={vm.enviando}
      />
      <Button titulo={vm.textoAhoraNo} variante="secundario" onPress={vm.cerrar} deshabilitado={vm.enviando} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  desplazable: {
    flexShrink: 1,
  },
  texto: {
    gap: espacio.m,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  version: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  esqueleto: {
    height: tipo.cuerpo.linea * 3,
  },
});
