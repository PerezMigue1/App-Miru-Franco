import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Circle, CircleAlert, CircleCheck, Check, ChevronDown, X } from 'lucide-react-native';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextInput,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { Input, type EstadoCampo } from '@/shared/ui/Input';
import { Monograma } from '@/shared/ui/Monograma';
import {
  EASE_ENTRADA_SALIDA,
  EASE_SALIDA,
  transicionBorde,
  transicionSeleccion,
  useEntradaContenido,
  usePresion,
} from '@/shared/ui/movimiento';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  acceso,
  borde,
  casilla,
  esqueleto,
  duracion,
  escalaEntrada,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  hoja,
  pasoFlujo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import type { GoogleViewModel } from '../viewmodels/useGoogleViewModel';
import type { LoginViewModel } from '../viewmodels/useLoginViewModel';
import type { RetornoActivacion } from '../viewmodels/useRetornoActivacion';
import type {
  CampoRegistro,
  EstadoCorreo,
  EstadoPreguntas,
  PasoRegistro,
  PreguntaSeguridad,
  RegistroViewModel,
  RequisitoClave,
} from '../viewmodels/useRegistroViewModel';

export type VistaAcceso = 'acceso' | 'registro';

interface AuthContainerProps {
  vistaInicial: VistaAcceso;
  login: LoginViewModel;
  registro: RegistroViewModel;
  /** Acceso con Google, el mismo en las dos pestañas. */
  google: GoogleViewModel;
  onRecuperar: () => void;
  /** Aviso de éxito sobre el formulario de acceso (por ejemplo, cuenta activada). */
  aviso?: string | null;
  /** Regreso desde la activación: muestra Acceso con el correo y reinicia el registro. */
  retorno?: RetornoActivacion | null;
  /** Cierra Acceso y vuelve a explorar la app. */
  onCerrar?: () => void;
}

/**
 * Lo que muestra el campo de correo según la verificación (solo lo que dice el endpoint). La
 * respuesta sin "existe" no muestra nada: la app nunca afirma que un correo está disponible.
 */
const ESTADO_CORREO: Record<EstadoCorreo, EstadoCampo | null> = {
  inactivo: null,
  verificando: { tipo: 'verificando', texto: 'Verificando correo…' },
  sinAviso: null,
  registrado: { tipo: 'error', texto: 'Este correo ya está registrado' },
  revisando: { tipo: 'aviso', texto: 'Revisando si el correo ya tiene cuenta…' },
  sinConexion: { tipo: 'aviso', texto: 'Sin conexión. Revisaremos el correo cuando haya red.' },
  sinVerificar: { tipo: 'aviso', texto: 'Se verificará al crear la cuenta.' },
};
/**
 * Líneas que reserva el mensaje del correo: "Sin conexión…" ocupa dos a 360dp, y "ya está
 * registrado" lleva "Iniciar sesión" en la segunda. Así el formulario no salta.
 */
const LINEAS_ESTADO_CORREO = 2;

/** Pasos del registro, como la web. */
const PASOS: { numero: PasoRegistro; etiqueta: string }[] = [
  { numero: 1, etiqueta: 'Tu cuenta' },
  { numero: 2, etiqueta: 'Tu cabello' },
];

export type SiNo = 'si' | 'no';
export const OPCIONES_SI_NO: { valor: SiNo; etiqueta: string }[] = [
  { valor: 'no', etiqueta: 'No' },
  { valor: 'si', etiqueta: 'Sí' },
];

export function aSiNo(valor: boolean | null): SiNo | null {
  if (valor === null) {
    return null;
  }
  return valor ? 'si' : 'no';
}

/** Texto de la web (CasillaDatosSalud, clienta); "Aviso de Privacidad" es el enlace. */
export const TEXTO_CONSENTIMIENTO_SALUD =
  'Autorizo el uso de mis datos de salud (alergias y sensibilidad) solo para valorar si un tratamiento es seguro para mí, conforme al';
const VISTAS: VistaAcceso[] = ['acceso', 'registro'];
const ETIQUETA_PESTANA: Record<VistaAcceso, string> = { acceso: 'Acceso', registro: 'Registro' };

/**
 * Acceso y registro (DESIGN.md, piezas de marca): panel carbón compacto con el monograma y
 * pestañas con indicador dorado. Los dos formularios quedan montados y el contenido se desliza
 * en horizontal 680 ms; cambiar de vista no navega ni recarga la pantalla. Con movimiento
 * reducido el cambio es inmediato y solo se funde la opacidad. El estado de cada formulario vive
 * en su viewmodel (useLoginViewModel y useRegistroViewModel).
 */
