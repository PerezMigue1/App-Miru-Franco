import { StatusBar } from 'expo-status-bar';
import { Check, ChevronDown } from 'lucide-react-native';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Monograma } from '@/shared/ui/Monograma';
import {
  acceso,
  borde,
  casilla,
  curva,
  duracion,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

export type VistaAcceso = 'acceso' | 'registro';

interface AuthContainerProps {
  vistaInicial: VistaAcceso;
  onEntrar: () => void;
  onRecuperar: () => void;
}

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);
const VISTAS: VistaAcceso[] = ['acceso', 'registro'];
const ETIQUETA_PESTANA: Record<VistaAcceso, string> = { acceso: 'Acceso', registro: 'Registro' };

// TODO(GP-05): cargar las preguntas de seguridad del API; mientras tanto la lista queda vacía.
const PREGUNTAS_SEGURIDAD: string[] = [];

/**
 * Acceso y registro (DESIGN.md, piezas de marca): panel carbón compacto con el monograma y
 * pestañas con indicador dorado. Los dos formularios quedan montados y el contenido se desliza
 * en horizontal 680 ms; cambiar de vista no navega ni recarga la pantalla. Con movimiento
 * reducido el cambio es inmediato y solo se funde la opacidad. Solo visual: los campos guardan
 * su texto y nada más (la lógica es de GP-05).
 */
export function AuthContainer({ vistaInicial, onEntrar, onRecuperar }: AuthContainerProps) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { width: ancho } = useWindowDimensions();
  const reducido = useMovimientoReducido();
  const [vista, setVista] = useState<VistaAcceso>(vistaInicial);
  const [alturas, setAlturas] = useState<Record<VistaAcceso, number>>({ acceso: 0, registro: 0 });
  // Vista cuyo alto manda en la ventana; null mientras dura el deslizamiento (manda el mayor).
  const [ajustada, setAjustada] = useState<VistaAcceso | null>(vistaInicial);

  const refScroll = useRef<ScrollView>(null);
  const progreso = useSharedValue(VISTAS.indexOf(vistaInicial));
  const opacidadContenido = useSharedValue(1);

  const anchoPestana = (ancho - pantalla.margen * 2) / VISTAS.length;

  const estiloCarril = useAnimatedStyle(() => ({
    opacity: opacidadContenido.get(),
    transform: [{ translateX: -progreso.get() * ancho }],
  }));
  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: progreso.get() * anchoPestana }],
  }));

  const cambiarA = (destino: VistaAcceso) => {
    if (destino === vista) {
      return;
    }
    setVista(destino);
    // El otro formulario empieza desde arriba, aunque se viniera del final del registro.
    refScroll.current?.scrollTo({ y: 0, animated: !reducido });
    const indice = VISTAS.indexOf(destino);
    if (reducido) {
      setAjustada(destino);
      progreso.set(indice);
      opacidadContenido.set(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: duracion.pestana, easing: EASE_ENTRADA_SALIDA }),
        ),
      );
      return;
    }
    setAjustada(null);
    progreso.set(
      withTiming(
        indice,
        { duration: duracion.acceso, easing: EASE_ENTRADA_SALIDA },
        (terminado) => {
          if (terminado) {
            scheduleOnRN(setAjustada, destino);
          }
        },
      ),
    );
  };

  const medirVista = (v: VistaAcceso) => (e: LayoutChangeEvent) => {
    const alto = e.nativeEvent.layout.height;
    setAlturas((previas) => (previas[v] === alto ? previas : { ...previas, [v]: alto }));
  };

  const altoMayor = Math.max(alturas.acceso, alturas.registro);
  const altoVentana = ajustada ? alturas[ajustada] : altoMayor;

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <StatusBar style="light" />
      <ScrollView
        ref={refScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
      >
        <PanelMarca />

        <View
          accessibilityRole="tablist"
          style={[styles.pestanas, { borderBottomColor: colores.hairline }]}
        >
          {VISTAS.map((v) => {
            const activa = v === vista;
            return (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: activa }}
                onPress={() => cambiarA(v)}
                style={styles.pestana}
              >
                <Text
                  style={[
                    styles.textoPestana,
                    { color: activa ? colores.texto : colores.textoSuave },
                  ]}
                >
                  {ETIQUETA_PESTANA[v]}
                </Text>
              </Pressable>
            );
          })}
          <Animated.View
            style={[
              styles.indicador,
              { width: anchoPestana, backgroundColor: colores.oro },
              estiloIndicador,
            ]}
          />
        </View>

        <View style={[styles.ventana, altoVentana > 0 ? { height: altoVentana } : null]}>
          <Animated.View style={[styles.carril, { width: ancho * VISTAS.length }, estiloCarril]}>
            <Panel ancho={ancho} activo={vista === 'acceso'} onLayout={medirVista('acceso')}>
              <FormularioAcceso onEntrar={onEntrar} onRecuperar={onRecuperar} />
            </Panel>
            <Panel ancho={ancho} activo={vista === 'registro'} onLayout={medirVista('registro')}>
              <FormularioRegistro />
            </Panel>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Panel de marca carbón compacto: monograma, "Mirú Franco" y "Beauty Salón". */
