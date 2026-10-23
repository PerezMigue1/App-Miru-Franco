import { Globe, Mail, Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borde, espacio, fuente, radio, sombra, tipo, tracking } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { abrirEnlace, useInformacionCompra } from '../viewmodels/checkoutTienda';

import { FilaEnlace } from './DatosRecogerSalon';

/**
 * Información de comercio electrónico antes de confirmar (LFPC art. 76 BIS y 7 BIS, InfoCompra de la
 * web): quién vende, precios, entrega, cambios y revocación, y cómo presentar una queja, con los
 * teléfonos y el sitio de Profeco como enlaces. Todo de la configuración pública y el catálogo de
 * textos, salvo los datos de Profeco, que son de la autoridad.
 */
export function InformacionCompra() {
  const { colores } = useTheme();
  const info = useInformacionCompra();
  const { profeco } = info;

  return (
    <View
      style={[styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }]}
    >
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {info.titulo}
      </Text>

      <Seccion titulo={info.vende.titulo} primera>
        <Text style={[styles.fuerte, { color: colores.texto }]}>{info.vende.nombre}</Text>
        {info.vende.domicilio ? <Parrafo texto={info.vende.domicilio} /> : null}
        {info.vende.contactos.map((contacto) => (
          <FilaEnlace
            key={contacto.enlace}
            Icono={contacto.enlace.startsWith('mailto:') ? Mail : Phone}
            texto={contacto.texto}
            etiqueta={contacto.texto}
            onPress={() => abrirEnlace(contacto.enlace)}
          />
        ))}
      </Seccion>

      <Seccion titulo={info.precios.titulo}>
        <Parrafo texto={info.precios.texto} />
      </Seccion>

      <Seccion titulo={info.entrega.titulo}>
        <Parrafo texto={info.entrega.texto} />
        {info.entrega.horario.map((linea) => (
          <Parrafo key={linea} texto={linea} />
        ))}
      </Seccion>

      <Seccion titulo={info.cambios.titulo}>
        <Parrafo texto={info.cambios.cambios} />
        <Parrafo texto={info.cambios.revocacion} />
      </Seccion>

      <Seccion titulo={info.quejas.titulo}>
        <Parrafo texto={info.quejas.texto} />
        <FilaEnlace
          Icono={Phone}
          texto={`${profeco.nombreTelefono} ${profeco.telefonoCdmx.visible} ${profeco.telefonoCdmx.zona}`}
          etiqueta={`Llamar a Profeco, ${profeco.telefonoCdmx.visible} ${profeco.telefonoCdmx.zona}`}
          onPress={() => abrirEnlace(profeco.telefonoCdmx.enlace)}
        />
        <FilaEnlace
          Icono={Phone}
          texto={`${profeco.nombreTelefono} ${profeco.telefonoPais.visible} ${profeco.telefonoPais.zona}`}
          etiqueta={`Llamar a Profeco, ${profeco.telefonoPais.visible} ${profeco.telefonoPais.zona}`}
          onPress={() => abrirEnlace(profeco.telefonoPais.enlace)}
        />
        <FilaEnlace
          Icono={Globe}
          texto={profeco.sitio.visible}
          etiqueta={`Sitio de Profeco, ${profeco.sitio.visible}`}
          onPress={() => abrirEnlace(profeco.sitio.url)}
        />
      </Seccion>
    </View>
  );
}

/** Un bloque con su título y su contenido; desde el segundo, separado por una línea fina. */
function Seccion({ titulo, primera = false, children }: { titulo: string; primera?: boolean; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={[styles.seccion, primera ? null : [styles.conLinea, { borderTopColor: colores.hairline }]]}>
      <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

/** Texto en el secundario: 4.8:1 sobre terracota. */
function Parrafo({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return <Text style={[styles.parrafo, { color: colores.textoSuave }]}>{texto}</Text>;
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: espacio.l,
    padding: espacio.xl,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  seccion: {
    gap: espacio.xs,
  },
  conLinea: {
    paddingTop: espacio.l,
    borderTopWidth: borde.hairline,
  },
  subtitulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  fuerte: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
});