export function AuthContainer({
  vistaInicial,
  login,
  registro,
  google,
  onRecuperar,
  aviso,
  retorno,
  onCerrar,
}: AuthContainerProps) {
  const { colores } = useTheme();
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

  // Mientras el registro envía, espera la verificación del correo o Google está abierto, no se
  // cambia de pestaña.
  const pestanasBloqueadas = registro.cargando || registro.verificandoCorreo || google.abriendo;

  const cambiarA = (destino: VistaAcceso) => {
    if (destino === vista || pestanasBloqueadas) {
      return;
    }
    setVista(destino);
    // El error de Google se queda en el formulario donde se tocó el botón.
    google.limpiarError();
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

  // Al regresar de la activación (con o sin éxito) esta pantalla puede ser la misma instancia que
  // abrió la activación, con su estado: se muestra Acceso con el correo escrito, sin animación, y
  // el registro vuelve a cero (incluidos los datos de salud). Cada regreso se atiende una vez.
  const retornoAtendido = useRef<string | null>(null);
  useEffect(() => {
    if (!retorno || retorno.vez === retornoAtendido.current) {
      return;
    }
    retornoAtendido.current = retorno.vez;
    registro.reiniciar();
    login.prepararAcceso(retorno.correo);
    setVista('acceso');
    setAjustada('acceso');
    progreso.set(VISTAS.indexOf('acceso'));
    opacidadContenido.set(1);
    refScroll.current?.scrollTo({ y: 0, animated: false });
  }, [retorno, registro, login, progreso, opacidadContenido]);

  const medirVista = (v: VistaAcceso) => (e: LayoutChangeEvent) => {
    const alto = e.nativeEvent.layout.height;
    setAlturas((previas) => (previas[v] === alto ? previas : { ...previas, [v]: alto }));
  };

  // "Iniciar sesión" desde un correo ya registrado: pasa a Acceso con el correo escrito.
  const irAAcceso = (correo: string) => {
    login.setCorreo(correo);
    cambiarA('acceso');
  };

  const altoMayor = Math.max(alturas.acceso, alturas.registro);
  const altoVentana = ajustada ? alturas[ajustada] : altoMayor;

  return (
    <PantallaAuth refScroll={refScroll} onCerrar={onCerrar}>
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
                accessibilityState={{ selected: activa, disabled: !activa && pestanasBloqueadas }}
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
              // --oro-grande: 3.7:1 sobre lino y 6.7:1 sobre carbón (indicador, mínimo 3:1).
              { width: anchoPestana, backgroundColor: colores.oroGrande },
              estiloIndicador,
            ]}
          />
        </View>

        <View style={[styles.ventana, altoVentana > 0 ? { height: altoVentana } : null]}>
          <Animated.View style={[styles.carril, { width: ancho * VISTAS.length }, estiloCarril]}>
            <Panel ancho={ancho} activo={vista === 'acceso'} onLayout={medirVista('acceso')}>
              <FormularioAcceso
                login={login}
                google={google}
                onRecuperar={onRecuperar}
                aviso={aviso ?? null}
              />
            </Panel>
            <Panel ancho={ancho} activo={vista === 'registro'} onLayout={medirVista('registro')}>
              <FormularioRegistro
                registro={registro}
                google={google}
                refScroll={refScroll}
                onIrAAcceso={irAAcceso}
                activo={vista === 'registro'}
              />
            </Panel>
          </Animated.View>
        </View>
    </PantallaAuth>
  );
}

/**
 * Pantalla de acceso: panel de marca bajo la barra de estado, contenido que respeta la barra de
 * navegación y se desplaza sobre el teclado (edge-to-edge en Android: el teclado no redimensiona
 * la ventana, así que se compensa con padding).
 */