export function PanelMarca() {
  const { colores } = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colores.panel, borderBottomColor: colores.hairline },
        { paddingTop: top + acceso.rellenoPanel },
      ]}
    >
      <Monograma tamano="mediano" />
      <View accessible accessibilityRole="header" accessibilityLabel="Mirú Franco Beauty Salón">
        <View style={styles.marca}>
          <Text style={[styles.marcaMiru, { color: colores.textoSobrePanel }]}>Mirú</Text>
          <Text style={[styles.marcaFranco, { color: colores.oro }]}>Franco</Text>
        </View>
        <Text style={[styles.lema, { color: colores.oroTextoPequeno }]}>BEAUTY SALÓN</Text>
      </View>
    </View>
  );
}

/** Título y texto de apoyo de un formulario. */
export function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.encabezado}>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <Text style={[styles.texto, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

/** Enlace de texto con objetivo táctil de 48dp. */
export function Enlace({
  texto,
  onPress,
  alinear = 'inicio',
}: {
  texto: string;
  onPress?: () => void;
  alinear?: 'inicio' | 'centro' | 'fin';
}) {
  const { colores } = useTheme();
  const alineacion = { inicio: 'flex-start', centro: 'center', fin: 'flex-end' } as const;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.enlace,
        { alignSelf: alineacion[alinear], backgroundColor: pressed ? colores.presionado : 'transparent' },
      ]}
    >
      <Text style={[styles.textoEnlace, { color: colores.foco }]}>{texto}</Text>
    </Pressable>
  );
}

function Panel({
  ancho,
  activo,
  onLayout,
  children,
}: {
  ancho: number;
  activo: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <View
      onLayout={onLayout}
      style={[styles.formulario, { width: ancho }]}
      pointerEvents={activo ? 'auto' : 'none'}
      importantForAccessibility={activo ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!activo}
    >
      {children}
    </View>
  );
}

function FormularioAcceso({ onEntrar, onRecuperar }: { onEntrar: () => void; onRecuperar: () => void }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  return (
    <>
      <Encabezado titulo="Inicia sesión" texto="Consulta tus citas, tus pedidos y tus recordatorios." />
      <Input
        etiqueta="Correo electrónico"
        tipo="correo"
        valor={correo}
        onCambiar={setCorreo}
        placeholder="tu@correo.com"
      />
      <View>
        <Input etiqueta="Contraseña" tipo="claveActual" valor={clave} onCambiar={setClave} />
        <Enlace texto="¿Olvidaste tu contraseña?" onPress={onRecuperar} alinear="fin" />
      </View>
      <Button titulo="Entrar" onPress={onEntrar} />
      <Separador />
      {/* TODO(GP-05): acceso con Google; requiere cambios del backend. */}
      <Button
        titulo="Continuar con Google"
        accessibilityHint="Disponible próximamente"
        variante="secundario"
        posicionIcono="inicio"
        icono={<MarcaGoogle />}
      />
    </>
  );
}

