import { ArrowLeft, CalendarDays, Clock3, Info, ListChecks } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { Servicio } from '../models/Servicio';
import { Button } from '@/shared/ui/Button';
import { espacio, fuente, pantalla, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

type Props = {
  servicio: Servicio;
  onVolver: () => void;
};

/** Etapa 2: detalles públicos. No crea citas ni inicia pagos. */
export function DetalleServicioView({ servicio, onVolver }: Props) {
  const { colores } = useTheme();
  const { width } = useWindowDimensions();
  const imagenes = servicio.imagenes?.length
    ? servicio.imagenes
    : servicio.imagen ? [servicio.imagen] : [];

  return (
    <ScrollView
      style={{ backgroundColor: colores.fondo }}
      contentContainerStyle={styles.pagina}
      accessibilityLabel={`Detalles de ${servicio.nombre}`}
    >
      <View style={styles.encabezado}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a servicios"
          onPress={onVolver}
          style={styles.volver}
        >
          <ArrowLeft color={colores.texto} size={23} />
          <Text style={[styles.volverTexto, { color: colores.texto }]}>Servicios</Text>
        </Pressable>
      </View>

      {imagenes.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {imagenes.map((url, indice) => (
            <Image
              key={`${indice}-${url}`}
              source={{ uri: url }}
              style={[styles.imagen, { width }]}
              resizeMode="cover"
              accessibilityLabel={`Imagen ${indice + 1} de ${servicio.nombre}`}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.sinImagen, { backgroundColor: colores.superficieSecundaria }]}>
          <Info color={colores.textoSuave} size={36} />
          <Text style={{ color: colores.textoSuave }}>Imagen no disponible</Text>
        </View>
      )}

      <View style={styles.contenido}>
        {servicio.categoria ? (
          <Text style={[styles.categoria, { color: colores.textoSuave }]}>{servicio.categoria}</Text>
        ) : null}
        <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
          {servicio.nombre}
        </Text>
        <View style={[styles.tarjeta, { backgroundColor: colores.superficie }]}>
          <Text style={[styles.precio, { color: colores.texto }]}>
            {servicio.precio ?? 'Consultar precio'}
          </Text>
          <View style={styles.dato}>
            <Clock3 color={colores.textoSuave} size={19} />
            <Text style={[styles.cuerpo, { color: colores.texto }]}>
              Duración: {servicio.duracion ?? (servicio.duracionMinutos != null ? `${servicio.duracionMinutos} min` : 'Por confirmar')}
            </Text>
          </View>
          {servicio.anticipoMonto != null && servicio.anticipoMonto > 0 ? (
            <Text style={[styles.cuerpo, { color: colores.texto }]}>
              Anticipo: ${servicio.anticipoMonto.toFixed(2)} MXN
            </Text>
          ) : null}
          {servicio.requiereEvaluacion ? (
            <Text style={[styles.nota, { color: colores.textoSuave }]}>
              Este tratamiento requiere evaluación previa.
            </Text>
          ) : null}
        </View>

        <View style={styles.seccion}>
          <Text style={[styles.subtitulo, { color: colores.texto }]}>Descripción</Text>
          <Text style={[styles.cuerpo, { color: colores.texto }]}>
            {servicio.descripcionLarga || servicio.descripcion || 'Descripción no disponible.'}
          </Text>
        </View>

        {servicio.incluye && servicio.incluye.length > 0 ? (
          <View style={styles.seccion}>
            <View style={styles.dato}>
              <ListChecks color={colores.texto} size={20} />
              <Text style={[styles.subtitulo, { color: colores.texto }]}>¿Qué incluye?</Text>
            </View>
            {servicio.incluye.map((item, indice) => (
              <Text key={`${indice}-${item}`} style={[styles.cuerpo, { color: colores.texto }]}>• {item}</Text>
            ))}
          </View>
        ) : null}

        {servicio.recomendaciones && servicio.recomendaciones.length > 0 ? (
          <View style={styles.seccion}>
            <Text style={[styles.subtitulo, { color: colores.texto }]}>Recomendaciones</Text>
            {servicio.recomendaciones.map((item, indice) => (
              <Text key={`${indice}-${item}`} style={[styles.cuerpo, { color: colores.texto }]}>• {item}</Text>
            ))}
          </View>
        ) : null}

        <Button
          titulo="Agendar cita (próximamente)"
          deshabilitado
          accessibilityHint="La agenda y disponibilidad se implementarán en la etapa 3"
          icono={<CalendarDays color={colores.textoSobreAccion} size={19} />}
          posicionIcono="inicio"
        />
        <Text style={[styles.nota, { color: colores.textoSuave }]}>
          Puedes consultar los servicios sin iniciar sesión. Para reservar será necesario iniciar sesión cuando la agenda esté disponible.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flexGrow: 1, paddingBottom: espacio.x3 },
  encabezado: { paddingHorizontal: pantalla.margen, paddingVertical: espacio.s },
  volver: { minHeight: toqueMinimo, flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  volverTexto: { fontFamily: fuente.textoMedio, fontSize: tipo.cuerpo.tamano },
  imagen: { height: 240 },
  sinImagen: { height: 200, alignItems: 'center', justifyContent: 'center', gap: espacio.s },
  contenido: { paddingHorizontal: pantalla.margen, paddingTop: espacio.l, gap: espacio.l },
  categoria: { fontFamily: fuente.textoMedio, fontSize: tipo.pequeno.tamano },
  titulo: { fontFamily: fuente.titulo, fontSize: tipo.subtitulo.tamano + 4, lineHeight: tipo.subtitulo.linea + 5 },
  tarjeta: { padding: espacio.l, borderRadius: radio.tarjeta, gap: espacio.m },
  precio: { fontFamily: fuente.titulo, fontSize: tipo.subtitulo.tamano + 3 },
  dato: { flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  seccion: { gap: espacio.s },
  subtitulo: { fontFamily: fuente.titulo, fontSize: tipo.subtitulo.tamano },
  cuerpo: { fontFamily: fuente.texto, fontSize: tipo.cuerpo.tamano, lineHeight: tipo.cuerpo.linea },
  nota: { fontFamily: fuente.texto, fontSize: tipo.pequeno.tamano, lineHeight: tipo.pequeno.linea },
});