export function PantallaAuth({
  children,
  refScroll,
  onCerrar,
}: {
  children: ReactNode;
  refScroll?: RefObject<ScrollView | null>;
  /** Botón para cerrar Acceso (se abre encima de las pestañas) y volver a explorar. */
  onCerrar?: () => void;
}) {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <StatusBar style="light" />
      {onCerrar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          accessibilityHint="Vuelve a la app sin iniciar sesión"
          onPress={onCerrar}
          onPressIn={hundir}
          onPressOut={soltar}
          style={[styles.cerrar, { top: top + espacio.s }]}
        >
          <Animated.View style={estiloPresion}>
            <X color={colores.textoSobrePanel} size={icono.tamano} strokeWidth={icono.trazo} />
          </Animated.View>
        </Pressable>
      ) : null}
      <ScrollView
        ref={refScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
      >
        <PanelMarca />
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
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
          {/* Oro sobre carbón (--oro-sobre-carbon, como .mf-logotipo): el panel es carbón en los dos temas. */}
          <Text style={[styles.marcaFranco, { color: colores.oroTextoPequeno }]}>Franco</Text>
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
      <Text style={[styles.parrafo, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

/** Enlace de texto con objetivo táctil de 48dp. */
export function Enlace({
  texto,
  onPress,
  alinear = 'inicio',
  accessibilityHint,
}: {
  texto: string;
  onPress?: () => void;
  alinear?: 'inicio' | 'centro' | 'fin';
  /** Por ejemplo, "Se abre en el navegador". */
  accessibilityHint?: string;
}) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  const alineacion = { inicio: 'flex-start', centro: 'center', fin: 'flex-end' } as const;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={{ alignSelf: alineacion[alinear] }}
    >
      {/* Se hunde como un botón (140 ms): el enlace también es una acción. */}
      <Animated.View style={[styles.enlace, estiloPresion]}>
        <Text style={[styles.textoEnlace, { color: colores.enlace }]}>{texto}</Text>
      </Animated.View>
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

function FormularioAcceso({
  login,
  google,
  onRecuperar,
  aviso,
}: {
  login: LoginViewModel;
  google: GoogleViewModel;
  onRecuperar: () => void;
  aviso: string | null;
}) {
  const { correo, setCorreo, salirCorreo, clave, setClave, errores, errorGeneral, cargando, entrar } =
    login;
  const refClaveAcceso = useRef<TextInput>(null);
  // Con Google abierto no se entra con correo (ni con la tecla del teclado); al entrar con correo,
  // el error anterior de Google ya no aplica.
  const entrarConCorreo = () => {
    if (google.abriendo) {
      return;
    }
    google.limpiarError();
    entrar();
  };
  return (
    <>
      <Encabezado titulo="Inicia sesión" texto="Consulta tus citas, tus pedidos y tus recordatorios." />
      <Aviso tipo="exito" texto={aviso} />
      <Input
        etiqueta="Correo electrónico"
        tipo="correo"
        valor={correo}
        onCambiar={setCorreo}
        onSalir={salirCorreo}
        siguiente={() => refClaveAcceso.current?.focus()}
        placeholder="tu@correo.com"
        error={errores.correo}
      />
      <View>
        <Input
          ref={refClaveAcceso}
          etiqueta="Contraseña"
          tipo="claveActual"
          valor={clave}
          onCambiar={setClave}
          alEnviar={entrarConCorreo}
          error={errores.clave}
        />
        <Enlace texto="¿Olvidaste tu contraseña?" onPress={onRecuperar} alinear="fin" />
      </View>
      <Aviso tipo="error" texto={errorGeneral} />
      <Button
        titulo={cargando ? 'Entrando…' : 'Entrar'}
        onPress={entrarConCorreo}
        cargando={cargando}
        deshabilitado={google.abriendo}
      />
      <AccesoGoogle google={google} ocupado={cargando} />
    </>
  );
}

/**
 * Separador "o", botón "Continuar con Google" y su error, debajo del botón principal de cada
 * formulario. "ocupado": hay otro inicio en curso en ese formulario y Google queda deshabilitado.
 */
function AccesoGoogle({ google, ocupado }: { google: GoogleViewModel; ocupado: boolean }) {
  const { abriendo, error, entrar } = google;
  return (
    <>
      <Separador />
      <Button
        titulo={abriendo ? 'Abriendo Google…' : 'Continuar con Google'}
        accessibilityHint="Abre Google para entrar con tu cuenta"
        variante="secundario"
        posicionIcono="inicio"
        icono={<MarcaGoogle />}
        onPress={entrar}
        cargando={abriendo}
        deshabilitado={ocupado}
      />
      <Aviso tipo="error" texto={error} />
    </>
  );
}

function FormularioRegistro({
  registro,
  google,
  refScroll,
  onIrAAcceso,
  activo,
}: {
  registro: RegistroViewModel;
  google: GoogleViewModel;
  refScroll: RefObject<ScrollView | null>;
  onIrAAcceso: (correo: string) => void;
  /** La pestaña Registro está a la vista. */
  activo: boolean;
}) {
  const { paso, direccionPaso, atras, enfoque } = registro;
  const reducido = useMovimientoReducido();
  const refIndicador = useRef<View>(null);
  const refsTexto = useRef<Partial<Record<CampoRegistro, TextInput | null>>>({});
  const refsBloque = useRef<Partial<Record<CampoRegistro, View | null>>>({});
  const enfoqueAtendido = useRef(0);
  const pasoAnterior = useRef<PasoRegistro>(paso);
  // El botón Atrás de Android lee la versión vigente de atras() sin volver a suscribirse.
  const refAtras = useRef(atras);
  useEffect(() => {
    refAtras.current = atras;
  });

  // Al cambiar de paso, el indicador vuelve a la vista y recibe el foco de TalkBack ("Paso 2 de 2").
  // Si el cambio trae un pedido de foco (errores del paso 1), manda ese pedido.
  useEffect(() => {
    if (pasoAnterior.current === paso) {
      return;
    }
    pasoAnterior.current = paso;
    if (enfoque && enfoque.vez !== enfoqueAtendido.current) {
      return;
    }
    Keyboard.dismiss();
    traerALaVista(refIndicador.current, refScroll.current, !reducido);
    if (refIndicador.current) {
      AccessibilityInfo.sendAccessibilityEvent(refIndicador.current, 'focus');
    }
  }, [paso, enfoque, refScroll, reducido]);

  // Al enviar con errores, el foco va al primer campo con error; los que no son de texto se
  // traen a la vista.
  useEffect(() => {
    // Cada pedido se atiende una sola vez (el efecto también corre si cambia "reducido").
    if (!enfoque || enfoque.vez === enfoqueAtendido.current) {
      return;
    }
    enfoqueAtendido.current = enfoque.vez;
    const entrada = refsTexto.current[enfoque.campo];
    if (entrada) {
      entrada.focus();
      return;
    }
    traerALaVista(refsBloque.current[enfoque.campo], refScroll.current, !reducido);
  }, [enfoque, refScroll, reducido]);

  // En el paso 2, el botón Atrás de Android regresa al paso 1 en vez de salir. Solo con la
  // pantalla enfocada y la pestaña Registro a la vista.
  useFocusEffect(
    useCallback(() => {
      if (!activo || paso !== 2) {
        return undefined;
      }
      // Mientras se envía, atras() no hace nada y la pulsación se consume igual.
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refAtras.current();
        return true;
      });
      return () => suscripcion.remove();
    }, [activo, paso]),
  );

  const texto = (campo: CampoRegistro) => (instancia: TextInput | null) => {
    refsTexto.current[campo] = instancia;
  };
  const bloqueDe = (campo: CampoRegistro) => (instancia: View | null) => {
    refsBloque.current[campo] = instancia;
  };
  const enfocar = (campo: CampoRegistro) => () => refsTexto.current[campo]?.focus();
  // Después del campo siguen controles que el teclado no alcanza: se cierra y se trae el bloque.
  const irABloque = (campo: CampoRegistro) => () => {
    Keyboard.dismiss();
    traerALaVista(refsBloque.current[campo], refScroll.current, !reducido);
  };

  const entrada = reducido
    ? FadeIn.duration(duracion.pestana).reduceMotion(ReduceMotion.Never)
    : new Keyframe({
        // De la derecha al avanzar, de la izquierda al volver.
        0: { opacity: 0, transform: [{ translateX: direccionPaso * espacio.xxl }] },
        100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_SALIDA },
      }).duration(duracion.pestana);

  const ref = { texto, bloqueDe, enfocar, irABloque };

  return (
    <>
      <Encabezado titulo="Crea tu cuenta" texto="Reserva tus citas y compra en la tienda del salón." />
      <IndicadorPasos paso={paso} refIndicador={refIndicador} />
      <Animated.View key={paso} entering={entrada} style={styles.paso}>
        {paso === 1 ? (
          <PasoCuenta registro={registro} google={google} refs={ref} onIrAAcceso={onIrAAcceso} />
        ) : (
          <PasoCabello registro={registro} refs={ref} />
        )}
      </Animated.View>
    </>
  );
}

