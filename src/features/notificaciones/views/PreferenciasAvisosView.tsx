import { ArrowLeft, Bell, Lock, Mail, type LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { BotonCromo, CabeceraCompacta, TituloPagina } from '@/shared/ui/CabeceraCompacta';
import { Hoja } from '@/shared/ui/Hoja';
import { Skeleton } from '@/shared/ui/Skeleton';
import { FilaInterruptor, SeccionFilas } from '@/shared/ui/TarjetaFilas';
import { espacio, fuente, pantalla, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { AvisoPreferencias } from '../components/AvisoPreferencias';
import {
  usePreferenciasAvisos,
  type CanalAviso,
  type PreferenciasAvisosViewModel,
} from '../viewmodels/usePreferenciasAvisos';

const ICONO_CANAL: Record<CanalAviso, LucideIcon> = { in_app: Bell, email: Mail };

/** Filas del skeleton mientras se cargan. */
const ESQUELETOS = [0, 1, 2, 3];

const sinCambio = () => undefined;

/**
 * Perfil > Preferencias de avisos (vista: solo pinta). Un grupo por tipo de aviso con un interruptor
 * por canal (FilaInterruptor: role switch con su estado), la respuesta ARCO fija y bloqueada con su
 * explicación, Guardar con su resultado en una región en vivo y la hoja para salir con cambios sin
 * guardar. Todo sale de usePreferenciasAvisos.
 */
export default function PreferenciasAvisosView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const vm = usePreferenciasAvisos();

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <CabeceraCompacta izquierda={<BotonCromo icono={ArrowLeft} etiqueta="Volver" onPress={vm.volver} />} />
      <ScrollView contentContainerStyle={[styles.cuerpo, { paddingBottom: bottom + espacio.x3 }]}>
        <TituloPagina titulo={vm.titulo} subtitulo={vm.intro} />
        <Text style={[styles.margen, styles.parrafo, { color: colores.textoSuave }]}>{vm.diferenciaLocal}</Text>
        <Contenido vm={vm} />
      </ScrollView>
      <Hoja
        visible={vm.salida.visible}
        onCerrar={vm.salida.quedarse}
        titulo={vm.salida.titulo}
        texto={vm.salida.texto}
      >
        <Button titulo={vm.salida.textoSalir} variante="peligro" onPress={vm.salida.salir} />
        <Button titulo={vm.salida.textoQuedarse} variante="secundario" onPress={vm.salida.quedarse} />
      </Hoja>
    </View>
  );
}

function Contenido({ vm }: Readonly<{ vm: PreferenciasAvisosViewModel }>) {
  const { colores } = useTheme();
  if (vm.estado === 'cargando') {
    return (
      <SeccionFilas>
        <View
          key="cargando"
          accessible
          accessibilityLabel={vm.textoCargando}
          accessibilityState={{ busy: true }}
          style={styles.cargando}
        >
          {ESQUELETOS.map((fila) => (
            <Skeleton key={fila} estilo={styles.esqueleto} />
          ))}
        </View>
      </SeccionFilas>
    );
  }
  if (vm.estado === 'noDisponible') {
    return (
      <View style={styles.margen} accessibilityLiveRegion="polite">
        <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>{vm.textoNoDisponible}</Text>
      </View>
    );
  }
  if (vm.estado === 'errorCarga') {
    return (
      <View style={[styles.margen, styles.bloque]}>
        <AvisoPreferencias tono="peligro" texto={vm.errorCarga} />
        <Button
          titulo={vm.textoReintentar}
          variante="secundario"
          onPress={vm.reintentar}
          deshabilitado={vm.reintentarDeshabilitado}
        />
      </View>
    );
  }
  return (
    <>
      {vm.grupos.map((grupo) => (
        <SeccionFilas key={grupo.tipo}>
          {grupo.interruptores.map((interruptor) => (
            <FilaInterruptor
              key={interruptor.clave}
              icono={ICONO_CANAL[interruptor.canal]}
              titulo={interruptor.titulo}
              etiquetaAccesible={interruptor.etiquetaAccesible}
              descripcion={interruptor.descripcion}
              encendido={interruptor.encendido}
              onCambiar={interruptor.cambiar}
              deshabilitada={interruptor.deshabilitado}
            />
          ))}
        </SeccionFilas>
      ))}
      <View style={styles.bloque}>
        <SeccionFilas>
          {vm.arco.canales.map(({ canal, descripcion, etiquetaAccesible }) => (
            <FilaInterruptor
              key={canal}
              icono={Lock}
              titulo={vm.arco.titulo}
              etiquetaAccesible={etiquetaAccesible}
              descripcion={descripcion}
              encendido
              onCambiar={sinCambio}
              deshabilitada
            />
          ))}
        </SeccionFilas>
        {/* La explicación va fuera de la tarjeta, con su contraste completo: las filas bloqueadas se atenúan. */}
        <Text style={[styles.margen, styles.parrafo, { color: colores.textoSuave }]}>{vm.arco.explicacion}</Text>
      </View>
      <View style={[styles.margen, styles.bloque]}>
        <AvisoPreferencias tono="exito" texto={vm.avisoGuardado} />
        <AvisoPreferencias tono="peligro" texto={vm.errorGuardado} />
        <Button
          titulo={vm.textoGuardar}
          onPress={vm.guardar}
          deshabilitado={vm.guardarDeshabilitado}
          cargando={vm.guardando}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    gap: espacio.l,
  },
  margen: {
    marginHorizontal: pantalla.margen,
  },
  bloque: {
    gap: espacio.m,
  },
  cargando: {
    gap: espacio.m,
    padding: espacio.xl,
  },
  esqueleto: {
    height: toqueMinimo,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
});