function FormularioRegistro() {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [nacimiento, setNacimiento] = useState('');
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [aceptaAviso, setAceptaAviso] = useState(false);

  return (
    <>
      <Encabezado titulo="Crea tu cuenta" texto="Reserva tus citas y compra en la tienda del salón." />
      <Input etiqueta="Nombre completo" tipo="nombre" valor={nombre} onCambiar={setNombre} />
      <Input
        etiqueta="Correo electrónico"
        tipo="correo"
        valor={correo}
        onCambiar={setCorreo}
        placeholder="tu@correo.com"
      />
      <Input
        etiqueta="Teléfono"
        tipo="telefono"
        valor={telefono}
        onCambiar={setTelefono}
        ayuda="10 dígitos, sin espacios."
      />
      <Input etiqueta="Contraseña" tipo="claveNueva" valor={clave} onCambiar={setClave} />
      <Input
        etiqueta="Confirmar contraseña"
        tipo="claveNueva"
        valor={confirmacion}
        onCambiar={setConfirmacion}
      />
      <Input
        etiqueta="Fecha de nacimiento"
        tipo="fecha"
        valor={nacimiento}
        onCambiar={setNacimiento}
        placeholder="DD/MM/AAAA"
      />
      <Selector
        etiqueta="Pregunta de seguridad"
        placeholder="Elige una pregunta"
        valor={pregunta}
        opciones={PREGUNTAS_SEGURIDAD}
        onElegir={setPregunta}
      />
      <Input etiqueta="Respuesta de seguridad" valor={respuesta} onCambiar={setRespuesta} />
      <Casilla
        marcada={aceptaAviso}
        onCambiar={setAceptaAviso}
        texto="Acepto el aviso de privacidad"
      />
      {/* TODO(GP-05): conectar el registro real; por ahora el formulario es solo visual. */}
      <Button titulo="Crear cuenta" accessibilityHint="Disponible próximamente" />
    </>
  );
}

/** Separador "o" entre el acceso con correo y el acceso con Google. */
function Separador() {
  const { colores } = useTheme();
  return (
    <View style={styles.separador} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.linea, { backgroundColor: colores.hairline }]} />
      <Text style={[styles.textoSeparador, { color: colores.textoSuave }]}>o</Text>
      <View style={[styles.linea, { backgroundColor: colores.hairline }]} />
    </View>
  );
}

