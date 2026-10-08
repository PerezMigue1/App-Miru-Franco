import { CalendarPlus } from 'lucide-react-native';

import { useState } from 'react';

import {

  Pressable,
  Image,

  ScrollView,

  StyleSheet,

  Text,

  TextInput,

  View,

  type LayoutChangeEvent,

} from 'react-native';

import Animated, {

  Easing,

  useAnimatedStyle,

  useSharedValue,

  withTiming,

} from 'react-native-reanimated';

import { InvitacionSesion } from '@/features/auth/components/InvitacionSesion';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { Button } from '@/shared/ui/Button';

import { EmptyState } from '@/shared/ui/EmptyState';

import { ScreenHeader } from '@/shared/ui/ScreenHeader';

import {

  curva,

  duracion,

  espacio,

  fuente,

  icono,

  pantalla,

  radio,

  sombra,

  tipo,

  toqueMinimo,

  tracking,

} from '@/shared/ui/tokens';

import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';

import { useTheme } from '@/shared/ui/useTheme';

import { useServicios } from '../viewmodels/useServicios';

type Segmento = 'proximas' | 'historial';

const SEGMENTOS: { valor: Segmento; etiqueta: string }[] = [

  { valor: 'proximas', etiqueta: 'Próximas' },

  { valor: 'historial', etiqueta: 'Historial' },

];

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);