interface RefsRegistro {
  texto: (campo: CampoRegistro) => (instancia: TextInput | null) => void;
  bloqueDe: (campo: CampoRegistro) => (instancia: View | null) => void;
  enfocar: (campo: CampoRegistro) => () => void;
  irABloque: (campo: CampoRegistro) => () => void;
}

/**
 * Indicador "1 Tu cuenta — 2 Tu cabello", como la web: el paso actual en vino con anillo de oro,
 * el hecho en vino con palomita y el pendiente solo con contorno.
 */
function IndicadorPasos({ paso, refIndicador }: { paso: PasoRegistro; refIndicador: Ref<View> }) {
  const { colores } = useTheme();
  const actual = PASOS[paso - 1];
  return (
    <View
      ref={refIndicador}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Paso ${actual.numero} de ${PASOS.length}: ${actual.etiqueta}`}
      style={styles.pasos}
    >
      {PASOS.map((item, indice) => {
        const hecho = item.numero < paso;
        const esActual = item.numero === paso;
        const marcado = hecho || esActual;
        return (
          <Fragment key={item.numero}>
            {/* Al cambiar de paso, el conector y el círculo toman su color en 140 ms. */}
            {indice > 0 ? (
              <Animated.View
                style={[
                  styles.conectorPaso,
                  transicionSeleccion,
                  { backgroundColor: marcado ? colores.foco : colores.hairline },
                ]}
              />
            ) : null}
            <View style={styles.itemPaso}>
              <Animated.View
                style={[
                  styles.circuloPaso,
                  transicionSeleccion,
                  marcado
                    ? {
                        backgroundColor: colores.accion,
                        borderColor: esActual ? colores.oro : colores.accion,
                        borderWidth: borde.indicador,
                      }
                    : { backgroundColor: colores.transparente, borderColor: colores.textoSuave, borderWidth: borde.campo },
                ]}
              >
                {hecho ? (
                  <Check color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
                ) : (
                  <Text
                    style={[styles.numeroPaso, { color: marcado ? colores.textoSobreAccion : colores.textoSuave }]}
                  >
                    {item.numero}
                  </Text>
                )}
              </Animated.View>
              <Text
                style={[
                  styles.etiquetaPaso,
                  { color: marcado ? colores.texto : colores.textoSuave },
                  esActual ? styles.etiquetaPasoActual : null,
                ]}
              >
                {item.etiqueta}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

/** Paso 1, "Tu cuenta": nombre, correo, teléfono, fecha, pregunta, respuesta y contraseña. */
function PasoCuenta({
  registro,
  google,
  refs,
  onIrAAcceso,
}: {
  registro: RegistroViewModel;
  google: GoogleViewModel;
  refs: RefsRegistro;
  onIrAAcceso: (correo: string) => void;
}) {
  const {
    campos,
    cambiar,
    salir,
    errores,
    errorGeneral,
    estadoCorreo,
    requisitosClave,
    avisoDatosPersonales,
    ayudaTelefono,
    preguntas,
    verificandoCorreo,
    cargando,
    continuar,
  } = registro;
  // Con Google abierto no se continúa (ni con la tecla del teclado); al continuar, el error
  // anterior de Google ya no aplica.
  const continuarConCorreo = () => {
    if (google.abriendo) {
      return;
    }
    google.limpiarError();
    continuar();
  };

  // Si falta un requisito de la lista (son las primeras reglas de problemaDeClave), se marca
  // en la propia lista en lugar de repetirlo en rojo; el texto queda para las demás reglas.
  const faltanRequisitos = requisitosClave.some((requisito) => !requisito.cumplido);
  const marcarFaltantes = Boolean(errores.clave) && faltanRequisitos;
  const errorClave = marcarFaltantes ? null : (errores.clave ?? null);
  const estadoDelCorreo: EstadoCampo | null =
    estadoCorreo === 'registrado'
      ? {
          tipo: 'error',
          texto: 'Este correo ya está registrado',
          accion: { texto: 'Iniciar sesión', onPress: () => onIrAAcceso(campos.correo.trim()) },
        }
      : ESTADO_CORREO[estadoCorreo];

  return (
    <>
      <Input
        ref={refs.texto('nombre')}
        etiqueta="Nombre completo"
        tipo="nombre"
        valor={campos.nombre}
        onCambiar={(t) => cambiar('nombre', t)}
        onSalir={() => salir('nombre')}
        siguiente={refs.enfocar('correo')}
        error={errores.nombre}
      />
      <Input
        ref={refs.texto('correo')}
        etiqueta="Correo electrónico"
        tipo="correo"
        valor={campos.correo}
        onCambiar={(t) => cambiar('correo', t)}
        onSalir={() => salir('correo')}
        siguiente={refs.enfocar('telefono')}
        placeholder="tu@correo.com"
        error={errores.correo ?? null}
        estado={estadoDelCorreo}
        lineasReservadas={LINEAS_ESTADO_CORREO}
      />
      <Input
        ref={refs.texto('telefono')}
        etiqueta="Teléfono"
        tipo="telefono"
        valor={campos.telefono}
        onCambiar={(t) => cambiar('telefono', t)}
        onSalir={() => salir('telefono')}
        siguiente={refs.enfocar('nacimiento')}
        ayuda={ayudaTelefono}
        error={errores.telefono}
      />
      <Input
        ref={refs.texto('nacimiento')}
        etiqueta="Fecha de nacimiento"
        tipo="fecha"
        valor={campos.nacimiento}
        onCambiar={(t) => cambiar('nacimiento', t)}
        onSalir={() => salir('nacimiento')}
        siguiente={refs.irABloque('pregunta')}
        placeholder="DD/MM/AAAA"
        error={errores.nacimiento}
      />
      <Selector
        refContenedor={refs.bloqueDe('pregunta')}
        etiqueta="Pregunta de seguridad"
        placeholder="Elige una pregunta"
        valor={campos.pregunta}
        opciones={preguntas.lista}
        estado={preguntas.estado}
        onCargar={preguntas.cargar}
        onElegir={(p) => cambiar('pregunta', p)}
        error={errores.pregunta ?? null}
      />
      <Input
        ref={refs.texto('respuesta')}
        etiqueta="Respuesta de seguridad"
        valor={campos.respuesta}
        onCambiar={(t) => cambiar('respuesta', t)}
        onSalir={() => salir('respuesta')}
        siguiente={refs.enfocar('clave')}
        error={errores.respuesta}
      />
      <Input
        ref={refs.texto('clave')}
        etiqueta="Contraseña"
        tipo="claveNueva"
        valor={campos.clave}
        onCambiar={(t) => cambiar('clave', t)}
        onSalir={() => salir('clave')}
        siguiente={refs.enfocar('confirmacion')}
        error={errorClave}
        estado={marcarFaltantes ? { tipo: 'error', texto: 'Te faltan requisitos de la contraseña.' } : null}
        debajo={
          <RequisitosClave
            requisitos={requisitosClave}
            aviso={avisoDatosPersonales}
            marcarFaltantes={marcarFaltantes}
          />
        }
      />
      <Input
        ref={refs.texto('confirmacion')}
        etiqueta="Confirmar contraseña"
        tipo="claveNueva"
        valor={campos.confirmacion}
        onCambiar={(t) => cambiar('confirmacion', t)}
        onSalir={() => salir('confirmacion')}
        alEnviar={continuarConCorreo}
        error={errores.confirmacion}
      />
      <Aviso tipo="error" texto={errorGeneral} />
      <Button
        titulo={verificandoCorreo ? 'Verificando correo…' : 'Continuar'}
        onPress={continuarConCorreo}
        cargando={verificandoCorreo}
        deshabilitado={google.abriendo}
      />
      <AccesoGoogle google={google} ocupado={verificandoCorreo || cargando} />
    </>
  );
}

/**
 * Paso 2, "Tu cabello": perfil capilar, alergias (con consentimiento de datos de salud),
 * tratamientos, aviso de privacidad y promociones. Textos de la web.
 */
function PasoCabello({ registro, refs }: { registro: RegistroViewModel; refs: RefsRegistro }) {
  const { colores } = useTheme();
  const {
    campos,
    cambiar,
    salir,
    errores,
    errorGeneral,
    cargando,
    atras,
    abrirAviso,
    abrirTerminos,
    crearCuenta,
  } = registro;
  const enlaceAviso = {
    texto: 'Aviso de Privacidad',
    accion: 'Abrir el Aviso de Privacidad',
    onPress: abrirAviso,
  };

  return (
    <>
      <Text accessibilityRole="header" style={[styles.subtituloPaso, { color: colores.texto }]}>
        Cuéntanos sobre tu cabello
      </Text>
      <Opciones
        refContenedor={refs.bloqueDe('tipoCabello')}
        etiqueta="Tipo de cabello"
        opciones={registro.tiposCabello}
        valor={campos.tipoCabello}
        onElegir={(v) => cambiar('tipoCabello', v)}
        error={errores.tipoCabello ?? null}
      />
      <Input
        ref={refs.texto('colorNatural')}
        etiqueta="Color natural (opcional)"
        valor={campos.colorNatural}
        onCambiar={(t) => cambiar('colorNatural', t)}
        siguiente={refs.enfocar('colorActual')}
        placeholder="Ej. Castaño oscuro"
      />
      <Input
        ref={refs.texto('colorActual')}
        etiqueta="Color actual (opcional)"
        valor={campos.colorActual}
        onCambiar={(t) => cambiar('colorActual', t)}
        siguiente={refs.enfocar('productosUsados')}
        placeholder="Ej. Rubio cenizo"
      />
      <Input
        ref={refs.texto('productosUsados')}
        etiqueta="Productos usados (opcional)"
        valor={campos.productosUsados}
        onCambiar={(t) => cambiar('productosUsados', t)}
        siguiente={refs.irABloque('tieneAlergias')}
        placeholder="Ej. Shampoo sin sulfatos"
      />
      <Opciones
        refContenedor={refs.bloqueDe('tieneAlergias')}
        etiqueta="¿Tienes alergias a productos?"
        opciones={OPCIONES_SI_NO}
        valor={aSiNo(campos.tieneAlergias)}
        onElegir={(v) => cambiar('tieneAlergias', v === 'si')}
        error={errores.tieneAlergias ?? null}
      />
      {campos.tieneAlergias ? (
        <>
          <Input
            ref={refs.texto('alergias')}
            etiqueta="Especifica tus alergias"
            tipo="sensible"
            valor={campos.alergias}
            onCambiar={(t) => cambiar('alergias', t)}
            onSalir={() => salir('alergias')}
            siguiente={refs.irABloque('consienteDatosSensibles')}
            error={errores.alergias}
          />
          <View ref={refs.bloqueDe('consienteDatosSensibles')}>
            <Casilla
              marcada={campos.consienteDatosSensibles}
              onCambiar={(v) => cambiar('consienteDatosSensibles', v)}
              texto={TEXTO_CONSENTIMIENTO_SALUD}
              enlace={enlaceAviso}
              error={errores.consienteDatosSensibles ?? null}
            />
          </View>
        </>
      ) : null}
      <Opciones
        refContenedor={refs.bloqueDe('tratamientosQuimicos')}
        etiqueta="¿Tratamientos químicos previos?"
        opciones={OPCIONES_SI_NO}
        valor={aSiNo(campos.tratamientosQuimicos)}
        onElegir={(v) => cambiar('tratamientosQuimicos', v === 'si')}
        error={errores.tratamientosQuimicos ?? null}
      />
      {campos.tratamientosQuimicos ? (
        <Input
          ref={refs.texto('tratamientos')}
          etiqueta="Especifica los tratamientos"
          valor={campos.tratamientos}
          onCambiar={(t) => cambiar('tratamientos', t)}
          onSalir={() => salir('tratamientos')}
          siguiente={refs.irABloque('aceptaAviso')}
          error={errores.tratamientos}
        />
      ) : null}
      <View ref={refs.bloqueDe('aceptaAviso')}>
        <Casilla
          marcada={campos.aceptaAviso}
          onCambiar={(v) => cambiar('aceptaAviso', v)}
          texto="Acepto el"
          enlace={enlaceAviso}
          error={errores.aceptaAviso ?? null}
        />
        <Casilla
          marcada={campos.recibePromociones}
          onCambiar={(v) => cambiar('recibePromociones', v)}
          texto="Deseo recibir promociones"
          error={null}
        />
      </View>
      <Aviso tipo="error" texto={errorGeneral} />
      <View style={styles.botonesPaso}>
        <Button
          titulo={cargando ? 'Registrando…' : 'Finalizar registro'}
          onPress={crearCuenta}
          cargando={cargando}
        />
        <Button titulo="Atrás" variante="secundario" onPress={atras} deshabilitado={cargando} />
      </View>
      <LeyendaTerminos onPress={abrirTerminos} />
    </>
  );
}

/** Desplaza el formulario hasta un bloque que no es de texto (cabello, pregunta, aviso). */
export function traerALaVista(
  contenedor: View | null | undefined,
  scroll: ScrollView | null,
  animado: boolean,
) {
  const nativo = scroll?.getNativeScrollRef();
  if (!contenedor || !scroll || !nativo) {
    return;
  }
  contenedor.measureLayout(
    nativo,
    (_x, y) => scroll.scrollTo({ y: Math.max(0, y - espacio.x3), animated: animado }),
    () => {
      // Sin medida no se desplaza; el error sigue visible en el campo.
    },
  );
}

/** Requisitos de la contraseña: se marcan conforme se cumplen. */
export function RequisitosClave({
  requisitos,
  aviso,
  marcarFaltantes,
}: {
  requisitos: RequisitoClave[];
  aviso: string;
  marcarFaltantes: boolean;
}) {
  const { colores } = useTheme();
  return (
    <View style={styles.requisitos}>
      {requisitos.map((requisito) => (
        <Requisito
          key={requisito.id}
          etiqueta={requisito.etiqueta}
          cumplido={requisito.cumplido}
          resaltar={marcarFaltantes && !requisito.cumplido}
        />
      ))}
      <Text style={[styles.nota, { color: colores.textoSuave }]}>{aviso}</Text>
    </View>
  );
}

/**
 * Un requisito: la marca aparece en 140 ms con la curva de salida. Con movimiento reducido solo
 * cambia la opacidad (sin escala).
 */
function Requisito({
  etiqueta,
  cumplido,
  resaltar,
}: {
  etiqueta: string;
  cumplido: boolean;
  /** Pendiente después de salir del campo o de enviar: en color de peligro. */
  resaltar: boolean;
}) {
  const { colores } = useTheme();
  const reducido = useMovimientoReducido();
  const progreso = useSharedValue(cumplido ? 1 : 0);

  useEffect(() => {
    progreso.set(
      withTiming(cumplido ? 1 : 0, { duration: duracion.estadoCampo, easing: EASE_SALIDA }),
    );
  }, [cumplido, progreso]);

  const estiloMarca = useAnimatedStyle(() => {
    const p = progreso.get();
    return {
      opacity: p,
      transform: [{ scale: reducido ? 1 : escalaEntrada + (1 - escalaEntrada) * p }],
    };
  });

  let colorPendiente = colores.textoSuave;
  if (resaltar) {
    colorPendiente = colores.peligro;
  }

  return (
    <View
      accessible
      accessibilityLabel={`${etiqueta}: ${cumplido ? 'cumplido' : 'pendiente'}`}
      style={styles.requisito}
    >
      <View style={styles.marcaRequisito}>
        <Circle color={colorPendiente} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.centrado, estiloMarca]}>
          <CircleCheck color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </Animated.View>
      </View>
      <Text style={[styles.nota, { color: cumplido ? colores.texto : colorPendiente }]}>
        {etiqueta}
      </Text>
    </View>
  );
}

/**
 * "Al crear tu cuenta aceptas los Términos y Condiciones", como la web. Toda la línea es el enlace:
 * así el área táctil llega a 48dp aunque el texto ocupe dos renglones.
 */
function LeyendaTerminos({ onPress }: { onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Al crear tu cuenta aceptas los Términos y Condiciones"
      accessibilityHint="Se abre en el navegador"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View style={[styles.leyenda, estiloPresion]}>
        <Text style={[styles.textoLeyenda, { color: colores.textoSuave }]}>
          Al crear tu cuenta aceptas los{' '}
          <Text style={[styles.enlaceEnTexto, { color: colores.enlace }]}>Términos y Condiciones</Text>
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** Opciones excluyentes en pastillas (tipo de cabello, Sí/No). */
export function Opciones<T extends string>({
  refContenedor,
  etiqueta,
  opciones,
  valor,
  onElegir,
  error,
}: {
  refContenedor?: Ref<View>;
  etiqueta: string;
  opciones: readonly { valor: T; etiqueta: string }[];
  valor: T | null;
  onElegir: (valor: T) => void;
  error: string | null;
}) {
  const { colores } = useTheme();
  const id = useId();
  return (
    <View ref={refContenedor} style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.contorno }]}>
        {etiqueta}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabelledBy={`${id}-etiqueta`} style={styles.opcionesCabello}>
        {opciones.map((opcion) => {
          const elegida = opcion.valor === valor;
          let colorBorde = colores.campoBorde;
          if (elegida) {
            colorBorde = colores.foco;
          } else if (error) {
            colorBorde = colores.peligro;
          }
          return (
            <Pastilla
              key={opcion.valor}
              etiqueta={opcion.etiqueta}
              accessibilityLabel={`${etiqueta}: ${opcion.etiqueta}`}
              elegida={elegida}
              colorBorde={colorBorde}
              onPress={() => onElegir(opcion.valor)}
            />
          );
        })}
      </View>
      <MensajeCampo error={error} />
    </View>
  );
}

/** Una pastilla de Opciones: se hunde al tocarla y su borde cambia de color en 140 ms. */
function Pastilla({
  etiqueta,
  accessibilityLabel,
  elegida,
  colorBorde,
  onPress,
}: {
  etiqueta: string;
  accessibilityLabel: string;
  elegida: boolean;
  colorBorde: string;
  onPress: () => void;
}) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: elegida }}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
      style={styles.pulsablePastilla}
    >
      <Animated.View
        style={[
          styles.opcionCabello,
          transicionBorde,
          { backgroundColor: colores.campoFondo, borderColor: colorBorde },
          estiloPresion,
        ]}
      >
        {elegida ? (
          <Check color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        ) : null}
        <Text style={[styles.textoOpcionCabello, { color: colores.campoTexto }]}>{etiqueta}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Error de un control que no es Input (cabello, pregunta, casilla): región en vivo siempre montada
 * para que TalkBack lo anuncie una vez. Vacía, queda fuera del flujo y no suma espacio.
 */
function MensajeCampo({ error }: { error: string | null }) {
  const { colores } = useTheme();
  return (
    <View
      collapsable={false}
      accessibilityLiveRegion="polite"
      style={error ? null : styles.fueraDeFlujo}
    >
      {error ? <Text style={[styles.nota, { color: colores.peligro }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * Mensaje de error o de éxito de un formulario. La región en vivo queda siempre montada para que
 * TalkBack anuncie el texto cuando aparece; vacía, queda fuera del flujo y no suma espacio.
 */
export function Aviso({
  tipo: tipoAviso,
  texto,
  estilo,
}: {
  tipo: 'error' | 'exito';
  texto: string | null;
  /** Estilo del contenedor cuando hay mensaje (por ejemplo, márgenes). */
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();
  const esError = tipoAviso === 'error';
  const Icono = esError ? CircleAlert : CircleCheck;
  const color = esError ? colores.peligro : colores.texto;
  return (
    <View
      collapsable={false}
      accessibilityLiveRegion={esError ? 'assertive' : 'polite'}
      style={texto ? estilo : styles.fueraDeFlujo}
    >
      {/* El mensaje aparece en 220 ms (reducido: solo se funde) en lugar de saltar a la vista. */}
      {texto ? (
        <Animated.View
          accessible
          entering={entrada}
          style={[styles.aviso, { borderColor: esError ? colores.peligro : colores.hairline }]}
        >
          <Icono color={esError ? colores.peligro : colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.parrafo, styles.textoAviso, { color }]}>{texto}</Text>
        </Animated.View>
      ) : null}
    </View>
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

/** Selector con hoja inferior: la lista se carga del API al abrirlo. */
function Selector({
  refContenedor,
  etiqueta,
  placeholder,
  valor,
  opciones,
  estado,
  onCargar,
  onElegir,
  error,
}: {
  refContenedor?: Ref<View>;
  etiqueta: string;
  placeholder: string;
  valor: PreguntaSeguridad | null;
  opciones: PreguntaSeguridad[];
  estado: EstadoPreguntas;
  onCargar: () => void;
  onElegir: (opcion: PreguntaSeguridad) => void;
  error: string | null;
}) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  const abrir = () => {
    setAbierto(true);
    onCargar();
  };

  let colorBorde = colores.campoBorde;
  if (error) {
    colorBorde = colores.peligro;
  }

  return (
    <View ref={refContenedor} style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.contorno }]}>
        {etiqueta}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabelledBy={`${id}-etiqueta`}
        accessibilityHint="Abre la lista de preguntas"
        onPress={abrir}
        onPressIn={hundir}
        onPressOut={soltar}
      >
        {/* Como la barra de búsqueda: se hunde y el borde toma el color de foco en 140 ms. */}
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.selector,
              transicionBorde,
              {
                backgroundColor: colores.campoFondo,
                borderColor: pressed ? colores.foco : colorBorde,
              },
              estiloPresion,
            ]}
          >
            <Text
              numberOfLines={2}
              style={[
                styles.textoSelector,
                { color: valor ? colores.campoTexto : colores.campoPlaceholder },
              ]}
            >
              {valor ? valor.pregunta : placeholder}
            </Text>
            <ChevronDown color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </Animated.View>
        )}
      </Pressable>
      <MensajeCampo error={error} />

      {/* La misma hoja de toda la app: sube en 240 ms y baja en 200 ms (reducido: solo se funde). */}
      <Hoja visible={abierto} onCerrar={cerrar} titulo={etiqueta}>
        <ContenidoSelector
          estado={estado}
          opciones={opciones}
          valor={valor}
          onReintentar={onCargar}
          onElegir={(opcion) => {
            onElegir(opcion);
            cerrar();
          }}
        />
        <Button titulo="Cerrar" variante="secundario" onPress={cerrar} />
      </Hoja>
    </View>
  );
}

function ContenidoSelector({
  estado,
  opciones,
  valor,
  onReintentar,
  onElegir,
}: {
  estado: EstadoPreguntas;
  opciones: PreguntaSeguridad[];
  valor: PreguntaSeguridad | null;
  onReintentar: () => void;
  onElegir: (opcion: PreguntaSeguridad) => void;
}) {
  const { colores } = useTheme();
  if (estado === 'cargando' || estado === 'inactivo') {
    return (
      <View accessible accessibilityLabel="Cargando preguntas de seguridad" style={styles.cargandoHoja}>
        <Skeleton estilo={styles.lineaHoja} />
        <Skeleton estilo={styles.lineaHoja} />
        <Skeleton estilo={styles.lineaHojaCorta} />
      </View>
    );
  }
  if (estado === 'error') {
    return (
      <>
        <Aviso tipo="error" texto="No pudimos cargar las preguntas. Revisa tu conexión." />
        <Button titulo="Reintentar" variante="secundario" onPress={onReintentar} />
      </>
    );
  }
  if (opciones.length === 0) {
    return (
      <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>
        Todavía no hay preguntas de seguridad disponibles.
      </Text>
    );
  }
  return (
    <ScrollView style={styles.listaHoja}>
      {opciones.map((opcion) => {
        const elegida = opcion.id === valor?.id;
        return (
          <Pressable
            key={opcion.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: elegida }}
            onPress={() => onElegir(opcion)}
            style={({ pressed }) => [
              styles.opcion,
              { backgroundColor: pressed ? colores.presionado : colores.transparente },
            ]}
          >
            <Text style={[styles.texto, styles.textoOpcion, { color: colores.texto }]}>{opcion.pregunta}</Text>
            {elegida ? (
              <Check color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Casilla de verificación hecha con Pressable. Con enlace, el texto termina en un enlace (como en
 * la web); tocarlo abre el enlace sin marcar la casilla, y TalkBack lo ofrece como acción.
 */
export function Casilla({
  marcada,
  onCambiar,
  texto,
  enlace,
  error,
}: {
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
  texto: string;
  enlace?: { texto: string; accion: string; onPress: () => void };
  error: string | null;
}) {
  const { colores } = useTheme();
  let colorBorde = colores.campoBorde;
  if (marcada) {
    colorBorde = colores.foco;
  } else if (error) {
    colorBorde = colores.peligro;
  }
  return (
    <View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcada }}
        accessibilityActions={enlace ? [{ name: 'abrirEnlace', label: enlace.accion }] : undefined}
        onAccessibilityAction={(evento) => {
          if (evento.nativeEvent.actionName === 'abrirEnlace') {
            enlace?.onPress();
          }
        }}
        onPress={() => onCambiar(!marcada)}
        style={styles.filaCasilla}
      >
        {/* Al marcarla, el relleno y el borde cambian en 140 ms. */}
        <Animated.View
          style={[
            styles.casilla,
            transicionSeleccion,
            {
              borderColor: colorBorde,
              backgroundColor: marcada ? colores.accion : colores.campoFondo,
            },
          ]}
        >
          {marcada ? (
            <Check color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazoMarca} />
          ) : null}
        </Animated.View>
        <Text style={[styles.parrafo, styles.textoCasilla, { color: colores.texto }]}>
          {texto}
          {enlace ? (
            <>
              {' '}
              <Text onPress={enlace.onPress} style={[styles.enlaceEnTexto, { color: colores.enlace }]}>
                {enlace.texto}
              </Text>
            </>
          ) : null}
        </Text>
      </Pressable>
      <MensajeCampo error={error} />
    </View>
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
    letterSpacing: tracking.tituloPagina,
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
    letterSpacing: tracking.tituloPagina,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  // Párrafos de varias líneas (apoyo del encabezado, avisos, consentimiento): interlineado 1.625.
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
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
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  textoAviso: {
    flex: 1,
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
  // .mf-etiqueta: 15px, peso 500, en --menu-texto-principal (igual que la etiqueta de Input).
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiquetaCampo.tamano,
    lineHeight: tipo.etiquetaCampo.linea,
  },
  // El selector se lee como un campo (.mf-campo): borde de 1px, como Input.
  selector: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.s,
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  textoSelector: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
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
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  opcionesCabello: {
    flexDirection: 'row',
    gap: espacio.s,
  },
  pulsablePastilla: {
    flex: 1,
  },
  opcionCabello: {
    // Llena el Pressable: las pastillas quedan del mismo alto aunque una etiqueta use dos líneas.
    flexGrow: 1,
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    paddingHorizontal: espacio.s,
    borderRadius: radio.pastilla,
    borderWidth: borde.campo,
  },
  textoOpcionCabello: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cargandoHoja: {
    gap: espacio.m,
  },
  lineaHoja: {
    height: toqueMinimo,
  },
  lineaHojaCorta: {
    width: esqueleto.anchoMedio,
    height: toqueMinimo,
  },
  listaHoja: {
    maxHeight: hoja.altoLista,
  },
  textoOpcion: {
    flex: 1,
  },
  requisitos: {
    gap: espacio.xs,
  },
  fueraDeFlujo: {
    position: 'absolute',
  },
  // Sobre el panel carbón, arriba a la derecha, por encima del contenido que se desplaza.
  cerrar: {
    position: 'absolute',
    zIndex: 1,
    right: espacio.s,
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  paso: {
    gap: espacio.xl,
  },
  pasos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  itemPaso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  conectorPaso: {
    flex: 1,
    height: borde.hairline,
  },
  circuloPaso: {
    width: pasoFlujo.circulo,
    height: pasoFlujo.circulo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  numeroPaso: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  etiquetaPaso: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  etiquetaPasoActual: {
    fontFamily: fuente.textoMedio,
  },
  subtituloPaso: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.subtitulo,
  },
  enlaceEnTexto: {
    fontFamily: fuente.textoMedio,
    textDecorationLine: 'underline',
  },
  botonesPaso: {
    gap: espacio.m,
  },
  leyenda: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingHorizontal: espacio.xs,
    borderRadius: radio.campo,
  },
  textoLeyenda: {
    textAlign: 'center',
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  requisito: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  marcaRequisito: {
    width: icono.tamanoPequeno,
    height: icono.tamanoPequeno,
  },
  centrado: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
