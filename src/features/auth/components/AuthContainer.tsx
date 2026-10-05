import { StatusBar } from 'expo-status-bar';
import { Circle, CircleAlert, CircleCheck, Check, ChevronDown } from 'lucide-react-native';
import { useEffect, useId, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { Input, type EstadoCampo } from '@/shared/ui/Input';
import { Monograma } from '@/shared/ui/Monograma';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  acceso,
  borde,
  casilla,
  curva,
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
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import {
  TIPOS_CABELLO,
  type PreguntaSeguridad,
  type RequisitoClave,
  type TipoCabello,
} from '../models/AuthModel';
import type { LoginViewModel } from '../viewmodels/useLoginViewModel';
import type {
  CampoRegistro,
  EstadoCorreo,
  EstadoPreguntas,
  RegistroViewModel,
} from '../viewmodels/useRegistroViewModel';

export type VistaAcceso = 'acceso' | 'registro';

interface AuthContainerProps {
  vistaInicial: VistaAcceso;
  login: LoginViewModel;
  registro: RegistroViewModel;
  onRecuperar: () => void;
  /** Aviso de éxito sobre el formulario de acceso (por ejemplo, cuenta activada). */
  aviso?: string | null;
}

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);
const EASE_SALIDA = Easing.bezier(...curva.salida);