export default function CitasView() {

  const { colores } = useTheme();

  const { estado } = useAuth();

  const [seleccionado, setSeleccionado] = useState<string | number | null>(null);

  const {

    serviciosFiltrados,

    cargando,

    error,

    busqueda,

    setBusqueda,

    recargar,

  } = useServicios();

  const [segmento, setSegmento] = useState<Segmento>('proximas');
  const autenticado = estado === 'autenticado';

  return (

    <ScrollView

      style={{ backgroundColor: colores.fondo }}

      contentContainerStyle={styles.contenido}

      keyboardShouldPersistTaps="handled"

    >

      <ScreenHeader titulo={autenticado ? "Mis citas" : "Servicios y citas"} />

      <View style={styles.cuerpo}>
        {!autenticado ? (
          <InvitacionSesion
            titulo="Reserva y sigue tus citas"
            beneficio="Explora los servicios sin iniciar sesión. Para reservar y consultar tus citas, inicia sesión."
          />
        ) : null}

        {autenticado ? (

        <View

          style={[

            styles.tarjeta,

            {

              backgroundColor: colores.superficie,

              shadowColor: colores.sombra,

            },

          ]}

        >

          <Text

            accessibilityRole="header"

            style={[

              styles.tituloTarjeta,

              { color: colores.texto },

            ]}

          >

            Reserva tu próxima visita

          </Text>

          <Text

            style={[

              styles.texto,

              { color: colores.texto },

            ]}

          >

            Elige el servicio, el día y la hora que mejor te acomoden.

          </Text>

          {seleccionado !== null ? (

            <Text style={[styles.texto, { color: colores.texto }]}>

              Servicio seleccionado. Próximamente podrás elegir la fecha y el horario.

            </Text>

          ) : null}

          <Button

            titulo="Reservar cita (próximamente)"

            deshabilitado

            accessibilityHint="El flujo de reserva aún no está disponible"

            icono={

              <CalendarPlus

                color={colores.textoSobreAccion}

                size={icono.tamanoPequeno}

                strokeWidth={icono.trazo}

              />

            }

            posicionIcono="inicio"

          />

        </View>

        ) : null}

        <View style={styles.seccionServicios}>

          <Text

            accessibilityRole="header"

            style={[

              styles.tituloSeccion,

              { color: colores.texto },

            ]}

          >

            Servicios disponibles

          </Text>

          <TextInput

            value={busqueda}

            onChangeText={setBusqueda}

            placeholder="Buscar servicio..."

            placeholderTextColor={colores.textoSuave}

            accessibilityLabel="Buscar servicio"

            style={[

              styles.buscador,

              {

                backgroundColor: colores.superficie,

                color: colores.texto,

              },

            ]}

          />

          {cargando ? (

            <Text

              style={[

                styles.textoEstado,

                { color: colores.textoSuave },

              ]}

            >

              Cargando servicios...

            </Text>

          ) : error ? (

            <View style={styles.errorContenedor}>

              <Text

                style={[

                  styles.texto,

                  { color: colores.texto },

                ]}

              >

                {error}

              </Text>

              <Button

                titulo="Reintentar"

                onPress={() => {

                  void recargar();

                }}

              />

            </View>

          ) : serviciosFiltrados.length === 0 ? (

            <EmptyState

              titulo="No se encontraron servicios"

              mensaje={

                busqueda.trim().length > 0

                  ? 'Intenta buscar con otro nombre o categoría.'

                  : 'Actualmente no hay servicios disponibles.'

              }

            />

          ) : (

            <View style={styles.listaServicios}>

              {serviciosFiltrados.map((servicio) => (

                <View

                  key={String(servicio.id)}

                  style={[

                    styles.servicioCard,

                    {

                      backgroundColor: colores.superficie,

                      shadowColor: colores.sombra,

                    },

                  ]}

                >

                  {servicio.imagen ? (
                    <Image
                      source={{ uri: servicio.imagen }}
                      style={styles.imagenServicio}
                      resizeMode="cover"
                      accessibilityLabel={`Imagen de ${servicio.nombre}`}
                    />
                  ) : null}

                  <View style={styles.servicioEncabezado}>

                    <View style={styles.servicioInformacion}>

                      <Text

                        style={[

                          styles.servicioNombre,

                          { color: colores.texto },

                        ]}

                      >

                        {servicio.nombre}

                      </Text>

                      {servicio.categoria ? (

                        <Text

                          style={[

                            styles.categoria,

                            { color: colores.textoSuave },

                          ]}

                        >

                          {servicio.categoria}

                        </Text>

                      ) : null}

                    </View>

                  </View>

                  {servicio.descripcion ? (

                    <Text

                      style={[

                        styles.texto,

                        { color: colores.textoSuave },

                      ]}

                    >

                      {servicio.descripcion}

                    </Text>

                  ) : null}

                  <View style={styles.servicioPie}>

                    <Text

                      style={[

                        styles.servicioMeta,

                        { color: colores.texto },

                      ]}

                    >

                      {servicio.precio ?? 'Precio no disponible'}

                    </Text>

                    {servicio.duracion ? (

                      <Text

                        style={[

                          styles.servicioMetaSecundario,

                          { color: colores.textoSuave },

                        ]}

                      >

                        {servicio.duracion}

                      </Text>

                    ) : null}

                  </View>

                  {servicio.especialistas &&

                  servicio.especialistas.length > 0 ? (

                    <Text

                      style={[

                        styles.especialistasTexto,

                        { color: colores.textoSuave },

                      ]}

                    >

                      {servicio.especialistas.length}{' '}

                      {servicio.especialistas.length === 1

                        ? 'especialista disponible'

                        : 'especialistas disponibles'}

                    </Text>

                  ) : null}

                  {seleccionado === servicio.id ? (
                    <View style={styles.detalleServicio}>
                      {servicio.descripcionLarga ? (
                        <Text style={[styles.texto, { color: colores.texto }]}>
                          {servicio.descripcionLarga}
                        </Text>
                      ) : null}
                      {servicio.anticipoMonto != null && servicio.anticipoMonto > 0 ? (
                        <Text style={[styles.servicioMetaSecundario, { color: colores.textoSuave }]}>
                          Anticipo estimado: ${servicio.anticipoMonto.toFixed(2)}
                        </Text>
                      ) : null}
                      <Text style={[styles.servicioMetaSecundario, { color: colores.textoSuave }]}>
                        La reserva de citas todavía no está habilitada.
                      </Text>
                    </View>
                  ) : null}

                  <Button

                    titulo={seleccionado === servicio.id ? "Servicio seleccionado" : "Seleccionar servicio"}

                    variante={seleccionado === servicio.id ? "secundario" : "primario"}

                    onPress={() => setSeleccionado(servicio.id)}

                    accessibilityHint={`Selecciona ${servicio.nombre} para una futura reserva`}

                  />

                </View>

              ))}

            </View>

          )}

        </View>

        {autenticado ? (
          <>
        <Text accessibilityRole="header" style={[styles.tituloSeccion, { color: colores.texto }]}>
          Mis citas
        </Text>
        <ControlSegmentado

          valor={segmento}

          onCambiar={setSegmento}

        />

        {segmento === 'proximas' ? (

          <EmptyState

            titulo="Aquí verás tus próximas citas"

            mensaje="Cada cita aparecerá con su fecha, su hora y el estado de su anticipo."

          />

        ) : (

          <EmptyState

            titulo="Aquí verás tus citas anteriores"

            mensaje="Tu historial de visitas al salón aparecerá en esta sección."

          />

        )}

          </>
        ) : null}
      </View>

    </ScrollView>

  );

}

