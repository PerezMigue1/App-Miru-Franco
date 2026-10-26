import { ArrowLeft, ExternalLink, Info } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './Button';
import { BotonCromo, CabeceraCompacta, TituloPagina } from './CabeceraCompacta';
import { EmptyState } from './EmptyState';
import { useEntradaContenido } from './movimiento';
import { Skeleton } from './Skeleton';
import { borde, espacio, fuente, icono, pantalla, radio, tipo, toqueMinimo } from './tokens';
import { useTheme } from './useTheme';

/** Lo que pinta el visor (lo arma useDocumentoLegal de shared/api). */
export interface VisorDocumentoLegalProps {
  /** Título del documento (o el de respaldo mientras carga o sin red). */
  titulo: string;
  /** Versión y vigencia ya escritas ("Versión 1.2", "Vigente desde el 14 de octubre de 2026"), o null sin documento. */
  vigencia: { version: string; desde: string } | null;
  cargando: boolean;
  sinRed: boolean;
  desconocido: boolean;
  noPublicado: boolean;
  /** Sin documento: por qué no se cargó (sin red, servidor...), ya en texto para la clienta. */
  mensajeError: string | null;
  /** Mensaje si no se pudo abrir el sitio, o null. */
  avisoAbrir: string | null;
  reintentar: () => void;
  abrirCompleto: () => void;
  /** Sin él no hay botón Volver (por ejemplo, en la aceptación obligatoria de un documento). */
  onVolver?: () => void;
  /** Lo que va debajo del documento (por ejemplo, la casilla y el botón para aceptarlo). */
  children?: ReactNode;
}

const EXPLICACION =
  'El texto completo de este documento está en el sitio de Mirú Franco. Al tocar el botón se abre en un navegador dentro de la app.';
const SIN_RED_GUARDADA = 'Sin conexión. Te mostramos la versión que guardamos la última vez.';

/**
 * Visor de un documento legal (vista: solo pinta). Muestra en nativo el título, la versión y la
 * fecha de vigencia, y el botón que abre el texto completo en el sitio. Estados: cargando
 * (Skeleton), sin red con la versión guardada (aviso y botón), sin red sin nada guardado (vacío con
 * Reintentar, sin versión), sin versión publicada y slug desconocido.
 */
export function VisorDocumentoLegal(props: VisorDocumentoLegalProps) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { titulo, desconocido, onVolver, children } = props;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <CabeceraCompacta
        izquierda={onVolver ? <BotonCromo icono={ArrowLeft} etiqueta="Volver" onPress={onVolver} /> : undefined}
      />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: bottom + espacio.x3 }]}>
        <TituloPagina titulo={desconocido ? 'Documento legal' : titulo} />
        <View style={styles.cuerpo}>
          <Contenido {...props} />
          {children ? <View style={styles.pie}>{children}</View> : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** El cuerpo según el estado. */
function Contenido({
  vigencia,
  cargando,
  sinRed,
  desconocido,
  noPublicado,
  mensajeError,
  avisoAbrir,
  reintentar,
  abrirCompleto,
  onVolver,
}: VisorDocumentoLegalProps) {
  if (desconocido) {
    return (
      <EmptyState
        titulo="Este documento no existe"
        mensaje="Revisa el enlace o vuelve a la pantalla anterior."
        accion={onVolver ? { titulo: 'Volver', onPress: onVolver } : undefined}
      />
    );
  }
  if (cargando) {
    return <CargandoDocumento />;
  }
  if (noPublicado) {
    return (
      <EmptyState
        titulo="Este documento no está disponible"
        mensaje="Por ahora no podemos mostrar su versión aquí. Puedes leerlo en el sitio de Mirú Franco."
        accion={{ titulo: 'Abrir en el sitio', onPress: abrirCompleto }}
      />
    );
  }
  if (!vigencia) {
    return (
      <EmptyState
        titulo="No pudimos cargar el documento"
        mensaje={mensajeError ?? ''}
        accion={{ titulo: 'Reintentar', onPress: reintentar }}
      />
    );
  }
  return (
    <DocumentoVigente
      vigencia={vigencia}
      sinRed={sinRed}
      avisoAbrir={avisoAbrir}
      abrirCompleto={abrirCompleto}
    />
  );
}

/** Bloques de carga del tamaño de la tarjeta y del botón; se anuncia como "Cargando el documento". */
function CargandoDocumento() {
  return (
    <View accessible accessibilityLabel="Cargando el documento" accessibilityState={{ busy: true }} style={styles.bloque}>
      <Skeleton estilo={styles.esqueletoTarjeta} />
      <Skeleton estilo={styles.esqueletoBoton} />
    </View>
  );
}

function DocumentoVigente({
  vigencia,
  sinRed,
  avisoAbrir,
  abrirCompleto,
}: Pick<VisorDocumentoLegalProps, 'sinRed' | 'avisoAbrir' | 'abrirCompleto'> & {
  vigencia: NonNullable<VisorDocumentoLegalProps['vigencia']>;
}) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  return (
    <Animated.View entering={entrada} style={styles.bloque}>
      {sinRed ? (
        <View
          accessible
          accessibilityLiveRegion="polite"
          style={[styles.aviso, { backgroundColor: colores.campoFondo, borderColor: colores.campoBorde }]}
        >
          <Info color={colores.aviso} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.textoAviso, { color: colores.campoTexto }]}>{SIN_RED_GUARDADA}</Text>
        </View>
      ) : null}
      <View style={[styles.tarjeta, { backgroundColor: colores.superficie, borderColor: colores.hairline }]}>
        <Text style={[styles.version, { color: colores.texto }]}>{vigencia.version}</Text>
        <Text style={[styles.vigencia, { color: colores.textoSuave }]}>{vigencia.desde}</Text>
      </View>
      <Text style={[styles.explicacion, { color: colores.textoCuerpo }]}>{EXPLICACION}</Text>
      <Button
        titulo="Leer el documento completo"
        onPress={abrirCompleto}
        icono={<ExternalLink color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />}
        accessibilityHint="Abre el sitio de Mirú Franco en un navegador dentro de la app"
      />
      <View collapsable={false} accessibilityLiveRegion="polite" style={avisoAbrir ? null : styles.fueraDeFlujo}>
        {avisoAbrir ? <Text style={[styles.textoAviso, { color: colores.peligro }]}>{avisoAbrir}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  contenido: {
    flexGrow: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
  },
  pie: {
    gap: espacio.l,
    marginTop: espacio.xl,
  },
  bloque: {
    gap: espacio.l,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  textoAviso: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  tarjeta: {
    gap: espacio.xs,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    borderWidth: borde.hairline,
  },
  version: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  vigencia: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  explicacion: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  // Lo que mide la tarjeta: dos líneas de cuerpo, su separación y el relleno.
  esqueletoTarjeta: {
    height: tipo.cuerpo.linea * 2 + espacio.xs + espacio.l * 2,
    borderRadius: radio.tarjeta,
  },
  esqueletoBoton: {
    height: toqueMinimo,
  },
  fueraDeFlujo: {
    position: 'absolute',
  },
});