/** Lo que muestra el campo de correo según la verificación (solo lo que dice el endpoint). */
const ESTADO_CORREO: Record<EstadoCorreo, EstadoCampo | null> = {
  inactivo: null,
  verificando: { tipo: 'verificando', texto: 'Verificando correo…' },
  disponible: { tipo: 'exito', texto: 'Correo disponible' },
  registrado: { tipo: 'error', texto: 'Este correo ya está registrado' },
  sinVerificar: { tipo: 'aviso', texto: 'Se verificará al crear la cuenta.' },
};
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
  onRecuperar,
  aviso,
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

  // "Iniciar sesión" desde un correo ya registrado: pasa a Acceso con el correo escrito.
  const irAAcceso = (correo: string) => {
    login.setCorreo(correo);
    cambiarA('acceso');
  };

  const altoMayor = Math.max(alturas.acceso, alturas.registro);
  const altoVentana = ajustada ? alturas[ajustada] : altoMayor;

  return (
    <PantallaAuth refScroll={refScroll}>
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
              <FormularioAcceso login={login} onRecuperar={onRecuperar} aviso={aviso ?? null} />
            </Panel>
            <Panel ancho={ancho} activo={vista === 'registro'} onLayout={medirVista('registro')}>
              <FormularioRegistro registro={registro} refScroll={refScroll} onIrAAcceso={irAAcceso} />
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
}: {
  children: ReactNode;
  refScroll?: RefObject<ScrollView | null>;
}) {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <StatusBar style="light" />
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
      <Text style={[styles.textoEnlace, { color: colores.enlace }]}>{texto}</Text>
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
  onRecuperar,
  aviso,
}: {
  login: LoginViewModel;
  onRecuperar: () => void;
  aviso: string | null;
}) {
  const { correo, setCorreo, salirCorreo, clave, setClave, errores, errorGeneral, cargando, entrar } =
    login;
  const refClaveAcceso = useRef<TextInput>(null);
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
          alEnviar={entrar}
          error={errores.clave}
        />
        <Enlace texto="¿Olvidaste tu contraseña?" onPress={onRecuperar} alinear="fin" />
      </View>
      <Aviso tipo="error" texto={errorGeneral} />
      <Button titulo={cargando ? 'Entrando…' : 'Entrar'} onPress={entrar} cargando={cargando} />
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

function FormularioRegistro({
  registro,
  refScroll,
  onIrAAcceso,
}: {
  registro: RegistroViewModel;
  refScroll: RefObject<ScrollView | null>;
  onIrAAcceso: (correo: string) => void;
}) {
  const {
    campos,
    cambiar,
    salir,
    errores,
    errorGeneral,
    cargando,
    estadoCorreo,
    requisitosClave,
    avisoDatosPersonales,
    enfoque,
    ayudaTelefono,
    preguntas,
  } = registro;
  const reducido = useMovimientoReducido();
  const refNombre = useRef<TextInput>(null);
  const refCorreo = useRef<TextInput>(null);
  const refTelefono = useRef<TextInput>(null);
  const refClave = useRef<TextInput>(null);
  const refConfirmacion = useRef<TextInput>(null);
  const refNacimiento = useRef<TextInput>(null);
  const refRespuesta = useRef<TextInput>(null);
  const refCabello = useRef<View>(null);
  const refPregunta = useRef<View>(null);
  const refAviso = useRef<View>(null);
  const enfoqueAtendido = useRef(0);

  // Al enviar con errores, el foco va al primer campo con error; los que no son de texto se
  // traen a la vista.
  useEffect(() => {
    // Cada pedido se atiende una sola vez (el efecto también corre si cambia "reducido").
    if (!enfoque || enfoque.vez === enfoqueAtendido.current) {
      return;
    }
    enfoqueAtendido.current = enfoque.vez;
    const textos: Partial<Record<CampoRegistro, RefObject<TextInput | null>>> = {
      nombre: refNombre,
      correo: refCorreo,
      telefono: refTelefono,
      clave: refClave,
      confirmacion: refConfirmacion,
      nacimiento: refNacimiento,
      respuesta: refRespuesta,
    };
    const bloques: Partial<Record<CampoRegistro, RefObject<View | null>>> = {
      tipoCabello: refCabello,
      pregunta: refPregunta,
      aceptaAviso: refAviso,
    };
    const entrada = textos[enfoque.campo]?.current;
    if (entrada) {
      entrada.focus();
      return;
    }
    traerALaVista(bloques[enfoque.campo]?.current, refScroll.current, !reducido);
  }, [enfoque, refScroll, reducido]);

  // Después de la fecha siguen controles que el teclado no alcanza: se cierra y se trae a la vista
  // el tipo de cabello.
  const irACabello = () => {
    Keyboard.dismiss();
    traerALaVista(refCabello.current, refScroll.current, !reducido);
  };

  const errorCorreo = errores.correo ?? null;
  // Si falta un requisito de la lista (son las primeras reglas de problemaDeClave), se marca
  // en la propia lista en lugar de repetirlo en rojo; el texto queda para las demás reglas.
  const faltanRequisitos = requisitosClave.some((requisito) => !requisito.cumplido);
  const marcarFaltantes = Boolean(errores.clave) && faltanRequisitos;
  const errorClave = marcarFaltantes ? null : (errores.clave ?? null);
  const correoRegistrado = !errorCorreo && estadoCorreo === 'registrado';

  return (
    <>
      <Encabezado titulo="Crea tu cuenta" texto="Reserva tus citas y compra en la tienda del salón." />
      <Input
        ref={refNombre}
        etiqueta="Nombre completo"
        tipo="nombre"
        valor={campos.nombre}
        onCambiar={(t) => cambiar('nombre', t)}
        onSalir={() => salir('nombre')}
        siguiente={() => refCorreo.current?.focus()}
        error={errores.nombre}
      />
      <Input
        ref={refCorreo}
        etiqueta="Correo electrónico"
        tipo="correo"
        valor={campos.correo}
        onCambiar={(t) => cambiar('correo', t)}
        onSalir={() => salir('correo')}
        siguiente={() => refTelefono.current?.focus()}
        placeholder="tu@correo.com"
        error={errorCorreo}
        estado={ESTADO_CORREO[estadoCorreo]}
        reservarMensaje
        debajo={
          correoRegistrado ? (
            <Enlace texto="Iniciar sesión" onPress={() => onIrAAcceso(campos.correo.trim())} />
          ) : null
        }
      />
      <Input
        ref={refTelefono}
        etiqueta="Teléfono"
        tipo="telefono"
        valor={campos.telefono}
        onCambiar={(t) => cambiar('telefono', t)}
        onSalir={() => salir('telefono')}
        siguiente={() => refNacimiento.current?.focus()}
        ayuda={ayudaTelefono}
        error={errores.telefono}
      />
      <Input
        ref={refNacimiento}
        etiqueta="Fecha de nacimiento"
        tipo="fecha"
        valor={campos.nacimiento}
        onCambiar={(t) => cambiar('nacimiento', t)}
        onSalir={() => salir('nacimiento')}
        siguiente={irACabello}
        placeholder="DD/MM/AAAA"
        error={errores.nacimiento}
      />
      <OpcionesCabello
        refContenedor={refCabello}
        valor={campos.tipoCabello}
        onElegir={(v) => cambiar('tipoCabello', v)}
        error={errores.tipoCabello ?? null}
      />
      <Selector
        refContenedor={refPregunta}
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
        ref={refRespuesta}
        etiqueta="Respuesta de seguridad"
        valor={campos.respuesta}
        onCambiar={(t) => cambiar('respuesta', t)}
        onSalir={() => salir('respuesta')}
        siguiente={() => refClave.current?.focus()}
        error={errores.respuesta}
      />
      <Input
        ref={refClave}
        etiqueta="Contraseña"
        tipo="claveNueva"
        valor={campos.clave}
        onCambiar={(t) => cambiar('clave', t)}
        onSalir={() => salir('clave')}
        siguiente={() => refConfirmacion.current?.focus()}
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
        ref={refConfirmacion}
        etiqueta="Confirmar contraseña"
        tipo="claveNueva"
        valor={campos.confirmacion}
        onCambiar={(t) => cambiar('confirmacion', t)}
        onSalir={() => salir('confirmacion')}
        alEnviar={registro.crearCuenta}
        error={errores.confirmacion}
      />
      <View ref={refAviso}>
        <Casilla
          marcada={campos.aceptaAviso}
          onCambiar={(v) => cambiar('aceptaAviso', v)}
          texto="Acepto el aviso de privacidad"
          error={errores.aceptaAviso ?? null}
        />
        <Enlace texto="Leer el aviso de privacidad" onPress={registro.abrirAviso} />
      </View>
      <Aviso tipo="error" texto={errorGeneral} />
      <Button
        titulo={cargando ? 'Creando cuenta…' : 'Crear cuenta'}
        onPress={registro.crearCuenta}
        cargando={cargando}
      />
    </>
  );
}

/** Desplaza el formulario hasta un bloque que no es de texto (cabello, pregunta, aviso). */
function traerALaVista(contenedor: View | null | undefined, scroll: ScrollView | null, animado: boolean) {
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
function RequisitosClave({
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

/** Tipo de cabello obligatorio: tres opciones excluyentes. */
function OpcionesCabello({
  refContenedor,
  valor,
  onElegir,
  error,
}: {
  refContenedor?: Ref<View>;
  valor: TipoCabello | null;
  onElegir: (valor: TipoCabello) => void;
  error: string | null;
}) {
  const { colores } = useTheme();
  const id = useId();
  return (
    <View ref={refContenedor} style={styles.campo}>
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.texto }]}>
        Tipo de cabello
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabelledBy={`${id}-etiqueta`} style={styles.opcionesCabello}>
        {TIPOS_CABELLO.map((opcion) => {
          const elegida = opcion.valor === valor;
          let colorBorde = colores.campoBorde;
          if (elegida) {
            colorBorde = colores.foco;
          } else if (error) {
            colorBorde = colores.peligro;
          }
          return (
            <Pressable
              key={opcion.valor}
              accessibilityRole="radio"
              accessibilityState={{ checked: elegida }}
              onPress={() => onElegir(opcion.valor)}
              style={[
                styles.opcionCabello,
                {
                  backgroundColor: colores.campoFondo,
                  borderColor: colorBorde,
                },
              ]}
            >
              {elegida ? (
                <Check color={colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
              ) : null}
              <Text style={[styles.textoOpcionCabello, { color: colores.campoTexto }]}>
                {opcion.etiqueta}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <MensajeCampo error={error} />
    </View>
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
  const esError = tipoAviso === 'error';
  const Icono = esError ? CircleAlert : CircleCheck;
  const color = esError ? colores.peligro : colores.texto;
  return (
    <View
      collapsable={false}
      accessibilityLiveRegion={esError ? 'assertive' : 'polite'}
      style={texto ? estilo : styles.fueraDeFlujo}
    >
      {texto ? (
        <View
          accessible
          style={[styles.aviso, { borderColor: esError ? colores.peligro : colores.hairline }]}
        >
          <Icono color={esError ? colores.peligro : colores.foco} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          <Text style={[styles.texto, styles.textoAviso, { color }]}>{texto}</Text>
        </View>
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

/** Selector con hoja modal propia: la lista se carga del API al abrirlo. */
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
  const { bottom } = useSafeAreaInsets();
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
      <Text nativeID={`${id}-etiqueta`} style={[styles.etiqueta, { color: colores.texto }]}>
        {etiqueta}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabelledBy={`${id}-etiqueta`}
        accessibilityHint="Abre la lista de preguntas"
        onPress={abrir}
        style={({ pressed }) => [
          styles.selector,
          {
            backgroundColor: colores.campoFondo,
            borderColor: pressed ? colores.foco : colorBorde,
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
          {valor ? valor.pregunta : placeholder}
        </Text>
        <ChevronDown color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Pressable>
      <MensajeCampo error={error} />

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
          </View>
        </View>
      </Modal>
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
      <Text style={[styles.texto, { color: colores.textoSuave }]}>
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
              { backgroundColor: pressed ? colores.presionado : 'transparent' },
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

/** Casilla de verificación hecha con Pressable. */
function Casilla({
  marcada,
  onCambiar,
  texto,
  error,
}: {
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
  texto: string;
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
        onPress={() => onCambiar(!marcada)}
        style={styles.filaCasilla}
      >
        <View
          style={[
            styles.casilla,
            {
              borderColor: colorBorde,
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
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  opcionesCabello: {
    flexDirection: 'row',
    gap: espacio.s,
  },
  opcionCabello: {
    flex: 1,
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