/** Marca "G" sencilla y monocroma, dibujada con react-native-svg. */
function MarcaGoogle() {
  const { colores } = useTheme();
  return (
    <Svg width={icono.tamanoPequeno} height={icono.tamanoPequeno} viewBox="0 0 24 24">
      <Path
        d="M20.5 12A8.5 8.5 0 1 1 18.01 5.99M20.5 12H12.5"
        fill="none"
        stroke={colores.textoSobreSecundario}
        strokeWidth={icono.trazoMarca}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Selector con hoja modal propia (la lista se llena en GP-05). */
function Selector({
  etiqueta,
  placeholder,
  valor,
  opciones,
  onElegir,
}: {
  etiqueta: string;
  placeholder: string;
  valor: string | null;
  opciones: string[];
  onElegir: (opcion: string) => void;
}) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);

  return (
    <View style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.texto }]}>
        {etiqueta}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabelledBy={`${id}-etiqueta`}
        accessibilityHint="Abre la lista de preguntas"
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [
          styles.selector,
          {
            backgroundColor: colores.campoFondo,
            borderColor: pressed ? colores.foco : colores.campoBorde,
          },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.textoSelector,
            { color: valor ? colores.campoTexto : colores.campoPlaceholder },
          ]}
        >
          {valor ?? placeholder}
        </Text>
        <ChevronDown color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={cerrar}
      >
        <View style={styles.modal}>
          <Pressable
            accessibilityLabel="Cerrar la lista"
            onPress={cerrar}
            style={[StyleSheet.absoluteFill, { backgroundColor: colores.velo }]}
          />
          <View
            style={[
              styles.hoja,
              { backgroundColor: colores.fondo, paddingBottom: bottom + espacio.xl },
            ]}
          >
            <Text accessibilityRole="header" style={[styles.tituloHoja, { color: colores.texto }]}>
              {etiqueta}
            </Text>
            {opciones.length === 0 ? (
              <Text style={[styles.texto, { color: colores.textoSuave }]}>
                Todavía no hay preguntas de seguridad disponibles.
              </Text>
            ) : (
              opciones.map((opcion) => (
                <Pressable
                  key={opcion}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: opcion === valor }}
                  onPress={() => {
                    onElegir(opcion);
                    cerrar();
                  }}
                  style={({ pressed }) => [
                    styles.opcion,
                    { backgroundColor: pressed ? colores.presionado : 'transparent' },
                  ]}
                >
                  <Text style={[styles.texto, { color: colores.texto }]}>{opcion}</Text>
                  {opcion === valor ? (
                    <Check color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
                  ) : null}
                </Pressable>
              ))
            )}
            <Button titulo="Cerrar" variante="secundario" onPress={cerrar} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Casilla de verificación hecha con Pressable. */
function Casilla({
  marcada,
  onCambiar,
  texto,
}: {
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
  texto: string;
}) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      onPress={() => onCambiar(!marcada)}
      style={styles.filaCasilla}
    >
      <View
        style={[
          styles.casilla,
          {
            borderColor: marcada ? colores.accion : colores.campoBorde,
            backgroundColor: marcada ? colores.accion : colores.campoFondo,
          },
        ]}
      >
        {marcada ? (
          <Check color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
        ) : null}
      </View>
      <Text style={[styles.texto, styles.textoCasilla, { color: colores.texto }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  panel: {
    alignItems: 'center',
    gap: espacio.m,
    paddingBottom: espacio.xxl,
    borderBottomWidth: borde.hairline,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: espacio.s,
  },
  marcaMiru: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
  marcaFranco: {
    fontFamily: fuente.manuscrita,
    fontSize: tipo.marcaManuscrita.tamano,
    lineHeight: tipo.marcaManuscrita.linea,
  },
  lema: {
    textAlign: 'center',
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    letterSpacing: tracking.lema,
  },
  pestanas: {
    flexDirection: 'row',
    marginHorizontal: pantalla.margen,
    marginTop: espacio.l,
    borderBottomWidth: borde.hairline,
  },
  pestana: {
    flex: 1,
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPestana: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  indicador: {
    position: 'absolute',
    left: 0,
    bottom: -borde.hairline,
    height: borde.indicador,
  },
  ventana: {
    overflow: 'hidden',
  },
  carril: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  formulario: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.xl,
  },
  encabezado: {
    gap: espacio.xs,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  enlace: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingHorizontal: espacio.xs,
    borderRadius: radio.campo,
  },
  textoEnlace: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    textDecorationLine: 'underline',
  },
  separador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  linea: {
    flex: 1,
    height: borde.hairline,
  },
  textoSeparador: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  campo: {
    gap: espacio.s,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  selector: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.s,
    borderRadius: radio.campo,
    borderWidth: borde.campo,
  },
  textoSelector: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  hoja: {
    gap: espacio.l,
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.xxl,
    borderTopLeftRadius: radio.tarjeta,
    borderTopRightRadius: radio.tarjeta,
  },
  tituloHoja: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  opcion: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.s,
    borderRadius: radio.campo,
  },
  filaCasilla: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
  },
  casilla: {
    width: casilla.tamano,
    height: casilla.tamano,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.casilla,
    borderWidth: borde.campo,
  },
  textoCasilla: {
    flex: 1,
  },
});
