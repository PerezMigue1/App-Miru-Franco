import { useEffect } from 'react';
import { AccessibilityInfo, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Casilla } from '@/shared/ui/Casilla';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';
import { VisorDocumentoLegal } from '@/shared/ui/VisorDocumentoLegal';

import { Aviso } from '../components/AvisoAuth';
import { CargaDocumentosPendientes } from '../components/CargaDocumentosPendientes';
import { useDocumentosPendientes } from '../viewmodels/useDocumentosPendientes';

const sinAccion = () => undefined;
// El botón Atrás de Android no cierra la pantalla: ni la carga ni los pendientes se saltan.
const ignorarAtras = () => undefined;

/**
 * Documentos legales pendientes (GP-09): pantalla obligatoria encima de toda la app, antes de
 * cualquier otra, con el documento en el visor compartido (título, versión, vigencia y el texto
 * completo en el sitio), la casilla sin marcar y "Aceptar", que se habilita al marcarla. La única
 * otra salida es "Cerrar sesión". Espera a que termine la intro de la grieta.
 *
 * Mientras se consultan los pendientes, el mismo Modal cubre la app con la carga (sin botones) y, si
 * llega alguno, cambia de contenido sin cerrarse: no hay hueco en que se pueda usar la app ni
 * parpadeo entre dos ventanas. Sin pendientes (o si la consulta falla) se cierra y la app sigue. Con
 * movimiento reducido aparece y se va sin fundido.
 */
export function DocumentosPendientesView({ habilitada }: { habilitada: boolean }) {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const vm = useDocumentosPendientes();
  // Al pasar de la carga al documento el Modal no cambia de ventana: se anuncia qué documento hay
  // que aceptar, así TalkBack no se queda en la carga que ya no está.
  const { visible, titulo } = vm;
  useEffect(() => {
    if (habilitada && visible) {
      AccessibilityInfo.announceForAccessibility(titulo);
    }
  }, [habilitada, visible, titulo]);

  return (
    <Modal
      visible={habilitada && (vm.cargando || vm.visible)}
      animationType={reducido ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={ignorarAtras}
    >
      {/* Sin documento (cargando, o cerrándose tras la carga) queda la carga: nunca un visor vacío. */}
      {vm.visible ? (
        <VisorDocumentoLegal
          titulo={vm.titulo}
          vigencia={vm.vigencia}
          cargando={false}
          sinRed={false}
          desconocido={false}
          noPublicado={false}
          mensajeError={null}
          avisoAbrir={vm.avisoAbrir}
          reintentar={sinAccion}
          abrirCompleto={vm.abrirCompleto}
        >
          <View style={styles.bloque}>
            {vm.paso ? (
              <Text accessibilityRole="header" style={[styles.paso, { color: colores.textoSuave }]}>
                {vm.paso}
              </Text>
            ) : null}
            <Text style={[styles.explicacion, { color: colores.textoCuerpo }]}>{vm.explicacion}</Text>
          </View>
          <Casilla marcada={vm.marcada} onCambiar={vm.alternar} etiquetaAccesible={vm.casilla}>
            {vm.casilla}
          </Casilla>
          <Aviso tipo="error" texto={vm.error} cortes />
          <Button
            titulo={vm.espera ?? vm.textoAceptar}
            onPress={vm.aceptar}
            deshabilitado={vm.aceptarDeshabilitado}
            cargando={vm.enviando}
          />
          <Button
            titulo={vm.textoCerrarSesion}
            variante="secundario"
            onPress={vm.cerrarSesion}
            cargando={vm.cerrandoSesion}
            deshabilitado={vm.enviando}
            accessibilityHint={vm.pistaCerrarSesion}
          />
        </VisorDocumentoLegal>
      ) : (
        <CargaDocumentosPendientes etiqueta={vm.textoCargando} />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  bloque: {
    gap: espacio.s,
  },
  paso: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  explicacion: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
});