function ControlSegmentado({

  valor,

  onCambiar,

}: {

  valor: Segmento;

  onCambiar: (segmento: Segmento) => void;

}) {

  const { colores } = useTheme();

  const reducido = useMovimientoReducido();

  const [ancho, setAncho] = useState(0);

  const posicion = useSharedValue(

    SEGMENTOS.findIndex((segmento) => segmento.valor === valor),

  );

  const anchoIndicador =

    ancho > 0

      ? (ancho - espacio.xs * 2) / SEGMENTOS.length

      : 0;

  const estiloIndicador = useAnimatedStyle(() => ({

    transform: [

      {

        translateX: posicion.get() * anchoIndicador,

      },

    ],

  }));

  const elegir = (segmento: Segmento) => {

    const indice = SEGMENTOS.findIndex(

      (item) => item.valor === segmento,

    );

    posicion.set(

      reducido

        ? indice

        : withTiming(indice, {

            duration: duracion.pestana,

            easing: EASE_ENTRADA_SALIDA,

          }),

    );

    onCambiar(segmento);

  };

  return (

    <View

      accessibilityRole="tablist"

      onLayout={(evento: LayoutChangeEvent) =>

        setAncho(evento.nativeEvent.layout.width)

      }

      style={[

        styles.segmentado,

        {

          backgroundColor: colores.superficieSecundaria,

        },

      ]}

    >

      {ancho > 0 ? (

        <Animated.View

          style={[

            styles.indicador,

            {

              width: anchoIndicador,

              backgroundColor: colores.fondo,

              shadowColor: colores.sombra,

            },

            estiloIndicador,

          ]}

        />

      ) : null}

      {SEGMENTOS.map((segmento) => {

        const activo = segmento.valor === valor;

        return (

          <Pressable

            key={segmento.valor}

            accessibilityRole="tab"

            accessibilityState={{

              selected: activo,

            }}

            onPress={() => elegir(segmento.valor)}

            style={styles.segmento}

          >

            <Text

              style={[

                styles.textoSegmento,

                {

                  color: activo

                    ? colores.texto

                    : colores.textoSuave,

                },

              ]}

            >

              {segmento.etiqueta}

            </Text>

          </Pressable>

        );

      })}

    </View>

  );

}

const styles = StyleSheet.create({
  imagenServicio: {
    width: '100%',
    height: 180,
    borderRadius: radio.tarjeta,
    marginBottom: espacio.s,
  },
  detalleServicio: {
    gap: espacio.s,
    padding: espacio.m,
    borderRadius: radio.tarjeta,
    backgroundColor: 'transparent',
  },

  contenido: {

    flexGrow: 1,

    paddingBottom: espacio.x3,

  },

  cuerpo: {

    paddingHorizontal: pantalla.margen,

    gap: espacio.xxl,

  },

  tarjeta: {

    gap: espacio.m,

    padding: espacio.xl,

    borderRadius: radio.tarjeta,

    shadowOpacity: sombra.tarjeta.opacidad,

    shadowRadius: sombra.tarjeta.radio,

    shadowOffset: {

      width: 0,

      height: sombra.tarjeta.desplazamientoY,

    },

    elevation: sombra.tarjeta.elevacion,

  },

  tituloTarjeta: {

    fontFamily: fuente.titulo,

    fontSize: tipo.subtitulo.tamano,

    lineHeight: tipo.subtitulo.linea,

    letterSpacing: tracking.titulo,

  },

  tituloSeccion: {

    fontFamily: fuente.titulo,

    fontSize: tipo.subtitulo.tamano,

    lineHeight: tipo.subtitulo.linea,

    letterSpacing: tracking.titulo,

  },

  texto: {

    fontFamily: fuente.texto,

    fontSize: tipo.cuerpo.tamano,

    lineHeight: tipo.cuerpo.linea,

    marginBottom: espacio.xs,

  },

  seccionServicios: {

    gap: espacio.m,

  },

  buscador: {

    minHeight: toqueMinimo,

    borderRadius: radio.tarjeta,

    paddingHorizontal: espacio.m,

    paddingVertical: espacio.s,

    fontFamily: fuente.texto,

    fontSize: tipo.cuerpo.tamano,

  },

  textoEstado: {

    fontFamily: fuente.texto,

    fontSize: tipo.cuerpo.tamano,

    lineHeight: tipo.cuerpo.linea,

    paddingVertical: espacio.m,

  },

  errorContenedor: {

    gap: espacio.m,

  },

  listaServicios: {

    gap: espacio.m,

  },

  servicioCard: {

    padding: espacio.l,

    borderRadius: radio.tarjeta,

    gap: espacio.s,

    shadowOpacity: sombra.tarjeta.opacidad,

    shadowRadius: sombra.tarjeta.radio,

    shadowOffset: {

      width: 0,

      height: sombra.tarjeta.desplazamientoY,

    },

    elevation: sombra.tarjeta.elevacion,

  },

  servicioEncabezado: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    justifyContent: 'space-between',

    gap: espacio.m,

  },

  servicioInformacion: {

    flex: 1,

    gap: espacio.xs,

  },

  servicioNombre: {

    fontFamily: fuente.titulo,

    fontSize: tipo.subtitulo.tamano,

    lineHeight: tipo.subtitulo.linea,

  },

  categoria: {

    fontFamily: fuente.textoMedio,

    fontSize: tipo.pequeno.tamano,

    lineHeight: tipo.pequeno.linea,

  },

  servicioPie: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    gap: espacio.m,

  },

  servicioMeta: {

    fontFamily: fuente.textoMedio,

    fontSize: tipo.cuerpo.tamano,

    lineHeight: tipo.cuerpo.linea,

  },

  servicioMetaSecundario: {

    fontFamily: fuente.texto,

    fontSize: tipo.pequeno.tamano,

    lineHeight: tipo.pequeno.linea,

  },

  especialistasTexto: {

    fontFamily: fuente.texto,

    fontSize: tipo.pequeno.tamano,

    lineHeight: tipo.pequeno.linea,

  },

  segmentado: {

    flexDirection: 'row',

    padding: espacio.xs,

    borderRadius: radio.pastilla,

  },

  indicador: {

    position: 'absolute',

    top: espacio.xs,

    bottom: espacio.xs,

    left: espacio.xs,

    borderRadius: radio.pastilla,

    shadowOpacity: sombra.boton.opacidad,

    shadowRadius: sombra.boton.radio,

    shadowOffset: {

      width: 0,

      height: sombra.boton.desplazamientoY,

    },

    elevation: sombra.boton.elevacion,

  },

  segmento: {

    flex: 1,

    minHeight: toqueMinimo,

    alignItems: 'center',

    justifyContent: 'center',

  },

  textoSegmento: {

    fontFamily: fuente.textoMedio,

    fontSize: tipo.pequeno.tamano,

    lineHeight: tipo.pequeno.linea,

  },

});